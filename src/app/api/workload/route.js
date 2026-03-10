// import { NextResponse } from 'next/server';

// export async function GET(req) {
//   try {
//     const token = req.headers.get('authorization')?.replace('Bearer ', '');
//     if (!token) {
//       return NextResponse.json({ success: false, error: 'Token missing' }, { status: 401 });
//     }

//     /* ----------------------------------
//         DATE RANGE LOGIC - ClickUp Timezone Compatible
//     ---------------------------------- */
//     const { searchParams } = new URL(req.url);
//     const fromDate = searchParams.get('start');
//     const toDate = searchParams.get('end');

//     let filterStart, filterEnd;

//     if (fromDate && toDate) {
//       filterStart = new Date(fromDate).getTime();
//       filterEnd = new Date(toDate).getTime() + (24 * 60 * 60 * 1000) - 1;
//     } else {
//       const now = new Date();
//       const currentDay = now.getDay();
//       const mondayOffset = currentDay === 0 ? -6 : 1 - currentDay;

//       const monday = new Date(now);
//       monday.setDate(now.getDate() + mondayOffset);
//       monday.setHours(0, 0, 0, 0);

//       filterStart = monday.getTime();
//       filterEnd = filterStart + (7 * 24 * 60 * 60 * 1000) - 1;
//     }

//     console.log('Date range:', new Date(filterStart).toISOString(), 'to', new Date(filterEnd).toISOString());

//     /* ----------------------------------
//         TEAM & USER INFO
//     ---------------------------------- */
//     const teamRes = await fetch('https://api.clickup.com/api/v2/team', {
//       headers: { Authorization: token }
//     });
//     const teamData = await teamRes.json();
//     const teamId = teamData?.teams?.[0]?.id;

//     if (!teamId) {
//       return NextResponse.json({ success: false, error: 'Team not found' }, { status: 404 });
//     }

//     const userRes = await fetch('https://api.clickup.com/api/v2/user', {
//       headers: { Authorization: token }
//     });
//     const userData = await userRes.json();
//     const currentUserId = userData.user.id;

//     const membersRes = await fetch(`https://api.clickup.com/api/v2/team/${teamId}`, {
//       headers: { Authorization: token }
//     });
//     const membersData = await membersRes.json();
//     const members = membersData.team?.members || [];

//     const currentUserMember = members.find(m => m.user.id === currentUserId);
//     const isAdmin = currentUserMember && ['admin', 'owner', 1, 2].includes(currentUserMember.user.role);

//     console.log(`Found ${members.length} team members`);

//     /* ----------------------------------
//         1. FETCH TRACKED TIME ENTRIES
//     ---------------------------------- */
//     const allTimeEntries = [];
//     const BATCH_SIZE = 5;

//     for (let i = 0; i < members.length; i += BATCH_SIZE) {
//       const batch = members.slice(i, i + BATCH_SIZE);
//       const batchPromises = batch.map(async (member) => {
//         try {
//           const timeRes = await fetch(
//             `https://api.clickup.com/api/v2/team/${teamId}/time_entries?start_date=${filterStart}&end_date=${filterEnd}&assignee=${member.user.id}&include_task_names=true`,
//             { headers: { Authorization: token }, cache: 'no-store' }
//           );
//           const data = await timeRes.json();
//           return data.data || [];
//         } catch (error) {
//           console.error(`Error fetching time entries for ${member.user.username}:`, error);
//           return [];
//         }
//       });

//       const results = await Promise.all(batchPromises);
//       results.forEach(entries => allTimeEntries.push(...entries));
//     }

//     console.log(`Fetched ${allTimeEntries.length} time entries`);

//     /* ----------------------------------
//         2. FETCH ALL TASKS WITH PAGINATION (CRITICAL FIX)
//     ---------------------------------- */
//     const fetchAllTasksWithPagination = async (baseParams) => {
//       const allTasks = [];
//       let page = 0;
//       const limit = 100; // ClickUp max limit
//       let hasMore = true;

//       while (hasMore) {
//         try {
//           const url = `https://api.clickup.com/api/v2/team/${teamId}/task?${baseParams}&include_closed=true&subtasks=true&page=${page}&limit=${limit}`;
//           console.log(`Fetching page ${page} with params: ${baseParams}`);

