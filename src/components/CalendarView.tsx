import React from 'react';
import { Roster, User, ScheduledShift } from '../../types';
import { SHIFT_TEMPLATES } from '../../constants';
import { Card } from './Card';
import { Badge } from './Badge';

interface CalendarViewProps {
  roster: Roster | null;
  doctors: User[];
  currentUserId: string;
  onShiftClick?: (shift: ScheduledShift) => void;
}

export const CalendarView: React.FC<CalendarViewProps> = ({ 
  roster, 
  doctors, 
  currentUserId,
  onShiftClick 
}) => {
  if (!roster) {
    return (
      <div className="py-20 text-center text-slate-400 text-xs font-bold uppercase tracking-widest">
        No roster available
      </div>
    );
  }

  const month = roster.month;
  const year = roster.year;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDayOfMonth = new Date(year, month, 1).getDay();
  
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 
    'July', 'August', 'September', 'October', 'November', 'December'];
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  // Create calendar grid
  const weeks: (ScheduledShift | null)[][] = [];
  let currentWeek: (ScheduledShift | null)[] = [];

  // Fill empty cells for days before month starts
  for (let i = 0; i < firstDayOfMonth; i++) {
    currentWeek.push(null);
  }

  // Fill days of the month
  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${year}-${(month + 1).toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
    const shift = roster.shifts.find(s => s.date === dateStr) || null;
    currentWeek.push(shift);

    if (currentWeek.length === 7) {
      weeks.push(currentWeek);
      currentWeek = [];
    }
  }

  // Fill remaining cells in last week
  while (currentWeek.length < 7 && currentWeek.length > 0) {
    currentWeek.push(null);
  }
  if (currentWeek.length > 0) {
    weeks.push(currentWeek);
  }

  const getDoctorName = (doctorId: string) => {
    const doctor = doctors.find(d => d.id === doctorId);
    return doctor?.name || 'Unassigned';
  };

  const getShiftInfo = (shift: ScheduledShift | null) => {
    if (!shift) return null;
    const template = SHIFT_TEMPLATES.find(t => t.id === shift.templateId);
    return template;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-black text-slate-900">
          {monthNames[month]} {year}
        </h2>
        {roster.status === 'FINAL' && <Badge color="green">FINALIZED</Badge>}
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-slate-50">
                {dayNames.map(day => (
                  <th 
                    key={day}
                    className="p-3 text-[10px] font-black text-slate-600 uppercase tracking-widest border-b border-slate-200 text-center"
                  >
                    {day}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {weeks.map((week, weekIdx) => (
                <tr key={weekIdx} className="border-b border-slate-100 last:border-b-0">
                  {week.map((shift, dayIdx) => {
                    const day = weekIdx * 7 + dayIdx - firstDayOfMonth + 1;
                    const isToday = new Date().toDateString() === new Date(year, month, day).toDateString();
                    const shiftInfo = getShiftInfo(shift);
                    const isMyShift = shift?.doctorId === currentUserId;

                    return (
                      <td
                        key={dayIdx}
                        className={`p-2 align-top border-r border-slate-100 last:border-r-0 min-w-[80px] ${
                          day < 1 || day > daysInMonth ? 'bg-slate-50' : 'bg-white'
                        } ${isToday ? 'ring-2 ring-indigo-500' : ''}`}
                      >
                        {day >= 1 && day <= daysInMonth && (
                          <>
                            <div className={`text-xs font-black mb-1 ${isToday ? 'text-indigo-600' : 'text-slate-400'}`}>
                              {day}
                            </div>
                            {shift && shiftInfo && (
                              <div
                                onClick={() => onShiftClick?.(shift)}
                                className={`p-2 rounded-lg text-[9px] font-bold cursor-pointer transition-all ${
                                  isMyShift 
                                    ? 'bg-indigo-600 text-white' 
                                    : shift.isPublicHoliday 
                                    ? 'bg-rose-100 text-rose-700' 
                                    : 'bg-slate-100 text-slate-700'
                                }`}
                              >
                                <div className="font-black">{getDoctorName(shift.doctorId).split(' ').pop()}</div>
                                <div className="text-[8px] opacity-75 mt-0.5">
                                  {shiftInfo.name}
                                </div>
                                <div className="text-[8px] opacity-60 mt-0.5">
                                  {shiftInfo.totalHours}H
                                </div>
                              </div>
                            )}
                            {!shift && day >= 1 && day <= daysInMonth && (
                              <div className="text-[8px] text-slate-300 font-bold">No shift</div>
                            )}
                          </>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="flex items-center gap-4 text-[9px] font-bold text-slate-500">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded bg-indigo-600"></div>
          <span>Your Shift</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded bg-rose-100"></div>
          <span>Public Holiday</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded ring-2 ring-indigo-500"></div>
          <span>Today</span>
        </div>
      </div>
    </div>
  );
};
