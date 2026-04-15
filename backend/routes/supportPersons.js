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

// GET /api/support-persons — public (used by slot logic display)
router.get('/', async (req, res, next) => {
  try {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('support_persons')
      .select('id, name, work_start, work_end, is_active')
      .order('name');
    if (error) throw error;
    res.json(data);
  } catch (err) {
    next(err);
  }
});

// POST /api/support-persons — admin only
router.post('/', requireAuth, async (req, res, next) => {
  try {
    const supabase = getSupabase();
    const { name, email, work_start, work_end, lunch_start, lunch_end, tea_start, tea_end } = req.body;

    if (!name || !email || !work_start || !work_end) {
      return res.status(400).json({ error: 'name, email, work_start, work_end are required' });
    }

    const { data, error } = await supabase
      .from('support_persons')
      .insert({ name, email, work_start, work_end, lunch_start, lunch_end, tea_start, tea_end, is_active: true })
      .select()
      .single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (err) {
    next(err);
  }
});

// PUT /api/support-persons/:id — admin only
router.put('/:id', requireAuth, async (req, res, next) => {
  try {
    const supabase = getSupabase();
    const { id } = req.params;
    const { name, email, work_start, work_end, lunch_start, lunch_end, tea_start, tea_end, is_active } = req.body;

    const { data, error } = await supabase
      .from('support_persons')
      .update({ name, email, work_start, work_end, lunch_start, lunch_end, tea_start, tea_end, is_active })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Support person not found' });
    res.json(data);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/support-persons/:id — admin only
router.delete('/:id', requireAuth, async (req, res, next) => {
  try {
    const supabase = getSupabase();
    const { id } = req.params;

    const { error } = await supabase
      .from('support_persons')
      .delete()
      .eq('id', id);
    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
