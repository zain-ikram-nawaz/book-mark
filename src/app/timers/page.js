'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { RefreshCw, LogOut, Clock, User, TrendingUp, AlertTriangle, Calendar, Activity, Zap, ExternalLink, Folder, Users, Filter, X, Search, Smartphone, Monitor, Download } from 'lucide-react';
import Link from 'next/link';

const ACCESS_TOKEN_KEY = 'clickup_access_token';
const CLICKUP_CLIENT_ID = process.env.NEXT_PUBLIC_CLICKUP_CLIENT_ID;
const REDIRECT_URI = process.env.NEXT_PUBLIC_CLICKUP_REDIRECT_URI;
const OAUTH_SCOPES = 'team:read time_tracking:read task:read list:read space:read user:read';

const DATE_FILTERS = [
  { value: 1, label: 'Today', days: 1 },
  { value: 2, label: 'Yesterday + Today', days: 2 },
  { value: 3, label: 'Last 3 Days', days: 3 },
  { value: 7, label: 'Last Week', days: 7 },
  { value: 30, label: 'Last Month', days: 30 },
];

const DEVICE_FILTERS = [
  { value: 'all', label: 'All Devices' },
  { value: 'real', label: 'Real Only (Mobile + Desktop)' },
  { value: 'fake', label: 'Manual Only' },
  { value: 'mobile', label: 'Mobile Only' },
  { value: 'desktop', label: 'Desktop Only' },
];

const formatDuration = (ms) => {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (num) => String(num).padStart(2, '0');
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
};

// ✅ CSV Export Function
const exportToCSV = (data, filename = 'time_entries.csv') => {
  if (!data || data.length === 0) {
    alert('No data to export');
    return;
  }

  // CSV Headers
  const headers = [
    'User',
    'Task Name',
    'Folder',
    'Start Time',
    'End Time',
    'Duration (HH:MM:SS)',
    'Duration (Hours)',
    'Device Type',
    'Source',
    'Status',
    'Task URL'
  ];

  // Convert data to CSV rows
  const rows = data.map(timer => [
    timer.user,
    timer.taskName,
    timer.folderName,
    timer.startFormatted,
    timer.endFormatted,
    formatDuration(timer.duration),
    (timer.duration / (1000 * 60 * 60)).toFixed(2),
    timer.deviceType,
    timer.source,
    timer.status,
    timer.taskUrl || ''
  ]);

  // Combine headers and rows
  const csvContent = [
    headers.join(','),
    ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
  ].join('\n');

  // Create blob and download
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);

  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

// ✅ Get device type badge styling
const getDeviceBadge = (timer) => {
  if (timer.isFake) {
    return {
      icon: <AlertTriangle className="w-3 h-3" />,
      label: 'MANUAL',
      className: 'bg-red-100 text-red-600 border border-red-300'
    };
  } else if (timer.isMobile) {
    return {
      icon: <Smartphone className="w-3 h-3" />,
      label: 'MOBILE',
      className: 'bg-blue-100 text-blue-600 border border-blue-300'
    };
  } else if (timer.isDesktop) {
    return {
      icon: <Monitor className="w-3 h-3" />,
      label: 'DESKTOP',
      className: 'bg-green-100 text-green-600 border border-green-300'
    };
  } else {
    return {
      icon: <Clock className="w-3 h-3" />,
      label: timer.source?.toUpperCase() || 'UNKNOWN',
      className: 'bg-gray-100 text-gray-600 border border-gray-300'
    };
  }
};

