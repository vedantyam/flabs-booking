import React from 'react';

export default function SlotCell({ slot, onClick }) {
  if (!slot) return null;

  // Grey: outside working hours (all persons) or outside this person's hours (person filter active)
  if (slot.allNotWorking || slot.personStatus === 'not_working') {
    return (
      <button
        onClick={onClick}
        className="w-full text-left rounded-lg bg-gray-50 px-3 py-2.5 text-sm text-gray-400 hover:bg-gray-100 active:bg-gray-200 transition cursor-pointer"
      >
        {slot.start} – {slot.end}
      </button>
    );
  }

  if (slot.available) {
    return (
      <button
        onClick={onClick}
        className="w-full text-left rounded-lg bg-green-50 px-3 py-2.5 text-sm text-green-800 font-medium hover:bg-green-100 active:bg-green-200 transition cursor-pointer"
      >
        {slot.start} – {slot.end}
      </button>
    );
  }

  return (
    <button
      onClick={onClick}
      className="w-full text-left rounded-lg bg-red-50 px-3 py-2.5 text-sm text-red-300 line-through hover:bg-red-100 active:bg-red-200 transition cursor-pointer"
    >
      {slot.start} – {slot.end}
    </button>
  );
}
