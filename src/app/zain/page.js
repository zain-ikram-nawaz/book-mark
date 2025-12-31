'use client';
import { useEffect, useState } from 'react';
import { Clock, Zap, Calendar, ChevronLeft, ChevronRight, RotateCcw } from 'lucide-react';

export default function WorkloadDashboard() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);

  // Current Week ka Start (Monday) nikalne ka logic
  const getMonday = (d) => {
    d = new Date(d);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(d.setDate(diff));
    monday.setHours(0, 0, 0, 0);
    return monday;
  };

  const [currentViewDate, setCurrentViewDate] = useState(getMonday(new Date()));

  // Dates ko format karne ke liye (YYYY-MM-DD)
  const formatDate = (date) => date.toISOString().split('T')[0];

  const fetchWorkload = async (date) => {
    setLoading(true);
    const token = localStorage.getItem('clickup_access_token');

    const start = formatDate(date);
    const endDate = new Date(date);
    endDate.setDate(date.getDate() + 6);
    const end = formatDate(endDate);

    try {
      const res = await fetch(`/api/workload?start=${start}&end=${end}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const d = await res.json();
      setData(d.workload || []);
    } catch (err) {
      console.error("Fetch Error:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchWorkload(currentViewDate);
  }, [currentViewDate]);

  // Navigation Handlers
  const nextWeek = () => {
    const next = new Date(currentViewDate);
    next.setDate(currentViewDate.getDate() + 7);
    setCurrentViewDate(next);
  };

  const prevWeek = () => {
    const prev = new Date(currentViewDate);
    prev.setDate(currentViewDate.getDate() - 7);
    setCurrentViewDate(prev);
  };

  const resetToCurrent = () => {
    setCurrentViewDate(getMonday(new Date()));
  };

  const formatTime = (ms) => {
    if (!ms || ms === 0) return '0h';
    const hours = Math.floor(ms / 3600000);
    const minutes = Math.floor((ms % 3600000) / 60000);
    return `${hours}h ${minutes}m`;
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] p-4 md:p-10">
      <div className="max-w-5xl mx-auto">

        {/* --- HEADER & CONTROLS --- */}
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-10">
          <div>
            <h1 className="text-3xl font-black text-slate-900 flex items-center">
              <Zap className="w-8 h-8 mr-2 text-yellow-500 fill-yellow-500" />
              Workload Planner
            </h1>
            <p className="text-slate-500 font-medium italic">Viewing tasks active in the selected range</p>
          </div>

          <div className="flex items-center bg-white p-2 rounded-2xl shadow-sm border border-slate-200 gap-2">
            <button onClick={prevWeek} className="p-2 hover:bg-slate-100 rounded-xl transition-colors">
              <ChevronLeft className="w-5 h-5 text-slate-600" />
            </button>

            <div className="flex items-center px-4 gap-2 border-x border-slate-100">
              <Calendar className="w-4 h-4 text-blue-600" />
              <span className="font-bold text-sm text-slate-700 min-w-[180px] text-center">
                {currentViewDate.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}
                {' - '}
                {new Date(new Date(currentViewDate).setDate(currentViewDate.getDate() + 6)).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
              </span>
            </div>

            <button onClick={nextWeek} className="p-2 hover:bg-slate-100 rounded-xl transition-colors">
              <ChevronRight className="w-5 h-5 text-slate-600" />
            </button>

            <button onClick={resetToCurrent} title="Current Week" className="p-2 hover:bg-blue-50 hover:text-blue-600 rounded-xl transition-colors">
              <RotateCcw className="w-4 h-4" />
            </button>
          </div>
        </header>

        {loading ? (
          <div className="flex justify-center py-20 italic text-slate-400">Loading data for selected week...</div>
        ) : (
          <div className="space-y-8">
            {data.length > 0 ? data.map((user) => (
              <div key={user.userId} className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden">
                {/* User Info Bar */}
                <div className="p-6 bg-slate-50/50 border-b border-slate-100 flex justify-between items-center">
                  <div className="flex items-center space-x-4">
                    <div className="w-12 h-12 bg-blue-600 rounded-2xl flex items-center justify-center text-white font-black shadow-inner">
                      {user.username.charAt(0)}
                    </div>
                    <div>
                      <h2 className="text-lg font-bold text-slate-900">{user.username}</h2>
                      <p className="text-xs font-bold text-blue-600 uppercase tracking-tighter">{user.weekSummary.totalTasks} Tasks Tracked</p>
                    </div>
                  </div>
                  <div className="flex gap-4">
                    <div className="text-right border-r pr-4 border-slate-200">
                      <p className="text-[10px] font-bold text-slate-400 uppercase">Spent</p>
                      <p className="font-black text-slate-800">{formatTime(user.weekSummary.totalSpent)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] font-bold text-slate-400 uppercase">Estimate</p>
                      <p className="font-black text-blue-600">{formatTime(user.weekSummary.totalEstimate)}</p>
                    </div>
                  </div>
                </div>

                {/* Table */}
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead className="bg-slate-50/30 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                      <tr>
                        <th className="px-6 py-4">Task Details</th>
                        <th className="px-6 py-4">List / Status</th>
                        <th className="px-6 py-4 text-right">Time Tracking</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {user.tasks.map((task) => (
                        <tr key={task.taskId} className="group hover:bg-slate-50/80 transition-colors">
                          <td className="px-6 py-4">
                            <p className="font-bold text-slate-800 text-sm group-hover:text-blue-700">{task.taskName}</p>
                            <div className="flex gap-3 mt-1 text-[10px] font-medium text-slate-400">
                              <span>S: {task.startDate}</span>
                              <span>D: {task.dueDate}</span>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex flex-col gap-1">
                              <span className="text-[10px] font-bold text-slate-500 uppercase">{task.listName}</span>
                              <span className="inline-flex w-fit px-2 py-0.5 rounded-full text-[9px] font-black bg-slate-100 text-slate-600 uppercase">
                                {task.status}
                              </span>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-right">
                            <p className="text-sm font-black text-slate-700">{formatTime(task.spent)} / {formatTime(task.estimate)}</p>
                            <div className="w-24 h-1 bg-slate-100 rounded-full ml-auto mt-2 overflow-hidden">
                              <div
                                className={`h-full ${task.spent > task.estimate ? 'bg-red-500' : 'bg-blue-500'}`}
                                style={{ width: `${Math.min((task.spent/task.estimate)*100 || 0, 100)}%` }}
                              />
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )) : (
              <div className="bg-white p-20 rounded-3xl border border-dashed border-slate-300 text-center">
                <p className="text-slate-400 font-medium">No tasks found for this week's plan.</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}