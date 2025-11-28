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

// Calculate user online/offline status for entire team
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
      duration: timer.duration,
      source: timer.source
    });
  });

  const attendance = [];

  userDailySessions.forEach((data, key) => {
    // Sort sessions by start time
    data.sessions.sort((a, b) => a.start - b.start);

    // Merge sessions with small gaps (10 minutes tolerance)
    const mergedSessions = [];
    const GAP_THRESHOLD = 10 * 60 * 1000;

    data.sessions.forEach(session => {
      if (mergedSessions.length === 0) {
        mergedSessions.push({ ...session });
      } else {
        const lastSession = mergedSessions[mergedSessions.length - 1];

        if (session.start - lastSession.end <= GAP_THRESHOLD) {
          lastSession.end = Math.max(lastSession.end, session.end);
          lastSession.duration = lastSession.end - lastSession.start;
        } else {
          mergedSessions.push({ ...session });
        }
      }
    });

    const firstOnline = mergedSessions[0].start;
    const lastOffline = mergedSessions[mergedSessions.length - 1].end;

    const totalOnlineTime = mergedSessions.reduce((sum, session) => {
      return sum + (session.end - session.start);
    }, 0);

    // Calculate breaks
    const breaks = [];
    for (let i = 1; i < mergedSessions.length; i++) {
      const breakStart = mergedSessions[i - 1].end;
      const breakEnd = mergedSessions[i].start;
      const breakDuration = breakEnd - breakStart;

      if (breakDuration > 10 * 60 * 1000) {
        breaks.push({
          startTime: new Date(breakStart).toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: true
          }),
          endTime: new Date(breakEnd).toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: true
          }),
          durationMinutes: Math.floor(breakDuration / (1000 * 60))
        });
      }
    }

    // Detailed timeline
    const timeline = mergedSessions.map((session, idx) => {
      const nextBreak = breaks[idx];
      return {
        sessionNumber: idx + 1,
        checkIn: new Date(session.start).toLocaleTimeString('en-US', {
          hour: '2-digit',
          minute: '2-digit',
          hour12: true
        }),
        checkOut: new Date(session.end).toLocaleTimeString('en-US', {
          hour: '2-digit',
          minute: '2-digit',
          hour12: true
        }),
        durationMinutes: Math.floor((session.end - session.start) / (1000 * 60)),
        nextBreak: nextBreak ? `${nextBreak.durationMinutes} min` : null
      };
    });

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
      firstCheckIn: new Date(firstOnline).toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
      }),
      lastCheckOut: new Date(lastOffline).toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
      }),
      firstCheckInTimestamp: firstOnline,
      lastCheckOutTimestamp: lastOffline,
      totalActiveHours: (totalOnlineTime / (1000 * 60 * 60)).toFixed(2),
      totalSpanHours: ((lastOffline - firstOnline) / (1000 * 60 * 60)).toFixed(2),
      sessionCount: mergedSessions.length,
      breakCount: breaks.length,
      totalBreakMinutes: breaks.reduce((sum, b) => sum + b.durationMinutes, 0),
      breaks: breaks,
      timeline: timeline,
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
  const teamId = process.env.TEAM_ID;

  // Optional: Filter by date range
  const startDateParam = searchParams.get("startDate"); // YYYY-MM-DD
  const endDateParam = searchParams.get("endDate"); // YYYY-MM-DD

  console.log(`\n${'='.repeat(60)}`);
  console.log(`👥 TEAM ATTENDANCE REQUEST - ${new Date().toISOString()}`);
  console.log(`${'='.repeat(60)}`);

  if (!token) {
    return NextResponse.json(
      { error: "Authorization token is missing" },
      { status: 401 }
    );
  }

  if (!teamId) {
    return NextResponse.json(
      { error: "Team ID is not configured in environment variables" },
      { status: 500 }
    );
  }

  try {
    console.log("\n👥 Fetching team members...");

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

    console.log(`📅 Date Range: ${new Date(startDate).toLocaleDateString()} to ${new Date(endDate).toLocaleDateString()}`);

    // Fetch team members
    const membersRes = await fetch(`https://api.clickup.com/api/v2/team/${teamId}`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (!membersRes.ok) {
      const errorData = await membersRes.json();
      console.error("❌ Failed to fetch team members:", errorData);
      return NextResponse.json({
        error: "Failed to fetch team members",
        details: errorData
      }, { status: membersRes.status });
    }

    const membersData = await membersRes.json();
    const members = membersData.team?.members || [];

    console.log(`✅ Found ${members.length} team members`);

    if (members.length === 0) {
      return NextResponse.json({
        data: [],
        warning: "No team members found"
      });
    }

    console.log("\n⏱️  Fetching time entries for all members...");

    const allTimeEntries = [];

    // Fetch time entries in parallel batches
    const memberBatchSize = 10;
    for (let i = 0; i < members.length; i += memberBatchSize) {
      const memberBatch = members.slice(i, i + memberBatchSize);

      const batchPromises = memberBatch.map(async (member) => {
        const userId = member.user.id;
        const username = member.user.username || member.user.email;
        const apiUrl = `https://api.clickup.com/api/v2/team/${teamId}/time_entries?subtasks=true&start_date=${startDate}&assignee=${userId}`;

        try {
          const timeRes = await fetch(apiUrl, {
            headers: { Authorization: `Bearer ${token}` }
          });
          const timeData = await timeRes.json();

          if (timeRes.ok && Array.isArray(timeData.data)) {
            console.log(`   ✓ ${username}: ${timeData.data.length} entries`);
            return timeData.data;
          } else {
            console.error(`   ✗ ${username}: Failed`);
            return [];
          }
        } catch (err) {
          console.error(`   ✗ ${username}: ${err.message}`);
          return [];
        }
      });

      const batchResults = await Promise.all(batchPromises);
      batchResults.forEach(entries => allTimeEntries.push(...entries));
    }

    console.log(`\n📊 Total time entries fetched: ${allTimeEntries.length}`);

    if (allTimeEntries.length === 0) {
      return NextResponse.json({
        data: [],
        warning: "No time entries found for any user in the specified date range"
      });
    }

    // Calculate attendance
    console.log("\n🔍 Calculating team attendance...");
    const attendance = calculateTeamAttendance(allTimeEntries);

    // Console output
    console.log(`\n👤 TEAM ATTENDANCE SUMMARY:`);
    console.log(`${'='.repeat(100)}`);

    // Group by date
    const byDate = {};
    attendance.forEach(record => {
      if (!byDate[record.date]) byDate[record.date] = [];
      byDate[record.date].push(record);
    });

    Object.keys(byDate).sort().reverse().forEach(date => {
      console.log(`\n📆 ${new Date(date).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}`);
      console.log(`   ${'-'.repeat(90)}`);

      byDate[date].forEach(record => {
        console.log(`   👤 ${record.user.padEnd(25)} | 🟢 ${record.firstCheckIn} → 🔴 ${record.lastCheckOut} | ⏱️ ${record.totalActiveHours}h | 📊 ${record.sessionCount} sessions | ☕ ${record.totalBreakMinutes} min breaks`);
      });
    });
    console.log(`${'='.repeat(100)}`);

    const totalTime = Date.now() - requestStartTime;
    console.log(`\n⏱️  TOTAL REQUEST TIME: ${totalTime}ms`);
    console.log(`${'='.repeat(60)}\n`);

    // Summary statistics
    const stats = {
      totalRecords: attendance.length,
      uniqueUsers: new Set(attendance.map(a => a.userId)).size,
      uniqueDates: new Set(attendance.map(a => a.date)).size,
      totalActiveHours: attendance.reduce((sum, a) => sum + parseFloat(a.totalActiveHours), 0).toFixed(2),
      averageHoursPerDay: (attendance.reduce((sum, a) => sum + parseFloat(a.totalActiveHours), 0) / attendance.length).toFixed(2),
      processingTime: `${totalTime}ms`
    };

    return NextResponse.json({
      success: true,
      data: attendance,
      stats: stats,
      dateRange: {
        start: new Date(startDate).toISOString(),
        end: new Date(endDate).toISOString()
      }
    });

  } catch (err) {
    console.error("❌ Error fetching team attendance:", err);
    const totalTime = Date.now() - requestStartTime;
    console.log(`\n⏱️  Failed after: ${totalTime}ms`);
    console.log(`${'='.repeat(60)}\n`);

    return NextResponse.json({
      error: err.message,
      stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
    }, { status: 500 });
  }
}