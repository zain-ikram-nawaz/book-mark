'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { RefreshCw, LogOut, Clock, Layers, Folder, List, User, TrendingUp, AlertTriangle, Calendar } from 'lucide-react';

// --- CONFIGURATION ---
// Environment variables must be set with NEXT_PUBLIC_ prefix for client-side access
const CLICKUP_CLIENT_ID = process.env.NEXT_PUBLIC_CLICKUP_CLIENT_ID;
const REDIRECT_URI = process.env.NEXT_PUBLIC_CLICKUP_REDIRECT_URI;
// Scopes needed for time tracking and task/space hierarchy
const OAUTH_SCOPES = 'team:read time_tracking:read task:read list:read space:read user:read';
const ACCESS_TOKEN_KEY = 'clickup_access_token';

// Date filter options
const DATE_FILTER_OPTIONS = [
    { value: 'today', label: 'Today' },
    { value: 'yesterday', label: 'Yesterday' },
    { value: '3days', label: 'Last 3 Days' },
    { value: '5days', label: 'Last 5 Days' },
    { value: 'week', label: 'Last Week' },
    { value: 'month', label: 'Last Month' },
    { value: 'all', label: 'All Time' }
];

// Helper to format duration (ms to HH:MM:SS)
const formatDuration = (ms) => {
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    const pad = (num) => String(num).padStart(2, '0');
    return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
};

// Helper to calculate date range based on filter
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

// --- AUTHENTICATION PROVIDER ---
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

    // Generic authorized fetch utility
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
                // Token expired or revoked
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

