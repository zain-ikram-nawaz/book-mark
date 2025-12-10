import { NextResponse } from "next/server";

export async function GET(request) {
  const requestStartTime = Date.now();

  const authHeader = request.headers.get("Authorization");
  const token = authHeader?.split(" ")[1];

  const { searchParams } = new URL(request.url);
  const weeksBack = parseInt(searchParams.get("weeks") || "0");

  console.log(`\n${'='.repeat(60)}`);
  console.log(`📊 TEAM WORKLOAD ANALYSIS (OPTIMIZED V2)`);
  console.log(`${'='.repeat(60)}`);

  if (!token) {
    return NextResponse.json({ error: "Missing token" }, { status: 401 });
  }

  try {
    // Fetch user's workspaces dynamically
    console.log("\n--- Fetching Workspaces ---");
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

    // Use first workspace
    const teamId = workspacesData.teams[0].id;
    const selectedWorkspace = workspacesData.teams[0];

    console.log(`✅ Using workspace: ${selectedWorkspace.name} (ID: ${teamId})`);

    // Get current user info
    const userRes = await fetch('https://api.clickup.com/api/v2/user', {
      headers: { Authorization: `Bearer ${token}` }
    });

    const userData = await userRes.json();
    const currentUserId = userData.user.id;
    console.log("✅ Current User ID:", currentUserId);
    console.log("✅ Current User Name:", userData.user.username || userData.user.email);

    // Calculate week range
    const now = new Date();
    const currentDay = now.getDay();
    const daysToMonday = currentDay === 0 ? 6 : currentDay - 1;

    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - daysToMonday - (weeksBack * 7));
    weekStart.setHours(0, 0, 0, 0);

    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);
    weekEnd.setHours(23, 59, 59, 999);

    console.log(`📅 Week: ${weekStart.toLocaleDateString()} to ${weekEnd.toLocaleDateString()}`);

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
      console.log(`✅ Found ${members.length} team members`);

      if (members.length > 0) {
        const currentUserMember = members.find(m => m.user.id === currentUserId);

        isAdmin = currentUserMember && (
          currentUserMember.user.role === 'admin' ||
          currentUserMember.user.role === 'owner' ||
          currentUserMember.user.role === 2 ||
          currentUserMember.user.role === 1
        );

        isGuest = !currentUserMember || currentUserMember.user.role === 3 || currentUserMember.user.role === 'guest';

        console.log("✅ Is Admin:", isAdmin);
        console.log("✅ Is Guest:", isGuest);
      } else {
        console.log("⚠️ No members returned - assuming guest user");
      }
    }

    // ✅ Determine which users to process
    let usersToProcess = [];

    if (isAdmin && members.length > 0) {
      console.log("\n--- ADMIN MODE: Processing All Members ---");
      usersToProcess = members;
    } else {
      console.log("\n--- NORMAL/GUEST USER MODE: Processing Own Data Only ---");
      usersToProcess = [{
        user: {
          id: currentUserId,
          username: userData.user.username,
          email: userData.user.email,
          profilePicture: userData.user.profilePicture
        }
      }];
    }

    console.log(`Processing ${usersToProcess.length} user(s)`);

    // ✅ STEP 1: Fetch time entries for selected users in parallel
    console.log(`\n⚡ Fetching time entries...`);

    const timeEntriesPromises = usersToProcess.map(async (member) => {
      const userId = member.user.id;
      const username = member.user.username || member.user.email;

      try {
        const timeUrl = `https://api.clickup.com/api/v2/team/${teamId}/time_entries?start_date=${weekStart.getTime()}&end_date=${weekEnd.getTime()}&assignee=${userId}`;

        const timeRes = await fetch(timeUrl, {
          headers: { Authorization: `Bearer ${token}` }
        });

        if (timeRes.ok) {
          const timeData = await timeRes.json();
          const entries = timeData.data || [];
          console.log(`  ✓ ${username}: ${entries.length} time entries`);
          return { userId, entries };
        } else {
          console.log(`  ✗ ${username}: Failed to fetch time entries`);
          return { userId, entries: [] };
        }
      } catch (err) {
        console.error(`  ✗ ${username}: ${err.message}`);
        return { userId, entries: [] };
      }
    });

    const timeEntriesResults = await Promise.all(timeEntriesPromises);

    // Group time entries by user
    const timeEntriesByUser = {};
    timeEntriesResults.forEach(result => {
      timeEntriesByUser[result.userId] = result.entries;
    });

    const totalTimeEntries = timeEntriesResults.reduce((sum, r) => sum + r.entries.length, 0);
    console.log(`✅ Total time entries fetched: ${totalTimeEntries}`);

    // ✅ STEP 2: Fetch tasks based on user role
    let allTasks = [];

    if (isAdmin && members.length > 0) {
      console.log(`\n⚡ ADMIN MODE: Fetching all tasks from all lists...`);

      // Get all spaces
      const spacesRes = await fetch(`https://api.clickup.com/api/v2/team/${teamId}/space?archived=false`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      let allLists = [];

      if (spacesRes.ok) {
        const spacesData = await spacesRes.json();
        const spaces = spacesData.spaces || [];
        console.log(`✅ Found ${spaces.length} spaces`);

        // Fetch all folders and lists in parallel
        const spacePromises = spaces.map(async (space) => {
          const lists = [];

          // Get folderless lists
          try {
            const folderlessRes = await fetch(`https://api.clickup.com/api/v2/space/${space.id}/list?archived=false`, {
              headers: { Authorization: `Bearer ${token}` }
            });
            if (folderlessRes.ok) {
              const folderlessData = await folderlessRes.json();
              lists.push(...(folderlessData.lists || []));
            }
          } catch (err) {
            console.error(`Error fetching folderless lists for space ${space.id}:`, err.message);
          }

          // Get folders
          try {
            const foldersRes = await fetch(`https://api.clickup.com/api/v2/space/${space.id}/folder?archived=false`, {
              headers: { Authorization: `Bearer ${token}` }
            });

            if (foldersRes.ok) {
              const foldersData = await foldersRes.json();
              const folders = foldersData.folders || [];

              // Get lists from all folders in parallel
              const folderListPromises = folders.map(async (folder) => {
                try {
                  const listsRes = await fetch(`https://api.clickup.com/api/v2/folder/${folder.id}/list?archived=false`, {
                    headers: { Authorization: `Bearer ${token}` }
                  });
                  if (listsRes.ok) {
                    const listsData = await listsRes.json();
                    return listsData.lists || [];
                  }
                } catch (err) {
                  console.error(`Error fetching lists for folder ${folder.id}:`, err.message);
                }
                return [];
              });

              const folderLists = await Promise.all(folderListPromises);
              folderLists.forEach(listArray => lists.push(...listArray));
            }
          } catch (err) {
            console.error(`Error fetching folders for space ${space.id}:`, err.message);
          }

          return lists;
        });

        const spaceLists = await Promise.all(spacePromises);
        spaceLists.forEach(lists => allLists.push(...lists));

        console.log(`✅ Found ${allLists.length} total lists`);

        // Fetch tasks for all lists in parallel batches
        const BATCH_SIZE = 15;

        for (let i = 0; i < allLists.length; i += BATCH_SIZE) {
          const batch = allLists.slice(i, i + BATCH_SIZE);

          const batchPromises = batch.map(async (list) => {
            try {
              const tasksRes = await fetch(
                `https://api.clickup.com/api/v2/list/${list.id}/task?archived=false&date_created_gt=${weekStart.getTime()}&date_created_lt=${weekEnd.getTime()}&include_closed=true`,
                { headers: { Authorization: `Bearer ${token}` } }
              );

              if (tasksRes.ok) {
                const tasksData = await tasksRes.json();
                return tasksData.tasks || [];
              }
            } catch (err) {
              console.error(`Error fetching tasks for list ${list.id}:`, err.message);
            }
            return [];
          });

          const batchResults = await Promise.all(batchPromises);
          batchResults.forEach(tasks => allTasks.push(...tasks));

          console.log(`  Progress: ${Math.min(i + BATCH_SIZE, allLists.length)}/${allLists.length} lists processed`);
        }
      }

    } else {
      console.log(`\n⚡ NORMAL/GUEST MODE: Fetching user's assigned tasks...`);

      // ✅ Use ClickUp's assigned tasks endpoint for normal users
      try {
        const tasksUrl = `https://api.clickup.com/api/v2/team/${teamId}/task?assignees[]=${currentUserId}&date_created_gt=${weekStart.getTime()}&date_created_lt=${weekEnd.getTime()}&include_closed=true`;

        console.log("Fetching tasks URL:", tasksUrl);

        const tasksRes = await fetch(tasksUrl, {
          headers: { Authorization: `Bearer ${token}` }
        });

        console.log("Tasks API Status:", tasksRes.status);

        if (tasksRes.ok) {
          const tasksData = await tasksRes.json();
          allTasks = tasksData.tasks || [];
          console.log(`✅ Found ${allTasks.length} assigned tasks for current user`);
        } else {
          const errorData = await tasksRes.json();
          console.log("❌ Tasks API Error:", JSON.stringify(errorData, null, 2));
        }
      } catch (err) {
        console.error("❌ Error fetching user tasks:", err.message);
      }
    }

    console.log(`✅ Fetched ${allTasks.length} total tasks`);

    // ✅ STEP 3: Group tasks by assignee (filter for selected users only)
    const tasksByUser = {};
    const userIdsToProcess = new Set(usersToProcess.map(m => m.user.id));

    allTasks.forEach(task => {
      const assignees = task.assignees || [];
      assignees.forEach(assignee => {
        const userId = assignee.id;

        // Only process tasks for selected users
        if (!userIdsToProcess.has(userId)) return;

        if (!tasksByUser[userId]) {
          tasksByUser[userId] = {
            total: 0,
            completed: 0
          };
        }
        tasksByUser[userId].total++;

        const status = (task.status?.status || '').toLowerCase();
        if (status === 'closed' || status === 'complete' || status === 'completed') {
          tasksByUser[userId].completed++;
        }
      });
    });

    // ✅ STEP 4: Calculate workload for selected users
    console.log(`\n⚡ Calculating workload metrics...`);
    const workloadData = [];
    const WEEKLY_HOURS_TARGET = 48;
    const WEEKLY_MS_TARGET = WEEKLY_HOURS_TARGET * 60 * 60 * 1000;

    usersToProcess.forEach(member => {
      const userId = member.user.id;
      const username = member.user.username || member.user.email;
      const profilePicture = member.user.profilePicture;

      // Get time entries for this user
      const userTimeEntries = timeEntriesByUser[userId] || [];
      const totalTrackedTime = userTimeEntries.reduce((sum, entry) => {
        return sum + (Number(entry.duration || 0));
      }, 0);

      // Get tasks for this user
      const userTasks = tasksByUser[userId] || { total: 0, completed: 0 };

      // Calculate metrics
      const trackedHours = totalTrackedTime / (1000 * 60 * 60);
      const utilizationPercent = (totalTrackedTime / WEEKLY_MS_TARGET) * 100;
      const remainingHours = WEEKLY_HOURS_TARGET - trackedHours;
      const isOverloaded = trackedHours > WEEKLY_HOURS_TARGET;
      const isUnderUtilized = trackedHours < (WEEKLY_HOURS_TARGET * 0.7);

      console.log(`  👤 ${username}: ${trackedHours.toFixed(2)}h (${utilizationPercent.toFixed(1)}%) | Tasks: ${userTasks.total} (${userTasks.completed} done)`);

      workloadData.push({
        userId,
        username,
        profilePicture,
        email: member.user.email,
        metrics: {
          totalTasks: userTasks.total,
          completedTasks: userTasks.completed,
          pendingTasks: userTasks.total - userTasks.completed,
          completionRate: userTasks.total > 0 ? ((userTasks.completed / userTasks.total) * 100).toFixed(1) : 0,
          trackedTimeMs: totalTrackedTime,
          trackedHours: trackedHours.toFixed(2),
          targetHours: WEEKLY_HOURS_TARGET,
          remainingHours: remainingHours.toFixed(2),
          utilizationPercent: utilizationPercent.toFixed(1),
          isOverloaded,
          isUnderUtilized,
          status: isOverloaded ? 'overloaded' : isUnderUtilized ? 'underutilized' : 'optimal'
        }
      });
    });

    // Sort by utilization (highest first)
    workloadData.sort((a, b) => b.metrics.utilizationPercent - a.metrics.utilizationPercent);

    // Calculate team statistics
    const teamStats = {
      totalMembers: workloadData.length,
      totalTasks: workloadData.reduce((sum, m) => sum + m.metrics.totalTasks, 0),
      totalCompletedTasks: workloadData.reduce((sum, m) => sum + m.metrics.completedTasks, 0),
      totalTrackedHours: workloadData.reduce((sum, m) => sum + parseFloat(m.metrics.trackedHours), 0).toFixed(2),
      totalTargetHours: workloadData.length * WEEKLY_HOURS_TARGET,
      averageUtilization: workloadData.length > 0 ? (workloadData.reduce((sum, m) => sum + parseFloat(m.metrics.utilizationPercent), 0) / workloadData.length).toFixed(1) : 0,
      overloadedMembers: workloadData.filter(m => m.metrics.isOverloaded).length,
      underUtilizedMembers: workloadData.filter(m => m.metrics.isUnderUtilized).length,
      optimalMembers: workloadData.filter(m => m.metrics.status === 'optimal').length
    };

    const totalTime = Date.now() - requestStartTime;
    console.log(`\n⏱️  TOTAL REQUEST TIME: ${totalTime}ms (${(totalTime/1000).toFixed(2)}s)`);
    console.log(`${'='.repeat(60)}\n`);

      return NextResponse.json({
      success: true,
      data: workloadData,
      teamStats,
      weekRange: {
        start: weekStart.toISOString(),
        end: weekEnd.toISOString(),
        weekNumber: getWeekNumber(weekStart),
        year: weekStart.getFullYear()
      },
      meta: {
        processingTime: `${totalTime}ms`,
        targetWeeklyHours: WEEKLY_HOURS_TARGET,
        totalTimeEntries: totalTimeEntries,
        totalTasks: allTasks.length,
        userRole: isAdmin ? 'admin' : (isGuest ? 'guest' : 'member'),
        workspace: selectedWorkspace.name
      }
    });

  } catch (err) {
    console.error('❌ Error in workload API:', err);
    const totalTime = Date.now() - requestStartTime;
    console.log(`\n⏱️  Failed after: ${totalTime}ms`);

    return NextResponse.json({
      error: err.message,
      stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
    }, { status: 500 });
  }
}

function getWeekNumber(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum); // ✅ FIXED
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}