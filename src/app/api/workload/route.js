import { NextResponse } from 'next/server';

export async function GET(req) {
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '');
    if (!token) {
      return NextResponse.json({ success: false, error: 'Token missing' }, { status: 401 });
    }

    /* ----------------------------------
        DATE RANGE LOGIC
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

      const startDate = new Date(now.getFullYear(), now.getMonth() - 6, 1);
      startDate.setHours(0, 0, 0, 0);

      const endDate = new Date(now.getFullYear(), now.getMonth() + 6, 0);
      endDate.setHours(23, 59, 59, 999);

      filterStart = startDate.getTime();
      filterEnd = endDate.getTime();
    }

    const fetchStart = filterStart - (90 * 24 * 60 * 60 * 1000);
    const fetchEnd = filterEnd + (90 * 24 * 60 * 60 * 1000);

    console.log('Processing range:', new Date(filterStart).toISOString(), 'to', new Date(filterEnd).toISOString());

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

    const memberLookup = {};
    members.forEach(m => {
      memberLookup[m.user.id] = m.user.username;
    });

    /* ----------------------------------
        FETCH TASKS
    ---------------------------------- */
    console.log('Starting parallel fetch...');
    const startTime = Date.now();

    const fetchTasksOptimized = async (strategy, params) => {
      const allTasks = [];
      let page = 0;
      const limit = 100;

      while (page < 15) {
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
          page++;

        } catch (error) {
          console.error(`Error in ${strategy} page ${page}:`, error);
          break;
        }
      }

      return allTasks;
    };

    const [timeEntriesResult, createdTasks, dueTasks, startTasks] = await Promise.all([
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
            return [];
          }
        });

        const results = await Promise.all(timePromises);
        results.forEach(entries => allTimeEntries.push(...entries));
        return allTimeEntries;
      })(),

      fetchTasksOptimized('Created', `date_created_gt=${fetchStart}&date_created_lt=${fetchEnd}`),
      fetchTasksOptimized('Due', `due_date_gt=${fetchStart}&due_date_lt=${fetchEnd}`),
      fetchTasksOptimized('Start', `start_date_gt=${fetchStart}&start_date_lt=${fetchEnd}`)
    ]);

    const allTimeEntries = timeEntriesResult;

    const taskMap = new Map();
    [...createdTasks, ...dueTasks, ...startTasks].forEach(task => {
      taskMap.set(task.id, task);
    });
    const allTasks = Array.from(taskMap.values());

    const relevantTasks = allTasks.filter(task => {
      const hasEstimate = task.time_estimate && Number(task.time_estimate) > 0;
      const isTracked = allTimeEntries.some(entry => entry.task?.id === task.id);

      return hasEstimate || isTracked;
    });

    const taskCache = {};
    relevantTasks.forEach(t => taskCache[t.id] = t);

    const missingTaskIds = [...new Set(
      allTimeEntries
        .map(e => e.task?.id)
        .filter(id => id && !taskCache[id])
    )];

    if (missingTaskIds.length > 0) {
      const missingTaskPromises = missingTaskIds.slice(0, 30).map(async (id) => {
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

    /* ----------------------------------
        PROCESSING LOGIC
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

      const startDate = new Date(Number(start));
      const endDate = new Date(Number(end));

      startDate.setHours(0, 0, 0, 0);
      endDate.setHours(0, 0, 0, 0);

      let current = new Date(startDate);
      let counter = 0;
      const MAX_DAYS = 365;

      while (current <= endDate && counter < MAX_DAYS) {
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
        PROCESS ESTIMATES - FIXED UNIQUE TASK KEYS
    ---------------------------------- */
    console.log('Processing estimates...');
    let processedEstimates = 0;

    Object.values(taskCache).forEach(task => {
      try {
        const totalEst = Number(task.time_estimate) || 0;
        if (totalEst === 0) return;

        const assignees = task.assignees || [];
        if (assignees.length === 0) return;

        const assigneeNames = assignees.map(a => memberLookup[a.id] || a.id).join(', ');

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

        console.log(`\n=== PROCESSING TASK: "${task.name}" ===`);
        console.log(`Total Estimate: ${(totalEst / (1000 * 60 * 60)).toFixed(2)} hours`);
        console.log(`Assignees: [${assigneeNames}]`);
        console.log(`Start: ${new Date(Number(startTs)).toISOString()}`);
        console.log(`Due: ${new Date(Number(dueTs)).toISOString()}`);

        const taskDays = getDaysInRange(startTs, dueTs);
        if (taskDays.length === 0) {
          console.log(`❌ No days generated for task "${task.name}"`);
          return;
        }

        console.log(`Task spans ${taskDays.length} days: [${taskDays.join(', ')}]`);

        const totalAssignees = assignees.length;
        const totalDays = taskDays.length;

        let dailySharePerAssignee;

        if (isRecurring) {
          dailySharePerAssignee = totalEst / totalAssignees;
        } else {
          const estimatePerAssignee = totalEst / totalAssignees;
          dailySharePerAssignee = estimatePerAssignee / totalDays;
        }

        console.log(`Division: ${(totalEst / (1000 * 60 * 60)).toFixed(2)}h ÷ ${totalAssignees} assignees ÷ ${totalDays} days = ${(dailySharePerAssignee / (1000 * 60 * 60)).toFixed(2)}h per person per day`);

        // Process each assignee for each day
        assignees.forEach((assignee, assigneeIndex) => {
          const assigneeName = memberLookup[assignee.id] || assignee.id;
          console.log(`\n  Processing assignee ${assigneeIndex + 1}/${totalAssignees}: ${assigneeName}`);

          taskDays.forEach((dayDate, dayIndex) => {
            const day = initUserDay(assignee.id, assigneeName, dayDate);

            // CRITICAL FIX: Always use date in task key for multi-day tasks
            const taskKey = totalDays > 1 ? `${task.id}_${dayDate}` : task.id;

            console.log(`    Day ${dayIndex + 1}/${totalDays}: ${dayDate} - TaskKey: ${taskKey}`);

            // Check if this specific task-day combination already exists
            if (!day.taskMap[taskKey]) {
              day.taskMap[taskKey] = {
                taskId: task.id,
                taskKey: taskKey,
                taskName: task.name,
                listName: task.list?.name,
                status: task.status?.status,
                estimate: dailySharePerAssignee,
                trackedToday: 0,
                createdDate: formatDate(task.date_created),
                type: 'estimated',
                parent: task.parent || null,
                isRecurring: isRecurring,
                recurrenceInfo: task.recurrence || null,
                instanceDate: dayDate,
                totalAssignees: totalAssignees,
                totalDays: totalDays,
                originalEstimate: totalEst
              };
              day.tasksCount++;
              day.totalEstimate += dailySharePerAssignee;
              users[assignee.id].weekSummary.totalEstimate += dailySharePerAssignee;
              processedEstimates++;

              console.log(`      ✅ Added ${(dailySharePerAssignee / (1000 * 60 * 60)).toFixed(2)}h to ${assigneeName} on ${dayDate}`);
            } else {
              console.log(`      ⚠️  TaskKey ${taskKey} already exists for ${assigneeName} on ${dayDate}`);
            }
          });
        });

        // Verification
        const totalDistributed = dailySharePerAssignee * totalAssignees * totalDays;
        console.log(`\n📊 VERIFICATION for "${task.name}":`);
        console.log(`  Expected total: ${(totalEst / (1000 * 60 * 60)).toFixed(2)}h`);
        console.log(`  Actually distributed: ${(totalDistributed / (1000 * 60 * 60)).toFixed(2)}h`);
        console.log(`  Difference: ${((totalDistributed - totalEst) / (1000 * 60 * 60)).toFixed(4)}h`);

      } catch (taskError) {
        console.error('Task processing error:', taskError, 'Task ID:', task.id);
      }
    });

    console.log(`✓ Processed ${processedEstimates} estimate instances`);

    /* ----------------------------------
        PROCESS TRACKED TIME - UPDATED FOR NEW TASK KEYS
    ---------------------------------- */
    console.log('Processing tracked time...');
    let processedTimeEntries = 0;

    allTimeEntries.forEach(entry => {
      try {
        const date = formatDate(entry.start);
        if (!date || !entry.task) return;

        const userName = memberLookup[entry.user.id] || entry.user.username;
        const day = initUserDay(entry.user.id, userName, date);
        const taskId = entry.task.id;
        const duration = (entry.end ? Number(entry.end) : Date.now()) - Number(entry.start);

        const task = taskCache[taskId];
        const isRecurring = !!(task && (task.recurrence || task.parent || task.template_id));

        // Check if this task spans multiple days
        let taskDays = [];
        if (task && task.start_date && task.due_date) {
          taskDays = getDaysInRange(task.start_date, task.due_date);
        }
        const isMultiDay = taskDays.length > 1;

        // Use consistent task key logic
        const taskKey = isMultiDay ? `${taskId}_${date}` : taskId;

        if (!day.taskMap[taskKey]) {
          day.taskMap[taskKey] = {
            taskId,
            taskKey: taskKey,
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
          day.taskMap[taskKey].type = 'estimated_and_tracked';
        }

        day.taskMap[taskKey].trackedToday += duration;
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
      const filteredDailyBreakdown = Object.values(user.dailyBreakdown)
        .filter(day => {
          const dayTs = new Date(day.date).getTime();
          return dayTs >= filterStart && dayTs <= filterEnd;
        })
        .sort((a, b) => new Date(a.date) - new Date(b.date))
        .map(d => ({
          ...d,
          tasks: Object.values(d.taskMap).map(task => ({
            ...task,
            estimateHours: task.estimate / (1000 * 60 * 60),
            trackedHours: task.trackedToday / (1000 * 60 * 60)
          }))
        }));

      const filteredTotalSpent = filteredDailyBreakdown.reduce((sum, day) => sum + day.totalSpent, 0);
      const filteredTotalEstimate = filteredDailyBreakdown.reduce((sum, day) => sum + day.totalEstimate, 0);

      const uniqueTaskIds = new Set();
      filteredDailyBreakdown.forEach(d =>
        d.tasks.forEach(t => uniqueTaskIds.add(t.taskId))
      );

      return {
        userId: user.userId,
        username: user.username,
        weekSummary: {
          totalTasks: uniqueTaskIds.size,
          totalSpent: filteredTotalSpent,
          totalEstimate: filteredTotalEstimate,
          totalSpentHours: filteredTotalSpent / (1000 * 60 * 60),
          totalEstimateHours: filteredTotalEstimate / (1000 * 60 * 60)
        },
        dailyBreakdown: filteredDailyBreakdown
      };
    }).filter(user => user.dailyBreakdown.length > 0);

    // Debug final estimates per user
    console.log(`\n=== FINAL ESTIMATES PER USER (FILTERED RANGE) ===`);
    workload.forEach(user => {
      console.log(`${user.username}: ${user.weekSummary.totalEstimateHours.toFixed(2)} hours estimated`);
      user.dailyBreakdown.forEach(day => {
        if (day.totalEstimate > 0) {
          console.log(`  ${day.date}: ${(day.totalEstimate / (1000 * 60 * 60)).toFixed(2)}h (${day.tasks.length} tasks)`);
          day.tasks.forEach(task => {
            console.log(`    - ${task.taskName}: ${task.estimateHours.toFixed(2)}h (Key: ${task.taskKey})`);
          });
        }
      });
    });

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
          totalTimeMs: Date.now() - startTime,
          tasksProcessed: Object.keys(taskCache).length,
          timeEntriesProcessed: processedTimeEntries,
          estimateInstancesProcessed: processedEstimates
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