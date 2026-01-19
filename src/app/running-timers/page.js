'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { RefreshCw, LogOut, Clock, Activity, AlertTriangle,Calendar, Zap, ExternalLink, Users, TrendingUp } from 'lucide-react';
import Link from 'next/link';

const ACCESS_TOKEN_KEY = 'clickup_access_token';
const CLICKUP_CLIENT_ID = process.env.NEXT_PUBLIC_CLICKUP_CLIENT_ID;
const REDIRECT_URI = process.env.NEXT_PUBLIC_CLICKUP_REDIRECT_URI;
const OAUTH_SCOPES = 'team:read time_tracking:read';

const formatDuration = (ms) => {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (num) => String(num).padStart(2, '0');
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
};

const formatDurationDetailed = (ms) => {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const parts = [];
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (seconds > 0 || parts.length === 0) parts.push(`${seconds}s`);

  return parts.join(' ');
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

export default function RunningTimersPage() {
  const { loading, error, logout, authorizedFetch } = useAuth();

  const [runningTimers, setRunningTimers] = useState([]);
  const [stats, setStats] = useState(null);
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

  // Fetch running timers
  const fetchRunningTimers = useCallback(async () => {
    if (!authorizedFetch) return;

    setApiStatus({ loading: true, error: null });

    const { ok, data, error } = await authorizedFetch('/api/running-timers');

    if (ok) {
      console.log('✅ Running timers received:', data.runningTimers);
      setRunningTimers(data.runningTimers || []);
      setStats(data.stats || null);
    } else {
      console.error('❌ API Error:', error);
      setApiStatus({ loading: false, error: `Failed to load data: ${error}` });
    }
    setApiStatus(prev => ({ ...prev, loading: false }));
  }, [authorizedFetch]);

  // Initial fetch
  useEffect(() => {
    if (authorizedFetch) {
      fetchRunningTimers();
    }
  }, [authorizedFetch, fetchRunningTimers]);

  // Auto-refresh every 10 seconds
  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      fetchRunningTimers();
    }, 10000);
    return () => clearInterval(interval);
  }, [autoRefresh, fetchRunningTimers]);

  const getElapsedTime = (startTime) => {
    const elapsed = currentTime - startTime;
    return formatDuration(elapsed);
  };

  const totalActiveTime = runningTimers.reduce((sum, timer) => {
    return sum + (currentTime - timer.startTime);
  }, 0);

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
              <div className="relative p-2 bg-gradient-to-br from-green-500 to-emerald-600 rounded-xl shadow-lg">
                <Activity className="w-8 h-8 text-white animate-pulse" />
                <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full animate-ping"></span>
              </div>
              Live Running Timers
            </h1>
            <p className="text-gray-600 ml-16">Real-time activity monitoring</p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 px-4 py-2 bg-white rounded-xl shadow-md text-sm text-gray-700 cursor-pointer hover:shadow-lg transition-shadow">
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
                className="w-4 h-4 text-indigo-600 rounded focus:ring-2 focus:ring-indigo-500"
              />
              <Zap className="w-4 h-4 text-yellow-500" />
              <span className="font-medium">Auto-refresh (10s)</span>
            </label>

            <button
              onClick={fetchRunningTimers}
              disabled={apiStatus.loading}
              className="flex items-center gap-2 px-5 py-2 bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-xl shadow-lg hover:shadow-xl hover:scale-105 transition-all duration-200 text-sm font-semibold disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${apiStatus.loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>

            <Link href="/">
              <button className="flex items-center gap-2 px-5 py-2 bg-white text-gray-700 rounded-xl shadow-md hover:shadow-lg transition-all text-sm font-semibold">
                <Clock className="w-4 h-4" />
                Time Tracker
              </button>
            </Link>
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
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <div className="bg-gradient-to-br from-green-500 to-emerald-600 rounded-2xl p-6 shadow-xl text-white">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium opacity-90">Active Timers</span>
              <Activity className="w-5 h-5 animate-pulse" />
            </div>
            <div className="text-4xl font-bold">{stats.totalRunning}</div>
            <div className="text-xs opacity-75 mt-1">Currently tracking</div>
          </div>

          <div className="bg-gradient-to-br from-blue-500 to-indigo-600 rounded-2xl p-6 shadow-xl text-white">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium opacity-90">Total Active Time</span>
              <Clock className="w-5 h-5" />
            </div>
            <div className="text-4xl font-bold">{formatDurationDetailed(totalActiveTime)}</div>
            <div className="text-xs opacity-75 mt-1">Across all tasks</div>
          </div>

          <div className="bg-gradient-to-br from-purple-500 to-pink-600 rounded-2xl p-6 shadow-xl text-white">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium opacity-90">Active Users</span>
              <Users className="w-5 h-5" />
            </div>
            <div className="text-4xl font-bold">{stats.activeUsers}</div>
            <div className="text-xs opacity-75 mt-1">Team members working</div>
          </div>
        </div>
      )}

      {/* Running Timers Grid */}
      <div className="mb-8">
        {apiStatus.loading && runningTimers.length === 0 ? (
          <div className="bg-white rounded-2xl p-12 text-center shadow-lg">
            <RefreshCw className="w-12 h-12 animate-spin text-indigo-500 mx-auto mb-4" />
            <p className="text-gray-600 font-medium">Loading running timers...</p>
          </div>
        ) : runningTimers.length === 0 ? (
          <div className="bg-white rounded-2xl p-12 text-center border-2 border-dashed border-gray-300 shadow-lg">
            <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Activity className="w-10 h-10 text-gray-400" />
            </div>
            <h3 className="text-xl font-semibold text-gray-700 mb-2">No Active Timers</h3>
            <p className="text-gray-500 mb-4">
              Start tracking time in ClickUp to see real-time activity here
            </p>
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-green-50 text-green-700 rounded-lg text-sm">
              <Activity className="w-4 h-4" />
              <span>Click the timer icon in any ClickUp task to begin</span>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
            {runningTimers.map((timer, index) => (
              <div
                key={`${timer.id}_${index}`}
                className="group bg-gradient-to-br from-gray-900 via-[#111827] to-[#1e2a4a] rounded-xl shadow-xl hover:shadow-2xl transition-all duration-300 overflow-hidden border border-gray-700 hover:border-green-400/30 transform hover:-translate-y-1"
              >
                {/* Card Header */}
                <div className="bg-gradient-to-r from-green-600/20 to-emerald-600/10 p-3 border-b border-gray-700">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
                      <span className="text-xs font-bold text-green-400 uppercase tracking-wide">
                        Live Tracking
                      </span>
                    </div>
                    <div className="flex items-center gap-2 bg-black/30 backdrop-blur-sm px-2 py-1 rounded-lg border border-green-500/20">
                      <Clock className="w-3 h-3 text-green-400" />
                      <span className="text-white font-mono font-bold text-sm">
                        {getElapsedTime(timer.startTime)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Card Body */}
                <div className="p-4">
                  {/* User Info */}
                  <div className="flex items-center gap-3 mb-3 pb-3 border-b border-gray-700">
                    {timer.userProfilePicture ? (
                      <img
                        src={timer.userProfilePicture}
                        alt={timer.user}
                        className="w-10 h-10 rounded-full shadow-lg"
                      />
                    ) : (
                      <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-full flex items-center justify-center text-white font-bold text-sm shadow-lg">
                        {timer.userInitials}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-white text-sm truncate">
                        {timer.user}
                      </div>
                      <div className="text-xs text-gray-400">
                        Started {timer.startTimeShort}
                      </div>
                    </div>
                  </div>

                  {/* Task Info */}
                  <div className="mb-3">
                    <div className="flex items-start gap-2 mb-2">
                      {timer.taskUrl && timer.taskUrl !== 'https://app.clickup.com/t/null' ? (
                        <a
                          href={timer.taskUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-indigo-300 hover:text-indigo-200 font-medium text-sm leading-snug group-hover:underline flex items-center gap-1"
                        >
                          <span className="line-clamp-2">{timer.taskName}</span>
                          <ExternalLink className="w-3 h-3 flex-shrink-0" />
                        </a>
                      ) : (
                        <p className="text-gray-300 text-sm font-medium line-clamp-2">
                          {timer.taskName}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-2 text-xs text-gray-500">
                      <span className="truncate">{timer.folderName}</span>
                    </div>
                  </div>

                  {/* Footer Stats */}
                  <div className="flex items-center justify-between pt-3 border-t border-gray-700">
                    <div className="flex items-center gap-2">
                      <div className={`px-2 py-1 rounded text-xs font-semibold ${
                        timer.isFake
                          ? 'bg-orange-500/20 text-orange-300 border border-orange-500/30'
                          : 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                      }`}>
                        {timer.source || 'Unknown'}
                      </div>
                      {timer.billable && (
                        <div className="px-2 py-1 rounded text-xs font-semibold bg-green-500/20 text-green-300 border border-green-500/30">
                          Billable
                        </div>
                      )}
                    </div>
                    <div className="text-xs text-gray-400 font-medium">
                      {formatDurationDetailed(currentTime - timer.startTime)}
                    </div>
                  </div>

                  {timer.isFake && (
                    <div className="mt-3 flex items-center gap-2 text-xs text-orange-400 bg-orange-500/10 px-2 py-1.5 rounded border border-orange-500/20">
                      <AlertTriangle className="w-3 h-3" />
                      <span className="font-medium">Manual Time Entry</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer Info */}
      {runningTimers.length > 0 && (
        <div className="text-center text-sm text-gray-600 bg-white rounded-xl p-4 shadow-md">
          <p>
            Showing {runningTimers.length} active timer{runningTimers.length !== 1 ? 's' : ''} •
            Auto-refreshing every 10 seconds •
            Last updated: {new Date().toLocaleTimeString()}
          </p>
        </div>
      )}
    </div>
  );
}