import { genericFoods } from './genericfoods.js';
import { computeConsistencyBadges, computeNutritionFromPer100g } from './math.js';
import { lookupOpenFoodFacts, searchOpenFoodFacts } from './offclient.js';
import { parseLabelText, scanLabel } from './labelscan.js';
import { startBarcodeScanner, stopBarcodeScanner } from './scanner.js';
import { drawWeeklyAnalyticsChart } from './analyticschart.js';
import { getSession, isSupabaseConfigured, onAuthStateChange, signInWithEmailOtp, signInWithGoogle, signOutAuth } from './supabaseClient.js';
import { listEntries as listCloudEntries, listPersons as listCloudPersons, saveFoodImageUrl, uploadFoodImage, upsertEntry as upsertCloudEntry, upsertPerson as upsertCloudPerson, upsertProductPointer } from './cloudStore.js';
import {
  addEntry,
  deleteAllData,
  deletePersonCascade,
  exportAllData,
  getCachedProduct,
  getEntriesForPersonDate,
  getEntriesForPersonDateRange,
  getLoggedDatesByPerson,
  getFavorites,
  getLastPortion,
  getDashboardLayout,
  upsertDashboardLayout,
  getPersons,
  getRecents,
  getWeightLogsByPerson,
  getWeightLogsInRange,
  addWeightLog,
  upsertCachedProduct,
  importAllData,
  isFavorite,
  seedSampleData,
  toggleFavorite,
  upsertPerson,
  setOnEntrySavedHook,
  setOnProductCacheSavedHook,
  getEntryById,
  upsertEntryFromCloud,
  getMealTemplates,
  upsertMealTemplate,
  logMealTemplate,
  getMealTemplate,
  deleteMealTemplate,
  getRecipes,
  getRecipe,
  upsertRecipe,
  logRecipe,
  addWaterLog,
  addExerciseLog,
  getWaterTotalForPersonDate,
  getExerciseTotalForPersonDate,
  startFasting,
  endActiveFast,
  getActiveFastForPerson,
  getLatestCompletedFastForPerson,
  getCompletedFastStreakDays,
  getGoalPeriodsByPerson,
  upsertGoalPeriod,
  resolveGoalForPersonDate
} from './storage.js';
import {
  closePortionDialog,
  fillPersonForm,
  initRoutes,
  openPortionDialog,
  readPersonForm,
  readPortionGrams,
  renderDashboard,
  renderDashboardEmpty,
  renderPersonPicker,
  renderPersonsList,
  renderPortionPicker,
  renderSettingsPersons,
  renderDashboardCustomization,
  setDashboardDayExportStatus,
  renderSuggestions,
  setPublicSearchStatus,
  setSearchSourceToggle,
  renderFavoriteSection,
  renderRecentSection,
  renderScanResult,
  setPortionGrams,
  setScanStatus,
  showAddStatus,
  readAnalyticsWeightForm,
  renderAnalyticsPersonPicker,
  setAnalyticsDefaultDate,
  renderWeightLogList,
  setAnalyticsStatus,
  renderAnalyticsInsights,
  renderNutritionPersonPicker,
  setNutritionDefaultDate,
  renderNutritionOverview,
  renderMealTemplates,
  renderMealTemplateItems,
  renderMealTemplateSearchResults,
  openMealTemplateDialog,
  closeMealTemplateDialog,
  renderRecipes,
  renderRecipeItems,
  renderRecipeSearchResults,
  openRecipeDialog,
  closeRecipeDialog,
  renderGoalPeriods,
  renderAuthStatus
} from './ui.js';

const CHATGPT_PHOTO_PROMPT = `Look at this meal photo. List the foods you can clearly identify.
If uncertain, ask clarifying questions.
Do NOT guess portion sizes.
Ask me for grams or pieces for each item.
Also ask whether oil, butter, or sauce was used.
Output as a checklist.`;


const IOS_INSTALL_BANNER_DISMISSED_KEY = 'iosInstallBannerDismissed';