//           const res = await fetch(url, {
//             headers: { Authorization: token },
//             cache: 'no-store'
//           });

//           if (!res.ok) {
//             console.error(`Task fetch failed: ${res.status} ${res.statusText}`);
//             break;
//           }

//           const data = await res.json();
//           const tasks = data.tasks || [];

//           console.log(`Page ${page}: Got ${tasks.length} tasks`);

//           if (tasks.length === 0) {
//             hasMore = false;
//           } else {
//             allTasks.push(...tasks);
//             page++;

//             // Safety check to prevent infinite loops
//             if (page > 50) {
//               console.warn('Reached maximum page limit (50), stopping pagination');
//               break;
//             }
//           }

//           // Small delay to avoid rate limiting
//           await new Promise(resolve => setTimeout(resolve, 100));

//         } catch (error) {
//           console.error(`Error fetching page ${page}:`, error);
//           hasMore = false;
//         }
//       }

//       console.log(`Total tasks fetched with "${baseParams}": ${allTasks.length}`);
//       return allTasks;
//     };

//     // Fetch tasks with multiple strategies AND pagination
//     console.log('');

//     const [createdTasks, dueTasks, startTasks] = await Promise.all([
//       fetchAllTasksWithPagination(`date_created_gt=${filterStart}&date_created_lt=${filterEnd}`),
//       fetchAllTasksWithPagination(`due_date_gt=${filterStart}&due_date_lt=${filterEnd}`),
//       fetchAllTasksWithPagination(`start_date_gt=${filterStart}&start_date_lt=${filterEnd}`)
//     ]);

//     // Combine and deduplicate tasks
//     const taskMap = new Map();
//     [...createdTasks, ...dueTasks, ...startTasks].forEach(task => {
//       taskMap.set(task.id, task);
//     });
//     const allTasks = Array.from(taskMap.values());

//     console.log(``);
//     console.log(`Created in range: ${createdTasks.length}`);
//     console.log(`Due in range: ${dueTasks.length}`);
//     console.log(`Starting in range: ${startTasks.length}`);
//     console.log(`Total unique tasks: ${allTasks.length}`);

//     // Debug recurring tasks
//     const recurringTasks = allTasks.filter(t => t.recurrence || t.parent || t.template_id);
//     console.log(`Recurring task instances: ${recurringTasks.length}`);

//     /* ----------------------------------
//         3. FETCH TASKS FROM ALL SPACES (ALTERNATIVE APPROACH)
//     ---------------------------------- */
//     // If still missing tasks, try fetching from spaces directly
//     let spaceTasks = [];
//     try {
//       const spacesRes = await fetch(`https://api.clickup.com/api/v2/team/${teamId}/space`, {
//         headers: { Authorization: token }
//       });
//       const spacesData = await spacesRes.json();
//       const spaces = spacesData.spaces || [];

//       console.log(`Found ${spaces.length} spaces, fetching tasks from each...`);

//       for (const space of spaces.slice(0, 10)) { // Limit to first 10 spaces
//         try {
//           const spaceTasksRes = await fetch(
//             `https://api.clickup.com/api/v2/space/${space.id}/task?include_closed=true&subtasks=true&date_updated_gt=${filterStart}&date_updated_lt=${filterEnd}`,
//             { headers: { Authorization: token } }
//           );

//           if (spaceTasksRes.ok) {
//             const spaceData = await spaceTasksRes.json();
//             const tasks = spaceData.tasks || [];
//             spaceTasks.push(...tasks);
//             console.log(`Space "${space.name}": ${tasks.length} tasks`);
//           }
//         } catch (spaceError) {
//           console.error(`Error fetching from space ${space.name}:`, spaceError);
//         }
//       }

//       // Add space tasks to main collection
//       spaceTasks.forEach(task => {
//         if (!taskMap.has(task.id)) {
//           taskMap.set(task.id, task);
//           allTasks.push(task);
//         }
//       });

//       console.log(`Added ${spaceTasks.length} tasks from spaces. Total now: ${allTasks.length}`);
//     } catch (spaceError) {
//       console.error('Error fetching from spaces:', spaceError);
//     }

//     /* ----------------------------------
//         4. TASK DETAILS CACHE
//     ---------------------------------- */
//     const taskCache = {};
//     allTasks.forEach(t => taskCache[t.id] = t);

