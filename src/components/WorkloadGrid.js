'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  Download,
  X,
  Calendar,
  Clock,
  User,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  ChevronRight,
  Filter
} from 'lucide-react';

// --- Constants ---
const COL_W = 120; // Slightly smaller for better fit
const TASK_H = 40;
const GAP = 8;
const HEADER_H = 60;
const SIDEBAR_W = 280;

// --- Mock Data Helpers (Replace with your actual data logic) ---
// Assuming 'data' prop structure remains similar to original

export default function WorkloadGrid({ data, filters }) {
  // Fallback if data is missing for demo purposes
  const safeData = data || {
    dates: Array.from({ length: 14 }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() + i);
      return d.toISOString().split('T')[0];
    }),
    members: [
      { user: { id: 1, username: "Alex Design", profilePicture: "https://i.pravatar.cc/150?u=1" } },
      { user: { id: 2, username: "Sarah Dev", profilePicture: "https://i.pravatar.cc/150?u=2" } },
      { user: { id: 3, username: "Mike Product", profilePicture: "https://i.pravatar.cc/150?u=3" } },
    ],
    tasks: [
      { id: 101, name: "Homepage Redesign", start_date: new Date().getTime(), due_date: new Date(Date.now() + 86400000 * 2).getTime(), assignees: [{id: 1, username: "Alex Design"}], formattedHours: "12", formattedSpent: "4", status: { status: "In Progress", color: "#3b82f6" }, url: "#" },
      { id: 102, name: "API Integration", start_date: new Date(Date.now() + 86400000 * 1).getTime(), due_date: new Date(Date.now() + 86400000 * 4).getTime(), assignees: [{id: 2, username: "Sarah Dev"}], formattedHours: "20", formattedSpent: "20", status: { status: "Done", color: "#10b981" }, url: "#" },
      { id: 103, name: "User Research", start_date: new Date(Date.now() + 86400000 * 3).getTime(), due_date: new Date(Date.now() + 86400000 * 5).getTime(), assignees: [{id: 3, username: "Mike Product"}], formattedHours: "8", formattedSpent: "10", status: { status: "At Risk", color: "#f59e0b" }, url: "#" },
      { id: 104, name: "Bug Fixes", start_date: new Date(Date.now() + 86400000 * 0).getTime(), due_date: new Date(Date.now() + 86400000 * 1).getTime(), assignees: [{id: 2, username: "Sarah Dev"}], formattedHours: "4", formattedSpent: "2", status: { status: "Review", color: "#8b5cf6" }, url: "#" },
    ],
    memberStats: {
      1: { dailyLoad: { [new Date().toISOString().split('T')[0]]: 6 } },
      2: { dailyLoad: { [new Date().toISOString().split('T')[0]]: 8 } },
      3: { dailyLoad: {} }
    }
  };

  const { dates, members, tasks, memberStats } = safeData;
  const [selectedTask, setSelectedTask] = useState(null);
  const [isScrolled, setIsScrolled] = useState(false);

  // Scroll to today on load
  useEffect(() => {
    const today = new Date().toISOString().split('T')[0];
    const el = document.getElementById(`day-${today}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
    }
  }, []);

  // Handle scroll for shadow effects
  const handleScroll = (e) => {
    setIsScrolled(e.target.scrollLeft > 10);
  };

  // CSV Download Logic (Robust)
  const downloadCSV = () => {
    try {
      let csvRows = ["Task ID,Task Name,Assignee,Start Date,Due Date,Estimated Hours,Spent Hours,Status"];
      tasks.forEach(t => {
        const startDate = t.start_date ? new Date(parseInt(t.start_date)).toISOString().split('T')[0] : 'N/A';
        const dueDate = t.due_date ? new Date(parseInt(t.due_date)).toISOString().split('T')[0] : 'N/A';
        const assigneeNames = t.assignees?.map(a => a.username).join('; ') || 'Unassigned';
        const est = parseFloat(t.formattedHours) || 0;
        const spent = parseFloat(t.formattedSpent) || 0;
        const status = t.status?.status || 'No Status';

        // Escape quotes for CSV
        const safeName = t.name ? t.name.replace(/"/g, '""') : '';

        csvRows.push(`${t.id},"${safeName}","${assigneeNames}",${startDate},${dueDate},${est},${spent},"${status}"`);
      });

      const blob = new Blob([csvRows.join("\n")], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `Workload_Report_${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (error) {
      console.error("Download failed:", error);
    }
  };

  // --- Stacking Logic ---
  const getLeveledTasks = (mId) => {
    const mTasks = tasks.filter(t => t.assignees?.some(a => a.id === mId))
                        .sort((a, b) => (a.start_date || a.due_date) - (b.start_date || b.due_date));
    const levels = [];
    return mTasks.map(t => {
      const start = t.start_date ? parseInt(t.start_date) : parseInt(t.due_date);
      let lvl = 0;
      while (levels[lvl] && levels[lvl] > start) lvl++;
      levels[lvl] = parseInt(t.due_date);
      return { ...t, lvl };
    });
  };

  const filteredMembers = members.filter(m =>
    filters?.memberId === 'all' || m.user.id.toString() === filters?.memberId
  );

  return (
    <div className="flex flex-col h-screen bg-slate-50 text-slate-900 font-sans overflow-hidden">

      {/* --- Top Navigation / Header --- */}
      <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-6 flex-shrink-0 z-20 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="bg-indigo-600 p-2 rounded-lg">
            <Calendar className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-800 leading-tight">Workload Overview</h1>
            <p className="text-xs text-slate-500">Team capacity & task distribution</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-slate-600 bg-slate-100 rounded-md hover:bg-slate-200 transition-colors">
            <Filter className="w-4 h-4" />
            <span className="hidden sm:inline">Filter View</span>
          </button>
          <button
            onClick={downloadCSV}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-slate-900 rounded-lg hover:bg-slate-800 transition-all shadow-lg shadow-slate-900/20 active:scale-95"
          >
            <Download className="w-4 h-4" />
            <span>Export CSV</span>
          </button>
        </div>
      </header>

      {/* --- Main Content Area --- */}
      <div className="flex flex-1 overflow-hidden relative">

        {/* Sidebar (Members List) */}
        <div className="w-64 bg-white border-r border-slate-200 flex-shrink-0 overflow-y-auto hidden md:block z-10 shadow-[4px_0_24px_rgba(0,0,0,0.02)]">
          <div className="h-[61px] border-b border-slate-100 bg-slate-50/50 backdrop-blur-sm sticky top-0 z-10 flex items-center px-6">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Team Members</span>
          </div>
          <div className="pb-4">
            {filteredMembers.map(m => {
               const leveledTasks = getLeveledTasks(m.user.id);
               const maxLvl = leveledTasks.length > 0 ? Math.max(...leveledTasks.map(t => t.lvl)) : 0;
               const rowHeight = (maxLvl + 1) * (TASK_H + GAP) + 40; // 40 for padding

               return (
                <div
                  key={m.user.id}
                  style={{ height: rowHeight }}
                  className="flex items-center px-6 border-b border-slate-50 hover:bg-slate-50 transition-colors group"
                >
                  <div className="flex items-center gap-3 w-full">
                    <div className="relative">
                      <img
                        src={m.user.profilePicture}
                        alt={m.user.username}
                        className="w-10 h-10 rounded-full object-cover border-2 border-white shadow-sm group-hover:scale-110 transition-transform"
                      />
                      <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 border-2 border-white rounded-full"></div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-700 truncate">{m.user.username}</p>
                      <p className="text-xs text-slate-400 truncate">{leveledTasks.length} Active Tasks</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Timeline Area */}
        <div className="flex-1 overflow-x-auto overflow-y-auto bg-slate-50/50 relative" onScroll={handleScroll}>

          {/* Timeline Header (Dates) */}
          <div className="flex sticky top-0 z-10 bg-white/90 backdrop-blur-md border-b border-slate-200 shadow-sm" style={{ minWidth: dates.length * COL_W }}>
            {dates.map((d, i) => {
              const isToday = d === new Date().toISOString().split('T')[0];
              const dateObj = new Date(d);
              return (
                <div
                  key={d}
                  id={`day-${d}`}
                  style={{ width: COL_W }}
                  className={`flex-shrink-0 border-r border-slate-100 py-3 flex flex-col items-center justify-center transition-colors ${isToday ? 'bg-indigo-50/50' : ''}`}
                >
                  <span className={`text-[10px] font-bold uppercase mb-1 ${isToday ? 'text-indigo-600' : 'text-slate-400'}`}>
                    {dateObj.toLocaleDateString('en-US', { weekday: 'short' })}
                  </span>
                  <span className={`text-sm font-bold ${isToday ? 'text-indigo-700 bg-indigo-100 w-8 h-8 flex items-center justify-center rounded-full' : 'text-slate-700'}`}>
                    {dateObj.getDate()}
                  </span>
                  {isToday && <div className="absolute bottom-0 w-full h-0.5 bg-indigo-500"></div>}
                </div>
              );
            })}
          </div>

          {/* Timeline Body (Rows) */}
          <div style={{ minWidth: dates.length * COL_W }}>
            {filteredMembers.map(m => {
              const leveledTasks = getLeveledTasks(m.user.id);
              const maxLvl = leveledTasks.length > 0 ? Math.max(...leveledTasks.map(t => t.lvl)) : 0;
              const rowHeight = (maxLvl + 1) * (TASK_H + GAP) + 40;

              return (
                <div key={m.user.id} style={{ height: rowHeight }} className="relative border-b border-slate-100 group hover:bg-white transition-colors">

                  {/* Grid Lines Background */}
                  <div className="absolute inset-0 flex pointer-events-none">
                    {dates.map(d => (
                      <div key={d} style={{ width: COL_W }} className="border-r border-slate-100 h-full"></div>
                    ))}
                  </div>

                  {/* Daily Load Indicator (Optional visual flair) */}
                  <div className="absolute top-2 left-0 w-full flex pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity">
                     {dates.map(d => {
                        const load = memberStats[m.user.id]?.dailyLoad[d];
                        if (!load) return <div key={d} style={{ width: COL_W }}></div>;
                        return (
                          <div key={d} style={{ width: COL_W }} className="flex justify-center">
                            <div className="bg-slate-200 text-slate-500 text-[9px] font-bold px-1.5 py-0.5 rounded-full">
                              {load}h
                            </div>
                          </div>
                        );
                     })}
                  </div>

                  {/* Task Bars */}
                  <div className="relative pt-8 pb-4 px-2">
                    {leveledTasks.map(t => {
                      const pos = calculateTaskPosition(t, dates[0]);
                      const isOverdue = parseFloat(t.formattedSpent) > parseFloat(t.formattedHours);

                      return (
                        <div
                          key={t.id}
                          onClick={() => setSelectedTask(t)}
                          style={{
                            left: pos.left,
                            width: pos.width,
                            top: t.lvl * (TASK_H + GAP),
                            backgroundColor: t.status?.color || '#64748b',
                          }}
                          className={`
                            absolute h-[${TASK_H}px] rounded-md shadow-sm cursor-pointer
                            flex items-center px-3 overflow-hidden
                            transition-all duration-300 ease-out
                            hover:shadow-lg hover:brightness-110 hover:z-20 hover:scale-[1.01]
                            border border-white/10 backdrop-blur-sm
                          `}
                        >
                          {/* Progress Bar Background */}
                          <div
                            className="absolute left-0 top-0 bottom-0 bg-black/10 w-full origin-left"
                            style={{ transform: `scaleX(${Math.min(1, parseFloat(t.formattedSpent) / (parseFloat(t.formattedHours) || 1))})` }}
                          ></div>

                          <div className="relative z-10 flex flex-col justify-center w-full">
                            <div className="flex items-center justify-between w-full gap-2">
                              <span className="text-xs font-bold text-white truncate drop-shadow-md">
                                {t.name}
                              </span>
                              {isOverdue && <AlertCircle className="w-3 h-3 text-orange-200 flex-shrink-0" />}
                            </div>
                            <div className="flex items-center gap-2 text-[10px] text-white/80 font-medium mt-0.5">
                              <span>{t.formattedHours}h</span>
                              <span className="w-1 h-1 rounded-full bg-white/40"></span>
                              <span className={isOverdue ? 'text-orange-200 font-bold' : ''}>{t.formattedSpent}h spent</span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* --- Detail Sidebar (Slide-over) --- */}
      {selectedTask && (
        <div className="fixed inset-0 z-50 flex justify-end">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-slate-900/20 backdrop-blur-sm transition-opacity"
            onClick={() => setSelectedTask(null)}
          ></div>

          {/* Panel */}
          <div className="relative w-full max-w-md bg-white h-full shadow-2xl flex flex-col animate-in slide-in-from-right duration-300">

            {/* Sidebar Header */}
            <div className="p-6 border-b border-slate-100 flex items-start justify-between bg-slate-50/50">
              <div className="flex items-center gap-3">
                <div
                  className="w-3 h-10 rounded-full"
                  style={{ backgroundColor: selectedTask.status?.color || '#64748b' }}
                ></div>
                <div>
                  <div className="flex items-center gap-2 text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">
                    <span>Task Details</span>
                    <span className="w-1 h-1 rounded-full bg-slate-300"></span>
                    <span>ID: {selectedTask.id}</span>
                  </div>
                  <h2 className="text-xl font-bold text-slate-800 leading-tight">{selectedTask.name}</h2>
                </div>
              </div>
              <button
                onClick={() => setSelectedTask(null)}
                className="p-2 hover:bg-slate-200 rounded-full text-slate-400 hover:text-slate-600 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Sidebar Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-8">

              {/* Status & Assignees */}
              <div className="space-y-4">
                <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl border border-slate-100">
                  <span className="text-sm font-medium text-slate-500">Status</span>
                  <span
                    className="px-3 py-1 rounded-full text-xs font-bold text-white shadow-sm"
                    style={{ backgroundColor: selectedTask.status?.color || '#64748b' }}
                  >
                    {selectedTask.status?.status || 'Unknown'}
                  </span>
                </div>

                <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl border border-slate-100">
                  <span className="text-sm font-medium text-slate-500">Assignees</span>
                  <div className="flex -space-x-2">
                    {selectedTask.assignees?.map((a, i) => (
                      <img
                        key={i}
                        src={a.profilePicture || `https://i.pravatar.cc/150?u=${a.id}`}
                        alt={a.username}
                        className="w-8 h-8 rounded-full border-2 border-white"
                        title={a.username}
                      />
                    ))}
                  </div>
                </div>
              </div>

              {/* Time Stats */}
              <div className="grid grid-cols-2 gap-4">
                <div className="p-5 rounded-2xl bg-indigo-50 border border-indigo-100 relative overflow-hidden group">
                  <div className="absolute right-0 top-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                    <Clock className="w-12 h-12 text-indigo-600" />
                  </div>
                  <p className="text-xs font-bold text-indigo-400 uppercase mb-1">Estimated</p>
                  <p className="text-2xl font-black text-indigo-700">{selectedTask.formattedHours}h</p>
                </div>

                <div className={`p-5 rounded-2xl border relative overflow-hidden group ${
                  parseFloat(selectedTask.formattedSpent) > parseFloat(selectedTask.formattedHours)
                    ? 'bg-orange-50 border-orange-100'
                    : 'bg-emerald-50 border-emerald-100'
                }`}>
                  <div className={`absolute right-0 top-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity ${
                     parseFloat(selectedTask.formattedSpent) > parseFloat(selectedTask.formattedHours) ? 'text-orange-600' : 'text-emerald-600'
                  }`}>
                    <CheckCircle2 className="w-12 h-12" />
                  </div>
                  <p className={`text-xs font-bold uppercase mb-1 ${
                     parseFloat(selectedTask.formattedSpent) > parseFloat(selectedTask.formattedHours) ? 'text-orange-400' : 'text-emerald-400'
                  }`}>Spent</p>
                  <p className={`text-2xl font-black ${
                     parseFloat(selectedTask.formattedSpent) > parseFloat(selectedTask.formattedHours) ? 'text-orange-700' : 'text-emerald-700'
                  }`}>{selectedTask.formattedSpent}h</p>
                </div>
              </div>

              {/* Dates */}
              <div className="space-y-3">
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-slate-400" />
                  Timeline
                </h3>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500">Start Date</span>
                    <span className="font-medium text-slate-700">
                      {selectedTask.start_date ? new Date(parseInt(selectedTask.start_date)).toLocaleDateString() : 'Not Set'}
                    </span>
                  </div>
                  <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full bg-indigo-500 w-2/3"></div>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500">Due Date</span>
                    <span className="font-medium text-slate-700">
                      {selectedTask.due_date ? new Date(parseInt(selectedTask.due_date)).toLocaleDateString() : 'Not Set'}
                    </span>
                  </div>
                </div>
              </div>

            </div>

            {/* Sidebar Footer */}
            <div className="p-6 border-t border-slate-100 bg-slate-50">
              <button
                onClick={() => window.open(selectedTask.url, '_blank')}
                className="w-full py-3.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-bold flex items-center justify-center gap-2 transition-all shadow-lg shadow-slate-900/20 active:scale-[0.98]"
              >
                <span>Open in ClickUp</span>
                <ExternalLink className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// --- Helper Functions ---

function calculateTaskPosition(task, viewStartStr) {
  const start = new Date(task.start_date ? parseInt(task.start_date) : parseInt(task.due_date));
  const end = new Date(parseInt(task.due_date));
  const vStart = new Date(viewStartStr);

  // Normalize times to midnight for accurate day diff
  start.setHours(0,0,0,0);
  vStart.setHours(0,0,0,0);

  const diffTime = start - vStart;
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

  // Duration calculation (inclusive of start day)
  const durationTime = end - start;
  const durationDays = Math.max(1, Math.ceil(durationTime / (1000 * 60 * 60 * 24)) + 1);

  // Add padding (10px) to left, subtract 20px from width for visual gap
  return {
    left: (diffDays * COL_W) + 4,
    width: (durationDays * COL_W) - 8
  };
}