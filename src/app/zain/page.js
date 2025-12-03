'use client';

import { useState, useEffect } from 'react';
import {
  Users, Clock, CheckCircle, AlertTriangle,
  TrendingUp, TrendingDown, Minus, Calendar,
  BarChart3, Activity
} from 'lucide-react';

export default function TeamWorkload() {
  const [workloadData, setWorkloadData] = useState([]);
  const [teamStats, setTeamStats] = useState(null);
  const [weekRange, setWeekRange] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedWeek, setSelectedWeek] = useState(0);

  useEffect(() => {
    fetchWorkloadData();
  }, [selectedWeek]);

  const fetchWorkloadData = async () => {
    setLoading(true);
    setError(null);

    try {
      const token = localStorage.getItem('clickup_access_token');
      if (!token) {
        throw new Error('ClickUp token not found');
      }

      const response = await fetch(`/api/workload?weeks=${selectedWeek}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) {
        throw new Error('Failed to fetch workload data');
      }

      const result = await response.json();
      setWorkloadData(result.data);
      setTeamStats(result.teamStats);
      setWeekRange(result.weekRange);
    } catch (err) {
      setError(err.message);
      console.error('Error fetching workload:', err);
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'overloaded': return 'text-red-600 bg-red-50 border-red-200';
      case 'underutilized': return 'text-yellow-600 bg-yellow-50 border-yellow-200';
      case 'optimal': return 'text-green-600 bg-green-50 border-green-200';
      default: return 'text-gray-600 bg-gray-50 border-gray-200';
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'overloaded': return <TrendingUp className="w-4 h-4" />;
      case 'underutilized': return <TrendingDown className="w-4 h-4" />;
      case 'optimal': return <Minus className="w-4 h-4" />;
      default: return null;
    }
  };

  const getUtilizationBarColor = (percent) => {
    if (percent >= 100) return 'bg-red-500';
    if (percent >= 70) return 'bg-green-500';
    if (percent >= 50) return 'bg-yellow-500';
    return 'bg-orange-500';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading workload data...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="bg-red-50 border border-red-200 rounded-lg p-6 max-w-md">
          <AlertTriangle className="w-12 h-12 text-red-600 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-red-900 mb-2">Error Loading Data</h3>
          <p className="text-red-700">{error}</p>
          <button
            onClick={fetchWorkloadData}
            className="mt-4 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
                <Activity className="w-8 h-8 text-blue-600" />
                Team Workload Dashboard
              </h1>
              <p className="text-gray-600 mt-2">Weekly capacity: 54 hours per member</p>
            </div>

            {/* Week Selector */}
            <div className="flex items-center gap-2">
              <Calendar className="w-5 h-5 text-gray-600" />
              <select
                value={selectedWeek}
                onChange={(e) => setSelectedWeek(parseInt(e.target.value))}
                className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value={0}>Current Week</option>
                <option value={1}>Last Week</option>
                <option value={2}>2 Weeks Ago</option>
                <option value={3}>3 Weeks Ago</option>
                <option value={4}>4 Weeks Ago</option>
              </select>
            </div>
          </div>

          {weekRange && (
            <div className="text-sm text-gray-600">
              Week {weekRange.weekNumber}, {weekRange.year} • {new Date(weekRange.start).toLocaleDateString()} - {new Date(weekRange.end).toLocaleDateString()}
            </div>
          )}
        </div>

        {/* Team Statistics */}
        {teamStats && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-200">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600 mb-1">Total Members</p>
                  <p className="text-3xl font-bold text-gray-900">{teamStats.totalMembers}</p>
                </div>
                <Users className="w-12 h-12 text-blue-600 opacity-20" />
              </div>
            </div>

            <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-200">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600 mb-1">Total Tasks</p>
                  <p className="text-3xl font-bold text-gray-900">{teamStats.totalTasks}</p>
                  <p className="text-xs text-green-600 mt-1">{teamStats.totalCompletedTasks} completed</p>
                </div>
                <CheckCircle className="w-12 h-12 text-green-600 opacity-20" />
              </div>
            </div>

            <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-200">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600 mb-1">Total Hours</p>
                  <p className="text-3xl font-bold text-gray-900">{teamStats.totalTrackedHours}</p>
                  <p className="text-xs text-gray-600 mt-1">of {teamStats.totalTargetHours} target</p>
                </div>
                <Clock className="w-12 h-12 text-purple-600 opacity-20" />
              </div>
            </div>

            <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-200">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600 mb-1">Avg Utilization</p>
                  <p className="text-3xl font-bold text-gray-900">{teamStats.averageUtilization}%</p>
                  <div className="flex gap-2 mt-2 text-xs">
                    <span className="text-red-600">{teamStats.overloadedMembers} overloaded</span>
                    <span className="text-yellow-600">{teamStats.underUtilizedMembers} under</span>
                  </div>
                </div>
                <BarChart3 className="w-12 h-12 text-orange-600 opacity-20" />
              </div>
            </div>
          </div>
        )}

        {/* Member Workload Cards */}
        <div className="space-y-4">
          {workloadData.map((member) => (
            <div
              key={member.userId}
              className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-4">
                  {member.profilePicture ? (
                    <img
                      src={member.profilePicture}
                      alt={member.username}
                      className="w-12 h-12 rounded-full"
                    />
                  ) : (
                    <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center">
                      <span className="text-blue-600 font-semibold text-lg">
                        {member.username.charAt(0).toUpperCase()}
                      </span>
                    </div>
                  )}
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">{member.username}</h3>
                    <p className="text-sm text-gray-600">{member.email}</p>
                  </div>
                </div>

                <div className={`px-3 py-1 rounded-full border flex items-center gap-2 ${getStatusColor(member.metrics.status)}`}>
                  {getStatusIcon(member.metrics.status)}
                  <span className="text-sm font-medium capitalize">{member.metrics.status}</span>
                </div>
              </div>

              {/* Metrics Grid */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                <div>
                  <p className="text-xs text-gray-600 mb-1">Tasks</p>
                  <p className="text-2xl font-bold text-gray-900">{member.metrics.totalTasks}</p>
                  <p className="text-xs text-green-600">{member.metrics.completedTasks} done</p>
                </div>

                <div>
                  <p className="text-xs text-gray-600 mb-1">Completion Rate</p>
                  <p className="text-2xl font-bold text-gray-900">{member.metrics.completionRate}%</p>
                  <p className="text-xs text-gray-600">{member.metrics.pendingTasks} pending</p>
                </div>

                <div>
                  <p className="text-xs text-gray-600 mb-1">Tracked Hours</p>
                  <p className="text-2xl font-bold text-gray-900">{member.metrics.trackedHours}</p>
                  <p className="text-xs text-gray-600">of {member.metrics.targetHours}h</p>
                </div>

                <div>
                  <p className="text-xs text-gray-600 mb-1">Utilization</p>
                  <p className="text-2xl font-bold text-gray-900">{member.metrics.utilizationPercent}%</p>
                  <p className={`text-xs ${parseFloat(member.metrics.remainingHours) < 0 ? 'text-red-600' : 'text-gray-600'}`}>
                    {parseFloat(member.metrics.remainingHours) < 0 ? '+' : ''}{Math.abs(parseFloat(member.metrics.remainingHours))}h {parseFloat(member.metrics.remainingHours) < 0 ? 'over' : 'left'}
                  </p>
                </div>
              </div>

              {/* Utilization Bar */}
              <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
                <div
                  className={`h-full transition-all duration-500 ${getUtilizationBarColor(parseFloat(member.metrics.utilizationPercent))}`}
                  style={{ width: `${Math.min(parseFloat(member.metrics.utilizationPercent), 100)}%` }}
                />
              </div>
            </div>
          ))}
        </div>

        {workloadData.length === 0 && (
          <div className="text-center py-12">
            <Users className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-600">No workload data available for this week</p>
          </div>
        )}
      </div>
    </div>
  );
}