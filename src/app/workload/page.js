'use client';
import { useEffect, useState, useMemo } from 'react';
import { Clock, Zap, Calendar,Activity, ChevronLeft, ChevronRight, RotateCcw, Search, Users, X, Filter, PlusCircle } from 'lucide-react';
import Link from 'next/link';



export default function WorkloadDashboard() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedUsers, setSelectedUsers] = useState([]);
  const [showFilters, setShowFilters] = useState(false);

  const getMonday = (d) => {
    d = new Date(d);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(d.setDate(diff));
    monday.setHours(0, 0, 0, 0);
    return monday;
  };

  const [currentViewDate, setCurrentViewDate] = useState(getMonday(new Date()));
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

  const resetToCurrent = () => setCurrentViewDate(getMonday(new Date()));
    const logout = () => {
      localStorage.removeItem(ACCESS_TOKEN_KEY);
      setAccessToken(null);
      handleRedirectToClickUp();
    };

  const formatTime = (ms) => {
    if (!ms || ms === 0) return '0h';
    const hours = Math.floor(ms / 3600000);
    const minutes = Math.floor((ms % 3600000) / 60000);
    return `${hours}h ${minutes}m`;
  };

  const toggleUser = (userId) => {
    setSelectedUsers(prev =>
      prev.includes(userId) ? prev.filter(id => id !== userId) : [...prev, userId]
    );
  };

  const toggleAllUsers = () => {
    if (selectedUsers.length === data.length) {
      setSelectedUsers([]);
    } else {
      setSelectedUsers(data.map(u => u.userId));
    }
  };

  const filteredData = useMemo(() => {
    // Agar kuch select nahi hai toh sara data dikhao, warna filter karo
    let result = selectedUsers.length === 0
      ? data
      : data.filter(user => selectedUsers.includes(user.userId));

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(user => {
        const matchesUsername = user.username.toLowerCase().includes(query);
        const matchesTasks = user.dailyBreakdown.some(day =>
          day.tasks.some(task =>
            task.taskName.toLowerCase().includes(query) ||
            task.listName.toLowerCase().includes(query) ||
            task.status.toLowerCase().includes(query)
          )
        );
        return matchesUsername || matchesTasks;
      });
    }
    return result;
  }, [data, selectedUsers, searchQuery]);

  return (
    <div className="min-h-screen bg-[#F8FAFC] p-4 md:p-10">
      <div className="max-w-6xl mx-auto">

        {/* HEADER */}
     <header className="mb-8 pb-6 border-b-2 border-indigo-100">
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
          <div>
            <h1 className="text-4xl font-bold text-gray-800 flex items-center gap-3 mb-2">
              <div className="relative p-2 bg-gradient-to-br from-green-500 to-emerald-600 rounded-xl shadow-lg">
                <Activity className="w-8 h-8 text-white animate-pulse" />
                <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full animate-ping"></span>
              </div>
              Live Running Timers
            </h1>
            <p className="text-gray-600 ml-16">Real-time activity monitoring</p>
          </div>

          <div className="flex flex-wrap items-center gap-3">



            <Link href="/">
              <button className="flex items-center gap-2 px-5 py-2 bg-white text-gray-700 rounded-xl shadow-md hover:shadow-lg transition-all text-sm font-semibold">
                <Clock className="w-4 h-4" />
                Time Tracker
              </button>
            </Link>
             <Link href="/attendance">
                          <button className="flex items-center gap-2 px-5 py-2 bg-white text-gray-700 rounded-xl shadow-md hover:shadow-lg transition-all text-sm font-semibold">

                            Active Hours
                          </button>
                        </Link>
                        <Link href="/running-timers">
                          <button className="flex items-center gap-2 px-5 py-2 bg-white text-gray-700 rounded-xl shadow-md hover:shadow-lg transition-all text-sm font-semibold">
                            <Calendar className="w-4 h-4" />
                           Running Timers
                          </button>
                        </Link>

            <button
              onClick={logout}
              className="flex items-center gap-2 px-5 py-2 bg-white text-gray-700 rounded-xl shadow-md hover:shadow-lg transition-all text-sm font-semibold"
            >

              Logout
            </button>
          </div>
        </div>
      </header>

        {/* FILTERS SECTION */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

            {/* User Dropdown Filter */}
            <div>
              <label className="text-sm font-bold text-slate-700 mb-2 block flex items-center gap-2">
                <Users className="w-4 h-4 text-blue-600" />
                Select Members ({selectedUsers.length} selected)
              </label>
              <div className="relative">
                <button
                  onClick={() => setShowFilters(!showFilters)}
                  className={`w-full p-3 border-2 rounded-xl transition flex items-center justify-between ${selectedUsers.length > 0 ? 'border-blue-500 bg-blue-50' : 'border-slate-200 bg-slate-50'}`}
                >
                  <span className="text-sm font-bold text-slate-600">
                    {selectedUsers.length === 0 ? 'All members shown (Click to filter)' : `${selectedUsers.length} Users Selected`}
                  </span>
                  <ChevronRight className={`w-4 h-4 transition-transform ${showFilters ? 'rotate-90' : ''}`} />
                </button>

                {showFilters && (
                  <div className="absolute z-50 mt-2 w-full bg-white border-2 border-slate-200 rounded-xl shadow-xl max-h-80 overflow-y-auto animate-in fade-in zoom-in duration-150">
                    <div className="p-3 border-b border-slate-100 sticky top-0 bg-white flex justify-between">
                      <button onClick={toggleAllUsers} className="text-xs font-black text-blue-600 uppercase hover:underline">
                        {selectedUsers.length === data.length ? 'Unselect All' : 'Select All'}
                      </button>
                      <button onClick={() => setShowFilters(false)} className="text-xs font-black text-slate-400 uppercase">Close</button>
                    </div>
                    <div className="p-2">
                      {data.map(user => (
                        <label key={user.userId} className="flex items-center gap-3 p-3 hover:bg-slate-50 rounded-lg cursor-pointer transition">
                          <input
                            type="checkbox"
                            checked={selectedUsers.includes(user.userId)}
                            onChange={() => toggleUser(user.userId)}
                            className="w-5 h-5 text-blue-600 rounded border-slate-300 focus:ring-blue-500"
                          />
                          <div className="w-8 h-8 bg-slate-200 rounded-full flex items-center justify-center text-[10px] font-black uppercase">
                            {user.username.charAt(0)}
                          </div>
                          <span className="text-sm font-bold text-slate-700">{user.username}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Keyword Search */}
            <div>
              <label className="text-sm font-bold text-slate-700 mb-2 block flex items-center gap-2">
                <Search className="w-4 h-4 text-blue-600" />
                Quick Search
              </label>
              <input
                type="text"
                placeholder="Search tasks, status or lists..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full p-3 border-2 border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 bg-slate-50 font-medium"
              />
            </div>
          </div>
        </div>

        {/* RESULTS AREA */}
        {loading ? (
          <div className="flex justify-center py-20 italic text-slate-400">Loading data...</div>
        ) : (
          <div className="space-y-8">
            {filteredData.length > 0 ? filteredData.map((user) => (
              <div key={user.userId} className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden">

                {/* User Header */}
                <div className="p-6 bg-slate-50 border-b border-slate-100 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                  <div className="flex items-center gap-4">
                    <div className="w-14 h-14 bg-blue-600 rounded-2xl flex items-center justify-center text-white font-black text-xl shadow-md">
                      {user.username.charAt(0)}
                    </div>
                    <div>
                      <h2 className="text-xl font-black text-slate-900">{user.username}</h2>
                      <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Weekly Performance</p>
                    </div>
                  </div>

                  <div className="flex gap-4">
                    <div className="text-center bg-white px-4 py-2 rounded-xl border border-slate-100 min-w-[100px]">
                      <p className="text-[10px] font-black text-slate-400 uppercase">Tasks</p>
                      <p className="text-xl font-black text-slate-800">{user.weekSummary.totalTasks}</p>
                    </div>
                    <div className="text-center bg-white px-4 py-2 rounded-xl border border-slate-100 min-w-[100px]">
                      <p className="text-[10px] font-black text-slate-400 uppercase">Worked</p>
                      <p className="text-xl font-black text-blue-600">{formatTime(user.weekSummary.totalSpent)}</p>
                    </div>
                  </div>
                </div>

                {/* Daily Breakdown */}
                <div className="p-6 space-y-10">
                  {user.dailyBreakdown.map((day) => (
                    <div key={day.date} className="space-y-4">

                      {/* Day Header with Daily Totals */}
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex items-center gap-2 flex-1">
                          <span className="px-4 py-1 bg-slate-100 rounded-full text-xs font-black text-slate-600 uppercase tracking-wider whitespace-nowrap">
                            {day.dateLabel}
                          </span>
                          <div className="h-px w-full bg-slate-100"></div>
                        </div>

                        {/* Daily Total Summary */}
                        <div className="flex items-center gap-4 whitespace-nowrap">
                           <div className="text-right">
                             <p className="text-[9px] font-black text-slate-400 uppercase leading-none">Day Worked</p>
                             <p className="text-sm font-black text-slate-700">{formatTime(day.totalSpent)}</p>
                           </div>
                           <div className="text-right border-l pl-4 border-slate-100">
                             <p className="text-[9px] font-black text-slate-400 uppercase leading-none">Day Est.</p>
                             <p className="text-sm font-black text-blue-500">{formatTime(day.totalEstimate)}</p>
                           </div>
                        </div>
                      </div>

                  {/* Tasks List */}
<div className="grid grid-cols-1 gap-3">
  {day.tasks.map((task) => (
    <div key={`${day.date}-${task.taskId}`} className="flex items-center justify-between p-4 bg-white border border-slate-100 rounded-2xl hover:border-blue-200 hover:shadow-md transition-all group">
      <div className="flex-1">
        <div className="flex items-center gap-2 mb-1">
          <h4 className="font-bold text-slate-800 group-hover:text-blue-600 transition-colors">{task.taskName}</h4>
          {task.type === 'created' && <span className="text-[9px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded font-black uppercase">New Task</span>}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[10px] font-medium text-slate-400 bg-slate-50 px-2 py-0.5 rounded">{task.listName}</span>
          <span className="text-[10px] font-black text-blue-500 uppercase">{task.status}</span>
        </div>
      </div>

      <div className="text-right flex items-center gap-6">
        {/* Yahan Estimate Time add kiya hai */}
        <div className="border-r pr-6 border-slate-100">
          <p className="text-xs font-black text-blue-500">{task.estimate ? formatTime(task.estimate) : '0h'}</p>
          <p className="text-[9px] font-bold text-slate-400 uppercase">Estimate</p>
        </div>

        <div>
          <p className={`text-xs font-black ${task.trackedToday > task.estimate && task.estimate > 0 ? 'text-red-500' : 'text-slate-700'}`}>
            {formatTime(task.trackedToday)}
          </p>
          <p className="text-[9px] font-bold text-slate-400 uppercase">Log</p>
        </div>

        <div className="w-20 hidden sm:block">
          <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full ${task.trackedToday > task.estimate && task.estimate > 0 ? 'bg-red-400' : 'bg-blue-400'}`}
              style={{ width: `${Math.min((task.trackedToday / task.estimate) * 100 || 0, 100)}%` }}
            ></div>
          </div>
        </div>
      </div>
    </div>
  ))}
</div>
                    </div>
                  ))}
                </div>
              </div>
            )) : (
              <div className="bg-white p-20 rounded-3xl border-2 border-dashed border-slate-200 text-center">
                <Users className="w-10 h-10 text-slate-300 mx-auto mb-4" />
                <h3 className="text-xl font-bold text-slate-800 mb-2">No results found</h3>
                <p className="text-slate-500">Try changing your search or selecting different members.</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}