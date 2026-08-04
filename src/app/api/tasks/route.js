import { NextResponse } from "next/server";
import crypto from "node:crypto";

const RATE_LIMIT_RETRIES = 3;
const RATE_LIMIT_BASE_DELAY_MS = 1200;
const ASSIGNEE_BATCH_SIZE = 50;
const TASK_ENRICH_BATCH_SIZE = 3;
const TASK_ENRICH_DELAY_MS = 350;
const TASK_CACHE_TTL_MS = 10 * 60 * 1000;

const taskDetailsCache = globalThis.__clickUpTaskDetailsCache || new Map();
globalThis.__clickUpTaskDetailsCache = taskDetailsCache;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function getTokenCacheKey(token) {
  return crypto.createHash("sha256").update(token).digest("hex").slice(0, 16);
}

function getRetryDelay(response, attempt) {
  const retryAfter = response.headers.get("retry-after");
  const retryAfterSeconds = Number(retryAfter);

  if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0) {
    return retryAfterSeconds * 1000;
  }

  return RATE_LIMIT_BASE_DELAY_MS * (attempt + 1);
}

async function clickUpFetch(url, token, options = {}) {
  const { retries = RATE_LIMIT_RETRIES } = options;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (response.status !== 429 || attempt === retries) {
      return response;
    }

    await sleep(getRetryDelay(response, attempt));
  }
}

function buildTimeEntriesUrl(teamId, startDate, endDate, extraParams = {}) {
  const params = new URLSearchParams({
    subtasks: "true",
    start_date: String(startDate.getTime()),
    end_date: String(endDate.getTime()),
    include_location_names: "true",
    include_task_tags: "true",
    ...extraParams
  });

  return `https://api.clickup.com/api/v2/team/${teamId}/time_entries?${params.toString()}`;
}

function chunkArray(items, size) {
  const chunks = [];

  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }

  return chunks;
}

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

