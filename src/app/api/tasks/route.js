// import { NextResponse } from "next/server";

// function detectFakeTime(entry) {
//   const src = (entry.source || "").toLowerCase();
//   const start = Number(entry.start);
//   const end = Number(entry.end);

//   // ✅ KEY DETECTION: Check if timestamps end with 000 (rounded to seconds)
//   // Real timers have millisecond precision, fake timers are rounded
//   const startEndsWithZeros = start % 1000 === 0;
//   const endEndsWithZeros = end % 1000 === 0;
//   const bothTimestampsRounded = startEndsWithZeros && endEndsWithZeros;

//   // Manual source detection
//   const isManualSource = src === "clickup" || src === "manual";

//   // ✅ MAIN FAKE DETECTION LOGIC:
//   // 1. Manual source = definitely fake
//   // 2. Both timestamps rounded to seconds (no milliseconds) = fake
//   const isFake = isManualSource || bothTimestampsRounded;

//   // Device type detection
//   const isMobile = src === "clickup_mobile" || src === "mobile" || src === "android" || src === "ios";
//   const isDesktop = src === "clickup_automatic" || src.includes("automatic");

//   return {
//     isFake: isFake,
//     isMobile: isMobile,
//     isDesktop: isDesktop,
//     isReal: !isFake,
//     source: entry.source || "unknown",
//     deviceType: isFake ? "manual" : (isMobile ? "mobile" : (isDesktop ? "desktop" : "unknown"))
//   };
// }

// export async function GET(request) {
//   const requestStartTime = Date.now();

//   const authHeader = request.headers.get("Authorization");
//   const token = authHeader?.split(" ")[1];

//   const { searchParams } = new URL(request.url);
//   const teamId = process.env.TEAM_ID;

//   // Get date range from query params (default: last 3 days)
//   const daysParam = searchParams.get("days") || "3";
//   const days = parseInt(daysParam);

//   console.log(`\n${'='.repeat(60)}`);
//   console.log(`🚀 TEAM TIME DATA - Last ${days} days`);
//   console.log(`${'='.repeat(60)}`);

//   if (!token) {
//     return NextResponse.json({ error: "Missing token" }, { status: 401 });
//   }

//   if (!teamId) {
//     return NextResponse.json({ error: "TEAM_ID missing" }, { status: 500 });
//   }

//   try {
//     // Calculate date range
//     const now = new Date();
//     const startDate = new Date();
//     startDate.setDate(now.getDate() - days);
//     startDate.setHours(0, 0, 0, 0);

//     console.log(`📅 Fetching data from ${startDate.toLocaleDateString()} to ${now.toLocaleDateString()}`);

//     // Fetch team members
//     const membersRes = await fetch(`https://api.clickup.com/api/v2/team/${teamId}`, {
//       headers: { Authorization: `Bearer ${token}` }
//     });

//     if (!membersRes.ok) {
//       const errorData = await membersRes.json();
//       return NextResponse.json({
//         error: "Failed to fetch team members",
//         details: errorData
//       }, { status: membersRes.status });
//     }

//     const membersData = await membersRes.json();
//     const members = membersData.team?.members || [];

//     console.log(`✅ Found ${members.length} team members`);

//     if (members.length === 0) {
//       return NextResponse.json({
//         data: [],
//         runningTimers: [],
//         message: "No team members found"
//       });
//     }

//     // Fetch time entries for all members in parallel
//     const allTimeEntries = [];
//     const memberBatchSize = 10;

//     for (let i = 0; i < members.length; i += memberBatchSize) {
//       const memberBatch = members.slice(i, i + memberBatchSize);

//       const batchPromises = memberBatch.map(async (member) => {
//         const userId = member.user.id;
//         const username = member.user.username || member.user.email;
//         const apiUrl = `https://api.clickup.com/api/v2/team/${teamId}/time_entries?subtasks=true&start_date=${startDate.getTime()}&assignee=${userId}`;

//         try {
//           const res = await fetch(apiUrl, {
//             headers: { Authorization: `Bearer ${token}` }
//           });

//           const data = await res.json();

//           if (res.ok && Array.isArray(data.data)) {
//             console.log(`  ✓ ${username}: ${data.data.length} entries`);
//             return data.data;
//           } else {
//             console.error(`  ✗ ${username}: Failed`);
//             return [];
//           }
//         } catch (err) {
//           console.error(`  ✗ ${username}: ${err.message}`);
//           return [];
//         }
//       });

//       const batchResults = await Promise.all(batchPromises);
//       batchResults.forEach(entries => allTimeEntries.push(...entries));
//     }

