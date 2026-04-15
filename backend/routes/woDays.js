const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

// GET /api/wo-days — admin only, with optional ?support_person_id= filter
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const supabase = getSupabase();
    let query = supabase
      .from('wo_days')
      .select(`*, support_persons ( id, name )`)
      .order('date', { ascending: true });

    if (req.query.support_person_id) {
      query = query.eq('support_person_id', req.query.support_person_id);
    }

    const { data, error } = await query;
    if (error) throw error;
    res.json(data);
  } catch (err) {
    next(err);
  }
});

// POST /api/wo-days — mark a WO day (admin only)
router.post('/', requireAuth, async (req, res, next) => {
  try {
    const supabase = getSupabase();
    const { support_person_id, date } = req.body;

    if (!support_person_id || !date) {
      return res.status(400).json({ error: 'support_person_id and date are required' });
    }

    const { data, error } = await supabase
      .from('wo_days')
      .insert({ support_person_id, date })
      .select(`*, support_persons ( id, name )`)
      .single();
    if (error) {
      if (error.code === '23505') {
        return res.status(409).json({ error: 'WO day already exists for this person and date' });
      }
      throw error;
    }
    res.status(201).json(data);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/wo-days/:id — remove a WO day (admin only)
router.delete('/:id', requireAuth, async (req, res, next) => {
  try {
    const supabase = getSupabase();
    const { id } = req.params;

    const { error } = await supabase
      .from('wo_days')
      .delete()
      .eq('id', id);
    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
