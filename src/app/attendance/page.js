'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { RefreshCw, LogOut, Clock, Users, Calendar, Activity, TrendingUp, X, User, ExternalLink } from 'lucide-react';

const ACCESS_TOKEN_KEY = 'clickup_access_token';

// Helper to get user's local timezone
const getUserLocalTimezone = () => {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
};

// Helper to convert timestamp to local time
const formatTimestampToLocal = (timestamp) => {
  if (!timestamp) return null;

  const userTimezone = getUserLocalTimezone();

  return new Date(timestamp).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
    timeZone: userTimezone
  });
};

// Helper to convert timestamp to UTC
const formatTimestampToUTC = (timestamp) => {
  if (!timestamp) return null;

  return new Date(timestamp).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
    timeZone: 'UTC'
  });
};

// Helper to format date
const formatDate = (dateString) => {
  return new Date(dateString).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
};

// Get date range based on filter
const getDateRange = (filter) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let startDate, endDate;

  switch(filter) {
    case 'today':
      startDate = new Date(today);
      endDate = new Date(today);
      endDate.setHours(23, 59, 59, 999);
      break;

    case 'yesterday':
      startDate = new Date(today);
      startDate.setDate(startDate.getDate() - 1);
      endDate = new Date(startDate);
      endDate.setHours(23, 59, 59, 999);
      break;

    case 'last3days':
      startDate = new Date(today);
      startDate.setDate(startDate.getDate() - 2);
      endDate = new Date(today);
      endDate.setHours(23, 59, 59, 999);
      break;

    case 'last7days':
      startDate = new Date(today);
      startDate.setDate(startDate.getDate() - 6);
      endDate = new Date(today);
      endDate.setHours(23, 59, 59, 999);
      break;

    case 'last30days':
      startDate = new Date(today);
      startDate.setDate(startDate.getDate() - 29);
      endDate = new Date(today);
      endDate.setHours(23, 59, 59, 999);
      break;

    default:
      return null;
  }

  return {
    start: startDate.toISOString().split('T')[0],
    end: endDate.toISOString().split('T')[0]
  };
};

