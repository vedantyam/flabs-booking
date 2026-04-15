const { createClient } = require('@supabase/supabase-js');

// Pick the free person with the fewest total bookings (round-robin fairness)
async function pickAssignee(freePersons, supabase) {
  if (!freePersons || freePersons.length === 0) return null;
  if (freePersons.length === 1) return freePersons[0];

  // Count total bookings per person
  const counts = await Promise.all(
    freePersons.map(async (person) => {
      const { count, error } = await supabase
        .from('bookings')
        .select('id', { count: 'exact', head: true })
        .eq('support_person_id', person.id);
      return { person, count: error ? 0 : (count || 0) };
    })
  );

  // Pick the person with fewest bookings
  counts.sort((a, b) => a.count - b.count);
  return counts[0].person;
}

module.exports = { pickAssignee };