function isStandaloneMode() {
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

function isIosDevice() {
  return /iPad|iPhone|iPod/.test(window.navigator.userAgent);
}

function renderIosInstallBanner() {
  const banner = document.getElementById('iosInstallBanner');
  if (!banner) return;

  const dismissed = window.localStorage.getItem(IOS_INSTALL_BANNER_DISMISSED_KEY) === '1';
  const shouldShow = isIosDevice() && !isStandaloneMode() && !dismissed;
  banner.hidden = !shouldShow;
}

const GENERIC_CATEGORIES = ['All', 'Fruits', 'Vegetables', 'Meat', 'Dairy', 'Grains', 'Drinks'];

const MICRONUTRIENTS = [
  { key: 'saturatedFat', per100Key: 'saturatedFat100g', label: 'Saturated fat', unit: 'g' },
  { key: 'monounsaturatedFat', per100Key: 'monounsaturatedFat100g', label: 'Monounsaturated fat', unit: 'g' },
  { key: 'polyunsaturatedFat', per100Key: 'polyunsaturatedFat100g', label: 'Polyunsaturated fat', unit: 'g' },
  { key: 'omega3', per100Key: 'omega3100g', label: 'Omega-3', unit: 'g' },
  { key: 'omega6', per100Key: 'omega6100g', label: 'Omega-6', unit: 'g' },
  { key: 'transFat', per100Key: 'transFat100g', label: 'Trans fat', unit: 'g' },
  { key: 'fiber', per100Key: 'fiber100g', label: 'Fiber', unit: 'g' },
  { key: 'sugar', per100Key: 'sugar100g', label: 'Sugar', unit: 'g' },
  { key: 'sodium', per100Key: 'sodiumMg100g', label: 'Sodium', unit: 'mg' },
  { key: 'potassium', per100Key: 'potassiumMg100g', label: 'Potassium', unit: 'mg' },
  { key: 'calcium', per100Key: 'calciumMg100g', label: 'Calcium', unit: 'mg' },
  { key: 'iron', per100Key: 'ironMg100g', label: 'Iron', unit: 'mg' },
  { key: 'vitaminC', per100Key: 'vitaminCMg100g', label: 'Vitamin C', unit: 'mg' }
];

function scaleMicronutrientsFromPer100g(nutrition, grams) {
  const ratio = Number(grams) / 100;
  const out = {};
  MICRONUTRIENTS.forEach((item) => {
    const per100 = Number(nutrition?.[item.per100Key]);
    out[item.key] = Number.isFinite(per100) ? Math.round(per100 * ratio * 1000) / 1000 : null;
  });
  return out;
}

function parseOptionalNonNegativeNumber(value) {
  if (value === '' || value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function setCustomImagePreview(src) {
  const img = document.getElementById('customImagePreview');
  if (!img) return;
  if (!src) {
    img.hidden = true;
    img.removeAttribute('src');
    img.dataset.thumb = '';
    img.dataset.full = '';
    return;
  }
  img.src = src;
  img.dataset.thumb = src;
  img.dataset.full = src;
  img.hidden = false;
}

function setCustomLabelScanStatus(message = '', visible = false) {
  const el = document.getElementById('customLabelScanStatus');
  if (!el) return;
  el.hidden = !visible;
  el.textContent = message;
}

function setCustomLabelAutoFillBadge(visible = false, text = 'Auto-filled') {
  const badge = document.getElementById('customLabelAutoFillBadge');
  if (!badge) return;
  badge.hidden = !visible;
  badge.textContent = text;
}

function markFieldAutofilled(inputId, value) {
  const input = document.getElementById(inputId);
  if (!input) return;
  if (value === null || value === undefined || value === '') return;
  input.value = String(value);
  input.dataset.autofilled = '1';
}

function applyLabelExtractedValues(extracted, sourceLabel = 'auto-filled') {
  const macros = extracted?.macros || {};
  const micros = extracted?.micros || {};

  markFieldAutofilled('customKcal', macros.kcal100g);
  markFieldAutofilled('customP', macros.p100g);
  markFieldAutofilled('customC', macros.c100g);
  markFieldAutofilled('customF', macros.f100g);
  markFieldAutofilled('customSugar', micros.sugar_g);
  markFieldAutofilled('customFiber', micros.fiber_g);
  markFieldAutofilled('customSodium', micros.sodium_mg);

  const autofilled = ['customKcal', 'customP', 'customC', 'customF', 'customSugar', 'customFiber', 'customSodium']
    .map((id) => document.getElementById(id))
    .filter((input) => input && input.dataset.autofilled === '1').length;

  if (autofilled > 0) {
    setCustomLabelAutoFillBadge(true, `${sourceLabel} (${autofilled} fields)`);
  }
}

async function createImageThumbnailDataUrl(file, maxSize = 256) {
  if (!file) return '';
  const dataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('Failed to read image'));
    reader.readAsDataURL(file);
  });

  const image = await new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Invalid image file'));
    img.src = dataUrl;
  });

  const width = image.width || maxSize;
  const height = image.height || maxSize;
  const scale = Math.min(1, maxSize / Math.max(width, height));
  const targetW = Math.max(1, Math.round(width * scale));
  const targetH = Math.max(1, Math.round(height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext('2d');
  if (!ctx) return dataUrl;
  ctx.drawImage(image, 0, 0, targetW, targetH);
  return canvas.toDataURL('image/jpeg', 0.82);
}

async function loadNutritionOverview() {
  const personId = document.getElementById('nutritionPersonPicker').value || state.selectedPersonId;
  const date = document.getElementById('nutritionDatePicker').value || state.selectedDate;
  const person = state.persons.find((p) => p.id === personId);

  if (!personId || !date) {
    renderNutritionOverview([], false);
    return;
  }

  const entries = await getEntriesForPersonDate(personId, date);

  const rows = MICRONUTRIENTS.map((nutrient) => {
    let hasValue = false;
    const amount = entries.reduce((sum, entry) => {
      const value = Number(entry?.[nutrient.key]);
      if (!Number.isFinite(value)) return sum;
      hasValue = true;
      return sum + value;
    }, 0);

    const targetRaw = Number(person?.micronutrientTargets?.[nutrient.key]);
    const target = Number.isFinite(targetRaw) && targetRaw > 0 ? targetRaw : null;
    const safeAmount = hasValue ? Math.round(amount * 1000) / 1000 : null;
    const percent = target && safeAmount !== null ? Math.round((safeAmount / target) * 1000) / 10 : null;

    return {
      key: nutrient.key,
      label: nutrient.label,
      unit: nutrient.unit,
      amount: safeAmount,
      target,
      percent
    };
  });

  const hasAnyData = rows.some((row) => row.amount !== null);
  renderNutritionOverview(rows, hasAnyData);
}

const state = {
  route: 'persons',
  persons: [],
  selectedPersonId: null,
  selectedDate: new Date().toISOString().slice(0, 10),
  suggestions: [],
  favoritesByPerson: {},
  recentsByPerson: {},
  activeFood: null,
  scannedProduct: null,
  analyticsRange: '1W',
  analyticsPoints: [],
  selectedGenericCategory: 'All',
  searchSource: 'local',
  publicSuggestions: [],
  publicSearchStatus: '',
  publicSearchDebounceTimer: null,
  publicSearchCache: new Map(),
  publicSearchSeq: 0,
  dashboardMacroView: 'consumed',
  dashboardLayoutByPerson: {},
  mealTemplates: [],
  mealTemplateDraft: { id: null, name: '', items: [] },
  mealTemplatePickerOpen: false,
  recipes: [],
  recipeDraft: { id: null, name: '', servingsDefault: 1, items: [] },
  recipePickerOpen: false,
  goalPeriodsByPerson: {},
  auth: { userId: null, email: null },
  authMessage: '',
  cloudSyncMessage: '',
  customImageFile: null
};


const DASHBOARD_SECTION_KEYS = ['caloriesHero', 'macros', 'streak', 'consistencyBadges', 'habits', 'fasting', 'macroBreakdown'];

function defaultDashboardLayout() {
  return {
    order: [...DASHBOARD_SECTION_KEYS],
    hidden: {
      caloriesHero: false,
      macros: false,
      streak: false,
      consistencyBadges: false,
      habits: false,
      fasting: false,
      macroBreakdown: false
    }
  };
}

function normalizeDashboardLayout(layout) {
  const base = defaultDashboardLayout();
  const orderInput = Array.isArray(layout?.order) ? layout.order.filter((key) => DASHBOARD_SECTION_KEYS.includes(key)) : [];
  base.order = [...orderInput, ...DASHBOARD_SECTION_KEYS.filter((key) => !orderInput.includes(key))];

  if (layout && typeof layout.hidden === 'object') {
    DASHBOARD_SECTION_KEYS.forEach((key) => {
      base.hidden[key] = Boolean(layout.hidden[key]);
    });
  }

  return base;
}

function layoutForPerson(personId) {
  return normalizeDashboardLayout(state.dashboardLayoutByPerson[personId]);
}

function setDashboardCustomizeStatus(message) {
  const statusEl = document.getElementById('dashboardCustomizeStatus');
  if (statusEl) statusEl.textContent = message;
}

async function loadDashboardLayoutForPerson(personId) {
  if (!personId) return;
  if (state.dashboardLayoutByPerson[personId]) return;
  const layout = await getDashboardLayout(personId);
  state.dashboardLayoutByPerson[personId] = normalizeDashboardLayout(layout);
}

async function loadGoalPeriodsForPerson(personId) {
  if (!personId) return [];
  const rows = await getGoalPeriodsByPerson(personId);
  state.goalPeriodsByPerson[personId] = rows;
  return rows;
}

function weekdayKeyFromIsoDate(isoDate) {
  const d = new Date(`${isoDate}T00:00:00`);
  if (!Number.isFinite(d.getTime())) return null;
  const keys = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
  return keys[d.getDay()];
}

function emptyWeekdayGoals() {
  const base = { kcal: '', protein: '', carbs: '', fat: '' };
  return {
    mon: { ...base },
    tue: { ...base },
    wed: { ...base },
    thu: { ...base },
    fri: { ...base },
    sat: { ...base },
    sun: { ...base }
  };
}

async function handleSaveGoalPeriod(e) {
  e.preventDefault();
  const personId = state.selectedPersonId;
  if (!personId) {
    window.alert('Create/select a person first.');
    return;
  }

  const name = (document.getElementById('goalPeriodName').value || '').trim();
  const startDate = document.getElementById('goalPeriodStartDate').value;
  const endDate = document.getElementById('goalPeriodEndDate').value;
  if (!name || !startDate || !endDate) {
    window.alert('Please provide name and date range.');
    return;
  }

  const keys = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
  const parseGoalNumber = (value) => {
    if (value === '' || value === null || value === undefined) return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  };

  const advancedOpen = Boolean(document.getElementById('goalAdvancedSchedule')?.open);
  const globalDaily = {
    kcal: parseGoalNumber(document.getElementById('goalDailyKcal')?.value),
    protein: parseGoalNumber(document.getElementById('goalDailyP')?.value),
    carbs: parseGoalNumber(document.getElementById('goalDailyC')?.value),
    fat: parseGoalNumber(document.getElementById('goalDailyF')?.value)
  };

  const weekdayGoals = {};
  keys.forEach((key) => {
    const cap = key[0].toUpperCase() + key.slice(1);
    if (!advancedOpen) {
      weekdayGoals[key] = { ...globalDaily };
      return;
    }

    const dayGoals = {
      kcal: parseGoalNumber(document.getElementById(`goal${cap}Kcal`).value),
      protein: parseGoalNumber(document.getElementById(`goal${cap}P`).value),
      carbs: parseGoalNumber(document.getElementById(`goal${cap}C`).value),
      fat: parseGoalNumber(document.getElementById(`goal${cap}F`).value)
    };

    weekdayGoals[key] = {
      kcal: dayGoals.kcal ?? globalDaily.kcal,
      protein: dayGoals.protein ?? globalDaily.protein,
      carbs: dayGoals.carbs ?? globalDaily.carbs,
      fat: dayGoals.fat ?? globalDaily.fat
    };
  });

  await upsertGoalPeriod({ personId, name, startDate, endDate, weekdayGoals });
  document.getElementById('goalPeriodForm').reset();
  const advanced = document.getElementById('goalAdvancedSchedule');
  if (advanced) advanced.open = false;
  await loadAndRender();
  showSettingsDataStatus('Goal period saved.');
}


function formatDurationHours(startAt, endAt) {
  const start = Number(startAt);
  const end = Number(endAt);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;
  return Math.round(((end - start) / 3600000) * 10) / 10;
}

async function loadFastingSummary(personId) {
  if (!personId) return { activeFast: null, lastDurationHours: null, streakDays: 0 };
  const [activeFast, latestCompleted, streakDays] = await Promise.all([
    getActiveFastForPerson(personId),
    getLatestCompletedFastForPerson(personId),
    getCompletedFastStreakDays(personId)
  ]);

  return {
    activeFast,
    lastDurationHours: latestCompleted ? formatDurationHours(latestCompleted.startAt, latestCompleted.endAt) : null,
    streakDays
  };
}

function foodFromGeneric(item) {
  return {
    foodId: item.id,
    label: item.name,
    nutrition: { kcal100g: item.kcal100g, p100g: item.p100g, c100g: item.c100g, f100g: item.f100g },
    pieceGramHint: item.pieceGramHint,
    imageThumbUrl: '',
    sourceType: 'generic',
    isGeneric: true,
    groupLabel: `Built-in generic • ${item.category || 'Uncategorized'}`
  };
}


function startOfDayUtc(date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function toIsoDate(date) {
  return date.toISOString().slice(0, 10);
}

function addDays(isoDate, days) {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return toIsoDate(d);
}

async function computeLoggingStreakDays(personId, selectedDate) {
  const dates = await getLoggedDatesByPerson(personId);
  if (!dates.length || !selectedDate) return 0;
  const dateSet = new Set(dates);
  let streak = 0;
  for (let i = 0; i < 365; i += 1) {
    const date = addDays(selectedDate, -i);
    if (!dateSet.has(date)) break;
    streak += 1;
  }
  return streak;
}

async function buildConsistencyStats(person, selectedDate, streakDays) {
  if (!person?.id || !selectedDate) {
    return { consistencyScore: 0, loggedDays: 0, proteinGoalMetDays: 0, badges: [] };
  }

  const days = [];
  for (let i = 0; i < 7; i += 1) {
    const date = addDays(selectedDate, -i);
    const entries = await getEntriesForPersonDate(person.id, date);
    const logged = entries.length > 0;
    const resolved = await resolveGoalForPersonDate(person, date);
    const pGoal = Number(resolved?.macroTargets?.p ?? person?.macroTargets?.p);
    const proteinTotal = entries.reduce((sum, row) => sum + Number(row?.p || 0), 0);
    const proteinGoalMet = logged && Number.isFinite(pGoal) && pGoal > 0 ? proteinTotal >= pGoal : false;
    days.push({ logged, proteinGoalMet });
  }

  return computeConsistencyBadges({ days, streakDays });
}

async function buildWeeklyAnalyticsPoints(personId, endDate) {
  const startDate = addDays(endDate, -6);
  const weightLogs = await getWeightLogsInRange(personId, startDate, endDate);
  const weightByDate = new Map(weightLogs.map((item) => [item.date, item]));

  const points = [];
  for (let i = 0; i < 7; i += 1) {
    const date = addDays(startDate, i);
    const entries = await getEntriesForPersonDate(personId, date);
    const calories = entries.reduce((acc, item) => acc + Number(item.kcal || 0), 0);
    const row = weightByDate.get(date);

    points.push({
      date,
      calories: Number.isFinite(calories) ? Math.round(calories * 10) / 10 : 0,
      scaleWeight: Number.isFinite(Number(row?.scaleWeight)) ? Number(row.scaleWeight) : null,
      trendWeight: Number.isFinite(Number(row?.trendWeight)) ? Number(row.trendWeight) : null
    });
  }
  return points;
}

function renderAnalyticsChart(points) {
  const canvas = document.getElementById('analyticsChart');
  if (!canvas) return;
  drawWeeklyAnalyticsChart(canvas, points || []);
}

function setAnalyticsRangeToggle(range) {
  document.querySelectorAll('#analyticsRangeToggle button[data-range]').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.range === range);
  });
}


function safeDiff(endValue, startValue) {
  if (!Number.isFinite(endValue) || !Number.isFinite(startValue)) return null;
  const delta = endValue - startValue;
  return Number.isFinite(delta) ? Math.round(delta * 10) / 10 : null;
}

async function getDailyCalories(personId, date) {
  const entries = await getEntriesForPersonDate(personId, date);
  const total = entries.reduce((acc, item) => acc + Number(item.kcal || 0), 0);
  return Number.isFinite(total) ? Math.round(total * 10) / 10 : 0;
}

async function buildInsightMetrics(personId, endDate) {
  const start7d = addDays(endDate, -7);
  const start3d = addDays(endDate, -3);

  const caloriesByDate = new Map();
  for (let i = 0; i <= 7; i += 1) {
    const date = addDays(endDate, -i);
    caloriesByDate.set(date, await getDailyCalories(personId, date));
  }

  const calorie3d = safeDiff(caloriesByDate.get(endDate), caloriesByDate.get(start3d));
  const calorie7d = safeDiff(caloriesByDate.get(endDate), caloriesByDate.get(start7d));

  const weightLogs = await getWeightLogsInRange(personId, start7d, endDate);
  const weightByDate = new Map(weightLogs.map((item) => [item.date, Number(item.scaleWeight)]));

  const weight3d = safeDiff(weightByDate.get(endDate), weightByDate.get(start3d));
  const weight7d = safeDiff(weightByDate.get(endDate), weightByDate.get(start7d));

  return { calorie3d, calorie7d, weight3d, weight7d };
}

