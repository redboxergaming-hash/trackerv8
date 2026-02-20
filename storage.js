const DB_NAME = 'macroTrackerDB';
const DB_VERSION = 8;

function promisify(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function txDone(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

function ensureStore(db, storeName, options) {
  if (!db.objectStoreNames.contains(storeName)) {
    return db.createObjectStore(storeName, options);
  }
  return null;
}

function ensureIndex(store, indexName, keyPath, options) {
  if (!store.indexNames.contains(indexName)) {
    store.createIndex(indexName, keyPath, options);
  }
}


function validatePositiveNumber(value, fieldName) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error(`${fieldName} must be a positive number`);
  }
  return n;
}

async function ensurePersonExists(personId) {
  if (!personId) throw new Error('personId is required');
  const db = await openDb();
  const tx = db.transaction('persons', 'readonly');
  const person = await promisify(tx.objectStore('persons').get(personId));
  if (!person) throw new Error('person not found');
}

function createId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

function toFiniteNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeMealTemplateItem(item) {
  const gramsDefault = toFiniteNumber(item?.gramsDefault, NaN);
  const per100g = {
    kcal: toFiniteNumber(item?.per100g?.kcal, NaN),
    protein: toFiniteNumber(item?.per100g?.protein, NaN),
    carbs: toFiniteNumber(item?.per100g?.carbs, NaN),
    fat: toFiniteNumber(item?.per100g?.fat, NaN)
  };

  const hasInvalidMacros = Object.values(per100g).some((value) => !Number.isFinite(value) || value < 0);
  if (!item?.foodKey || !item?.label || !Number.isFinite(gramsDefault) || gramsDefault <= 0 || hasInvalidMacros) {
    return null;
  }

  return {
    foodKey: String(item.foodKey),
    label: String(item.label),
    per100g,
    gramsDefault
  };
}

function normalizeRecipeItem(item) {
  const grams = toFiniteNumber(item?.grams, NaN);
  const per100g = {
    kcal: toFiniteNumber(item?.per100g?.kcal, NaN),
    protein: toFiniteNumber(item?.per100g?.protein, NaN),
    carbs: toFiniteNumber(item?.per100g?.carbs, NaN),
    fat: toFiniteNumber(item?.per100g?.fat, NaN)
  };
  const hasInvalidMacros = Object.values(per100g).some((value) => !Number.isFinite(value) || value < 0);
  if (!item?.foodKey || !item?.label || !Number.isFinite(grams) || grams <= 0 || hasInvalidMacros) {
    return null;
  }
  return {
    foodKey: String(item.foodKey),
    label: String(item.label),
    per100g,
    grams
  };
}

function computeRecipeDerived(items, servingsDefault) {
  const safeServings = Number.isFinite(Number(servingsDefault)) && Number(servingsDefault) > 0 ? Number(servingsDefault) : 1;
  const total = { kcal: 0, protein: 0, carbs: 0, fat: 0 };
  let totalGrams = 0;
  (items || []).forEach((item) => {
    const grams = Number(item?.grams || 0);
    if (!Number.isFinite(grams) || grams <= 0) return;
    totalGrams += grams;
    total.kcal += (Number(item?.per100g?.kcal || 0) * grams) / 100;
    total.protein += (Number(item?.per100g?.protein || 0) * grams) / 100;
    total.carbs += (Number(item?.per100g?.carbs || 0) * grams) / 100;
    total.fat += (Number(item?.per100g?.fat || 0) * grams) / 100;
  });
  const round = (v) => Math.round(v * 10) / 10;
  const per100gFactor = totalGrams > 0 ? 100 / totalGrams : 0;
  return {
    totalGrams: round(totalGrams),
    total: { kcal: round(total.kcal), protein: round(total.protein), carbs: round(total.carbs), fat: round(total.fat) },
    per100g: {
      kcal: round(total.kcal * per100gFactor),
      protein: round(total.protein * per100gFactor),
      carbs: round(total.carbs * per100gFactor),
      fat: round(total.fat * per100gFactor)
    },
    perServing: {
      kcal: round(total.kcal / safeServings),
      protein: round(total.protein / safeServings),
      carbs: round(total.carbs / safeServings),
      fat: round(total.fat / safeServings)
    }
  };
}

function scalePer100g(per100g, grams) {
  const ratio = toFiniteNumber(grams) / 100;
  return {
    kcal: Math.round(toFiniteNumber(per100g?.kcal) * ratio * 10) / 10,
    p: Math.round(toFiniteNumber(per100g?.protein) * ratio * 10) / 10,
    c: Math.round(toFiniteNumber(per100g?.carbs) * ratio * 10) / 10,
    f: Math.round(toFiniteNumber(per100g?.fat) * ratio * 10) / 10
  };
}

function upsertRecentInTx(tx, payload) {
  const recentsStore = tx.objectStore('recents');
  const byPersonFood = recentsStore.index('byPersonFood');
  const key = [payload.personId, payload.foodId];
  const existingReq = byPersonFood.get(key);
  existingReq.onsuccess = () => {
    const existing = existingReq.result;
    if (existing?.id) {
      recentsStore.delete(existing.id);
    }
    recentsStore.put({
      id: createId(),
      personId: payload.personId,
      foodId: payload.foodId,
      label: payload.label,
      nutrition: payload.nutrition,
      pieceGramHint: payload.pieceGramHint ?? null,
      imageThumbUrl: payload.imageThumbUrl || null,
      sourceType: payload.sourceType,
      usedAt: Date.now()
    });
  };
}


function isoToDayIndex(isoDate) {
  const ms = Date.parse(`${isoDate}T00:00:00Z`);
  if (!Number.isFinite(ms)) return null;
  return Math.floor(ms / 86400000);
}

function computeTrendForDate(targetDate, sortedLogs) {
  const targetDay = isoToDayIndex(targetDate);
  if (targetDay === null) return null;

  const startDay = targetDay - 6;
  const inWindow = sortedLogs.filter((item) => {
    const day = isoToDayIndex(item.date);
    if (day === null) return false;
    return day >= startDay && day <= targetDay;
  });

  if (!inWindow.length) return null;
  const total = inWindow.reduce((acc, item) => acc + Number(item.scaleWeight || 0), 0);
  const avg = total / inWindow.length;
  return Number.isFinite(avg) ? Math.round(avg * 1000) / 1000 : null;
}