//     console.log(`\n📊 Total time entries fetched: ${allTimeEntries.length}`);

//     if (allTimeEntries.length === 0) {
//       return NextResponse.json({
//         data: [],
//         runningTimers: [],
//         message: "No time entries found"
//       });
//     }

//     // Process all time entries
//     const processedTimers = allTimeEntries.map(entry => {
//       const fakeCheck = detectFakeTime(entry);
//       const duration = Number(entry.duration || 0);
//       const start = Number(entry.start);
//       const isRunning = !entry.end || entry.end === null || entry.end === 0 || entry.end === '';
//       const end = entry.end ? Number(entry.end) : Date.now();

//       return {
//         user: entry.user?.username || entry.user?.email || "Unknown",
//         userId: entry.user?.id,
//         taskId: entry.task?.id,
//         taskName: entry.task?.name || "Unknown Task",
//         taskUrl: entry.task?.url,
//         listId: entry.task?.list?.id,
//         listName: entry.task?.list?.name,
//         folderId: entry.task?.folder?.id,
//         folderName: entry.task?.folder?.name || "No Folder",
//         spaceId: entry.task?.space?.id,
//         spaceName: entry.task?.space?.name,
//         startTime: start,
//         endTime: end,
//         duration: duration,
//         status: isRunning ? "running" : "stopped",
//         isFake: fakeCheck.isFake,
//         isMobile: fakeCheck.isMobile,
//         isDesktop: fakeCheck.isDesktop,
//         isReal: fakeCheck.isReal,
//         source: fakeCheck.source,
//         deviceType: fakeCheck.deviceType,
//         isRunning: isRunning,
//         date: new Date(start).toISOString().split('T')[0],
//         startFormatted: new Date(start).toLocaleString(),
//         endFormatted: new Date(end).toLocaleString(),
//       };
//     });

//     // Separate running and stopped timers
//     const runningTimers = processedTimers.filter(t => t.isRunning);
//     const stoppedTimers = processedTimers.filter(t => !t.isRunning);

//     console.log(`🏃 Running timers: ${runningTimers.length}`);
//     console.log(`⏹️  Stopped timers: ${stoppedTimers.length}`);

//     // ✅ Filter timers by type
//     const fakeTimers = processedTimers.filter(t => t.isFake);
//     const mobileTimers = processedTimers.filter(t => t.isMobile && !t.isFake);
//     const desktopTimers = processedTimers.filter(t => t.isDesktop && !t.isFake);

//     // ✅ Console log ONLY FAKE TIMERS
//     if (fakeTimers.length > 0) {
//       console.log(`\n${'='.repeat(70)}`);
//       console.log(`🚨 FAKE/MANUAL TIMERS DETECTED: ${fakeTimers.length}`);
//       console.log(`${'='.repeat(70)}`);

//       fakeTimers.forEach((timer, index) => {
//         console.log(`\n[${index + 1}] 🔴 FAKE TIMER`);
//         console.log(`   👤 User: ${timer.user}`);
//         console.log(`   📋 Task: ${timer.taskName}`);
//         console.log(`   ⏱️  Duration: ${(timer.duration / (1000 * 60)).toFixed(2)} min`);
//         console.log(`   🕐 Start: ${timer.startFormatted}`);
//         console.log(`   🕑 End: ${timer.endFormatted}`);
//         console.log(`   📱 Source: ${timer.source}`);
//         console.log(`   🖥️  Device: ${timer.deviceType}`);
//       });
//     }

//     // Get unique users and folders for filters
//     const uniqueUsers = [...new Set(processedTimers.map(t => JSON.stringify({ id: t.userId, name: t.user })))]
//       .map(str => JSON.parse(str))
//       .sort((a, b) => a.name.localeCompare(b.name));

//     const uniqueFolders = [...new Set(processedTimers.map(t => JSON.stringify({
//       id: t.folderId || 'no-folder',
//       name: t.folderName
//     })))]
//       .map(str => JSON.parse(str))
//       .sort((a, b) => a.name.localeCompare(b.name));

//     // Calculate statistics
//     const stats = {
//       totalEntries: processedTimers.length,
//       totalDuration: processedTimers.reduce((sum, t) => sum + t.duration, 0),
//       totalHours: (processedTimers.reduce((sum, t) => sum + t.duration, 0) / (1000 * 60 * 60)).toFixed(2),
//       uniqueUsers: uniqueUsers.length,
//       fakeEntries: fakeTimers.length,
//       mobileEntries: mobileTimers.length,
//       desktopEntries: desktopTimers.length,
//       realEntries: processedTimers.filter(t => t.isReal).length,
//     };

