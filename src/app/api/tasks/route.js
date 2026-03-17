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

// Add this function to enrich task data
async function enrichTaskData(taskId, token) {
  if (!taskId) return {};

  try {
    const taskRes = await fetch(`https://api.clickup.com/api/v2/task/${taskId}`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (!taskRes.ok) return {};

    const task = await taskRes.json();

    return {
      taskStatus: task.status?.status || "No Status",
      taskStatusColor: task.status?.color || "#808080",
      priority: task.priority?.priority || "No Priority",
      priorityColor: task.priority?.color || "#808080",
      taskDescription: task.description || "",
      taskTextContent: task.text_content || "",
      taskCustomId: task.custom_id || null,
      taskDateCreated: task.date_created ? new Date(Number(task.date_created)).toISOString() : null,
      taskDateUpdated: task.date_updated ? new Date(Number(task.date_updated)).toISOString() : null,
      taskDueDate: task.due_date ? new Date(Number(task.due_date)).toISOString() : null,
      taskStartDate: task.start_date ? new Date(Number(task.start_date)).toISOString() : null,
      taskCreator: task.creator?.username || task.creator?.email || "Unknown",
      taskAssignees: task.assignees?.map(a => ({
        id: a.id,
        username: a.username || a.email,
        email: a.email,
        profilePicture: a.profilePicture
      })) || [],
      taskTags: task.tags?.map(tag => ({
        name: tag.name,
        tagFg: tag.tag_fg,
        tagBg: tag.tag_bg
      })) || [],
      taskPoints: task.points || null,
      taskTimeEstimate: task.time_estimate || null,
      taskTimeSpent: task.time_spent || 0,
      taskOrderIndex: task.orderindex || null,
      taskCustomFields: task.custom_fields?.map(field => ({
        id: field.id,
        name: field.name,
        type: field.type,
        value: field.value,
        typeConfig: field.type_config
      })) || [],
      isSubtask: !!task.parent,
      parentTaskId: task.parent || null,
      taskWatchers: task.watchers?.map(w => w.username || w.email) || [],
      taskChecklists: task.checklists?.length || 0,
      taskDependencies: task.dependencies?.length || 0,
      taskLinkedTasks: task.linked_tasks?.length || 0,
      taskArchived: task.archived || false,
      taskPermission: task.permission || {},
      taskTeamId: task.team_id || null,
      taskProject: task.project || null,
      taskSubtasks: task.subtasks?.length || 0
    };
  } catch (error) {
    console.log(`Error fetching task ${taskId}:`, error.message);
    return {};
  }
}

export async function GET(request) {
  const requestStartTime = Date.now();

  const authHeader = request.headers.get("Authorization");
  const token = authHeader?.split(" ")[1];

  const { searchParams } = new URL(request.url);

  const daysParam = searchParams.get("days") || "3";
  const days = parseInt(daysParam);

  if (!token) {
    console.log("❌ No token provided");
    return NextResponse.json({ error: "Missing token" }, { status: 401 });
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

    const activeWorkspace = workspacesData.teams.find(team =>
      team.members && team.members.length > 0
    ) || workspacesData.teams[0];

    const teamId = activeWorkspace.id;
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
    console.log("\n--- Fetching Team Members ---");
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

    // Check if current user is admin or owner
    const currentUserMember = members.find(m => m.user.id === currentUserId);
    const isAdmin = currentUserMember && (
      currentUserMember.user.role === 'admin' ||
      currentUserMember.user.role === 'owner' ||
      currentUserMember.user.role === 2 ||
      currentUserMember.user.role === 1
    );

    const isGuest = !currentUserMember || currentUserMember.user.role === 3 || currentUserMember.user.role === 'guest';
    const allTimeEntries = [];

    if (isAdmin) {
      const memberBatchSize = 10;

      for (let i = 0; i < members.length; i += memberBatchSize) {
        const memberBatch = members.slice(i, i + memberBatchSize);

        const batchPromises = memberBatch.map(async (member) => {
          const userId = member.user.id;
          const username = member.user.username || member.user.email;
          const apiUrl = `https://api.clickup.com/api/v2/team/${teamId}/time_entries?subtasks=true&start_date=${startDate.getTime()}&assignee=${userId}`;

          try {
            const res = await fetch(apiUrl, {
              headers: { Authorization: `Bearer ${token}` }
            });

            const data = await res.json();

            if (res.ok && Array.isArray(data.data)) {
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

    } else {

      const apiUrl1 = `https://api.clickup.com/api/v2/team/${teamId}/time_entries?assignee=${currentUserId}&start_date=${startDate.getTime()}`;

      try {
        const res = await fetch(apiUrl1, {
          headers: { Authorization: `Bearer ${token}` }
        });

        const data = await res.json();

        if (res.ok && Array.isArray(data.data)) {
          allTimeEntries.push(...data.data);
        } else {
          console.log("❌ No data or error in response");
        }
      } catch (err) {
        console.log("❌ Fetch Error:", err.message);
      }

      // ✅ Approach 2: If no data, try fetching from accessible spaces
      if (allTimeEntries.length === 0) {

        try {
          const spacesRes = await fetch(`https://api.clickup.com/api/v2/team/${teamId}/space?archived=false`, {
            headers: { Authorization: `Bearer ${token}` }
          });

          const spacesData = await spacesRes.json();

          if (spacesData.spaces && spacesData.spaces.length > 0) {

            // Fetch time entries from each space
            for (const space of spacesData.spaces) {

              const spaceTimeUrl = `https://api.clickup.com/api/v2/team/${teamId}/time_entries?space_id=${space.id}&assignee=${currentUserId}&start_date=${startDate.getTime()}`;

              try {
                const res = await fetch(spaceTimeUrl, {
                  headers: { Authorization: `Bearer ${token}` }
                });

                const data = await res.json();

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
    }

    if (allTimeEntries.length === 0) {
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

    // ✅ Enrich task data
    console.log("--- Enriching Task Data ---");

    // Get unique task IDs to avoid duplicate API calls
    const uniqueTaskIds = [...new Set(allTimeEntries.map(entry => entry.task?.id).filter(Boolean))];

    // Batch fetch task details (10 at a time to avoid rate limits)
    const taskDetailsMap = new Map();
    const batchSize = 10;

    for (let i = 0; i < uniqueTaskIds.length; i += batchSize) {
      const taskBatch = uniqueTaskIds.slice(i, i + batchSize);

      const taskPromises = taskBatch.map(taskId =>
        enrichTaskData(taskId, token).then(data => ({ taskId, data }))
      );

      const batchResults = await Promise.all(taskPromises);
      batchResults.forEach(({ taskId, data }) => {
        taskDetailsMap.set(taskId, data);
      });

      // Small delay to respect rate limits
      if (i + batchSize < uniqueTaskIds.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    // ✅ Process all time entries with enriched task data
    const processedTimers = allTimeEntries.map(entry => {
      const fakeCheck = detectFakeTime(entry);
      const duration = Number(entry.duration || 0);
      const start = Number(entry.start);
      const isRunning = !entry.end || entry.end === null || entry.end === 0 || entry.end === '';
      const end = entry.end ? Number(entry.end) : Date.now();

      // ✅ Generate task URL - ClickUp standard format
      const taskUrl = entry.task?.url || (entry.task?.id ? `https://app.clickup.com/t/${entry.task.id}` : null);

      // Get enriched task data
      const enrichedTask = taskDetailsMap.get(entry.task?.id) || {};

      return {
        // User & Time Data
        user: entry.user?.username || entry.user?.email || "Unknown",
        userId: entry.user?.id,
        startTime: start,
        endTime: end,
        duration: duration,
        status: isRunning ? "running" : "stopped",
        isRunning: isRunning,
        date: new Date(start).toISOString().split('T')[0],
        startFormatted: new Date(start).toLocaleString(),
        endFormatted: new Date(end).toLocaleString(),

        // Fake Detection
        isFake: fakeCheck.isFake,
        isMobile: fakeCheck.isMobile,
        isDesktop: fakeCheck.isDesktop,
        isReal: fakeCheck.isReal,
        source: fakeCheck.source,
        deviceType: fakeCheck.deviceType,

        // Basic Task Info (from time entry)
        taskId: entry.task?.id,
        taskName: entry.task?.name || "Unknown Task",
        taskUrl: taskUrl,
        listId: entry.task?.list?.id,
        listName: entry.task?.list?.name,
        folderId: entry.task?.folder?.id,
        folderName: entry.task?.folder?.name || "No Folder",
        spaceId: entry.task?.space?.id,
        spaceName: entry.task?.space?.name,

        // ✅ ENRICHED TASK DATA - All the fields you wanted
        ...enrichedTask
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

    // Calculate enhanced statistics
    const stats = {
      totalEntries: processedTimers.length,
      totalDuration: processedTimers.reduce((sum, t) => sum + t.duration, 0),
      totalHours: (processedTimers.reduce((sum, t) => sum + t.duration, 0) / (1000 * 60 * 60)).toFixed(2),
      uniqueUsers: uniqueUsers.length,
      uniqueTasks: uniqueTaskIds.length,
      fakeEntries: fakeTimers.length,
      mobileEntries: mobileTimers.length,
      desktopEntries: desktopTimers.length,
      realEntries: processedTimers.filter(t => t.isReal).length,

      // New stats from enriched data
      tasksWithEstimates: processedTimers.filter(t => t.taskTimeEstimate).length,
      tasksWithDueDate: processedTimers.filter(t => t.taskDueDate).length,
      highPriorityTasks: processedTimers.filter(t => t.priority === "urgent" || t.priority === "high").length,
      uniqueTags: [...new Set(processedTimers.flatMap(t => t.taskTags?.map(tag => tag.name) || []))].length
    };

    const totalTime = Date.now() - requestStartTime;

    return NextResponse.json({
      success: true,
      data: processedTimers,
      runningTimers: runningTimers,
      filters: {
        users: uniqueUsers,
        folders: uniqueFolders,

        // New filters from enriched data
        priorities: [...new Set(processedTimers.map(t => t.priority).filter(Boolean))],
        statuses: [...new Set(processedTimers.map(t => t.taskStatus).filter(Boolean))],
        tags: [...new Set(processedTimers.flatMap(t => t.taskTags?.map(tag => tag.name) || []))],
        assignees: [...new Set(processedTimers.flatMap(t => t.taskAssignees?.map(a => a.username) || []))]
      },
      stats: stats,
      dateRange: {
        start: startDate.toISOString(),
        end: now.toISOString(),
        days: days
      },
      meta: {
        processingTime: `${totalTime}ms`,
        userRole: isAdmin ? 'admin' : (isGuest ? 'guest' : 'member'),
        tasksEnriched: uniqueTaskIds.length
      }
    });

  } catch (err) {
    const totalTime = Date.now() - requestStartTime;

    console.log("Error message:", err.message);
    console.log(`Failed after: ${totalTime}ms`);

    return NextResponse.json({
      error: err.message,
      stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
    }, { status: 500 });
  }
}