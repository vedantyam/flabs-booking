import React, { useState } from 'react';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || '';

function formatTime(t) {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const displayH = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return `${displayH}:${m.toString().padStart(2, '0')} ${ampm}`;
}

function formatDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

export default function BookingConfirmModal({ slot, onClose, onBooked }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(null);

  async function handleConfirm() {
    setLoading(true);
    setError('');
    try {
      const res = await axios.post(`${API_URL}/api/bookings`, {
        date: slot.date,
        slot_start: slot.start,
        slot_end: slot.end,
      });
      setSuccess(res.data);
      onBooked && onBooked(res.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Booking failed. Please try another slot.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
        {!success ? (
          <>
            <div className="p-6 border-b border-gray-100">
              <h2 className="text-xl font-bold text-gray-800">Confirm Booking</h2>
              <p className="text-sm text-gray-500 mt-1">This slot will be reserved for a FLABS demo</p>
            </div>

            <div className="p-6 space-y-3">
              <div className="bg-blue-50 rounded-xl p-4">
                <p className="text-sm text-blue-600 font-medium mb-1">Selected Time</p>
                <p className="text-lg font-bold text-blue-800">
                  {formatTime(slot.start)} – {formatTime(slot.end)}
                </p>
                <p className="text-sm text-blue-600 mt-1">{formatDate(slot.date)}</p>
              </div>

              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-2 text-sm">
                  {error}
                </div>
              )}

              <p className="text-sm text-gray-500">
                A support team member will be automatically assigned to this demo.
              </p>
            </div>

            <div className="p-6 pt-0 flex gap-3">
              <button
                onClick={onClose}
                className="flex-1 border border-gray-300 text-gray-700 rounded-lg py-2 font-medium hover:bg-gray-50 transition"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirm}
                disabled={loading}
                className="flex-1 bg-green-600 text-white rounded-lg py-2 font-medium hover:bg-green-700 transition disabled:opacity-50"
              >
                {loading ? 'Booking...' : 'Confirm Booking'}
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="p-6 text-center">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h2 className="text-xl font-bold text-gray-800 mb-1">Booking Confirmed!</h2>
              <p className="text-sm text-gray-500 mb-4">Your demo slot has been reserved</p>

              <div className="bg-gray-50 rounded-xl p-4 text-left space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Date</span>
                  <span className="font-medium text-gray-800">{formatDate(slot.date)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Time</span>
                  <span className="font-medium text-gray-800">{formatTime(slot.start)} – {formatTime(slot.end)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Support Person</span>
                  <span className="font-medium text-green-700">{success.assigned_to?.name}</span>
                </div>
              </div>
            </div>
            <div className="p-6 pt-0">
              <button
                onClick={onClose}
                className="w-full bg-blue-600 text-white rounded-lg py-2 font-medium hover:bg-blue-700 transition"
              >
                Done
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
