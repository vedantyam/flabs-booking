import React, { useState } from 'react';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function getTodayStr() {
  return new Date().toISOString().split('T')[0];
}

function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return d.toISOString().split('T')[0];
}

export default function CalendarGrid({ selectedDate, onDateSelect }) {
  const today = getTodayStr();
  const maxDate = addDays(today, 6);

  const todayDateObj = new Date(today + 'T00:00:00');
  const [displayYear, setDisplayYear] = useState(todayDateObj.getFullYear());
  const [displayMonth, setDisplayMonth] = useState(todayDateObj.getMonth());

  // Build the grid cells for this month
  const daysInMonth = new Date(displayYear, displayMonth + 1, 0).getDate();
  const firstDow = new Date(displayYear, displayMonth, 1).getDay(); // 0=Sun
  // Monday-first: Sun maps to padding 6, Mon→0, Tue→1 …
  const startPadding = firstDow === 0 ? 6 : firstDow - 1;

  const cells = [];
  for (let i = 0; i < startPadding; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push(
      `${displayYear}-${String(displayMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    );
  }

  // Don't allow navigating to a month before the current month
  const currentMonthIdx = todayDateObj.getFullYear() * 12 + todayDateObj.getMonth();
  const displayMonthIdx = displayYear * 12 + displayMonth;
  const canGoPrev = displayMonthIdx > currentMonthIdx;

  function prevMonth() {
    if (!canGoPrev) return;
    if (displayMonth === 0) { setDisplayYear(y => y - 1); setDisplayMonth(11); }
    else setDisplayMonth(m => m - 1);
  }

  function nextMonth() {
    if (displayMonth === 11) { setDisplayYear(y => y + 1); setDisplayMonth(0); }
    else setDisplayMonth(m => m + 1);
  }

  return (
    <div className="select-none">
      {/* Month navigation */}
      <div className="flex items-center justify-between mb-5">
        <button
          onClick={prevMonth}
          disabled={!canGoPrev}
          className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 disabled:opacity-25 transition text-gray-500 text-xl leading-none"
        >
          ‹
        </button>
        <span className="text-sm font-semibold text-gray-800">
          {MONTH_NAMES[displayMonth]} {displayYear}
        </span>
        <button
          onClick={nextMonth}
          className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 transition text-gray-500 text-xl leading-none"
        >
          ›
        </button>
      </div>

      {/* Day-of-week headers */}
      <div className="grid grid-cols-7 mb-1">
        {DAY_NAMES.map(d => (
          <div key={d} className="text-center text-xs font-medium text-gray-400 py-1">
            {d}
          </div>
        ))}
      </div>

      {/* Date cells */}
      <div className="grid grid-cols-7 gap-y-1">
        {cells.map((dateStr, i) => {
          if (!dateStr) return <div key={`pad-${i}`} />;

          const isSelected  = dateStr === selectedDate;
          const isToday     = dateStr === today;
          const isClickable = dateStr >= today && dateStr <= maxDate;

          let cellCls =
            'aspect-square w-full max-w-[36px] mx-auto flex items-center justify-center rounded-full text-sm transition-all ';

          if (isSelected) {
            cellCls += 'bg-blue-600 text-white font-semibold ';
          } else if (isClickable) {
            cellCls += 'text-gray-800 font-medium hover:bg-blue-50 hover:text-blue-600 cursor-pointer ';
          } else {
            cellCls += 'text-gray-300 cursor-default ';
          }

          if (isToday && !isSelected) {
            cellCls += 'ring-2 ring-blue-400 ring-offset-1 font-semibold ';
          }

          return (
            <button
              key={dateStr}
              onClick={() => isClickable && onDateSelect(dateStr)}
              disabled={!isClickable}
              className={cellCls}
            >
              {new Date(dateStr + 'T00:00:00').getDate()}
            </button>
          );
        })}
      </div>

      {/* Legend */}
      <div className="mt-6 pt-4 border-t border-gray-100 space-y-2">
        <p className="text-xs text-gray-400">Click a highlighted date to see slots</p>
        <div className="flex gap-4 text-xs text-gray-400">
          <span className="flex items-center gap-1.5">
            <span className="w-4 h-4 rounded-full ring-2 ring-blue-400 ring-offset-1 inline-block" />
            Today
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-4 h-4 rounded-full bg-blue-600 inline-block" />
            Selected
          </span>
        </div>
      </div>
    </div>
  );
}
