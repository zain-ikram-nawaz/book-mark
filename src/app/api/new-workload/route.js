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
    // POORE SAAL KA RANGE
    const startTs = new Date(currentYear, 0, 1).getTime(); // Jan 1st
    const endTs = new Date(currentYear, 11, 31, 23, 59, 59).getTime(); // Dec 31st

    // 1. Fetch Tasks (Pagination ke saath poore saal ka data)
    let allTasks = [];
    let page = 0;
    let hasMore = true;
    while (hasMore && page < 15) { // Max 1500 tasks tak fetch karega safety ke liye
      const tasksData = await fetchClickUpData(
        `/team/${TEAM_ID}/task?subtasks=true&include_closed=false&due_date_gt=${startTs}&due_date_lt=${endTs}&page=${page}`
      );
      if (tasksData.tasks?.length > 0) {
        allTasks = [...allTasks, ...tasksData.tasks];
        page++;
      } else { hasMore = false; }
    }

    // 2. Fetch Time Entries (Isme agar data bohot zyada hai toh range thodi kam karni pad sakti hai)
    const timeEntriesData = await fetchClickUpData(
      `/team/${TEAM_ID}/time_entries?start_date=${startTs}&end_date=${endTs}`
    );

    const teamData = await fetchClickUpData(`/team/${TEAM_ID}`);

    const processed = processWorkload(
      allTasks,
      teamData.team.members,
      timeEntriesData.data || [],
      startTs,
      endTs
    );

    return NextResponse.json(processed);
  } catch (error) {
    console.error("Backend Error:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

function processWorkload(tasks, members, timeEntries, startTs, endTs) {
  const dates = [];
  let curr = new Date(startTs);
  while (curr <= new Date(endTs)) {
    dates.push(curr.toISOString().split('T')[0]);
    curr.setDate(curr.getDate() + 1);
  }

  // Tasks ko map karke sirf zaroori aur rounded data nikalna
  const cleanedTasks = tasks.map(task => {
    // ClickUp time_estimate milliseconds mein deta hai
    // Hum use hours mein convert karke 1 decimal tak round kar rahe hain (e.g., 1.2)
    const hoursEstimate = task.time_estimate
      ? parseFloat((task.time_estimate / 3600000).toFixed(1))
      : 0;

    return {
      id: task.id,
      name: task.name,
      status: task.status,
      start_date: task.start_date,
      due_date: task.due_date,
      assignees: task.assignees?.map(a => ({ id: a.id })), // Sirf ID kaafi hai frontend ke liye
      list: task.list, // List filter ke liye zaroori hai
      time_estimate_hours: hoursEstimate, // Naya field rounded hours ke sath
    };
  });

  // Time Entries ko bhi clean karna
  const cleanedTimeEntries = timeEntries.map(entry => ({
    id: entry.id,
    task_id: entry.task?.id,
    user_id: entry.user?.id,
    start: entry.start,
    duration_hours: parseFloat((parseInt(entry.duration) / 3600000).toFixed(1))
  }));

  return {
    dates,
    members,
    tasks: cleanedTasks,
    timeEntries: cleanedTimeEntries
  };
}