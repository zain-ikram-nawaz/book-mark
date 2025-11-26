'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { RefreshCw, LogOut, Clock, Layers, Folder, List, User, TrendingUp } from 'lucide-react';

// --- CONFIGURATION ---
// Environment variables must be set with NEXT_PUBLIC_ prefix for client-side access
const CLICKUP_CLIENT_ID = process.env.NEXT_PUBLIC_CLICKUP_CLIENT_ID;
const REDIRECT_URI = process.env.NEXT_PUBLIC_CLICKUP_REDIRECT_URI;
// Scopes needed for time tracking and task/space hierarchy
const OAUTH_SCOPES = 'time_tracking:read task:read space:read';
const ACCESS_TOKEN_KEY = 'clickup_access_token';

// Helper to format duration (ms to HH:MM:SS)
const formatDuration = (ms) => {
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    const pad = (num) => String(num).padStart(2, '0');
    return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
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
    const [apiStatus, setApiStatus] = useState({ loading: false, error: null });

    const [selectedSpaceId, setSelectedSpaceId] = useState('');
    const [selectedFolderId, setSelectedFolderId] = useState('');
    const [selectedListId, setSelectedListId] = useState('');

    // 1. Fetch Spaces
    useEffect(() => {
        if (!authorizedFetch) return;

        const fetchSpaces = async () => {
            setApiStatus({ loading: true, error: null });
            const { ok, data, error } = await authorizedFetch('/api/spaces');

            if (ok) {
                setSpaces(data.data);
                if (data.data.length > 0) setSelectedSpaceId(data.data[0].id);
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
        if (!selectedSpaceId || !authorizedFetch) return;

        const fetchFolders = async () => {
            setApiStatus({ loading: true, error: null });
            const { ok, data, error } = await authorizedFetch(`/api/folders?spaceId=${selectedSpaceId}`);

            if (ok) {
                setFolders(data.data);
                // If there are folders, select the first one. If not, proceed to lists using spaceId (ungrouped lists)
                if (data.data.length > 0) {
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
        if (!selectedFolderId || !authorizedFetch) return;

        const fetchLists = async () => {
            setApiStatus({ loading: true, error: null });
            const fetchId = selectedFolderId; // Either a Folder ID or a Space ID (for ungrouped lists)

            // Note: ClickUp uses 'folderId' parameter even for ungrouped lists inside a Space.
            const { ok, data, error } = await authorizedFetch(`/api/lists?folderId=${fetchId}`);

            if (ok) {
                setLists(data.data);
                if (data.data.length > 0) setSelectedListId(data.data[0].id);
            } else {
                setApiStatus({ loading: false, error: `Failed to load lists: ${error}` });
            }
            setApiStatus(prev => ({ ...prev, loading: false }));
        };
        fetchLists();
    }, [selectedFolderId, authorizedFetch]);

    // 4. Fetch Time Entries when List changes
    const fetchTimers = useCallback(async (listId) => {
        if (!listId || !authorizedFetch) {
            setTimers([]);
            return;
        }

        setApiStatus({ loading: true, error: null });
        const { ok, data, error } = await authorizedFetch(`/api/tasks?listId=${listId}`);

        if (ok) {
            setTimers(data.data);
        } else {
            setApiStatus({ loading: false, error: `Failed to load time entries: ${error}` });
        }
        setApiStatus(prev => ({ ...prev, loading: false }));
    }, [authorizedFetch]);

    // Auto-fetch timers when selected list changes
    useEffect(() => {
        fetchTimers(selectedListId);
    }, [selectedListId, fetchTimers]);


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

    const totalTimeTracked = timers.reduce((sum, timer) => sum + timer.duration, 0);

    return (
        <div className="min-h-screen bg-gray-100 p-4 md:p-8 font-sans">
            <script src="https://cdn.tailwindcss.com"></script>
            <style jsx global>{`
                @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap');
                body { font-family: 'Inter', sans-serif; }
                .fake-time-entry {
                    border-left: 4px solid #ef4444; /* Red border for fake time */
                    opacity: 0.8;
                }
            `}</style>

            <header className="flex justify-between items-center mb-8 pb-4 border-b border-gray-200">
                <h1 className="text-3xl font-bold text-gray-800 flex items-center">
                    <Clock className="w-7 h-7 mr-3 text-indigo-600" />
                    ClickUp Time Dashboard (OAuth)
                </h1>
                <button
                    onClick={logout}
                    className="flex items-center px-4 py-2 bg-gray-200 text-gray-700 rounded-lg shadow-md hover:bg-gray-300 transition duration-150 text-sm"
                >
                    <LogOut className="w-4 h-4 mr-2" />
                    Logout
                </button>
            </header>

            {/* Selection Dropdowns */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8 bg-white p-4 rounded-xl shadow-md">
                <div className='flex flex-col'>
                    <label className="text-sm font-medium text-gray-600 mb-1 flex items-center">
                        <Layers className="w-4 h-4 mr-1 text-indigo-500" /> Space
                    </label>
                    <select
                        value={selectedSpaceId}
                        onChange={(e) => setSelectedSpaceId(e.target.value)}
                        className="p-2 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
                    >
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
                        disabled={folders.length === 0}
                    >
                        {folders.map(f => (
                            <option key={f.id} value={f.id}>
                                {f.name}
                            </option>
                        ))}
                         {/* Option for ungrouped lists in the space itself */}
                        {selectedFolderId === selectedSpaceId && <option value={selectedSpaceId}>Ungrouped Lists</option>}
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
                        {lists.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                    </select>
                </div>
            </div>

            {/* Status and Summary */}
            <div className="mb-6 flex justify-between items-center">
                <div className="text-xl font-semibold text-gray-700 flex items-center">
                    <TrendingUp className="w-5 h-5 mr-2 text-green-500" />
                    Total Time Tracked:
                    <span className="ml-2 text-indigo-600">{formatDuration(totalTimeTracked)}</span>
                </div>

                {apiStatus.loading && (
                    <div className="flex items-center text-indigo-500">
                        <RefreshCw className="w-4 h-4 animate-spin mr-2" /> Fetching Data...
                    </div>
                )}
                {apiStatus.error && (
                    <div className="text-sm text-red-500 p-2 bg-red-100 rounded-md border border-red-300">{apiStatus.error}</div>
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
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Total Duration</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Source</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {timers.length === 0 && !apiStatus.loading ? (
                             <tr>
                                <td colSpan="5" className="px-6 py-4 text-center text-gray-500">
                                    {selectedListId ? "No time entries found for this list in the last 6 months." : "Please select a List to view time entries."}
                                </td>
                            </tr>
                        ) : (
                            timers.map(timer => (
                                <tr
                                    key={timer.taskId}
                                    className={timer.isFake ? 'fake-time-entry hover:bg-red-50 transition' : 'hover:bg-gray-50 transition'}
                                >
                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                                        <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                                            timer.status === 'running' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                                        }`}>
                                            {timer.status}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 flex items-center">
                                        <User className='w-4 h-4 mr-2 text-indigo-400' />
                                        {timer.user}
                                    </td>
                                    <td className="px-6 py-4 text-sm text-gray-900 max-w-xs truncate">
                                        <a
                                            href={timer.taskUrl}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="text-indigo-600 hover:text-indigo-800 font-medium"
                                        >
                                            {timer.taskName}
                                        </a>
                                    </td>
                                    <td className={`px-6 py-4 whitespace-nowrap text-sm font-semibold ${timer.isFake ? 'text-red-600' : 'text-gray-900'}`}>
                                        {formatDuration(timer.duration)}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-xs text-gray-500">
                                        {timer.isFake ? 'MANUAL (Fake)' : timer.source}
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