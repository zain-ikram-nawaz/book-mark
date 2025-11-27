// import { NextResponse } from "next/server";

// // -----------------------------
// // Detect Fake/Real Based on Source
// // -----------------------------
// function detectFakeTime(entry) {
//   const src = (entry.source || "").toLowerCase();

//   return {
//     isFake: src === "clickup",     // Only "clickup" = fake
//     isReal: src !== "clickup",     // Everything else = real
//     source: entry.source || "unknown",
//   };
// }

// // -----------------------------
// // Merge Timers
// // -----------------------------
// function mergeTimers(timers) {
//   const map = new Map();

//   timers.forEach(t => {
//     const timeType = t.isFake ? "fake" : "real";
//     const key = `${t.taskId}_${t.userId}_${timeType}`;

//     if (!t.taskId) return;

//     if (map.has(key)) {
//       const old = map.get(key);
//       map.set(key, {
//         ...old,
//         duration: old.duration + t.duration,
//         startTime: Math.min(old.startTime, t.startTime),
//         endTime: Math.max(old.endTime, t.endTime),
//       });
//     } else {
//       map.set(key, { ...t });
//     }
//   });

//   return [...map.values()];
// }

// // -----------------------------
// // Fetch Task Details (Batching)
// // -----------------------------
// async function fetchTaskDetails(taskIds, token) {
//   if (taskIds.length === 0) return new Map();

//   const uniqueIds = [...new Set(taskIds)];
//   const taskDetails = new Map();
//   const batchSize = 100;

//   for (let i = 0; i < uniqueIds.length; i += batchSize) {
//     const batch = uniqueIds.slice(i, i + batchSize);

//     const req = batch.map(async (taskId) => {
//       try {
//         const res = await fetch(
//           `https://api.clickup.com/api/v2/task/${taskId}?include_children=true`,
//           {
//             headers: { Authorization: `Bearer ${token}` },
//             next: { revalidate: 3600 }
//           }
//         );

//         if (res.ok) {
//           const task = await res.json();
//           taskDetails.set(taskId, {
//             listId: task.list?.id,
//             taskName: task.name,
//             taskUrl: task.url
//           });
//         }
//       } catch (e) {
//         console.error(`❌ Error fetching task ${taskId}:`, e.message);
//       }
//     });

//     await Promise.all(req);
//     await new Promise(r => setTimeout(r, 50));
//   }

//   return taskDetails;
// }

// // -----------------------------
// // Calculate Online/Offline Status
// // -----------------------------
// function calculateUserOnlineStatus(timers) {
//   const userDailySessions = new Map();

//   timers.forEach(timer => {
//     if (!timer.isReal) return;

//     const date = new Date(timer.startTime).toISOString().split('T')[0];
//     const key = `${timer.userId}_${date}`;

//     const sessionStart = timer.startTime;
//     const sessionEnd = timer.endTime;

//     if (!userDailySessions.has(key)) {
//       userDailySessions.set(key, {
//         user: timer.user,
//         userId: timer.userId,
//         date,
//         sessions: []
//       });
//     }

//     userDailySessions.get(key).sessions.push({
//       start: sessionStart,
//       end: sessionEnd,
//       taskName: timer.taskName,
//       duration: timer.duration
//     });
//   });

//   const onlineStatus = [];
//   const GAP_THRESHOLD = 5 * 60 * 1000; // 5 minutes

//   userDailySessions.forEach(data => {
//     data.sessions.sort((a, b) => a.start - b.start);

//     const merged = [];

//     data.sessions.forEach(sess => {
//       if (merged.length === 0) {
//         merged.push({ ...sess });
//       } else {
//         const last = merged[merged.length - 1];
//         if (sess.start - last.end <= GAP_THRESHOLD) {
//           last.end = Math.max(last.end, sess.end);
//         } else {
//           merged.push({ ...sess });
//         }
//       }
//     });

//     const firstOnline = merged[0].start;
//     const lastOffline = merged[merged.length - 1].end;
//     const totalOnlineTime = merged.reduce((sum, s) => sum + (s.end - s.start), 0);

//     const breaks = [];
//     for (let i = 1; i < merged.length; i++) {
//       const start = merged[i - 1].end;
//       const end = merged[i].start;
//       breaks.push({ start, end, duration: end - start, durationMinutes: Math.floor((end - start) / 60000) });
//     }

//     onlineStatus.push({
//       user: data.user,
//       userId: data.userId,
//       date: data.date,
//       firstOnline,
//       lastOffline,
//       firstOnlineFormatted: new Date(firstOnline).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }),
//       lastOfflineFormatted: new Date(lastOffline).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }),
//       totalOnlineHours: (totalOnlineTime / 3600000).toFixed(2),
//       totalSpanHours: ((lastOffline - firstOnline) / 3600000).toFixed(2),
//       sessionCount: merged.length,
//       breakCount: breaks.length,
//       breaks,
//       sessions: merged.map(s => ({
//         start: new Date(s.start).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }),
//         end: new Date(s.end).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }),
//         duration: Math.floor((s.end - s.start)/60000) + ' min'
//       }))
//     });
//   });

