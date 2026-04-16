const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const { requireAuth } = require('../middleware/auth');
const {
  getFreePersonsForSlot,
  isPersonScheduledForSlot,
  toIST_ISO,
} = require('../services/slotLogic');
const { pickAssignee } = require('../services/roundRobin');
const gcalService = require('../services/googleCalendar');

const router = express.Router();

function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

// POST /api/book  (also mounted as POST /api/bookings for admin)
// Book a slot — assigns a support person round-robin
router.post('/', async (req, res, next) => {
  try {
    const { date, slot_start, slot_end } = req.body;

    if (!date || !slot_start || !slot_end) {
      return res.status(400).json({ error: 'date, slot_start, slot_end are required' });
    }

    const supabase = getSupabase();

    // Get active support persons
    const { data: persons, error: pErr } = await supabase
      .from('support_persons')
      .select('*')
      .eq('is_active', true);
    if (pErr) throw pErr;

    // Get WO persons for this date
    const { data: woDays, error: woErr } = await supabase
      .from('wo_days')
      .select('support_person_id')
      .eq('date', date);
    if (woErr) throw woErr;
    const woPersonIds = new Set((woDays || []).map(w => w.support_person_id));

    // Get existing bookings for this date
    const { data: existingBookings, error: bErr } = await supabase
      .from('bookings')
      .select('*')
      .eq('date', date);
    if (bErr) throw bErr;

    // Get Google Calendar freebusy
    let gcalBusy = {};
    if (persons && persons.length > 0) {
      try {
        const startIST = toIST_ISO(date, slot_start);
        const endIST = toIST_ISO(date, slot_end);
        gcalBusy = await gcalService.getFreeBusy(persons, startIST, endIST);
      } catch (err) {
        console.error('GCal freebusy error during booking:', err.message);
      }
    }

    // Find free persons
    const freePersons = getFreePersonsForSlot(
      persons || [],
      slot_start,
      slot_end,
      woPersonIds,
      existingBookings || [],
      gcalBusy
    );

    if (freePersons.length === 0) {
      return res.status(409).json({ error: 'No support person available for this slot' });
    }

    // Pick assignee using round-robin
    const assignee = await pickAssignee(freePersons, supabase);

    // Create Google Calendar event
    let googleEventId = null;
    try {
      googleEventId = await gcalService.createEvent(
        assignee,
        date,
        slot_start,
        slot_end,
        'FLABS Demo'
      );
    } catch (err) {
      console.error('Failed to create GCal event:', err.message);
    }

    // Save booking to Supabase
    const { data: booking, error: insertErr } = await supabase
      .from('bookings')
      .insert({
        support_person_id: assignee.id,
        date,
        slot_start,
        slot_end,
        booked_by: null,
        google_event_id: googleEventId,
      })
      .select()
      .single();
    if (insertErr) throw insertErr;

    res.json({
      booking,
      assigned_to: {
        id: assignee.id,
        name: assignee.name,
        email: assignee.email,
      },
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/bookings — all bookings (admin only)
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('bookings')
      .select(`
        *,
        support_persons ( id, name, email )
      `)
      .order('date', { ascending: true })
      .order('slot_start', { ascending: true });
    if (error) throw error;
    res.json(data);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/bookings/:id — cancel booking (admin only)
router.delete('/:id', requireAuth, async (req, res, next) => {
  try {
    const supabase = getSupabase();
    const { id } = req.params;

    // Fetch booking to get google_event_id and person email
    const { data: booking, error: fetchErr } = await supabase
      .from('bookings')
      .select(`*, support_persons ( email )`)
      .eq('id', id)
      .single();
    if (fetchErr || !booking) return res.status(404).json({ error: 'Booking not found' });

    // Delete Google Calendar event
    if (booking.google_event_id && booking.support_persons?.email) {
      await gcalService.deleteEvent(booking.support_persons.email, booking.google_event_id);
    }

    // Delete booking from Supabase
    const { error: delErr } = await supabase
      .from('bookings')
      .delete()
      .eq('id', id);
    if (delErr) throw delErr;

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// PUT /api/bookings/:id — reschedule booking (admin only)
router.put('/:id', requireAuth, async (req, res, next) => {
  try {
    const supabase = getSupabase();
    const { id } = req.params;
    const { date, slot_start, slot_end } = req.body;

    if (!date || !slot_start || !slot_end) {
      return res.status(400).json({ error: 'date, slot_start, slot_end are required' });
    }

    // Fetch existing booking
    const { data: existing, error: fetchErr } = await supabase
      .from('bookings')
      .select(`*, support_persons ( * )`)
      .eq('id', id)
      .single();
    if (fetchErr || !existing) return res.status(404).json({ error: 'Booking not found' });

    const person = existing.support_persons;

    // Check if person is available at new time (excluding this booking)
    const { data: otherBookings } = await supabase
      .from('bookings')
      .select('*')
      .eq('date', date)
      .neq('id', id);

    const { data: woDays } = await supabase
      .from('wo_days')
      .select('support_person_id')
      .eq('date', date);
    const woPersonIds = new Set((woDays || []).map(w => w.support_person_id));

    let gcalBusy = {};
    try {
      const startUTC = toUTCISO(date, slot_start);
      const endUTC = toUTCISO(date, slot_end);
      gcalBusy = await gcalService.getFreeBusy([person], startUTC, endUTC);
    } catch (err) {
      console.error('GCal freebusy error during reschedule:', err.message);
    }

    const freeSamePerson = getFreePersonsForSlot(
      [person],
      slot_start,
      slot_end,
      woPersonIds,
      otherBookings || [],
      gcalBusy
    );

    let assignee = person;

    // If original person not free, find another free person
    if (freeSamePerson.length === 0) {
      const { data: allPersons } = await supabase
        .from('support_persons')
        .select('*')
        .eq('is_active', true);

      const freePersons = getFreePersonsForSlot(
        allPersons || [],
        slot_start,
        slot_end,
        woPersonIds,
        otherBookings || [],
        gcalBusy
      );

      if (freePersons.length === 0) {
        return res.status(409).json({ error: 'No support person available for the new slot' });
      }

      assignee = await pickAssignee(freePersons, supabase);
    }

    // Delete old Google Calendar event
    if (existing.google_event_id) {
      await gcalService.deleteEvent(person.email, existing.google_event_id);
    }

    // Create new Google Calendar event
    let newEventId = null;
    try {
      newEventId = await gcalService.createEvent(assignee, date, slot_start, slot_end, 'FLABS Demo');
    } catch (err) {
      console.error('Failed to create GCal event for reschedule:', err.message);
    }

    // Update booking in Supabase
    const { data: updated, error: updateErr } = await supabase
      .from('bookings')
      .update({
        date,
        slot_start,
        slot_end,
        support_person_id: assignee.id,
        google_event_id: newEventId,
      })
      .eq('id', id)
      .select(`*, support_persons ( id, name, email )`)
      .single();
    if (updateErr) throw updateErr;

    res.json({ booking: updated, assigned_to: assignee });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
