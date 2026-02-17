'use client';
import { useState, useEffect } from 'react';

const COL_W = 140;
const TASK_H = 48; // Task bar ki height thodi barhai hai
const GAP = 10;    // Tasks ke darmiyan gap

export default function WorkloadGrid({ data, filters }) {
  const { dates, members, tasks, memberStats } = data;
  const [selectedTask, setSelectedTask] = useState(null);

  // CSV Download Logic
  const downloadCSV = () => {
    let csvRows = ["Task Name,Assignee,Date,Estimated Hours,Spent Hours,Status"];
    tasks.forEach(t => {
      const date = t.due_date ? new Date(parseInt(t.due_date)).toISOString().split('T')[0] : 'N/A';
      const assigneeNames = t.assignees?.map(a => a.username).join('; ') || 'None';
      csvRows.push(`"${t.name}","${assigneeNames}",${date},${t.formattedHours},${t.formattedSpent},"${t.status.status}"`);
    });

    const blob = new Blob([csvRows.join("\n")], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Workload_Report_${new Date().getFullYear()}.csv`;
    a.click();
  };

  useEffect(() => {
    const today = new Date().toISOString().split('T')[0];
    document.getElementById(`day-${today}`)?.scrollIntoView({ behavior: 'smooth', inline: 'center' });
  }, [data]);

  const filteredMembers = members.filter(m =>
    filters.memberId === 'all' || m.user.id.toString() === filters.memberId
  );

  // STACKING LOGIC: Tasks ko levels mein divide karna taake overlap na hon
  const getLeveledTasks = (mId) => {
    const mTasks = tasks.filter(t => t.assignees?.some(a => a.id === mId))
                        .sort((a,b) => (a.start_date || a.due_date) - (b.start_date || b.due_date));
    const levels = [];
    return mTasks.map(t => {
      const start = t.start_date ? parseInt(t.start_date) : parseInt(t.due_date);
      let lvl = 0;
      // Jab tak level occupied hai, niche wale level pe jao
      while (levels[lvl] && levels[lvl] > start) lvl++;
      levels[lvl] = parseInt(t.due_date);
      return { ...t, lvl };
    });
  };

  return (
    <div className="relative inline-block min-w-full bg-[#f8fafc]">
      {/* HEADER */}
     <div className="w-64 sticky left-0 z-50 bg-white border-r p-5 flex flex-col gap-2">
  <span className="font-black text-[10px] text-slate-400 uppercase tracking-widest">Resources</span>
  <button
    onClick={downloadCSV}
    className="text-[10px] font-bold bg-emerald-500 text-white px-3 py-2 rounded-lg hover:bg-black transition-all shadow-sm active:scale-95"
  >
    DOWNLOAD CSV
  </button>
</div>

      {/* BODY (Rows) */}
      {filteredMembers.map(m => {
        const leveledTasks = getLeveledTasks(m.user.id);

        // DYNAMIC ROW HEIGHT: Jitne levels honge, row utni hi bari hogi
        const maxLvl = leveledTasks.length > 0 ? Math.max(...leveledTasks.map(t => t.lvl)) : 0;
        const rowH = (maxLvl + 1) * (TASK_H + GAP) + 100; // 100px extra for padding/labels

        return (
          <div key={m.user.id} style={{ minHeight: rowH }} className="flex border-b group transition-all relative">
            {/* Member Info Side Panel */}
            <div className="w-64 sticky left-0 z-30 bg-white border-r p-4 flex items-center gap-4 shadow-sm h-auto">
              <img src={m.user.profilePicture} className="w-10 h-10 rounded-full border-2 border-slate-100" />
              <div className="truncate text-sm font-bold text-slate-700 uppercase tracking-tight">{m.user.username}</div>
            </div>

            {/* Grid Days Area */}
            <div className="relative flex-1 flex">
              {dates.map(d => (
                <div key={d} style={{ width: COL_W }} className="border-r h-full relative bg-white/50">
                  {memberStats[m.user.id]?.dailyLoad[d] > 0 && (
                    <div className="absolute top-2 left-2 text-[9px] font-black text-emerald-600 bg-emerald-50 px-1.5 rounded border border-emerald-100 z-10">
                      {memberStats[m.user.id].dailyLoad[d].toFixed(1)}h
                    </div>
                  )}
                </div>
              ))}

              {/* TASK BARS OVERLAY */}
              <div className="absolute top-16 left-0 w-full h-full pointer-events-none">
                {leveledTasks.map(t => {
                  const pos = calculateTaskPosition(t, dates[0]);
                  return (
                    <div
                      key={t.id}
                      onClick={() => setSelectedTask(t)}
                      style={{
                        left: pos.left,
                        width: pos.width,
                        top: t.lvl * (TASK_H + GAP),
                        backgroundColor: t.status?.color || '#2ea597'
                      }}
                      // HOVER EFFECT: hover:z-50 aur hover:scale-105 se task top pe ajayega
                      className="absolute h-[48px] text-white rounded-lg shadow-md font-bold cursor-pointer
                                 pointer-events-auto transition-all duration-200
                                 hover:z-50 hover:scale-[1.02] hover:shadow-xl
                                 flex flex-col justify-center px-2 border border-white/20"
                    >
                      <div className="text-[10px] truncate leading-tight mb-1">
                        {t.name}
                      </div>

                      <div className="flex justify-between items-center text-[9px] bg-black/20 rounded px-1 py-0.5">
                        <div className="flex items-center gap-1">
                          <span className="opacity-70">Est:</span>
                          <span>{t.formattedHours}</span>
                        </div>
                        <div className="flex items-center gap-1 border-l border-white/20 pl-1">
                          <span className="opacity-70">Spt:</span>
                          <span className={parseFloat(t.formattedSpent) > parseFloat(t.formattedHours) ? "text-orange-300" : ""}>
                            {t.formattedSpent}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        );
      })}

      {/* DETAIL SIDEBAR */}
      {selectedTask && (
        <div className="fixed inset-y-0 right-0 w-[400px] bg-white shadow-2xl z-[100] border-l p-8 flex flex-col animate-in slide-in-from-right">
            <div className="flex justify-between items-center mb-8">
                <h2 className="text-xl font-black text-slate-800 uppercase tracking-widest">Task Detail</h2>
                <button onClick={() => setSelectedTask(null)} className="text-2xl text-slate-300 hover:text-red-500">✕</button>
            </div>
            <div className="flex-1 overflow-auto space-y-6">
                <div>
                    <p className="text-[10px] font-black text-slate-400 uppercase mb-1">Title</p>
                    <p className="text-lg font-bold text-slate-700">{selectedTask.name}</p>
                </div>
                <div className="grid grid-cols-2 gap-4">
                    <div className="bg-emerald-50 p-4 rounded-2xl">
                        <p className="text-[10px] font-black text-emerald-600 uppercase">Estimate</p>
                        <p className="text-xl font-black text-emerald-700">{selectedTask.formattedHours}</p>
                    </div>
                    <div className="bg-blue-50 p-4 rounded-2xl">
                        <p className="text-[10px] font-black text-blue-600 uppercase">Spent</p>
                        <p className="text-xl font-black text-blue-700">{selectedTask.formattedSpent}</p>
                    </div>
                </div>
            </div>
            <button onClick={() => window.open(selectedTask.url, '_blank')} className="w-full py-4 bg-slate-900 text-white rounded-2xl font-black mt-4">OPEN IN CLICKUP</button>
        </div>
      )}
    </div>
  );
}
const downloadCSV = () => {
  try {
    // CSV Headers
    let csvRows = ["Task Name,Assignee,Date,Estimated Hours,Spent Hours,Status"];

    tasks.forEach(t => {
      // Date formatting
      const date = t.due_date ? new Date(parseInt(t.due_date)).toISOString().split('T')[0] : 'N/A';

      // Assignee names
      const assigneeNames = t.assignees?.map(a => a.username).join('; ') || 'None';

      // Clean numbers (taake toFixed error na de)
      const est = parseFloat(t.formattedHours) || 0;
      const spent = parseFloat(t.formattedSpent) || 0;
      const status = t.status?.status || 'No Status';

      // Push row (using quotes to handle commas in names)
      csvRows.push(`"${t.name.replace(/"/g, '""')}","${assigneeNames}",${date},${est},${spent},"${status}"`);
    });

    // Create Blob
    const csvContent = csvRows.join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);

    // Create Link and Trigger
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `Workload_Report_${new Date().getFullYear()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    console.log("CSV Downloaded Successfully");
  } catch (error) {
    console.error("Download failed:", error);
    alert("Download failed! Check console for details.");
  }
};
function calculateTaskPosition(task, viewStart) {
  const start = new Date(task.start_date ? parseInt(task.start_date) : parseInt(task.due_date));
  const end = new Date(parseInt(task.due_date));
  const vStart = new Date(viewStart);
  start.setHours(0,0,0,0); vStart.setHours(0,0,0,0);
  const diff = Math.floor((start - vStart) / 86400000);
  const dur = Math.max(1, Math.ceil((end - start) / 86400000) + 1);
  return { left: diff * COL_W + 10, width: (dur * COL_W) - 20 };
}