import { NextResponse } from "next/server";

export async function GET(request) {
  const authHeader = request.headers.get("Authorization");
  const token = authHeader?.split(" ")[1];
  const teamId = process.env.TEAM_ID;

  if (!token) return NextResponse.json({ error: "Missing token" }, { status: 401 });
  if (!teamId) return NextResponse.json({ error: "TEAM_ID missing" }, { status: 500 });

  try {
    console.log('🔍 Fetching currently running timers...');

    // Fetch team members
    const membersRes = await fetch(`https://api.clickup.com/api/v2/team/${teamId}`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    const membersData = await membersRes.json();
    const members = membersData.team?.members || [];

    console.log(`👥 Found ${members.length} team members`);

    const runningTimers = [];

    // Check each member for running timers
    for (const m of members) {
      const userId = m.user.id;

      try {
        // Use the specific endpoint for running timers
        const res = await fetch(
          `https://api.clickup.com/api/v2/team/${teamId}/time_entries/current?assignee=${userId}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );

        const data = await res.json();

        // Check if this user has a running timer
        if (data.data && !data.data.error) {
          console.log(`  ✅ RUNNING TIMER FOUND for ${m.user.username}!`);

          // Fetch task details
          const taskId = data.data.task?.id;
          let taskDetails = null;

          if (taskId) {
            try {
              const taskRes = await fetch(
                `https://api.clickup.com/api/v2/task/${taskId}`,
                { headers: { Authorization: `Bearer ${token}` } }
              );

              if (taskRes.ok) {
                taskDetails = await taskRes.json();
              }
            } catch (e) {
              console.error(`Error fetching task ${taskId}:`, e.message);
            }
          }

          runningTimers.push({
            user: m.user.username || m.user.email,
            userId: userId,
            userInitials: m.user.initials || "?",
            userProfilePicture: m.user.profilePicture || null,
            taskId: taskId,
            taskName: data.data.task?.name || taskDetails?.name || "Unknown Task",
            taskUrl: data.data.task?.url || taskDetails?.url,
            listId: taskDetails?.list?.id,
            listName: taskDetails?.list?.name,
            folderId: taskDetails?.folder?.id,
            folderName: taskDetails?.folder?.name || "No Folder",
            startTime: Number(data.data.start),
            startFormatted: new Date(Number(data.data.start)).toLocaleString(),
            startTimeShort: new Date(Number(data.data.start)).toLocaleTimeString(),
            status: "running",
            isRunning: true,
            source: data.data.source || "unknown",
            isFake: (data.data.source || "").toLowerCase() === "clickup",
            billable: data.data.billable || false,
            description: data.data.description || ""
          });
        }
      } catch (err) {
        console.error(`Error checking running timer for user ${userId}:`, err.message);
      }
    }

    console.log(`🏃 Total running timers found: ${runningTimers.length}`);

    return NextResponse.json({
      success: true,
      runningTimers: runningTimers,
      stats: {
        totalRunning: runningTimers.length,
        activeUsers: runningTimers.length,
        totalActiveTime: runningTimers.reduce((sum, t) => sum + (Date.now() - t.startTime), 0)
      },
      meta: {
        totalMembers: members.length,
        timestamp: new Date().toISOString()
      }
    });

  } catch (err) {
    console.error('❌ Error in running-timers API:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}