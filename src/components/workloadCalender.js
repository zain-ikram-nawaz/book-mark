// components/workload/WorkloadCalendar.jsx
'use client';

export default function WorkloadCalendar({
  dates,
  workloadByDate,
  members,
  selectedMembers
}) {

  function msToHours(ms) {
    const hours = ms / (1000 * 60 * 60);
    return hours.toFixed(1) + 'h';
  }

  function getDateLabel(dateStr) {
    const date = new Date(dateStr);
    const days = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
    return `${days[date.getDay()]} ${date.getDate()}`;
  }

  function getMonthLabel(dateStr) {
    const date = new Date(dateStr);
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${months[date.getMonth()]} ${date.getFullYear()}`;
  }

  function getHoursForMemberAndDate(memberId, dateKey) {
    const dayWorkload = workloadByDate[dateKey] || {};
    return dayWorkload[memberId] || 0;
  }

  function getTotalHoursForMember(memberId) {
    let total = 0;
    dates.forEach(date => {
      total += getHoursForMemberAndDate(memberId, date);
    });
    return total;
  }

  function getWorkloadColor(hours) {
    const hoursNum = hours / (1000 * 60 * 60);
    if (hoursNum === 0) return 'bg-transparent';
    if (hoursNum <= 2) return 'bg-green-900/40';
    if (hoursNum <= 4) return 'bg-green-700/50';
    if (hoursNum <= 6) return 'bg-yellow-700/50';
    if (hoursNum <= 8) return 'bg-orange-700/50';
    return 'bg-red-700/50';
  }

  // Group dates by month
  const datesByMonth = {};
  dates.forEach(date => {
    const month = getMonthLabel(date);
    if (!datesByMonth[month]) {
      datesByMonth[month] = [];
    }
    datesByMonth[month].push(date);
  });

  // Filter selected members
  const filteredMembers = members.filter(m => selectedMembers.includes(m.user.id));

  return (
    <div className="workload-calendar border-b border-gray-800">
      {/* Month Headers */}
      <div className="flex">
        <div className="w-48 border-r border-gray-800"></div>
        {Object.entries(datesByMonth).map(([month, monthDates]) => (
          <div
            key={month}
            className="border-r border-gray-800 px-4 py-2 text-sm font-semibold text-center"
            style={{ width: `${(monthDates.length / dates.length) * 100}%` }}
          >
            {month}
          </div>
        ))}
        <div className="w-24 border-r border-gray-800 px-4 py-2 text-sm font-semibold text-center">
          Total
        </div>
      </div>

      {/* Date Headers */}
      <div className="flex border-b border-gray-800">
        <div className="w-48 border-r border-gray-800 px-4 py-2 text-sm font-semibold">
          Member
        </div>
        {dates.map((date) => {
          const isToday = date === new Date().toISOString().split('T')[0];
          const isWeekend = new Date(date).getDay() === 0 || new Date(date).getDay() === 6;

          return (
            <div
              key={date}
              className={`flex-1 text-center py-3 border-r border-gray-800 text-sm ${
                isToday ? 'bg-purple-900/30 font-bold' : ''
              } ${isWeekend ? 'bg-gray-900/50' : ''}`}
            >
              {getDateLabel(date)}
            </div>
          );
        })}
        <div className="w-24 border-r border-gray-800"></div>
      </div>

      {/* Member Rows */}
      {filteredMembers.map((member) => {
        const totalHours = getTotalHoursForMember(member.user.id);

        return (
          <div key={member.user.id} className="flex border-b border-gray-800 hover:bg-gray-900/30">
            {/* Member Info */}
            <div className="w-48 border-r border-gray-800 px-4 py-3 flex items-center gap-3">
              {member.user.profilePicture ? (
                <img
                  src={member.user.profilePicture}
                  alt={member.user.username}
                  className="w-8 h-8 rounded-full"
                />
              ) : (
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold"
                  style={{ backgroundColor: member.user.color || '#7c3aed' }}
                >
                  {member.user.username}
                </div>
              )}
              <span className="text-sm font-medium truncate">{member.user.username}</span>
            </div>

            {/* Daily Hours */}
            {dates.map(date => {
              const hours = getHoursForMemberAndDate(member.user.id, date);
              const isWeekend = new Date(date).getDay() === 0 || new Date(date).getDay() === 6;

              return (
                <div
                  key={date}
                  className={`flex-1 text-center py-3 border-r border-gray-800 ${
                    getWorkloadColor(hours)
                  } ${isWeekend ? 'bg-striped' : ''}`}
                >
                  <div className="text-sm font-semibold">
                    {hours > 0 ? msToHours(hours) : ''}
                  </div>
                </div>
              );
            })}

            {/* Total Hours */}
            <div className="w-24 border-r border-gray-800 px-4 py-3 text-center">
              <div className="text-sm font-bold text-purple-400">
                {totalHours > 0 ? msToHours(totalHours) : '0h'}
              </div>
            </div>
          </div>
        );
      })}

      {/* No Members Selected */}
      {filteredMembers.length === 0 && (
        <div className="text-center text-gray-500 py-12">
          No members selected. Please select members from the filter.
        </div>
      )}
    </div>
  );
}