function nowTime() {
  return new Date().toTimeString().slice(0, 5);
}

function getTotalsByPerson(entriesByPerson) {
  return Object.fromEntries(
    Object.entries(entriesByPerson).map(([personId, entries]) => {
      const sum = entries.reduce(
        (acc, e) => ({
          kcal: acc.kcal + Number(e.kcal || 0),
          p: acc.p + Number(e.p || 0),
          c: acc.c + Number(e.c || 0),
          f: acc.f + Number(e.f || 0)
        }),
        { kcal: 0, p: 0, c: 0, f: 0 }
      );
      return [personId, sum];
    })
  );
}

async function ensureSeedDataIfNeeded() {
  state.persons = await getPersons();
  if (!state.persons.length) {
    await seedSampleData();
    state.persons = await getPersons();
  }
}

function normalizeSelection() {
  const hasSelected = state.persons.some((p) => p.id === state.selectedPersonId);
  if (!hasSelected) {
    state.selectedPersonId = state.persons[0]?.id || null;
  }
}

async function loadPersonScopedCaches() {
  if (!state.selectedPersonId) return;
  const personId = state.selectedPersonId;
  state.favoritesByPerson[personId] = await getFavorites(personId);
  state.recentsByPerson[personId] = await getRecents(personId);
}

function sectionItems(personId) {
  const favorites = (state.favoritesByPerson[personId] || []).map((item) => ({
    ...item,
    isGeneric: item.sourceType === 'generic',
    groupLabel: 'Favorite'
  }));

  const recents = (state.recentsByPerson[personId] || []).map((item) => ({
    ...item,
    isGeneric: item.sourceType === 'generic',
    groupLabel: 'Recent'
  }));

  return { favorites, recents };
}

function buildSuggestionPool(personId, selectedCategory = "All") {
  const { favorites, recents } = sectionItems(personId);
  const generic = genericFoods
    .filter((item) => selectedCategory === 'All' || item.category === selectedCategory)
    .map((item) => ({ ...foodFromGeneric(item), groupLabel: `Built-in generic • ${item.category}` }));

  const dedup = new Map();
  [...favorites, ...recents, ...generic].forEach((item) => {
    if (!dedup.has(item.foodId)) dedup.set(item.foodId, item);
  });
  return [...dedup.values()];
}

function normalizePublicSearchProduct(product) {
  const barcode = String(product?.barcode || '').trim();
  const idPart = barcode || String(product?.productName || 'item').toLowerCase().replace(/\s+/g, '_');
  return {
    foodId: `offsearch:${idPart}`,
    barcode,
    label: product?.brands ? `${product.productName} (${product.brands})` : product.productName,
    nutrition: {
      kcal100g: product?.nutrition?.kcal100g,
      p100g: product?.nutrition?.p100g,
      c100g: product?.nutrition?.c100g,
      f100g: product?.nutrition?.f100g,
      saturatedFat100g: product?.nutrition?.saturatedFat100g,
      monounsaturatedFat100g: product?.nutrition?.monounsaturatedFat100g,
      polyunsaturatedFat100g: product?.nutrition?.polyunsaturatedFat100g,
      omega3100g: product?.nutrition?.omega3100g,
      omega6100g: product?.nutrition?.omega6100g,
      transFat100g: product?.nutrition?.transFat100g
    },
    imageThumbUrl: product?.imageThumbUrl || product?.imageUrl || '',
    pieceGramHint: null,
    sourceType: 'barcode',
    isGeneric: false,
    groupLabel: product?.brands ? `Open Food Facts • ${product.brands}` : 'Open Food Facts',
    productName: product?.productName || 'Unknown product',
    brands: product?.brands || ''
  };
}

function filterSuggestions(query, personId) {
  const { favorites, recents } = sectionItems(personId);
  const pool = buildSuggestionPool(personId, state.selectedGenericCategory);
  const q = query.trim().toLowerCase();
  const filtered = q ? pool.filter((item) => item.label.toLowerCase().includes(q)) : pool;
  state.suggestions = filtered.slice(0, 30);
  const favoritesSet = new Set((state.favoritesByPerson[personId] || []).map((f) => f.foodId));
  renderFavoriteSection(favorites, favoritesSet);
  renderRecentSection(recents.slice(0, 20), favoritesSet);

  if (state.searchSource === 'public') {
    const emptyPublicText = state.publicSearchStatus || 'Search public database by name.';
    renderSuggestions(state.publicSuggestions, favoritesSet, emptyPublicText);
    setPublicSearchStatus(state.publicSearchStatus, Boolean(state.publicSearchStatus));
    return;
  }

  renderSuggestions(state.suggestions, favoritesSet);
  setPublicSearchStatus('', false);
}

async function runPublicFoodSearch(rawQuery, personId) {
  const query = String(rawQuery || '').trim();
  state.publicSearchSeq += 1;
  const seq = state.publicSearchSeq;

  if (query.length < 2) {
    state.publicSuggestions = [];
    state.publicSearchStatus = 'Type at least 2 characters for public search.';
    filterSuggestions(query, personId);
    return;
  }

  if (!navigator.onLine) {
    state.publicSuggestions = [];
    state.publicSearchStatus = 'Offline – public search unavailable.';
    filterSuggestions(query, personId);
    return;
  }

  const cached = state.publicSearchCache.get(query.toLowerCase());
  if (cached) {
    state.publicSuggestions = cached;
    state.publicSearchStatus = cached.length ? '' : 'No results.';
    filterSuggestions(query, personId);
    return;
  }

  state.publicSearchStatus = 'Searching…';
  filterSuggestions(query, personId);

  try {
    const products = await searchOpenFoodFacts(query);
    if (seq !== state.publicSearchSeq) return;
    const normalized = products.map(normalizePublicSearchProduct).slice(0, 12);
    state.publicSearchCache.set(query.toLowerCase(), normalized);
    state.publicSuggestions = normalized;
    state.publicSearchStatus = normalized.length ? '' : 'No results.';
  } catch (error) {
    if (seq !== state.publicSearchSeq) return;
    state.publicSuggestions = [];
    state.publicSearchStatus = 'Public search failed. Please try again.';
  }

  filterSuggestions(query, personId);
}


async function loadAnalytics() {
  const analyticsPersonId = document.getElementById('analyticsPersonPicker').value || state.selectedPersonId;
  if (!analyticsPersonId) {
    state.analyticsPoints = [];
    renderWeightLogList([]);
    renderAnalyticsInsights({ calorie3d: null, calorie7d: null, weight3d: null, weight7d: null });
    renderAnalyticsChart([]);
    return;
  }

  const logs = await getWeightLogsByPerson(analyticsPersonId);
  renderWeightLogList(logs.slice(0, 7));

  const endDate = document.getElementById('analyticsWeightDate').value || state.selectedDate;
  const points = await buildWeeklyAnalyticsPoints(analyticsPersonId, endDate);
  const metrics = await buildInsightMetrics(analyticsPersonId, endDate);
  state.analyticsPoints = points;
  renderAnalyticsInsights(metrics);
  renderAnalyticsChart(points);
  setAnalyticsRangeToggle(state.analyticsRange);
}

async function handleSaveWeightLog() {
  const { personId, date, scaleWeight } = readAnalyticsWeightForm();
  if (!personId) {
    window.alert('Create/select a person first.');
    return;
  }

  if (!date) {
    window.alert('Please select a date.');
    return;
  }

  if (!Number.isFinite(scaleWeight) || scaleWeight <= 0) {
    window.alert('Please enter a valid positive weight value.');
    return;
  }

  await addWeightLog(personId, date, scaleWeight);
  setAnalyticsStatus(`Saved ${scaleWeight} kg on ${date}.`);
  await loadAnalytics();
  await loadNutritionOverview();
}

async function loadAndRender() {
  state.persons = await getPersons();
  normalizeSelection();
  await loadPersonScopedCaches();

  document.getElementById('datePicker').value = state.selectedDate;
  document.getElementById('addTime').value = document.getElementById('addTime').value || nowTime();

  const entriesByPerson = {};
  for (const person of state.persons) {
    entriesByPerson[person.id] = await getEntriesForPersonDate(person.id, state.selectedDate);
  }

  renderPersonsList(state.persons, getTotalsByPerson(entriesByPerson));
  renderPersonPicker(state.persons, state.selectedPersonId);
  renderAnalyticsPersonPicker(state.persons, state.selectedPersonId);
  setAnalyticsDefaultDate(state.selectedDate);
  renderNutritionPersonPicker(state.persons, state.selectedPersonId);
  setNutritionDefaultDate(state.selectedDate);
  renderSettingsPersons(state.persons);
  renderAuthStatus(state.auth, { configured: isSupabaseConfigured(), message: state.authMessage });
  const cloudSyncMessageEl = document.getElementById('cloudSyncMessage');
  if (cloudSyncMessageEl) cloudSyncMessageEl.textContent = state.cloudSyncMessage || '';
  document.querySelectorAll('#genericCategoryFilters button[data-category]').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.category === state.selectedGenericCategory);
  });

  state.mealTemplates = await getMealTemplates();
  renderMealTemplates(state.mealTemplates);
  state.recipes = await getRecipes();
  renderRecipes(state.recipes);

  const person = state.persons.find((p) => p.id === state.selectedPersonId);
  if (person) {
    await loadDashboardLayoutForPerson(person.id);
    renderDashboardCustomization(layoutForPerson(person.id));
    setDashboardCustomizeStatus('');
    const goalPeriods = await loadGoalPeriodsForPerson(person.id);
    renderGoalPeriods(goalPeriods, state.selectedDate);
    const resolvedGoal = await resolveGoalForPersonDate(person, state.selectedDate);
    const dashboardPerson = resolvedGoal
      ? { ...person, kcalGoal: resolvedGoal.kcalGoal, macroTargets: resolvedGoal.macroTargets }
      : person;
    const streakDays = await computeLoggingStreakDays(person.id, state.selectedDate);
    const consistency = await buildConsistencyStats(person, state.selectedDate, streakDays);
    const waterMl = await getWaterTotalForPersonDate(person.id, state.selectedDate);
    const exerciseMinutes = await getExerciseTotalForPersonDate(person.id, state.selectedDate);
    const fasting = await loadFastingSummary(person.id);
    renderDashboard(dashboardPerson, state.selectedDate, entriesByPerson[person.id] || [], {
      macroView: state.dashboardMacroView,
      layout: layoutForPerson(person.id),
      streakDays,
      consistency,
      habits: {
        waterMl,
        exerciseMinutes,
        waterGoalMl: Number.isFinite(Number(person.waterGoalMl)) ? Number(person.waterGoalMl) : 2000,
        exerciseGoalMinutes: Number.isFinite(Number(person.exerciseGoalMin)) ? Number(person.exerciseGoalMin) : 30,
        canLog: Boolean(person.id)
      },
      fasting
    });

    setSearchSourceToggle(state.searchSource);
    filterSuggestions(document.getElementById('foodSearchInput').value || '', person.id);
  } else {
    renderDashboardCustomization(defaultDashboardLayout());
    renderGoalPeriods([], state.selectedDate);
    setDashboardCustomizeStatus('Select a person to customize dashboard layout.');
    setDashboardDayExportStatus('');
    renderDashboardEmpty();
  }

  await loadAnalytics();
  await loadNutritionOverview();
}