async function recomputeTrendWeightsForPerson(tx, personId) {
  const store = tx.objectStore('weightLogs');
  const index = store.index('byPerson');
  const rows = await promisify(index.getAll(IDBKeyRange.only(personId)));
  const sorted = rows
    .filter((item) => item && typeof item.date === 'string')
    .sort((a, b) => a.date.localeCompare(b.date));

  sorted.forEach((item) => {
    const trendWeight = computeTrendForDate(item.date, sorted);
    if (item.trendWeight !== trendWeight) {
      store.put({ ...item, trendWeight });
    }
  });
}

export function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (event) => {
      const db = req.result;
      const tx = req.transaction;
      const oldVersion = event.oldVersion;

      let persons = ensureStore(db, 'persons', { keyPath: 'id' });
      let entries = ensureStore(db, 'entries', { keyPath: 'id' });
      ensureStore(db, 'productsCache', { keyPath: 'barcode' });
      let favorites = ensureStore(db, 'favorites', { keyPath: 'id' });
      let recents = ensureStore(db, 'recents', { keyPath: 'id' });
      let weightLogs = ensureStore(db, 'weightLogs', { keyPath: 'id', autoIncrement: true });
      let mealTemplates = ensureStore(db, 'mealTemplates', { keyPath: 'id' });
      let recipes = ensureStore(db, 'recipes', { keyPath: 'id' });
      let goalPeriods = ensureStore(db, 'goalPeriods', { keyPath: 'id' });
      let waterLogs = ensureStore(db, 'waterLogs', { keyPath: 'id' });
      let exerciseLogs = ensureStore(db, 'exerciseLogs', { keyPath: 'id' });
      let fastingLogs = ensureStore(db, 'fastingLogs', { keyPath: 'id' });
      ensureStore(db, 'meta', { keyPath: 'key' });

      if (!persons) persons = tx.objectStore('persons');
      if (!entries) entries = tx.objectStore('entries');
      if (!favorites) favorites = tx.objectStore('favorites');
      if (!recents) recents = tx.objectStore('recents');
      if (!weightLogs) weightLogs = tx.objectStore('weightLogs');
      if (!mealTemplates) mealTemplates = tx.objectStore('mealTemplates');
      if (!recipes) recipes = tx.objectStore('recipes');
      if (!goalPeriods) goalPeriods = tx.objectStore('goalPeriods');
      if (!waterLogs) waterLogs = tx.objectStore('waterLogs');
      if (!exerciseLogs) exerciseLogs = tx.objectStore('exerciseLogs');
      if (!fastingLogs) fastingLogs = tx.objectStore('fastingLogs');

      ensureIndex(entries, 'byPersonDate', ['personId', 'date']);
      ensureIndex(entries, 'byPersonDateTime', ['personId', 'date', 'time']);
      ensureIndex(entries, 'byPerson', 'personId');

      ensureIndex(favorites, 'byPerson', 'personId');
      ensureIndex(favorites, 'byPersonLabel', ['personId', 'label']);

      ensureIndex(recents, 'byPersonUsedAt', ['personId', 'usedAt']);
      ensureIndex(recents, 'byPersonFood', ['personId', 'foodId']);

      ensureIndex(weightLogs, 'byPersonDate', ['personId', 'date'], { unique: true });
      ensureIndex(weightLogs, 'byPerson', 'personId');
      ensureIndex(weightLogs, 'byDate', 'date');
      ensureIndex(mealTemplates, 'byUpdatedAt', 'updatedAt');
      ensureIndex(recipes, 'byUpdatedAt', 'updatedAt');
      ensureIndex(goalPeriods, 'byPersonDateRange', ['personId', 'startDate', 'endDate']);
      ensureIndex(goalPeriods, 'byPersonUpdatedAt', ['personId', 'updatedAt']);
      ensureIndex(waterLogs, 'byPersonDate', ['personId', 'date']);
      ensureIndex(exerciseLogs, 'byPersonDate', ['personId', 'date']);
      ensureIndex(fastingLogs, 'byPersonStartAt', ['personId', 'startAt']);
      ensureIndex(fastingLogs, 'byPersonDateKey', ['personId', 'dateKey']);

      if (oldVersion < 2) {
        const cursorReq = persons.openCursor();
        cursorReq.onsuccess = () => {
          const cursor = cursorReq.result;
          if (!cursor) return;
          const value = cursor.value;
          if (!value.macroTargets || typeof value.macroTargets !== 'object') {
            value.macroTargets = { p: null, c: null, f: null };
            cursor.update(value);
          }
          cursor.continue();
        };
      }

      if (oldVersion < 6) {
        const cursorReq = persons.openCursor();
        cursorReq.onsuccess = () => {
          const cursor = cursorReq.result;
          if (!cursor) return;
          const value = cursor.value;
          let changed = false;
          if (!Number.isFinite(Number(value.waterGoalMl)) || Number(value.waterGoalMl) <= 0) {
            value.waterGoalMl = 2000;
            changed = true;
          }
          if (!Number.isFinite(Number(value.exerciseGoalMin)) || Number(value.exerciseGoalMin) <= 0) {
            value.exerciseGoalMin = 30;
            changed = true;
          }
          if (changed) cursor.update(value);
          cursor.continue();
        };
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function seedSampleData() {
  const db = await openDb();
  const tx = db.transaction(['persons', 'entries', 'meta', 'favorites', 'recents', 'weightLogs', 'waterLogs', 'exerciseLogs', 'fastingLogs', 'recipes', 'goalPeriods'], 'readwrite');
  tx.objectStore('persons').clear();
  tx.objectStore('entries').clear();
  tx.objectStore('favorites').clear();
  tx.objectStore('recents').clear();
  tx.objectStore('weightLogs').clear();
  tx.objectStore('waterLogs').clear();
  tx.objectStore('exerciseLogs').clear();
  tx.objectStore('fastingLogs').clear();
  tx.objectStore('recipes').clear();
  tx.objectStore('goalPeriods').clear();

  const persons = [
    { id: crypto.randomUUID(), name: 'Alex', kcalGoal: 2200, macroTargets: { p: 160, c: 240, f: 70 }, waterGoalMl: 2000, exerciseGoalMin: 30 },
    { id: crypto.randomUUID(), name: 'Sam', kcalGoal: 1800, macroTargets: { p: 120, c: 190, f: 60 }, waterGoalMl: 2000, exerciseGoalMin: 30 }
  ];
  persons.forEach((p) => tx.objectStore('persons').put(p));

  const today = new Date().toISOString().slice(0, 10);
  const sample = [
    {
      id: crypto.randomUUID(),
      personId: persons[0].id,
      date: today,
      time: '08:15',
      foodId: 'gf_oats',
      foodName: 'Oats (dry)',
      amountGrams: 60,
      kcal: 233,
      p: 10,
      c: 40,
      f: 4,
      source: 'Manual (Generic built-in)'
    },
    {
      id: crypto.randomUUID(),
      personId: persons[1].id,
      date: today,
      time: '12:30',
      foodId: 'custom_chicken',
      foodName: 'Chicken breast (cooked)',
      amountGrams: 150,
      kcal: 248,
      p: 46,
      c: 0,
      f: 5,
      source: 'Manual (Custom)'
    }
  ];
  sample.forEach((e) => tx.objectStore('entries').put(e));
  tx.objectStore('meta').put({ key: 'sampleSeededAt', value: new Date().toISOString() });

  await txDone(tx);
  return { persons, sample };
}

export async function getPersons() {
  const db = await openDb();
  const tx = db.transaction('persons', 'readonly');
  return promisify(tx.objectStore('persons').getAll());
}

export async function upsertPerson(person) {
  const db = await openDb();
  const tx = db.transaction('persons', 'readwrite');
  const row = {
    ...person,
    waterGoalMl: Number.isFinite(Number(person?.waterGoalMl)) && Number(person.waterGoalMl) > 0 ? Number(person.waterGoalMl) : 2000,
    exerciseGoalMin:
      Number.isFinite(Number(person?.exerciseGoalMin)) && Number(person.exerciseGoalMin) > 0 ? Number(person.exerciseGoalMin) : 30
  };
  tx.objectStore('persons').put(row);
  await txDone(tx);
  return row;
}

export async function deletePersonCascade(personId) {
  const db = await openDb();
  const tx = db.transaction(['persons', 'entries', 'favorites', 'recents', 'weightLogs', 'waterLogs', 'exerciseLogs', 'fastingLogs', 'goalPeriods', 'meta'], 'readwrite');
  tx.objectStore('persons').delete(personId);

  const deleteByIndex = (storeName, indexName, keyRange) => {
    const index = tx.objectStore(storeName).index(indexName);
    const req = index.openCursor(keyRange);
    req.onsuccess = () => {
      const cursor = req.result;
      if (!cursor) return;
      cursor.delete();
      cursor.continue();
    };
  };

  deleteByIndex('entries', 'byPerson', IDBKeyRange.only(personId));
  deleteByIndex('favorites', 'byPerson', IDBKeyRange.only(personId));
  deleteByIndex('recents', 'byPersonUsedAt', IDBKeyRange.bound([personId, 0], [personId, Number.MAX_SAFE_INTEGER]));
  deleteByIndex('weightLogs', 'byPerson', IDBKeyRange.only(personId));
  deleteByIndex('waterLogs', 'byPersonDate', IDBKeyRange.bound([personId, ''], [personId, '\uffff']));
  deleteByIndex('exerciseLogs', 'byPersonDate', IDBKeyRange.bound([personId, ''], [personId, '\uffff']));
  deleteByIndex('fastingLogs', 'byPersonStartAt', IDBKeyRange.bound([personId, 0], [personId, Number.MAX_SAFE_INTEGER]));
  deleteByIndex('goalPeriods', 'byPersonUpdatedAt', IDBKeyRange.bound([personId, 0], [personId, Number.MAX_SAFE_INTEGER]));
  tx.objectStore('meta').delete(`dashboardLayout:${personId}`);

  await txDone(tx);
}

export async function addWeightLog(personId, date, scaleWeight) {
  if (!personId) throw new Error('personId is required');
  if (!date) throw new Error('date is required');

  const parsedWeight = Number(scaleWeight);
  if (!Number.isFinite(parsedWeight) || parsedWeight <= 0) {
    throw new Error('scaleWeight must be a positive number');
  }

  const db = await openDb();
  const tx = db.transaction('weightLogs', 'readwrite');
  const store = tx.objectStore('weightLogs');
  const byPersonDate = store.index('byPersonDate');
  const existing = await promisify(byPersonDate.get([personId, date]));

  const row = {
    personId,
    date,
    scaleWeight: parsedWeight,
    trendWeight: null
  };
  if (existing?.id != null) row.id = existing.id;

  const id = await promisify(store.put(row));
  await recomputeTrendWeightsForPerson(tx, personId);
  await txDone(tx);

  const readTx = db.transaction('weightLogs', 'readonly');
  const saved = await promisify(readTx.objectStore('weightLogs').get(id));
  return saved || { ...row, id };
}

export async function getWeightLogsByPerson(personId) {
  if (!personId) return [];

  const db = await openDb();
  const tx = db.transaction('weightLogs', 'readonly');
  const index = tx.objectStore('weightLogs').index('byPerson');
  const rows = await promisify(index.getAll(IDBKeyRange.only(personId)));
  return rows.sort((a, b) => b.date.localeCompare(a.date));
}

export async function getWeightLogsInRange(personId, startDate, endDate) {
  if (!personId || !startDate || !endDate) return [];

  const db = await openDb();
  const tx = db.transaction('weightLogs', 'readonly');
  const index = tx.objectStore('weightLogs').index('byPersonDate');
  const range = IDBKeyRange.bound([personId, startDate], [personId, endDate]);
  const rows = await promisify(index.getAll(range));
  return rows.sort((a, b) => a.date.localeCompare(b.date));
}

export async function getEntriesForPersonDate(personId, date) {
  const db = await openDb();
  const tx = db.transaction('entries', 'readonly');
  const idx = tx.objectStore('entries').index('byPersonDate');
  return promisify(idx.getAll([personId, date]));
}

let onEntrySavedHook = null;
let onProductCacheSavedHook = null;

export function setOnEntrySavedHook(handler) {
  onEntrySavedHook = typeof handler === 'function' ? handler : null;
}

export function setOnProductCacheSavedHook(handler) {
  onProductCacheSavedHook = typeof handler === 'function' ? handler : null;
}

export async function getLoggedDatesByPerson(personId) {
  if (!personId) return [];
  const db = await openDb();
  const tx = db.transaction('entries', 'readonly');
  const idx = tx.objectStore('entries').index('byPerson');
  const rows = await promisify(idx.getAll(IDBKeyRange.only(personId)));
  const uniqueDates = new Set(rows.map((row) => row?.date).filter((date) => typeof date === 'string'));
  return [...uniqueDates].sort((a, b) => b.localeCompare(a));
}

export async function addEntry(entry, options = {}) {
  const numericFields = ['amountGrams', 'kcal', 'p', 'c', 'f'];
  const cleaned = { ...entry };
  for (const field of numericFields) {
    const value = Number(cleaned[field]);
    if (!Number.isFinite(value) || value < 0) {
      throw new Error(`${field} must be a non-negative number`);
    }
    cleaned[field] = value;
  }

  const db = await openDb();
  const tx = db.transaction(['entries', 'recents', 'meta'], 'readwrite');
  const stored = {
    ...cleaned,
    id: entry.id || crypto.randomUUID(),
    createdAt: entry.createdAt || Date.now(),
    updatedAt: entry.updatedAt || Date.now()
  };
  tx.objectStore('entries').put(stored);

  if (cleaned.recentItem) {
    upsertRecentInTx(tx, {
      personId: cleaned.personId,
      foodId: cleaned.recentItem.foodId,
      label: cleaned.recentItem.label,
      nutrition: cleaned.recentItem.nutrition,
      pieceGramHint: cleaned.recentItem.pieceGramHint,
      imageThumbUrl: cleaned.recentItem.imageThumbUrl || null,
      sourceType: cleaned.recentItem.sourceType
    });
  }

  if (cleaned.lastPortionKey) {
    tx.objectStore('meta').put({ key: `lastPortion:${cleaned.lastPortionKey}`, value: Number(cleaned.amountGrams) });
  }

  await txDone(tx);
  if (!options.skipHook && onEntrySavedHook) {
    try {
      await onEntrySavedHook(stored);
    } catch (error) {
      console.error('ENTRY_HOOK: onEntrySavedHook failed', error);
    }
  }
  return stored;
}


export async function getEntryById(entryId) {
  if (!entryId) return null;
  const db = await openDb();
  const tx = db.transaction('entries', 'readonly');
  return promisify(tx.objectStore('entries').get(entryId));
}

export async function getEntriesForPersonDateRange(personId, startDate, endDate) {
  if (!personId || !startDate || !endDate) return [];
  const db = await openDb();
  const tx = db.transaction('entries', 'readonly');
  const idx = tx.objectStore('entries').index('byPersonDate');
  const rows = await promisify(idx.getAll(IDBKeyRange.bound([personId, startDate], [personId, endDate])));
  return rows.sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));
}

