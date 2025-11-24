import { NextResponse } from "next/server";

// Merge timers helper
function mergeTimers(timers) {
  const map = new Map();
  timers.forEach(timer => {
    const key = timer.taskId || `no-task-${timer.startTime}`;
    if (map.has(key)) {
      const existing = map.get(key);
      map.set(key, {
        ...existing,
        duration: existing.duration + timer.duration,
        startTime: Math.min(existing.startTime, timer.startTime),
      });
    } else {
      map.set(key, { ...timer });
    }
  });
  return Array.from(map.values());
}

export async function GET(request) {
  const token = process.env.CLICKUP_TOKEN;
  const { searchParams } = new URL(request.url);
  const listId = searchParams.get("listId");

  if (!token || !listId)
    return NextResponse.json({ data: [], error: "Missing token or listId" }, { status: 400 });

  try {
    const timers = [];
    const tasksRes = await fetch(`https://api.clickup.com/api/v2/list/${listId}/task`, {
      headers: { Authorization: token },
    });
    const tasksData = await tasksRes.json();

    for (const task of tasksData.tasks || []) {
      // Fetch time entries for each task
      const timeEntriesRes = await fetch(`https://api.clickup.com/api/v2/task/${task.id}/time_entries`, {
        headers: { Authorization: token },
      });
      const timeEntriesData = await timeEntriesRes.json();

      if (timeEntriesData.data && timeEntriesData.data.length > 0) {
        for (const entry of timeEntriesData.data) {
          const isRunning = entry.duration < 0;
          timers.push({
            user: entry.user?.username || entry.user?.email || "Unknown",
            assignees: task.assignees?.map(a => a.username || a.email) || [],
            taskId: task.id,
            taskName: task.name || "No task",
            description: task.description || task.text_content || "",
            startTime: Number(entry.start) || Date.now(),
            duration: isRunning
              ? Date.now() - Number(entry.start)
              : Math.abs(Number(entry.duration || 0)),
            status: isRunning ? "running" : "stopped",
            start_date: task.start_date,
            due_date: task.due_date,
            taskUrl: task.url || "#",
          });
        }
      } else if (task.time_spent && Number(task.time_spent) > 0) {
        timers.push({
          user: task.creator?.username || task.creator?.email || "Unknown",
          assignees: task.assignees?.map(a => a.username || a.email) || [],
          taskId: task.id,
          taskName: task.name || "No task",
          description: task.description || task.text_content || "",
          startTime: Number(task.date_created) || Date.now(),
          duration: Number(task.time_spent || 0),
          status: "stopped",
          start_date: task.start_date,
          due_date: task.due_date,
          taskUrl: task.url || "#",
        });
      }
    }

    return NextResponse.json({ data: mergeTimers(timers) });
  } catch (err) {
    return NextResponse.json({ data: [], error: err.message }, { status: 500 });
  }
}
