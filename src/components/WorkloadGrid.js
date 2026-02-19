'use client';
import { useState, useEffect, useMemo, useRef } from 'react';
import { Clock, Filter } from 'lucide-react';

const COL_W = 120;
const TASK_H = 38;
const GAP = 8;
const SIDEBAR_W = 260;

const toLocalDateOnly = (ts) => {
  if (!ts) return null;
  const d = new Date(Number(ts));
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
};

// Round to 1 decimal place
function round1dec(num) {
  return Math.round(num * 10) / 10;
}

function calculateTaskPosition(task, viewStartStr) {
  const start = toLocalDateOnly(task.start_date || task.due_date);
  const end = toLocalDateOnly(task.due_date);
  const vStartParts = viewStartStr.split('-');
  const vStart = new Date(
    Number(vStartParts[0]),
    Number(vStartParts[1]) - 1,
    Number(vStartParts[2])
  );
  const oneDayMs = 24 * 60 * 60 * 1000;
  const diffDays = Math.floor((start - vStart) / oneDayMs);
  const durationDays = Math.floor((end - start) / oneDayMs) + 1;
  return {
    left: (diffDays * COL_W) + 5,
    width: Math.max((durationDays * COL_W) - 10, 20)
  };
}

const fetcher = url => fetch(url).then(res => res.json());

export default function WorkloadPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filters, setFilters] = useState({ memberId: 'all', listId: 'all' });

  useEffect(() => {
    fetcher('/api/new-workload')
      .then(setData)
      .catch(setError)
      .finally(() => setLoading(false));
  }, []);

  const uniqueLists = useMemo(() => {
    if (!data?.tasks) return [];
    const listMap = new Map();
    data.tasks.forEach(t => {
      if (t.list?.id) listMap.set(t.list.id, t.list.name);
    });
    return Array.from(listMap, ([id, name]) => ({ id, name }));
  }, [data]);

  if (error) return <div className="p-10 text-red-500 font-mono">Error: {error.message}</div>;
  if (loading) return <div className="p-10 font-bold animate-pulse text-slate-400 text-xs">LOADING SYNCED DATA...</div>;

  return (
    <div className="flex flex-col h-screen bg-[#f8fafc]">
      <div className="h-12 bg-white border-b border-slate-200 flex items-center px-6 justify-between shrink-0 z-[110]">
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-indigo-600" />
          <h1 className="text-[11px] font-black uppercase text-slate-600 italic">Workload / 2026</h1>
        </div>
        <div className="flex gap-3">
          <div className="flex items-center gap-2">
            <Filter className="w-3 h-3 text-slate-400" />
            <select
              className="text-[10px] font-bold border border-slate-200 rounded px-2 py-1 bg-slate-50 outline-none"
              value={filters.listId}
              onChange={(e) => setFilters({ ...filters, listId: e.target.value })}
            >
              <option value="all">ALL LISTS</option>
              {uniqueLists.map(list => (
                <option key={list.id} value={list.id}>{list.name.toUpperCase()}</option>
              ))}
            </select>
          </div>
          <select
            className="text-[10px] font-bold border border-slate-200 rounded px-2 py-1 bg-slate-50 outline-none"
            value={filters.memberId}
            onChange={(e) => setFilters({ ...filters, memberId: e.target.value })}
          >
            <option value="all">ALL MEMBERS</option>
            {data.members.map(m => (
              <option key={m.user.id} value={m.user.id}>{m.user.username}</option>
            ))}
          </select>
        </div>
      </div>
      <WorkloadGrid data={data} filters={filters} />
    </div>
  );
}

