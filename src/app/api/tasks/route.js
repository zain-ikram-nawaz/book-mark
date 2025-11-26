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
    // Token ko Request Header se nikalo
    const authHeader = request.headers.get('Authorization');
    const token = authHeader?.split(' ')[1]; // Expecting "Bearer <token>"

    const { searchParams } = new URL(request.url);
    const listId = searchParams.get("listId");
    // TEAM_ID ab bhi ENV se aayega kyunke yeh team-level setting hai.
    const teamId = process.env.TEAM_ID || "9014533043";

    if (!token || !listId || !teamId) {
        return NextResponse.json(
    	    { error: "Authorization Token, List ID, or Team ID missing." },
    	    { status: 401 }
        );
    }

    try {
        console.log("Fetching ALL time entries for Team ID...");

        // Start Date Calculate Karen (6 Months Ago)
        const sixMonthsAgo = new Date();
        sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
        const startDate = sixMonthsAgo.getTime();

        // 1. Time Entries Fetch karna
        const apiUrl = `https://api.clickup.com/api/v2/team/${teamId}/time_entries?subtasks=true&start_date=${startDate}`;

        const timeRes = await fetch(apiUrl, { headers: { Authorization: `Bearer ${token}` } }); // *** TOKEN USE ***
        const timeData = await timeRes.json();

        if (!timeRes.ok) {
            console.error("Time Entries API Error:", timeData.err);
             if (timeRes.status === 401) {
                 return NextResponse.json({ error: "Token is invalid or expired. Re-authentication required." }, { status: 401 });
             }
            return NextResponse.json({ data: [], error: timeData.err }, { status: timeRes.status });
        }
        if (!Array.isArray(timeData.data)) {
            return NextResponse.json({ data: [] });
        }


        const taskIds = timeData.data.map(entry => entry.task?.id).filter(id => id);

        // 2. Task details fetch karna (jahan List ID hoti hai)
        console.log(`Fetching details for ${taskIds.length} unique task IDs...`);
        const taskDetailsMap = await fetchTaskDetails(taskIds, token); // *** TOKEN PASS ***

        // 3. Raw Timers banao aur 'listId' property ko merge karo
        const rawTimers = timeData.data.map(entry => {
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

  	    // 4. Data ko listId se filter karen (jo frontend ne bheja tha)
  	    const filteredByList = rawTimers.filter(timer => String(timer.listId) === String(listId));

  	    console.log(`Total raw entries fetched: ${timeData.data.length}. Filtered for target list ${listId}: ${filteredByList.length}`);

  	    const mergedTimers = mergeTimers(filteredByList);
  	    return NextResponse.json({ data: mergedTimers });

  	} catch (err) {
  	    console.error("Error fetching tasks/timers:", err);
  	    return NextResponse.json({ error: err.message }, { status: 500 });
  	}
}