//     const totalTime = Date.now() - requestStartTime;
//     console.log(`\n⏱️  TOTAL REQUEST TIME: ${totalTime}ms`);
//     console.log(`${'='.repeat(60)}\n`);

//     return NextResponse.json({
//       success: true,
//       data: processedTimers,
//       runningTimers: runningTimers,
//       filters: {
//         users: uniqueUsers,
//         folders: uniqueFolders
//       },
//       stats: stats,
//       dateRange: {
//         start: startDate.toISOString(),
//         end: now.toISOString(),
//         days: days
//       },
//       meta: {
//         processingTime: `${totalTime}ms`
//       }
//     });

//   } catch (err) {
//     console.error('❌ Error in team-time API:', err);
//     const totalTime = Date.now() - requestStartTime;
//     console.log(`\n⏱️  Failed after: ${totalTime}ms`);

//     return NextResponse.json({
//       error: err.message,
//       stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
//     }, { status: 500 });
//   }
// }
import { NextResponse } from "next/server";

function detectFakeTime(entry) {
  const src = (entry.source || "").toLowerCase();
  const start = Number(entry.start);
  const end = Number(entry.end);

  const startEndsWithZeros = start % 1000 === 0;
  const endEndsWithZeros = end % 1000 === 0;
  const bothTimestampsRounded = startEndsWithZeros && endEndsWithZeros;

  const isManualSource = src === "clickup" || src === "manual";
  const isFake = isManualSource || bothTimestampsRounded;

  const isMobile = src === "clickup_mobile" || src === "mobile" || src === "android" || src === "ios";
  const isDesktop = src === "clickup_automatic" || src.includes("automatic");

  return {
    isFake: isFake,
    isMobile: isMobile,
    isDesktop: isDesktop,
    isReal: !isFake,
    source: entry.source || "unknown",
    deviceType: isFake ? "manual" : (isMobile ? "mobile" : (isDesktop ? "desktop" : "unknown"))
  };
}