//   onlineStatus.sort((a,b) => b.date.localeCompare(a.date) || a.user.localeCompare(b.user));
//   return onlineStatus;
// }

// // -----------------------------
// // MAIN API HANDLER
// // -----------------------------
// export async function GET(request) {
//   const requestStart = Date.now();

//   const authHeader = request.headers.get("Authorization");
//   const token = authHeader?.split(" ")[1];

//   const { searchParams } = new URL(request.url);
//   const listId = searchParams.get("listId");
//   const teamId = process.env.TEAM_ID;

//   if (!token) return NextResponse.json({ error: "Missing token" }, { status: 401 });
//   if (!listId) return NextResponse.json({ error: "listId required" }, { status: 400 });
//   if (!teamId) return NextResponse.json({ error: "TEAM_ID missing" }, { status: 500 });

//   try {
//     // Fetch team members
//     const membersRes = await fetch(`https://api.clickup.com/api/v2/team/${teamId}`, {
//       headers: { Authorization: `Bearer ${token}` }
//     });
//     const membersData = await membersRes.json();
//     const members = membersData.team?.members || [];
//     if (members.length === 0) return NextResponse.json({ data: [], message: "No team members" });

//     // Fetch time entries (last 6 months)
//     const startDate = Date.now() - (180 * 24 * 60 * 60 * 1000);
//     const allEntries = [];

//     for (const m of members) {
//       const res = await fetch(
//         `https://api.clickup.com/api/v2/team/${teamId}/time_entries?subtasks=true&start_date=${startDate}&assignee=${m.user.id}`,
//         { headers: { Authorization: `Bearer ${token}` } }
//       );
//       const data = await res.json();
//       if (Array.isArray(data.data)) allEntries.push(...data.data);
//     }

//     if (allEntries.length === 0) return NextResponse.json({ data: [], message: "No time entries" });

//     // Fetch task details
//     const taskIds = allEntries.map(e => e.task?.id).filter(Boolean);
//     const taskMap = await fetchTaskDetails(taskIds, token);

//     // Build raw timers
//     const rawTimers = allEntries.map(e => {
//       const detect = detectFakeTime(e);
//       const taskId = e.task?.id;
//       const detail = taskMap.get(taskId) || {};
//       const start = Number(e.start);
//       const duration = Number(e.duration || 0);
//       const end = start + duration;

//       return {
//         user: e.user?.username || e.user?.email || "Unknown",
//         userId: e.user?.id,
//         taskId,
//         taskName: e.task?.name || detail.taskName || "Unknown Task",
//         taskUrl: e.task?.url || detail.taskUrl,
//         listId: detail.listId,
//         startTime: start,
//         endTime: end,
//         duration,
//         isFake: detect.isFake,
//         isReal: detect.isReal,
//         source: detect.source
//       };
//     });

//     // Filter by list
//     const filtered = rawTimers.filter(t => String(t.listId) === String(listId));
//     if (filtered.length === 0) return NextResponse.json({ data: [], message: "No entries for this list" });

//     // Merge timers
//     const merged = mergeTimers(filtered);

//     // Calculate online/offline
//     const onlineStatus = calculateUserOnlineStatus(filtered);

//     const totalTime = Date.now() - requestStart;

//     return NextResponse.json({
//       data: merged,
//       onlineStatus,
//       meta: {
//         totalEntries: allEntries.length,
//         filteredEntries: filtered.length,
//         mergedEntries: merged.length,
//         fakeTimers: merged.filter(t => t.isFake).length,
//         realTimers: merged.filter(t => t.isReal).length,
//         processingTime: `${totalTime}ms`
//       }
//     });

//   } catch (err) {
//     return NextResponse.json({ error: err.message }, { status: 500 });
//   }
// }


import { NextResponse } from "next/server";

// Detect fake or real time entry based on source
function detectFakeTime(entry) {
  const src = (entry.source || "").toLowerCase();

  return {
    isFake: src === "clickup",     // Only "clickup" is fake
    isReal: src !== "clickup",     // Everything else is real
    source: entry.source || "unknown",
  };
}