function useAuth() {
  const [accessToken, setAccessToken] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const tokenFromUrl = urlParams.get('access_token');
    const storedToken = localStorage.getItem(ACCESS_TOKEN_KEY);

    if (tokenFromUrl) {
      localStorage.setItem(ACCESS_TOKEN_KEY, tokenFromUrl);
      setAccessToken(tokenFromUrl);
      window.history.replaceState({}, document.title, window.location.pathname);
      setLoading(false);
    } else if (storedToken) {
      setAccessToken(storedToken);
      setLoading(false);
    } else {
      handleRedirectToClickUp();
    }
  }, []);

  const handleRedirectToClickUp = () => {
    if (!CLICKUP_CLIENT_ID || !REDIRECT_URI) {
      setError("Configuration Error: Missing CLIENT_ID or REDIRECT_URI");
      setLoading(false);
      return;
    }
    const authUrl = `https://app.clickup.com/api?client_id=${CLICKUP_CLIENT_ID}&redirect_uri=${REDIRECT_URI}&response_type=code&scope=${OAUTH_SCOPES}`;
    window.location.replace(authUrl);
  };

  const logout = () => {
    localStorage.removeItem(ACCESS_TOKEN_KEY);
    setAccessToken(null);
    handleRedirectToClickUp();
  };

  const authorizedFetch = useCallback(async (url) => {
    if (!accessToken) return { ok: false, status: 401, error: "Unauthorized" };

    try {
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      });
      const data = await response.json();

      if (response.status === 401) {
        alert("Token expired. Please re-authenticate.");
        logout();
        return { ok: false, status: 401, error: "Token expired" };
      }

      return { ok: response.ok, status: response.status, data, error: data.error };
    } catch (err) {
      return { ok: false, status: 500, error: err.message };
    }
  }, [accessToken]);

  return { accessToken, loading, error, logout, authorizedFetch };
}