export async function GET(request) {
  const requestStartTime = Date.now();

  const authHeader = request.headers.get("Authorization");
  const token = authHeader?.split(" ")[1];

  const { searchParams } = new URL(request.url);

  const daysParam = searchParams.get("days") || "3";
  const days = parseInt(daysParam);

  if (!token) {
    return NextResponse.json({ error: "Missing token" }, { status: 401 });
  }

  try {
    // Fetch user's workspaces dynamically
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

    // Get current user info
    const userRes = await fetch('https://api.clickup.com/api/v2/user', {
      headers: { Authorization: `Bearer ${token}` }
    });
    const userData = await userRes.json();
    const currentUserId = userData.user.id;

    // Calculate date range
    const now = new Date();
    const startDate = new Date();
    startDate.setDate(now.getDate() - days);
    startDate.setHours(0, 0, 0, 0);

    // Fetch team members to check user role
    const membersRes = await fetch(`https://api.clickup.com/api/v2/team/${teamId}`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (!membersRes.ok) {
      const errorData = await membersRes.json();
      return NextResponse.json({
        error: "Failed to fetch team members",
        details: errorData
      }, { status: membersRes.status });
    }

    const membersData = await membersRes.json();
    const members = membersData.team?.members || [];

    if (members.length === 0) {
      return NextResponse.json({
        data: [],
        runningTimers: [],
        message: "No team members found"
      });
    }

    // Check if current user is admin or owner
    const currentUserMember = members.find(m => m.user.id === currentUserId);
    const isAdmin = currentUserMember && (
      currentUserMember.user.role === 'admin' ||
      currentUserMember.user.role === 'owner' ||
      currentUserMember.user.role === 2 || // Admin role ID
      currentUserMember.user.role === 1    // Owner role ID
    );

    // console.log(isAdmin,"role")
    // Fetch time entries based on role
    const allTimeEntries = [];

    if (isAdmin) {
      // Admin: Fetch all members' time entries
      const memberBatchSize = 10;

      for (let i = 0; i < members.length; i += memberBatchSize) {
        const memberBatch = members.slice(i, i + memberBatchSize);

        const batchPromises = memberBatch.map(async (member) => {
          const userId = member.user.id;
          const apiUrl = `https://api.clickup.com/api/v2/team/${teamId}/time_entries?subtasks=true&start_date=${startDate.getTime()}&assignee=${userId}`;

          try {
            const res = await fetch(apiUrl, {
              headers: { Authorization: `Bearer ${token}` }
            });

            const data = await res.json();

            if (res.ok && Array.isArray(data.data)) {
              return data.data;
            } else {
              return [];
            }
          } catch (err) {
            return [];
          }
        });

        const batchResults = await Promise.all(batchPromises);
        batchResults.forEach(entries => allTimeEntries.push(...entries));
      }
    } else {
      // Normal user: Fetch only their own time entries
      const apiUrl = `https://api.clickup.com/api/v2/team/${teamId}/time_entries?subtasks=true&start_date=${startDate.getTime()}&assignee=${currentUserId}`;

      try {
        const res = await fetch(apiUrl, {
          headers: { Authorization: `Bearer ${token}` }
        });

        const data = await res.json();

        if (res.ok && Array.isArray(data.data)) {
          allTimeEntries.push(...data.data);
        }
      } catch (err) {
        // Handle error silently
      }
    }

    if (allTimeEntries.length === 0) {
      return NextResponse.json({
        data: [],
        runningTimers: [],
        message: "No time entries found"
      });
    }

    // Process all time entries
    const processedTimers = allTimeEntries.map(entry => {
      const fakeCheck = detectFakeTime(entry);
      const duration = Number(entry.duration || 0);
      const start = Number(entry.start);
      const isRunning = !entry.end || entry.end === null || entry.end === 0 || entry.end === '';
      const end = entry.end ? Number(entry.end) : Date.now();

      return {
        user: entry.user?.username || entry.user?.email || "Unknown",
        userId: entry.user?.id,
        taskId: entry.task?.id,
        taskName: entry.task?.name || "Unknown Task",
        taskUrl: entry.task?.url,
        listId: entry.task?.list?.id,
        listName: entry.task?.list?.name,
        folderId: entry.task?.folder?.id,
        folderName: entry.task?.folder?.name || "No Folder",
        spaceId: entry.task?.space?.id,
        spaceName: entry.task?.space?.name,
        startTime: start,
        endTime: end,
        duration: duration,
        status: isRunning ? "running" : "stopped",
        isFake: fakeCheck.isFake,
        isMobile: fakeCheck.isMobile,
        isDesktop: fakeCheck.isDesktop,
        isReal: fakeCheck.isReal,
        source: fakeCheck.source,
        deviceType: fakeCheck.deviceType,
        isRunning: isRunning,
        date: new Date(start).toISOString().split('T')[0],
        startFormatted: new Date(start).toLocaleString(),
        endFormatted: new Date(end).toLocaleString(),
      };
    });

    // Separate running and stopped timers
    const runningTimers = processedTimers.filter(t => t.isRunning);

    // Filter timers by type
    const fakeTimers = processedTimers.filter(t => t.isFake);
    const mobileTimers = processedTimers.filter(t => t.isMobile && !t.isFake);
    const desktopTimers = processedTimers.filter(t => t.isDesktop && !t.isFake);

    // Get unique users and folders for filters
    const uniqueUsers = [...new Set(processedTimers.map(t => JSON.stringify({ id: t.userId, name: t.user })))]
      .map(str => JSON.parse(str))
      .sort((a, b) => a.name.localeCompare(b.name));

    const uniqueFolders = [...new Set(processedTimers.map(t => JSON.stringify({
      id: t.folderId || 'no-folder',
      name: t.folderName
    })))]
      .map(str => JSON.parse(str))
      .sort((a, b) => a.name.localeCompare(b.name));

    // Calculate statistics
    const stats = {
      totalEntries: processedTimers.length,
      totalDuration: processedTimers.reduce((sum, t) => sum + t.duration, 0),
      totalHours: (processedTimers.reduce((sum, t) => sum + t.duration, 0) / (1000 * 60 * 60)).toFixed(2),
      uniqueUsers: uniqueUsers.length,
      fakeEntries: fakeTimers.length,
      mobileEntries: mobileTimers.length,
      desktopEntries: desktopTimers.length,
      realEntries: processedTimers.filter(t => t.isReal).length,
    };

    const totalTime = Date.now() - requestStartTime;

    return NextResponse.json({
      success: true,
      data: processedTimers,
      runningTimers: runningTimers,
      filters: {
        users: uniqueUsers,
        folders: uniqueFolders
      },
      stats: stats,
      dateRange: {
        start: startDate.toISOString(),
        end: now.toISOString(),
        days: days
      },
      meta: {
        processingTime: `${totalTime}ms`,
        userRole: isAdmin ? 'admin' : 'member'
      }
    });

  } catch (err) {
    const totalTime = Date.now() - requestStartTime;

    return NextResponse.json({
      error: err.message,
      stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
    }, { status: 500 });
  }
}