// Merge timers by taskId + userId + timeType (fake/real)
function mergeTimers(timers) {
  const map = new Map();

  timers.forEach(t => {
    const timeType = t.isFake ? 'fake' : 'real';
    const key = `${t.taskId}_${t.userId}_${timeType}`;

    if (!key || !t.taskId) return;

    if (map.has(key)) {
      const old = map.get(key);
      map.set(key, {
        ...old,
        duration: old.duration + t.duration,
        startTime: Math.min(old.startTime, t.startTime),
        endTime: Math.max(old.endTime, t.endTime),
      });
    } else {
      map.set(key, { ...t });
    }
  });

  return [...map.values()];
}

// Fetch task details with caching & batching
async function fetchTaskDetails(taskIds, token) {
  if (taskIds.length === 0) return new Map();

  const uniqueTaskIds = [...new Set(taskIds)];
  const taskDetails = new Map();
  const batchSize = 100;

  for (let i = 0; i < uniqueTaskIds.length; i += batchSize) {
    const batch = uniqueTaskIds.slice(i, i + batchSize);

    const fetchPromises = batch.map(async (taskId) => {
      try {
        const res = await fetch(
          `https://api.clickup.com/api/v2/task/${taskId}?include_children=true`,
          {
            headers: { Authorization: `Bearer ${token}` },
            next: { revalidate: 3600 }
          }
        );

        if (res.ok) {
          const task = await res.json();
          taskDetails.set(taskId, {
            listId: task.list?.id,
            taskName: task.name,
            taskUrl: task.url,
          });
        }
      } catch (e) {
        console.error(`Error fetching task ${taskId}:`, e.message);
      }
    });

    await Promise.all(fetchPromises);
    await new Promise(resolve => setTimeout(resolve, 50));
  }

  return taskDetails;
}

export async function GET(request) {
  const requestStartTime = Date.now();

  const authHeader = request.headers.get("Authorization");
  const token = authHeader?.split(" ")[1];

  const { searchParams } = new URL(request.url);
  const listId = searchParams.get("listId");
  const teamId = process.env.TEAM_ID;

  if (!token) return NextResponse.json({ error: "Missing token" }, { status: 401 });
  if (!listId) return NextResponse.json({ error: "listId required" }, { status: 400 });
  if (!teamId) return NextResponse.json({ error: "TEAM_ID missing" }, { status: 500 });

  try {
    // Fetch team members
    const membersRes = await fetch(`https://api.clickup.com/api/v2/team/${teamId}`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    const membersData = await membersRes.json();
    const members = membersData.team?.members || [];

    if (members.length === 0)
      return NextResponse.json({ data: [], message: "No team members" });

    // Fetch time entries for last 6 months
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    const startDate = sixMonthsAgo.getTime();

    const allTimeEntries = [];

    for (const m of members) {
      const userId = m.user.id;

      const res = await fetch(
        `https://api.clickup.com/api/v2/team/${teamId}/time_entries?subtasks=true&start_date=${startDate}&assignee=${userId}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      const data = await res.json();
      if (Array.isArray(data.data)) allTimeEntries.push(...data.data);
    }

    if (allTimeEntries.length === 0)
      return NextResponse.json({ data: [], message: "No time entries" });

    // Fetch task details
    const taskIds = allTimeEntries.map(e => e.task?.id).filter(Boolean);
    const taskDetailsMap = await fetchTaskDetails(taskIds, token);

    // Build raw timers with startTime + endTime
    const rawTimers = allTimeEntries.map(entry => {
      const fakeCheck = detectFakeTime(entry);
      const taskId = entry.task?.id;
      const details = taskDetailsMap.get(taskId);

      const duration = Number(entry.duration || 0);
      const start = Number(entry.start);

      // endTime logic: if null, consider running
      const end = entry.end ? Number(entry.end) : start + duration;

      return {
        user: entry.user?.username || entry.user?.email || "Unknown",
        userId: entry.user?.id,
        taskId,
        taskName: entry.task?.name || details?.taskName || "Unknown Task",
        taskUrl: entry.task?.url || details?.taskUrl,
        listId: details?.listId,
        startTime: start,
        endTime: end,
        duration: duration,
        status: entry.end ? "stopped" : "running",
        isFake: fakeCheck.isFake,
        isReal: fakeCheck.isReal,
        source: fakeCheck.source,
      };
    });

    // Filter by listId
    const filtered = rawTimers.filter(t => String(t.listId) === String(listId));

    if (filtered.length === 0)
      return NextResponse.json({ data: [], message: "No entries for this list" });

    // Merge timers
    const mergedTimers = mergeTimers(filtered);

    const totalTime = Date.now() - requestStartTime;

    return NextResponse.json({
      data: mergedTimers,
      meta: {
        totalEntries: allTimeEntries.length,
        filteredEntries: filtered.length,
        mergedEntries: mergedTimers.length,
        fakeTimers: mergedTimers.filter(t => t.isFake).length,
        realTimers: mergedTimers.filter(t => t.isReal).length,
        processingTime: `${totalTime}ms`
      }
    });

  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
