import React, { useState, useEffect } from 'react';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || '';

function authHeader() {
  const token = localStorage.getItem('admin_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function formatTime(t) {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const dh = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return `${dh}:${m.toString().padStart(2, '0')} ${ampm}`;
}

function formatDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-IN', {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
  });
}

function formatBookedAt(ts) {
  if (!ts) return '—';
  const d = new Date(ts);
  return (
    d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) +
    ' · ' +
    d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
  );
}

export default function BookingsList({ refreshKey }) {
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [cancelling, setCancelling] = useState(null);

  useEffect(() => { loadBookings(); }, [refreshKey]);

  async function loadBookings() {
    setLoading(true);
    setError('');
    try {
      const res = await axios.get(`${API_URL}/api/bookings`, { headers: authHeader() });
      const today = new Date().toISOString().split('T')[0];
      const upcoming = (res.data || [])
        .filter(b => b.date >= today)
        .sort((a, b) =>
          a.date.localeCompare(b.date) || a.slot_start.localeCompare(b.slot_start)
        );
      setBookings(upcoming);
    } catch {
      setError('Failed to load bookings');
    } finally {
      setLoading(false);
    }
  }

  async function handleCancel(id) {
    if (!confirm('Cancel this booking?')) return;
    setCancelling(id);
    try {
      await axios.delete(`${API_URL}/api/bookings/${id}`, { headers: authHeader() });
      setBookings(b => b.filter(x => x.id !== id));
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to cancel booking');
    } finally {
      setCancelling(null);
    }
  }

  if (loading) return <div className="py-8 text-center text-gray-400">Loading schedule…</div>;
  if (error)   return <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">{error}</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-800">Upcoming Schedule</h2>
        <button onClick={loadBookings} className="text-sm text-blue-600 hover:text-blue-800 transition">
          Refresh
        </button>
      </div>

      {bookings.length === 0 ? (
        <div className="text-center py-10 text-gray-400">No upcoming bookings</div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Date</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Time Slot</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Support Person</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Booked At</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {bookings.map(booking => (
                <tr key={booking.id} className="hover:bg-gray-50 transition">
                  <td className="px-4 py-3 font-medium text-gray-800">
                    {formatDate(booking.date)}
                  </td>
                  <td className="px-4 py-3 text-gray-700">
                    {formatTime(booking.slot_start)} – {formatTime(booking.slot_end)}
                  </td>
                  <td className="px-4 py-3">
                    <span className="bg-blue-50 text-blue-700 text-xs px-2 py-1 rounded-full font-medium">
                      {booking.support_persons?.name || '—'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-400">
                    {formatBookedAt(booking.created_at)}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => handleCancel(booking.id)}
                      disabled={cancelling === booking.id}
                      className="text-xs text-red-600 hover:text-red-800 font-medium transition disabled:opacity-50"
                    >
                      {cancelling === booking.id ? 'Cancelling…' : 'Cancel'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