function WorkloadGrid({ data, filters }) {
  const { dates = [], members = [], tasks = [] } = data;
  const scrollContainerRef = useRef(null);

  const todayPK = useMemo(() => {
    const today = new Date();
    return today.getFullYear() + '-' +
      String(today.getMonth() + 1).padStart(2, '0') + '-' +
      String(today.getDate()).padStart(2, '0');
  }, []);

  const filteredTasks = useMemo(() => {
    let ts = [...tasks];
    if (filters.listId !== 'all') ts = ts.filter(t => t.list?.id === filters.listId);
    return ts;
  }, [tasks, filters.listId]);

  const filteredMembers = useMemo(() => {
    if (filters.memberId === 'all') return members;
    return members.filter(m => m.user.id.toString() === filters.memberId.toString());
  }, [members, filters.memberId]);

  const calculatedStats = useMemo(() => {
    const stats = {};

    // Initialize
    filteredMembers.forEach(m => {
      stats[m.user.id] = { plannedLoad: {} };
      dates.forEach(d => {
        stats[m.user.id].plannedLoad[d] = 0;
      });
    });

    filteredTasks.forEach(task => {
      if (!task.due_date || !task.assignees?.length || !task.time_estimate_hours) return;

      const tStart = toLocalDateOnly(task.start_date || task.due_date);
      const tEnd = toLocalDateOnly(task.due_date);

      // Get working days (Mon-Sat, no Sunday)
      let workingDays = [];
      let runner = new Date(tStart);

      while (runner <= tEnd) {
        const dStr = runner.getFullYear() + '-' +
          String(runner.getMonth() + 1).padStart(2, '0') + '-' +
          String(runner.getDate()).padStart(2, '0');

        const dayOfWeek = runner.getDay();
        if (dayOfWeek !== 0) { // Skip Sunday only
          workingDays.push(dStr);
        }
        runner.setUTCDate(runner.getUTCDate() + 1);
      }

      if (workingDays.length === 0) return;

      // Calculate per day per user - ROUNDED to 1 decimal
      const totalHours = task.time_estimate_hours;
      const assigneeCount = task.assignees.length;

      // Per user total (rounded)
      const perUserTotal = round1dec(totalHours / assigneeCount);

      // Per day per user - EXPLICITLY ROUNDED to 1 decimal (yeh single task ki value hai)
      const perDayPerUser = round1dec(perUserTotal / workingDays.length);

      // Add SAME rounded value to every working day for every assignee
      workingDays.forEach((day) => {
        task.assignees.forEach(assignee => {
          if (!stats[assignee.id]?.plannedLoad.hasOwnProperty(day)) return;
          // Yahan bhi round karte hain addition ke baad
          stats[assignee.id].plannedLoad[day] = round1dec(stats[assignee.id].plannedLoad[day] + perDayPerUser);
        });
      });

      // Store for display (already rounded)
      task.dailyPlannedHours = perDayPerUser.toFixed(1);
    });

    return stats;
  }, [filteredTasks, filteredMembers, dates]);

  const getLeveledTasks = (mId) => {
    const mTasks = filteredTasks.filter(t => t.assignees?.some(a => a.id === mId))
      .sort((a, b) => toLocalDateOnly(a.start_date || a.due_date).getTime() - toLocalDateOnly(b.start_date || b.due_date).getTime());
    const levels = [];
    return mTasks.map(t => {
      const s = toLocalDateOnly(t.start_date || t.due_date).getTime();
      const e = toLocalDateOnly(t.due_date).getTime();
      let lvl = 0;
      while (levels[lvl] && levels[lvl] > s) lvl++;
      levels[lvl] = e;
      return { ...t, lvl };
    });
  };

  const dailyTeamTotal = useMemo(() => {
    const totals = {};
    dates.forEach(d => {
      let sum = 0;
      filteredMembers.forEach(m => {
        sum += calculatedStats[m.user.id]?.plannedLoad[d] || 0;
      });
      totals[d] = round1dec(sum).toFixed(1);
    });
    return totals;
  }, [dates, filteredMembers, calculatedStats]);

  return (
    <div className="flex flex-1 overflow-hidden">
      <div ref={scrollContainerRef} className="flex-1 overflow-auto custom-scrollbar">
        <div style={{ width: (dates.length * COL_W) + SIDEBAR_W }} className="relative min-h-full bg-white">
          <div className="flex sticky top-0 z-[60] bg-white border-b border-slate-200">
            <div className="w-[260px] p-5 border-r border-slate-200 sticky left-0 bg-white z-[61]">
              <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Resource</span>
            </div>
            {dates.map(d => {
              const parts = d.split('-');
              const dateObj = new Date(parts[0], parts[1] - 1, parts[2]);
              const isToday = d === todayPK;
              const isSunday = dateObj.getDay() === 0;

              return (
                <div key={d} style={{ width: COL_W }} className={`shrink-0 border-r border-slate-100 py-3 flex flex-col items-center ${isToday ? 'bg-indigo-50/50 relative shadow-[inset_0_-2px_0_#4f46e5]' : ''} ${isSunday ? 'bg-slate-100/50' : ''}`}>
                  <span className={`text-[8px] font-bold uppercase ${isToday ? 'text-indigo-600' : isSunday ? 'text-slate-400' : 'text-slate-500'}`}>
                    {dateObj.toLocaleDateString('en-US', { weekday: 'short' })}
                  </span>
                  <span className={`text-[13px] font-black ${isToday ? 'text-indigo-700' : isSunday ? 'text-slate-400' : 'text-slate-600'}`}>{dateObj.getDate()}</span>
                  <div className="mt-1 text-[9px] font-bold text-indigo-500/80">{dailyTeamTotal[d]}h</div>
                </div>
              );
            })}
          </div>

          {filteredMembers.map(m => {
            const leveledTasks = getLeveledTasks(m.user.id);
            const rowHeight = Math.max(160, (Math.max(0, ...leveledTasks.map(t => t.lvl)) + 1) * (TASK_H + GAP) + 110);
            return (
              <div key={m.user.id} style={{ height: rowHeight }} className="flex border-b border-slate-100 relative transition-colors hover:bg-slate-50/30">
                <div className="w-[260px] sticky left-0 z-40 bg-white border-r border-slate-200 p-4 flex items-center gap-3">
                  <img src={m.user.profilePicture} className="w-8 h-8 rounded-full border border-slate-100" alt="" />
                  <div className="min-w-0">
                    <p className="text-[11px] font-bold text-slate-700 truncate capitalize">{m.user.username}</p>
                    <p className="text-[8px] font-bold text-slate-400 uppercase tracking-tighter">Cap: 8h/day</p>
                  </div>
                </div>

                <div className="relative flex flex-1">
                  {dates.map(d => {
                    const parts = d.split('-');
                    const dateObj = new Date(parts[0], parts[1] - 1, parts[2]);
                    const isSunday = dateObj.getDay() === 0;
                    const scheduled = calculatedStats[m.user.id]?.plannedLoad[d] || 0;
                    const isToday = d === todayPK;

                    return (
                      <div key={d} style={{ width: COL_W }} className={`border-r border-slate-50/50 h-full flex flex-col items-center pt-2 ${isToday ? 'bg-indigo-50/5' : ''} ${isSunday ? 'bg-slate-100/30' : ''}`}>
                        {scheduled > 0 && !isSunday && (
                          <div className={`text-[9px] font-black px-2 py-0.5 rounded-full z-10 border shadow-sm ${scheduled > 8 ? 'bg-red-500 text-white' : 'bg-indigo-50 text-indigo-700 border-indigo-100'}`}>
                            {scheduled.toFixed(1)}h
                          </div>
                        )}
                        {isSunday && (
                          <div className="text-[8px] text-slate-300 font-bold mt-1">OFF</div>
                        )}
                      </div>
                    );
                  })}

                  <div className="absolute top-16 left-0 w-full h-full pointer-events-none px-2">
                    {leveledTasks.map(t => {
                      const pos = calculateTaskPosition(t, dates[0]);
                      return (
                        <div key={t.id}
                          style={{
                            left: pos.left,
                            width: pos.width,
                            top: t.lvl * (TASK_H + GAP),
                            backgroundColor: t.status?.color || '#cbd5e1'
                          }}
                          className="absolute h-[34px] rounded border border-black/5 flex items-center px-3 pointer-events-auto cursor-pointer shadow-sm hover:brightness-95 transition-all"
                        >
                          <div className="text-[9px] font-bold text-white truncate uppercase tracking-tight">
                            {t.name} <span className="opacity-70 text-[7px] ml-1">({t.dailyPlannedHours}h)</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <style jsx global>{`
        .custom-scrollbar::-webkit-scrollbar { width: 5px; height: 5px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #e2e8f0; border-radius: 10px; }
      `}</style>
    </div>
  );
}