export async function upsertEntryFromCloud(entry) {
  return addEntry(entry, { skipHook: true });
}

function normalizeGoalValue(value) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function normalizeWeekdayGoal(dayGoal = {}) {
  return {
    kcal: normalizeGoalValue(dayGoal.kcal),
    protein: normalizeGoalValue(dayGoal.protein),
    carbs: normalizeGoalValue(dayGoal.carbs),
    fat: normalizeGoalValue(dayGoal.fat)
  };
}

const WEEKDAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

function normalizeWeekdayGoals(weekdayGoals = {}) {
  const out = {};
  WEEKDAY_KEYS.forEach((key) => {
    out[key] = normalizeWeekdayGoal(weekdayGoals[key] || {});
  });
  return out;
}

function weekdayKeyFromIsoDate(isoDate) {
  const d = new Date(`${isoDate}T00:00:00`);
  if (!Number.isFinite(d.getTime())) return null;
  return WEEKDAY_KEYS[(d.getDay() + 6) % 7];
}

export async function getGoalPeriodsByPerson(personId) {
  if (!personId) return [];
  const db = await openDb();
  const tx = db.transaction('goalPeriods', 'readonly');
  const idx = tx.objectStore('goalPeriods').index('byPersonUpdatedAt');
  const rows = await promisify(idx.getAll(IDBKeyRange.bound([personId, 0], [personId, Number.MAX_SAFE_INTEGER])));
  return rows.sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0));
}

