import { NextResponse } from "next/server";

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

function calculateTeamAttendance(allTimeEntries) {
  const userDailySessions = new Map();

  allTimeEntries.forEach(entry => {
    const fakeCheck = detectFakeTime(entry);

    // Only consider REAL time entries (automatic tracking)
    if (!fakeCheck.isReal) return;

    const timer = {
      user: entry.user?.username || entry.user?.email || "Unknown",
      userId: entry.user?.id,
      startTime: Number(entry.start),
      duration: Number(entry.duration),
      taskName: entry.task?.name || "Unknown Task",
      taskId: entry.task?.id || null,
      taskUrl: entry.task?.url || null,
      source: fakeCheck.source
    };

    // Skip very long sessions (likely forgot to stop timer)
    const MAX_SESSION_HOURS = 12;
    if (timer.duration > MAX_SESSION_HOURS * 60 * 60 * 1000) {
      console.warn(`⚠️ Suspicious long session: ${timer.user} - ${(timer.duration / (1000 * 60 * 60)).toFixed(2)}h`);
      return;
    }

    const date = new Date(timer.startTime).toISOString().split('T')[0];
    const key = `${timer.userId}_${date}`;

    const sessionStart = timer.startTime;
    const sessionEnd = timer.startTime + timer.duration;

    if (!userDailySessions.has(key)) {
      userDailySessions.set(key, {
        user: timer.user,
        userId: timer.userId,
        date: date,
        sessions: []
      });
    }

    userDailySessions.get(key).sessions.push({
      start: sessionStart,
      end: sessionEnd,
      taskName: timer.taskName,
      taskId: timer.taskId,
      taskUrl: timer.taskUrl,
      duration: timer.duration,
      source: timer.source
    });
  });

  const attendance = [];

  userDailySessions.forEach((data, key) => {
    // Sort sessions by start time
    data.sessions.sort((a, b) => a.start - b.start);

    const firstOnline = data.sessions[0].start;
    const lastOffline = data.sessions[data.sessions.length - 1].end;

    const totalOnlineTime = data.sessions.reduce((sum, session) => {
      return sum + session.duration;
    }, 0);

    // Task breakdown - group by task
    const taskBreakdown = {};
    data.sessions.forEach(session => {
      const taskKey = session.taskId || session.taskName;
      if (!taskBreakdown[taskKey]) {
        taskBreakdown[taskKey] = {
          taskName: session.taskName,
          taskId: session.taskId,
          taskUrl: session.taskUrl,
          totalTime: 0,
          sessions: []
        };
      }

      taskBreakdown[taskKey].totalTime += session.duration;
      taskBreakdown[taskKey].sessions.push({
        startTime: new Date(session.start).toLocaleTimeString('en-US', {
          hour: '2-digit',
          minute: '2-digit',
          hour12: true
        }),
        endTime: new Date(session.end).toLocaleTimeString('en-US', {
          hour: '2-digit',
          minute: '2-digit',
          hour12: true
        }),
        durationHours: (session.duration / (1000 * 60 * 60)).toFixed(2),
        durationMinutes: Math.floor(session.duration / (1000 * 60))
      });
    });

    // Convert to array and sort by time spent
    const tasks = Object.values(taskBreakdown).map(task => ({
      taskName: task.taskName,
      taskId: task.taskId,
      taskUrl: task.taskUrl,
      totalHours: (task.totalTime / (1000 * 60 * 60)).toFixed(2),
      totalMinutes: Math.floor(task.totalTime / (1000 * 60)),
      sessions: task.sessions
    })).sort((a, b) => parseFloat(b.totalHours) - parseFloat(a.totalHours));

    attendance.push({
      user: data.user,
      userId: data.userId,
      date: data.date,
      dateFormatted: new Date(data.date).toLocaleDateString('en-US', {
        weekday: 'short',
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      }),
      checkIn: new Date(firstOnline).toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
      }),
      checkOut: new Date(lastOffline).toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
      }),
      checkInTimestamp: firstOnline,
      checkOutTimestamp: lastOffline,
      totalActiveHours: (totalOnlineTime / (1000 * 60 * 60)).toFixed(2),
      totalActiveMinutes: Math.floor(totalOnlineTime / (1000 * 60)),
      sessionCount: data.sessions.length,
      tasks: tasks,
      status: totalOnlineTime > 0 ? 'present' : 'absent'
    });
  });

  // Sort by date (newest first) and then by user
  attendance.sort((a, b) => {
    if (b.date !== a.date) return b.date.localeCompare(a.date);
    return a.user.localeCompare(b.user);
  });

  return attendance;
}