// Updated function to enrich task data with list/folder info
async function enrichTaskData(taskId, token) {
  if (!taskId) return {};
  const cacheKey = `${getTokenCacheKey(token)}:${taskId}`;
  const cachedTask = taskDetailsCache.get(cacheKey);

  if (cachedTask && cachedTask.expiresAt > Date.now()) {
    return cachedTask.data;
  }

  try {
    const taskRes = await clickUpFetch(`https://api.clickup.com/api/v2/task/${taskId}`, token);

    if (!taskRes.ok) return {};

    const task = await taskRes.json();

    const enrichedTask = {
      // ✅ LIST & FOLDER INFO (from first code)
      list: task.list ? { id: task.list.id, name: task.list.name } : null,
      folder: task.folder ? { id: task.folder.id, name: task.folder.name } : { id: null, name: "No Folder" },
      space: task.space ? { id: task.space.id, name: task.space.name } : null,

      // Your existing enriched fields
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

    taskDetailsCache.set(cacheKey, {
      data: enrichedTask,
      expiresAt: Date.now() + TASK_CACHE_TTL_MS
    });

    return enrichedTask;
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

  // ✅ Calculate date range based on parameter
  const now = new Date();
  let startDate, endDate;

  if (daysParam === 'this_month') {
    startDate = new Date(now.getFullYear(), now.getMonth(), 1);
    endDate = now;
  } else if (daysParam === 'last_month') {
    startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    endDate = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
  } else {
    const days = parseInt(daysParam) || 1;
    startDate = new Date(now.getTime() - (days * 24 * 60 * 60 * 1000));
    endDate = now;
  }

  if (!token) {
    console.log("❌ No token provided");
    return NextResponse.json({ error: "Missing token" }, { status: 401 });
  }

  try {
    const workspacesRes = await clickUpFetch('https://api.clickup.com/api/v2/team', token);

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
    const userRes = await clickUpFetch('https://api.clickup.com/api/v2/user', token);

    if (!userRes.ok) {
      const errorData = await userRes.json();
      return NextResponse.json({
        error: "Failed to fetch current user",
        details: errorData
      }, { status: userRes.status });
    }

    const userData = await userRes.json();
    const currentUserId = userData.user.id;

    // ❌ REMOVE DUPLICATE DATE CALCULATION - already done above

    // Fetch team members to check user role
    console.log("\n--- Fetching Team Members ---");
    const membersRes = await clickUpFetch(`https://api.clickup.com/api/v2/team/${teamId}`, token);

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
      const assigneeIds = members.map(member => member.user.id).filter(Boolean);
      const assigneeBatches = chunkArray(assigneeIds, ASSIGNEE_BATCH_SIZE);

      for (const assigneeBatch of assigneeBatches) {
        const apiUrl = buildTimeEntriesUrl(teamId, startDate, endDate, {
          assignee: assigneeBatch.join(",")
        });

        try {
          const res = await clickUpFetch(apiUrl, token);

          const data = await res.json();

          if (res.ok && Array.isArray(data.data)) {
            allTimeEntries.push(...data.data);
          } else {
            console.log("  Failed to fetch batched member time entries -", JSON.stringify(data, null, 2));

            if (res.status === 429) {
              return NextResponse.json({
                error: "ClickUp rate limit reached. Please wait a minute and try again.",
                details: data
              }, { status: 429 });
            }
          }
        } catch (err) {
          console.log("  Error fetching batched member time entries -", err.message);
        }
      }

    } else {

      const apiUrl1 = buildTimeEntriesUrl(teamId, startDate, endDate, {
        assignee: String(currentUserId)
      });

      try {
        const res = await clickUpFetch(apiUrl1, token);

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
          const spacesRes = await clickUpFetch(`https://api.clickup.com/api/v2/team/${teamId}/space?archived=false`, token);

          const spacesData = await spacesRes.json();

          if (spacesData.spaces && spacesData.spaces.length > 0) {

            // Fetch time entries from each space
            for (const space of spacesData.spaces) {

              const spaceTimeUrl = buildTimeEntriesUrl(teamId, startDate, endDate, {
                space_id: String(space.id),
                assignee: String(currentUserId)
              });

              try {
                const res = await clickUpFetch(spaceTimeUrl, token);

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
            end: endDate.toISOString(),
            period: daysParam === 'this_month' ? 'This Month' :
              daysParam === 'last_month' ? 'Last Month' :
                `Last ${parseInt(daysParam)} days`,
            daysParam: daysParam // ✅ Add this for debugging
          }
        }
      });
    }

    // ✅ Enrich task data
    console.log("--- Enriching Task Data ---");

    // Get unique task IDs to avoid duplicate API calls
    const uniqueTaskIds = [...new Set(allTimeEntries.map(entry => entry.task?.id).filter(Boolean))];

    // Batch fetch task details carefully to avoid ClickUp rate limits
    const taskDetailsMap = new Map();
    const batchSize = TASK_ENRICH_BATCH_SIZE;

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
        await sleep(TASK_ENRICH_DELAY_MS);
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

        // Basic Task Info - ✅ NOW USING ENRICHED DATA FIRST
        taskId: entry.task?.id,
        taskName: entry.task?.name || "Unknown Task",
        taskUrl: taskUrl,

        // ✅ ENRICHED LIST/FOLDER DATA (priority over entry data)
        listId: enrichedTask.list?.id || entry.task?.list?.id,
        listName: enrichedTask.list?.name || entry.task?.list?.name || "No List",
        folderId: enrichedTask.folder?.id || entry.task?.folder?.id,
        folderName: enrichedTask.folder?.name || entry.task?.folder?.name || "No Folder",
        spaceId: enrichedTask.space?.id || entry.task?.space?.id,
        spaceName: enrichedTask.space?.name || entry.task?.space?.name,

        // ✅ ALL ENRICHED TASK DATA
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
        end: endDate.toISOString(), // ✅ Fixed
        period: daysParam === 'this_month' ? 'This Month' :
          daysParam === 'last_month' ? 'Last Month' :
            `Last ${parseInt(daysParam)} days`
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