export async function upsertGoalPeriod(period) {
  if (!period?.personId) throw new Error('personId is required');
  const name = String(period?.name || '').trim();
  if (!name || name.length > 80) throw new Error('Goal period name must be 1-80 chars');
  const startDate = String(period?.startDate || '');
  const endDate = String(period?.endDate || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate) || startDate > endDate) {
    throw new Error('Invalid date range');
  }
  const weekdayGoals = normalizeWeekdayGoals(period.weekdayGoals || {});

  const db = await openDb();
  const tx = db.transaction('goalPeriods', 'readwrite');
  const store = tx.objectStore('goalPeriods');
  const existing = period?.id ? await promisify(store.get(period.id)) : null;
  const now = Date.now();
  const row = {
    id: period?.id || createId(),
    personId: period.personId,
    name,
    startDate,
    endDate,
    weekdayGoals,
    createdAt: Number(existing?.createdAt || period?.createdAt || now),
    updatedAt: now
  };
  store.put(row);
  await txDone(tx);
  return row;
}

export async function resolveGoalForPersonDate(person, date) {
  if (!person?.id || !date) return null;
  const periods = await getGoalPeriodsByPerson(person.id);
  const active = periods.find((p) => p.startDate <= date && p.endDate >= date);
  if (!active) return null;
  const dayKey = weekdayKeyFromIsoDate(date);
  const dayGoal = dayKey ? active.weekdayGoals?.[dayKey] : null;
  if (!dayGoal) return null;

  const kcal = Number(dayGoal.kcal);
  const protein = Number(dayGoal.protein);
  const carbs = Number(dayGoal.carbs);
  const fat = Number(dayGoal.fat);

  return {
    periodId: active.id,
    periodName: active.name,
    kcalGoal: Number.isFinite(kcal) && kcal > 0 ? kcal : Number(person.kcalGoal),
    macroTargets: {
      p: Number.isFinite(protein) ? protein : person?.macroTargets?.p ?? null,
      c: Number.isFinite(carbs) ? carbs : person?.macroTargets?.c ?? null,
      f: Number.isFinite(fat) ? fat : person?.macroTargets?.f ?? null
    }
  };
}