export async function GET(request) {
  const requestStartTime = Date.now();

  const authHeader = request.headers.get('Authorization');
  const token = authHeader?.split(' ')[1];

  const { searchParams } = new URL(request.url);

  const startDateParam = searchParams.get("startDate");
  const endDateParam = searchParams.get("endDate");

  if (!token) {
    return NextResponse.json(
      { error: "Authorization token is missing" },
      { status: 401 }
    );
  }

  try {
    const workspacesRes = await fetch('https://api.clickup.com/api/v2/team', {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (!workspacesRes.ok) {
      const errorData = await workspacesRes.json();
      return NextResponse.json({
        error: "Failed to fetch workspaces",
        details: errorData
      }, { status: workspacesRes.status });
    }

    const workspacesData = await workspacesRes.json();

    if (!workspacesData.teams || workspacesData.teams.length === 0) {
      return NextResponse.json({
        error: "No workspaces found for this user"
      }, { status: 404 });
    }

    const teamId = workspacesData.teams[0].id;
    const selectedWorkspace = workspacesData.teams[0];
    const userRes = await fetch('https://api.clickup.com/api/v2/user', {
      headers: { Authorization: `Bearer ${token}` }
    });

    const userData = await userRes.json();
    const currentUserId = userData.user.id;

    // Calculate date range (default: last 30 days)
    let startDate, endDate;

    if (startDateParam && endDateParam) {
      startDate = new Date(startDateParam).getTime();
      endDate = new Date(endDateParam).getTime();
    } else {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      startDate = thirtyDaysAgo.getTime();
      endDate = Date.now();
    }

    const membersRes = await fetch(`https://api.clickup.com/api/v2/team/${teamId}`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    let members = [];
    let isAdmin = false;
    let isGuest = true;

    if (membersRes.ok) {
      const membersData = await membersRes.json();
      members = membersData.team?.members || [];

      if (members.length > 0) {
        const currentUserMember = members.find(m => m.user.id === currentUserId);

        isAdmin = currentUserMember && (
          currentUserMember.user.role === 'admin' ||
          currentUserMember.user.role === 'owner' ||
          currentUserMember.user.role === 2 ||
          currentUserMember.user.role === 1
        );

        isGuest = !currentUserMember || currentUserMember.user.role === 3 || currentUserMember.user.role === 'guest';
      }
    }

    const allTimeEntries = [];

    if (isAdmin && members.length > 0) {
      const memberBatchSize = 10;
      for (let i = 0; i < members.length; i += memberBatchSize) {
        const memberBatch = members.slice(i, i + memberBatchSize);

        const batchPromises = memberBatch.map(async (member) => {
          const userId = member.user.id;
          const apiUrl = `https://api.clickup.com/api/v2/team/${teamId}/time_entries?subtasks=true&start_date=${startDate}&assignee=${userId}`;

          try {
            const timeRes = await fetch(apiUrl, {
              headers: { Authorization: `Bearer ${token}` }
            });
            const timeData = await timeRes.json();

            if (timeRes.ok && Array.isArray(timeData.data)) {
              return timeData.data;
            }
            return [];
          } catch (err) {
            return [];
          }
        });

        const batchResults = await Promise.all(batchPromises);
        batchResults.forEach(entries => allTimeEntries.push(...entries));
      }
    } else {
      const apiUrl1 = `https://api.clickup.com/api/v2/team/${teamId}/time_entries?assignee=${currentUserId}&start_date=${startDate}`;

      try {
        const res = await fetch(apiUrl1, {
          headers: { Authorization: `Bearer ${token}` }
        });
        const data = await res.json();

        if (res.ok && Array.isArray(data.data)) {
          allTimeEntries.push(...data.data);
        }
      } catch (err) {
        console.log("❌ Fetch Error:", err.message);
      }

      if (allTimeEntries.length === 0) {
        try {
          const spacesRes = await fetch(`https://api.clickup.com/api/v2/team/${teamId}/space?archived=false`, {
            headers: { Authorization: `Bearer ${token}` }
          });

          const spacesData = await spacesRes.json();
          if (spacesData.spaces && spacesData.spaces.length > 0) {
            for (const space of spacesData.spaces) {
              const spaceTimeUrl = `https://api.clickup.com/api/v2/team/${teamId}/time_entries?space_id=${space.id}&assignee=${currentUserId}&start_date=${startDate}`;

              try {
                const res = await fetch(spaceTimeUrl, {
                  headers: { Authorization: `Bearer ${token}` }
                });

                const data = await res.json();

                if (res.ok && Array.isArray(data.data)) {
                  allTimeEntries.push(...data.data);
                }
              } catch (err) {
                console.log(`  ❌ Error:`, err.message);
              }
            }
          }
        } catch (err) {
          console.log("❌ Error fetching spaces:", err.message);
        }
      }
    }

    if (allTimeEntries.length === 0) {
      return NextResponse.json({
        data: [],
        warning: "No time entries found in the specified date range"
      });
    }

    const attendance = calculateTeamAttendance(allTimeEntries);

    const totalTime = Date.now() - requestStartTime;
    const stats = {
      totalRecords: attendance.length,
      uniqueUsers: new Set(attendance.map(a => a.userId)).size,
      uniqueDates: new Set(attendance.map(a => a.date)).size,
      totalActiveHours: attendance.reduce((sum, a) => sum + parseFloat(a.totalActiveHours), 0).toFixed(2),
      processingTime: `${totalTime}ms`
    };

    return NextResponse.json({
      success: true,
      data: attendance,
      stats: stats,
      dateRange: {
        start: new Date(startDate).toISOString(),
        end: new Date(endDate).toISOString()
      },
      meta: {
        userRole: isAdmin ? 'admin' : (isGuest ? 'guest' : 'member'),
        workspace: selectedWorkspace.name
      }
    });

  } catch (err) {
    console.error("❌ Error:", err);
    const totalTime = Date.now() - requestStartTime;

    return NextResponse.json({
      error: err.message,
      stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
    }, { status: 500 });
  }
}