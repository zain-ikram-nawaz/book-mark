// components/workload/WorkloadFilters.jsx
'use client';

import { useState, useRef, useEffect } from 'react';

export default function WorkloadFilters({
  days,
  setDays,
  viewMode,
  setViewMode,
  members,
  selectedMembers,
  setSelectedMembers
}) {
  const [showMemberDropdown, setShowMemberDropdown] = useState(false);
  const dropdownRef = useRef(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setShowMemberDropdown(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  function toggleMember(memberId) {
    if (selectedMembers.includes(memberId)) {
      // Remove member
      setSelectedMembers(selectedMembers.filter(id => id !== memberId));
    } else {
      // Add member
      setSelectedMembers([...selectedMembers, memberId]);
    }
  }

  function selectAllMembers() {
    setSelectedMembers(members.map(m => m.user.id));
  }

  function deselectAllMembers() {
    setSelectedMembers([]);
  }

  return (
    <div className="flex items-center gap-4">
      {/* View Mode */}
      <select
        value={viewMode}
        onChange={(e) => setViewMode(e.target.value)}
        className="bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-purple-600"
      >
        <option value="time_estimates">Time Estimates</option>
        <option value="daily_scheduled">Daily Scheduled</option>
      </select>

      {/* Days Range */}
      <select
        value={days}
        onChange={(e) => setDays(parseInt(e.target.value))}
        className="bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-purple-600"
      >
        <option value={7}>7 days</option>
        <option value={14}>14 days</option>
        <option value={30}>30 days</option>
      </select>

      {/* Member Filter Dropdown */}
      <div className="relative" ref={dropdownRef}>
        <button
          onClick={() => setShowMemberDropdown(!showMemberDropdown)}
          className="bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm flex items-center gap-2 hover:bg-gray-700 transition-colors"
        >
          <span>Members ({selectedMembers.length}/{members.length})</span>
          <svg
            className={`w-4 h-4 transition-transform ${showMemberDropdown ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {/* Dropdown Menu */}
        {showMemberDropdown && (
          <div className="absolute right-0 mt-2 w-64 bg-gray-800 border border-gray-700 rounded-lg shadow-xl z-50 max-h-96 overflow-y-auto">
            {/* Select All / Deselect All */}
            <div className="p-2 border-b border-gray-700 flex gap-2">
              <button
                onClick={selectAllMembers}
                className="flex-1 px-2 py-1 text-xs bg-purple-600 hover:bg-purple-700 rounded transition-colors"
              >
                Select All
              </button>
              <button
                onClick={deselectAllMembers}
                className="flex-1 px-2 py-1 text-xs bg-gray-700 hover:bg-gray-600 rounded transition-colors"
              >
                Deselect All
              </button>
            </div>

            {/* Member List */}
            <div className="p-2">
              {members.map((member) => {
                const userId = member.user.id;
                const isSelected = selectedMembers.includes(userId);

                return (
                  <div
                    key={userId}
                    onClick={() => toggleMember(userId)}
                    className="flex items-center gap-3 p-2 hover:bg-gray-700 rounded cursor-pointer transition-colors"
                  >
                    {/* Checkbox */}
                    <div className={`w-4 h-4 rounded border-2 flex items-center justify-center ${
                      isSelected
                        ? 'bg-purple-600 border-purple-600'
                        : 'border-gray-600'
                    }`}>
                      {isSelected && (
                        <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </div>

                    {/* Profile Picture */}
                    {member.user.profilePicture ? (
                      <img
                        src={member.user.profilePicture}
                        alt={member.user.username}
                        className="w-6 h-6 rounded-full"
                      />
                    ) : (
                      <div
                        className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold"
                        style={{ backgroundColor: member.user.color || '#7c3aed' }}
                      >
                        {member.user.username}
                      </div>
                    )}

                    {/* Username */}
                    <span className="text-sm flex-1">{member.user.username}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Refresh */}
      <button
        onClick={() => window.location.reload()}
        className="bg-purple-600 hover:bg-purple-700 rounded px-4 py-2 text-sm font-medium transition-colors"
      >
        Refresh
      </button>
    </div>
  );
}