// --- MAIN APPLICATION COMPONENT ---
export default function ListTimerApp() {
    const { loading, error, logout, authorizedFetch } = useAuth();
    const [spaces, setSpaces] = useState([]);
    const [folders, setFolders] = useState([]);
    const [lists, setLists] = useState([]);
    const [timers, setTimers] = useState([]);
    const [filteredTimers, setFilteredTimers] = useState([]);
    const [apiStatus, setApiStatus] = useState({ loading: false, error: null });

    const [selectedSpaceId, setSelectedSpaceId] = useState('');
    const [selectedFolderId, setSelectedFolderId] = useState('');
    const [selectedListId, setSelectedListId] = useState('');
    const [selectedDateFilter, setSelectedDateFilter] = useState('week');

    // Filter timers based on date selection
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

    // 1. Fetch Spaces
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
    }, [authorizedFetch]);

    // 2. Fetch Folders when Space changes
    useEffect(() => {
        setFolders([]);
        setSelectedFolderId('');
        setLists([]);
        setSelectedListId('');
        setTimers([]);
        setFilteredTimers([]);

        if (!selectedSpaceId || !authorizedFetch) return;

        const fetchFolders = async () => {
            setApiStatus({ loading: true, error: null });
            const { ok, data, error } = await authorizedFetch(`/api/folders?spaceId=${selectedSpaceId}`);

            if (ok) {
                setFolders(data.data || []);
                // If there are folders, select the first one. If not, proceed to lists using spaceId (ungrouped lists)
                if (data.data && data.data.length > 0) {
                    setSelectedFolderId(data.data[0].id);
                } else {
                    // This space has no folders, so treat the spaceId as the folderId for lists API
                    setSelectedFolderId(selectedSpaceId);
                }
            } else {
                setApiStatus({ loading: false, error: `Failed to load folders: ${error}` });
            }
            setApiStatus(prev => ({ ...prev, loading: false }));
        };
        fetchFolders();
    }, [selectedSpaceId, authorizedFetch]);

    // 3. Fetch Lists when Folder changes
    useEffect(() => {
        setLists([]);
        setSelectedListId('');
        setTimers([]);
        setFilteredTimers([]);

        if (!selectedFolderId || !authorizedFetch) return;

        const fetchLists = async () => {
            setApiStatus({ loading: true, error: null });
            const fetchId = selectedFolderId; // Either a Folder ID or a Space ID (for ungrouped lists)

            // Note: ClickUp uses 'folderId' parameter even for ungrouped lists inside a Space.
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

    // 4. Fetch Time Entries when List changes - ONLY ONCE when list is selected
    const fetchTimers = useCallback(async (listId) => {
        if (!listId || !authorizedFetch) {
            setTimers([]);
            setFilteredTimers([]);
            return;
        }

        console.log(`🔍 Fetching time entries for list: ${listId}`);
        setApiStatus({ loading: true, error: null });

        const { ok, data, error } = await authorizedFetch(`/api/tasks?listId=${listId}`);

        if (ok) {
            setTimers(data.data || []);
            console.log(`✅ Loaded ${data.data?.length || 0} time entries for list ${listId}`);

            // Log debug info if available
            if (data.debug) {
                console.log('📋 Debug Info:', data.debug);
            }
            if (data.meta) {
                console.log('📊 Meta Info:', data.meta);
            }
        } else {
            setApiStatus({ loading: false, error: `Failed to load time entries: ${error}` });
            setTimers([]);
            setFilteredTimers([]);
            console.error(`❌ Failed to load time entries for list ${listId}:`, error);
        }
        setApiStatus(prev => ({ ...prev, loading: false }));
    }, [authorizedFetch]);

    // Auto-fetch timers ONLY when selected list changes - no auto-refresh
    useEffect(() => {
        if (selectedListId) {
            fetchTimers(selectedListId);
        }
    }, [selectedListId]);

    // Manual refresh function
    const handleManualRefresh = () => {
        if (selectedListId) {
            fetchTimers(selectedListId);
        }
    };

    // Calculate total time for filtered timers
    const totalFilteredTime = filteredTimers.reduce((sum, timer) => sum + timer.duration, 0);

    // Get date range display text
    const getDateRangeDisplay = () => {
        if (selectedDateFilter === 'all') return 'All Time';

        const range = getDateRange(selectedDateFilter);
        const startDate = new Date(range.start);
        const endDate = new Date(range.end);

        return `${startDate.toLocaleDateString()} - ${endDate.toLocaleDateString()}`;
    };

    // --- RENDERING ---

    if (loading) {
        return (
            <div className="flex items-center justify-center h-screen bg-gray-50">
                <div className="p-6 bg-white rounded-xl shadow-lg flex items-center space-x-4">
                    <RefreshCw className="w-6 h-6 animate-spin text-indigo-500" />
                    <p className="text-gray-700">Authorizing with ClickUp...</p>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="p-8 bg-red-100 border border-red-400 text-red-700 rounded-lg shadow-lg">
                <h2 className="text-xl font-bold mb-4">Authorization Error</h2>
                <p>{error}</p>
                <button
                    onClick={logout}
                    className="mt-4 px-4 py-2 bg-red-500 text-white rounded-lg shadow hover:bg-red-600 transition duration-150"
                >
                    <LogOut className="inline w-4 h-4 mr-2" />
                    Logout and Retry
                </button>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-100 p-4 md:p-8 font-sans">
            <header className="flex justify-between items-center mb-8 pb-4 border-b border-gray-200">
                <h1 className="text-3xl font-bold text-gray-800 flex items-center">
                    <Clock className="w-7 h-7 mr-3 text-indigo-600" />
                    ClickUp Time Dashboard (OAuth)
                </h1>
                <div className="flex items-center gap-4">
                    <button
                        onClick={handleManualRefresh}
                        disabled={apiStatus.loading || !selectedListId}
                        className="flex items-center px-4 py-2 bg-indigo-500 text-white rounded-lg shadow-md hover:bg-indigo-600 transition duration-150 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <RefreshCw className={`w-4 h-4 mr-2 ${apiStatus.loading ? 'animate-spin' : ''}`} />
                        Refresh Data
                    </button>
                    <button
                        onClick={logout}
                        className="flex items-center px-4 py-2 bg-gray-200 text-gray-700 rounded-lg shadow-md hover:bg-gray-300 transition duration-150 text-sm"
                    >
                        <LogOut className="w-4 h-4 mr-2" />
                        Logout
                    </button>
                </div>
            </header>

            {/* Selection Dropdowns */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8 bg-white p-4 rounded-xl shadow-md">
                <div className='flex flex-col'>
                    <label className="text-sm font-medium text-gray-600 mb-1 flex items-center">
                        <Layers className="w-4 h-4 mr-1 text-indigo-500" /> Space
                    </label>
                    <select
                        value={selectedSpaceId}
                        onChange={(e) => setSelectedSpaceId(e.target.value)}
                        className="p-2 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
                        disabled={spaces.length === 0}
                    >
                        {spaces.length === 0 && <option value="">No spaces available</option>}
                        {spaces.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                </div>

                <div className='flex flex-col'>
                    <label className="text-sm font-medium text-gray-600 mb-1 flex items-center">
                        <Folder className="w-4 h-4 mr-1 text-indigo-500" /> Folder
                    </label>
                    <select
                        value={selectedFolderId}
                        onChange={(e) => setSelectedFolderId(e.target.value)}
                        className="p-2 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
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
                    <label className="text-sm font-medium text-gray-600 mb-1 flex items-center">
                        <List className="w-4 h-4 mr-1 text-indigo-500" /> List
                    </label>
                    <select
                        value={selectedListId}
                        onChange={(e) => setSelectedListId(e.target.value)}
                        className="p-2 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
                        disabled={lists.length === 0}
                    >
                        {lists.length === 0 && <option value="">No lists available</option>}
                        {lists.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                    </select>
                </div>

                <div className='flex flex-col'>
                    <label className="text-sm font-medium text-gray-600 mb-1 flex items-center">
                        <Calendar className="w-4 h-4 mr-1 text-indigo-500" /> Date Range
                    </label>
                    <select
                        value={selectedDateFilter}
                        onChange={(e) => setSelectedDateFilter(e.target.value)}
                        className="p-2 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
                    >
                        {DATE_FILTER_OPTIONS.map(option => (
                            <option key={option.value} value={option.value}>
                                {option.label}
                            </option>
                        ))}
                    </select>
                </div>
            </div>

            {/* Status and Summary */}
            <div className="mb-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div className="flex flex-col gap-2">
                    <div className="text-xl font-semibold text-gray-700 flex items-center">
                        <TrendingUp className="w-5 h-5 mr-2 text-green-500" />
                        Filtered Time:
                        <span className="ml-2 text-indigo-600">{formatDuration(totalFilteredTime)}</span>
                        {filteredTimers.length > 0 && (
                            <span className="ml-3 text-sm text-gray-500">({filteredTimers.length} entries)</span>
                        )}
                    </div>
                    <div className="text-sm text-gray-500 flex items-center">
                        <Calendar className="w-4 h-4 mr-1" />
                        {getDateRangeDisplay()}
                        {timers.length > 0 && (
                            <span className="ml-3">
                                (Total: {formatDuration(timers.reduce((sum, timer) => sum + timer.duration, 0))} from {timers.length} entries)
                            </span>
                        )}
                    </div>
                </div>

                {apiStatus.loading && (
                    <div className="flex items-center text-indigo-500">
                        <RefreshCw className="w-4 h-4 animate-spin mr-2" /> Fetching Data...
                    </div>
                )}
                {apiStatus.error && (
                    <div className="text-sm text-red-500 p-2 bg-red-100 rounded-md border border-red-300">
                        {apiStatus.error}
                    </div>
                )}
            </div>

            {/* Time Entries Table */}
            <div className="bg-white rounded-xl shadow-lg overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">User</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Task</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Start Time</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">End Time</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Duration</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Source</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {filteredTimers.length === 0 && !apiStatus.loading ? (
                            <tr>
                                <td colSpan="7" className="px-6 py-4 text-center text-gray-500">
                                    {selectedListId
                                        ? `No time entries found for this date range (${DATE_FILTER_OPTIONS.find(opt => opt.value === selectedDateFilter)?.label}).`
                                        : "Please select a List to view time entries."}
                                </td>
                            </tr>
                        ) : (
                            filteredTimers.map((timer, index) => (
                                <tr
                                    key={`${timer.taskId}_${timer.userId}_${index}`}
                                    className={`
                                        transition-all duration-200
                                        ${timer.isFake
                                            ? 'bg-red-50 hover:bg-red-100 border-l-4 border-l-red-400'
                                            : 'hover:bg-gray-50'
                                        }
                                    `}
                                >
                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                                        <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                                            timer.status === 'running' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                                        }`}>
                                            {timer.status}
                                        </span>
                                        {timer.isFake && (
                                            <AlertTriangle className="inline w-4 h-4 ml-1 text-red-500" />
                                        )}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 flex items-center">
                                        <User className='w-4 h-4 mr-2 text-indigo-400' />
                                        {timer.user}
                                    </td>
                                    <td className="px-6 py-4 text-sm text-gray-900 max-w-xs truncate">
                                        {timer.taskUrl ? (
                                            <a
                                                href={timer.taskUrl}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className={`font-medium ${
                                                    timer.isFake
                                                        ? 'text-red-600 hover:text-red-800'
                                                        : 'text-indigo-600 hover:text-indigo-800'
                                                }`}
                                            >
                                                {timer.taskName}
                                            </a>
                                        ) : (
                                            <span className={timer.isFake ? 'text-red-600' : ''}>
                                                {timer.taskName}
                                            </span>
                                        )}
                                    </td>
                                    <td className={`px-6 py-4 whitespace-nowrap text-sm ${timer.isFake ? 'text-red-700' : 'text-gray-700'}`}>
                                        {new Date(timer.startTime).toLocaleString()}
                                    </td>
                                    <td className={`px-6 py-4 whitespace-nowrap text-sm ${timer.isFake ? 'text-red-700' : 'text-gray-700'}`}>
                                        {timer.status === 'running' ? 'Running...' : new Date(timer.endTime).toLocaleString()}
                                    </td>
                                    <td className={`px-6 py-4 whitespace-nowrap text-sm font-semibold ${
                                        timer.isFake ? 'text-red-600' : 'text-gray-900'
                                    }`}>
                                        {formatDuration(timer.duration)}
                                        {timer.isFake && (
                                            <span className="ml-2 text-xs text-red-500 font-normal">(Manual Entry)</span>
                                        )}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-xs">
                                        {timer.isFake ? (
                                            <span className="text-red-600 font-semibold bg-red-100 px-2 py-1 rounded-full">
                                                MANUAL ENTRY
                                            </span>
                                        ) : (
                                            <span className="text-gray-500">{timer.source}</span>
                                        )}
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}