export async function addWaterLog({ personId, date, amountMl }) {
  if (!date) throw new Error('date is required');
  await ensurePersonExists(personId);
  const amount = validatePositiveNumber(amountMl, 'amountMl');

  const db = await openDb();
  const tx = db.transaction('waterLogs', 'readwrite');
  const row = {
    id: createId(),
    personId,
    date,
    amountMl: amount,
    createdAt: Date.now()
  };
  tx.objectStore('waterLogs').put(row);
  await txDone(tx);
  return row;
}

export async function addExerciseLog({ personId, date, minutes }) {
  if (!date) throw new Error('date is required');
  await ensurePersonExists(personId);
  const mins = validatePositiveNumber(minutes, 'minutes');

  const db = await openDb();
  const tx = db.transaction('exerciseLogs', 'readwrite');
  const row = {
    id: createId(),
    personId,
    date,
    minutes: mins,
    createdAt: Date.now()
  };
  tx.objectStore('exerciseLogs').put(row);
  await txDone(tx);
  return row;
}

async function getHabitTotal(storeName, fieldName, personId, date) {
  if (!personId || !date) return 0;
  const db = await openDb();
  const tx = db.transaction(storeName, 'readonly');
  const index = tx.objectStore(storeName).index('byPersonDate');
  const rows = await promisify(index.getAll([personId, date]));
  const total = rows.reduce((sum, item) => {
    const value = Number(item?.[fieldName]);
    return Number.isFinite(value) && value > 0 ? sum + value : sum;
  }, 0);
  return Math.round(total * 10) / 10;
}

export async function getWaterTotalForPersonDate(personId, date) {
  return getHabitTotal('waterLogs', 'amountMl', personId, date);
}

export async function getExerciseTotalForPersonDate(personId, date) {
  return getHabitTotal('exerciseLogs', 'minutes', personId, date);
}

function localDateKeyFromTs(timestamp) {
  const d = new Date(timestamp);
  if (!Number.isFinite(d.getTime())) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export async function startFasting(personId, startAt = Date.now()) {
  await ensurePersonExists(personId);
  const startedAt = Number(startAt);
  if (!Number.isFinite(startedAt) || startedAt <= 0) throw new Error('startAt must be a valid timestamp');

  const active = await getActiveFastForPerson(personId);
  if (active) throw new Error('active fast already exists');

  const dateKey = localDateKeyFromTs(startedAt);
  if (!dateKey) throw new Error('invalid startAt');

  const db = await openDb();
  const tx = db.transaction('fastingLogs', 'readwrite');
  const row = { id: createId(), personId, startAt: startedAt, endAt: null, dateKey };
  tx.objectStore('fastingLogs').put(row);
  await txDone(tx);
  return row;
}

export async function endActiveFast(personId, endAt = Date.now()) {
  await ensurePersonExists(personId);
  const endedAt = Number(endAt);
  if (!Number.isFinite(endedAt) || endedAt <= 0) throw new Error('endAt must be a valid timestamp');

  const active = await getActiveFastForPerson(personId);
  if (!active) throw new Error('no active fast');
  if (endedAt <= Number(active.startAt)) throw new Error('endAt must be after startAt');

  const db = await openDb();
  const tx = db.transaction('fastingLogs', 'readwrite');
  const store = tx.objectStore('fastingLogs');
  store.put({ ...active, endAt: endedAt });
  await txDone(tx);
  return { ...active, endAt: endedAt };
}

export async function getActiveFastForPerson(personId) {
  if (!personId) return null;
  const db = await openDb();
  const tx = db.transaction('fastingLogs', 'readonly');
  const index = tx.objectStore('fastingLogs').index('byPersonStartAt');
  const rows = await promisify(index.getAll(IDBKeyRange.bound([personId, 0], [personId, Number.MAX_SAFE_INTEGER])));
  const active = rows.filter((item) => item && item.endAt == null).sort((a, b) => Number(b.startAt || 0) - Number(a.startAt || 0));
  return active[0] || null;
}

export async function getLatestCompletedFastForPerson(personId) {
  if (!personId) return null;
  const db = await openDb();
  const tx = db.transaction('fastingLogs', 'readonly');
  const index = tx.objectStore('fastingLogs').index('byPersonStartAt');
  const rows = await promisify(index.getAll(IDBKeyRange.bound([personId, 0], [personId, Number.MAX_SAFE_INTEGER])));
  const completed = rows
    .filter((item) => item && Number.isFinite(Number(item.startAt)) && Number.isFinite(Number(item.endAt)) && Number(item.endAt) > Number(item.startAt))
    .sort((a, b) => Number(b.endAt || 0) - Number(a.endAt || 0));
  return completed[0] || null;
}

export async function getCompletedFastStreakDays(personId) {
  if (!personId) return 0;
  const db = await openDb();
  const tx = db.transaction('fastingLogs', 'readonly');
  const index = tx.objectStore('fastingLogs').index('byPersonDateKey');
  const rows = await promisify(index.getAll(IDBKeyRange.bound([personId, ''], [personId, '\uffff'])));
  const completedDateKeys = [...new Set(
    rows
      .filter((item) => Number.isFinite(Number(item?.startAt)) && Number.isFinite(Number(item?.endAt)) && Number(item.endAt) > Number(item.startAt))
      .map((item) => item.dateKey)
      .filter((v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v))
  )].sort((a, b) => b.localeCompare(a));

  if (!completedDateKeys.length) return 0;
  let streak = 1;
  for (let i = 1; i < completedDateKeys.length; i += 1) {
    const prev = new Date(`${completedDateKeys[i - 1]}T00:00:00`);
    const curr = new Date(`${completedDateKeys[i]}T00:00:00`);
    const diffDays = Math.round((prev.getTime() - curr.getTime()) / 86400000);
    if (diffDays !== 1) break;
    streak += 1;
  }
  return streak;
}

export async function getMealTemplates() {
  const db = await openDb();
  const tx = db.transaction('mealTemplates', 'readonly');
  const store = tx.objectStore('mealTemplates');
  const hasUpdatedAtIndex = store.indexNames.contains('byUpdatedAt');
  if (hasUpdatedAtIndex) {
    const rows = await promisify(store.index('byUpdatedAt').getAll());
    return rows.sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0));
  }
  const rows = await promisify(store.getAll());
  return rows.sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0));
}

