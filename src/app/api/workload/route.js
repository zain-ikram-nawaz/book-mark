import { NextResponse } from 'next/server';

export async function GET(req) {
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '');
    if (!token) {
      return NextResponse.json(
        { success: false, error: 'Token missing' },
        { status: 401 }
      );
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
      filterEnd =
        new Date(toDate).getTime() +
        (23 * 60 * 60 * 1000 + 59 * 60 * 1000);
    } else {
      const now = new Date();
      const currentDay = now.getDay();
      const diff = now.getDate() - currentDay + (currentDay === 0 ? -6 : 1);
      filterStart = new Date(now.setDate(diff)).setHours(0, 0, 0, 0);
      filterEnd = filterStart + 7 * 24 * 60 * 60 * 1000 - 1;
    }

    /* ----------------------------------
       TEAM ID
    ---------------------------------- */
    const teamRes = await fetch('https://api.clickup.com/api/v2/team', {
      headers: { Authorization: `Bearer ${token}` }
    });

    const teamData = await teamRes.json();
    const teamId = teamData?.teams?.[0]?.id;

    if (!teamId) {
      return NextResponse.json(
        { success: false, error: 'Team not found' },
        { status: 404 }
      );
    }

    /* ----------------------------------
       CURRENT USER
    ---------------------------------- */
    const userRes = await fetch('https://api.clickup.com/api/v2/user', {
      headers: { Authorization: `Bearer ${token}` }
    });
    const userData = await userRes.json();
    const currentUserId = userData.user.id;

    /* ----------------------------------
       TEAM MEMBERS + ROLE CHECK
    ---------------------------------- */
    const membersRes = await fetch(
      `https://api.clickup.com/api/v2/team/${teamId}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const membersData = await membersRes.json();
    const members = membersData.team?.members || [];

    const currentUserMember = members.find(
      m => m.user.id === currentUserId
    );

    const isAdmin =
      currentUserMember &&
      (
        currentUserMember.user.role === 'admin' ||
        currentUserMember.user.role === 'owner' ||
        currentUserMember.user.role === 1 ||
        currentUserMember.user.role === 2
      );

    /* ----------------------------------
       FETCH TASKS (UPDATED LOGIC)
    ---------------------------------- */
    let allTasks = [];
    let page = 0;
    let hasMore = true;

    while (hasMore && page < 15) {
      const query = new URLSearchParams({
        subtasks: 'true',
        include_closed: 'false',
        all_lists: 'true',
        page: page.toString(),
        date_updated_gt: filterStart.toString()
      }).toString();

      const res = await fetch(
        `https://api.clickup.com/api/v2/team/${teamId}/task?${query}`,
        {
          headers: { Authorization: `Bearer ${token}` },
          cache: 'no-store'
        }
      );

      const data = await res.json();

      if (data.tasks && data.tasks.length > 0) {
        allTasks.push(...data.tasks);
        if (data.tasks.length < 100) hasMore = false;
        else page++;
      } else {
        hasMore = false;
      }
    }

    /* ----------------------------------
       PROCESS TASKS
    ---------------------------------- */
    const users = {};

    allTasks.forEach(task => {
      // 🔐 NORMAL USER FILTER
      if (!isAdmin) {
        const isAssignedToMe = task.assignees?.some(
          a => a.id === currentUserId
        );
        if (!isAssignedToMe) return;
      }

      const start = task.start_date ? parseInt(task.start_date) : null;
      const due = task.due_date ? parseInt(task.due_date) : null;
      const updated = task.date_updated
        ? parseInt(task.date_updated)
        : null;

      const isRelevant =
        (start && due && start <= filterEnd && due >= filterStart) ||
        (updated && updated >= filterStart && updated <= filterEnd);

      if (!isRelevant) return;

      task.assignees?.forEach(u => {
        // 🔐 Normal user → sirf apna bucket
        if (!isAdmin && u.id !== currentUserId) return;

        if (!users[u.id]) {
          users[u.id] = {
            userId: u.id,
            username: u.username,
            weekSummary: {
              totalTasks: 0,
              totalSpent: 0,
              totalEstimate: 0
            },
            tasks: []
          };
        }

        users[u.id].tasks.push({
          taskId: task.id,
          taskName: task.name,
          listName: task.list?.name || 'No List',
          status: task.status?.status,
          startDate: start
            ? new Date(start).toLocaleDateString()
            : '--',
          dueDate: due
            ? new Date(due).toLocaleDateString()
            : '--',
          spent: task.time_spent || 0,
          estimate: task.time_estimate || 0
        });

        users[u.id].weekSummary.totalTasks += 1;
        users[u.id].weekSummary.totalSpent += task.time_spent || 0;
        users[u.id].weekSummary.totalEstimate += task.time_estimate || 0;
      });
    });

    return NextResponse.json({
      success: true,
      workload: Object.values(users),
      meta: {
        role: isAdmin ? 'admin' : 'member',
        userId: currentUserId
      }
    });

  } catch (e) {
    return NextResponse.json(
      { success: false, error: e.message },
      { status: 500 }
    );
  }
}
