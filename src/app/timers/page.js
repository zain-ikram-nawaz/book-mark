'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { RefreshCw, LogOut, Clock, Layers, Folder, List, User, TrendingUp, AlertTriangle, Calendar, Activity, Play, Zap, MapPin, Tag, ExternalLink } from 'lucide-react';

const CLICKUP_CLIENT_ID = process.env.NEXT_PUBLIC_CLICKUP_CLIENT_ID;
const REDIRECT_URI = process.env.NEXT_PUBLIC_CLICKUP_REDIRECT_URI;
const OAUTH_SCOPES = 'team:read time_tracking:read task:read list:read space:read user:read';
const ACCESS_TOKEN_KEY = 'clickup_access_token';

const DATE_FILTER_OPTIONS = [
    { value: 'today', label: 'Today' },
    { value: 'yesterday', label: 'Yesterday' },
    { value: '3days', label: 'Last 3 Days' },
    { value: '5days', label: 'Last 5 Days' },
    { value: 'week', label: 'Last Week' },
    { value: 'month', label: 'Last Month' },
    { value: 'all', label: 'All Time' }
];

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

const getDateRange = (filter) => {
    const now = new Date();
    const startDate = new Date();

    switch (filter) {
        case 'today':
            startDate.setHours(0, 0, 0, 0);
            return { start: startDate.getTime(), end: now.getTime() };
        case 'yesterday':
            startDate.setDate(now.getDate() - 1);
            startDate.setHours(0, 0, 0, 0);
            const yesterdayEnd = new Date(startDate);
            yesterdayEnd.setHours(23, 59, 59, 999);
            return { start: startDate.getTime(), end: yesterdayEnd.getTime() };
        case '3days':
            startDate.setDate(now.getDate() - 3);
            return { start: startDate.getTime(), end: now.getTime() };
        case '5days':
            startDate.setDate(now.getDate() - 5);
            return { start: startDate.getTime(), end: now.getTime() };
        case 'week':
            startDate.setDate(now.getDate() - 7);
            return { start: startDate.getTime(), end: now.getTime() };
        case 'month':
            startDate.setMonth(now.getMonth() - 1);
            return { start: startDate.getTime(), end: now.getTime() };
        case 'all':
        default:
            return { start: null, end: null };
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
            setError("Configuration Error: Missing CLIENT_ID or REDIRECT_URI in environment variables.");
            setLoading(false);
            return;
        }

        const authUrl = `https://app.clickup.com/api?client_id=${CLICKUP_CLIENT_ID}&redirect_uri=${REDIRECT_URI}&response_type=code&scope=${OAUTH_SCOPES}`;
        console.log("Redirecting to ClickUp for OAuth...");
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
                alert("Authorization token expired. Please re-authenticate.");
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

export default function ListTimerApp() {
    const { loading, error, logout, authorizedFetch } = useAuth();
    const [spaces, setSpaces] = useState([]);
    const [folders, setFolders] = useState([]);
    const [lists, setLists] = useState([]);
    const [timers, setTimers] = useState([]);
    const [runningTimers, setRunningTimers] = useState([]);
    const [allRunningTimers, setAllRunningTimers] = useState([]);
    const [filteredTimers, setFilteredTimers] = useState([]);
    const [apiStatus, setApiStatus] = useState({ loading: false, error: null });
    const [autoRefresh, setAutoRefresh] = useState(false);
    const [currentTime, setCurrentTime] = useState(Date.now());
    const [showAllRunning, setShowAllRunning] = useState(true);

    const [selectedSpaceId, setSelectedSpaceId] = useState('');
    const [selectedFolderId, setSelectedFolderId] = useState('');
    const [selectedListId, setSelectedListId] = useState('');
    const [selectedDateFilter, setSelectedDateFilter] = useState('week');

    // Update current time every second
    useEffect(() => {
        const interval = setInterval(() => {
            setCurrentTime(Date.now());
        }, 1000);

        return () => clearInterval(interval);
    }, []);

    useEffect(() => {
        if (timers.length === 0) {
            setFilteredTimers([]);
            return;
        }

        if (selectedDateFilter === 'all') {
            setFilteredTimers(timers);
            return;
        }

        const dateRange = getDateRange(selectedDateFilter);
        const filtered = timers.filter(timer => {
            const timerDate = new Date(timer.startTime).getTime();
            return timerDate >= dateRange.start && timerDate <= dateRange.end;
        });

        setFilteredTimers(filtered);
    }, [timers, selectedDateFilter]);

    const fetchAllRunningTimers = useCallback(async () => {
        if (!authorizedFetch) return;

        const { ok, data, error } = await authorizedFetch('/api/running-timers');

        if (ok) {
            setAllRunningTimers(data.runningTimers || []);
        } else {
            console.error('❌ Failed to fetch running timers:', error);
        }
    }, [authorizedFetch]);

    useEffect(() => {
        if (!authorizedFetch) return;

        const fetchSpaces = async () => {
            setApiStatus({ loading: true, error: null });
            const { ok, data, error } = await authorizedFetch('/api/spaces');

            if (ok) {
                setSpaces(data.data || []);
                if (data.data && data.data.length > 0) {
                    setSelectedSpaceId(data.data[0].id);
                }
            } else {
                setApiStatus({ loading: false, error: `Failed to load spaces: ${error}` });
            }
            setApiStatus(prev => ({ ...prev, loading: false }));
        };
        fetchSpaces();
        fetchAllRunningTimers();
    }, [authorizedFetch, fetchAllRunningTimers]);

    useEffect(() => {
        setFolders([]);
        setSelectedFolderId('');
        setLists([]);
        setSelectedListId('');
        setTimers([]);
        setRunningTimers([]);
        setFilteredTimers([]);

        if (!selectedSpaceId || !authorizedFetch) return;

        const fetchFolders = async () => {
            setApiStatus({ loading: true, error: null });
            const { ok, data, error } = await authorizedFetch(`/api/folders?spaceId=${selectedSpaceId}`);

            if (ok) {
                setFolders(data.data || []);
                if (data.data && data.data.length > 0) {
                    setSelectedFolderId(data.data[0].id);
                } else {
                    setSelectedFolderId(selectedSpaceId);
                }
            } else {
                setApiStatus({ loading: false, error: `Failed to load folders: ${error}` });
            }
            setApiStatus(prev => ({ ...prev, loading: false }));
        };
        fetchFolders();
    }, [selectedSpaceId, authorizedFetch]);

    useEffect(() => {
        setLists([]);
        setSelectedListId('');
        setTimers([]);
        setRunningTimers([]);
        setFilteredTimers([]);

        if (!selectedFolderId || !authorizedFetch) return;

        const fetchLists = async () => {
            setApiStatus({ loading: true, error: null });
            const fetchId = selectedFolderId;

            const { ok, data, error } = await authorizedFetch(`/api/lists?folderId=${fetchId}`);

            if (ok) {
                setLists(data.data || []);
                if (data.data && data.data.length > 0) {
                    setSelectedListId(data.data[0].id);
                }
            } else {
                setApiStatus({ loading: false, error: `Failed to load lists: ${error}` });
            }
            setApiStatus(prev => ({ ...prev, loading: false }));
        };
        fetchLists();
    }, [selectedFolderId, authorizedFetch]);

    const fetchTimers = useCallback(async (listId) => {
        if (!listId || !authorizedFetch) {
            setTimers([]);
            setRunningTimers([]);
            setFilteredTimers([]);
            return;
        }

        setApiStatus({ loading: true, error: null });

        const { ok, data, error } = await authorizedFetch(`/api/tasks?listId=${listId}`);

        if (ok) {
            setTimers(data.data || []);
            setRunningTimers(data.runningTimers || []);
        } else {
            setApiStatus({ loading: false, error: `Failed to load time entries: ${error}` });
            setTimers([]);
            setRunningTimers([]);
            setFilteredTimers([]);
        }
        setApiStatus(prev => ({ ...prev, loading: false }));
    }, [authorizedFetch]);

    useEffect(() => {
        if (selectedListId) {
            fetchTimers(selectedListId);
        }
    }, [selectedListId, fetchTimers]);

    useEffect(() => {
        if (!autoRefresh) return;

        const interval = setInterval(() => {
            fetchAllRunningTimers();
            if (selectedListId) {
                fetchTimers(selectedListId);
            }
        }, 10000);

        return () => clearInterval(interval);
    }, [autoRefresh, selectedListId, fetchTimers, fetchAllRunningTimers]);

    const handleManualRefresh = () => {
        fetchAllRunningTimers();
        if (selectedListId) {
            fetchTimers(selectedListId);
        }
    };

    const totalFilteredTime = filteredTimers.reduce((sum, timer) => sum + timer.duration, 0);

    const getDateRangeDisplay = () => {
        if (selectedDateFilter === 'all') return 'All Time';

        const range = getDateRange(selectedDateFilter);
        const startDate = new Date(range.start);
        const endDate = new Date(range.end);

        return `${startDate.toLocaleDateString()} - ${endDate.toLocaleDateString()}`;
    };

    const getElapsedTime = (startTime) => {
        const elapsed = currentTime - startTime;
        return formatDuration(elapsed);
    };

    const currentListRunningTimers = allRunningTimers.filter(
        timer => selectedListId && String(timer.listId) === String(selectedListId)
    );

    // Calculate total active time across all running timers
    const totalActiveTime = allRunningTimers.reduce((sum, timer) => {
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
                            <div className="p-2 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl shadow-lg">
                                <Clock className="w-8 h-8 text-white" />
                            </div>
                            ClickUp Time Dashboard
                        </h1>
                        <p className="text-gray-600 ml-16">Real-time tracking and analytics</p>
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
                            onClick={handleManualRefresh}
                            disabled={apiStatus.loading}
                            className="flex items-center gap-2 px-5 py-2 bg-gradient-to-r from-indigo-500 to-purple-600 text-white rounded-xl shadow-lg hover:shadow-xl hover:scale-105 transition-all duration-200 text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
                        >
                            <RefreshCw className={`w-4 h-4 ${apiStatus.loading ? 'animate-spin' : ''}`} />
                            Refresh
                        </button>
                        <button
                            onClick={logout}
                            className="flex items-center gap-2 px-5 py-2 bg-white text-gray-700 rounded-xl shadow-md hover:shadow-lg hover:bg-gray-50 transition-all duration-200 text-sm font-semibold"
                        >
                            <LogOut className="w-4 h-4" />
                            Logout
                        </button>
                    </div>
                </div>
            </header>

            {/* Filters */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8 bg-white p-6 rounded-2xl shadow-lg border border-gray-100">
                <div className='flex flex-col'>
                    <label className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                        <Layers className="w-4 h-4 text-indigo-500" />
                        <span>Space</span>
                    </label>
                    <select
                        value={selectedSpaceId}
                        onChange={(e) => setSelectedSpaceId(e.target.value)}
                        className="p-3 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all bg-gray-50 hover:bg-white"
                        disabled={spaces.length === 0}
                    >
                        {spaces.length === 0 && <option value="">No spaces available</option>}
                        {spaces.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                </div>

                <div className='flex flex-col'>
                    <label className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                        <Folder className="w-4 h-4 text-indigo-500" />
                        <span>Folder</span>
                    </label>
                    <select
                        value={selectedFolderId}
                        onChange={(e) => setSelectedFolderId(e.target.value)}
                        className="p-3 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all bg-gray-50 hover:bg-white"
                        disabled={folders.length === 0 && selectedFolderId !== selectedSpaceId}
                    >
                        {folders.length === 0 && selectedFolderId === selectedSpaceId && (
                            <option value={selectedSpaceId}>Ungrouped Lists</option>
                        )}
                        {folders.map(f => (
                            <option key={f.id} value={f.id}>
                                {f.name}
                            </option>
                        ))}
                    </select>
                </div>

                <div className='flex flex-col'>
                    <label className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                        <List className="w-4 h-4 text-indigo-500" />
                        <span>List</span>
                    </label>
                    <select
                        value={selectedListId}
                        onChange={(e) => setSelectedListId(e.target.value)}
                        className="p-3 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all bg-gray-50 hover:bg-white"
                        disabled={lists.length === 0}
                    >
                        {lists.length === 0 && <option value="">No lists available</option>}
                        {lists.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                    </select>
                </div>

                <div className='flex flex-col'>
                    <label className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-indigo-500" />
                        <span>Date Range</span>
                    </label>
                    <select
                        value={selectedDateFilter}
                        onChange={(e) => setSelectedDateFilter(e.target.value)}
                        className="p-3 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all bg-gray-50 hover:bg-white"
                    >
                        {DATE_FILTER_OPTIONS.map(option => (
                            <option key={option.value} value={option.value}>
                                {option.label}
                            </option>
                        ))}
                    </select>
                </div>
            </div>

            {/* Live Activity Stats Bar */}
            {allRunningTimers.length > 0 && (
                <div className="mb-6 grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="bg-gradient-to-br from-green-500 to-emerald-600 rounded-2xl p-6 shadow-xl text-white">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-sm font-medium opacity-90">Active Timers</span>
                            <Activity className="w-5 h-5 animate-pulse" />
                        </div>
                        <div className="text-4xl font-bold">{allRunningTimers.length}</div>
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
                            <span className="text-sm font-medium opacity-90">Team Members</span>
                            <User className="w-5 h-5" />
                        </div>
                        <div className="text-4xl font-bold">{new Set(allRunningTimers.map(t => t.userId)).size}</div>
                        <div className="text-xs opacity-75 mt-1">Currently active</div>
                    </div>
                </div>
            )}

            {/* Running Timers Section - UPDATED DARK DESIGN */}
            <div className="mb-8">
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-2xl font-bold text-gray-800 flex items-center gap-3">
                        <div className="relative">
                            <Activity className="w-7 h-7 text-green-600 animate-pulse" />
                            <span className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full animate-ping"></span>
                        </div>
                        Live Activity Monitor
                        <span className="text-lg font-normal text-gray-500">
                            ({allRunningTimers.length} active)
                        </span>
                    </h2>
                    <button
                        onClick={() => setShowAllRunning(!showAllRunning)}
                        className="px-4 py-2 bg-white rounded-xl shadow-md hover:shadow-lg transition-all text-sm font-medium text-gray-700"
                    >
                        {showAllRunning ? 'Show Current List Only' : 'Show All Lists'}
                    </button>
                </div>

                {allRunningTimers.length === 0 ? (
                    <div className="bg-white rounded-2xl p-12 text-center border-2 border-dashed border-gray-300 shadow-lg">
                        <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                            <Activity className="w-10 h-10 text-gray-400" />
                        </div>
                        <h3 className="text-xl font-semibold text-gray-700 mb-2">No Active Timers</h3>
                        <p className="text-gray-500 mb-4">
                            Start tracking time in ClickUp to see real-time activity here
                        </p>
                        <div className="inline-flex items-center gap-2 px-4 py-2 bg-green-50 text-green-700 rounded-lg text-sm">
                            <Play className="w-4 h-4" />
                            <span>Click the timer icon in any ClickUp task to begin</span>
                        </div>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
                        {(showAllRunning ? allRunningTimers : currentListRunningTimers).map((timer, index) => (
                            <div
                                key={`running_${timer.taskId}_${timer.userId}_${index}`}
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
                                        <div className="w-8 h-8 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-full flex items-center justify-center text-white font-bold text-xs shadow-lg">
                                            {timer.user.charAt(0).toUpperCase()}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="font-semibold text-white text-sm truncate">
                                                {timer.user}
                                            </div>
                                            <div className="text-xs text-gray-400">
                                                Started {new Date(timer.startTime).toLocaleTimeString()}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Task Info */}
                                    <div className="mb-3">
                                        <div className="flex items-start gap-2 mb-2">
                                            <Tag className="w-3 h-3 text-indigo-400 mt-1 flex-shrink-0" />
                                            {timer.taskUrl ? (
                                                <a
                                                    href={timer.taskUrl}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="text-indigo-300 hover:text-indigo-200 font-medium text-xs leading-snug group-hover:underline flex items-center gap-1"
                                                >
                                                    <span className="line-clamp-2">{timer.taskName}</span>
                                                    <ExternalLink className="w-3 h-3 flex-shrink-0" />
                                                </a>
                                            ) : (
                                                <p className="text-gray-300 text-xs font-medium line-clamp-2">
                                                    {timer.taskName}
                                                </p>
                                            )}
                                        </div>

                                        {timer.listName && (
                                            <div className="flex items-center gap-2 text-xs text-gray-500 ml-5">
                                                <MapPin className="w-3 h-3" />
                                                <span className="truncate">{timer.listName}</span>
                                            </div>
                                        )}
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
                                        </div>
                                        <div className="text-xs text-gray-400 font-medium">
                                            {formatDurationDetailed(currentTime - timer.startTime)} elapsed
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

            {/* Summary Stats */}
            <div className="mb-6 bg-white rounded-2xl shadow-lg p-6 border border-gray-100">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                    <div className="flex flex-col gap-3">
                        <div className="flex items-center gap-3">
                            <TrendingUp className="w-6 h-6 text-green-500" />
                            <div>
                                <div className="text-sm text-gray-500 font-medium">Filtered Time</div>
                                <div className="text-2xl font-bold text-indigo-600">
                                    {formatDuration(totalFilteredTime)}
                                </div>
                            </div>
                            {filteredTimers.length > 0 && (
                                <span className="px-3 py-1 bg-indigo-100 text-indigo-700 rounded-full text-sm font-semibold">
                                    {filteredTimers.length} entries
                                </span>
                            )}
                        </div>
                        <div className="flex items-center gap-2 text-sm text-gray-600">
                            <Calendar className="w-4 h-4" />
                            <span className="font-medium">{getDateRangeDisplay()}</span>
                            {timers.length > 0 && (
                                <span className="text-gray-400">
                                    • Total: {formatDuration(timers.reduce((sum, timer) => sum + timer.duration, 0))} ({timers.length} entries)
                                </span>
                            )}
                        </div>
                    </div>

                    {apiStatus.loading && (
                        <div className="flex items-center gap-2 px-4 py-2 bg-indigo-50 text-indigo-600 rounded-xl">
                            <RefreshCw className="w-4 h-4 animate-spin" />
                            <span className="text-sm font-medium">Fetching Data...</span>
                        </div>
                    )}
                    {apiStatus.error && (
                        <div className="text-sm text-red-600 px-4 py-2 bg-red-50 rounded-xl border border-red-200 font-medium">
                            {apiStatus.error}
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
                                <th className="px-6 py-4 text-left text-xs font-bold text-gray-600 uppercase tracking-wider">Status</th>
                                <th className="px-6 py-4 text-left text-xs font-bold text-gray-600 uppercase tracking-wider">User</th>
                                <th className="px-6 py-4 text-left text-xs font-bold text-gray-600 uppercase tracking-wider">Task</th>
                                <th className="px-6 py-4 text-left text-xs font-bold text-gray-600 uppercase tracking-wider">Start Time</th>
                                <th className="px-6 py-4 text-left text-xs font-bold text-gray-600 uppercase tracking-wider">End Time</th>
                                <th className="px-6 py-4 text-left text-xs font-bold text-gray-600 uppercase tracking-wider">Duration</th>
                                <th className="px-6 py-4 text-left text-xs font-bold text-gray-600 uppercase tracking-wider">Source</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-100">
                            {filteredTimers.length === 0 && !apiStatus.loading ? (
                                <tr>
                                    <td colSpan="7" className="px-6 py-12 text-center">
                                        <div className="flex flex-col items-center gap-3">
                                            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center">
                                                <Clock className="w-8 h-8 text-gray-400" />
                                            </div>
                                            <p className="text-gray-600 font-medium">
                                                {selectedListId
                                                    ? `No time entries found for ${DATE_FILTER_OPTIONS.find(opt => opt.value === selectedDateFilter)?.label}`
                                                    : "Please select a List to view time entries"}
                                            </p>
                                        </div>
                                    </td>
                                </tr>
                            ) : (
                                filteredTimers.map((timer, index) => (
                                    <tr
                                        key={`${timer.taskId}_${timer.userId}_${index}`}
                                        className={`
                                            transition-all duration-200 hover:bg-gray-50
                                            ${timer.isRunning
                                                ? 'bg-green-50 border-l-4 border-l-green-500'
                                                : timer.isFake
                                                ? 'bg-red-50 border-l-4 border-l-red-400'
                                                : ''
                                            }
                                        `}
                                    >
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <div className="flex items-center gap-2">
                                                <span className={`px-3 py-1 inline-flex text-xs font-bold rounded-full ${
                                                    timer.status === 'running'
                                                        ? 'bg-green-100 text-green-800'
                                                        : 'bg-gray-100 text-gray-700'
                                                }`}>
                                                    {timer.status}
                                                </span>
                                                {timer.isFake && (
                                                    <AlertTriangle className="w-4 h-4 text-red-500" />
                                                )}
                                                {timer.isRunning && (
                                                    <Activity className="w-4 h-4 text-green-500 animate-pulse" />
                                                )}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <div className="flex items-center gap-3">
                                                <div className="w-8 h-8 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-full flex items-center justify-center text-white text-xs font-bold">
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
                                                        timer.isRunning
                                                            ? 'text-green-600 hover:text-green-800'
                                                            : timer.isFake
                                                            ? 'text-red-600 hover:text-red-800'
                                                            : 'text-indigo-600 hover:text-indigo-800'
                                                    }`}
                                                >
                                                    <span className="truncate">{timer.taskName}</span>
                                                    <ExternalLink className="w-3 h-3 flex-shrink-0" />
                                                </a>
                                            ) : (
                                                <span className={`text-sm font-medium truncate block ${
                                                    timer.isFake ? 'text-red-600' : timer.isRunning ? 'text-green-600' : 'text-gray-700'
                                                }`}>
                                                    {timer.taskName}
                                                </span>
                                            )}
                                        </td>
                                        <td className={`px-6 py-4 whitespace-nowrap text-sm ${
                                            timer.isRunning ? 'text-green-700 font-medium' : timer.isFake ? 'text-red-700' : 'text-gray-600'
                                        }`}>
                                            {new Date(timer.startTime).toLocaleString()}
                                        </td>
                                        <td className={`px-6 py-4 whitespace-nowrap text-sm ${
                                            timer.isRunning ? 'text-green-700 font-medium' : timer.isFake ? 'text-red-700' : 'text-gray-600'
                                        }`}>
                                            {timer.status === 'running' ? (
                                                <span className="flex items-center gap-2">
                                                    <Activity className="w-4 h-4 animate-pulse" />
                                                    <span className="font-semibold">Running...</span>
                                                </span>
                                            ) : (
                                                new Date(timer.endTime).toLocaleString()
                                            )}
                                        </td>
                                        <td className={`px-6 py-4 whitespace-nowrap text-sm font-bold ${
                                            timer.isRunning ? 'text-green-600' : timer.isFake ? 'text-red-600' : 'text-gray-900'
                                        }`}>
                                            {timer.isRunning ? getElapsedTime(timer.startTime) : formatDuration(timer.duration)}
                                            {timer.isFake && (
                                                <span className="ml-2 text-xs text-red-500 font-normal">(Manual)</span>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-xs">
                                            {timer.isFake ? (
                                                <span className="text-red-600 font-bold bg-red-100 px-3 py-1 rounded-full">
                                                    MANUAL FAKE
                                                </span>
                                            ) : (
                                                <span className="text-gray-500 font-medium px-3 py-1 bg-gray-100 rounded-full">
                                                    {timer.source}
                                                </span>
                                            )}
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}