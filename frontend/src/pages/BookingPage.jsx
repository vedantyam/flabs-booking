import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import CalendarGrid from '../components/CalendarGrid.jsx';
import SlotCell from '../components/SlotCell.jsx';

const API_URL = import.meta.env.VITE_API_URL || '';
const POLL_INTERVAL = 30000;
const BACKOFF = 5000;

// Replace with actual extension ID after installing
const EXTENSION_ID = 'PLACEHOLDER_EXTENSION_ID';

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
  const [slotCache, setSlotCache] = useState({});
  const [loadingDate, setLoadingDate] = useState(null);
  const [error, setError] = useState('');
  const [mobileView, setMobileView] = useState('calendar');
  const [detailModal, setDetailModal] = useState(null);

  // Booking modal state
  const [bookingModal, setBookingModal] = useState(null);
  const [leadPhone, setLeadPhone] = useState('');
  const [spName, setSpName] = useState('');
  const [notes, setNotes] = useState('');
  const [bookingLoading, setBookingLoading] = useState(false);
  const [bookingSuccess, setBookingSuccess] = useState(null);
  const [bookingError, setBookingError] = useState('');

  const slotCacheRef = useRef({});
  const selectedDateRef = useRef(today);
  const fetchInProgressRef = useRef(new Set());
  const failedTriesRef = useRef(0);
  const timeToNextFetchRef = useRef(0);
  const rafIdRef = useRef(null);

  async function fetchDate(dateStr, force = false) {
    if (!force && slotCacheRef.current[dateStr]) return;
    if (fetchInProgressRef.current.has(dateStr)) return;

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
        timeToNextFetchRef.current = 0;
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Close modals on Escape
  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') {
        setDetailModal(null);
        if (!bookingLoading) {
          setBookingModal(null);
          setBookingSuccess(null);
          setBookingError('');
        }
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [bookingLoading]);

  function handleDateSelect(dateStr) {
    selectedDateRef.current = dateStr;
    setSelectedDate(dateStr);
    setMobileView('slots');
    fetchDate(dateStr, false);
  }

  async function handleSlotClick(slot) {
    // Green (available) slot → booking modal
    if (slot.available) {
      setLeadPhone('');
      setSpName('');
      setNotes('');
      setBookingError('');
      setBookingSuccess(null);
      setBookingModal({ slot });
      return;
    }

    // Red/grey slot → detail modal (existing behavior)
    if (slot.personStatuses && slot.personStatuses.length > 0) {
      setDetailModal({ slot, loading: false, persons: slot.personStatuses, error: '' });
      return;
    }
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

  async function handleConfirmBooking() {
    if (!leadPhone.trim()) { setBookingError('Phone number is required.'); return; }
    if (!spName.trim()) { setBookingError('Your name is required.'); return; }

    setBookingLoading(true);
    setBookingError('');

    const slot = bookingModal.slot;

    try {
      const res = await axios.post(`${API_URL}/api/bookings`, {
        date: selectedDate,
        slot_start: slot.start,
        slot_end: slot.end,
        lead_phone: leadPhone.trim().replace(/\D/g, '').replace(/^91/, ''),
        sp_name: spName.trim(),
        notes: notes.trim(),
      });

      const assigned = res.data.assigned_to;

      // Notify Chrome extension
      if (typeof chrome !== 'undefined' && chrome.runtime && EXTENSION_ID !== 'PLACEHOLDER_EXTENSION_ID') {
        try {
          chrome.runtime.sendMessage(EXTENSION_ID, {
            type: 'BOOK_DEMO',
            data: {
              phone: leadPhone.trim(),
              date: selectedDate,
              time: slot.start,
              spName: spName.trim(),
            },
          });
        } catch (extErr) {
          console.warn('[FLABS] Extension not available:', extErr.message);
        }
      }

      setBookingSuccess({ assigned, slot });

      // Invalidate slot cache for this date so grid refreshes
      delete slotCacheRef.current[selectedDate];
      await fetchDate(selectedDate, true);

    } catch (err) {
      const msg = err.response?.data?.error || 'Booking failed. Please try again.';
      setBookingError(msg);
    } finally {
      setBookingLoading(false);
    }
  }

  const slots = slotCache[selectedDate] || [];
  const isLoading = loadingDate === selectedDate;
  const showAfterEightBanner = slots.length > 0 && slots[slots.length - 1].end >= '20:00';

  return (
    <div className="h-screen flex flex-col bg-white overflow-hidden">
      {/* Header */}
      <header className="flex-shrink-0 border-b border-gray-100 px-6 py-4 flex items-center justify-between">
        <h1 className="text-base font-bold text-gray-900 tracking-tight">FLABS Demo Booking</h1>
        <span className="text-xs text-gray-400 bg-gray-50 px-3 py-1 rounded-full border border-gray-100">
          All times IST
        </span>
      </header>

      {/* Body */}
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

          <div className="flex-shrink-0 px-6 pt-5 pb-4 border-b border-gray-100">
            <h2 className="text-base font-semibold text-gray-800">
              {selectedDate ? formatSelectedDate(selectedDate) : 'Select a date'}
            </h2>
            <p className="text-xs text-gray-400 mt-0.5">30-minute slots · click a green slot to book</p>
          </div>

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

      {/* Slot Detail Modal (for booked/grey slots) */}
      {detailModal && (
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
          onClick={() => setDetailModal(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-xl w-full max-w-xs p-5"
            onClick={e => e.stopPropagation()}
          >
            <p className="text-sm font-semibold text-gray-800 mb-3">
              {detailModal.slot.start} – {detailModal.slot.end}
            </p>
            <hr className="border-gray-100 mb-3" />

            {detailModal.loading && (
              <div className="flex items-center justify-center gap-2 text-gray-400 py-4">
                <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
                <span className="text-sm">Loading…</span>
              </div>
            )}
            {!detailModal.loading && detailModal.error && (
              <p className="text-sm text-red-500 py-2">{detailModal.error}</p>
            )}
            {!detailModal.loading && !detailModal.error && detailModal.persons && (
              <div className="space-y-2.5">
                {detailModal.persons.map(p => (
                  <div key={p.name} className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-sm leading-none shrink-0">{statusIcon(p.status)}</span>
                      <span className={`text-sm font-medium truncate ${
                        p.status === 'not_working' ? 'text-gray-400' : 'text-gray-800'
                      }`}>{p.name}</span>
                    </div>
                    <span className={`text-xs font-medium shrink-0 ${
                      p.status === 'free'        ? 'text-green-600' :
                      p.status === 'busy'        ? 'text-red-500'   :
                                                   'text-gray-400'
                    }`}>{statusLabel(p)}</span>
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

      {/* Booking Modal */}
      {bookingModal && (
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
          onClick={() => { if (!bookingLoading) { setBookingModal(null); setBookingSuccess(null); setBookingError(''); } }}
        >
          <div
            className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6"
            onClick={e => e.stopPropagation()}
          >
            {bookingSuccess ? (
              /* Success state */
              <>
                <div className="text-center mb-4">
                  <div className="text-3xl mb-2">✅</div>
                  <h3 className="text-base font-bold text-gray-900">Demo Booked!</h3>
                </div>
                <div className="bg-green-50 rounded-lg px-4 py-3 text-sm text-green-800 space-y-1 mb-4">
                  <div><span className="font-medium">Assigned to:</span> {bookingSuccess.assigned.name}</div>
                  <div><span className="font-medium">Date:</span> {formatSelectedDate(selectedDate)}</div>
                  <div><span className="font-medium">Time:</span> {bookingSuccess.slot.start} – {bookingSuccess.slot.end}</div>
                </div>
                {EXTENSION_ID !== 'PLACEHOLDER_EXTENSION_ID' && (
                  <p className="text-xs text-gray-400 text-center mb-4">
                    TeleCRM is updating automatically…<br />
                    (Check the FLABS extension icon for status)
                  </p>
                )}
                <button
                  onClick={() => { setBookingModal(null); setBookingSuccess(null); }}
                  className="w-full py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition"
                >
                  Done
                </button>
              </>
            ) : (
              /* Form state */
              <>
                <h3 className="text-base font-bold text-gray-900 mb-1">Book Demo</h3>
                <p className="text-sm text-gray-500 mb-4">
                  {formatSelectedDate(selectedDate)} · {bookingModal.slot.start}–{bookingModal.slot.end}
                </p>

                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Lead Phone Number <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="tel"
                      placeholder="+91__________"
                      value={leadPhone}
                      onChange={e => setLeadPhone(e.target.value)}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      disabled={bookingLoading}
                      autoFocus
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Your Name (SP) <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Harshit"
                      value={spName}
                      onChange={e => setSpName(e.target.value)}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      disabled={bookingLoading}
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Notes for Support (optional)
                    </label>
                    <textarea
                      placeholder="e.g. Interested in basic plan"
                      value={notes}
                      onChange={e => setNotes(e.target.value)}
                      rows={2}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                      disabled={bookingLoading}
                    />
                  </div>
                </div>

                {bookingError && (
                  <p className="text-xs text-red-600 mt-2">{bookingError}</p>
                )}

                <div className="flex gap-2 mt-4">
                  <button
                    onClick={handleConfirmBooking}
                    disabled={bookingLoading}
                    className="flex-1 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {bookingLoading && (
                      <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    )}
                    Confirm Booking
                  </button>
                  <button
                    onClick={() => { setBookingModal(null); setBookingError(''); }}
                    disabled={bookingLoading}
                    className="px-4 py-2 text-gray-600 rounded-lg text-sm font-medium hover:bg-gray-100 transition disabled:opacity-60"
                  >
                    Cancel
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
