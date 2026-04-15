import React, { useState, useEffect } from 'react';
import axios from 'axios';
import SlotCell from './SlotCell.jsx';

const API_URL = import.meta.env.VITE_API_URL || '';

function getWeekStart() {
  // Start from today (IST-aware: just use local date)
  const today = new Date();
  return today.toISOString().split('T')[0];
}

function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return d.toISOString().split('T')[0];
}

function formatDayHeader(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  const day = d.toLocaleDateString('en-IN', { weekday: 'short' });
  const date = d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  return { day, date };
}

function isToday(dateStr) {
  return dateStr === new Date().toISOString().split('T')[0];
}

export default function CalendarGrid({ onSlotClick }) {
  const [weekStart, setWeekStart] = useState(getWeekStart());
  const [weekData, setWeekData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  // For mobile: show one day at a time
  const [selectedDayIndex, setSelectedDayIndex] = useState(0);

  useEffect(() => {
    loadWeek(weekStart);
  }, [weekStart]);

  async function loadWeek(start) {
    setLoading(true);
    setError('');
    try {
      const res = await axios.get(`${API_URL}/api/slots/week?start=${start}`);
      setWeekData(res.data.week || []);
    } catch (err) {
      setError('Failed to load slots. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  function handlePrev() {
    // Don't go before today
    const newStart = addDays(weekStart, -7);
    const today = getWeekStart();
    if (newStart < today) return;
    setWeekStart(newStart);
    setSelectedDayIndex(0);
  }

  function handleNext() {
    const newStart = addDays(weekStart, 7);
    setWeekStart(newStart);
    setSelectedDayIndex(0);
  }

  // All unique time labels across all days
  const allTimes = weekData.length > 0
    ? weekData[0].slots.map(s => s.start)
    : [];

  const today = getWeekStart();

  return (
    <div>
      {/* Week navigation */}
      <div className="flex items-center justify-between mb-4">
        <button
          onClick={handlePrev}
          disabled={weekStart <= today}
          className="p-2 rounded-lg hover:bg-gray-100 disabled:opacity-30 transition"
          title="Previous week"
        >
          <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <div className="text-center">
          <p className="font-semibold text-gray-800 text-sm">
            {new Date(weekStart + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}
            {' – '}
            {new Date(addDays(weekStart, 6) + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
        </div>
        <button
          onClick={handleNext}
          className="p-2 rounded-lg hover:bg-gray-100 transition"
          title="Next week"
        >
          <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>

      {/* Legend */}
      <div className="flex gap-4 mb-4 text-xs">
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded bg-green-200 border border-green-300 inline-block" />
          Available
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded bg-red-100 border border-red-200 inline-block" />
          Booked
        </span>
      </div>

      {loading && (
        <div className="text-center py-12 text-gray-500">
          <div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full mx-auto mb-3" />
          Loading slots...
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm mb-4">
          {error}
        </div>
      )}

      {!loading && weekData.length > 0 && (
        <>
          {/* Mobile: Day tabs */}
          <div className="md:hidden flex overflow-x-auto gap-2 mb-4 pb-1">
            {weekData.map((dayData, i) => {
              const { day, date } = formatDayHeader(dayData.date);
              const isTodayDay = isToday(dayData.date);
              return (
                <button
                  key={dayData.date}
                  onClick={() => setSelectedDayIndex(i)}
                  className={`flex-shrink-0 flex flex-col items-center px-3 py-2 rounded-lg border text-xs transition
                    ${selectedDayIndex === i
                      ? 'bg-blue-600 text-white border-blue-600'
                      : isTodayDay
                        ? 'bg-blue-50 border-blue-200 text-blue-700'
                        : 'bg-white border-gray-200 text-gray-700'
                    }`}
                >
                  <span className="font-semibold">{day}</span>
                  <span>{date}</span>
                </button>
              );
            })}
          </div>

          {/* Mobile: Single day column */}
          <div className="md:hidden">
            {weekData[selectedDayIndex] && (
              <div className="space-y-2">
                {weekData[selectedDayIndex].slots.map(slot => (
                  <div key={slot.start} className="flex items-center gap-2">
                    <span className="text-xs text-gray-400 w-16 text-right flex-shrink-0">
                      {formatTimeMobile(slot.start)}
                    </span>
                    <div className="flex-1">
                      <SlotCell
                        slot={{ ...slot, date: weekData[selectedDayIndex].date }}
                        onClick={onSlotClick}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Desktop: Full week grid */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th className="w-16 text-xs text-gray-400 font-normal py-2" />
                  {weekData.map(dayData => {
                    const { day, date } = formatDayHeader(dayData.date);
                    const isTodayDay = isToday(dayData.date);
                    return (
                      <th
                        key={dayData.date}
                        className={`text-center py-2 px-1 text-xs ${isTodayDay ? 'text-blue-600' : 'text-gray-600'}`}
                      >
                        <div className={`font-semibold ${isTodayDay ? 'text-blue-700' : ''}`}>{day}</div>
                        <div className={`font-normal ${isTodayDay ? 'text-blue-500' : 'text-gray-400'}`}>{date}</div>
                        {isTodayDay && <div className="w-1.5 h-1.5 bg-blue-500 rounded-full mx-auto mt-1" />}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {allTimes.map(time => (
                  <tr key={time}>
                    <td className="text-right pr-2 text-xs text-gray-400 py-0.5 align-middle">
                      {formatTimeMobile(time)}
                    </td>
                    {weekData.map(dayData => {
                      const slot = dayData.slots.find(s => s.start === time);
                      return (
                        <td key={dayData.date} className="px-0.5 py-0.5">
                          <SlotCell
                            slot={slot ? { ...slot, date: dayData.date } : null}
                            onClick={onSlotClick}
                          />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function formatTimeMobile(t) {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const displayH = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return `${displayH}:${m.toString().padStart(2, '0')}`;
}
