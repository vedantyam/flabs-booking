import React, { useState } from 'react';
import CalendarGrid from '../components/CalendarGrid.jsx';
import BookingConfirmModal from '../components/BookingConfirmModal.jsx';

export default function BookingPage() {
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);

  function handleSlotClick(slot) {
    setSelectedSlot(slot);
  }

  function handleClose() {
    setSelectedSlot(null);
  }

  function handleBooked() {
    // Refresh calendar after booking
    setTimeout(() => {
      setSelectedSlot(null);
      setRefreshKey(k => k + 1);
    }, 2000);
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">FLABS Demo Booking</h1>
            <p className="text-sm text-gray-500">Book a 30-minute demo slot with the support team</p>
          </div>
          <div className="text-right hidden sm:block">
            <p className="text-xs text-gray-400">All times in IST</p>
            <p className="text-xs text-gray-400">10:00 AM – 8:00 PM</p>
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 sm:p-6">
          <CalendarGrid key={refreshKey} onSlotClick={handleSlotClick} />
        </div>

        <p className="text-center text-xs text-gray-400 mt-4">
          Click a green slot to book. Red slots are fully booked.
        </p>
      </main>

      {selectedSlot && (
        <BookingConfirmModal
          slot={selectedSlot}
          onClose={handleClose}
          onBooked={handleBooked}
        />
      )}
    </div>
  );
}
