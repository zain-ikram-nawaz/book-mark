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
      <div className="flex-1 overflow-auto bg-[#f1f5f9]">
         {/* Filters prop mein selectedUser bhej rahe hain */}
         {data && <WorkloadGrid data={data} filters={{ memberId: selectedUser }} />}
      </div>
  );
}