async function handlePersonSave(e) {
  e.preventDefault();
  const person = readPersonForm();
  if (!person.name) {
    window.alert('Please provide a name.');
    return;
  }
  if (!Number.isFinite(person.kcalGoal) || person.kcalGoal < 800) {
    window.alert('Please provide a valid daily kcal goal (>= 800).');
    return;
  }

  person.waterGoalMl = Number.isFinite(Number(person.waterGoalMl)) ? Number(person.waterGoalMl) : 2000;
  person.exerciseGoalMin = Number.isFinite(Number(person.exerciseGoalMin)) ? Number(person.exerciseGoalMin) : 30;

  await upsertPerson(person);
  state.selectedPersonId = person.id;
  fillPersonForm(null);
  await loadAndRender();
}

async function handleSettingsActions(e) {
  const button = e.target.closest('button[data-action]');
  if (!button) return;

  const personId = button.dataset.personId;
  const action = button.dataset.action;
  const person = state.persons.find((p) => p.id === personId);
  if (!person) return;

  if (action === 'edit-person') {
    fillPersonForm(person);
    document.getElementById('personName').focus();
    return;
  }

  if (action === 'delete-person') {
    const ok = window.confirm(`Delete ${person.name}? This will permanently delete all their entries.`);
    if (!ok) return;
    await deletePersonCascade(person.id);
    if (state.selectedPersonId === person.id) state.selectedPersonId = null;
    fillPersonForm(null);
    await loadAndRender();
  }
}

async function handleDashboardCustomizeActions(e) {
  const actionTarget = e.target.closest('[data-action]');
  if (!actionTarget) return;

  const action = actionTarget.dataset.action;
  if (!['toggle-dashboard-section', 'move-dashboard-section-up', 'move-dashboard-section-down'].includes(action)) return;

  const personId = state.selectedPersonId;
  if (!personId) {
    setDashboardCustomizeStatus('Select a person first.');
    return;
  }

  const sectionKey = actionTarget.dataset.sectionKey;
  if (!DASHBOARD_SECTION_KEYS.includes(sectionKey)) return;

  const layout = layoutForPerson(personId);

  if (action === 'toggle-dashboard-section') {
    layout.hidden[sectionKey] = !actionTarget.checked;
  } else {
    const index = layout.order.indexOf(sectionKey);
    if (index === -1) return;
    const swapWith = action === 'move-dashboard-section-up' ? index - 1 : index + 1;
    if (swapWith < 0 || swapWith >= layout.order.length) return;
    [layout.order[index], layout.order[swapWith]] = [layout.order[swapWith], layout.order[index]];
  }

  state.dashboardLayoutByPerson[personId] = normalizeDashboardLayout(layout);
  await upsertDashboardLayout(personId, state.dashboardLayoutByPerson[personId]);
  setDashboardCustomizeStatus('Dashboard layout saved.');
  await loadAndRender();
}

function buildPortionOptions(item, lastUsed) {
  const options = [
    { label: '30g', grams: 30 },
    { label: '50g', grams: 50 },
    { label: '100g', grams: 100 },
    { label: '200g', grams: 200 }
  ];
  if (item.pieceGramHint) options.push({ label: `1 piece (~${item.pieceGramHint}g)`, grams: item.pieceGramHint });
  if (lastUsed) options.push({ label: `Last used (${lastUsed}g)`, grams: lastUsed });
  return options;
}

async function openPortionForItem(item) {
  const personId = document.getElementById('addPersonPicker').value || state.selectedPersonId;
  if (!personId) {
    window.alert('Create/select a person first.');
    return;
  }
  const lastPortionKey = `${personId}:${item.foodId}`;
  const last = await getLastPortion(lastPortionKey);
  state.activeFood = { ...item, personId, lastPortionKey };
  renderPortionPicker(item, buildPortionOptions(item, last));
  openPortionDialog();
}

async function logActiveFood() {
  const grams = readPortionGrams();
  if (!Number.isFinite(grams) || grams <= 0) {
    window.alert('Please enter a valid gram amount.');
    return;
  }

  const active = state.activeFood;
  if (!active) return;
  const usedPersonId = document.getElementById('addPersonPicker').value || active.personId;
  const entryDate = state.selectedDate;
  const time = document.getElementById('addTime').value || nowTime();
  const macros = computeNutritionFromPer100g(active.nutrition, grams);
  const micronutrients = scaleMicronutrientsFromPer100g(active.nutrition, grams);

  if ((active.sourceType === 'barcode') && active.barcode) {
    await upsertCachedProduct({
      barcode: active.barcode,
      productName: active.productName || active.label,
      brands: active.brands || '',
      imageUrl: active.imageThumbUrl || '',
      imageThumbUrl: active.imageThumbUrl || '',
      nutrition: active.nutrition,
      source: 'Open Food Facts',
      fetchedAt: Date.now()
    });
  }

  const source =
    active.sourceType === 'favorite'
      ? 'Favorite'
      : active.sourceType === 'generic'
        ? 'Manual (Generic built-in)'
        : active.sourceType === 'barcode'
          ? 'Barcode (Open Food Facts)'
          : active.sourceType === 'photo-manual'
            ? 'Photo (manual via ChatGPT)'
            : 'Manual (Custom)';

  await addEntry({
    personId: usedPersonId,
    date: entryDate,
    time,
    foodId: active.foodId,
    foodName: active.label,
    amountGrams: grams,
    ...macros,
    ...micronutrients,
    source,
    lastPortionKey: active.lastPortionKey,
    recentItem: {
      foodId: active.foodId,
      label: active.label,
      nutrition: active.nutrition,
      pieceGramHint: active.pieceGramHint,
      imageThumbUrl: active.imageThumbUrl || '',
      sourceType: active.sourceType === 'favorite' ? 'generic' : active.sourceType
    }
  });

  showAddStatus(`Logged ${active.label} (${grams}g).`);
  closePortionDialog();
  await loadAndRender();
}

async function handleAddSuggestionClick(e) {
  const actionTarget = e.target.closest('[data-action]');
  if (!actionTarget) return;

  const action = actionTarget.dataset.action;
  const foodId = actionTarget.dataset.foodId;
  const personId = document.getElementById('addPersonPicker').value || state.selectedPersonId;
  if (!foodId || !personId) return;

  const sourcePool = state.searchSource === 'public' ? state.publicSuggestions : buildSuggestionPool(personId, state.selectedGenericCategory);
  const item = sourcePool.find((s) => s.foodId === foodId);
  if (!item) return;

  if (action === 'toggle-favorite' && state.searchSource === 'public') {
    return;
  }

  if (action === 'toggle-favorite') {
    const turnedOn = await toggleFavorite(personId, {
      foodId: item.foodId,
      label: item.label,
      nutrition: item.nutrition,
      pieceGramHint: item.pieceGramHint,
      imageThumbUrl: item.imageThumbUrl || '',
      sourceType: item.sourceType === 'favorite' ? 'generic' : item.sourceType
    });
    showAddStatus(turnedOn ? 'Added to favorites.' : 'Removed from favorites.');
    await loadPersonScopedCaches();
    filterSuggestions(document.getElementById('foodSearchInput').value || '', personId);
    return;
  }

  if (action === 'pick-food') {
    const favorited = await isFavorite(personId, item.foodId);
    const sourceType = favorited ? 'favorite' : item.sourceType;
    await openPortionForItem({ ...item, sourceType });
  }
}

async function handleCustomFoodSubmit(e) {
  e.preventDefault();
  const personId = document.getElementById('addPersonPicker').value || state.selectedPersonId;
  if (!personId) {
    window.alert('Create/select a person first.');
    return;
  }

  const label = document.getElementById('customName').value.trim();
  if (!label) return;

  const nutrition = {
    kcal100g: Number(document.getElementById('customKcal').value),
    p100g: Number(document.getElementById('customP').value),
    c100g: Number(document.getElementById('customC').value),
    f100g: Number(document.getElementById('customF').value),
    fiber100g: parseOptionalNonNegativeNumber(document.getElementById('customFiber').value),
    sugar100g: parseOptionalNonNegativeNumber(document.getElementById('customSugar').value),
    sodiumMg100g: parseOptionalNonNegativeNumber(document.getElementById('customSodium').value),
    potassiumMg100g: parseOptionalNonNegativeNumber(document.getElementById('customPotassium').value),
    calciumMg100g: parseOptionalNonNegativeNumber(document.getElementById('customCalcium').value),
    ironMg100g: parseOptionalNonNegativeNumber(document.getElementById('customIron').value),
    vitaminCMg100g: parseOptionalNonNegativeNumber(document.getElementById('customVitaminC').value)
  };

  const hasInvalidMacros = ['kcal100g', 'p100g', 'c100g', 'f100g'].some((key) => {
    const value = Number(nutrition[key]);
    return !Number.isFinite(value) || value < 0;
  });
  if (hasInvalidMacros) {
    window.alert('Please enter non-negative numeric values for calories and macros.');
    return;
  }

  const microInputs = ['customFiber', 'customSugar', 'customSodium', 'customPotassium', 'customCalcium', 'customIron', 'customVitaminC'];
  const hasInvalidMicros = microInputs.some((id) => {
    const raw = document.getElementById(id).value;
    return raw !== '' && parseOptionalNonNegativeNumber(raw) === null;
  });
  if (hasInvalidMicros) {
    window.alert('Micronutrients must be non-negative numeric values.');
    return;
  }

  const selectedSource = document.getElementById('customSource').value || 'custom';
  const imageThumbUrl = document.getElementById('customImagePreview')?.dataset?.thumb || '';
  const foodId = `custom:${label.toLowerCase().replace(/\s+/g, '_')}`;

  if (state.customImageFile && isSupabaseConfigured() && state.auth.userId) {
    const upload = await uploadFoodImage(state.auth.userId, foodId, state.customImageFile);
    if (upload.error) {
      console.error('CLOUD: upload food image failed', upload.error);
    } else {
      console.log(`CLOUD: upload food image ok path=${upload.data?.path || ''}`);
      const save = await saveFoodImageUrl(state.auth.userId, foodId, upload.data?.url || '');
      if (save.error) {
        console.error('CLOUD: save food image url failed', save.error);
      }
    }
  } else if (state.customImageFile) {
    console.log('CLOUD: upload food image skipped (not signed in/configured)');
  }

  await openPortionForItem({
    foodId,
    label,
    nutrition,
    pieceGramHint: null,
    imageThumbUrl,
    sourceType: selectedSource,
    isGeneric: false,
    groupLabel: selectedSource === 'photo-manual' ? 'Photo (manual via ChatGPT)' : 'Custom'
  });
}


