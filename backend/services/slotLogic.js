const { DateTime } = require('luxon');

const TIMEZONE = 'Asia/Kolkata';
const SLOT_DURATION = 30; // minutes
const DAY_START_HOUR = 10; // 10am
const DAY_END_HOUR = 20;   // 8pm

// Normalize time to HH:MM, handles both "HH:MM" and "HH:MM:SS" (from Supabase time columns)
function normalizeTime(timeStr) {
  if (!timeStr) return null;
  return timeStr.substring(0, 5);
}

function timeToMinutes(timeStr) {
  if (!timeStr) return null;
  const t = normalizeTime(timeStr);
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

function minutesToTime(minutes) {
  const h = Math.floor(minutes / 60).toString().padStart(2, '0');
  const m = (minutes % 60).toString().padStart(2, '0');
  return `${h}:${m}`;
}

// Generate all 30-min slots for a day (10am–8pm IST)
function generateDaySlots(dateStr) {
  const slots = [];
  const startMinutes = DAY_START_HOUR * 60;
  const endMinutes = DAY_END_HOUR * 60;

  for (let m = startMinutes; m < endMinutes; m += SLOT_DURATION) {
    slots.push({
      start: minutesToTime(m),
      end: minutesToTime(m + SLOT_DURATION),
    });
  }
  return slots;
}

// Check if a slot overlaps with a person's break
function isPersonOnBreak(person, slotStart, slotEnd) {
  const slotStartMin = timeToMinutes(slotStart);
  const slotEndMin = timeToMinutes(slotEnd);

  if (person.lunch_start && person.lunch_end) {
    const lunchStart = timeToMinutes(person.lunch_start);
    const lunchEnd = timeToMinutes(person.lunch_end);
    if (slotStartMin < lunchEnd && slotEndMin > lunchStart) return true;
  }

  if (person.tea_start && person.tea_end) {
    const teaStart = timeToMinutes(person.tea_start);
    const teaEnd = timeToMinutes(person.tea_end);
    if (slotStartMin < teaEnd && slotEndMin > teaStart) return true;
  }

  return false;
}

// Check if a person is available (working hours + not on break)
function isPersonScheduledForSlot(person, slotStart, slotEnd) {
  const slotStartMin = timeToMinutes(slotStart);
  const slotEndMin = timeToMinutes(slotEnd);
  const workStart = timeToMinutes(person.work_start);
  const workEnd = timeToMinutes(person.work_end);

  if (slotStartMin < workStart || slotEndMin > workEnd) return false;
  if (isPersonOnBreak(person, slotStart, slotEnd)) return false;

  return true;
}

// Convert IST date + time to UTC ISO string for Google Calendar
function toUTCISO(dateStr, timeStr) {
  return DateTime.fromISO(`${dateStr}T${timeStr}:00`, { zone: TIMEZONE }).toUTC().toISO();
}

// Get free persons for a slot given persons list, WO set, bookings, and GCal busy data
function getFreePersonsForSlot(persons, slotStart, slotEnd, woPersonIds, bookings, gcalBusy) {
  return persons.filter(person => {
    // Must be scheduled (work hours + not on break)
    if (!isPersonScheduledForSlot(person, slotStart, slotEnd)) return false;

    // Must not be on WO
    if (woPersonIds.has(person.id)) return false;

    // Must not have existing booking overlapping this slot
    // Normalize times since Supabase may return "HH:MM:SS" format
    const hasBooking = bookings.some(b =>
      b.support_person_id === person.id &&
      normalizeTime(b.slot_start) < slotEnd &&
      normalizeTime(b.slot_end) > slotStart
    );
    if (hasBooking) return false;

    // Must not be busy on Google Calendar
    if (gcalBusy && gcalBusy[person.email]) {
      const isBusy = gcalBusy[person.email].some(busy =>
        busy.start < slotEnd && busy.end > slotStart
      );
      if (isBusy) return false;
    }

    return true;
  });
}

async function getDaySlotsWithAvailability(dateStr, supabase, gcalService) {
  // Get active support persons
  const { data: persons, error: personsError } = await supabase
    .from('support_persons')
    .select('*')
    .eq('is_active', true);
  if (personsError) throw personsError;

  // Get WO days for this date
  const { data: woDays, error: woError } = await supabase
    .from('wo_days')
    .select('support_person_id')
    .eq('date', dateStr);
  if (woError) throw woError;
  const woPersonIds = new Set((woDays || []).map(w => w.support_person_id));

  // Get bookings for this date
  const { data: bookings, error: bookingsError } = await supabase
    .from('bookings')
    .select('*')
    .eq('date', dateStr);
  if (bookingsError) throw bookingsError;

  // Get Google Calendar freebusy for the day
  let gcalBusy = {};
  if (gcalService && persons && persons.length > 0) {
    try {
      const dayStartUTC = toUTCISO(dateStr, '00:00');
      const dayEndUTC = toUTCISO(dateStr, '23:59');
      gcalBusy = await gcalService.getFreeBusy(persons, dayStartUTC, dayEndUTC);
    } catch (err) {
      console.error('Google Calendar freebusy error:', err.message);
    }
  }

  const slots = generateDaySlots(dateStr);

  return slots.map(slot => {
    const freePersons = getFreePersonsForSlot(
      persons || [],
      slot.start,
      slot.end,
      woPersonIds,
      bookings || [],
      gcalBusy
    );

    return {
      date: dateStr,
      start: slot.start,
      end: slot.end,
      available: freePersons.length > 0,
      freeCount: freePersons.length,
    };
  });
}

module.exports = {
  generateDaySlots,
  getDaySlotsWithAvailability,
  getFreePersonsForSlot,
  isPersonScheduledForSlot,
  isPersonOnBreak,
  toUTCISO,
  timeToMinutes,
  normalizeTime,
};
