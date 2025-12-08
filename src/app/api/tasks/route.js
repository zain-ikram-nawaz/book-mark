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

  console.log("\n========== API REQUEST START ==========");
  console.log("Days param:", days);

  if (!token) {
    console.log("❌ No token provided");
    return NextResponse.json({ error: "Missing token" }, { status: 401 });
  }

  console.log("✅ Token received");

  try {
    // Fetch user's workspaces dynamically
    console.log("\n--- Fetching Workspaces ---");
    const workspacesRes = await fetch('https://api.clickup.com/api/v2/team', {
      headers: { Authorization: `Bearer ${token}` }
    });

    console.log("Workspaces API Status:", workspacesRes.status);

    if (!workspacesRes.ok) {
      const errorData = await workspacesRes.json();
      console.log("❌ Workspaces Error:", JSON.stringify(errorData, null, 2));
      return NextResponse.json({
        error: "Failed to fetch workspaces",
        details: errorData
      }, { status: workspacesRes.status });
    }

    const workspacesData = await workspacesRes.json();
    console.log("Workspaces Data:", JSON.stringify(workspacesData, null, 2));

    if (!workspacesData.teams || workspacesData.teams.length === 0) {
      console.log("❌ No workspaces found");
      return NextResponse.json({
        error: "No workspaces found for this user"
      }, { status: 404 });
    }

    // Select workspace with members (active workspace)
    const activeWorkspace = workspacesData.teams.find(team =>
      team.members && team.members.length > 0
    ) || workspacesData.teams[0];

    const teamId = activeWorkspace.id;
    console.log("✅ Selected Workspace:", activeWorkspace.name);
    console.log("✅ Team ID:", teamId);

    // Get current user info
    console.log("\n--- Fetching User Info ---");
    const userRes = await fetch('https://api.clickup.com/api/v2/user', {
      headers: { Authorization: `Bearer ${token}` }
    });

    console.log("User API Status:", userRes.status);

    const userData = await userRes.json();
    console.log("User Data:", JSON.stringify(userData, null, 2));

    const currentUserId = userData.user.id;
    console.log("✅ Current User ID:", currentUserId);
    console.log("✅ Current User Name:", userData.user.username || userData.user.email);

    // Calculate date range
    const now = new Date();
    const startDate = new Date();
    startDate.setDate(now.getDate() - days);
    startDate.setHours(0, 0, 0, 0);

    console.log("\n--- Date Range ---");
    console.log("Start Date:", startDate.toISOString());
    console.log("End Date:", now.toISOString());
    console.log("Start Timestamp:", startDate.getTime());

    // Fetch team members to check user role
    console.log("\n--- Fetching Team Members ---");
    const membersRes = await fetch(`https://api.clickup.com/api/v2/team/${teamId}`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    console.log("Members API Status:", membersRes.status);

    if (!membersRes.ok) {
      const errorData = await membersRes.json();
      console.log("❌ Members Error:", JSON.stringify(errorData, null, 2));
      return NextResponse.json({
        error: "Failed to fetch team members",
        details: errorData
      }, { status: membersRes.status });
    }

    const membersData = await membersRes.json();
    console.log("Members Count:", membersData.team?.members?.length || 0);

    const members = membersData.team?.members || [];

    // Check if current user is admin or owner
    const currentUserMember = members.find(m => m.user.id === currentUserId);
    console.log("\n--- User Role Check ---");
    console.log("Current User Member Data:", JSON.stringify(currentUserMember, null, 2));

    const isAdmin = currentUserMember && (
      currentUserMember.user.role === 'admin' ||
      currentUserMember.user.role === 'owner' ||
      currentUserMember.user.role === 2 ||
      currentUserMember.user.role === 1
    );

    const isGuest = !currentUserMember || currentUserMember.user.role === 3 || currentUserMember.user.role === 'guest';

    console.log("✅ Is Admin:", isAdmin);
    console.log("✅ Is Guest:", isGuest);
    console.log("User Role:", currentUserMember?.user?.role || 'guest');

    // Fetch time entries based on role
    const allTimeEntries = [];

    if (isAdmin) {
      console.log("\n--- ADMIN MODE: Fetching All Members' Time Entries ---");
      const memberBatchSize = 10;

      for (let i = 0; i < members.length; i += memberBatchSize) {
        const memberBatch = members.slice(i, i + memberBatchSize);
        console.log(`Processing batch ${Math.floor(i / memberBatchSize) + 1} (${memberBatch.length} members)`);

        const batchPromises = memberBatch.map(async (member) => {
          const userId = member.user.id;
          const username = member.user.username || member.user.email;
          const apiUrl = `https://api.clickup.com/api/v2/team/${teamId}/time_entries?subtasks=true&start_date=${startDate.getTime()}&assignee=${userId}`;

          console.log(`  Fetching for user: ${username} (ID: ${userId})`);

          try {
            const res = await fetch(apiUrl, {
              headers: { Authorization: `Bearer ${token}` }
            });

            const data = await res.json();

            if (res.ok && Array.isArray(data.data)) {
              console.log(`  ✅ ${username}: ${data.data.length} entries`);
              return data.data;
            } else {
              console.log(`  ❌ ${username}: Failed -`, JSON.stringify(data, null, 2));
              return [];
            }
          } catch (err) {
            console.log(`  ❌ ${username}: Error -`, err.message);
            return [];
          }
        });

        const batchResults = await Promise.all(batchPromises);
        batchResults.forEach(entries => allTimeEntries.push(...entries));
      }

      console.log(`\n✅ Total entries fetched (Admin): ${allTimeEntries.length}`);

    } else {
      console.log("\n--- NORMAL/GUEST USER MODE: Fetching Own Time Entries ---");

      // ✅ Approach 1: Try direct assignee query
      console.log("\n🔍 Attempt 1: Direct assignee query");
      const apiUrl1 = `https://api.clickup.com/api/v2/team/${teamId}/time_entries?assignee=${currentUserId}&start_date=${startDate.getTime()}`;
      console.log("API URL:", apiUrl1);

      try {
        const res = await fetch(apiUrl1, {
          headers: { Authorization: `Bearer ${token}` }
        });

        console.log("Response Status:", res.status);
        const data = await res.json();
        console.log("Response Data:", JSON.stringify(data, null, 2));

        if (res.ok && Array.isArray(data.data)) {
          console.log(`✅ Entries found: ${data.data.length}`);
          allTimeEntries.push(...data.data);
        } else {
          console.log("❌ No data or error in response");
        }
      } catch (err) {
        console.log("❌ Fetch Error:", err.message);
      }

      // ✅ Approach 2: If no data, try fetching from accessible spaces
      if (allTimeEntries.length === 0) {
        console.log("\n🔍 Attempt 2: Fetching from accessible spaces");

        try {
          const spacesRes = await fetch(`https://api.clickup.com/api/v2/team/${teamId}/space?archived=false`, {
            headers: { Authorization: `Bearer ${token}` }
          });

          console.log("Spaces API Status:", spacesRes.status);
          const spacesData = await spacesRes.json();
          console.log("Accessible Spaces Count:", spacesData.spaces?.length || 0);

          if (spacesData.spaces && spacesData.spaces.length > 0) {
            console.log(`✅ Found ${spacesData.spaces.length} accessible spaces`);

            // Fetch time entries from each space
            for (const space of spacesData.spaces) {
              console.log(`  Fetching from space: ${space.name} (ID: ${space.id})`);

              const spaceTimeUrl = `https://api.clickup.com/api/v2/team/${teamId}/time_entries?space_id=${space.id}&assignee=${currentUserId}&start_date=${startDate.getTime()}`;

              try {
                const res = await fetch(spaceTimeUrl, {
                  headers: { Authorization: `Bearer ${token}` }
                });

                const data = await res.json();
                console.log(`  Space "${space.name}": Status ${res.status}, Entries: ${data.data?.length || 0}`);

                if (res.ok && Array.isArray(data.data)) {
                  allTimeEntries.push(...data.data);
                }
              } catch (err) {
                console.log(`  ❌ Error fetching from space ${space.name}:`, err.message);
              }
            }
          } else {
            console.log("❌ No accessible spaces found");
          }
        } catch (err) {
          console.log("❌ Error fetching spaces:", err.message);
        }
      }

      console.log(`\n✅ Total entries fetched (Normal/Guest User): ${allTimeEntries.length}`);
    }

    if (allTimeEntries.length === 0) {
      console.log("\n⚠️ No time entries found - returning empty response");
      return NextResponse.json({
        data: [],
        runningTimers: [],
        message: "No time entries found",
        debug: {
          userId: currentUserId,
          teamId: teamId,
          isAdmin: isAdmin,
          isGuest: isGuest,
          dateRange: {
            start: startDate.toISOString(),
            end: now.toISOString()
          }
        }
      });
    }

    console.log("\n--- Processing Time Entries ---");

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

    console.log(`✅ Processed ${processedTimers.length} timers`);

    // Separate running and stopped timers
    const runningTimers = processedTimers.filter(t => t.isRunning);
    console.log(`Running timers: ${runningTimers.length}`);

    // Filter timers by type
    const fakeTimers = processedTimers.filter(t => t.isFake);
    const mobileTimers = processedTimers.filter(t => t.isMobile && !t.isFake);
    const desktopTimers = processedTimers.filter(t => t.isDesktop && !t.isFake);

    console.log(`Fake timers: ${fakeTimers.length}`);
    console.log(`Mobile timers: ${mobileTimers.length}`);
    console.log(`Desktop timers: ${desktopTimers.length}`);

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

    console.log(`Unique users: ${uniqueUsers.length}`);
    console.log(`Unique folders: ${uniqueFolders.length}`);

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

    console.log("\n--- Final Stats ---");
    console.log(JSON.stringify(stats, null, 2));
    console.log(`\n⏱️  Total processing time: ${totalTime}ms`);
    console.log("========== API REQUEST END ==========\n");

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
        userRole: isAdmin ? 'admin' : (isGuest ? 'guest' : 'member')
      }
    });

  } catch (err) {
    const totalTime = Date.now() - requestStartTime;

    console.log("\n❌❌❌ ERROR ❌❌❌");
    console.log("Error message:", err.message);
    console.log("Error stack:", err.stack);
    console.log(`Failed after: ${totalTime}ms`);
    console.log("========== API REQUEST END (ERROR) ==========\n");

    return NextResponse.json({
      error: err.message,
      stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
    }, { status: 500 });
  }
}