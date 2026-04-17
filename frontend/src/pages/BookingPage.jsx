import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import CalendarGrid from '../components/CalendarGrid.jsx';
import SlotCell from '../components/SlotCell.jsx';

const API_URL = import.meta.env.VITE_API_URL || '';
const POLL_INTERVAL = 30000;
const BACKOFF = 5000;

function getTodayStr() {
  return new Date().toISOString().split('T')[0];
}

function formatSelectedDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' });
}

function statusIcon(status) {
  if (status === 'free') return '✅';
  if (status === 'busy') return '🔴';
  return '──';
}

function statusLabel(p) {
  if (p.status === 'free') return 'Free';
  if (p.status === 'not_working') return 'Not working';
  if (!p.reason) return 'Busy';
  return p.reason.charAt(0).toUpperCase() + p.reason.slice(1);
}

export default function BookingPage() {
  const today = getTodayStr();
  const [selectedDate, setSelectedDate] = useState(today);
  const [slotCache, setSlotCache] = useState({}); // { [dateStr]: slots[] }
  const [loadingDate, setLoadingDate] = useState(null);
  const [error, setError] = useState('');
  const [mobileView, setMobileView] = useState('calendar');
  const [detailModal, setDetailModal] = useState(null);

  // Refs so RAF/interval callbacks always see current values without re-registering
  const slotCacheRef = useRef({});
  const selectedDateRef = useRef(today);
  const fetchInProgressRef = useRef(new Set());
  const failedTriesRef = useRef(0);
  const timeToNextFetchRef = useRef(0);
  const rafIdRef = useRef(null);

  async function fetchDate(dateStr, force = false) {
    if (!force && slotCacheRef.current[dateStr]) return; // already cached
    if (fetchInProgressRef.current.has(dateStr)) return; // already in flight

    fetchInProgressRef.current.add(dateStr);
    setLoadingDate(dateStr);
    setError('');
    try {
      const res = await axios.get(`${API_URL}/api/slots`, { params: { date: dateStr } });
      slotCacheRef.current[dateStr] = res.data.slots || [];
      setSlotCache({ ...slotCacheRef.current });
      failedTriesRef.current = 0;
    } catch (e) {
      failedTriesRef.current += 1;
      setError('Failed to load slots. Please try again.');
    } finally {
      fetchInProgressRef.current.delete(dateStr);
      setLoadingDate(null);
    }
  }

  // On mount: fetch today + set up RAF polling of selected date
  useEffect(() => {
    fetchDate(today);

    async function rafTimer(time) {
      if (timeToNextFetchRef.current <= time) {
        await fetchDate(selectedDateRef.current, true);
        timeToNextFetchRef.current =
          time + POLL_INTERVAL + failedTriesRef.current * BACKOFF;
      }
      rafIdRef.current = requestAnimationFrame(rafTimer);
    }

    rafIdRef.current = requestAnimationFrame(rafTimer);

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        timeToNextFetchRef.current = 0; // force immediate refresh when tab regains focus
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Close modal on Escape key
  useEffect(() => {
    if (!detailModal) return;
    function onKey(e) {
      if (e.key === 'Escape') setDetailModal(null);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [detailModal]);

  function handleDateSelect(dateStr) {
    selectedDateRef.current = dateStr;
    setSelectedDate(dateStr);
    setMobileView('slots');
    // Fetch if not yet cached (force=false → skips if already have data)
    fetchDate(dateStr, false);
  }

  async function handleSlotClick(slot) {
    setDetailModal({ slot, loading: true, persons: null, error: '' });
    try {
      const res = await axios.get(`${API_URL}/api/slots/detail`, {
        params: { date: selectedDate, start: slot.start, end: slot.end },
      });
      setDetailModal({ slot, loading: false, persons: res.data, error: '' });
    } catch {
      setDetailModal(prev =>
        prev ? { ...prev, loading: false, error: 'Failed to load details.' } : null
      );
    }
  }

  const slots = slotCache[selectedDate] || [];
  const isLoading = loadingDate === selectedDate;
  // Show "no demos after 8pm" banner when the day extends to 8pm (last slot ends at 20:00+)
  const showAfterEightBanner = slots.length > 0 && slots[slots.length - 1].end >= '20:00';

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
            <p className="text-xs text-gray-400 mt-0.5">30-minute slots · click any slot to see who's free</p>
          </div>

          {/* Slot grid */}
          <div className="flex-1 overflow-y-auto px-6 py-5">
            {isLoading && (
              <div className="flex items-center justify-center gap-2 text-gray-400 mt-10">
                <div className="w-5 h-5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
                <span className="text-sm">Loading slots…</span>
              </div>
            )}

            {!isLoading && error && (
              <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
                {error}
              </div>
            )}

            {!isLoading && !error && slots.length === 0 && (
              <p className="text-sm text-gray-400 text-center mt-10">
                No slots for this date.
              </p>
            )}

            {!isLoading && slots.length > 0 && (
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
                    <SlotCell
                      key={slot.start}
                      slot={slot}
                      onClick={() => handleSlotClick(slot)}
                    />
                  ))}
                </div>

                {showAfterEightBanner && (
                  <div className="col-span-full mt-4 flex items-center gap-2 px-4 py-3 rounded-lg bg-gray-50 border border-gray-200 text-sm text-gray-500">
                    <span>🚫</span>
                    <span>No demos available after 8:00 PM</span>
                  </div>
                )}
              </>
            )}
          </div>
        </section>
      </div>

      {/* ── Slot Detail Modal ── */}
      {detailModal && (
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
          onClick={() => setDetailModal(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-xl w-full max-w-xs p-5"
            onClick={e => e.stopPropagation()}
          >
            {/* Time heading */}
            <p className="text-sm font-semibold text-gray-800 mb-3">
              {detailModal.slot.start} – {detailModal.slot.end}
            </p>

            <hr className="border-gray-100 mb-3" />

            {/* Loading */}
            {detailModal.loading && (
              <div className="flex items-center justify-center gap-2 text-gray-400 py-4">
                <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
                <span className="text-sm">Loading…</span>
              </div>
            )}

            {/* Error */}
            {!detailModal.loading && detailModal.error && (
              <p className="text-sm text-red-500 py-2">{detailModal.error}</p>
            )}

            {/* Person rows */}
            {!detailModal.loading && !detailModal.error && detailModal.persons && (
              <div className="space-y-2.5">
                {detailModal.persons.map(p => (
                  <div key={p.name} className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-sm leading-none shrink-0">{statusIcon(p.status)}</span>
                      <span className={`text-sm font-medium truncate ${
                        p.status === 'not_working' ? 'text-gray-400' : 'text-gray-800'
                      }`}>
                        {p.name}
                      </span>
                    </div>
                    <span className={`text-xs font-medium shrink-0 ${
                      p.status === 'free'        ? 'text-green-600' :
                      p.status === 'busy'        ? 'text-red-500'   :
                                                   'text-gray-400'
                    }`}>
                      {statusLabel(p)}
                    </span>
                  </div>
                ))}
              </div>
            )}

            <hr className="border-gray-100 mt-4 mb-3" />

            <button
              onClick={() => setDetailModal(null)}
              className="w-full text-sm text-gray-500 hover:text-gray-700 transition py-1 rounded-lg hover:bg-gray-50"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