//     // Fetch missing task details for time entries
//     const untrackedTaskIds = [...new Set(
//       allTimeEntries
//         .map(e => e.task?.id)
//         .filter(id => id && !taskCache[id])
//     )];

//     console.log(`Fetching ${untrackedTaskIds.length} additional task details`);

//     const TASK_BATCH = 10;
//     for (let i = 0; i < untrackedTaskIds.length; i += TASK_BATCH) {
//       const batch = untrackedTaskIds.slice(i, i + TASK_BATCH);
//       await Promise.all(batch.map(async (id) => {
//         try {
//           const res = await fetch(`https://api.clickup.com/api/v2/task/${id}`, {
//             headers: { Authorization: token }
//           });
//           if (res.ok) {
//             const taskData = await res.json();
//             taskCache[id] = taskData;
//           }
//         } catch (error) {
//           console.error(`Error fetching task ${id}:`, error);
//         }
//       }));
//     }

//     /* ----------------------------------
//         5. PROCESSING LOGIC
//     ---------------------------------- */
//     const users = {};

//     const formatDate = (ts) => {
//       if (!ts) return null;
//       const d = new Date(Number(ts));
//       if (isNaN(d.getTime())) return null;

//       const year = d.getFullYear();
//       const month = String(d.getMonth() + 1).padStart(2, '0');
//       const day = String(d.getDate()).padStart(2, '0');

//       return `${year}-${month}-${day}`;
//     };

//     const getDaysInRange = (start, end) => {
//       const dates = [];
//       if (!start || !end) return dates;

//       let current = new Date(Number(start));
//       const stop = new Date(Number(end));

//       let counter = 0;
//       const MAX_DAYS = 365;

//       while (current <= stop && counter < MAX_DAYS) {
//         dates.push(formatDate(current.getTime()));
//         current.setDate(current.getDate() + 1);
//         counter++;
//       }
//       return dates;
//     };

//     const initUserDay = (userId, username, date) => {
//       users[userId] ??= {
//         userId,
//         username,
//         weekSummary: { totalSpent: 0, totalEstimate: 0 },
//         dailyBreakdown: {}
//       };

//       users[userId].dailyBreakdown[date] ??= {
//         date,
//         dateLabel: new Date(date).toLocaleDateString('en-US', {
//           weekday: 'short',
//           day: '2-digit',
//           month: 'short'
//         }),
//         tasksCount: 0,
//         totalSpent: 0,
//         totalEstimate: 0,
//         taskMap: {}
//       };

//       return users[userId].dailyBreakdown[date];
//     };

//     /* ----------------------------------
//         ENHANCED TASK PROCESSING FOR RECURRING
//     ---------------------------------- */
//     const processTaskEstimates = (task) => {
//       try {
//         const isRecurring = !!(task.recurrence || task.parent || task.template_id ||
//                              (task.custom_fields && task.custom_fields.some(f => f.name?.toLowerCase().includes('recurring'))));

//         let startTs = task.start_date || task.date_created;
//         let dueTs = task.due_date;

//         if (isRecurring && task.start_date && task.due_date) {
//           startTs = task.start_date;
//           dueTs = task.due_date;
//         } else if (!dueTs && startTs) {
//           dueTs = startTs;
//         }

//         if (!startTs) return;

//         const taskDays = getDaysInRange(startTs, dueTs);
//         if (taskDays.length === 0) return;

//         const totalEst = Number(task.time_estimate) || 0;
//         if (totalEst === 0) return;

//         const dailyShare = isRecurring ? totalEst : (totalEst / taskDays.length);

//         (task.assignees || []).forEach(assignee => {
//           taskDays.forEach(dayDate => {
//             const dayTs = new Date(dayDate).getTime();

//             if (dayTs >= filterStart && dayTs <= filterEnd) {
//               const day = initUserDay(assignee.id, assignee.username, dayDate);
//               const taskKey = isRecurring ? `${task.id}_${dayDate}` : task.id;

