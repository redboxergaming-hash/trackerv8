import { supabase } from './supabaseClient.js';

function toCloudPerson(userId, person = {}) {
  return {
    user_id: userId,
    id: String(person.id || ''),
    name: String(person.name || '').trim(),
    kcal_goal: Number(person.kcalGoal || 0),
    macro_targets_json: {
      p: person?.macroTargets?.p ?? null,
      c: person?.macroTargets?.c ?? null,
      f: person?.macroTargets?.f ?? null
    },
    habit_targets_json: {
      waterGoalMl: Number.isFinite(Number(person?.waterGoalMl)) ? Number(person.waterGoalMl) : 2000,
      exerciseGoalMin: Number.isFinite(Number(person?.exerciseGoalMin)) ? Number(person.exerciseGoalMin) : 30
    }
  };
}

function fromCloudPerson(row = {}) {
  return {
    id: row.id,
    name: row.name,
    kcalGoal: Number(row.kcal_goal || 0),
    macroTargets: {
      p: row?.macro_targets_json?.p ?? null,
      c: row?.macro_targets_json?.c ?? null,
      f: row?.macro_targets_json?.f ?? null
    },
    waterGoalMl: Number(row?.habit_targets_json?.waterGoalMl || 2000),
    exerciseGoalMin: Number(row?.habit_targets_json?.exerciseGoalMin || 30)
  };
}

export async function upsertPerson(userId, person) {
  if (!supabase) return { data: null, error: new Error('Supabase is not configured.') };
  if (!userId) return { data: null, error: new Error('userId is required.') };

  const profileResult = await supabase.from('profiles').upsert({ user_id: userId }, { onConflict: 'user_id' });
  if (profileResult.error) return { data: null, error: profileResult.error };

  const payload = toCloudPerson(userId, person);
  const { data, error } = await supabase
    .from('persons')
    .upsert(payload, { onConflict: 'user_id,id' })
    .select('*')
    .single();

  return { data: data ? fromCloudPerson(data) : null, error: error || null };
}

export async function listPersons(userId) {
  if (!supabase) return { data: [], error: new Error('Supabase is not configured.') };
  if (!userId) return { data: [], error: new Error('userId is required.') };

  const { data, error } = await supabase
    .from('persons')
    .select('*')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false });

  return { data: (data || []).map(fromCloudPerson), error: error || null };
}

export async function deletePerson(userId, personId) {
  if (!supabase) return { error: new Error('Supabase is not configured.') };
  if (!userId) return { error: new Error('userId is required.') };
  if (!personId) return { error: new Error('personId is required.') };

  const { error } = await supabase
    .from('persons')
    .delete()
    .eq('user_id', userId)
    .eq('id', String(personId));

  return { error: error || null };
}



function toCloudEntry(userId, entry = {}) {
  return {
    user_id: userId,
    id: String(entry.id || ''),
    person_id: String(entry.personId || ''),
    date: String(entry.date || ''),
    time: String(entry.time || ''),
    payload_json: { ...entry }
  };
}

function fromCloudEntry(row = {}) {
  const payload = row.payload_json || {};
  return {
    ...payload,
    id: row.id,
    personId: row.person_id,
    date: row.date,
    time: row.time,
    updatedAt: row.updated_at ? new Date(row.updated_at).getTime() : (payload.updatedAt || null)
  };
}

export async function upsertEntry(userId, entry) {
  if (!supabase) return { data: null, error: new Error('Supabase is not configured.') };
  if (!userId) return { data: null, error: new Error('userId is required.') };

  const payload = toCloudEntry(userId, entry);
  const { data, error } = await supabase
    .from('entries')
    .upsert(payload, { onConflict: 'user_id,id' })
    .select('*')
    .single();

  return { data: data ? fromCloudEntry(data) : null, error: error || null };
}

export async function listEntries(userId, options = {}) {
  if (!supabase) return { data: [], error: new Error('Supabase is not configured.') };
  if (!userId) return { data: [], error: new Error('userId is required.') };

  const personId = options.personId ? String(options.personId) : null;
  const startDate = options.startDate ? String(options.startDate) : null;
  const endDate = options.endDate ? String(options.endDate) : null;

  let q = supabase
    .from('entries')
    .select('*')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false });

  if (personId) q = q.eq('person_id', personId);
  if (startDate) q = q.gte('date', startDate);
  if (endDate) q = q.lte('date', endDate);

  const { data, error } = await q.limit(Number(options.limit) || 500);
  return { data: (data || []).map(fromCloudEntry), error: error || null };
}

export async function deleteEntry(userId, entryId) {
  if (!supabase) return { error: new Error('Supabase is not configured.') };
  if (!userId) return { error: new Error('userId is required.') };
  if (!entryId) return { error: new Error('entryId is required.') };

  const { error } = await supabase
    .from('entries')
    .delete()
    .eq('user_id', userId)
    .eq('id', String(entryId));

  return { error: error || null };
}