async function handleQuickAddSubmit(e) {
  e.preventDefault();
  const personId = document.getElementById('addPersonPicker').value || state.selectedPersonId;
  if (!personId) {
    window.alert('Create/select a person first.');
    return;
  }

  const name = (document.getElementById('quickAddName').value || '').trim() || 'Quick add';
  const payload = {
    kcal: Number(document.getElementById('quickAddKcal').value || 0),
    p: Number(document.getElementById('quickAddP').value || 0),
    c: Number(document.getElementById('quickAddC').value || 0),
    f: Number(document.getElementById('quickAddF').value || 0)
  };

  const values = Object.values(payload);
  if (values.some((value) => !Number.isFinite(value) || value < 0)) {
    window.alert('Please enter non-negative numeric values for calories and macros.');
    return;
  }

  if (!values.some((value) => value > 0)) {
    window.alert('Enter at least one value greater than zero.');
    return;
  }

  const time = document.getElementById('addTime').value || nowTime();
  await addEntry({
    personId,
    date: state.selectedDate,
    time,
    foodId: `quickadd:${Date.now()}`,
    foodName: name,
    amountGrams: 0,
    kcal: payload.kcal,
    p: payload.p,
    c: payload.c,
    f: payload.f,
    source: 'quickAdd'
  });

  document.getElementById('quickAddForm').reset();
  showAddStatus(`Logged quick add “${name}”.`);
  await loadAndRender();
}

async function handleBarcodeDetected(barcode) {
  if (!barcode) return;

  setScanStatus(`Scanned: ${barcode}`);

  const cached = await getCachedProduct(barcode);
  if (cached) {
    state.scannedProduct = cached;
    renderScanResult(cached);
  }

  if (!navigator.onLine) {
    if (!cached) {
      setScanStatus('Needs internet for first lookup.');
      renderScanResult(null);
    } else {
      setScanStatus('Loaded from local cache (offline).');
    }
    return;
  }

  try {
    const product = await lookupOpenFoodFacts(barcode);
    await upsertCachedProduct(product);
    state.scannedProduct = product;
    renderScanResult(product);
    setScanStatus(cached ? 'Updated from Open Food Facts.' : 'Product loaded from Open Food Facts.');
  } catch (error) {
    if (!cached) {
      setScanStatus('Could not find product. You can use manual add instead.');
      renderScanResult(null);
    } else {
      setScanStatus('Using cached product (network lookup failed).');
    }
  }
}

function toScannedFoodItem(product) {
  return {
    foodId: `barcode:${product.barcode}`,
    label: product.brands ? `${product.productName} (${product.brands})` : product.productName,
    nutrition: {
      ...product.nutrition
    },
    pieceGramHint: null,
    imageThumbUrl: product.imageThumbUrl || product.imageUrl || '',
    barcode: product.barcode,
    productName: product.productName,
    brands: product.brands || '',
    sourceType: 'barcode',
    isGeneric: false,
    groupLabel: 'Barcode (Open Food Facts)'
  };
}


function showSettingsDataStatus(message) {
  const el = document.getElementById('settingsDataStatus');
  if (el) el.textContent = message;
}