export default function SimplifiedTimerApp() {
  const { loading, error, logout, authorizedFetch } = useAuth();

  const [allData, setAllData] = useState([]);
  const [runningTimers, setRunningTimers] = useState([]);
  const [filteredData, setFilteredData] = useState([]);
  const [availableUsers, setAvailableUsers] = useState([]);
  const [availableFolders, setAvailableFolders] = useState([]);
  const [stats, setStats] = useState(null);

  const [selectedDays, setSelectedDays] = useState(3);
  const [selectedUsers, setSelectedUsers] = useState([]);
  const [selectedFolders, setSelectedFolders] = useState([]);
  const [selectedDeviceFilter, setSelectedDeviceFilter] = useState('all'); // ✅ NEW
  const [searchQuery, setSearchQuery] = useState('');

  const [apiStatus, setApiStatus] = useState({ loading: false, error: null });
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [currentTime, setCurrentTime] = useState(Date.now());

  // Update current time every second
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(Date.now());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Fetch data
  const fetchData = useCallback(async () => {
    if (!authorizedFetch) return;

    setApiStatus({ loading: true, error: null });

    const { ok, data, error } = await authorizedFetch(`/api/tasks?days=${selectedDays}`);

    if (ok) {
      setAllData(data.data || []);
      setRunningTimers(data.runningTimers || []);
      setAvailableUsers(data.filters?.users || []);
      setAvailableFolders(data.filters?.folders || []);
      setStats(data.stats || null);
    } else {
      console.error('❌ API Error:', error);
      setApiStatus({ loading: false, error: `Failed to load data: ${error}` });
    }
    setApiStatus(prev => ({ ...prev, loading: false }));
  }, [authorizedFetch, selectedDays]);

  // Initial fetch
  useEffect(() => {
    if (authorizedFetch) {
      fetchData();
    }
  }, [authorizedFetch, selectedDays, fetchData]);

  // Auto-refresh
  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      fetchData();
    }, 10000);
    return () => clearInterval(interval);
  }, [autoRefresh, fetchData]);

  // Apply filters
  useEffect(() => {
    let filtered = [...allData];

    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);

    let dateFilterStart;

    switch(selectedDays) {
      case 1:
        dateFilterStart = startOfToday.getTime();
        break;
      case 2:
        dateFilterStart = new Date(startOfToday.getTime() - (24 * 60 * 60 * 1000)).getTime();
        break;
      case 3:
        dateFilterStart = new Date(startOfToday.getTime() - (2 * 24 * 60 * 60 * 1000)).getTime();
        break;
      case 7:
        dateFilterStart = new Date(startOfToday.getTime() - (6 * 24 * 60 * 60 * 1000)).getTime();
        break;
      case 30:
        dateFilterStart = new Date(startOfToday.getTime() - (29 * 24 * 60 * 60 * 1000)).getTime();
        break;
      default:
        dateFilterStart = 0;
    }

    if (dateFilterStart > 0) {
      filtered = filtered.filter(item => item.startTime >= dateFilterStart);
    }

    // ✅ Device Filter
    if (selectedDeviceFilter !== 'all') {
      filtered = filtered.filter(item => {
        switch(selectedDeviceFilter) {
          case 'real':
            return item.isReal;
          case 'fake':
            return item.isFake;
          case 'mobile':
            return item.isMobile && !item.isFake;
          case 'desktop':
            return item.isDesktop && !item.isFake;
          default:
            return true;
        }
      });
    }

    if (selectedUsers.length > 0) {
      filtered = filtered.filter(item => selectedUsers.includes(item.userId));
    }

    if (selectedFolders.length > 0) {
      filtered = filtered.filter(item => {
        const folderId = item.folderId || 'no-folder';
        return selectedFolders.includes(folderId);
      });
    }

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(item =>
        item.taskName.toLowerCase().includes(query) ||
        item.user.toLowerCase().includes(query) ||
        item.folderName.toLowerCase().includes(query)
      );
    }

    filtered.sort((a, b) => b.startTime - a.startTime);

    setFilteredData(filtered);
  }, [allData, selectedUsers, selectedFolders, selectedDeviceFilter, searchQuery, selectedDays]);

  const getElapsedTime = (startTime) => {
    const elapsed = currentTime - startTime;
    return formatDuration(elapsed);
  };

  const toggleUserSelection = (userId) => {
    setSelectedUsers(prev => {
      if (prev.includes(userId)) {
        return prev.filter(id => id !== userId);
      } else {
        return [...prev, userId];
      }
    });
  };

  const toggleFolderSelection = (folderId) => {
    setSelectedFolders(prev => {
      if (prev.includes(folderId)) {
        return prev.filter(id => id !== folderId);
      } else {
        return [...prev, folderId];
      }
    });
  };

  const totalFilteredTime = filteredData.reduce((sum, timer) => sum + timer.duration, 0);
  const totalActiveTime = runningTimers.reduce((sum, timer) => sum + (currentTime - timer.startTime), 0);

  const clearFilters = () => {
    setSelectedUsers([]);
    setSelectedFolders([]);
    setSelectedDeviceFilter('all');
    setSearchQuery('');
  };

  // ✅ Export Handler
  const handleExportCSV = () => {
    const timestamp = new Date().toISOString().split('T')[0];
    const filename = `time_entries_${timestamp}.csv`;
    exportToCSV(filteredData, filename);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gradient-to-br from-indigo-50 via-purple-50 to-pink-50">
        <div className="p-8 bg-white rounded-2xl shadow-2xl flex items-center space-x-4">
          <RefreshCw className="w-8 h-8 animate-spin text-indigo-600" />
          <p className="text-gray-700 text-lg font-medium">Authorizing with ClickUp...</p>
        </div>
      </div>
    );
  }


  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-red-50 to-orange-50 p-8 flex items-center justify-center">
        <div className="max-w-md w-full p-8 bg-white border-2 border-red-200 rounded-2xl shadow-2xl">
          <div className="flex items-center justify-center w-16 h-16 bg-red-100 rounded-full mx-auto mb-4">
            <AlertTriangle className="w-8 h-8 text-red-600" />
          </div>
          <h2 className="text-2xl font-bold mb-4 text-center text-gray-800">Authorization Error</h2>
          <p className="text-gray-600 text-center mb-6">{error}</p>
          <button
            onClick={logout}
            className="w-full px-6 py-3 bg-red-500 text-white rounded-xl shadow-lg hover:bg-red-600 transition duration-200 font-semibold flex items-center justify-center gap-2"
          >
            <LogOut className="w-5 h-5" />
            Logout and Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 p-4 md:p-8 font-sans">
      {/* Header */}
      <header className="mb-8 pb-6 border-b-2 border-indigo-100">
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
          <div>
            <h1 className="text-4xl font-bold text-gray-800 flex items-center gap-3 mb-2">
              <div className="p-2 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl shadow-lg">
                <Clock className="w-8 h-8 text-white" />
              </div>
              Team Time Tracker.
            </h1>
            <p className="text-gray-600 ml-16">Simplified tracking & analytics</p>
          </div>

          <div className="flex flex-wrap items-center gap-3">


            <button
              onClick={fetchData}
              disabled={apiStatus.loading}
              className="flex items-center gap-2 px-5 py-2 bg-gradient-to-r from-indigo-500 to-purple-600 text-white rounded-xl shadow-lg hover:shadow-xl hover:scale-105 transition-all duration-200 text-sm font-semibold disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${apiStatus.loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>

            {/* ✅ Export CSV Button */}
            <button
              onClick={handleExportCSV}
              disabled={filteredData.length === 0}
              className="flex items-center gap-2 px-5 py-2 bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-xl shadow-lg hover:shadow-xl hover:scale-105 transition-all duration-200 text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Download className="w-4 h-4" />
              Export CSV
            </button>

            <Link href="/attendance">
              <button className="flex items-center gap-2 px-5 py-2 bg-white text-gray-700 rounded-xl shadow-md hover:shadow-lg transition-all text-sm font-semibold">
                <Calendar className="w-4 h-4" />
                Active Hours
              </button>
            </Link>
             <Link href="/workload">
              <button className="flex items-center gap-2 px-5 py-2 bg-white text-gray-700 rounded-xl shadow-md hover:shadow-lg transition-all text-sm font-semibold">
                <Calendar className="w-4 h-4" />
             Workload
              </button>
            </Link>

            <Link href="/running-timers">
              <button className="flex items-center gap-2 px-5 py-2 bg-white text-gray-700 rounded-xl shadow-md hover:shadow-lg transition-all text-sm font-semibold">
                <Activity className="w-4 h-4" />
                Running Timers
              </button>
            </Link>

            <button
              onClick={logout}
              className="flex items-center gap-2 px-5 py-2 bg-white text-gray-700 rounded-xl shadow-md hover:shadow-lg transition-all text-sm font-semibold"
            >
              <LogOut className="w-4 h-4" />
              Logout
            </button>
          </div>
        </div>
      </header>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-gradient-to-br from-green-500 to-emerald-600 rounded-2xl p-6 shadow-xl text-white">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium opacity-90">Active Timers</span>
              <Activity className="w-5 h-5 animate-pulse" />
            </div>
            <div className="text-4xl font-bold">{runningTimers.length}</div>
            <div className="text-xs opacity-75 mt-1">{formatDuration(totalActiveTime)} total</div>
          </div>

          <div className="bg-gradient-to-br from-blue-500 to-indigo-600 rounded-2xl p-6 shadow-xl text-white">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium opacity-90">Total Entries</span>
              <TrendingUp className="w-5 h-5" />
            </div>
            <div className="text-4xl font-bold">{stats.totalEntries}</div>
            <div className="text-xs opacity-75 mt-1">{stats.totalHours}h tracked</div>
          </div>

          <div className="bg-gradient-to-br from-purple-500 to-pink-600 rounded-2xl p-6 shadow-xl text-white">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium opacity-90">Team Members</span>
              <Users className="w-5 h-5" />
            </div>
            <div className="text-4xl font-bold">{stats.uniqueUsers}</div>
            <div className="text-xs opacity-75 mt-1">Active users</div>
          </div>

          <div className="bg-gradient-to-br from-red-500 to-orange-600 rounded-2xl p-6 shadow-xl text-white">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium opacity-90">Manual Entries</span>
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div className="text-4xl font-bold">{stats.fakeEntries || 0}</div>
            <div className="text-xs opacity-75 mt-1">
              {stats.mobileEntries || 0} mobile • {stats.desktopEntries || 0} desktop
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="bg-white rounded-2xl shadow-lg p-6 mb-8 border border-gray-100">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
            <Filter className="w-5 h-5 text-indigo-500" />
            Filters
          </h3>
          {(selectedUsers.length > 0 || selectedFolders.length > 0 || selectedDeviceFilter !== 'all' || searchQuery) && (
            <button
              onClick={clearFilters}
              className="flex items-center gap-2 px-3 py-1 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition text-sm font-medium"
            >
              <X className="w-4 h-4" />
              Clear All
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Date Range */}
          <div>
            <label className="text-sm font-semibold text-gray-700 mb-2 block flex items-center gap-2">
              <Calendar className="w-4 h-4 text-indigo-500" />
              Date Range
            </label>
            <select
              value={selectedDays}
              onChange={(e) => setSelectedDays(Number(e.target.value))}
              className="w-full p-3 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-gray-50 hover:bg-white transition"
            >
              {DATE_FILTERS.map(filter => (
                <option key={filter.value} value={filter.value}>{filter.label}</option>
              ))}
            </select>
          </div>

          {/* ✅ Device Filter */}
          <div>
            <label className="text-sm font-semibold text-gray-700 mb-2 block flex items-center gap-2">
              <Monitor className="w-4 h-4 text-indigo-500" />
              Device Type
            </label>
            <select
              value={selectedDeviceFilter}
              onChange={(e) => setSelectedDeviceFilter(e.target.value)}
              className="w-full p-3 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-gray-50 hover:bg-white transition"
            >
              {DEVICE_FILTERS.map(filter => (
                <option key={filter.value} value={filter.value}>{filter.label}</option>
              ))}
            </select>
          </div>

          {/* Search */}
          <div>
            <label className="text-sm font-semibold text-gray-700 mb-2 block flex items-center gap-2">
              <Search className="w-4 h-4 text-indigo-500" />
              Search
            </label>
            <input
              type="text"
              placeholder="Search user or task..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full p-3 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-gray-50 hover:bg-white transition"
            />
          </div>

          {/* Users */}
          <div>
            <label className="text-sm font-semibold text-gray-700 mb-2 block flex items-center gap-2">
              <Users className="w-4 h-4 text-indigo-500" />
              Users ({selectedUsers.length > 0 ? selectedUsers.length : 'All'})
            </label>
            <div className="border-2 border-gray-200 rounded-xl p-3 bg-gray-50 max-h-32 overflow-y-auto">
              {availableUsers.length === 0 ? (
                <p className="text-sm text-gray-500">No users available</p>
              ) : (
                availableUsers.map(user => (
                  <label key={user.id} className="flex items-center gap-2 py-1 hover:bg-white px-2 rounded cursor-pointer">
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
        </div>

        {/* Active Filters Display */}
        {(selectedUsers.length > 0 || selectedFolders.length > 0 || selectedDeviceFilter !== 'all') && (
          <div className="mt-4 flex flex-wrap gap-2">
            {selectedDeviceFilter !== 'all' && (
              <span className="px-3 py-1 bg-purple-100 text-purple-700 rounded-full text-sm font-medium flex items-center gap-2">
                <Monitor className="w-3 h-3" />
                {DEVICE_FILTERS.find(f => f.value === selectedDeviceFilter)?.label}
                <button onClick={() => setSelectedDeviceFilter('all')} className="hover:bg-purple-200 rounded-full p-0.5">
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}
            {selectedUsers.map(userId => {
              const user = availableUsers.find(u => u.id === userId);
              return (
                <span key={userId} className="px-3 py-1 bg-indigo-100 text-indigo-700 rounded-full text-sm font-medium flex items-center gap-2">
                  <User className="w-3 h-3" />
                  {user?.name}
                  <button onClick={() => toggleUserSelection(userId)} className="hover:bg-indigo-200 rounded-full p-0.5">
                    <X className="w-3 h-3" />
                  </button>
                </span>
              );
            })}
          </div>
        )}
      </div>

      {/* Running Timers */}
      {runningTimers.length > 0 && (
        <div className="mb-8">
          <h2 className="text-2xl font-bold text-gray-800 flex items-center gap-3 mb-4">
            <div className="relative">
              <Activity className="w-7 h-7 text-green-600 animate-pulse" />
              <span className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full animate-ping"></span>
            </div>
            Live Activity
            <span className="text-lg font-normal text-gray-500">
              ({runningTimers.length} active)
            </span>
          </h2>

          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
            {runningTimers.map((timer, index) => {
              const badge = getDeviceBadge(timer);
              return (
                <div
                  key={`running_${timer.taskId}_${timer.userId}_${index}`}
                  className={`rounded-xl shadow-xl p-4 border transition-all ${
                    timer.isFake
                      ? 'bg-gradient-to-br from-red-900 via-red-800 to-red-900 border-red-400/30'
                      : 'bg-gradient-to-br from-gray-900 via-[#111827] to-[#1e2a4a] border-green-400/30 hover:border-green-400/50'
                  }`}
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full animate-pulse ${timer.isFake ? 'bg-red-400' : 'bg-green-400'}`}></div>
                      <span className={`text-xs font-bold uppercase tracking-wide ${timer.isFake ? 'text-red-400' : 'text-green-400'}`}>
                        {timer.isFake ? 'Manual' : 'Live'}
                      </span>
                    </div>
                    <div className="bg-black/30 backdrop-blur-sm px-3 py-1 rounded-lg border border-green-500/20">
                      <span className="text-white font-mono font-bold text-sm">
                        {getElapsedTime(timer.startTime)}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 mb-3 pb-3 border-b border-gray-700">
                    <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-full flex items-center justify-center text-white font-bold text-sm shadow-lg">
                      {timer.user.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-white text-sm truncate">{timer.user}</div>
                      <div className="text-xs text-gray-400">{timer.folderName}</div>
                    </div>
                  </div>

                  <div className="mb-2">
                    {timer.taskUrl ? (
                      <a
                        href={timer.taskUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-indigo-300 hover:text-indigo-200 font-medium text-sm flex items-center gap-1 group"
                      >
                        <span className="line-clamp-2">{timer.taskName}</span>
                        <ExternalLink className="w-3 h-3 flex-shrink-0 opacity-0 group-hover:opacity-100 transition" />
                      </a>
                    ) : (
                      <p className="text-gray-300 text-sm line-clamp-2">{timer.taskName}</p>
                    )}
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-gray-700">
                    <span className={`px-2 py-1 rounded text-xs font-semibold flex items-center gap-1 ${badge.className}`}>
                      {badge.icon}
                      {badge.label}
                    </span>
                    <div className="text-xs text-gray-400">
                      Started {new Date(timer.startTime).toLocaleTimeString()}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Summary */}
      <div className="bg-white rounded-2xl shadow-lg p-6 mb-6 border border-gray-100">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm text-gray-500 font-medium">Filtered Time</div>
            <div className="text-3xl font-bold text-indigo-600">{formatDuration(totalFilteredTime)}</div>
            <div className="text-sm text-gray-600 mt-1">
              {filteredData.length} entries • Last {selectedDays} {selectedDays === 1 ? 'day' : 'days'}
            </div>
          </div>
          {apiStatus.loading && (
            <div className="flex items-center gap-2 px-4 py-2 bg-indigo-50 text-indigo-600 rounded-xl">
              <RefreshCw className="w-4 h-4 animate-spin" />
              <span className="text-sm font-medium">Loading...</span>
            </div>
          )}
        </div>
      </div>

      {/* Time Entries Table */}
      <div className="bg-white rounded-2xl shadow-lg overflow-hidden border border-gray-100">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gradient-to-r from-gray-50 to-gray-100">
              <tr>
                <th className="px-6 py-4 text-left text-xs font-bold text-gray-600 uppercase tracking-wider">User</th>
                <th className="px-6 py-4 text-left text-xs font-bold text-gray-600 uppercase tracking-wider">Task</th>
                <th className="px-6 py-4 text-left text-xs font-bold text-gray-600 uppercase tracking-wider">Start</th>
                <th className="px-6 py-4 text-left text-xs font-bold text-gray-600 uppercase tracking-wider">Duration</th>
                <th className="px-6 py-4 text-left text-xs font-bold text-gray-600 uppercase tracking-wider">Device</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-100">
              {filteredData.length === 0 ? (
                <tr>
                  <td colSpan="5" className="px-6 py-12 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <Clock className="w-12 h-12 text-gray-400" />
                      <p className="text-gray-600 font-medium">No entries found</p>
                      <p className="text-sm text-gray-500">Try adjusting your filters</p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredData.map((timer, index) => {
                  const badge = getDeviceBadge(timer);
                  return (
                    <tr
                      key={`${timer.taskId}_${timer.userId}_${index}`}
                      className={`hover:bg-gray-50 transition ${timer.isFake ? 'bg-red-50 border-l-4 border-l-red-400' : ''}`}
                    >
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-full flex items-center justify-center text-white text-xs font-bold shadow">
                            {timer.user.charAt(0).toUpperCase()}
                          </div>
                          <span className="text-sm font-medium text-gray-900">{timer.user}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 max-w-xs">
                        {timer.taskUrl ? (
                          <a
                            href={timer.taskUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={`font-medium text-sm hover:underline flex items-center gap-1 ${
                              timer.isFake ? 'text-red-600 hover:text-red-800' : 'text-indigo-600 hover:text-indigo-800'
                            }`}
                          >
                            <span className="truncate">{timer.taskName}</span>
                            <ExternalLink className="w-3 h-3 flex-shrink-0" />
                          </a>
                        ) : (
                          <span className={`text-sm font-medium truncate block ${timer.isFake ? 'text-red-600' : 'text-gray-700'}`}>
                            {timer.taskName}
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                        {new Date(timer.startTime).toLocaleString()}
                      </td>
                      <td className={`px-6 py-4 whitespace-nowrap text-sm font-bold ${timer.isFake ? 'text-red-600' : 'text-gray-900'}`}>
                        {formatDuration(timer.duration)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-xs">
                        <span className={`font-bold px-3 py-1 rounded-full flex items-center gap-1 w-fit ${badge.className}`}>
                          {badge.icon}
                          {badge.label}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}