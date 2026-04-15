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
  const displayH = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return `${displayH}:${m.toString().padStart(2, '0')} ${ampm}`;
}

function formatDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

export default function BookingsList({ refreshKey }) {
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({ date: '', slot_start: '', slot_end: '' });
  const [actionLoading, setActionLoading] = useState('');

  useEffect(() => {
    loadBookings();
  }, [refreshKey]);

  async function loadBookings() {
    setLoading(true);
    setError('');
    try {
      const res = await axios.get(`${API_URL}/api/bookings`, { headers: authHeader() });
      setBookings(res.data);
    } catch (err) {
      setError('Failed to load bookings');
    } finally {
      setLoading(false);
    }
  }

  async function handleCancel(id) {
    if (!confirm('Cancel this booking?')) return;
    setActionLoading(id + '-cancel');
    try {
      await axios.delete(`${API_URL}/api/bookings/${id}`, { headers: authHeader() });
      setBookings(b => b.filter(x => x.id !== id));
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to cancel booking');
    } finally {
      setActionLoading('');
    }
  }

  function startEdit(booking) {
    setEditingId(booking.id);
    setEditForm({
      date: booking.date,
      slot_start: booking.slot_start,
      slot_end: booking.slot_end,
    });
  }

  function computeSlotEnd(slotStart) {
    if (!slotStart) return '';
    const [h, m] = slotStart.split(':').map(Number);
    const totalMin = h * 60 + m + 30;
    return `${Math.floor(totalMin / 60).toString().padStart(2, '0')}:${(totalMin % 60).toString().padStart(2, '0')}`;
  }

  async function handleReschedule(id) {
    const { date, slot_start } = editForm;
    const slot_end = computeSlotEnd(slot_start);
    if (!date || !slot_start) {
      alert('Please fill in date and start time');
      return;
    }
    setActionLoading(id + '-reschedule');
    try {
      const res = await axios.put(`${API_URL}/api/bookings/${id}`, { date, slot_start, slot_end }, { headers: authHeader() });
      setBookings(b => b.map(x => x.id === id ? { ...res.data.booking, support_persons: res.data.booking.support_persons } : x));
      setEditingId(null);
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to reschedule booking');
    } finally {
      setActionLoading('');
    }
  }

  // Group by upcoming vs past
  const today = new Date().toISOString().split('T')[0];
  const upcoming = bookings.filter(b => b.date >= today);
  const past = bookings.filter(b => b.date < today);

  if (loading) return <div className="py-8 text-center text-gray-500">Loading bookings...</div>;
  if (error) return <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">{error}</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-800">All Bookings</h2>
        <button
          onClick={loadBookings}
          className="text-sm text-blue-600 hover:text-blue-800 transition"
        >
          Refresh
        </button>
      </div>

      {bookings.length === 0 && (
        <div className="text-center py-10 text-gray-400">No bookings yet</div>
      )}

      {upcoming.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wide mb-2">Upcoming ({upcoming.length})</h3>
          <BookingTable
            bookings={upcoming}
            editingId={editingId}
            editForm={editForm}
            setEditForm={setEditForm}
            onEdit={startEdit}
            onCancelEdit={() => setEditingId(null)}
            onCancel={handleCancel}
            onReschedule={handleReschedule}
            actionLoading={actionLoading}
          />
        </div>
      )}

      {past.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wide mb-2">Past ({past.length})</h3>
          <BookingTable
            bookings={past}
            editingId={null}
            editForm={editForm}
            setEditForm={setEditForm}
            onEdit={() => {}}
            onCancelEdit={() => {}}
            onCancel={handleCancel}
            onReschedule={handleReschedule}
            actionLoading={actionLoading}
            readonly
          />
        </div>
      )}
    </div>
  );
}

function BookingTable({ bookings, editingId, editForm, setEditForm, onEdit, onCancelEdit, onCancel, onReschedule, actionLoading, readonly }) {
  function formatTime(t) {
    if (!t) return '';
    const [h, m] = t.split(':').map(Number);
    const ampm = h >= 12 ? 'PM' : 'AM';
    const displayH = h > 12 ? h - 12 : h === 0 ? 12 : h;
    return `${displayH}:${m.toString().padStart(2, '0')} ${ampm}`;
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200">
      <table className="w-full text-sm">
        <thead className="bg-gray-50">
          <tr>
            <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Date</th>
            <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Time</th>
            <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Support Person</th>
            {!readonly && <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Actions</th>}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {bookings.map(booking => (
            <tr key={booking.id} className="hover:bg-gray-50 transition">
              {editingId === booking.id ? (
                <>
                  <td className="px-4 py-3">
                    <input
                      type="date"
                      value={editForm.date}
                      onChange={e => setEditForm(f => ({ ...f, date: e.target.value }))}
                      className="border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <input
                      type="time"
                      value={editForm.slot_start}
                      step={1800}
                      onChange={e => setEditForm(f => ({ ...f, slot_start: e.target.value }))}
                      className="border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </td>
                  <td className="px-4 py-3 text-gray-500">Will auto-assign</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <button
                        onClick={() => onReschedule(booking.id)}
                        disabled={!!actionLoading}
                        className="bg-blue-600 text-white text-xs px-3 py-1.5 rounded hover:bg-blue-700 disabled:opacity-50 transition"
                      >
                        {actionLoading === booking.id + '-reschedule' ? 'Saving...' : 'Save'}
                      </button>
                      <button
                        onClick={onCancelEdit}
                        className="border border-gray-300 text-gray-600 text-xs px-3 py-1.5 rounded hover:bg-gray-50 transition"
                      >
                        Cancel
                      </button>
                    </div>
                  </td>
                </>
              ) : (
                <>
                  <td className="px-4 py-3 text-gray-800 font-medium">
                    {new Date(booking.date + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
                  </td>
                  <td className="px-4 py-3 text-gray-700">
                    {formatTime(booking.slot_start)} – {formatTime(booking.slot_end)}
                  </td>
                  <td className="px-4 py-3">
                    <span className="bg-blue-50 text-blue-700 text-xs px-2 py-1 rounded-full font-medium">
                      {booking.support_persons?.name || '—'}
                    </span>
                  </td>
                  {!readonly && (
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <button
                          onClick={() => onEdit(booking)}
                          className="text-xs text-blue-600 hover:text-blue-800 font-medium transition"
                        >
                          Reschedule
                        </button>
                        <button
                          onClick={() => onCancel(booking.id)}
                          disabled={actionLoading === booking.id + '-cancel'}
                          className="text-xs text-red-600 hover:text-red-800 font-medium transition disabled:opacity-50"
                        >
                          {actionLoading === booking.id + '-cancel' ? 'Cancelling...' : 'Cancel'}
                        </button>
                      </div>
                    </td>
                  )}
                </>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
