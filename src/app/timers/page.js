"use client";
import Link from "next/link";
import React, { useEffect, useState } from "react";

export default function ListTimers() {
  const [spaces, setSpaces] = useState([]);
  const [folders, setFolders] = useState([]);
  const [lists, setLists] = useState([]);
  const [timers, setTimers] = useState([]);
  const [filteredTimers, setFilteredTimers] = useState([]);
  const [loading, setLoading] = useState(false);

  const [selectedSpace, setSelectedSpace] = useState("");
  const [selectedFolder, setSelectedFolder] = useState("");
  const [selectedList, setSelectedList] = useState("");

  // Search and filter states
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedAssignee, setSelectedAssignee] = useState("");
  const [selectedDateFilter, setSelectedDateFilter] = useState("");
  const [assigneeList, setAssigneeList] = useState([]);
  const [isAssigneeDropdownOpen, setIsAssigneeDropdownOpen] = useState(false);
  const [isDateDropdownOpen, setIsDateDropdownOpen] = useState(false);

  // Date filter options
  const dateFilterOptions = [
    { value: "", label: "All Dates" },
    { value: "today", label: "Today" },
    { value: "yesterday", label: "Yesterday" },
    { value: "last3days", label: "Last 3 Days" },
    { value: "thisWeek", label: "This Week" },
    { value: "lastWeek", label: "Last Week" }
  ];

  // Fetch spaces
  useEffect(() => {
    async function fetchSpaces() {
      const res = await fetch("/api/spaces");
      const json = await res.json();
      setSpaces(json.data || []);
      if (json.data && json.data.length > 0) setSelectedSpace(json.data[0].id);
    }
    fetchSpaces();
  }, []);

  // Fetch folders or lists when space changes
  useEffect(() => {
    if (!selectedSpace) return;

    async function fetchFoldersOrLists() {
      const foldersRes = await fetch(`/api/folders?spaceId=${selectedSpace}`);
      const foldersJson = await foldersRes.json();
      setFolders(foldersJson.data || []);
      setLists([]);
      setTimers([]);
      setFilteredTimers([]);
      setSelectedFolder("");
      setSelectedList("");

      if (foldersJson.data && foldersJson.data.length > 0) {
        setSelectedFolder(foldersJson.data[0].id);
      } else {
        const listsRes = await fetch(`/api/lists?spaceId=${selectedSpace}`);
        const listsJson = await listsRes.json();
        setLists(listsJson.data || []);
        if (listsJson.data && listsJson.data.length > 0) setSelectedList(listsJson.data[0].id);
      }
    }

    fetchFoldersOrLists();
  }, [selectedSpace]);

  // Fetch lists when folder changes
  useEffect(() => {
    if (!selectedFolder) return;

    async function fetchLists() {
      const res = await fetch(`/api/lists?folderId=${selectedFolder}`);
      const json = await res.json();
      setLists(json.data || []);
      setTimers([]);
      setFilteredTimers([]);
      if (json.data && json.data.length > 0) setSelectedList(json.data[0].id);
    }

    fetchLists();
  }, [selectedFolder]);

  // Fetch timers when list changes
  useEffect(() => {
    if (!selectedList) return;

    async function fetchTimers() {
      setLoading(true);
      const res = await fetch(`/api/tasks?listId=${selectedList}`);
      const json = await res.json();
      console.log(json, "timers");
      setTimers(json.data || []);
      setFilteredTimers(json.data || []);
      setLoading(false);
    }

    fetchTimers();
  }, [selectedList]);

  // Extract unique assignees when timers change
  useEffect(() => {
    const allAssignees = new Set();
    timers.forEach(timer => {
      if (timer.assignees && timer.assignees.length > 0) {
        timer.assignees.forEach(assignee => allAssignees.add(assignee));
      }
    });
    setAssigneeList(Array.from(allAssignees).sort());
  }, [timers]);

  // Filter timers based on search term, selected assignee, and date filter
  useEffect(() => {
    let filtered = timers;

    // Search filter
    if (searchTerm) {
      filtered = filtered.filter(timer =>
        timer.taskName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        timer.description?.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    // Assignee filter
    if (selectedAssignee) {
      filtered = filtered.filter(timer =>
        timer.assignees?.includes(selectedAssignee)
      );
    }

    // Date filter
    if (selectedDateFilter) {
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

      filtered = filtered.filter(timer => {
        if (!timer.start_date) return false;

        const timerDate = new Date(Number(timer.start_date));
        const timerDay = new Date(timerDate.getFullYear(), timerDate.getMonth(), timerDate.getDate());

        switch (selectedDateFilter) {
          case "today":
            return timerDay.getTime() === today.getTime();

          case "yesterday":
            const yesterday = new Date(today);
            yesterday.setDate(yesterday.getDate() - 1);
            return timerDay.getTime() === yesterday.getTime();

          case "last3days":
            const threeDaysAgo = new Date(today);
            threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
            return timerDay >= threeDaysAgo && timerDay <= today;

          case "thisWeek":
            const startOfWeek = new Date(today);
            startOfWeek.setDate(today.getDate() - today.getDay());
            return timerDay >= startOfWeek && timerDay <= today;

          case "lastWeek":
            const startOfLastWeek = new Date(today);
            startOfLastWeek.setDate(today.getDate() - today.getDay() - 7);
            const endOfLastWeek = new Date(startOfLastWeek);
            endOfLastWeek.setDate(startOfLastWeek.getDate() + 6);
            return timerDay >= startOfLastWeek && timerDay <= endOfLastWeek;

          default:
            return true;
        }
      });
    }

    setFilteredTimers(filtered);
  }, [searchTerm, selectedAssignee, selectedDateFilter, timers]);

  // Convert seconds to H:M:S
  function formatTime(seconds) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h}h ${m}m ${s}s`;
  }

  const clearFilters = () => {
    setSearchTerm("");
    setSelectedAssignee("");
    setSelectedDateFilter("");
  };

  const getDateFilterLabel = (value) => {
    const option = dateFilterOptions.find(opt => opt.value === value);
    return option ? option.label : "All Dates";
  };

  return (
    <div className="max-w-6xl mx-auto p-6">
      {/* Header */}
   <div className="mb-8 flex items-center justify-between">
  <div>
    <h1 className="text-3xl font-bold text-gray-900 mb-2">Timer Dashboard</h1>
    <p className="text-gray-600">Track and manage your task timers across spaces and lists</p>
  </div>
  <Link href="./book-mark" className="">
    <button className="bg-black cursor-pointer text-white px-6 py-3 rounded-lg hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 transition-all font-medium">
      Book Mark for Loom Videos
    </button>
  </Link>
</div>

      {/* Navigation Section */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-8">
        <h2 className="text-lg font-semibold text-gray-800 mb-4">Workspace Navigation</h2>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Space</label>
            <select
              className="w-full border border-gray-300 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
              value={selectedSpace}
              onChange={e => setSelectedSpace(e.target.value)}
            >
              {spaces.map(space => (
                <option key={space.id} value={space.id}>
                  {space.name}
                </option>
              ))}
            </select>
          </div>

          {folders.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Folder</label>
              <select
                className="w-full border border-gray-300 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                value={selectedFolder}
                onChange={e => setSelectedFolder(e.target.value)}
              >
                {folders.map(folder => (
                  <option key={folder.id} value={folder.id}>
                    {folder.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">List</label>
            <select
              className="w-full border border-gray-300 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
              value={selectedList}
              onChange={e => setSelectedList(e.target.value)}
            >
              {lists.map(list => (
                <option key={list.id} value={list.id}>
                  {list.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Search and Filter Section */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-8">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 items-end">
          {/* Search Input */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Search Timers</label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <svg className="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
              <input
                type="text"
                placeholder="Search by task name or description..."
                className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
              />
            </div>
          </div>

          {/* Assignee Filter */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Filter by Assignee</label>
            <div className="relative">
              <button
                className="w-full flex items-center justify-between px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all bg-white"
                onClick={() => setIsAssigneeDropdownOpen(!isAssigneeDropdownOpen)}
              >
                <span className={selectedAssignee ? "text-gray-900" : "text-gray-500"}>
                  {selectedAssignee || "All Assignees"}
                </span>
                <svg className="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {isAssigneeDropdownOpen && (
                <div className="absolute z-20 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-auto">
                  <button
                    className="w-full text-left px-4 py-2 hover:bg-gray-50 text-gray-700 border-b border-gray-100"
                    onClick={() => {
                      setSelectedAssignee("");
                      setIsAssigneeDropdownOpen(false);
                    }}
                  >
                    All Assignees
                  </button>
                  {assigneeList.map(assignee => (
                    <button
                      key={assignee}
                      className="w-full text-left px-4 py-2 hover:bg-gray-50 text-gray-700"
                      onClick={() => {
                        setSelectedAssignee(assignee);
                        setIsAssigneeDropdownOpen(false);
                      }}
                    >
                      {assignee}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Date Filter */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Filter by Date</label>
            <div className="relative">
              <button
                className="w-full flex items-center justify-between px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all bg-white"
                onClick={() => setIsDateDropdownOpen(!isDateDropdownOpen)}
              >
                <span className={selectedDateFilter ? "text-gray-900" : "text-gray-500"}>
                  {getDateFilterLabel(selectedDateFilter)}
                </span>
                <svg className="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {isDateDropdownOpen && (
                <div className="absolute z-20 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-auto">
                  {dateFilterOptions.map(option => (
                    <button
                      key={option.value}
                      className="w-full text-left px-4 py-2 hover:bg-gray-50 text-gray-700 border-b border-gray-100 last:border-b-0"
                      onClick={() => {
                        setSelectedDateFilter(option.value);
                        setIsDateDropdownOpen(false);
                      }}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Clear Filters Button */}
          <div>
            <button
              onClick={clearFilters}
              className="w-full px-6 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500 transition-all font-medium"
            >
              Clear Filters
            </button>
          </div>
        </div>

        {/* Filter Summary */}
        {(searchTerm || selectedAssignee || selectedDateFilter) && (
          <div className="mt-4 flex flex-wrap gap-2">
            {searchTerm && (
              <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                Search: "{searchTerm}"
                <button
                  onClick={() => setSearchTerm("")}
                  className="ml-1 hover:text-blue-600 focus:outline-none"
                >
                  ×
                </button>
              </span>
            )}
            {selectedAssignee && (
              <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                Assignee: {selectedAssignee}
                <button
                  onClick={() => setSelectedAssignee("")}
                  className="ml-1 hover:text-green-600 focus:outline-none"
                >
                  ×
                </button>
              </span>
            )}
            {selectedDateFilter && (
              <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
                Date: {getDateFilterLabel(selectedDateFilter)}
                <button
                  onClick={() => setSelectedDateFilter("")}
                  className="ml-1 hover:text-purple-600 focus:outline-none"
                >
                  ×
                </button>
              </span>
            )}
          </div>
        )}
      </div>

      {/* Timers Section */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-semibold text-gray-800">Task Timers</h2>
            <p className="text-sm text-gray-600 mt-1">
              Showing {filteredTimers.length} of {timers.length} timers
            </p>
          </div>
          {loading && (
            <div className="flex items-center text-sm text-gray-500 mt-2 sm:mt-0">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-500 mr-2"></div>
              Loading timers...
            </div>
          )}
        </div>

        {filteredTimers.length === 0 ? (
          <div className="text-center py-12">
            <div className="text-gray-400 mb-4">
              <svg className="w-16 h-16 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">No timers found</h3>
            <p className="text-gray-600 max-w-sm mx-auto">
              {timers.length === 0
                ? "No timers available for the selected list."
                : "No timers match your current filters. Try adjusting your search or filters."}
            </p>
          </div>
        ) : (
          <div className="grid gap-4">
            {filteredTimers.map(timer => (
              <div key={timer.taskId + timer.startTime} className="border border-gray-200 rounded-xl p-6 hover:shadow-md transition-all duration-200 bg-white group">
                <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
                  <div className={timer.source === "clickup" ? "bg-red-500" : "flex-1"}
>
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between mb-3">
                      <h3 className="font-semibold text-gray-900 text-lg mb-2 sm:mb-0 group-hover:text-blue-600 transition-colors">
                        <a
                          href={timer.taskUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="hover:underline"
                        >
                          {timer.taskName}
                        </a>
                      </h3>
                      <div className="flex items-center gap-3">
                        <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                          timer.status === 'running'
                            ? 'bg-yellow-100 text-yellow-800 border border-yellow-200'
                            : 'bg-green-100 text-green-800 border border-green-200'
                        }`}>
                          {timer.status.charAt(0).toUpperCase() + timer.status.slice(1)}
                        </span>
                        <span className="font-semibold text-green-600 text-lg">
                          {formatTime(Math.floor(timer.duration / 1000))}
                        </span>
                      </div>
                    </div>

                    {timer.description && (
                      <p className="text-gray-700 mb-4 leading-relaxed">{timer.description}</p>
                    )}

                    <div className="flex flex-wrap gap-6 text-sm text-gray-600">
                      <div className="flex items-center gap-2">
                        <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                        </svg>
                        <span>By: {timer.user}</span>
                      </div>


                      {timer.assignees && timer.assignees.length > 0 && (
                        <div className="flex items-center gap-2">
                          <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                          </svg>
                          <span>Assigned to: {timer.assignees.join(", ")}</span>
                        </div>
                      )}
                    </div>
<div className="flex flex-wrap gap-6 text-sm text-gray-600">
                      <div className="flex items-center gap-2">
                        <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                        </svg>
                        <span>source :{timer.source}</span>
                      </div>


                      {timer.assignees && timer.assignees.length > 0 && (
                        <div className="flex items-center gap-2">
                          <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                          </svg>
                          <span>Assigned to: {timer.assignees.join(", ")}</span>
                        </div>
                      )}
                    </div>
                    {(timer.start_date || timer.due_date) && (
                      <div className="flex flex-wrap gap-4 mt-4 text-xs text-gray-500">
                        {timer.start_date && (
                          <div className="flex items-center gap-1">
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                            Start: {new Date(Number(timer.start_date)).toLocaleString()}
                          </div>
                        )}
                        {timer.due_date && (
                          <div className="flex items-center gap-1">
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            Due: {new Date(Number(timer.due_date)).toLocaleString()}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}