import { NextResponse } from 'next/server';

const CLICKUP_TOKEN = process.env.CLICKUP_TOKEN;
const TEAM_ID = process.env.TEAM_ID;

async function fetchClickUpData(endpoint) {
  const response = await fetch(`https://api.clickup.com/api/v2${endpoint}`, {
    headers: { 'Authorization': CLICKUP_TOKEN, 'Content-Type': 'application/json' },
    cache: 'no-store'
  });
  if (!response.ok) throw new Error(`ClickUp Error: ${response.statusText}`);
  return response.json();
}

export async function GET() {
  try {
    const currentYear = new Date().getFullYear();
    const startTs = new Date(currentYear, 0, 1).getTime(); // Jan 1st
    const endTs = new Date(currentYear, 11, 31, 23, 59, 59).getTime(); // Dec 31st

    let allTasks = [];
    let page = 0;
    let hasMore = true;

    // PAGINATION: Saara data uthane ke liye
    while (hasMore) {
      const tasksData = await fetchClickUpData(
        `/team/${TEAM_ID}/task?subtasks=true&include_closed=false&due_date_gt=${startTs}&due_date_lt=${endTs}&page=${page}`
      );
      if (tasksData.tasks?.length > 0) {
        allTasks = [...allTasks, ...tasksData.tasks];
        page++;
      } else {
        hasMore = false;
      }
      if (page > 20) break; // Max 2000 tasks safety
    }

    const teamData = await fetchClickUpData(`/team/${TEAM_ID}`);
    const processed = processWorkload(allTasks, teamData.team.members, startTs, endTs);

    return NextResponse.json(processed);
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

function processWorkload(tasks, members, startTs, endTs) {
  const dates = [];
  let curr = new Date(startTs);
  while (curr <= new Date(endTs)) {
    dates.push(new Date(curr).toISOString().split('T')[0]);
    curr.setDate(curr.getDate() + 1);
  }

  const memberStats = {};
  members.forEach(m => { memberStats[m.user.id] = { dailyLoad: {} }; });

 tasks.forEach(task => {
    if (!task.due_date) return;
    const dKey = new Date(parseInt(task.due_date)).toISOString().split('T')[0];

    const hrs = (task.time_estimate || 0) / 3600000;
    const spt = (task.time_spent || 0) / 3600000;

    const assigneesCount = task.assignees?.length || 1;
    // Agar split karna hai toh estimate ko divide karein
    const splitHrs = hrs / assigneesCount;

    task.assignees?.forEach(a => {
      if (memberStats[a.id]) {
        // Yahan splitHrs use karein taake total team capacity sahi rahe
        memberStats[a.id].dailyLoad[dKey] = (memberStats[a.id].dailyLoad[dKey] || 0) + splitHrs;
      }
    });

    // Individual task details ke liye original value hi rakhein
    task.formattedHours = hrs.toFixed(1) + 'h';
    task.formattedSpent = spt.toFixed(1) + 'h';
  });

  return { dates, members, tasks, memberStats };
}