const express = require('express');
const { DateTime } = require('luxon');
const { createClient } = require('@supabase/supabase-js');
const { getDaySlotsWithAvailability } = require('../services/slotLogic');
const gcalService = require('../services/googleCalendar');

const router = express.Router();

function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

// Validate date string
function isValidDate(dateStr) {
  const dt = DateTime.fromISO(dateStr, { zone: 'Asia/Kolkata' });
  return dt.isValid;
}

// GET /api/slots?date=YYYY-MM-DD
router.get('/', async (req, res, next) => {
  try {
    const { date } = req.query;
    if (!date || !isValidDate(date)) {
      return res.status(400).json({ error: 'Invalid or missing date parameter (YYYY-MM-DD)' });
    }

    const supabase = getSupabase();
    const slots = await getDaySlotsWithAvailability(date, supabase, gcalService);
    res.json({ date, slots });
  } catch (err) {
    next(err);
  }
});

// GET /api/slots/week?start=YYYY-MM-DD
router.get('/week', async (req, res, next) => {
  try {
    const { start } = req.query;
    if (!start || !isValidDate(start)) {
      return res.status(400).json({ error: 'Invalid or missing start parameter (YYYY-MM-DD)' });
    }

    const supabase = getSupabase();
    const startDT = DateTime.fromISO(start, { zone: 'Asia/Kolkata' });

    // Fetch 7 days
    const weekData = await Promise.all(
      Array.from({ length: 7 }, (_, i) => {
        const dateStr = startDT.plus({ days: i }).toISODate();
        return getDaySlotsWithAvailability(dateStr, supabase, gcalService).then(slots => ({
          date: dateStr,
          slots,
        }));
      })
    );

    res.json({ start, week: weekData });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
