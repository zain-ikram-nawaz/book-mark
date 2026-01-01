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
      filterEnd = new Date(toDate).getTime() + (23 * 60 * 60 * 1000 + 59 * 60 * 1000);
    } else {
      const now = new Date();
      const currentDay = now.getDay();
      const diff = now.getDate() - currentDay + (currentDay === 0 ? -6 : 1);
      filterStart = new Date(now.setDate(diff)).setHours(0, 0, 0, 0);
      filterEnd = filterStart + 7 * 24 * 60 * 60 * 1000 - 1;
    }

    /* ----------------------------------
        TEAM & USER INFO
    ---------------------------------- */
    const teamRes = await fetch('https://api.clickup.com/api/v2/team', { headers: { Authorization: token } });
    const teamData = await teamRes.json();
    const teamId = teamData?.teams?.[0]?.id;

    if (!teamId) return NextResponse.json({ success: false, error: 'Team not found' }, { status: 404 });

    const userRes = await fetch('https://api.clickup.com/api/v2/user', { headers: { Authorization: token } });
    const userData = await userRes.json();
    const currentUserId = userData.user.id;

    const membersRes = await fetch(`https://api.clickup.com/api/v2/team/${teamId}`, { headers: { Authorization: token } });
    const membersData = await membersRes.json();
    const members = membersData.team?.members || [];

    const currentUserMember = members.find(m => m.user.id === currentUserId);
    const isAdmin = currentUserMember && [ 'admin', 'owner', 1, 2 ].includes(currentUserMember.user.role);

    /* ----------------------------------
        1. FETCH TRACKED TIME ENTRIES
    ---------------------------------- */
    console.log('⏱️ Fetching time entries...');
    const allTimeEntries = [];
    const BATCH_SIZE = 10;
    for (let i = 0; i < members.length; i += BATCH_SIZE) {
      const batch = members.slice(i, i + BATCH_SIZE);
      const batchPromises = batch.map(async (member) => {
        const timeRes = await fetch(
          `https://api.clickup.com/api/v2/team/${teamId}/time_entries?start_date=${filterStart}&end_date=${filterEnd}&assignee=${member.user.id}`,
          { headers: { Authorization: token }, cache: 'no-store' }
        );
        const data = await timeRes.json();
        return data.data || [];
      });
      const results = await Promise.all(batchPromises);
      results.forEach(entries => allTimeEntries.push(...entries));
    }

    /* ----------------------------------
        2. FETCH CREATED TASKS
    ---------------------------------- */
    console.log('🆕 Fetching created tasks...');
    const createdTasksRes = await fetch(
      `https://api.clickup.com/api/v2/team/${teamId}/task?date_created_gt=${filterStart}&date_created_lt=${filterEnd}&include_closed=true`,
      { headers: { Authorization: token }, cache: 'no-store' }
    );
    const createdTasksData = await createdTasksRes.json();
    const createdTasks = createdTasksData.tasks || [];

    /* ----------------------------------
        3. TASK DETAILS CACHE
    ---------------------------------- */
    const taskCache = {};
    createdTasks.forEach(t => taskCache[t.id] = t);

    const untrackedTaskIds = [...new Set(allTimeEntries.map(e => e.task?.id).filter(id => id && !taskCache[id]))];
    const TASK_BATCH = 20;
    for (let i = 0; i < untrackedTaskIds.length; i += TASK_BATCH) {
      const batch = untrackedTaskIds.slice(i, i + TASK_BATCH);
      await Promise.all(batch.map(async (id) => {
        const res = await fetch(`https://api.clickup.com/api/v2/task/${id}`, { headers: { Authorization: token } });
        if (res.ok) taskCache[id] = await res.json();
      }));
    }

    /* ----------------------------------
        4. PROCESSING LOGIC (MERGING)
    ---------------------------------- */
    const users = {};

    const formatDate = (ts) => {
      const d = new Date(Number(ts));
      return isNaN(d.getTime()) ? null : d.toISOString().split('T')[0];
    };

    const initUserDay = (userId, username, date) => {
      users[userId] ??= { userId, username, weekSummary: { totalSpent: 0 }, dailyBreakdown: {} };
      users[userId].dailyBreakdown[date] ??= {
        date,
        dateLabel: new Date(date).toLocaleDateString('en-US', { weekday: 'short', day: '2-digit', month: 'short' }),
        tasksCount: 0,
        totalSpent: 0,
        totalEstimate: 0,
        taskMap: {}
      };
      return users[userId].dailyBreakdown[date];
    };

    // Process Time Entries
    allTimeEntries.forEach(entry => {
      const date = formatDate(entry.start);
      if (!date || !entry.task || !taskCache[entry.task.id]) return;

      const day = initUserDay(entry.user.id, entry.user.username, date);
      const taskId = entry.task.id;
      const task = taskCache[taskId];

      if (!day.taskMap[taskId]) {
        day.taskMap[taskId] = {
          taskId,
          taskName: task.name,
          listName: task.list?.name,
          status: task.status?.status,
          estimate: task.time_estimate || 0,
          trackedToday: 0,
          createdDate: formatDate(task.date_created),
          type: 'tracked'
        };
        day.tasksCount++;
        day.totalEstimate += (task.time_estimate || 0);
      }
      const duration = (entry.end ? Number(entry.end) : Date.now()) - Number(entry.start);
      day.taskMap[taskId].trackedToday += duration;
      day.totalSpent += duration;
      users[entry.user.id].weekSummary.totalSpent += duration;
    });

    // Process Created Tasks (Add if not already present in that day)
    createdTasks.forEach(task => {
      const date = formatDate(task.date_created);
      if (!date) return;

      (task.assignees || []).forEach(assignee => {
        const day = initUserDay(assignee.id, assignee.username, date);
        if (!day.taskMap[task.id]) {
          day.taskMap[task.id] = {
            taskId: task.id,
            taskName: task.name,
            listName: task.list?.name,
            status: task.status?.status,
            estimate: task.time_estimate || 0,
            trackedToday: 0,
            createdDate: date,
            type: 'created'
          };
          day.tasksCount++;
          day.totalEstimate += (task.time_estimate || 0);
        } else {
            day.taskMap[task.id].type = 'created_and_tracked';
        }
      });
    });

    /* ----------------------------------
        5. FINAL FORMATTING
    ---------------------------------- */
    const workload = Object.values(users).map(user => {
      const dailyBreakdown = Object.values(user.dailyBreakdown).sort((a, b) => new Date(a.date) - new Date(b.date))
        .map(d => ({ ...d, tasks: Object.values(d.taskMap) }));

      const uniqueTaskIds = new Set();
      let totalEstimate = 0;
      dailyBreakdown.forEach(d => d.tasks.forEach(t => {
        if (!uniqueTaskIds.has(t.taskId)) {
          uniqueTaskIds.add(t.taskId);
          totalEstimate += t.estimate;
        }
      }));

      return {
        userId: user.userId,
        username: user.username,
        weekSummary: { totalTasks: uniqueTaskIds.size, totalSpent: user.weekSummary.totalSpent, totalEstimate },
        dailyBreakdown
      };
    });

    return NextResponse.json({ success: true, workload, meta: { isAdmin, dateRange: { start: new Date(filterStart).toISOString(), end: new Date(filterEnd).toISOString() } } });

  } catch (e) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}