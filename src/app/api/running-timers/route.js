// import { NextResponse } from "next/server";

// export async function GET(request) {
//   const authHeader = request.headers.get("Authorization");
//   const token = authHeader?.split(" ")[1];
//   const teamId = process.env.TEAM_ID;

//   if (!token) return NextResponse.json({ error: "Missing token" }, { status: 401 });
//   if (!teamId) return NextResponse.json({ error: "TEAM_ID missing" }, { status: 500 });

//   try {
//     console.log('🔍 Fetching currently running timers...');

//     // Fetch team members
//     const membersRes = await fetch(`https://api.clickup.com/api/v2/team/${teamId}`, {
//       headers: { Authorization: `Bearer ${token}` }
//     });

//     const membersData = await membersRes.json();
//     const members = membersData.team?.members || [];

//     console.log(`👥 Found ${members.length} team members`);

//     const runningTimers = [];

//     // Check each member for running timers
//     for (const m of members) {
//       const userId = m.user.id;

//       try {
//         // Use the specific endpoint for running timers
//         const res = await fetch(
//           `https://api.clickup.com/api/v2/team/${teamId}/time_entries/current?assignee=${userId}`,
//           { headers: { Authorization: `Bearer ${token}` } }
//         );

//         const data = await res.json();

//         // Check if this user has a running timer
//         if (data.data && !data.data.error) {
//           console.log(`  ✅ RUNNING TIMER FOUND for ${m.user.username}!`);

//           // Fetch task details
//           const taskId = data.data.task?.id;
//           let taskDetails = null;

//           if (taskId) {
//             try {
//               const taskRes = await fetch(
//                 `https://api.clickup.com/api/v2/task/${taskId}`,
//                 { headers: { Authorization: `Bearer ${token}` } }
//               );

//               if (taskRes.ok) {
//                 taskDetails = await taskRes.json();
//               }
//             } catch (e) {
//               console.error(`Error fetching task ${taskId}:`, e.message);
//             }
//           }

//           runningTimers.push({
//             user: m.user.username || m.user.email,
//             userId: userId,
//             userInitials: m.user.initials || "?",
//             userProfilePicture: m.user.profilePicture || null,
//             taskId: taskId,
//             taskName: data.data.task?.name || taskDetails?.name || "Unknown Task",
//             taskUrl: data.data.task?.url || taskDetails?.url,
//             listId: taskDetails?.list?.id,
//             listName: taskDetails?.list?.name,
//             folderId: taskDetails?.folder?.id,
//             folderName: taskDetails?.folder?.name || "No Folder",
//             startTime: Number(data.data.start),
//             startFormatted: new Date(Number(data.data.start)).toLocaleString(),
//             startTimeShort: new Date(Number(data.data.start)).toLocaleTimeString(),
//             status: "running",
//             isRunning: true,
//             source: data.data.source || "unknown",
//             isFake: (data.data.source || "").toLowerCase() === "clickup",
//             billable: data.data.billable || false,
//             description: data.data.description || ""
//           });
//         }
//       } catch (err) {
//         console.error(`Error checking running timer for user ${userId}:`, err.message);
//       }
//     }

//     console.log(`🏃 Total running timers found: ${runningTimers.length}`);

//     return NextResponse.json({
//       success: true,
//       runningTimers: runningTimers,
//       stats: {
//         totalRunning: runningTimers.length,
//         activeUsers: runningTimers.length,
//         totalActiveTime: runningTimers.reduce((sum, t) => sum + (Date.now() - t.startTime), 0)
//       },
//       meta: {
//         totalMembers: members.length,
//         timestamp: new Date().toISOString()
//       }
//     });

//   } catch (err) {
//     console.error('❌ Error in running-timers API:', err);
//     return NextResponse.json({ error: err.message }, { status: 500 });
//   }
// }

import { NextResponse } from "next/server";