//               if (!day.taskMap[taskKey]) {
//                 day.taskMap[taskKey] = {
//                   taskId: task.id,
//                   taskKey: taskKey,
//                   taskName: task.name,
//                   listName: task.list?.name,
//                   status: task.status?.status,
//                   estimate: dailyShare,
//                   trackedToday: 0,
//                   createdDate: formatDate(task.date_created),
//                   type: 'estimated',
//                   parent: task.parent || null,
//                   isRecurring: isRecurring,
//                   recurrenceInfo: task.recurrence || null,
//                   instanceDate: dayDate
//                 };
//                 day.tasksCount++;
//                 day.totalEstimate += dailyShare;
//                 users[assignee.id].weekSummary.totalEstimate += dailyShare;
//               }
//             }
//           });
//         });
//       } catch (taskError) {
//         console.error('Task processing error:', taskError, 'Task ID:', task.id);
//       }
//     };

//     // Process all tasks for estimates
//     console.log(`Processing ${Object.keys(taskCache).length} tasks for estimates...`);
//     Object.values(taskCache).forEach(processTaskEstimates);

//     /* ----------------------------------
//         PROCESS TRACKED TIME
//     ---------------------------------- */
//     allTimeEntries.forEach(entry => {
//       try {
//         const date = formatDate(entry.start);
//         if (!date || !entry.task) return;

//         const day = initUserDay(entry.user.id, entry.user.username, date);
//         const taskId = entry.task.id;
//         const duration = (entry.end ? Number(entry.end) : Date.now()) - Number(entry.start);

//         const task = taskCache[taskId];
//         const isRecurring = !!(task && (task.recurrence || task.parent || task.template_id));
//         const taskKey = isRecurring ? `${taskId}_${date}` : taskId;

//         let existingTaskKey = taskKey;
//         if (!day.taskMap[taskKey] && isRecurring) {
//           existingTaskKey = taskId;
//         }

//         if (!day.taskMap[existingTaskKey]) {
//           day.taskMap[existingTaskKey] = {
//             taskId,
//             taskKey: existingTaskKey,
//             taskName: task?.name || entry.task.name,
//             listName: task?.list?.name,
//             status: task?.status?.status,
//             estimate: 0,
//             trackedToday: 0,
//             createdDate: task ? formatDate(task.date_created) : null,
//             type: 'tracked',
//             parent: task?.parent || null,
//             isRecurring: isRecurring,
//             instanceDate: date
//           };
//           day.tasksCount++;
//         } else {
//           day.taskMap[existingTaskKey].type = 'estimated_and_tracked';
//         }

//         day.taskMap[existingTaskKey].trackedToday += duration;
//         day.totalSpent += duration;
//         users[entry.user.id].weekSummary.totalSpent += duration;
//       } catch (entryError) {
//         console.error('Time entry processing error:', entryError);
//       }
//     });

//     /* ----------------------------------
//         6. FINAL FORMATTING
//     ---------------------------------- */
//     const workload = Object.values(users).map(user => {
//       const dailyBreakdown = Object.values(user.dailyBreakdown)
//         .sort((a, b) => new Date(a.date) - new Date(b.date))
//         .map(d => ({
//           ...d,
//           tasks: Object.values(d.taskMap).map(task => ({
//             ...task,
//             estimateHours: task.estimate / (1000 * 60 * 60),
//             trackedHours: task.trackedToday / (1000 * 60 * 60)
//           }))
//         }));

//       const uniqueTaskIds = new Set();
//       dailyBreakdown.forEach(d =>
//         d.tasks.forEach(t => uniqueTaskIds.add(t.taskId))
//       );

//       return {
//         userId: user.userId,
//         username: user.username,
//         weekSummary: {
//           totalTasks: uniqueTaskIds.size,
//           totalSpent: user.weekSummary.totalSpent,
//           totalEstimate: user.weekSummary.totalEstimate,
//           totalSpentHours: user.weekSummary.totalSpent / (1000 * 60 * 60),
//           totalEstimateHours: user.weekSummary.totalEstimate / (1000 * 60 * 60)
//         },
//         dailyBreakdown
//       };
//     });

//     console.log(``);
//     console.log(`Processed workload for ${workload.length} users`);

//     const totalEstimatedTasks = workload.reduce((sum, user) =>
//       sum + user.dailyBreakdown.reduce((daySum, day) =>
//         daySum + day.tasks.filter(t => t.type.includes('estimated')).length, 0), 0);

//     const totalRecurringTasks = workload.reduce((sum, user) =>
//       sum + user.dailyBreakdown.reduce((daySum, day) =>
//         daySum + day.tasks.filter(t => t.isRecurring).length, 0), 0);

