import { NextResponse } from "next/server";

export async function GET(request) {
  const requestStartTime = Date.now();

  const authHeader = request.headers.get("Authorization");
  const token = authHeader?.split(" ")[1];

  const { searchParams } = new URL(request.url);
  const weeksBack = parseInt(searchParams.get("weeks") || "0");

  console.log(`\n${'='.repeat(60)}`);
  console.log(`📊 TEAM WORKLOAD ANALYSIS (FIXED V4)`);
  console.log(`${'='.repeat(60)}`);

  if (!token) {
    return NextResponse.json({ error: "Missing token" }, { status: 401 });
  }

  try {
    // Fetch user's workspaces dynamically
    console.log("\n--- Fetching Workspaces ---");
    const workspacesRes = await fetch('https://api.clickup.com/api/v2/team', {
      headers: { Authorization: token }
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
      headers: { Authorization: token }
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
    console.log(`📅 Week Start Timestamp: ${weekStart.getTime()}`);
    console.log(`📅 Week End Timestamp: ${weekEnd.getTime()}`);

    // Fetch team members
    const membersRes = await fetch(`https://api.clickup.com/api/v2/team/${teamId}`, {
      headers: { Authorization: token }
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

    // Determine which users to process
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

    // STEP 1: Fetch time entries for selected users in parallel
    console.log(`\n⚡ Fetching time entries...`);

    const timeEntriesPromises = usersToProcess.map(async (member) => {
      const userId = member.user.id;
      const username = member.user.username || member.user.email;

      try {
        const timeUrl = `https://api.clickup.com/api/v2/team/${teamId}/time_entries?start_date=${weekStart.getTime()}&end_date=${weekEnd.getTime()}&assignee=${userId}`;

        console.log(`Fetching time entries for ${username}: ${timeUrl}`);

        const timeRes = await fetch(timeUrl, {
          headers: { Authorization: token }
        });

        if (timeRes.ok) {
          const timeData = await timeRes.json();
          const entries = timeData.data || [];

          console.log(`  ✓ ${username}: ${entries.length} time entries`);

          // Debug: Log first entry details
          if (entries.length > 0) {
            console.log(`    First entry start: ${new Date(parseInt(entries[0].start)).toISOString()}`);
            console.log(`    First entry duration: ${entries[0].duration}ms`);
            console.log(`    First entry task:`, entries[0].task?.name || 'No task');
          }

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

    // STEP 2: Fetch tasks based on user role
    let allTasks = [];

    if (isAdmin && members.length > 0) {
      console.log(`\n⚡ ADMIN MODE: Fetching all tasks from all lists...`);

      // Get all spaces
      const spacesRes = await fetch(`https://api.clickup.com/api/v2/team/${teamId}/space?archived=false`, {
        headers: { Authorization: token }
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
              headers: { Authorization: token }
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
              headers: { Authorization: token }
            });

            if (foldersRes.ok) {
              const foldersData = await foldersRes.json();
              const folders = foldersData.folders || [];

              // Get lists from all folders in parallel
              const folderListPromises = folders.map(async (folder) => {
                try {
                  const listsRes = await fetch(`https://api.clickup.com/api/v2/folder/${folder.id}/list?archived=false`, {
                    headers: { Authorization: token }
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
                { headers: { Authorization: token } }
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
      console.log(`\n⚡ NORMAL/GUEST USER MODE: Fetching user's assigned tasks...`);

      try {
        const tasksUrl = `https://api.clickup.com/api/v2/team/${teamId}/task?assignees[]=${currentUserId}&date_created_gt=${weekStart.getTime()}&date_created_lt=${weekEnd.getTime()}&include_closed=true`;

        const tasksRes = await fetch(tasksUrl, {
          headers: { Authorization: token }
        });

        if (tasksRes.ok) {
          const tasksData = await tasksRes.json();
          allTasks = tasksData.tasks || [];
          console.log(`✅ Found ${allTasks.length} assigned tasks for current user`);
        }
      } catch (err) {
        console.error("❌ Error fetching user tasks:", err.message);
      }
    }

    console.log(`✅ Fetched ${allTasks.length} total tasks`);

    // STEP 3: Fetch future tasks for each user
    console.log(`\n⚡ Fetching future tasks...`);

    const futureTasksPromises = usersToProcess.map(async (member) => {
      const userId = member.user.id;

      try {
        const futureTasksUrl = `https://api.clickup.com/api/v2/team/${teamId}/task?assignees[]=${userId}&due_date_gt=${Date.now()}&include_closed=false`;

        const futureRes = await fetch(futureTasksUrl, {
          headers: { Authorization: token }
        });

        if (futureRes.ok) {
          const futureData = await futureRes.json();
          return { userId, tasks: futureData.tasks || [] };
        }
      } catch (err) {
        console.error(`Error fetching future tasks for user ${userId}:`, err.message);
      }
      return { userId, tasks: [] };
    });

    const futureTasksResults = await Promise.all(futureTasksPromises);
    const futureTasksByUser = {};
    futureTasksResults.forEach(result => {
      futureTasksByUser[result.userId] = result.tasks;
    });

    console.log(`✅ Fetched future tasks for ${futureTasksResults.length} users`);

    // STEP 4: Group tasks by assignee
    const tasksByUser = {};
    const userIdsToProcess = new Set(usersToProcess.map(m => m.user.id));

    allTasks.forEach(task => {
      const assignees = task.assignees || [];
      assignees.forEach(assignee => {
        const userId = assignee.id;

        if (!userIdsToProcess.has(userId)) return;

        if (!tasksByUser[userId]) {
          tasksByUser[userId] = [];
        }
        tasksByUser[userId].push(task);
      });
    });

    // STEP 5: Calculate workload for selected users
    console.log(`\n⚡ Calculating workload metrics...`);
    const workloadData = [];
    const WEEKLY_HOURS_TARGET = 48;
    const DAILY_HOURS_TARGET = 8;
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
      const userTasks = tasksByUser[userId] || [];
      const completedTasks = userTasks.filter(t => {
        const status = (t.status?.status || '').toLowerCase();
        return status === 'closed' || status === 'complete' || status === 'completed';
      });

      // Get future tasks
      const futureTasks = futureTasksByUser[userId] || [];

      // Calculate daily breakdown
      const dailyBreakdown = calculateDailyBreakdown(userTimeEntries, weekStart, weekEnd, DAILY_HOURS_TARGET);

      // Calculate time by project
      const timeByProject = calculateTimeByProject(userTimeEntries);

      // Calculate tasks by status
      const tasksByStatus = calculateTasksByStatus(userTasks);

      // Calculate tasks by priority
      const tasksByPriority = calculateTasksByPriority(userTasks);

      // Calculate overdue tasks
      const overdueTasks = userTasks.filter(t =>
        t.due_date &&
        parseInt(t.due_date) < Date.now() &&
        !['closed', 'complete', 'completed'].includes((t.status?.status || '').toLowerCase())
      );

      // Calculate upcoming tasks breakdown
      const nextWeekEnd = new Date(weekEnd.getTime() + 7*24*60*60*1000);
      const upcomingThisWeek = futureTasks.filter(t =>
        t.due_date && new Date(parseInt(t.due_date)) <= weekEnd
      );
      const upcomingNextWeek = futureTasks.filter(t => {
        if (!t.due_date) return false;
        const due = new Date(parseInt(t.due_date));
        return due > weekEnd && due <= nextWeekEnd;
      });

      // Calculate estimate accuracy
      const totalEstimatedMs = userTasks.reduce((sum, t) => sum + (parseInt(t.time_estimate) || 0), 0);
      const estimateVariance = totalEstimatedMs > 0
        ? ((totalTrackedTime - totalEstimatedMs) / totalEstimatedMs * 100).toFixed(1)
        : 0;

      // Calculate metrics
      const trackedHours = totalTrackedTime / (1000 * 60 * 60);
      const utilizationPercent = (totalTrackedTime / WEEKLY_MS_TARGET) * 100;
      const remainingHours = WEEKLY_HOURS_TARGET - trackedHours;
      const isOverloaded = trackedHours > WEEKLY_HOURS_TARGET;
      const isUnderUtilized = trackedHours < (WEEKLY_HOURS_TARGET * 0.7);

      console.log(`  👤 ${username}: ${trackedHours.toFixed(2)}h (${utilizationPercent.toFixed(1)}%) | Tasks: ${userTasks.length} (${completedTasks.length} done)`);

      workloadData.push({
        userId,
        username,
        profilePicture,
        email: member.user.email,

        // Weekly metrics
        weeklyMetrics: {
          totalTasks: userTasks.length,
          completedTasks: completedTasks.length,
          pendingTasks: userTasks.length - completedTasks.length,
          completionRate: userTasks.length > 0 ? ((completedTasks.length / userTasks.length) * 100).toFixed(1) : 0,
          trackedTimeMs: totalTrackedTime,
          trackedHours: trackedHours.toFixed(2),
          targetHours: WEEKLY_HOURS_TARGET,
          remainingHours: remainingHours.toFixed(2),
          utilizationPercent: utilizationPercent.toFixed(1),
          isOverloaded,
          isUnderUtilized,
          status: isOverloaded ? 'overloaded' : isUnderUtilized ? 'underutilized' : 'optimal'
        },

        // Daily breakdown
        dailyMetrics: dailyBreakdown,

        // Future tasks
        upcomingTasks: {
          total: futureTasks.length,
          thisWeek: upcomingThisWeek.length,
          nextWeek: upcomingNextWeek.length,
          tasks: futureTasks.slice(0, 10).map(t => ({
            id: t.id,
            name: t.name,
            dueDate: t.due_date,
            priority: t.priority?.priority,
            priorityLabel: getPriorityLabel(t.priority?.priority),
            status: t.status?.status,
            list: t.list?.name,
            timeEstimate: t.time_estimate,
            timeEstimateHours: t.time_estimate ? (parseInt(t.time_estimate) / (1000*60*60)).toFixed(2) : null,
            url: t.url
          }))
        },

        // Overdue tasks
        overdueTasks: {
          count: overdueTasks.length,
          tasks: overdueTasks.slice(0, 5).map(t => ({
            id: t.id,
            name: t.name,
            dueDate: t.due_date,
            priority: t.priority?.priority,
            priorityLabel: getPriorityLabel(t.priority?.priority),
            status: t.status?.status,
            list: t.list?.name,
            url: t.url
          }))
        },

        // Task distribution
        tasksByStatus,
        tasksByPriority,

        // Time distribution
        timeByProject,

        // Estimate accuracy
        estimateAccuracy: {
          totalEstimatedMs,
          totalEstimatedHours: (totalEstimatedMs / (1000*60*60)).toFixed(2),
          totalTrackedMs: totalTrackedTime,
          totalTrackedHours: trackedHours.toFixed(2),
          variancePercent: estimateVariance,
          isAccurate: Math.abs(parseFloat(estimateVariance)) <= 20
        }
      });
    });

    // Sort by utilization (highest first)
    workloadData.sort((a, b) => b.weeklyMetrics.utilizationPercent - a.weeklyMetrics.utilizationPercent);

    // Calculate team statistics
    const teamStats = {
      totalMembers: workloadData.length,
      totalTasks: workloadData.reduce((sum, m) => sum + m.weeklyMetrics.totalTasks, 0),
      totalCompletedTasks: workloadData.reduce((sum, m) => sum + m.weeklyMetrics.completedTasks, 0),
      totalTrackedHours: workloadData.reduce((sum, m) => sum + parseFloat(m.weeklyMetrics.trackedHours), 0).toFixed(2),
      totalTargetHours: workloadData.length * WEEKLY_HOURS_TARGET,
      averageUtilization: workloadData.length > 0 ? (workloadData.reduce((sum, m) => sum + parseFloat(m.weeklyMetrics.utilizationPercent), 0) / workloadData.length).toFixed(1) : 0,
      overloadedMembers: workloadData.filter(m => m.weeklyMetrics.isOverloaded).length,
      underUtilizedMembers: workloadData.filter(m => m.weeklyMetrics.isUnderUtilized).length,
      optimalMembers: workloadData.filter(m => m.weeklyMetrics.status === 'optimal').length,
      totalUpcomingTasks: workloadData.reduce((sum, m) => sum + m.upcomingTasks.total, 0),
      totalOverdueTasks: workloadData.reduce((sum, m) => sum + m.overdueTasks.count, 0)
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
        targetDailyHours: DAILY_HOURS_TARGET,
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

// Helper Functions

function calculateDailyBreakdown(timeEntries, weekStart, weekEnd, dailyTarget) {
  const dailyMap = {};

  // Initialize all days in the week with proper timezone handling
  for (let i = 0; i < 7; i++) {
    const date = new Date(weekStart);
    date.setDate(weekStart.getDate() + i);
    date.setHours(0, 0, 0, 0);

    const dateKey = date.toISOString().split('T')[0];

    dailyMap[dateKey] = {
      date: dateKey,
      dayName: date.toLocaleDateString('en-US', { weekday: 'long' }),
      totalMs: 0,
      entries: []
    };
  }

  console.log('\n--- Daily Breakdown Debug ---');
  console.log('Initialized days:', Object.keys(dailyMap));

  // Group time entries by date
  timeEntries.forEach(entry => {
    // Parse the start timestamp (ClickUp returns milliseconds)
    const entryStartMs = parseInt(entry.start);
    const entryDate = new Date(entryStartMs);

    // Get date in YYYY-MM-DD format (local timezone)
    const year = entryDate.getFullYear();
    const month = String(entryDate.getMonth() + 1).padStart(2, '0');
    const day = String(entryDate.getDate()).padStart(2, '0');
    const dateKey = `${year}-${month}-${day}`;

    console.log(`Entry: ${entryDate.toISOString()} -> ${dateKey}, Duration: ${entry.duration}ms`);

    if (dailyMap[dateKey]) {
      dailyMap[dateKey].totalMs += Number(entry.duration || 0);
      dailyMap[dateKey].entries.push({
        id: entry.id,
        duration: entry.duration,
        description: entry.description,
        taskName: entry.task?.name || 'No task',
        listName: entry.task?.list?.name || entry.task_location?.list_name || 'Unknown',
        start: entry.start,
        end: entry.end
      });
    } else {
      console.log(`⚠️ Date ${dateKey} not in week range`);
    }
  });

  // Calculate metrics for each day
  const result = Object.values(dailyMap).map(day => {
    const hours = day.totalMs / (1000 * 60 * 60);
    return {
      date: day.date,
      dayName: day.dayName,
      trackedHours: hours.toFixed(2),
      targetHours: dailyTarget,
      remainingHours: (dailyTarget - hours).toFixed(2),
      utilizationPercent: ((hours / dailyTarget) * 100).toFixed(1),
      status: hours >= dailyTarget ? 'complete' : hours > 0 ? 'incomplete' : 'no-activity',
      entriesCount: day.entries.length,
      entries: day.entries
    };
  });

  console.log('Daily breakdown result:', result.map(d => `${d.dayName}: ${d.trackedHours}h`));
  console.log('--- End Daily Breakdown Debug ---\n');

  return result;
}

function calculateTimeByProject(timeEntries) {
  const projectMap = {};

  console.log('\n--- Time by Project Debug ---');
  console.log(`Processing ${timeEntries.length} time entries`);

  timeEntries.forEach((entry, idx) => {
    // Try multiple ways to get project/list name
    let projectName = 'Unassigned';

    if (entry.task?.list?.name) {
      projectName = entry.task.list.name;
    } else if (entry.task_location?.list_name) {
      projectName = entry.task_location.list_name;
    } else if (entry.task?.name) {
      projectName = `Task: ${entry.task.name}`;
    }

    if (idx < 3) {
      console.log(`Entry ${idx}:`, {
        taskName: entry.task?.name,
        listName: entry.task?.list?.name,
        taskLocationList: entry.task_location?.list_name,
        assignedProject: projectName
      });
    }

    if (!projectMap[projectName]) {
      projectMap[projectName] = {
        totalMs: 0,
        hours: 0,
        entriesCount: 0
      };
    }

    projectMap[projectName].totalMs += Number(entry.duration || 0);
    projectMap[projectName].entriesCount++;
  });

  // Convert to hours and sort by time spent
  const projects = Object.entries(projectMap).map(([name, data]) => ({
    projectName: name,
    totalMs: data.totalMs,
    hours: (data.totalMs / (1000*60*60)).toFixed(2),
    entriesCount: data.entriesCount
  }));

  projects.sort((a, b) => b.totalMs - a.totalMs);

  console.log('Projects found:', projects.map(p => `${p.projectName}: ${p.hours}h`));
  console.log('--- End Time by Project Debug ---\n');

  return projects;
}

function calculateTasksByStatus(tasks) {
  const statusMap = {};

  tasks.forEach(task => {
    const status = task.status?.status || 'No Status';
    statusMap[status] = (statusMap[status] || 0) + 1;
  });

  return statusMap;
}

function calculateTasksByPriority(tasks) {
  const priorityMap = {
    urgent: 0,
    high: 0,
    normal: 0,
    low: 0,
    none: 0
  };

  console.log('\n--- Tasks by Priority Debug ---');

  tasks.forEach((task, idx) => {
    const priority = task.priority?.priority;

    if (idx < 5) {
      console.log(`Task ${idx}: "${task.name}" - Priority:`, task.priority);
    }

    if (priority === 1) priorityMap.urgent++;
    else if (priority === 2) priorityMap.high++;
    else if (priority === 3) priorityMap.normal++;
    else if (priority === 4) priorityMap.low++;
    else priorityMap.none++;
  });

  console.log('Priority distribution:', priorityMap);
  console.log('--- End Tasks by Priority Debug ---\n');

  return priorityMap;
}

function getPriorityLabel(priority) {
  if (priority === 1) return 'urgent';
  if (priority === 2) return 'high';
  if (priority === 3) return 'normal';
  if (priority === 4) return 'low';
  return 'none';
}

function getWeekNumber(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}