export async function GET(request) {
  const authHeader = request.headers.get("Authorization");
  const token = authHeader?.split(" ")[1];

  if (!token) return NextResponse.json({ error: "Missing token" }, { status: 401 });

  try {
    console.log('🔍 Fetching currently running timers...');

    // Fetch workspaces first
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
    console.log('🏢 Team ID:', teamId);

    // Fetch current user info
    const userRes = await fetch('https://api.clickup.com/api/v2/user', {
      headers: { Authorization: `Bearer ${token}` }
    });
    const userData = await userRes.json();
    const currentUserId = userData.user.id;

    console.log('👤 Current User ID:', currentUserId);
    console.log('👤 Current User:', userData.user.username);

    // Fetch team members
    const membersRes = await fetch(`https://api.clickup.com/api/v2/team/${teamId}`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    let members = [];
    let isAdmin = false;
    let isGuest = true;

    if (membersRes.ok) {
      const membersData = await membersRes.json();
      members = membersData.team?.members || [];

      console.log(`👥 Found ${members.length} team members`);

      if (members.length > 0) {
        const currentUserMember = members.find(m => m.user.id === currentUserId);

        console.log('🔍 Current user in members?', currentUserMember ? 'YES' : 'NO');
        if (currentUserMember) {
          console.log('🔍 User role:', currentUserMember.user.role);
        }

        isAdmin = currentUserMember && (
          currentUserMember.user.role === 'admin' ||
          currentUserMember.user.role === 'owner' ||
          currentUserMember.user.role === 2 ||
          currentUserMember.user.role === 1
        );

        isGuest = !currentUserMember || currentUserMember.user.role === 3 || currentUserMember.user.role === 'guest';
      }
    }

    console.log('🔐 Is Admin?', isAdmin);
    console.log('🔐 Is Guest?', isGuest);

    const runningTimers = [];

    if (isAdmin && members.length > 0) {
      console.log('✅ ADMIN MODE: Checking all members...');

      // Admin: Check all members
      for (const m of members) {
        const userId = m.user.id;
        console.log(`  Checking user: ${m.user.username} (${userId})`);

        try {
          const res = await fetch(
            `https://api.clickup.com/api/v2/team/${teamId}/time_entries/current?assignee=${userId}`,
            { headers: { Authorization: `Bearer ${token}` } }
          );

          const data = await res.json();
          console.log(`    Response:`, data.data ? '✅ Timer found' : '❌ No timer');

          if (data.data && !data.data.error) {
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
    } else {
      console.log('✅ NORMAL USER MODE: Checking only current user...');
      console.log(`  Checking user ID: ${currentUserId}`);

      // Normal user: Try multiple approaches
      let timerFound = false;

      // Approach 1: Direct current timer endpoint (without assignee)
      try {
        console.log('  📍 Trying: Direct current timer endpoint...');
        const res = await fetch(
          `https://api.clickup.com/api/v2/team/${teamId}/time_entries/current`,
          { headers: { Authorization: `Bearer ${token}` } }
        );

        console.log('  Response status:', res.status);
        const data = await res.json();
        console.log('  Response data:', JSON.stringify(data, null, 2));

        if (data.data && !data.data.error) {
          console.log('  ✅ RUNNING TIMER FOUND (Direct)!');
          timerFound = true;

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
            user: userData.user.username || userData.user.email,
            userId: currentUserId,
            userInitials: userData.user.initials || "?",
            userProfilePicture: userData.user.profilePicture || null,
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
        console.error(`  ❌ Error with direct endpoint:`, err.message);
      }

      // Approach 2: If not found, try with assignee parameter
      if (!timerFound) {
        try {
          console.log('  📍 Trying: With assignee parameter...');
          const apiUrl = `https://api.clickup.com/api/v2/team/${teamId}/time_entries/current?assignee=${currentUserId}`;
          console.log('  API URL:', apiUrl);

          const res = await fetch(apiUrl, {
            headers: { Authorization: `Bearer ${token}` }
          });

          console.log('  Response status:', res.status);
          const data = await res.json();
          console.log('  Response data:', JSON.stringify(data, null, 2));

          if (data.data && !data.data.error) {
            console.log('  ✅ RUNNING TIMER FOUND (With assignee)!');

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
              user: userData.user.username || userData.user.email,
              userId: currentUserId,
              userInitials: userData.user.initials || "?",
              userProfilePicture: userData.user.profilePicture || null,
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
          } else {
            console.log('  ❌ No running timer found');
          }
        } catch (err) {
          console.error(`  ❌ Error with assignee parameter:`, err.message);
        }
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
        timestamp: new Date().toISOString(),
        userRole: isAdmin ? 'admin' : (isGuest ? 'guest' : 'member'),
        isAdmin: isAdmin,
        currentUserId: currentUserId
      }
    });

  } catch (err) {
    console.error('❌ Error in running-timers API:', err);
    return NextResponse.json({ error: err.message, stack: err.stack }, { status: 500 });
  }
}