'use client';
import { useEffect, useState, useMemo } from 'react';
import { Clock, Zap, Calendar, ChevronLeft, ChevronRight, RotateCcw, Search, Users, X, Filter } from 'lucide-react';

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

      // Auto-select all users on first load
      if (selectedUsers.length === 0 && d.workload?.length > 0) {
        setSelectedUsers(d.workload.map(u => u.userId));
      }
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

  const resetToCurrent = () => {
    setCurrentViewDate(getMonday(new Date()));
  };

  const formatTime = (ms) => {
    if (!ms || ms === 0) return '0h';
    const hours = Math.floor(ms / 3600000);
    const minutes = Math.floor((ms % 3600000) / 60000);
    return `${hours}h ${minutes}m`;
  };

  // Toggle user selection
  const toggleUser = (userId) => {
    setSelectedUsers(prev =>
      prev.includes(userId)
        ? prev.filter(id => id !== userId)
        : [...prev, userId]
    );
  };

  // Select/Deselect all users
  const toggleAllUsers = () => {
    if (selectedUsers.length === data.length) {
      setSelectedUsers([]);
    } else {
      setSelectedUsers(data.map(u => u.userId));
    }
  };

  // Clear all filters
  const clearFilters = () => {
    setSearchQuery('');
    setSelectedUsers(data.map(u => u.userId));
  };

  // Filtered data based on search and selected users
  const filteredData = useMemo(() => {
    return data.filter(user => {
      // Filter by selected users
      if (!selectedUsers.includes(user.userId)) return false;

      // Filter by search query
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const matchesUsername = user.username.toLowerCase().includes(query);

        // Search in tasks
        const matchesTasks = user.dailyBreakdown.some(day =>
          day.tasks.some(task =>
            task.taskName.toLowerCase().includes(query) ||
            task.listName.toLowerCase().includes(query) ||
            task.status.toLowerCase().includes(query)
          )
        );

        return matchesUsername || matchesTasks;
      }

      return true;
    });
  }, [data, selectedUsers, searchQuery]);

  return (
    <div className="min-h-screen bg-[#F8FAFC] p-4 md:p-10">
      <div className="max-w-6xl mx-auto">

        {/* HEADER */}
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-6">
          <div>
            <h1 className="text-3xl font-black text-slate-900 flex items-center">
              <Zap className="w-8 h-8 mr-2 text-yellow-500 fill-yellow-500" />
              Daily Workload Tracker
            </h1>
            <p className="text-slate-500 font-medium italic">Tasks grouped by tracking date</p>
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

        {/* FILTERS */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
              <Filter className="w-5 h-5 text-blue-600" />
              Filters
            </h3>
            {(searchQuery || selectedUsers.length !== data.length) && (
              <button
                onClick={clearFilters}
                className="flex items-center gap-2 px-3 py-1.5 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition text-sm font-medium"
              >
                <X className="w-4 h-4" />
                Clear All
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Search Filter */}
            <div>
              <label className="text-sm font-semibold text-slate-700 mb-2 block flex items-center gap-2">
                <Search className="w-4 h-4 text-blue-600" />
                Search
              </label>
              <input
                type="text"
                placeholder="Search users, tasks, lists..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full p-3 border-2 border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-slate-50 hover:bg-white transition"
              />
            </div>

            {/* User Filter */}
            <div>
              <label className="text-sm font-semibold text-slate-700 mb-2 block flex items-center gap-2">
                <Users className="w-4 h-4 text-blue-600" />
                Users ({selectedUsers.length}/{data.length})
              </label>
              <div className="relative">
                <button
                  onClick={() => setShowFilters(!showFilters)}
                  className="w-full p-3 border-2 border-slate-200 rounded-xl bg-slate-50 hover:bg-white transition text-left flex items-center justify-between"
                >
                  <span className="text-sm text-slate-700 font-medium">
                    {selectedUsers.length === 0
                      ? 'No users selected'
                      : selectedUsers.length === data.length
                      ? 'All users selected'
                      : `${selectedUsers.length} user${selectedUsers.length > 1 ? 's' : ''} selected`}
                  </span>
                  <ChevronRight className={`w-4 h-4 text-slate-400 transition-transform ${showFilters ? 'rotate-90' : ''}`} />
                </button>

                {showFilters && (
                  <div className="absolute z-10 mt-2 w-full bg-white border-2 border-slate-200 rounded-xl shadow-lg max-h-64 overflow-y-auto">
                    <div className="p-3 border-b border-slate-100 sticky top-0 bg-white">
                      <button
                        onClick={toggleAllUsers}
                        className="w-full text-left text-sm font-bold text-blue-600 hover:text-blue-700"
                      >
                        {selectedUsers.length === data.length ? 'Deselect All' : 'Select All'}
                      </button>
                    </div>
                    <div className="p-2">
                      {data.map(user => (
                        <label
                          key={user.userId}
                          className="flex items-center gap-3 p-2 hover:bg-slate-50 rounded-lg cursor-pointer transition"
                        >
                          <input
                            type="checkbox"
                            checked={selectedUsers.includes(user.userId)}
                            onChange={() => toggleUser(user.userId)}
                            className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                          />
                          <div className="flex items-center gap-2 flex-1">
                            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white font-bold text-xs">
                              {user.username.charAt(0)}
                            </div>
                            <span className="text-sm font-medium text-slate-700">{user.username}</span>
                          </div>
                          <span className="text-xs text-slate-400">
                            {user.weekSummary.totalTasks} tasks
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Active Filters Display */}
          {(searchQuery || selectedUsers.length < data.length) && (
            <div className="mt-4 flex flex-wrap gap-2">
              {searchQuery && (
                <span className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-sm font-medium flex items-center gap-2">
                  <Search className="w-3 h-3" />
                  Search: "{searchQuery}"
                  <button onClick={() => setSearchQuery('')} className="hover:bg-blue-200 rounded-full p-0.5">
                    <X className="w-3 h-3" />
                  </button>
                </span>
              )}
              {selectedUsers.length < data.length && selectedUsers.length > 0 && (
                <span className="px-3 py-1 bg-purple-100 text-purple-700 rounded-full text-sm font-medium flex items-center gap-2">
                  <Users className="w-3 h-3" />
                  {selectedUsers.length} user{selectedUsers.length > 1 ? 's' : ''} selected
                  <button onClick={() => setSelectedUsers(data.map(u => u.userId))} className="hover:bg-purple-200 rounded-full p-0.5">
                    <X className="w-3 h-3" />
                  </button>
                </span>
              )}
            </div>
          )}
        </div>

        {/* Results Count */}
        {!loading && (
          <div className="mb-4 text-sm text-slate-600 font-medium">
            Showing {filteredData.length} of {data.length} users
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-20 italic text-slate-400">Loading tracked work...</div>
        ) : (
          <div className="space-y-8">
            {filteredData.length > 0 ? filteredData.map((user) => (
              <div key={user.userId} className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden">

                {/* User Header */}
                <div className="p-6 bg-gradient-to-r from-blue-50 to-slate-50 border-b border-slate-100">
                  <div className="flex items-center space-x-4 mb-4">
                    <div className="w-12 h-12 bg-blue-600 rounded-2xl flex items-center justify-center text-white font-black shadow-lg">
                      {user.username.charAt(0)}
                    </div>
                    <div>
                      <h2 className="text-lg font-bold text-slate-900">{user.username}</h2>
                      <p className="text-xs font-bold text-blue-600 uppercase tracking-tight">Week Overview</p>
                    </div>
                  </div>

                  {/* Week Summary Cards */}
                  <div className="grid grid-cols-3 gap-3">
                    <div className="bg-white rounded-xl p-3 border border-slate-100">
                      <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Total Tasks</p>
                      <p className="text-2xl font-black text-slate-800">{user.weekSummary.totalTasks}</p>
                    </div>
                    <div className="bg-white rounded-xl p-3 border border-slate-100">
                      <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Time Spent</p>
                      <p className="text-2xl font-black text-blue-600">{formatTime(user.weekSummary.totalSpent)}</p>
                    </div>
                    <div className="bg-white rounded-xl p-3 border border-slate-100">
                      <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Estimated</p>
                      <p className="text-2xl font-black text-slate-500">{formatTime(user.weekSummary.totalEstimate)}</p>
                    </div>
                  </div>
                </div>

                {/* Daily Breakdown */}
                <div className="p-6 space-y-6">
                  {user.dailyBreakdown.map((day) => (
                    <div key={day.date} className="border border-slate-100 rounded-2xl overflow-hidden">

                      {/* Day Header */}
                      <div className="bg-slate-50 px-5 py-3 flex justify-between items-center border-b border-slate-100">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center">
                            <Calendar className="w-5 h-5 text-blue-600" />
                          </div>
                          <div>
                            <h3 className="font-black text-slate-800">{day.dateLabel}</h3>
                            <p className="text-xs text-slate-500 font-medium">{day.tasksCount} tasks tracked</p>
                          </div>
                        </div>
                        <div className="flex gap-4 text-right">
                          <div>
                            <p className="text-[9px] font-bold text-slate-400 uppercase">Worked</p>
                            <p className="font-black text-lg text-slate-800">{formatTime(day.totalSpent)}</p>
                          </div>
                          <div className="border-l pl-4 border-slate-200">
                            <p className="text-[9px] font-bold text-slate-400 uppercase">Estimate</p>
                            <p className="font-black text-lg text-blue-600">{formatTime(day.totalEstimate)}</p>
                          </div>
                        </div>
                      </div>

                      {/* Tasks Table */}
                      <table className="w-full">
                        <thead className="bg-slate-50/50 text-[10px] font-black text-slate-400 uppercase">
                          <tr>
                            <th className="px-5 py-3 text-left">Task</th>
                            <th className="px-5 py-3 text-left">List</th>
                            <th className="px-5 py-3 text-left">Status</th>
                            <th className="px-5 py-3 text-right">Tracked / Estimate</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                          {day.tasks.map((task) => (
                            <tr key={task.taskId} className="hover:bg-blue-50/30 transition-colors group">
                              <td className="px-5 py-3">
                                <p className="font-bold text-sm text-slate-800 group-hover:text-blue-700">{task.taskName}</p>
                              </td>
                              <td className="px-5 py-3">
                                <span className="text-xs font-medium text-slate-500">{task.listName}</span>
                              </td>
                              <td className="px-5 py-3">
                                <span className="inline-flex px-2 py-1 rounded-full text-[9px] font-black bg-slate-100 text-slate-600 uppercase">
                                  {task.status}
                                </span>
                              </td>
                              <td className="px-5 py-3 text-right">
                                <div className="flex items-center justify-end gap-3">
                                  <div>
                                    <p className="text-sm font-black text-slate-700">{formatTime(task.trackedToday)}</p>
                                    <p className="text-[10px] text-slate-400">of {formatTime(task.estimate)}</p>
                                  </div>
                                  <div className="w-16 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                    <div
                                      className={`h-full ${task.trackedToday > task.estimate ? 'bg-red-500' : 'bg-blue-500'}`}
                                      style={{ width: `${Math.min((task.trackedToday/task.estimate)*100 || 0, 100)}%` }}
                                    />
                                  </div>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ))}
                </div>

              </div>
            )) : (
              <div className="bg-white p-20 rounded-3xl border border-dashed border-slate-300 text-center">
                <Clock className="w-12 h-12 text-slate-300 mx-auto mb-4" />
                <p className="text-slate-400 font-medium">
                  {data.length === 0
                    ? 'No tracked work found for this week'
                    : 'No results match your filters'}
                </p>
                {(searchQuery || selectedUsers.length < data.length) && (
                  <button
                    onClick={clearFilters}
                    className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-medium"
                  >
                    Clear Filters
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}