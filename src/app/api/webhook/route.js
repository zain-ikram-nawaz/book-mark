let timers = []; // In-memory, server restart pe khatam ho jayega

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const CLICKUP_SECRET = process.env.CLICKUP_SECRET;
  const signature = req.headers['x-clickup-signature'];


  if (!signature || signature !== CLICKUP_SECRET) {
    console.log("Invalid signature:", signature);
    return res.status(403).json({ error: "Invalid signature" });
  }

  const payload = req.body;
  const taskId = payload?.task_id;
  const user = payload?.user?.username || payload?.user?.email;

  if (!taskId) return res.status(400).json({ error: "No task_id" });

  // Detect start/stop events
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

// Optional export for frontend polling
export { timers };