function downloadJsonFile(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

async function handleExportDayReport() {
  const person = state.persons.find((p) => p.id === state.selectedPersonId);
  if (!person) {
    setDashboardDayExportStatus('Select a person first.');
    return;
  }

  const date = state.selectedDate;
  const entries = await getEntriesForPersonDate(person.id, date);
  const totals = entries.reduce(
    (acc, item) => {
      acc.kcal += Number(item?.kcal || 0);
      acc.p += Number(item?.p || 0);
      acc.c += Number(item?.c || 0);
      acc.f += Number(item?.f || 0);
      return acc;
    },
    { kcal: 0, p: 0, c: 0, f: 0 }
  );

  const [waterMl, exerciseMinutes, fasting] = await Promise.all([
    getWaterTotalForPersonDate(person.id, date),
    getExerciseTotalForPersonDate(person.id, date),
    loadFastingSummary(person.id)
  ]);

  const payload = {
    exportedAt: new Date().toISOString(),
    person: { id: person.id, name: person.name },
    date,
    entries,
    totals: {
      kcal: Math.round(totals.kcal * 10) / 10,
      p: Math.round(totals.p * 10) / 10,
      c: Math.round(totals.c * 10) / 10,
      f: Math.round(totals.f * 10) / 10
    },
    habits: { waterMl, exerciseMinutes },
    fasting: {
      activeFast: fasting.activeFast,
      lastDurationHours: fasting.lastDurationHours,
      streakDays: fasting.streakDays
    }
  };

  const safeName = String(person.name || 'person').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  downloadJsonFile(`day-report-${safeName || 'person'}-${date}.json`, payload);
  setDashboardDayExportStatus('Day report exported. JSON downloaded.');
}

async function handleExportData() {
  const payload = await exportAllData();
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  downloadJsonFile(`macro-tracker-export-${stamp}.json`, payload);
  showSettingsDataStatus('Export complete. JSON downloaded.');
}

async function handleImportDataFile(file) {
  if (!file) return;
  const text = await file.text();
  const parsed = JSON.parse(text);

  const required = ['persons', 'entries', 'productsCache', 'favorites', 'recents', 'weightLogs'];
  const hasShape = required.every((key) => Array.isArray(parsed[key]));
  if (!hasShape) {
    window.alert('Invalid import file format.');
    return;
  }

  const summary = await importAllData(parsed);
  state.selectedPersonId = null;
  fillPersonForm(null);
  await loadAndRender();
  showSettingsDataStatus(
    `Import complete. Persons: ${summary.persons}, Entries: ${summary.entries}, Favorites: ${summary.favorites}, Recents: ${summary.recents}, Weight logs: ${summary.weightLogs}.`
  );
}

async function handleDeleteAllData() {
  const ok = window.confirm('Delete ALL app data on this device? This cannot be undone.');
  if (!ok) return;
  await deleteAllData();
  state.selectedPersonId = null;
  state.favoritesByPerson = {};
  state.recentsByPerson = {};
  fillPersonForm(null);
  await loadAndRender();
  showSettingsDataStatus('All data deleted.');
}


function setPhotoStatus(message) {
  const el = document.getElementById('photoStatus');
  if (el) el.textContent = message;
}

async function handleCopyPhotoPrompt() {
  try {
    await navigator.clipboard.writeText(CHATGPT_PHOTO_PROMPT);
    setPhotoStatus('Prompt copied. Open ChatGPT, upload the photo, paste prompt, then return to log manually.');
  } catch (error) {
    console.error(error);
    setPhotoStatus('Could not copy automatically. Please copy the prompt manually.');
  }
}

function handlePhotoSelected(file) {
  if (!file) return;
  const preview = document.getElementById('photoPreview');
  const reader = new FileReader();
  reader.onload = () => {
    preview.src = reader.result;
    preview.hidden = false;
    setPhotoStatus('Photo preview ready. Use “Copy ChatGPT Prompt” and follow instructions below.');
  };
  reader.readAsDataURL(file);
}


function recipeItemFromSuggestion(item) {
  return {
    foodKey: item.foodId,
    label: item.label,
    per100g: {
      kcal: Number(item.nutrition?.kcal100g || 0),
      protein: Number(item.nutrition?.p100g || 0),
      carbs: Number(item.nutrition?.c100g || 0),
      fat: Number(item.nutrition?.f100g || 0)
    },
    grams: 100
  };
}

function renderRecipeDraft() {
  const picker = document.getElementById('recipePicker');
  picker.hidden = !state.recipePickerOpen;
  document.getElementById('recipeName').value = state.recipeDraft.name || '';
  document.getElementById('recipeServingsDefault').value = String(state.recipeDraft.servingsDefault || 1);
  renderRecipeItems(state.recipeDraft.items || []);
  if (state.recipePickerOpen) {
    const personId = document.getElementById('addPersonPicker').value || state.selectedPersonId;
    const pool = personId ? mealTemplateSuggestionPool(personId) : [];
    const query = (document.getElementById('recipeSearchInput').value || '').trim().toLowerCase();
    const filtered = query ? pool.filter((item) => item.label.toLowerCase().includes(query)) : pool;
    renderRecipeSearchResults(filtered.slice(0, 30));
  }
}

function resetRecipeDraft() {
  state.recipeDraft = { id: null, name: '', servingsDefault: 1, items: [] };
  state.recipePickerOpen = false;
  const search = document.getElementById('recipeSearchInput');
  if (search) search.value = '';
}

function openNewRecipeDialog() {
  resetRecipeDraft();
  openRecipeDialog();
  renderRecipeDraft();
}

async function handleSaveRecipe(e) {
  e.preventDefault();
  const name = (document.getElementById('recipeName').value || '').trim();
  const servingsDefault = Number(document.getElementById('recipeServingsDefault').value || 1);
  if (!name) {
    window.alert('Please provide a recipe name.');
    return;
  }
  if (!Number.isFinite(servingsDefault) || servingsDefault <= 0) {
    window.alert('Please provide a valid servings value.');
    return;
  }
  if (!(state.recipeDraft.items || []).length) {
    window.alert('Please add at least one ingredient.');
    return;
  }

  const items = state.recipeDraft.items.map((item) => {
    const grams = Number(item.grams);
    return { ...item, grams: Number.isFinite(grams) && grams > 0 ? grams : 100 };
  });

  await upsertRecipe({
    id: state.recipeDraft.id || undefined,
    name,
    servingsDefault,
    items
  });

  closeRecipeDialog();
  resetRecipeDraft();
  showAddStatus(`Saved recipe “${name}”.`);
  await loadAndRender();
}

async function handleLogRecipe(recipeId) {
  const personId = document.getElementById('addPersonPicker').value || state.selectedPersonId;
  if (!personId) {
    window.alert('Create/select a person first.');
    return;
  }
  const recipe = await getRecipe(recipeId);
  if (!recipe) {
    window.alert('Recipe not found.');
    return;
  }
  const suggested = Number(recipe.servingsDefault || 1);
  const entered = window.prompt('Servings to log', String(suggested));
  if (entered == null) return;
  const servings = Number(entered);
  if (!Number.isFinite(servings) || servings <= 0) {
    window.alert('Please enter a valid positive servings value.');
    return;
  }

  const date = state.selectedDate;
  const time = document.getElementById('addTime').value || nowTime();
  const entry = await logRecipe({ personId, date, time, recipeId, servings });
  showAddStatus(`Logged recipe “${recipe.name}” (${servings} servings, ${Math.round(Number(entry.kcal || 0))} kcal).`);
  await loadAndRender();
}

function mealItemFromSuggestion(item) {
  return {
    foodKey: item.foodId,
    label: item.label,
    per100g: {
      kcal: Number(item.nutrition?.kcal100g || 0),
      protein: Number(item.nutrition?.p100g || 0),
      carbs: Number(item.nutrition?.c100g || 0),
      fat: Number(item.nutrition?.f100g || 0)
    },
    gramsDefault: 100
  };
}

function mealTemplateSuggestionPool(personId) {
  return buildSuggestionPool(personId, state.selectedGenericCategory);
}

function renderMealTemplateDraft() {
  const picker = document.getElementById('mealTemplatePicker');
  picker.hidden = !state.mealTemplatePickerOpen;
  document.getElementById('mealTemplateName').value = state.mealTemplateDraft.name || '';
  renderMealTemplateItems(state.mealTemplateDraft.items || []);
  if (state.mealTemplatePickerOpen) {
    const personId = document.getElementById('addPersonPicker').value || state.selectedPersonId;
    const pool = personId ? mealTemplateSuggestionPool(personId) : [];
    const query = (document.getElementById('mealTemplateSearchInput').value || '').trim().toLowerCase();
    const filtered = query ? pool.filter((item) => item.label.toLowerCase().includes(query)) : pool;
    renderMealTemplateSearchResults(filtered.slice(0, 30));
  }
}

function resetMealTemplateDraft() {
  state.mealTemplateDraft = { id: null, name: '', items: [] };
  state.mealTemplatePickerOpen = false;
  const search = document.getElementById('mealTemplateSearchInput');
  if (search) search.value = '';
}

function openNewMealTemplateDialog() {
  resetMealTemplateDraft();
  openMealTemplateDialog();
  renderMealTemplateDraft();
}

async function handleSaveMealTemplate(e) {
  e.preventDefault();
  const name = (document.getElementById('mealTemplateName').value || '').trim();
  if (!name) {
    window.alert('Please provide a meal name.');
    return;
  }
  if (!(state.mealTemplateDraft.items || []).length) {
    window.alert('Please add at least one item.');
    return;
  }

  const items = state.mealTemplateDraft.items.map((item) => {
    const grams = Number(item.gramsDefault);
    return {
      ...item,
      gramsDefault: Number.isFinite(grams) && grams > 0 ? grams : 100
    };
  });

  await upsertMealTemplate({
    id: state.mealTemplateDraft.id || undefined,
    name,
    items
  });

  closeMealTemplateDialog();
  resetMealTemplateDraft();
  showAddStatus(`Saved meal template “${name}”.`);
  await loadAndRender();
}

async function handleLogMealTemplate(templateId) {
  const personId = document.getElementById('addPersonPicker').value || state.selectedPersonId;
  if (!personId) {
    window.alert('Create/select a person first.');
    return;
  }
  const date = state.selectedDate;
  const time = document.getElementById('addTime').value || nowTime();
  const summary = await logMealTemplate({ personId, date, time, templateId });
  showAddStatus(`Logged ${summary.count} meal items (${Math.round(summary.totalKcal)} kcal).`);
  await loadAndRender();
}


async function openEditMealTemplateDialog(templateId) {
  const template = await getMealTemplate(templateId);
  if (!template) {
    window.alert('Meal template not found.');
    return;
  }

  state.mealTemplateDraft = {
    id: template.id,
    name: template.name,
    items: (template.items || []).map((item) => ({
      foodKey: item.foodKey,
      label: item.label,
      per100g: { ...item.per100g },
      gramsDefault: item.gramsDefault
    }))
  };
  state.mealTemplatePickerOpen = false;
  const search = document.getElementById('mealTemplateSearchInput');
  if (search) search.value = '';

  openMealTemplateDialog();
  renderMealTemplateDraft();
}

async function handleDuplicateMealTemplate(templateId) {
  const template = await getMealTemplate(templateId);
  if (!template) {
    window.alert('Meal template not found.');
    return;
  }

  const suffix = ' (copy)';
  const baseName = String(template.name || 'Meal').trim();
  const maxBaseLen = Math.max(1, 40 - suffix.length);
  const copyName = `${baseName.slice(0, maxBaseLen)}${suffix}`;

  await upsertMealTemplate({
    name: copyName,
    items: (template.items || []).map((item) => ({
      foodKey: item.foodKey,
      label: item.label,
      per100g: { ...item.per100g },
      gramsDefault: item.gramsDefault
    }))
  });

  showAddStatus(`Duplicated meal template as “${copyName}”.`);
  await loadAndRender();
}

async function handleDeleteMealTemplate(templateId) {
  const template = await getMealTemplate(templateId);
  if (!template) {
    window.alert('Meal template not found.');
    return;
  }

  const ok = window.confirm(`Delete meal template “${template.name}”?`);
  if (!ok) return;

  await deleteMealTemplate(templateId);
  showAddStatus('Meal template deleted.');
  await loadAndRender();
}


async function initAuthBootstrap() {
  const session = await getSession();
  const user = session?.user || null;
  state.auth = {
    userId: user?.id || null,
    email: user?.email || null
  };

  if (state.auth.userId) {
    console.log(`AUTH: signed-in userId=${state.auth.userId}`);
    await maybePullPersonsFromCloudOnSignIn();
  } else {
    console.log('AUTH: signed-out');
  }

  renderAuthStatus(state.auth, { configured: isSupabaseConfigured(), message: state.authMessage });

  onAuthStateChange((nextSession) => {
    const nextUser = nextSession?.user || null;
    state.auth = {
      userId: nextUser?.id || null,
      email: nextUser?.email || null
    };
    if (state.auth.userId) {
      console.log(`AUTH: signed-in userId=${state.auth.userId}`);
      maybePullPersonsFromCloudOnSignIn().then(() => loadAndRender());
    } else {
      console.log('AUTH: signed-out');
    }
    renderAuthStatus(state.auth, { configured: isSupabaseConfigured(), message: state.authMessage });
  });
}


async function handleAuthGoogleSignIn() {
  console.log('AUTH UI: google-sign-in click');
  state.authMessage = '';
  if (!isSupabaseConfigured()) {
    state.authMessage = 'Cloud auth is not configured in this environment.';
    renderAuthStatus(state.auth, { configured: false, message: state.authMessage });
    return;
  }
  const { error } = await signInWithGoogle();
  if (error) {
    state.authMessage = `Google sign-in failed: ${error.message}`;
  } else {
    state.authMessage = 'Opening Google sign-in...';
  }
  renderAuthStatus(state.auth, { configured: true, message: state.authMessage });
}

async function handleAuthEmailSignIn() {
  console.log('AUTH UI: email-sign-in click');
  const email = String(document.getElementById('authEmailInput')?.value || '').trim();
  state.authMessage = '';
  if (!email) {
    state.authMessage = 'Please enter an email address.';
    renderAuthStatus(state.auth, { configured: isSupabaseConfigured(), message: state.authMessage });
    return;
  }
  if (!isSupabaseConfigured()) {
    state.authMessage = 'Cloud auth is not configured in this environment.';
    renderAuthStatus(state.auth, { configured: false, message: state.authMessage });
    return;
  }

  const { error } = await signInWithEmailOtp(email);
  if (error) {
    state.authMessage = `Email sign-in failed: ${error.message}`;
  } else {
    state.authMessage = 'Magic link sent. Check your email.';
  }
  renderAuthStatus(state.auth, { configured: true, message: state.authMessage });
}

async function handleAuthSignOut() {
  console.log('AUTH UI: sign-out click');
  state.authMessage = '';
  const { error } = await signOutAuth();
  if (error) {
    state.authMessage = `Sign out failed: ${error.message}`;
  } else {
    state.authMessage = 'Signed out.';
  }
  renderAuthStatus(state.auth, { configured: isSupabaseConfigured(), message: state.authMessage });
}

async function maybePullPersonsFromCloudOnSignIn() {
  if (!state.auth.userId) return;

  const localPersons = await getPersons();
  if (localPersons.length) {
    console.log('CLOUD: available, local not empty: skipping auto-merge');
    return;
  }

  const { data, error } = await listCloudPersons(state.auth.userId);
  if (error) {
    console.error('CLOUD: failed to list persons', error);
    state.cloudSyncMessage = `Cloud pull failed: ${error.message}`;
    return;
  }

  for (const person of data) {
    await upsertPerson(person);
  }
  state.cloudSyncMessage = data.length
    ? `Pulled ${data.length} person(s) from cloud.`
    : 'No cloud persons found.';
  console.log(`CLOUD: pull completed count=${data.length}`);
}

async function handlePullPersonsFromCloud() {
  state.cloudSyncMessage = '';
  if (!isSupabaseConfigured() || !state.auth.userId) {
    state.cloudSyncMessage = 'Sign in with cloud auth to pull persons.';
    console.log('CLOUD: manual pull blocked (not signed in/configured)');
    await loadAndRender();
    return;
  }

  const { data, error } = await listCloudPersons(state.auth.userId);
  if (error) {
    state.cloudSyncMessage = `Cloud pull failed: ${error.message}`;
  } else {
    for (const person of data) {
      await upsertPerson(person);
    }
    state.cloudSyncMessage = `Pulled ${data.length} person(s) from cloud.`;
    console.log(`CLOUD: manual pull count=${data.length}`);
  }
  await loadAndRender();
}

async function handlePushPersonsToCloud() {
  state.cloudSyncMessage = '';
  if (!isSupabaseConfigured() || !state.auth.userId) {
    state.cloudSyncMessage = 'Sign in with cloud auth to push persons.';
    console.log('CLOUD: manual push blocked (not signed in/configured)');
    await loadAndRender();
    return;
  }

  const localPersons = await getPersons();
  let pushed = 0;
  for (const person of localPersons) {
    const { error } = await upsertCloudPerson(state.auth.userId, person);
    if (error) {
      state.cloudSyncMessage = `Cloud push failed: ${error.message}`;
      console.error('CLOUD: push failed', error);
      await loadAndRender();
      return;
    }
    pushed += 1;
  }

  state.cloudSyncMessage = `Pushed ${pushed} person(s) to cloud.`;
  console.log(`CLOUD: manual push count=${pushed}`);
  await loadAndRender();
}

function isoDateDaysAgo(baseDate, daysAgo) {
  const d = new Date(`${baseDate}T00:00:00`);
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}

async function handlePullEntriesFromCloud() {
  state.cloudSyncMessage = '';
  if (!isSupabaseConfigured() || !state.auth.userId) {
    state.cloudSyncMessage = 'Sign in with cloud auth to pull entries.';
    console.log('CLOUD: manual pull entries blocked (not signed in/configured)');
    await loadAndRender();
    return;
  }

  const selectedPersonId = state.selectedPersonId;
  if (!selectedPersonId) {
    state.cloudSyncMessage = 'Select a person before pulling entries.';
    await loadAndRender();
    return;
  }

  const endDate = state.selectedDate || new Date().toISOString().slice(0, 10);
  const startDate = isoDateDaysAgo(endDate, 29);
  const { data, error } = await listCloudEntries(state.auth.userId, { personId: selectedPersonId, startDate, endDate, limit: 1000 });
  if (error) {
    state.cloudSyncMessage = `Cloud entries pull failed: ${error.message}`;
    await loadAndRender();
    return;
  }

  let imported = 0;
  let skipped = 0;
  for (const cloudEntry of data) {
    const localEntry = await getEntryById(cloudEntry.id);
    const localUpdatedAt = Number(localEntry?.updatedAt || 0);
    const cloudUpdatedAt = Number(cloudEntry?.updatedAt || 0);
    if (localEntry && localUpdatedAt >= cloudUpdatedAt) {
      skipped += 1;
      continue;
    }
    await upsertEntryFromCloud(cloudEntry);
    imported += 1;
  }

  state.cloudSyncMessage = `Pulled entries: imported ${imported}, skipped ${skipped}.`;
  console.log(`CLOUD: pull entries ok imported=${imported} skipped=${skipped}`);
  await loadAndRender();
}

async function handlePushEntriesToCloud() {
  state.cloudSyncMessage = '';
  if (!isSupabaseConfigured() || !state.auth.userId) {
    state.cloudSyncMessage = 'Sign in with cloud auth to push entries.';
    console.log('CLOUD: manual push entries blocked (not signed in/configured)');
    await loadAndRender();
    return;
  }

  const selectedPersonId = state.selectedPersonId;
  if (!selectedPersonId) {
    state.cloudSyncMessage = 'Select a person before pushing entries.';
    await loadAndRender();
    return;
  }

  const endDate = state.selectedDate || new Date().toISOString().slice(0, 10);
  const startDate = isoDateDaysAgo(endDate, 29);
  const localEntries = await getEntriesForPersonDateRange(selectedPersonId, startDate, endDate);
  let pushed = 0;
  for (const entry of localEntries) {
    const { error } = await upsertCloudEntry(state.auth.userId, entry);
    if (error) {
      state.cloudSyncMessage = `Cloud entries push failed: ${error.message}`;
      console.error('CLOUD: push entries failed', error);
      await loadAndRender();
      return;
    }
    pushed += 1;
  }

  state.cloudSyncMessage = `Pushed ${pushed} entries to cloud.`;
  console.log(`CLOUD: push entries ok count=${pushed}`);
  await loadAndRender();
}

async function registerServiceWorker() {

  if (!('serviceWorker' in navigator)) return;
  try {
    await navigator.serviceWorker.register('./service-worker.js', { scope: './' });
  } catch (error) {
    console.error('Service worker registration failed:', error);
  }
}

function wireEvents() {
  initRoutes((route) => {
    state.route = route;
    if (route !== 'scan') {
      stopBarcodeScanner();
    }
  });

  document.getElementById('personPicker').addEventListener('change', async (e) => {
    state.selectedPersonId = e.target.value || null;
    await loadAndRender();
  });

  document.getElementById('analyticsPersonPicker').addEventListener('change', async () => {
    await loadAnalytics();
  });

  document.getElementById('nutritionPersonPicker').addEventListener('change', async () => {
    await loadNutritionOverview();
  });

  document.getElementById('nutritionDatePicker').addEventListener('change', async () => {
    await loadNutritionOverview();
  });

  document.getElementById('analyticsWeightDate').addEventListener('change', async () => {
    await loadAnalytics();
  });

  document.getElementById('analyticsRangeToggle').addEventListener('click', async (e) => {
    const btn = e.target.closest('button[data-range]');
    if (!btn) return;
    state.analyticsRange = btn.dataset.range || '1W';
    await loadAnalytics();
  });

  document.getElementById('saveWeightLogBtn').addEventListener('click', async () => {
    try {
      await handleSaveWeightLog();
    } catch (error) {
      console.error(error);
      setAnalyticsStatus('Could not save weight log.');
    }
  });

  document.getElementById('datePicker').addEventListener('change', async (e) => {
    state.selectedDate = e.target.value;
    await loadAndRender();
  });

  document.getElementById('dashboardSummary').addEventListener('click', async (e) => {
    const habitBtn = e.target.closest('button[data-action]');
    if (habitBtn) {
      const personId = state.selectedPersonId;
      if (!personId) {
        window.alert('Create/select a person first.');
        return;
      }
      const action = habitBtn.dataset.action;
      if (action === 'add-water-250' || action === 'add-water-500') {
        const amountMl = action === 'add-water-250' ? 250 : 500;
        await addWaterLog({ personId, date: state.selectedDate, amountMl });
        await loadAndRender();
        return;
      }
      if (action === 'add-exercise-10' || action === 'add-exercise-20') {
        const minutes = action === 'add-exercise-10' ? 10 : 20;
        await addExerciseLog({ personId, date: state.selectedDate, minutes });
        await loadAndRender();
        return;
      }
      if (action === 'toggle-fasting') {
        const active = await getActiveFastForPerson(personId);
        if (active) {
          await endActiveFast(personId);
        } else {
          await startFasting(personId);
        }
        await loadAndRender();
        return;
      }
      if (action === 'export-day-report') {
        await handleExportDayReport();
        return;
      }
    }

    const btn = e.target.closest('button[data-macro-view]');
    if (!btn) return;
    const view = btn.dataset.macroView;
    if (!view || !['consumed', 'remaining', 'percent'].includes(view)) return;
    state.dashboardMacroView = view;
    await loadAndRender();
  });

  document.getElementById('addPersonPicker').addEventListener('change', async (e) => {
    state.selectedPersonId = e.target.value || null;
    await loadAndRender();
  });

  document.getElementById('screen-add').addEventListener('click', (e) => {
    const searchBtn = e.target.closest('button[data-search-source]');
    if (!searchBtn) return;
    state.searchSource = searchBtn.dataset.searchSource === 'public' ? 'public' : 'local';
    setSearchSourceToggle(state.searchSource);

    const personId = document.getElementById('addPersonPicker').value || state.selectedPersonId;
    if (!personId) return;
    const query = document.getElementById('foodSearchInput').value || '';
    if (state.searchSource === 'public') {
      runPublicFoodSearch(query, personId);
    } else {
      filterSuggestions(query, personId);
    }
  });

  document.getElementById('genericCategoryFilters').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-category]');
    if (!btn) return;
    state.selectedGenericCategory = btn.dataset.category || 'All';
    const personId = document.getElementById('addPersonPicker').value || state.selectedPersonId;
    if (!personId) return;
    filterSuggestions(document.getElementById('foodSearchInput').value || '', personId);
    document.querySelectorAll('#genericCategoryFilters button[data-category]').forEach((b) => {
      b.classList.toggle('active', b === btn);
    });
  });

  document.getElementById('foodSearchInput').addEventListener('input', (e) => {
    const personId = document.getElementById('addPersonPicker').value || state.selectedPersonId;
    if (!personId) return;
    const query = e.target.value || '';

    if (state.searchSource === 'public') {
      if (state.publicSearchDebounceTimer) clearTimeout(state.publicSearchDebounceTimer);
      state.publicSearchDebounceTimer = setTimeout(() => {
        runPublicFoodSearch(query, personId);
      }, 300);
      return;
    }

    filterSuggestions(query, personId);
  });

  document.getElementById('mealTemplatesRow').addEventListener('click', async (e) => {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;

    if (btn.dataset.action === 'new-meal-template') {
      openNewMealTemplateDialog();
      return;
    }

    const templateId = btn.dataset.templateId;
    if (!templateId) return;

    if (btn.dataset.action === 'log-meal-template') {
      await handleLogMealTemplate(templateId);
      return;
    }

    if (btn.dataset.action === 'edit-meal-template') {
      await openEditMealTemplateDialog(templateId);
      return;
    }

    if (btn.dataset.action === 'duplicate-meal-template') {
      await handleDuplicateMealTemplate(templateId);
      return;
    }

    if (btn.dataset.action === 'delete-meal-template') {
      await handleDeleteMealTemplate(templateId);
    }
  });

  document.getElementById('recipesRow').addEventListener('click', async (e) => {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;

    if (btn.dataset.action === 'new-recipe') {
      openNewRecipeDialog();
      return;
    }

    if (btn.dataset.action === 'log-recipe') {
      const recipeId = btn.dataset.recipeId;
      if (!recipeId) return;
      await handleLogRecipe(recipeId);
    }
  });

  document.getElementById('mealTemplateAddItemBtn').addEventListener('click', () => {
    state.mealTemplatePickerOpen = !state.mealTemplatePickerOpen;
    renderMealTemplateDraft();
  });

  document.getElementById('mealTemplateSearchInput').addEventListener('input', () => {
    renderMealTemplateDraft();
  });

  document.getElementById('mealTemplateSearchResults').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-action="select-meal-item"]');
    if (!btn) return;
    const personId = document.getElementById('addPersonPicker').value || state.selectedPersonId;
    if (!personId) return;
    const selected = mealTemplateSuggestionPool(personId).find((item) => item.foodId === btn.dataset.foodId);
    if (!selected) return;
    state.mealTemplateDraft.items.push(mealItemFromSuggestion(selected));
    renderMealTemplateDraft();
  });

  document.getElementById('mealTemplateItems').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-action="remove-meal-item"]');
    if (!btn) return;
    const index = Number(btn.dataset.index);
    if (!Number.isFinite(index)) return;
    state.mealTemplateDraft.items.splice(index, 1);
    renderMealTemplateDraft();
  });

  document.getElementById('mealTemplateItems').addEventListener('input', (e) => {
    const input = e.target.closest('input[data-action="meal-item-grams"]');
    if (!input) return;
    const index = Number(input.dataset.index);
    const grams = Number(input.value);
    if (!Number.isFinite(index) || !state.mealTemplateDraft.items[index]) return;
    state.mealTemplateDraft.items[index].gramsDefault = grams;
  });

  document.getElementById('mealTemplateName').addEventListener('input', (e) => {
    state.mealTemplateDraft.name = e.target.value || '';
  });

  document.getElementById('mealTemplateForm').addEventListener('submit', handleSaveMealTemplate);
  document.getElementById('cancelMealTemplateBtn').addEventListener('click', () => {
    closeMealTemplateDialog();
    resetMealTemplateDraft();
  });

  document.getElementById('recipeAddItemBtn').addEventListener('click', () => {
    state.recipePickerOpen = !state.recipePickerOpen;
    renderRecipeDraft();
  });

  document.getElementById('recipeSearchInput').addEventListener('input', () => {
    renderRecipeDraft();
  });

  document.getElementById('recipeSearchResults').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-action="select-recipe-item"]');
    if (!btn) return;
    const personId = document.getElementById('addPersonPicker').value || state.selectedPersonId;
    if (!personId) return;
    const selected = mealTemplateSuggestionPool(personId).find((item) => item.foodId === btn.dataset.foodId);
    if (!selected) return;
    state.recipeDraft.items.push(recipeItemFromSuggestion(selected));
    renderRecipeDraft();
  });

  document.getElementById('recipeItems').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-action="remove-recipe-item"]');
    if (!btn) return;
    const index = Number(btn.dataset.index);
    if (!Number.isFinite(index)) return;
    state.recipeDraft.items.splice(index, 1);
    renderRecipeDraft();
  });

  document.getElementById('recipeItems').addEventListener('input', (e) => {
    const input = e.target.closest('input[data-action="recipe-item-grams"]');
    if (!input) return;
    const index = Number(input.dataset.index);
    const grams = Number(input.value);
    if (!Number.isFinite(index) || !state.recipeDraft.items[index]) return;
    state.recipeDraft.items[index].grams = grams;
  });

  document.getElementById('recipeName').addEventListener('input', (e) => {
    state.recipeDraft.name = e.target.value || '';
  });

  document.getElementById('recipeServingsDefault').addEventListener('input', (e) => {
    state.recipeDraft.servingsDefault = Number(e.target.value) || 1;
  });

  document.getElementById('recipeForm').addEventListener('submit', handleSaveRecipe);
  document.getElementById('cancelRecipeBtn').addEventListener('click', () => {
    closeRecipeDialog();
    resetRecipeDraft();
  });

  document.getElementById('addSuggestions').addEventListener('click', handleAddSuggestionClick);
  document.getElementById('favoriteList').addEventListener('click', handleAddSuggestionClick);
  document.getElementById('recentList').addEventListener('click', handleAddSuggestionClick);
  document.getElementById('quickAddForm').addEventListener('submit', handleQuickAddSubmit);
  document.getElementById('customFoodForm').addEventListener('submit', handleCustomFoodSubmit);
  document.getElementById('customImageInput').addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) {
      state.customImageFile = null;
      setCustomImagePreview('');
      return;
    }
    try {
      const thumb = await createImageThumbnailDataUrl(file, 256);
      state.customImageFile = file;
      setCustomImagePreview(thumb);
    } catch (error) {
      console.error(error);
      window.alert('Could not process image. Please try another file.');
      state.customImageFile = null;
      setCustomImagePreview('');
      e.target.value = '';
    }
  });

  document.getElementById('customLabelScanBtn').addEventListener('click', () => {
    document.getElementById('customLabelImageInput').click();
  });

  document.getElementById('customLabelImageInput').addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setCustomLabelScanStatus('Reading label…', true);
    setCustomLabelAutoFillBadge(false);
    try {
      const extracted = await scanLabel(file, { attemptOcr: true });
      applyLabelExtractedValues(extracted, extracted.mode === 'ocr' ? 'Auto-filled (OCR)' : 'Auto-filled');
      if (extracted.warnings?.length) {
        setCustomLabelScanStatus(extracted.warnings.join(' '), true);
      } else {
        setCustomLabelScanStatus('Label read complete. Please review values.', true);
      }
    } catch (error) {
      console.error(error);
      setCustomLabelScanStatus('Could not read label. Use paste-text fallback below.', true);
    }
  });

  document.getElementById('parseLabelTextBtn').addEventListener('click', () => {
    const raw = document.getElementById('customLabelTextInput').value || '';
    if (!raw.trim()) {
      setCustomLabelScanStatus('Paste label text first.', true);
      return;
    }
    const parsed = parseLabelText(raw);
    applyLabelExtractedValues(parsed, 'Auto-filled (Text parse)');
    if (parsed.warnings?.length) {
      setCustomLabelScanStatus(parsed.warnings.join(' '), true);
    } else {
      setCustomLabelScanStatus('Parsed label text. Please verify values.', true);
    }
  });

  document.getElementById('customFoodForm').addEventListener('reset', () => {
    state.customImageFile = null;
    setCustomImagePreview('');
    setCustomLabelAutoFillBadge(false);
    setCustomLabelScanStatus('', false);
  });

  document.getElementById('screen-add').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-route-jump]');
    if (!btn) return;
    const route = btn.dataset.routeJump;
    const tab = document.querySelector(`.tab[data-route="${route}"]`);
    if (tab) {
      tab.click();
      return;
    }
    document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', false));
    document.querySelectorAll('.screen').forEach((screen) => {
      screen.classList.toggle('active', screen.id === `screen-${route}`);
    });
    state.route = route;
  });

  document.getElementById('startScanBtn').addEventListener('click', async () => {
    const video = document.getElementById('scannerVideo');
    try {
      await startBarcodeScanner(video, handleBarcodeDetected, () => {});
      setScanStatus('Scanner active. Point camera at an EAN/UPC barcode.');
    } catch (error) {
      console.error(error);
      setScanStatus('Unable to start scanner. Check camera permission.');
    }
  });

  document.getElementById('stopScanBtn').addEventListener('click', () => {
    stopBarcodeScanner();
    setScanStatus('Scanner stopped.');
  });

  document.getElementById('scanResult').addEventListener('click', async (e) => {
    const btn = e.target.closest('#logScannedProductBtn');
    if (!btn || !state.scannedProduct) return;
    await openPortionForItem(toScannedFoodItem(state.scannedProduct));
  });

  document.getElementById('copyPromptBtn').addEventListener('click', handleCopyPhotoPrompt);
  document.getElementById('photoInput').addEventListener('change', (e) => {
    handlePhotoSelected(e.target.files?.[0]);
  });

  document.getElementById('portionPresetButtons').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-action="set-portion"]');
    if (!btn) return;
    setPortionGrams(Number(btn.dataset.grams));
  });
  document.getElementById('confirmPortionBtn').addEventListener('click', logActiveFood);
  document.getElementById('cancelPortionBtn').addEventListener('click', closePortionDialog);

  document.getElementById('authGoogleSignInBtn').addEventListener('click', handleAuthGoogleSignIn);
  document.getElementById('authEmailSignInBtn').addEventListener('click', handleAuthEmailSignIn);
  document.getElementById('authSignOutBtn').addEventListener('click', handleAuthSignOut);
  document.getElementById('pullPersonsCloudBtn').addEventListener('click', handlePullPersonsFromCloud);
  document.getElementById('pushPersonsCloudBtn').addEventListener('click', handlePushPersonsToCloud);
  document.getElementById('pullEntriesCloudBtn').addEventListener('click', handlePullEntriesFromCloud);
  document.getElementById('pushEntriesCloudBtn').addEventListener('click', handlePushEntriesToCloud);

  document.getElementById('personForm').addEventListener('submit', handlePersonSave);
  document.getElementById('cancelEditBtn').addEventListener('click', () => fillPersonForm(null));
  document.getElementById('settingsPersons').addEventListener('click', handleSettingsActions);
  document.getElementById('goalPeriodForm').addEventListener('submit', handleSaveGoalPeriod);
  document.getElementById('dashboardCustomizeList').addEventListener('click', handleDashboardCustomizeActions);
  document.getElementById('dashboardCustomizeList').addEventListener('change', handleDashboardCustomizeActions);

  document.getElementById('exportDataBtn').addEventListener('click', async () => {
    try {
      await handleExportData();
    } catch (error) {
      console.error(error);
      showSettingsDataStatus('Export failed.');
    }
  });

  document.getElementById('importDataInput').addEventListener('change', async (e) => {
    try {
      await handleImportDataFile(e.target.files?.[0]);
    } catch (error) {
      console.error(error);
      window.alert('Import failed. Please check the JSON file.');
    } finally {
      e.target.value = '';
    }
  });

  document.getElementById('deleteAllDataBtn').addEventListener('click', async () => {
    try {
      await handleDeleteAllData();
    } catch (error) {
      console.error(error);
      showSettingsDataStatus('Delete all failed.');
    }
  });

  document.getElementById('seedBtn').addEventListener('click', async () => {
    const ok = window.confirm('Reset to sample data? This replaces current persons and entries.');
    if (!ok) return;
    await seedSampleData();
    fillPersonForm(null);
    await loadAndRender();
  });

  window.addEventListener('resize', () => {
    if (state.analyticsPoints.length) renderAnalyticsChart(state.analyticsPoints);
  });

  const installDialog = document.getElementById('installDialog');
  document.getElementById('installHintBtn').addEventListener('click', () => installDialog.showModal());
  document.getElementById('closeInstallDialog').addEventListener('click', () => installDialog.close());

  document.getElementById('dismissIosInstallBanner').addEventListener('click', () => {
    window.localStorage.setItem(IOS_INSTALL_BANNER_DISMISSED_KEY, '1');
    renderIosInstallBanner();
  });

  const standaloneMedia = window.matchMedia('(display-mode: standalone)');
  if (typeof standaloneMedia.addEventListener === 'function') {
    standaloneMedia.addEventListener('change', () => {
      renderIosInstallBanner();
    });
  } else if (typeof standaloneMedia.addListener === 'function') {
    standaloneMedia.addListener(() => {
      renderIosInstallBanner();
    });
  }

  window.addEventListener('appinstalled', () => {
    renderIosInstallBanner();
  });
}

await registerServiceWorker();
setOnEntrySavedHook(async (entry) => {
  if (!isSupabaseConfigured() || !state.auth.userId) return;
  const { error } = await upsertCloudEntry(state.auth.userId, entry);
  if (error) {
    console.error('CLOUD: upsert entry failed', error);
    return;
  }
  console.log(`CLOUD: upsert entry ok id=${entry.id}`);
});
setOnProductCacheSavedHook(async (product) => {
  if (!isSupabaseConfigured() || !state.auth.userId) return;
  const { error } = await upsertProductPointer(state.auth.userId, product);
  if (error) {
    console.error('CLOUD: upsert product pointer failed', error);
    return;
  }
  console.log(`CLOUD: upsert product pointer ok barcode=${product.barcode}`);
});
await initAuthBootstrap();
wireEvents();
fillPersonForm(null);
renderIosInstallBanner();
await ensureSeedDataIfNeeded();
await loadAndRender();