export async function getMealTemplate(id) {
  if (!id) return null;
  const db = await openDb();
  const tx = db.transaction('mealTemplates', 'readonly');
  return promisify(tx.objectStore('mealTemplates').get(id));
}

export async function upsertMealTemplate(template) {
  const name = String(template?.name || '').trim();
  if (!name || name.length > 40) throw new Error('Template name must be 1-40 characters');

  const normalizedItems = (template?.items || []).map(normalizeMealTemplateItem).filter(Boolean);
  if (!normalizedItems.length) throw new Error('Template must contain at least one valid item');

  const db = await openDb();
  const tx = db.transaction('mealTemplates', 'readwrite');
  const store = tx.objectStore('mealTemplates');

  const id = template?.id || createId();
  const existing = template?.id ? await promisify(store.get(template.id)) : null;
  const now = Date.now();

  const row = {
    id,
    name,
    createdAt: Number(existing?.createdAt || template?.createdAt || now),
    updatedAt: now,
    items: normalizedItems
  };

  store.put(row);
  await txDone(tx);
  return row;
}

export async function deleteMealTemplate(id) {
  if (!id) return;
  const db = await openDb();
  const tx = db.transaction('mealTemplates', 'readwrite');
  tx.objectStore('mealTemplates').delete(id);
  await txDone(tx);
}

export async function getRecipes() {
  const db = await openDb();
  const tx = db.transaction('recipes', 'readonly');
  const store = tx.objectStore('recipes');
  const hasUpdatedAtIndex = store.indexNames.contains('byUpdatedAt');
  const rows = hasUpdatedAtIndex ? await promisify(store.index('byUpdatedAt').getAll()) : await promisify(store.getAll());
  return rows.sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0));
}

export async function getRecipe(id) {
  if (!id) return null;
  const db = await openDb();
  const tx = db.transaction('recipes', 'readonly');
  return promisify(tx.objectStore('recipes').get(id));
}

export async function upsertRecipe(recipe) {
  const name = String(recipe?.name || '').trim();
  if (!name || name.length > 60) throw new Error('Recipe name must be 1-60 characters');
  const servingsDefault = Number(recipe?.servingsDefault);
  if (!Number.isFinite(servingsDefault) || servingsDefault <= 0) throw new Error('Servings must be positive');

  const normalizedItems = (recipe?.items || []).map(normalizeRecipeItem).filter(Boolean);
  if (!normalizedItems.length) throw new Error('Recipe must contain at least one valid item');

  const derived = computeRecipeDerived(normalizedItems, servingsDefault);
  if (!Number.isFinite(derived.totalGrams) || derived.totalGrams <= 0) throw new Error('Recipe total grams must be positive');

  const db = await openDb();
  const tx = db.transaction('recipes', 'readwrite');
  const store = tx.objectStore('recipes');
  const id = recipe?.id || createId();
  const existing = recipe?.id ? await promisify(store.get(recipe.id)) : null;
  const now = Date.now();
  const row = {
    id,
    name,
    createdAt: Number(existing?.createdAt || recipe?.createdAt || now),
    updatedAt: now,
    servingsDefault,
    items: normalizedItems,
    derived
  };
  store.put(row);
  await txDone(tx);
  return row;
}

export async function logRecipe({ personId, date, time, recipeId, servings = 1 }) {
  if (!personId) throw new Error('personId is required');
  if (!date) throw new Error('date is required');
  if (!recipeId) throw new Error('recipeId is required');
  const servingsNum = Number(servings);
  if (!Number.isFinite(servingsNum) || servingsNum <= 0) throw new Error('servings must be positive');

  const recipe = await getRecipe(recipeId);
  if (!recipe) throw new Error('Recipe not found');
  const ratio = servingsNum / Number(recipe.servingsDefault || 1);
  const round = (v) => Math.round(Number(v || 0) * ratio * 10) / 10;

  const grams = Math.round(Number(recipe.derived?.totalGrams || 0) * ratio * 10) / 10;
  const entry = {
    id: createId(),
    personId,
    date,
    time: String(time || new Date().toTimeString().slice(0, 5)),
    foodId: `recipe:${recipe.id}`,
    foodName: recipe.name,
    amountGrams: grams,
    kcal: round(recipe.derived?.total?.kcal),
    p: round(recipe.derived?.total?.protein),
    c: round(recipe.derived?.total?.carbs),
    f: round(recipe.derived?.total?.fat),
    source: `Recipe · ${recipe.name}`,
    createdAt: Date.now(),
    recentItem: {
      foodId: `recipe:${recipe.id}`,
      label: recipe.name,
      nutrition: {
        kcal100g: Number(recipe.derived?.per100g?.kcal || 0),
        p100g: Number(recipe.derived?.per100g?.protein || 0),
        c100g: Number(recipe.derived?.per100g?.carbs || 0),
        f100g: Number(recipe.derived?.per100g?.fat || 0)
      },
      pieceGramHint: null,
      sourceType: 'recipe'
    }
  };

  return addEntry(entry);
}

