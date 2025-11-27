import { NextResponse } from "next/server";

// Detect fake or real time entry based on source
function detectFakeTime(entry) {
  const src = (entry.source || "").toLowerCase();

  return {
    isFake: src === "clickup",
    isReal: src !== "clickup",
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
    console.log('🔍 Fetching team members...');
    
    // Fetch team members
    const membersRes = await fetch(`https://api.clickup.com/api/v2/team/${teamId}`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    const membersData = await membersRes.json();
    const members = membersData.team?.members || [];

    console.log(`👥 Found ${members.length} team members`);

    if (members.length === 0)
      return NextResponse.json({ data: [], runningTimers: [], message: "No team members" });

    // Fetch time entries for last 6 months
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    const startDate = sixMonthsAgo.getTime();

    const allTimeEntries = [];

    console.log('⏱️ Fetching time entries for all members...');

    for (const m of members) {
      const userId = m.user.id;

      const res = await fetch(
        `https://api.clickup.com/api/v2/team/${teamId}/time_entries?subtasks=true&start_date=${startDate}&assignee=${userId}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      const data = await res.json();
      if (Array.isArray(data.data)) {
        console.log(`  📊 User ${m.user.username}: ${data.data.length} entries`);
        
        // LOG RAW DATA FOR FIRST FEW ENTRIES TO SEE STRUCTURE
        if (data.data.length > 0) {
          console.log(`  🔍 Sample entry for ${m.user.username}:`, JSON.stringify(data.data[0], null, 2));
        }
        
        allTimeEntries.push(...data.data);
      }
    }

    console.log(`✅ Total time entries fetched: ${allTimeEntries.length}`);

    if (allTimeEntries.length === 0)
      return NextResponse.json({ data: [], runningTimers: [], message: "No time entries" });

    // LOG: Check for entries without 'end' field
    const entriesWithoutEnd = allTimeEntries.filter(e => !e.end || e.end === null || e.end === 0);
    console.log(`🏃 Entries without 'end' field (potentially running): ${entriesWithoutEnd.length}`);
    if (entriesWithoutEnd.length > 0) {
      console.log('🔍 Sample running entry:', JSON.stringify(entriesWithoutEnd[0], null, 2));
    }

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

      // CRITICAL: Multiple checks for running status
      // Check if 'end' is null, undefined, 0, or empty string
      const isRunning = !entry.end || entry.end === null || entry.end === 0 || entry.end === '';
      const end = entry.end ? Number(entry.end) : Date.now();

      // LOG each entry's running status
      if (isRunning) {
        console.log(`  ▶️ RUNNING: User ${entry.user?.username}, Task ${entry.task?.name}, end=${entry.end}`);
      }

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
        status: isRunning ? "running" : "stopped",
        isFake: fakeCheck.isFake,
        isReal: fakeCheck.isReal,
        source: fakeCheck.source,
        isRunning: isRunning,
        // DEBUG: Include raw end value
        rawEndValue: entry.end,
      };
    });

    console.log(`🔄 Processing ${rawTimers.length} raw timers...`);

    // Filter by listId
    const filtered = rawTimers.filter(t => String(t.listId) === String(listId));

    console.log(`📋 Filtered to ${filtered.length} entries for list ${listId}`);

    if (filtered.length === 0)
      return NextResponse.json({ data: [], runningTimers: [], message: "No entries for this list" });

    // Separate running timers (don't merge these)
    const runningTimers = filtered.filter(t => t.isRunning);
    const stoppedTimers = filtered.filter(t => !t.isRunning);

    console.log(`🏃 Running timers: ${runningTimers.length}`);
    console.log(`⏹️ Stopped timers: ${stoppedTimers.length}`);

    // Log running timer details
    runningTimers.forEach(rt => {
      console.log(`  ▶️ ${rt.user} - ${rt.taskName} (started: ${new Date(rt.startTime).toLocaleString()}, rawEnd: ${rt.rawEndValue})`);
    });

    // Merge only stopped timers
    const mergedTimers = mergeTimers(stoppedTimers);

    // Combine: running timers first, then merged stopped timers
    const allTimers = [...runningTimers, ...mergedTimers];

    const totalTime = Date.now() - requestStartTime;

    return NextResponse.json({
      data: allTimers,
      runningTimers: runningTimers,
      meta: {
        totalEntries: allTimeEntries.length,
        filteredEntries: filtered.length,
        mergedEntries: allTimers.length,
        runningEntries: runningTimers.length,
        stoppedEntries: stoppedTimers.length,
        fakeTimers: allTimers.filter(t => t.isFake).length,
        realTimers: allTimers.filter(t => t.isReal).length,
        processingTime: `${totalTime}ms`
      },
      // DEBUG: Include sample raw entries
      debug: {
        sampleRawEntry: allTimeEntries[0],
        entriesWithoutEnd: entriesWithoutEnd.length,
        sampleRunningEntry: entriesWithoutEnd[0] || null
      }
    });

  } catch (err) {
    console.error('❌ Error in tasks API:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}