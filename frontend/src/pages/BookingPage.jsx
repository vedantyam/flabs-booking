import React, { useState, useEffect } from 'react';
import axios from 'axios';
import CalendarGrid from '../components/CalendarGrid.jsx';
import SlotCell from '../components/SlotCell.jsx';

const API_URL = import.meta.env.VITE_API_URL || '';

function getTodayStr() {
  return new Date().toISOString().split('T')[0];
}

function formatSelectedDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' });
}

export default function BookingPage() {
  const today = getTodayStr();
  const [selectedDate, setSelectedDate] = useState(today);
  const [weekData, setWeekData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  // Mobile: toggle between calendar and slots view
  const [mobileView, setMobileView] = useState('calendar');

  useEffect(() => {
    setLoading(true);
    setError('');
    axios
      .get(`${API_URL}/api/slots/week?start=${today}`)
      .then(res => setWeekData(res.data.week || []))
      .catch(() => setError('Failed to load slots. Please try again.'))
      .finally(() => setLoading(false));
  }, []);

  function getSlotsForDate(dateStr) {
    const dayData = weekData.find(d => d.date === dateStr);
    return dayData?.slots || [];
  }

  function handleDateSelect(dateStr) {
    setSelectedDate(dateStr);
    setMobileView('slots');
  }

  const slots = getSlotsForDate(selectedDate);

  return (
    <div className="h-screen flex flex-col bg-white overflow-hidden">
      {/* ── Header ── */}
      <header className="flex-shrink-0 border-b border-gray-100 px-6 py-4 flex items-center justify-between">
        <h1 className="text-base font-bold text-gray-900 tracking-tight">FLABS Demo Booking</h1>
        <span className="text-xs text-gray-400 bg-gray-50 px-3 py-1 rounded-full border border-gray-100">
          All times IST
        </span>
      </header>

      {/* ── Body ── */}
      <div className="flex flex-1 min-h-0">

        {/* LEFT: Month calendar */}
        <aside
          className={`flex-shrink-0 w-full md:w-72 lg:w-80 border-r border-gray-100 p-6 overflow-y-auto ${
            mobileView === 'slots' ? 'hidden md:block' : 'block'
          }`}
        >
          <CalendarGrid selectedDate={selectedDate} onDateSelect={handleDateSelect} />
        </aside>

        {/* RIGHT: Slots panel */}
        <section
          className={`flex flex-col flex-1 min-h-0 ${
            mobileView === 'calendar' ? 'hidden md:flex' : 'flex'
          }`}
        >
          {/* Mobile back */}
          <div className="md:hidden flex-shrink-0 px-5 pt-4">
            <button
              onClick={() => setMobileView('calendar')}
              className="flex items-center gap-1.5 text-blue-600 text-sm font-medium"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Back to calendar
            </button>
          </div>

          {/* Date heading */}
          <div className="flex-shrink-0 px-6 pt-5 pb-4 border-b border-gray-100">
            <h2 className="text-base font-semibold text-gray-800">
              {selectedDate ? formatSelectedDate(selectedDate) : 'Select a date'}
            </h2>
            <p className="text-xs text-gray-400 mt-0.5">30-minute slots</p>
          </div>

          {/* Slot grid */}
          <div className="flex-1 overflow-y-auto px-6 py-5">
            {loading && (
              <div className="flex items-center justify-center gap-2 text-gray-400 mt-10">
                <div className="w-5 h-5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
                <span className="text-sm">Loading slots…</span>
              </div>
            )}

            {error && (
              <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
                {error}
              </div>
            )}

            {!loading && !error && slots.length === 0 && (
              <p className="text-sm text-gray-400 text-center mt-10">
                No slots for this date.
              </p>
            )}

            {!loading && slots.length > 0 && (
              <>
                {/* Legend */}
                <div className="flex gap-4 mb-4 text-xs text-gray-400">
                  <span className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-sm bg-green-100 inline-block" />
                    Available
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-sm bg-red-100 inline-block" />
                    Booked
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                  {slots.map(slot => (
                    <SlotCell key={slot.start} slot={slot} />
                  ))}
                </div>
              </>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
