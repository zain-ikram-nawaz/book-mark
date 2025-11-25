import { NextResponse } from "next/server";

// Detect fake or real time entry based on source
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

// Merge timers by taskId
function mergeTimers(timers) {
  const map = new Map();

  timers.forEach(t => {
    const key = t.taskId;
    if (!key) return; // skip if taskId is missing

    if (map.has(key)) {
      const old = map.get(key);
      map.set(key, {
        ...old,
        duration: old.duration + t.duration,
        startTime: Math.min(old.startTime, t.startTime),
        // Optional: take first non-empty taskName and user
        taskName: old.taskName || t.taskName,
        user: old.user || t.user,
      });
    } else {
      map.set(key, { ...t });
    }
  });

  return [...map.values()];
}

export async function GET(request) {
  const token = process.env.CLICKUP_TOKEN;

  const { searchParams } = new URL(request.url);
  const listId = searchParams.get("listId");
  const teamId = "9014533043"; // your team ID

  if (!token || !listId) {
    return NextResponse.json(
      { error: "Missing token or listId" },
      { status: 400 }
    );
  }

  try {
    console.log("TOKEN OK");
    console.log("LIST ID:", listId);

    // Fetch time entries for the team filtered by list
    const timeRes = await fetch(
      `https://api.clickup.com/api/v2/team/${teamId}/time_entries?list_id=${listId}`,
      { headers: { Authorization: token } }
    );

    const timeData = await timeRes.json();

    if (!Array.isArray(timeData.data)) {
      return NextResponse.json({ data: [] });
    }

    const timers = timeData.data.map(entry => {
      const fakeCheck = detectFakeTime(entry);

      return {
        user: entry.user?.username || entry.user?.email || "Unknown",
        taskId: entry.task?.id,
        taskName: entry.task?.name,
        taskUrl: entry.task?.url,
        startTime: Number(entry.start),
        duration: Number(entry.duration),
        status: entry.duration > 0 ? "stopped" : "running",

        // Fake detection:
        isFake: fakeCheck.isFake,
        isReal: fakeCheck.isReal,
        source: fakeCheck.source,
      };
    });

    const mergedTimers = mergeTimers(timers);

    // console.log("FINAL MERGED TIMERS:", mergedTimers);

    return NextResponse.json({ data: mergedTimers });

  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
