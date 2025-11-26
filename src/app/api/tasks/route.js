import { NextResponse } from "next/server";

// Detect fake or real time entry based on source (No change)
function detectFakeTime(entry) {
  const src = (entry.source || "").toLowerCase();
  const fakeSources = ["global", "manual", "batch", "clickup_api"];
  const realSources = ["track_event", "timer", "clickup", "clickup_automatic"];

  return {
    isFake: fakeSources.some(s => src.includes(s)),
    isReal: realSources.some(s => src.includes(s)),
    source: entry.source || "unknown",
  };
}

// Merge timers by taskId (No change)
function mergeTimers(timers) {
  const map = new Map();
 
  timers.forEach(t => {
    const key = t.taskId;
    if (!key) return;
    if (map.has(key)) {
      const old = map.get(key);
      map.set(key, {
        ...old,
        duration: old.duration + t.duration,
        startTime: Math.min(old.startTime, t.startTime),
        taskName: old.taskName || t.taskName,
        user: old.user || t.user,
      });
    } else {
      map.set(key, { ...t });
    }
  });
  return [...map.values()];
}


// *** Task Fetching Function: Ab yeh OAuth Token use karega ***
async function fetchTaskDetails(taskIds, token) {
    if (taskIds.length === 0) return new Map();

    const uniqueTaskIds = [...new Set(taskIds)];
    const taskDetails = new Map();
   
    // Hum 10 tasks tak hi limit rakhenge, jesa ke pehle tha
    const limitedTaskIds = uniqueTaskIds.slice(0, 10);
    const fetchPromises = limitedTaskIds.map(async (taskId) => {
        try {
            const res = await fetch(`https://api.clickup.com/api/v2/task/${taskId}?include_children=true`, {
                headers: { Authorization: `Bearer ${token}` }, // *** TOKEN USE ***
                next: { revalidate: 3600 }
            });
            if (res.ok) {
                const task = await res.json();
                taskDetails.set(taskId, {
                    listId: task.list?.id,
                    taskName: task.name,
                    taskUrl: task.url,
                });
            } else if (res.status === 401) {
                 console.error(`Task detail fetch failed for ${taskId}: Unauthorized`);
            }
        } catch (e) {
            console.error(`Error fetching detail for task ${taskId}:`, e.message);
        }
    });

    await Promise.all(fetchPromises);
    return taskDetails;
}

export async function GET(request) {
    const authHeader = request.headers.get('Authorization');
    const token = authHeader?.split(' ')[1];

    const { searchParams } = new URL(request.url);
    const listId = searchParams.get("listId");
    const teamId = process.env.TEAM_ID ;

    if (!token || !listId || !teamId) {
        return NextResponse.json(
            { error: "Authorization Token, List ID, or Team ID missing." },
            { status: 401 }
        );
    }

    try {
        console.log("Fetching ALL team members' time entries...");

        const sixMonthsAgo = new Date();
        sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
        const startDate = sixMonthsAgo.getTime();

        // *** FETCH TEAM MEMBERS ***
        const membersRes = await fetch(`https://api.clickup.com/api/v2/team/${teamId}`, {
            headers: { Authorization: `Bearer ${token}` }
        });

        if (!membersRes.ok) {
            return NextResponse.json({ error: "Failed to fetch team members" }, { status: membersRes.status });
        }

        const membersData = await membersRes.json();
        const members = membersData.team?.members || [];

        console.log(`Found ${members.length} team members`);

        // *** FETCH TIME ENTRIES FOR ALL MEMBERS ***
        const allTimeEntries = [];

        for (const member of members) {
            const userId = member.user.id;
            const apiUrl = `https://api.clickup.com/api/v2/team/${teamId}/time_entries?subtasks=true&start_date=${startDate}&assignee=${userId}`;

            try {
                const timeRes = await fetch(apiUrl, {
                    headers: { Authorization: `Bearer ${token}` }
                });
                const timeData = await timeRes.json();

                if (timeRes.ok && Array.isArray(timeData.data)) {
                    allTimeEntries.push(...timeData.data);
                    console.log(`Fetched ${timeData.data.length} entries for user ${member.user.username}`);
                }
            } catch (err) {
                console.error(`Error fetching entries for user ${userId}:`, err.message);
            }
        }

        console.log(`Total time entries fetched: ${allTimeEntries.length}`);

        const taskIds = allTimeEntries.map(entry => entry.task?.id).filter(id => id);
        const taskDetailsMap = await fetchTaskDetails(taskIds, token);

        const rawTimers = allTimeEntries.map(entry => {
            const fakeCheck = detectFakeTime(entry);
            const taskId = entry.task?.id;
            const details = taskId ? taskDetailsMap.get(taskId) : {};

            return {
                user: entry.user?.username || entry.user?.email || "Unknown",
                userId: entry.user?.id,
                taskId: taskId,
                taskName: entry.task?.name || details?.taskName || "Unknown Task",
                taskUrl: entry.task?.url || details?.taskUrl,
                listId: details?.listId,
                startTime: Number(entry.start),
                duration: Number(entry.duration),
                status: entry.duration > 0 ? "stopped" : "running",
                start_date: entry.start,
                isFake: fakeCheck.isFake,
                isReal: fakeCheck.isReal,
                source: fakeCheck.source,
            };
        }).filter(t => t.listId);

        const filteredByList = rawTimers.filter(timer => String(timer.listId) === String(listId));
        console.log(`Filtered for list ${listId}: ${filteredByList.length} entries`);

        const mergedTimers = mergeTimers(filteredByList);
        return NextResponse.json({ data: mergedTimers });

    } catch (err) {
        console.error("Error fetching tasks/timers:", err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}