//     console.log(`Total estimated task instances: ${totalEstimatedTasks}`);
//     console.log(`Total recurring task instances: ${totalRecurringTasks}`);

//     return NextResponse.json({
//       success: true,
//       workload,
//       meta: {
//         isAdmin,
//         dateRange: {
//           start: new Date(filterStart).toISOString(),
//           end: new Date(filterEnd).toISOString()
//         },
//         stats: {
//           totalTasks: allTasks.length,
//           recurringTasks: recurringTasks.length,
//           totalEstimatedInstances: totalEstimatedTasks,
//           totalRecurringInstances: totalRecurringTasks,
//           createdTasksCount: createdTasks.length,
//           dueTasksCount: dueTasks.length,
//           startTasksCount: startTasks.length,
//           spaceTasksCount: spaceTasks.length
//         }
//       }
//     });

//   } catch (error) {
//     console.error('API Error:', error);
//     return NextResponse.json({
//       success: false,
//       error: error.message
//     }, { status: 500 });
//   }
// }

import { NextResponse } from 'next/server';

export async function GET(req) {
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '');
    if (!token) {
      return NextResponse.json({ success: false, error: 'Token missing' }, { status: 401 });
    }

    /* ----------------------------------
        DATE RANGE LOGIC - ClickUp Timezone Compatible
    ---------------------------------- */
    const { searchParams } = new URL(req.url);
    const fromDate = searchParams.get('start');
    const toDate = searchParams.get('end');

    let filterStart, filterEnd;

    if (fromDate && toDate) {
      filterStart = new Date(fromDate).getTime();
      filterEnd = new Date(toDate).getTime() + (24 * 60 * 60 * 1000) - 1;
    } else {
      const now = new Date();
      const currentDay = now.getDay();
      const mondayOffset = currentDay === 0 ? -6 : 1 - currentDay;

      const monday = new Date(now);
      monday.setDate(now.getDate() + mondayOffset);
      monday.setHours(0, 0, 0, 0);

      filterStart = monday.getTime();
      filterEnd = filterStart + (7 * 24 * 60 * 60 * 1000) - 1;
    }

    // BROADER RANGE FOR FETCHING (to catch all relevant tasks)
    const fetchStart = filterStart - (30 * 24 * 60 * 60 * 1000); // 30 days before
    const fetchEnd = filterEnd + (30 * 24 * 60 * 60 * 1000);     // 30 days after

    console.log('Processing range:', new Date(filterStart).toISOString(), 'to', new Date(filterEnd).toISOString());
    console.log('Fetching range:', new Date(fetchStart).toISOString(), 'to', new Date(fetchEnd).toISOString());

    /* ----------------------------------
        TEAM & USER INFO
    ---------------------------------- */
    const teamRes = await fetch('https://api.clickup.com/api/v2/team', {
      headers: { Authorization: token }
    });
    const teamData = await teamRes.json();
    const teamId = teamData?.teams?.[0]?.id;

    if (!teamId) {
      return NextResponse.json({ success: false, error: 'Team not found' }, { status: 404 });
    }

    const userRes = await fetch('https://api.clickup.com/api/v2/user', {
      headers: { Authorization: token }
    });
    const userData = await userRes.json();
    const currentUserId = userData.user.id;

    const membersRes = await fetch(`https://api.clickup.com/api/v2/team/${teamId}`, {
      headers: { Authorization: token }
    });
    const membersData = await membersRes.json();
    const members = membersData.team?.members || [];

    const currentUserMember = members.find(m => m.user.id === currentUserId);
    const isAdmin = currentUserMember && ['admin', 'owner', 1, 2].includes(currentUserMember.user.role);

    console.log(`Found ${members.length} team members`);

    /* ----------------------------------
        OPTIMIZED PARALLEL FETCHING
    ---------------------------------- */
    console.log('Starting parallel fetch...');
    const startTime = Date.now();

    // OPTIMIZED TASK FETCHING FUNCTION
    const fetchTasksOptimized = async (strategy, params) => {
      const allTasks = [];
      let page = 0;
      const limit = 100;
      let totalFetched = 0;

      while (page < 10) { // Limit pages to prevent long waits
        try {
          const url = `https://api.clickup.com/api/v2/team/${teamId}/task?${params}&include_closed=true&subtasks=true&page=${page}&limit=${limit}`;

          const res = await fetch(url, {
            headers: { Authorization: token },
            cache: 'no-store'
          });

          if (!res.ok) break;

          const data = await res.json();
          const tasks = data.tasks || [];

          if (tasks.length === 0) break;

          allTasks.push(...tasks);
          totalFetched += tasks.length;
          page++;

        } catch (error) {
          console.error(`Error in ${strategy} page ${page}:`, error);
          break;
        }
      }

      console.log(`${strategy}: ${totalFetched} tasks`);
      return allTasks;
    };

    // PARALLEL EXECUTION - All fetches happen simultaneously
    const [timeEntriesResult, createdTasks, dueTasks, startTasks] = await Promise.all([
      // Time entries fetch
      (async () => {
        const allTimeEntries = [];
        const timePromises = members.map(async (member) => {
          try {
            const timeRes = await fetch(
              `https://api.clickup.com/api/v2/team/${teamId}/time_entries?start_date=${filterStart}&end_date=${filterEnd}&assignee=${member.user.id}&include_task_names=true`,
              { headers: { Authorization: token }, cache: 'no-store' }
            );
            const data = await timeRes.json();
            return data.data || [];
          } catch (error) {
            console.error(`Time entries error for ${member.user.username}:`, error);
            return [];
          }
        });

        const results = await Promise.all(timePromises);
        results.forEach(entries => allTimeEntries.push(...entries));
        return allTimeEntries;
      })(),

      // Task fetches with broader range
      fetchTasksOptimized('Created', `date_created_gt=${fetchStart}&date_created_lt=${fetchEnd}`),
      fetchTasksOptimized('Due', `due_date_gt=${fetchStart}&due_date_lt=${fetchEnd}`),
      fetchTasksOptimized('Start', `start_date_gt=${fetchStart}&start_date_lt=${fetchEnd}`)
    ]);

    const allTimeEntries = timeEntriesResult;
    console.log(`✓ Time entries: ${allTimeEntries.length}`);

    // Combine and deduplicate tasks
    const taskMap = new Map();
    [...createdTasks, ...dueTasks, ...startTasks].forEach(task => {
      taskMap.set(task.id, task);
    });
    const allTasks = Array.from(taskMap.values());

    console.log(`✓ Total unique tasks: ${allTasks.length}`);
    console.log(`✓ Fetch completed in: ${Date.now() - startTime}ms`);

    /* ----------------------------------
        SMART FILTERING - Only process relevant tasks
    ---------------------------------- */
    const relevantTasks = allTasks.filter(task => {
      // Must have estimate OR be tracked
      const hasEstimate = task.time_estimate && Number(task.time_estimate) > 0;
      const isTracked = allTimeEntries.some(entry => entry.task?.id === task.id);

      if (!hasEstimate && !isTracked) return false;

      // Must overlap with our processing range
      const startTs = task.start_date || task.date_created;
      const dueTs = task.due_date || startTs;

      if (!startTs) return isTracked;

      const taskStart = Number(startTs);
      const taskEnd = Number(dueTs);

      return (taskStart <= filterEnd && taskEnd >= filterStart);
    });

    console.log(`✓ Relevant tasks: ${relevantTasks.length} (filtered from ${allTasks.length})`);

    /* ----------------------------------
        BUILD TASK CACHE - Only for relevant tasks
    ---------------------------------- */
    const taskCache = {};
    relevantTasks.forEach(t => taskCache[t.id] = t);

    // Fetch missing tasks from time entries (minimal batch)
    const missingTaskIds = [...new Set(
      allTimeEntries
        .map(e => e.task?.id)
        .filter(id => id && !taskCache[id])
    )];

    if (missingTaskIds.length > 0) {
      console.log(`Fetching ${missingTaskIds.length} missing tasks...`);

      // Parallel fetch of missing tasks
      const missingTaskPromises = missingTaskIds.slice(0, 20).map(async (id) => { // Limit to 20
        try {
          const res = await fetch(`https://api.clickup.com/api/v2/task/${id}`, {
            headers: { Authorization: token }
          });
          if (res.ok) {
            const taskData = await res.json();
            return { id, task: taskData };
          }
        } catch (error) {
          console.error(`Error fetching task ${id}:`, error);
        }
        return null;
      });

      const missingResults = await Promise.all(missingTaskPromises);
      missingResults.forEach(result => {
        if (result) {
          taskCache[result.id] = result.task;
        }
      });
    }

    console.log(`✓ Task cache built: ${Object.keys(taskCache).length} tasks`);

    /* ----------------------------------
        PROCESSING LOGIC (SAME AS BEFORE BUT OPTIMIZED)
    ---------------------------------- */
    const users = {};

    const formatDate = (ts) => {
      if (!ts) return null;
      const d = new Date(Number(ts));
      if (isNaN(d.getTime())) return null;

      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');

      return `${year}-${month}-${day}`;
    };

    const getDaysInRange = (start, end) => {
      const dates = [];
      if (!start || !end) return dates;

      let current = new Date(Number(start));
      const stop = new Date(Number(end));

      let counter = 0;
      const MAX_DAYS = 365;

      while (current <= stop && counter < MAX_DAYS) {
        dates.push(formatDate(current.getTime()));
        current.setDate(current.getDate() + 1);
        counter++;
      }
      return dates;
    };

    const initUserDay = (userId, username, date) => {
      users[userId] ??= {
        userId,
        username,
        weekSummary: { totalSpent: 0, totalEstimate: 0 },
        dailyBreakdown: {}
      };

      users[userId].dailyBreakdown[date] ??= {
        date,
        dateLabel: new Date(date).toLocaleDateString('en-US', {
          weekday: 'short',
          day: '2-digit',
          month: 'short'
        }),
        tasksCount: 0,
        totalSpent: 0,
        totalEstimate: 0,
        taskMap: {}
      };

      return users[userId].dailyBreakdown[date];
    };

    /* ----------------------------------
        PROCESS ESTIMATES
    ---------------------------------- */
    console.log('Processing estimates...');
    let processedEstimates = 0;

    Object.values(taskCache).forEach(task => {
      try {
        const totalEst = Number(task.time_estimate) || 0;
        if (totalEst === 0) return;

        const isRecurring = !!(task.recurrence || task.parent || task.template_id);

        let startTs = task.start_date || task.date_created;
        let dueTs = task.due_date;

        if (isRecurring && task.start_date && task.due_date) {
          startTs = task.start_date;
          dueTs = task.due_date;
        } else if (!dueTs && startTs) {
          dueTs = startTs;
        }

        if (!startTs) return;

        const taskDays = getDaysInRange(startTs, dueTs);
        if (taskDays.length === 0) return;

        const dailyShare = isRecurring ? totalEst : (totalEst / taskDays.length);

        (task.assignees || []).forEach(assignee => {
          taskDays.forEach(dayDate => {
            const dayTs = new Date(dayDate).getTime();

            if (dayTs >= filterStart && dayTs <= filterEnd) {
              const day = initUserDay(assignee.id, assignee.username, dayDate);
              const taskKey = isRecurring ? `${task.id}_${dayDate}` : task.id;

              if (!day.taskMap[taskKey]) {
                day.taskMap[taskKey] = {
                  taskId: task.id,
                  taskKey: taskKey,
                  taskName: task.name,
                  listName: task.list?.name,
                  status: task.status?.status,
                  estimate: dailyShare,
                  trackedToday: 0,
                  createdDate: formatDate(task.date_created),
                  type: 'estimated',
                  parent: task.parent || null,
                  isRecurring: isRecurring,
                  recurrenceInfo: task.recurrence || null,
                  instanceDate: dayDate
                };
                day.tasksCount++;
                day.totalEstimate += dailyShare;
                users[assignee.id].weekSummary.totalEstimate += dailyShare;
                processedEstimates++;
              }
            }
          });
        });
      } catch (taskError) {
        console.error('Task processing error:', taskError, 'Task ID:', task.id);
      }
    });

    console.log(`✓ Processed ${processedEstimates} estimate instances`);

    /* ----------------------------------
        PROCESS TRACKED TIME
    ---------------------------------- */
    console.log('Processing tracked time...');
    let processedTimeEntries = 0;

    allTimeEntries.forEach(entry => {
      try {
        const date = formatDate(entry.start);
        if (!date || !entry.task) return;

        const day = initUserDay(entry.user.id, entry.user.username, date);
        const taskId = entry.task.id;
        const duration = (entry.end ? Number(entry.end) : Date.now()) - Number(entry.start);

        const task = taskCache[taskId];
        const isRecurring = !!(task && (task.recurrence || task.parent || task.template_id));
        const taskKey = isRecurring ? `${taskId}_${date}` : taskId;

        let existingTaskKey = taskKey;
        if (!day.taskMap[taskKey] && isRecurring) {
          existingTaskKey = taskId;
        }

        if (!day.taskMap[existingTaskKey]) {
          day.taskMap[existingTaskKey] = {
            taskId,
            taskKey: existingTaskKey,
            taskName: task?.name || entry.task.name,
            listName: task?.list?.name,
            status: task?.status?.status,
            estimate: 0,
            trackedToday: 0,
            createdDate: task ? formatDate(task.date_created) : null,
            type: 'tracked',
            parent: task?.parent || null,
            isRecurring: isRecurring,
            instanceDate: date
          };
          day.tasksCount++;
        } else {
          day.taskMap[existingTaskKey].type = 'estimated_and_tracked';
        }

        day.taskMap[existingTaskKey].trackedToday += duration;
        day.totalSpent += duration;
        users[entry.user.id].weekSummary.totalSpent += duration;
        processedTimeEntries++;
      } catch (entryError) {
        console.error('Time entry processing error:', entryError);
      }
    });

    console.log(`✓ Processed ${processedTimeEntries} time entries`);

    /* ----------------------------------
        FINAL FORMATTING
    ---------------------------------- */
    const workload = Object.values(users).map(user => {
      const dailyBreakdown = Object.values(user.dailyBreakdown)
        .sort((a, b) => new Date(a.date) - new Date(b.date))
        .map(d => ({
          ...d,
          tasks: Object.values(d.taskMap).map(task => ({
            ...task,
            estimateHours: task.estimate / (1000 * 60 * 60),
            trackedHours: task.trackedToday / (1000 * 60 * 60)
          }))
        }));

      const uniqueTaskIds = new Set();
      dailyBreakdown.forEach(d =>
        d.tasks.forEach(t => uniqueTaskIds.add(t.taskId))
      );

      return {
        userId: user.userId,
        username: user.username,
        weekSummary: {
          totalTasks: uniqueTaskIds.size,
          totalSpent: user.weekSummary.totalSpent,
          totalEstimate: user.weekSummary.totalEstimate,
          totalSpentHours: user.weekSummary.totalSpent / (1000 * 60 * 60),
          totalEstimateHours: user.weekSummary.totalEstimate / (1000 * 60 * 60)
        },
        dailyBreakdown
      };
    });

    const totalTime = Date.now() - startTime;
    const finalTaskCount = workload.reduce((sum, user) =>
      sum + user.dailyBreakdown.reduce((daySum, day) => daySum + day.tasks.length, 0), 0);

    console.log(`✓ COMPLETED in ${totalTime}ms`);
    console.log(`✓ Final output: ${workload.length} users, ${finalTaskCount} task instances`);

    const totalEstimatedTasks = workload.reduce((sum, user) =>
      sum + user.dailyBreakdown.reduce((daySum, day) =>
        daySum + day.tasks.filter(t => t.type.includes('estimated')).length, 0), 0);

    const totalRecurringTasks = workload.reduce((sum, user) =>
      sum + user.dailyBreakdown.reduce((daySum, day) =>
        daySum + day.tasks.filter(t => t.isRecurring).length, 0), 0);

    return NextResponse.json({
      success: true,
      workload,
      meta: {
        isAdmin,
        dateRange: {
          start: new Date(filterStart).toISOString(),
          end: new Date(filterEnd).toISOString()
        },
        performance: {
          totalTimeMs: totalTime,
          tasksProcessed: Object.keys(taskCache).length,
          timeEntriesProcessed: processedTimeEntries,
          estimateInstancesProcessed: processedEstimates
        },
        stats: {
          totalTasksFetched: allTasks.length,
          relevantTasks: relevantTasks.length,
          recurringTasks: relevantTasks.filter(t => t.recurrence || t.parent || t.template_id).length,
          totalEstimatedInstances: totalEstimatedTasks,
          totalRecurringInstances: totalRecurringTasks,
          finalTaskInstances: finalTaskCount
        }
      }
    });

  } catch (error) {
    console.error('API Error:', error);
    return NextResponse.json({
      success: false,
      error: error.message
    }, { status: 500 });
  }
}