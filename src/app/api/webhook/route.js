let timers = []; // In-memory, server restart pe khatam ho jayega

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const payload = req.body;
  const taskId = payload?.task_id;
  const user = payload?.user?.username || payload?.user?.email;

  if (!taskId) return res.status(400).json({ error: "No task_id" });

  if (payload.event === "time_tracking_started") {
    const existing = timers.find(t => t.taskId === taskId);
    if (existing) {
      existing.status = "running";
      existing.startTime = Date.now();
    } else {
      timers.push({
        taskId,
        taskName: payload?.task?.name || "No Task",
        user,
        status: "running",
        startTime: Date.now(),
        duration: 0,
      });
    }
  } else if (payload.event === "time_tracking_stopped") {
    const existing = timers.find(t => t.taskId === taskId);
    if (existing) {
      existing.status = "stopped";
      existing.duration += Date.now() - existing.startTime;
    }
  }

  console.log("Timers updated:", timers);

  res.status(200).json({ received: true });
}

export { timers };