export async function logMealTemplate({ personId, date, time, templateId }) {
  if (!personId) throw new Error('personId is required');
  if (!date) throw new Error('date is required');
  if (!templateId) throw new Error('templateId is required');

  const template = await getMealTemplate(templateId);
  if (!template) throw new Error('Meal template not found');

  const items = (template.items || []).map(normalizeMealTemplateItem).filter(Boolean);
  if (!items.length) throw new Error('Meal template has no valid items');

  const db = await openDb();
  const tx = db.transaction(['entries', 'recents', 'meta'], 'readwrite');
  const entriesStore = tx.objectStore('entries');
  const metaStore = tx.objectStore('meta');

  const usedTime = String(time || new Date().toTimeString().slice(0, 5));
  let totalKcal = 0;

  items.forEach((item) => {
    const grams = toFiniteNumber(item.gramsDefault, 0);
    if (!Number.isFinite(grams) || grams <= 0) return;

    const macros = scalePer100g(item.per100g, grams);
    totalKcal += macros.kcal;

    const foodId = item.foodKey;
    const sourceType = 'meal-template';

    entriesStore.put({
      id: createId(),
      personId,
      date,
      time: usedTime,
      foodId,
      foodName: item.label,
      amountGrams: grams,
      kcal: macros.kcal,
      p: macros.p,
      c: macros.c,
      f: macros.f,
      source: `Meal Template · ${template.name}`,
      createdAt: Date.now()
    });

    upsertRecentInTx(tx, {
      personId,
      foodId,
      label: item.label,
      nutrition: {
        kcal100g: item.per100g.kcal,
        p100g: item.per100g.protein,
        c100g: item.per100g.carbs,
        f100g: item.per100g.fat
      },
      pieceGramHint: null,
      sourceType
    });

    metaStore.put({ key: `lastPortion:${personId}:${foodId}`, value: grams });
  });

  await txDone(tx);
  return { count: items.length, totalKcal: Math.round(totalKcal * 10) / 10 };
}

function sanitizeWeightLog(item) {
  if (!item || !item.personId || !item.date) return null;
  const scaleWeight = Number(item.scaleWeight);
  if (!Number.isFinite(scaleWeight) || scaleWeight <= 0) return null;
  const trendWeight = Number(item.trendWeight);
  return {
    id: item.id,
    personId: item.personId,
    date: item.date,
    scaleWeight,
    trendWeight: Number.isFinite(trendWeight) ? trendWeight : null
  };
}

export async function getFavorites(personId) {
  const db = await openDb();
  const tx = db.transaction('favorites', 'readonly');
  const idx = tx.objectStore('favorites').index('byPerson');
  return promisify(idx.getAll(personId));
}

export async function isFavorite(personId, foodId) {
  const db = await openDb();
  const tx = db.transaction('favorites', 'readonly');
  const item = await promisify(tx.objectStore('favorites').get(`${personId}:${foodId}`));
  return Boolean(item);
}

export async function toggleFavorite(personId, favoriteItem) {
  const db = await openDb();
  const tx = db.transaction('favorites', 'readwrite');
  const store = tx.objectStore('favorites');
  const id = `${personId}:${favoriteItem.foodId}`;
  const existing = await promisify(store.get(id));
  if (existing) {
    store.delete(id);
  } else {
    store.put({
      id,
      personId,
      foodId: favoriteItem.foodId,
      label: favoriteItem.label,
      nutrition: favoriteItem.nutrition,
      sourceType: favoriteItem.sourceType,
      pieceGramHint: favoriteItem.pieceGramHint ?? null,
      imageThumbUrl: favoriteItem.imageThumbUrl || null,
      createdAt: Date.now()
    });
  }
  await txDone(tx);
  return !existing;
}

export async function getRecents(personId, limit = 20) {
  const db = await openDb();
  const tx = db.transaction('recents', 'readonly');
  const idx = tx.objectStore('recents').index('byPersonUsedAt');
  const range = IDBKeyRange.bound([personId, 0], [personId, Number.MAX_SAFE_INTEGER]);

  return new Promise((resolve, reject) => {
    const out = [];
    const req = idx.openCursor(range, 'prev');
    req.onsuccess = () => {
      const cursor = req.result;
      if (!cursor || out.length >= limit) {
        resolve(out);
        return;
      }
      const row = cursor.value;
      if (!out.some((item) => item.foodId === row.foodId)) {
        out.push(row);
      }
      cursor.continue();
    };
    req.onerror = () => reject(req.error);
  });
}

export async function getLastPortion(lastPortionKey) {
  const db = await openDb();
  const tx = db.transaction('meta', 'readonly');
  const row = await promisify(tx.objectStore('meta').get(`lastPortion:${lastPortionKey}`));
  return row?.value ?? null;
}

export async function getDashboardLayout(personId) {
  if (!personId) return null;
  const db = await openDb();
  const tx = db.transaction('meta', 'readonly');
  const row = await promisify(tx.objectStore('meta').get(`dashboardLayout:${personId}`));
  return row?.value ?? null;
}

export async function upsertDashboardLayout(personId, layout) {
  if (!personId) throw new Error('personId is required');
  const db = await openDb();
  const tx = db.transaction('meta', 'readwrite');
  tx.objectStore('meta').put({ key: `dashboardLayout:${personId}`, value: layout });
  await txDone(tx);
  return layout;
}


function uniqueById(items, idKey = 'id') {
  const map = new Map();
  for (const item of items || []) {
    if (!item || item[idKey] == null) continue;
    map.set(item[idKey], item);
  }
  return [...map.values()];
}

