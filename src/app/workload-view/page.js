'use client';
import { useState, useEffect, useCallback } from 'react';
import WorkloadGrid from '@/components/WorkloadGrid';

export default function WorkloadPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedUser, setSelectedUser] = useState('all');

  const fetchWorkload = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/new-workload?days=30`);
      const d = await res.json();
      setData(d);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchWorkload(); }, [fetchWorkload]);

  if (loading) return <div className="p-10 font-bold text-slate-500 animate-pulse">Fetching 30-Day Workload...</div>;

  return (
    <div className="flex flex-col h-screen bg-[#f8fafc]">
      <div className="h-14 border-b flex items-center justify-between px-6 bg-white sticky top-0 z-50">
        <h1 className="font-bold text-slate-700">Next 30 Days Timeline</h1>

        <div className="flex gap-4 items-center">
          {/* USER FILTER */}
          <label className="text-xs font-bold text-slate-400">Filter By:</label>
          <select
            className="text-xs border rounded-md p-1.5 bg-white font-medium outline-none border-slate-200"
            value={selectedUser}
            onChange={(e) => setSelectedUser(e.target.value)}
          >
            <option value="all">All Members</option>
            {data?.members?.map(m => (
              <option key={m.user.id} value={m.user.id}>{m.user.username}</option>
            ))}
          </select>

          <button onClick={fetchWorkload} className="p-2 hover:bg-slate-100 rounded-full text-slate-500">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto bg-[#f1f5f9]">
         {/* Filters prop mein selectedUser bhej rahe hain */}
         {data && <WorkloadGrid data={data} filters={{ memberId: selectedUser }} />}
      </div>
    </div>
  );
}