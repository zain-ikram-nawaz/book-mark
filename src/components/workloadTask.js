// components/workload/WorkloadTasks.jsx
'use client';

export default function WorkloadTasks({
  tasks,
  dates,
  members,
  selectedMembers
}) {

  function msToHours(ms) {
    const hours = ms / (1000 * 60 * 60);
    return hours.toFixed(0) + 'h';
  }

  function getTaskPosition(task) {
    const startDate = task.start_date
      ? new Date(parseInt(task.start_date))
      : new Date(parseInt(task.due_date));
    const endDate = new Date(parseInt(task.due_date));

    const firstDate = new Date(dates[0]);

    const totalDays = dates.length;
    const startDiff = Math.floor((startDate.getTime() - firstDate.getTime()) / (1000 * 60 * 60 * 24));
    const duration = Math.max(1, Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1);

    const left = (startDiff / totalDays) * 100;
    const width = (duration / totalDays) * 100;

    return {
      left: `${Math.max(0, left)}%`,
      width: `${Math.min(100 - left, width)}%`
    };
  }

  function openTaskInClickUp(taskId) {
    // ClickUp task URL format
    const clickupUrl = `https://app.clickup.com/t/${taskId}`;
    window.open(clickupUrl, '_blank');
  }

  // Filter selected members
  const filteredMembers = members.filter(m => selectedMembers.includes(m.user.id));

  // Group tasks by member
  function getTasksForMember(memberId) {
    return tasks.filter(task =>
      task.assignees.some(a => a.id === memberId)
    );
  }

  return (
    <div className="workload-tasks">
      {filteredMembers.map((member) => {
        const memberTasks = getTasksForMember(member.user.id);

        return (
          <div key={member.user.id} className="border-b border-gray-800">
            {/* Member Header */}
            <div className="flex items-center gap-3 px-4 py-2 bg-gray-900/50 sticky left-0">
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
              <span className="text-sm font-medium">{member.user.username}</span>
              <span className="text-xs text-gray-500">({memberTasks.length} tasks)</span>
            </div>

            {/* Tasks Timeline */}
            <div className="relative min-h-[60px] p-2">
              {memberTasks.length > 0 ? (
                <div className="space-y-2">
                  {memberTasks.map(task => {
                    const position = getTaskPosition(task);

                    return (
                      <div
                        key={task.id}
                        className="relative h-10"
                      >
                        <div
                          onClick={() => openTaskInClickUp(task.id)}
                          className="absolute h-9 rounded px-3 py-2 text-sm font-medium cursor-pointer hover:opacity-80 hover:shadow-lg transition-all flex items-center justify-between group"
                          style={{
                            left: position.left,
                            width: position.width,
                            backgroundColor: task.status?.color || '#7c3aed',
                            minWidth: '120px'
                          }}
                          title={`${task.name} - Click to open in ClickUp`}
                        >
                          <span className="truncate flex-1">{task.name}</span>
                          {task.time_estimate && (
                            <span className="ml-2 text-xs opacity-90 bg-black/20 px-2 py-0.5 rounded">
                              {msToHours(task.time_estimate)}
                            </span>
                          )}

                          {/* External link icon on hover */}
                          <svg
                            className="w-4 h-4 ml-2 opacity-0 group-hover:opacity-100 transition-opacity"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                          </svg>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center text-gray-600 py-4 text-sm">
                  No tasks assigned
                </div>
              )}
            </div>
          </div>
        );
      })}

      {filteredMembers.length === 0 && (
        <div className="text-center text-gray-500 py-12">
          No members selected
        </div>
      )}
    </div>
  );
}