export async function exportAllData() {
  const db = await openDb();
  const tx = db.transaction(['persons', 'entries', 'productsCache', 'favorites', 'recents', 'weightLogs', 'waterLogs', 'exerciseLogs', 'fastingLogs', 'mealTemplates', 'recipes', 'goalPeriods'], 'readonly');

  const [persons, entries, productsCache, favorites, recents, weightLogs, waterLogs, exerciseLogs, fastingLogs, mealTemplates, recipes, goalPeriods] = await Promise.all([
    promisify(tx.objectStore('persons').getAll()),
    promisify(tx.objectStore('entries').getAll()),
    promisify(tx.objectStore('productsCache').getAll()),
    promisify(tx.objectStore('favorites').getAll()),
    promisify(tx.objectStore('recents').getAll()),
    promisify(tx.objectStore('weightLogs').getAll()),
    promisify(tx.objectStore('waterLogs').getAll()),
    promisify(tx.objectStore('exerciseLogs').getAll()),
    promisify(tx.objectStore('fastingLogs').getAll()),
    promisify(tx.objectStore('mealTemplates').getAll()),
    promisify(tx.objectStore('recipes').getAll()),
    promisify(tx.objectStore('goalPeriods').getAll())
  ]);

  return {
    schemaVersion: DB_VERSION,
    exportedAt: new Date().toISOString(),
    persons,
    entries,
    productsCache,
    favorites,
    recents,
    weightLogs,
    waterLogs,
    exerciseLogs,
    fastingLogs,
    mealTemplates,
    recipes,
    goalPeriods
  };
}

export async function importAllData(payload) {
  const db = await openDb();
  const tx = db.transaction(['persons', 'entries', 'productsCache', 'favorites', 'recents', 'weightLogs', 'waterLogs', 'exerciseLogs', 'fastingLogs', 'mealTemplates', 'recipes', 'goalPeriods', 'meta'], 'readwrite');

  const storesToReset = ['persons', 'entries', 'productsCache', 'favorites', 'recents', 'weightLogs', 'waterLogs', 'exerciseLogs', 'fastingLogs', 'mealTemplates', 'recipes', 'goalPeriods'];
  storesToReset.forEach((storeName) => tx.objectStore(storeName).clear());

  const persons = uniqueById(payload.persons || []);
  const entries = uniqueById(payload.entries || []);
  const productsCache = uniqueById(payload.productsCache || [], 'barcode');
  const favorites = uniqueById(payload.favorites || []);
  const recents = uniqueById(payload.recents || []);
  const weightLogs = [];
  const waterLogs = uniqueById(payload.waterLogs || []);
  const exerciseLogs = uniqueById(payload.exerciseLogs || []);
  const fastingLogs = uniqueById(payload.fastingLogs || []);
  const mealTemplates = uniqueById(payload.mealTemplates || []);
  const recipes = uniqueById(payload.recipes || []);
  const goalPeriods = uniqueById(payload.goalPeriods || []);
  const weightByPersonDate = new Map();
  for (const row of payload.weightLogs || []) {
    const cleaned = sanitizeWeightLog(row);
    if (!cleaned) continue;
    weightByPersonDate.set(`${cleaned.personId}:${cleaned.date}`, cleaned);
  }
  weightLogs.push(...weightByPersonDate.values());

  persons.forEach((item) => tx.objectStore('persons').put(item));
  entries.forEach((item) => tx.objectStore('entries').put(item));
  productsCache.forEach((item) => tx.objectStore('productsCache').put(item));
  favorites.forEach((item) => tx.objectStore('favorites').put(item));
  recents.forEach((item) => tx.objectStore('recents').put(item));
  weightLogs.forEach((item) => tx.objectStore('weightLogs').put(item));
  waterLogs.forEach((item) => tx.objectStore('waterLogs').put(item));
  exerciseLogs.forEach((item) => tx.objectStore('exerciseLogs').put(item));
  fastingLogs.forEach((item) => tx.objectStore('fastingLogs').put(item));
  mealTemplates.forEach((item) => tx.objectStore('mealTemplates').put(item));
  recipes.forEach((item) => tx.objectStore('recipes').put(item));
  goalPeriods.forEach((item) => tx.objectStore('goalPeriods').put(item));

  tx.objectStore('meta').put({ key: 'lastImportAt', value: new Date().toISOString() });

  await txDone(tx);
  return {
    persons: persons.length,
    entries: entries.length,
    productsCache: productsCache.length,
    favorites: favorites.length,
    recents: recents.length,
    weightLogs: weightLogs.length,
    waterLogs: waterLogs.length,
    exerciseLogs: exerciseLogs.length,
    fastingLogs: fastingLogs.length,
    mealTemplates: mealTemplates.length,
    recipes: recipes.length,
    goalPeriods: goalPeriods.length
  };
}

export async function deleteAllData() {
  const db = await openDb();
  const tx = db.transaction(['persons', 'entries', 'productsCache', 'favorites', 'recents', 'weightLogs', 'waterLogs', 'exerciseLogs', 'fastingLogs', 'mealTemplates', 'recipes', 'goalPeriods', 'meta'], 'readwrite');
  ['persons', 'entries', 'productsCache', 'favorites', 'recents', 'weightLogs', 'waterLogs', 'exerciseLogs', 'fastingLogs', 'mealTemplates', 'recipes', 'goalPeriods', 'meta'].forEach((storeName) => {
    tx.objectStore(storeName).clear();
  });
  await txDone(tx);
}


export async function getCachedProduct(barcode) {
  const db = await openDb();
  const tx = db.transaction('productsCache', 'readonly');
  return promisify(tx.objectStore('productsCache').get(barcode));
}

export async function upsertCachedProduct(product, options = {}) {
  const row = { ...product };
  const db = await openDb();
  const tx = db.transaction('productsCache', 'readwrite');
  tx.objectStore('productsCache').put(row);
  await txDone(tx);

  if (!options.skipHook && onProductCacheSavedHook) {
    try {
      await onProductCacheSavedHook(row);
    } catch (error) {
      console.error('PRODUCT_HOOK: onProductCacheSavedHook failed', error);
    }
  }

  return row;
}