export default function TeamAttendancePage() {
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);
  const [attendance, setAttendance] = useState([]);
  const [stats, setStats] = useState(null);
  const [error, setError] = useState(null);
  const [dateFilter, setDateFilter] = useState('today');
  const [selectedUsers, setSelectedUsers] = useState([]);
  const [expandedRows, setExpandedRows] = useState(new Set());
  const [userTimezone, setUserTimezone] = useState('');

  // Get token from localStorage and user's timezone
  useEffect(() => {
    const storedToken = localStorage.getItem(ACCESS_TOKEN_KEY);
    if (storedToken) {
      setToken(storedToken);
    } else {
      setError("No authentication token found. Please login first.");
    }

    const tz = getUserLocalTimezone();
    setUserTimezone(tz);
    setLoading(false);
  }, []);

  // Fetch attendance data
  const fetchAttendance = useCallback(async () => {
    if (!token) return;

    setLoading(true);
    setError(null);

    try {
      let url = '/api/user-attendance';
      const dateRange = getDateRange(dateFilter);

      if (dateRange) {
        url += `?startDate=${dateRange.start}&endDate=${dateRange.end}`;
      }

      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      const data = await response.json();

      if (response.ok) {
        const uniqueAttendance = (data.data || []).map((record, index) => ({
          ...record,
          uniqueId: record.uniqueId || `${record.userId}_${record.date}_${index}_${Date.now()}`
        }));
        setAttendance(uniqueAttendance);
        setStats(data.stats || null);
      } else {
        setError(data.error || 'Failed to fetch attendance data');
      }
    } catch (err) {
      setError(err.message || 'An error occurred while fetching data');
    } finally {
      setLoading(false);
    }
  }, [token, dateFilter]);

  useEffect(() => {
    if (token) {
      fetchAttendance();
    }
  }, [token, dateFilter, fetchAttendance]);

  // Filter data by multiple users
  const filteredAttendance = attendance.filter(record => {
    if (selectedUsers.length > 0) {
      return selectedUsers.includes(record.userId);
    }
    return true;
  });

  // Get unique users for filter
  const uniqueUsers = [...new Map(attendance.map(a => [a.userId, {
    id: a.userId,
    name: a.user
  }])).values()].sort((a, b) => a.name.localeCompare(b.name));

  // Toggle user selection
  const toggleUserSelection = (userId) => {
    setSelectedUsers(prev => {
      if (prev.includes(userId)) {
        return prev.filter(id => id !== userId);
      } else {
        return [...prev, userId];
      }
    });
  };

  // Clear all user filters
  const clearUserFilters = () => {
    setSelectedUsers([]);
  };

  // Helper to convert attendance data to CSV format
  const convertToCSV = (data) => {
    if (!data || data.length === 0) return '';

    const headers = [
      'Date',
      'User',
      'Check In (Local)',
      'Check In (UTC)',
      'Check Out (Local)',
      'Check Out (UTC)',
      'Active Hours',
      'Sessions',
      'Task Name',
      'Task URL',
      'Task Hours',
      'Session Start',
      'Session End',
      'Session Duration (Hours)'
    ];

    const rows = [];

    data.forEach(record => {
      if (record.tasks && record.tasks.length > 0) {
        record.tasks.forEach(task => {
          task.sessions.forEach(session => {
            rows.push([
              `"${record.dateFormatted || formatDate(record.date)}"`,
              `"${record.user}"`,
              `"${formatTimestampToLocal(record.checkInTimestamp)}"`,
              `"${formatTimestampToUTC(record.checkInTimestamp)}"`,
              `"${formatTimestampToLocal(record.checkOutTimestamp)}"`,
              `"${formatTimestampToUTC(record.checkOutTimestamp)}"`,
              `"${record.totalActiveHours}"`,
              `"${record.sessionCount}"`,
              `"${task.taskName}"`,
              `"${task.taskUrl || 'N/A'}"`,
              `"${task.totalHours}"`,
              `"${session.startTime}"`,
              `"${session.endTime}"`,
              `"${session.durationHours}"`
            ].join(','));
          });
        });
      } else {
        rows.push([
          `"${record.dateFormatted || formatDate(record.date)}"`,
          `"${record.user}"`,
          `"${formatTimestampToLocal(record.checkInTimestamp)}"`,
          `"${formatTimestampToUTC(record.checkInTimestamp)}"`,
          `"${formatTimestampToLocal(record.checkOutTimestamp)}"`,
          `"${formatTimestampToUTC(record.checkOutTimestamp)}"`,
          `"${record.totalActiveHours}"`,
          `"${record.sessionCount}"`,
          `"No tasks"`,
          `"N/A"`,
          `"0"`,
          `"N/A"`,
          `"N/A"`,
          `"0"`
        ].join(','));
      }
    });

    return [headers.join(','), ...rows].join('\n');
  };

  // Download CSV file
  const downloadCSV = () => {
    const csvData = convertToCSV(filteredAttendance);

    if (!csvData || csvData.trim() === '') {
      alert('No data available to download');
      return;
    }

    const blob = new Blob([csvData], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);

    const dateStr = new Date().toISOString().split('T')[0];
    let fileName = `attendance_${dateStr}`;

    if (dateFilter !== 'today') {
      fileName += `_${dateFilter}`;
    }

    if (selectedUsers.length > 0) {
      fileName += `_${selectedUsers.length}_users`;
    }

    fileName += '.csv';

    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', fileName);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    URL.revokeObjectURL(url);
  };

  // Toggle row expansion
  const toggleRow = (key) => {
    const newExpanded = new Set(expandedRows);
    if (newExpanded.has(key)) {
      newExpanded.delete(key);
    } else {
      newExpanded.add(key);
    }
    setExpandedRows(newExpanded);
  };

  const logout = () => {
    localStorage.removeItem(ACCESS_TOKEN_KEY);
    window.location.href = '/';
  };

  if (loading && !attendance.length) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-50">
        <div className="p-6 bg-white rounded-xl shadow-lg flex items-center space-x-4">
          <RefreshCw className="w-6 h-6 animate-spin text-indigo-500" />
          <p className="text-gray-700">Loading attendance data...</p>
        </div>
      </div>
    );
  }

  if (error && !attendance.length) {
    return (
      <div className="p-8 bg-red-100 border border-red-400 text-red-700 rounded-lg shadow-lg m-8">
        <h2 className="text-xl font-bold mb-4">Error</h2>
        <p>{error}</p>
        <button
          onClick={() => window.location.href = '/'}
          className="mt-4 px-4 py-2 bg-red-500 text-white rounded-lg shadow hover:bg-red-600 transition duration-150"
        >
          Go Back
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 p-4 md:p-8 font-sans">

     <header className="flex flex-col gap-4 md:flex-row md:justify-between md:items-center mb-8 pb-4 border-b border-gray-200">

  <h1 className="text-3xl font-bold text-gray-800 flex items-center">
    <Users className="w-7 h-7 mr-3 text-indigo-600" />
    Team Attendance Dashboard
  </h1>

  <div className="flex flex-wrap gap-3">

    <button
      onClick={downloadCSV}
      disabled={filteredAttendance.length === 0}
      className="flex items-center px-4 py-2 bg-green-500 text-white rounded-lg shadow-md hover:bg-green-600 transition text-sm disabled:opacity-50"
    >
      Download CSV
    </button>

    <button
      onClick={fetchAttendance}
      disabled={loading}
      className="flex items-center px-4 py-2 bg-indigo-500 text-white rounded-lg shadow-md hover:bg-indigo-600 transition text-sm disabled:opacity-50"
    >
      <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} />
      Refresh
    </button>

    <Link
      href="/"
      className="flex items-center gap-2 px-5 py-2 bg-white text-gray-700 rounded-xl shadow-md hover:shadow-lg transition text-sm font-semibold"
    >
      <Calendar className="w-4 h-4" />
      Track Time
    </Link>

    <Link
      href="/zain"
      className="flex items-center gap-2 px-5 py-2 bg-white text-gray-700 rounded-xl shadow-md hover:shadow-lg transition text-sm font-semibold"
    >
      <Calendar className="w-4 h-4" />
      Workload
    </Link>

    <Link
      href="/running-timers"
      className="flex items-center gap-2 px-5 py-2 bg-white text-gray-700 rounded-xl shadow-md hover:shadow-lg transition text-sm font-semibold"
    >
      <Activity className="w-4 h-4" />
      Running Timers
    </Link>

    <button
      onClick={logout}
      className="flex items-center px-4 py-2 bg-gray-200 text-gray-700 rounded-lg shadow-md hover:bg-gray-300 transition text-sm"
    >
      <LogOut className="w-4 h-4 mr-2" />
      Logout
    </button>

  </div>
</header>


      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-white p-6 rounded-xl shadow-md">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Total Records</p>
                <p className="text-2xl font-bold text-gray-800">{stats.totalRecords}</p>
              </div>
              <Calendar className="w-10 h-10 text-indigo-500" />
            </div>
          </div>

          <div className="bg-white p-6 rounded-xl shadow-md">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Active Users</p>
                <p className="text-2xl font-bold text-gray-800">{stats.uniqueUsers}</p>
              </div>
              <Users className="w-10 h-10 text-green-500" />
            </div>
          </div>

          <div className="bg-white p-6 rounded-xl shadow-md">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Total Hours</p>
                <p className="text-2xl font-bold text-gray-800">{stats.totalActiveHours}h</p>
              </div>
              <Clock className="w-10 h-10 text-blue-500" />
            </div>
          </div>

          <div className="bg-white p-6 rounded-xl shadow-md">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Processing Time</p>
                <p className="text-2xl font-bold text-gray-800">{stats.processingTime}</p>
              </div>
              <TrendingUp className="w-10 h-10 text-purple-500" />
            </div>
          </div>
        </div>
      )}

      {/* Date Range Filter Buttons */}
      <div className="bg-white p-4 rounded-xl shadow-md mb-6">
        <div className="flex flex-wrap gap-3 mb-4">
          {['today', 'yesterday', 'last3days', 'last7days', 'last30days'].map((filter) => (
            <button
              key={filter}
              onClick={() => setDateFilter(filter)}
              className={`px-4 py-2 rounded-lg font-medium transition duration-150 ${
                dateFilter === filter
                  ? 'bg-indigo-500 text-white shadow-md'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {filter === 'today' && '📅 Today'}
              {filter === 'yesterday' && '📆 Yesterday'}
              {filter === 'last3days' && '📊 Last 3 Days'}
              {filter === 'last7days' && '📈 Last 7 Days'}
              {filter === 'last30days' && '📉 Last 30 Days'}
            </button>
          ))}
        </div>

        {/* Multi-Select User Filter */}
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1">
            <label className="text-sm font-medium text-gray-600 mb-2 flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Users className="w-4 h-4 text-indigo-500" />
                Filter by Users ({selectedUsers.length > 0 ? selectedUsers.length : 'All'})
              </span>
              {selectedUsers.length > 0 && (
                <button
                  onClick={clearUserFilters}
                  className="text-xs text-red-600 hover:text-red-800 flex items-center gap-1"
                >
                  <X className="w-3 h-3" />
                  Clear
                </button>
              )}
            </label>
            <div className="border-2 border-gray-200 rounded-lg p-3 bg-gray-50 max-h-48 overflow-y-auto">
              {uniqueUsers.length === 0 ? (
                <p className="text-sm text-gray-500">No users available</p>
              ) : (
                uniqueUsers.map(user => (
                  <label key={user.id} className="flex items-center gap-2 py-2 hover:bg-white px-2 rounded cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedUsers.includes(user.id)}
                      onChange={() => toggleUserSelection(user.id)}
                      className="w-4 h-4 text-indigo-600 rounded focus:ring-2 focus:ring-indigo-500"
                    />
                    <span className="text-sm text-gray-700">{user.name}</span>
                  </label>
                ))
              )}
            </div>
          </div>

          <div className="flex items-end">
            <button
              onClick={() => {
                setDateFilter('today');
                setSelectedUsers([]);
              }}
              className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition duration-150"
            >
              Reset All Filters
            </button>
          </div>
        </div>

        {/* Active Filters Display */}
        <div className="mt-4 flex flex-wrap gap-2">
          {dateFilter !== 'today' && (
            <span className="px-3 py-1 bg-indigo-100 text-indigo-700 rounded-full text-sm font-medium">
              Date: {dateFilter}
            </span>
          )}
          {selectedUsers.map(userId => {
            const user = uniqueUsers.find(u => u.id === userId);
            return (
              <span key={userId} className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-sm font-medium flex items-center gap-2">
                <User className="w-3 h-3" />
                {user?.name}
                <button onClick={() => toggleUserSelection(userId)} className="hover:bg-green-200 rounded-full p-0.5">
                  <X className="w-3 h-3" />
                </button>
              </span>
            );
          })}
          <span className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm">
            Your Timezone: {userTimezone}
          </span>
        </div>
      </div>

      {/* Loading Indicator */}
      {loading && (
        <div className="bg-indigo-50 border border-indigo-200 text-indigo-700 px-4 py-3 rounded-lg mb-6 flex items-center">
          <RefreshCw className="w-5 h-5 animate-spin mr-3" />
          <span>Loading attendance data...</span>
        </div>
      )}

      {/* Attendance Table */}
      <div className="bg-white rounded-xl shadow-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">User</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Check In</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Check Out</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Active Hours</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Sessions</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Details</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredAttendance.length === 0 ? (
                <tr>
                  <td colSpan="7" className="px-6 py-8 text-center">
                    <div className="flex flex-col items-center justify-center text-gray-500">
                      <Calendar className="w-12 h-12 mb-3 text-gray-400" />
                      <p className="text-lg font-medium">No attendance records found</p>
                      <p className="text-sm mt-1">Try selecting a different date range or user</p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredAttendance.map((record) => {
                  const isExpanded = expandedRows.has(record.uniqueId);

                  return (
                    <React.Fragment key={record.uniqueId}>
                      <tr className="hover:bg-gray-50 transition">
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {record.dateFormatted || formatDate(record.date)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                          {record.user}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-green-600 font-semibold">
                          <div>🟢 {formatTimestampToLocal(record.checkInTimestamp)}</div>
                          <div className="text-xs text-gray-500 font-normal">
                            UTC: {formatTimestampToUTC(record.checkInTimestamp)}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-red-600 font-semibold">
                          <div>🔴 {formatTimestampToLocal(record.checkOutTimestamp)}</div>
                          <div className="text-xs text-gray-500 font-normal">
                            UTC: {formatTimestampToUTC(record.checkOutTimestamp)}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 font-semibold">
                          {record.totalActiveHours}h
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {record.sessionCount}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm">
                          <button
                            onClick={() => toggleRow(record.uniqueId)}
                            className="text-indigo-600 hover:text-indigo-800 font-medium"
                          >
                            {isExpanded ? 'Hide' : 'Show'}
                          </button>
                        </td>
                      </tr>

                      {/* Expanded Row - Task Breakdown */}
                      {isExpanded && (
                        <tr>
                          <td colSpan="7" className="px-6 py-4 bg-gray-50">
                            <div className="space-y-4">
                              <h4 className="font-semibold text-gray-700 mb-3 flex items-center">
                                <Clock className="w-4 h-4 mr-2" />
                                Task Breakdown
                                <span className="ml-2 text-xs font-normal text-gray-500">
                                  (Your Time: {userTimezone})
                                </span>
                              </h4>

                              {record.tasks && record.tasks.length > 0 ? (
                                <div className="space-y-3">
                                  {record.tasks.map((task, taskIdx) => (
                                    <div key={`${record.uniqueId}_task_${taskIdx}`} className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
                                      {/* Task Header */}
                                      <div className="flex items-start justify-between mb-3">
                                        <div className="flex-1">
                                          <div className="flex items-center gap-2 mb-1">
                                            <h5 className="font-semibold text-gray-800">{task.taskName}</h5>
                                            {task.taskUrl && (
                                              <a
                                                href={task.taskUrl}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="text-indigo-600 hover:text-indigo-800"
                                              >
                                                <ExternalLink className="w-4 h-4" />
                                              </a>
                                            )}
                                          </div>
                                          <div className="flex items-center gap-4 text-sm text-gray-600">
                                            <span className="font-medium text-indigo-600">
                                              Total: {task.totalHours}h ({task.totalMinutes} min)
                                            </span>
                                            <span className="text-gray-500">
                                              {task.sessions.length} session{task.sessions.length !== 1 ? 's' : ''}
                                            </span>
                                          </div>
                                        </div>
                                      </div>

                                      {/* Task Sessions */}
                                      <div className="space-y-2 mt-3 pl-4 border-l-2 border-indigo-200">
                                        {task.sessions.map((session, sessionIdx) => (
                                          <div key={`${record.uniqueId}_task_${taskIdx}_session_${sessionIdx}`} className="text-sm">
                                            <div className="flex items-center gap-2 mb-1">
                                              <span className="text-green-600">🟢 {session.startTime}</span>
                                              <span className="text-gray-400">→</span>
                                              <span className="text-red-600">🔴 {session.endTime}</span>
                                              <span className="text-gray-600 ml-2">
                                                ({session.durationHours}h / {session.durationMinutes} min)
                                              </span>
                                            </div>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <div className="text-center py-4 text-gray-500">
                                  <p>No task data available</p>
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Footer Info */}
      {filteredAttendance.length > 0 && (
        <div className="mt-4 text-center text-sm text-gray-600">
          Showing {filteredAttendance.length} record{filteredAttendance.length !== 1 ? 's' : ''}
          {selectedUsers.length > 0 && ` for ${selectedUsers.length} selected user${selectedUsers.length !== 1 ? 's' : ''}`}
          {dateFilter !== 'today' && ` (${dateFilter})`}
        </div>
      )}
    </div>
  );
}