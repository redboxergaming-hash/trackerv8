import { clamp } from './math.js';

function el(id) {
  return document.getElementById(id);
}

function safeNum(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export function initRoutes(onRouteChange) {
  const tabs = document.querySelectorAll('.tab');
  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      const route = tab.dataset.route;
      tabs.forEach((t) => t.classList.toggle('active', t === tab));
      document.querySelectorAll('.screen').forEach((screen) => {
        screen.classList.toggle('active', screen.id === `screen-${route}`);
      });
      onRouteChange(route);
    });
  });
}


function createFoodThumb(imageUrl, label, fallbackIcon = '🍽️') {
  const wrap = document.createElement('div');
  wrap.className = 'food-thumb-wrap';

  const fallback = document.createElement('span');
  fallback.className = 'food-thumb-placeholder';
  fallback.textContent = fallbackIcon;
  wrap.appendChild(fallback);

  if (imageUrl) {
    const img = document.createElement('img');
    img.className = 'food-thumb';
    img.alt = `${label} thumbnail`;
    img.width = 44;
    img.height = 44;
    img.loading = 'lazy';
    img.referrerPolicy = 'no-referrer';
    img.src = String(imageUrl);
    img.onerror = () => {
      img.remove();
      fallback.hidden = false;
    };
    img.onload = () => {
      fallback.hidden = true;
    };
    wrap.appendChild(img);
  }

  return wrap;
}

function sumEntries(entries) {
  return entries.reduce(
    (acc, item) => {
      acc.kcal += safeNum(item.kcal);
      acc.p += safeNum(item.p);
      acc.c += safeNum(item.c);
      acc.f += safeNum(item.f);
      return acc;
    },
    { kcal: 0, p: 0, c: 0, f: 0 }
  );
}

function createSvgElement(tag) {
  return document.createElementNS('http://www.w3.org/2000/svg', tag);
}

function macroBreakdownRows(totals) {
  const carbsKcal = Math.max(0, safeNum(totals?.c) * 4);
  const proteinKcal = Math.max(0, safeNum(totals?.p) * 4);
  const fatKcal = Math.max(0, safeNum(totals?.f) * 9);
  const totalMacroKcal = carbsKcal + proteinKcal + fatKcal;

  const rows = [
    { key: 'carbs', label: 'Carbs', grams: safeNum(totals?.c), kcal: carbsKcal, color: '#ea580c' },
    { key: 'protein', label: 'Protein', grams: safeNum(totals?.p), kcal: proteinKcal, color: '#0d9488' },
    { key: 'fat', label: 'Fat', grams: safeNum(totals?.f), kcal: fatKcal, color: '#ca8a04' }
  ];

  rows.forEach((row) => {
    row.percent = totalMacroKcal > 0 ? (row.kcal / totalMacroKcal) * 100 : 0;
  });

  return { rows, totalMacroKcal };
}

function renderMacroBreakdown(container, totals) {
  if (!container) return;
  container.innerHTML = '';

  const { rows, totalMacroKcal } = macroBreakdownRows(totals);

  const title = document.createElement('h3');
  title.textContent = 'Macro breakdown';

  const body = document.createElement('div');
  body.className = 'macro-breakdown-body';

  const chartWrap = document.createElement('div');
  chartWrap.className = 'macro-breakdown-chart-wrap';

  if (totalMacroKcal <= 0) {
    const empty = document.createElement('p');
    empty.className = 'muted tiny';
    empty.textContent = 'No macro data for this day yet.';
    chartWrap.appendChild(empty);
  } else {
    const size = 120;
    const strokeWidth = 14;
    const radius = (size - strokeWidth) / 2;
    const circumference = 2 * Math.PI * radius;

    const svg = createSvgElement('svg');
    svg.setAttribute('viewBox', `0 0 ${size} ${size}`);
    svg.setAttribute('width', String(size));
    svg.setAttribute('height', String(size));
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', 'Macro calorie split donut chart');

    const bg = createSvgElement('circle');
    bg.setAttribute('cx', String(size / 2));
    bg.setAttribute('cy', String(size / 2));
    bg.setAttribute('r', String(radius));
    bg.setAttribute('fill', 'none');
    bg.setAttribute('stroke', 'rgba(148, 163, 184, 0.35)');
    bg.setAttribute('stroke-width', String(strokeWidth));
    svg.appendChild(bg);

    let offset = 0;
    rows.forEach((row) => {
      if (!row.percent) return;
      const segment = createSvgElement('circle');
      segment.setAttribute('cx', String(size / 2));
      segment.setAttribute('cy', String(size / 2));
      segment.setAttribute('r', String(radius));
      segment.setAttribute('fill', 'none');
      segment.setAttribute('stroke', row.color);
      segment.setAttribute('stroke-width', String(strokeWidth));
      segment.setAttribute('stroke-linecap', 'butt');
      segment.setAttribute('transform', `rotate(-90 ${size / 2} ${size / 2})`);
      segment.setAttribute('stroke-dasharray', `${(circumference * row.percent) / 100} ${circumference}`);
      segment.setAttribute('stroke-dashoffset', String(-offset));
      svg.appendChild(segment);
      offset += (circumference * row.percent) / 100;
    });

    const center = document.createElement('div');
    center.className = 'macro-breakdown-center';
    center.textContent = `${Math.round(totalMacroKcal)} kcal`;

    chartWrap.append(svg, center);
  }

  const legend = document.createElement('div');
  legend.className = 'macro-breakdown-legend';

  rows.forEach((row) => {
    const legendRow = document.createElement('div');
    legendRow.className = 'macro-breakdown-legend-row';

    const left = document.createElement('div');
    left.className = 'macro-breakdown-legend-left';

    const swatch = document.createElement('span');
    swatch.className = 'macro-breakdown-swatch';
    swatch.style.backgroundColor = row.color;

    const label = document.createElement('span');
    label.textContent = row.label;

    left.append(swatch, label);

    const right = document.createElement('span');
    right.className = 'muted tiny';
    right.textContent = `${Math.round(row.grams)}g · ${Math.round(row.percent)}%`;

    legendRow.append(left, right);
    legend.appendChild(legendRow);
  });

  body.append(chartWrap, legend);
  container.append(title, body);
}

function macroProgress(label, value, goal) {
  if (!goal || goal <= 0) {
    return `<div class="progress-row"><strong>${label}</strong><progress max="1" value="0"></progress><span>${Math.round(value)}g / —</span></div>`;
  }
  const ratio = clamp(value / goal, 0, 1.5);
  return `<div class="progress-row"><strong>${label}</strong><progress max="1" value="${Math.min(1, ratio)}"></progress><span>${Math.round(value)}g / ${Math.round(goal)}g</span></div>`;
}

export function renderPersonsList(persons, todayStatsByPerson = {}) {
  const wrap = el('personsList');
  if (!persons.length) {
    wrap.innerHTML = '<p class="muted">No persons yet. Add one in Settings.</p>';
    return;
  }

  wrap.innerHTML = persons
    .map((p) => {
      const stats = todayStatsByPerson[p.id] || { kcal: 0, p: 0, c: 0, f: 0 };
      const remaining = p.kcalGoal - stats.kcal;
      return `
      <article class="card">
        <h3>${p.name}</h3>
        <p>${Math.round(stats.kcal)} / ${p.kcalGoal} kcal • remaining ${Math.round(remaining)}</p>
        <div class="stat-rows">
          ${macroProgress('P', stats.p, p.macroTargets?.p)}
          ${macroProgress('C', stats.c, p.macroTargets?.c)}
          ${macroProgress('F', stats.f, p.macroTargets?.f)}
        </div>
      </article>`;
    })
    .join('');
}


export function renderNutritionPersonPicker(persons, selectedId) {
  const html = persons.length
    ? persons.map((p) => `<option value="${p.id}" ${p.id === selectedId ? 'selected' : ''}>${p.name}</option>`).join('')
    : '<option value="">No persons</option>';
  el('nutritionPersonPicker').innerHTML = html;
}

export function setNutritionDefaultDate(date) {
  el('nutritionDatePicker').value = date;
}

function formatMicroAmount(value, unit) {
  if (!Number.isFinite(value)) return '—';
  return `${Math.round(value * 100) / 100}${unit}`;
}

export function renderNutritionOverview(rows, hasAnyData) {
  const wrap = el('nutritionOverviewList');
  if (!hasAnyData) {
    wrap.innerHTML = '<p class="muted">No micronutrient data available</p>';
    return;
  }

  wrap.innerHTML = rows
    .map((row) => {
      const progressValue = row.target && row.amount !== null ? Math.min(1, row.amount / row.target) : 0;
      const targetText = row.target ? `${Math.round(row.target * 100) / 100}${row.unit}` : '—';
      const percentText = row.target && row.percent !== null ? `${row.percent}%` : '—';

      return `<article class="nutrition-row">
        <div class="nutrition-row-head">
          <strong>${row.label}</strong>
          <span>${formatMicroAmount(row.amount, row.unit)}</span>
        </div>
        <progress max="1" value="${progressValue}"></progress>
        <div class="muted tiny">Target: ${targetText} • ${percentText}</div>
      </article>`;
    })
    .join('');
}

export function renderPersonPicker(persons, selectedId) {
  const html = persons.length
    ? persons
        .map((p) => `<option value="${p.id}" ${p.id === selectedId ? 'selected' : ''}>${p.name}</option>`)
        .join('')
    : '<option value="">No persons</option>';
  el('personPicker').innerHTML = html;
  el('addPersonPicker').innerHTML = html;
}

function renderMacroCard({ label, consumed, goal, kcalFactor, view, toneClass, personKcalGoal }) {
  const safeGoal = Number.isFinite(goal) && goal > 0 ? goal : null;
  const remaining = safeGoal != null ? Math.max(0, safeGoal - consumed) : null;
  const consumedPct = safeGoal ? Math.min(100, Math.round((consumed / safeGoal) * 100)) : 0;
  const metTarget = safeGoal ? consumed >= safeGoal : false;

  let valueText = `${Math.round(consumed)}g consumed`;
  if (view === 'remaining') valueText = remaining == null ? '— remaining' : `${Math.round(remaining)}g remaining`;
  if (view === 'percent') {
    const consumedKcal = consumed * kcalFactor;
    valueText = safeGoal ? `${Math.round((consumedKcal / (personKcalGoal || 1)) * 100)}% of kcal` : `${Math.round(consumedKcal)} kcal`;
  }

  return `<article class="macro-card ${toneClass} ${metTarget ? 'goal-met' : ''}">
    <div class="macro-card-head">
      <strong>${label}</strong>
      <span>${safeGoal ? `${Math.round(consumed)}g / ${Math.round(safeGoal)}g` : `${Math.round(consumed)}g`}</span>
    </div>
    <div class="macro-card-value">${valueText}</div>
    <div class="macro-track"><div class="macro-fill" style="width:${consumedPct}%"></div></div>
  </article>`;
}


function safePositive(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function habitProgress(value, goal) {
  if (!goal || goal <= 0) return 0;
  return Math.max(0, Math.min(1, value / goal));
}

function createHabitCard({
  title,
  valueText,
  progress,
  actions,
  disabled
}) {
  const card = document.createElement('article');

  const titleEl = document.createElement('strong');
  titleEl.textContent = title;

  const valueEl = document.createElement('p');
  valueEl.className = 'muted tiny';
  valueEl.textContent = valueText;

  const progressEl = document.createElement('progress');
  progressEl.max = 1;
  progressEl.value = progress;

  const actionRow = document.createElement('div');
  actionRow.className = 'row-actions habit-actions';
  actions.forEach((action) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'secondary';
    btn.dataset.action = action.action;
    btn.textContent = action.label;
    btn.disabled = Boolean(disabled);
    actionRow.appendChild(btn);
  });

  card.append(titleEl, valueEl, progressEl, actionRow);
  return card;
}

function renderDashboardHabits(container, habits) {
  if (!container) return;
  container.innerHTML = '';

  const waterMl = safePositive(habits?.waterMl);
  const waterGoalMl = safePositive(habits?.waterGoalMl || 2000);
  const exerciseMinutes = safePositive(habits?.exerciseMinutes);
  const exerciseGoalMinutes = safePositive(habits?.exerciseGoalMinutes || 30);
  const disabled = !habits?.canLog;

  const waterCard = createHabitCard({
    title: 'Water',
    valueText: `${Math.round(waterMl)} ml / ${Math.round(waterGoalMl)} ml`,
    progress: habitProgress(waterMl, waterGoalMl),
    actions: [
      { action: 'add-water-250', label: '+250 ml' },
      { action: 'add-water-500', label: '+500 ml' }
    ],
    disabled
  });

  const exerciseCard = createHabitCard({
    title: 'Exercise',
    valueText: `${Math.round(exerciseMinutes)} min / ${Math.round(exerciseGoalMinutes)} min`,
    progress: habitProgress(exerciseMinutes, exerciseGoalMinutes),
    actions: [
      { action: 'add-exercise-10', label: '+10 min' },
      { action: 'add-exercise-20', label: '+20 min' }
    ],
    disabled
  });

  container.append(waterCard, exerciseCard);
}



const DASHBOARD_SECTION_KEYS = ['caloriesHero', 'macros', 'streak', 'consistencyBadges', 'habits', 'fasting', 'macroBreakdown'];

function normalizeDashboardLayout(layout) {
  const hiddenInput = layout && typeof layout.hidden === 'object' ? layout.hidden : {};
  const hidden = {};
  DASHBOARD_SECTION_KEYS.forEach((key) => {
    hidden[key] = Boolean(hiddenInput[key]);
  });

  const orderInput = Array.isArray(layout?.order) ? layout.order.filter((key) => DASHBOARD_SECTION_KEYS.includes(key)) : [];
  const order = [...orderInput, ...DASHBOARD_SECTION_KEYS.filter((key) => !orderInput.includes(key))];
  return { order, hidden };
}

function renderDashboardSection(sectionKey, context) {
  if (sectionKey === 'caloriesHero') {
    return `<section class="dashboard-hero">
      <article class="hero-card hero-calories">
        <h3>Calories consumed</h3>
        <p class="hero-value">${context.consumedKcal}</p>
        <p class="muted tiny">Goal ${context.person.kcalGoal} kcal</p>
        <div class="macro-track"><div class="macro-fill" style="width:${context.kcalProgress}%"></div></div>
      </article>
      <article class="hero-card hero-remaining ${context.remainingKcal <= 0 ? 'goal-met' : ''}">
        <h3>Calories remaining</h3>
        <p class="hero-value">${context.remainingKcal}</p>
        <p class="muted tiny">${context.remainingKcal <= 0 ? 'Daily target reached' : 'Keep going'}</p>
      </article>
    </section>`;
  }

  if (sectionKey === 'macros') {
    return `<section class="dashboard-macros">
      <div class="row-actions macro-view-toggle" role="group" aria-label="Macro display mode">
        <button type="button" class="secondary ${context.macroView === 'consumed' ? 'active' : ''}" data-macro-view="consumed">Consumed (g)</button>
        <button type="button" class="secondary ${context.macroView === 'remaining' ? 'active' : ''}" data-macro-view="remaining">Remaining (g)</button>
        <button type="button" class="secondary ${context.macroView === 'percent' ? 'active' : ''}" data-macro-view="percent">% Calories</button>
      </div>
      <div class="macro-grid">
        ${renderMacroCard({ label: 'Protein', consumed: context.totals.p, goal: context.person.macroTargets?.p, kcalFactor: 4, view: context.macroView, toneClass: 'macro-protein', personKcalGoal: context.person.kcalGoal })}
        ${renderMacroCard({ label: 'Carbs', consumed: context.totals.c, goal: context.person.macroTargets?.c, kcalFactor: 4, view: context.macroView, toneClass: 'macro-carbs', personKcalGoal: context.person.kcalGoal })}
        ${renderMacroCard({ label: 'Fat', consumed: context.totals.f, goal: context.person.macroTargets?.f, kcalFactor: 9, view: context.macroView, toneClass: 'macro-fat', personKcalGoal: context.person.kcalGoal })}
      </div>
    </section>`;
  }

  if (sectionKey === 'streak') {
    return `<section class="streak-card">
      <h3>Logging streak</h3>
      <p><strong>${context.streakDays} day${context.streakDays === 1 ? '' : 's'}</strong> in a row</p>
      <div class="macro-track"><div class="macro-fill" style="width:${Math.min(100, context.streakDays * 10)}%"></div></div>
    </section>`;
  }

  if (sectionKey === 'consistencyBadges') {
    const consistency = context.consistency || { consistencyScore: 0, badges: [] };
    const badgeHtml = (consistency.badges || []).length
      ? `<ul class="badge-list">${consistency.badges.map((badge) => `<li>${badge}</li>`).join('')}</ul>`
      : '<p class="muted tiny">No badges earned yet.</p>';

    return `<section class="consistency-card">
      <h3>Consistency & Badges</h3>
      <p><strong>${Math.round(Number(consistency.consistencyScore || 0))}%</strong> last 7 days</p>
      ${badgeHtml}
    </section>`;
  }

  if (sectionKey === 'habits') {
    return `<section class="habits-card">
      <h3>Healthy Habits</h3>
      <div id="dashboardHabits" class="habit-grid"></div>
    </section>`;
  }

  if (sectionKey === 'fasting') {
    return `<section class="fasting-card">
      <h3>Fasting</h3>
      <div id="dashboardFasting" class="stack"></div>
    </section>`;
  }

  if (sectionKey === 'macroBreakdown') {
    return '<section id="macroBreakdownCard" class="macro-breakdown-card"></section>';
  }

  return '';
}

function formatDateTime(ts) {
  const d = new Date(Number(ts));
  if (!Number.isFinite(d.getTime())) return '—';
  return d.toLocaleString();
}

function activeDurationHours(startAt) {
  const start = Number(startAt);
  if (!Number.isFinite(start)) return null;
  const now = Date.now();
  if (now <= start) return 0;
  return Math.round(((now - start) / 3600000) * 10) / 10;
}

export function renderFastingCard(container, fasting = {}) {
  if (!container) return;
  container.innerHTML = '';

  const activeFast = fasting?.activeFast || null;
  const streakDays = Number.isFinite(Number(fasting?.streakDays)) ? Number(fasting.streakDays) : 0;
  const lastDurationHours = Number.isFinite(Number(fasting?.lastDurationHours)) ? Number(fasting.lastDurationHours) : null;

  const top = document.createElement('div');
  top.className = 'row-actions';

  const toggleBtn = document.createElement('button');
  toggleBtn.type = 'button';
  toggleBtn.dataset.action = 'toggle-fasting';
  toggleBtn.textContent = activeFast ? 'End fast' : 'Start fast';

  const stateText = document.createElement('span');
  stateText.className = 'muted tiny';
  if (activeFast) {
    const hrs = activeDurationHours(activeFast.startAt);
    stateText.textContent = `Active · ${hrs == null ? '—' : hrs}h · since ${formatDateTime(activeFast.startAt)}`;
  } else {
    stateText.textContent = 'No active fast';
  }

  top.append(toggleBtn, stateText);

  const metrics = document.createElement('div');
  metrics.className = 'fasting-metrics';

  const duration = document.createElement('p');
  duration.className = 'muted tiny';
  duration.textContent = `Last duration: ${lastDurationHours == null ? '—' : `${lastDurationHours}h`}`;

  const streak = document.createElement('p');
  streak.className = 'muted tiny';
  streak.textContent = `Streak: ${streakDays} day${streakDays === 1 ? '' : 's'}`;

  metrics.append(duration, streak);
  container.append(top, metrics);
}

export function setDashboardDayExportStatus(message) {
  const elStatus = el('dashboardDayExportStatus');
  if (elStatus) elStatus.textContent = message;
}

export function renderDashboard(person, date, entries, options = {}) {
  const totals = sumEntries(entries);
  const consumedKcal = Math.round(totals.kcal);
  const remainingKcal = Math.max(0, Math.round(person.kcalGoal - totals.kcal));
  const kcalProgress = person.kcalGoal > 0 ? Math.min(100, Math.round((totals.kcal / person.kcalGoal) * 100)) : 0;
  const macroView = options.macroView || 'consumed';
  const streakDays = Number.isFinite(options.streakDays) ? options.streakDays : 0;
  const layout = normalizeDashboardLayout(options.layout);

  const context = {
    person,
    totals,
    consumedKcal,
    remainingKcal,
    kcalProgress,
    macroView,
    streakDays,
    consistency: options.consistency || { consistencyScore: 0, badges: [] }
  };

  const sectionsHtml = layout.order
    .filter((sectionKey) => !layout.hidden[sectionKey])
    .map((sectionKey) => renderDashboardSection(sectionKey, context))
    .join('');

  el('dashboardSummary').innerHTML = `${sectionsHtml}<p class="muted">Date: ${date}</p>`;

  const habitsContainer = el('dashboardHabits');
  if (habitsContainer) {
    renderDashboardHabits(habitsContainer, {
      waterMl: options.habits?.waterMl,
      exerciseMinutes: options.habits?.exerciseMinutes,
      waterGoalMl: options.habits?.waterGoalMl || 2000,
      exerciseGoalMinutes: options.habits?.exerciseGoalMinutes || 30,
      canLog: options.habits?.canLog !== false
    });
  }

  const macroContainer = el('macroBreakdownCard');
  if (macroContainer) {
    renderMacroBreakdown(macroContainer, totals);
  }

  const fastingContainer = el('dashboardFasting');
  if (fastingContainer) {
    renderFastingCard(fastingContainer, options.fasting || {});
  }

  const exportWrap = document.createElement('div');
  exportWrap.className = 'row-actions dashboard-day-export';
  const exportBtn = document.createElement('button');
  exportBtn.type = 'button';
  exportBtn.className = 'secondary';
  exportBtn.dataset.action = 'export-day-report';
  exportBtn.textContent = 'Export day';
  const status = document.createElement('span');
  status.id = 'dashboardDayExportStatus';
  status.className = 'muted tiny';
  exportWrap.append(exportBtn, status);
  el('dashboardSummary').appendChild(exportWrap);

  el('entriesTableContainer').innerHTML = entries.length
    ? `<table>
      <thead><tr><th>Time</th><th>Food</th><th>Amount</th><th>kcal</th><th>P</th><th>C</th><th>F</th><th>Source</th></tr></thead>
      <tbody>
      ${entries
        .map(
          (e) => `<tr>
          <td>${e.time}</td><td>${e.foodName}</td><td>${e.amountGrams}g</td><td>${e.kcal}</td><td>${e.p}</td><td>${e.c}</td><td>${e.f}</td><td>${e.source}</td>
        </tr>`
        )
        .join('')}
      </tbody>
    </table>`
    : '<p class="muted">No entries for this date.</p>';
}

export function renderDashboardEmpty() {
  el('dashboardSummary').innerHTML = '<p class="muted">No persons available. Add a person in Settings.</p>';
  el('entriesTableContainer').innerHTML = '';
}

export function renderSettingsPersons(persons) {
  const container = el('settingsPersons');
  if (!persons.length) {
    container.innerHTML = '<p class="muted">No persons yet.</p>';
    return;
  }

  container.innerHTML = persons
    .map(
      (p) => `<article class="settings-person-row">
      <div>
        <strong>${p.name}</strong><br />
        <span>${p.kcalGoal} kcal/day</span><br />
        <span class="muted">P:${p.macroTargets?.p ?? '—'} C:${p.macroTargets?.c ?? '—'} F:${p.macroTargets?.f ?? '—'}</span><br />
        <span class="muted">Water:${p.waterGoalMl ?? 2000}ml Exercise:${p.exerciseGoalMin ?? 30}min</span>
      </div>
      <div class="settings-actions">
        <button class="secondary" data-action="edit-person" data-person-id="${p.id}">Edit</button>
        <button class="danger" data-action="delete-person" data-person-id="${p.id}">Delete</button>
      </div>
    </article>`
    )
    .join('');
}

export function renderDashboardCustomization(layout) {
  const wrap = el('dashboardCustomizeList');
  if (!wrap) return;

  const normalized = normalizeDashboardLayout(layout);
  const labels = {
    caloriesHero: 'Calories hero',
    macros: 'Macros section',
    streak: 'Logging streak',
    consistencyBadges: 'Consistency & Badges',
    habits: 'Healthy Habits',
    fasting: 'Fasting',
    macroBreakdown: 'Macro Breakdown'
  };

  wrap.innerHTML = '';

  normalized.order.forEach((key, index) => {
    const row = document.createElement('div');
    row.className = 'dashboard-customize-row';

    const toggleLabel = document.createElement('label');
    toggleLabel.className = 'dashboard-customize-toggle';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = !normalized.hidden[key];
    checkbox.dataset.action = 'toggle-dashboard-section';
    checkbox.dataset.sectionKey = key;

    const text = document.createElement('span');
    text.textContent = labels[key] || key;

    toggleLabel.append(checkbox, text);

    const actions = document.createElement('div');
    actions.className = 'row-actions';

    const upBtn = document.createElement('button');
    upBtn.type = 'button';
    upBtn.className = 'secondary tiny-action';
    upBtn.textContent = '↑';
    upBtn.dataset.action = 'move-dashboard-section-up';
    upBtn.dataset.sectionKey = key;
    upBtn.disabled = index === 0;

    const downBtn = document.createElement('button');
    downBtn.type = 'button';
    downBtn.className = 'secondary tiny-action';
    downBtn.textContent = '↓';
    downBtn.dataset.action = 'move-dashboard-section-down';
    downBtn.dataset.sectionKey = key;
    downBtn.disabled = index === normalized.order.length - 1;

    actions.append(upBtn, downBtn);
    row.append(toggleLabel, actions);
    wrap.appendChild(row);
  });
}

export function renderGoalPeriods(periods = [], selectedDate = '') {
  const wrap = el('goalPeriodsList');
  if (!wrap) return;
  wrap.innerHTML = '';

  if (!periods.length) {
    const empty = document.createElement('p');
    empty.className = 'muted tiny';
    empty.textContent = 'No goal periods yet.';
    wrap.appendChild(empty);
    return;
  }

  periods.forEach((period) => {
    const row = document.createElement('article');
    row.className = 'settings-person-row';

    const left = document.createElement('div');
    const title = document.createElement('strong');
    title.textContent = String(period.name || 'Goal period');
    const range = document.createElement('div');
    range.className = 'muted tiny';
    range.textContent = `${period.startDate} → ${period.endDate}`;

    const d = new Date(`${selectedDate}T00:00:00`);
    const keys = ['sun','mon','tue','wed','thu','fri','sat'];
    const key = Number.isFinite(d.getTime()) ? keys[d.getDay()] : null;
    const goal = key ? period.weekdayGoals?.[key] : null;
    const detail = document.createElement('div');
    detail.className = 'muted tiny';
    if (goal && selectedDate >= period.startDate && selectedDate <= period.endDate) {
      detail.textContent = `Active on ${selectedDate}: ${Math.round(Number(goal.kcal || 0))} kcal • P${Math.round(Number(goal.protein || 0))} C${Math.round(Number(goal.carbs || 0))} F${Math.round(Number(goal.fat || 0))}`;
    } else {
      detail.textContent = 'Not active for selected date';
    }

    left.append(title, range, detail);
    row.appendChild(left);
    wrap.appendChild(row);
  });
}

export function fillPersonForm(person) {
  el('personId').value = person?.id || '';
  el('personName').value = person?.name || '';
  el('personKcalGoal').value = person?.kcalGoal || 2000;
  el('personMacroP').value = person?.macroTargets?.p ?? '';
  el('personMacroC').value = person?.macroTargets?.c ?? '';
  el('personMacroF').value = person?.macroTargets?.f ?? '';
  el('personWaterGoalMl').value = person?.waterGoalMl ?? 2000;
  el('personExerciseGoalMin').value = person?.exerciseGoalMin ?? 30;
  el('cancelEditBtn').hidden = !person;
}

export function readPersonForm() {
  const parseOptional = (value) => {
    if (value === '' || value === null) return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  };

  return {
    id: el('personId').value || crypto.randomUUID(),
    name: el('personName').value.trim(),
    kcalGoal: Number(el('personKcalGoal').value),
    macroTargets: {
      p: parseOptional(el('personMacroP').value),
      c: parseOptional(el('personMacroC').value),
      f: parseOptional(el('personMacroF').value)
    },
    waterGoalMl: Math.max(250, Number(el('personWaterGoalMl').value) || 2000),
    exerciseGoalMin: Math.max(5, Number(el('personExerciseGoalMin').value) || 30)
  };
}

function renderFoodList(containerId, items, favoritesSet, emptyText) {
  const wrap = el(containerId);
  if (!items.length) {
    wrap.innerHTML = `<p class="muted">${emptyText}</p>`;
    return;
  }

  wrap.innerHTML = '';
  items.forEach((item) => {
    const star = favoritesSet.has(item.foodId) ? '★' : '☆';

    const btn = document.createElement('button');
    btn.className = 'suggestion';
    btn.dataset.action = 'pick-food';
    btn.dataset.foodId = item.foodId;

    btn.appendChild(createFoodThumb(item.imageThumbUrl, item.label, item.isGeneric ? '🥣' : '🍽️'));

    const info = document.createElement('div');
    info.className = 'suggestion-body';

    const title = document.createElement('strong');
    title.textContent = item.label;

    const group = document.createElement('div');
    group.className = 'muted tiny';
    group.textContent = item.groupLabel;

    info.append(title, group);

    const kcal = Number(item?.nutrition?.kcal100g);
    const p = Number(item?.nutrition?.p100g);
    const c = Number(item?.nutrition?.c100g);
    const f = Number(item?.nutrition?.f100g);
    if ([kcal, p, c, f].some((v) => Number.isFinite(v))) {
      const macroLine = document.createElement('div');
      macroLine.className = 'muted tiny';
      macroLine.textContent = `Per 100g • kcal ${Number.isFinite(kcal) ? Math.round(kcal * 10) / 10 : '—'} • P ${Number.isFinite(p) ? Math.round(p * 10) / 10 : '—'} • C ${Number.isFinite(c) ? Math.round(c * 10) / 10 : '—'} • F ${Number.isFinite(f) ? Math.round(f * 10) / 10 : '—'}`;
      info.appendChild(macroLine);
    }

    if (item.isGeneric) {
      const genericNote = document.createElement('div');
      genericNote.className = 'muted tiny';
      genericNote.textContent = 'Generic built-in (approx.)';
      info.appendChild(genericNote);
    }

    const actions = document.createElement('div');
    actions.className = 'suggestion-actions';

    const fav = document.createElement('span');
    fav.className = 'star';
    fav.dataset.action = 'toggle-favorite';
    fav.dataset.foodId = item.foodId;
    fav.setAttribute('role', 'button');
    fav.setAttribute('aria-label', 'Toggle favorite');
    fav.textContent = star;

    actions.appendChild(fav);
    btn.append(info, actions);
    wrap.appendChild(btn);
  });
}

export function renderFavoriteSection(items, favoritesSet) {
  renderFoodList('favoriteList', items, favoritesSet, 'No favorites yet.');
}

export function renderRecentSection(items, favoritesSet) {
  renderFoodList('recentList', items, favoritesSet, 'No recent items yet.');
}

export function renderSuggestions(items, favoritesSet, emptyText = 'No matches. Use quick custom add below.') {
  renderFoodList('addSuggestions', items, favoritesSet, emptyText);
}

export function setPublicSearchStatus(message = '', visible = false) {
  const status = el('publicSearchStatus');
  if (!status) return;
  status.hidden = !visible;
  status.textContent = message;
}

export function setSearchSourceToggle(source = 'local') {
  document.querySelectorAll('#screen-add button[data-search-source]').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.searchSource === source);
  });
}

export function renderPortionPicker(item, options) {
  el('portionFoodName').textContent = item.label;
  el('portionMeta').textContent = `${item.nutrition.kcal100g} kcal / 100g • P${item.nutrition.p100g} C${item.nutrition.c100g} F${item.nutrition.f100g}`;

  const buttons = options
    .map((opt) => `<button type="button" class="portion-btn" data-action="set-portion" data-grams="${opt.grams}">${opt.label}</button>`)
    .join('');
  el('portionPresetButtons').innerHTML = buttons;
  el('portionGrams').value = options[2]?.grams ?? 100;
}

export function readPortionGrams() {
  return Number(el('portionGrams').value);
}

export function setPortionGrams(grams) {
  el('portionGrams').value = Number(grams);
}

export function openPortionDialog() {
  el('portionDialog').showModal();
}

export function closePortionDialog() {
  el('portionDialog').close();
}

export function showAddStatus(message) {
  el('addStatus').textContent = message;
}


export function setScanStatus(message) {
  el('scanStatus').textContent = message;
}

export function readAnalyticsWeightForm() {
  return {
    personId: el('analyticsPersonPicker').value,
    date: el('analyticsWeightDate').value,
    scaleWeight: Number(el('analyticsWeightInput').value)
  };
}

export function setAnalyticsDefaultDate(date) {
  el('analyticsWeightDate').value = date;
}

export function renderAnalyticsPersonPicker(persons, selectedId) {
  const html = persons.length
    ? persons.map((p) => `<option value="${p.id}" ${p.id === selectedId ? 'selected' : ''}>${p.name}</option>`).join('')
    : '<option value="">No persons</option>';
  el('analyticsPersonPicker').innerHTML = html;
}

export function renderWeightLogList(weightLogs) {
  const wrap = el('weightLogList');
  if (!weightLogs.length) {
    wrap.innerHTML = '<p class="muted">No weight logs yet.</p>';
    return;
  }

  wrap.innerHTML = `<ul class="weight-log-items">${weightLogs
    .map((item) => `<li><strong>${item.date}</strong> • ${item.scaleWeight} kg</li>`)
    .join('')}</ul>`;
}

export function setAnalyticsStatus(message) {
  el('analyticsStatus').textContent = message;
}

function formatChangeMetric(value, unitSuffix = '') {
  if (!Number.isFinite(value)) return 'Not enough data';
  const direction = value > 0 ? 'increase' : value < 0 ? 'decrease' : 'no change';
  const abs = Math.abs(value);
  const rounded = Math.round(abs * 10) / 10;
  return `${rounded}${unitSuffix} ${direction}`;
}

export function renderAnalyticsInsights(metrics) {
  const wrap = el('analyticsInsights');
  if (!wrap) return;

  wrap.innerHTML = `
    <article class="card">
      <h3>3-day calorie change</h3>
      <p>${formatChangeMetric(metrics.calorie3d, ' kcal')}</p>
    </article>
    <article class="card">
      <h3>7-day calorie change</h3>
      <p>${formatChangeMetric(metrics.calorie7d, ' kcal')}</p>
    </article>
    <article class="card">
      <h3>3-day weight change</h3>
      <p>${formatChangeMetric(metrics.weight3d, ' kg')}</p>
    </article>
    <article class="card">
      <h3>7-day weight change</h3>
      <p>${formatChangeMetric(metrics.weight7d, ' kg')}</p>
    </article>
  `;
}


function scanMicrosSummary(nutrition = {}) {
  const rows = [
    ['Fiber', nutrition.fiber100g, 'g'],
    ['Sugar', nutrition.sugar100g, 'g'],
    ['Sodium', nutrition.sodiumMg100g, 'mg']
  ].filter(([, value]) => Number.isFinite(Number(value)));

  if (!rows.length) return 'Micros unavailable';
  return rows
    .map(([label, value, unit]) => `${label}: ${Math.round(Number(value) * 10) / 10}${unit}`)
    .join(' • ');
}

function macroValue(value) {
  return value == null ? 'missing' : `${Math.round(value * 10) / 10}`;
}

export function renderScanResult(product) {
  const wrap = el('scanResult');
  if (!product) {
    wrap.innerHTML = '';
    return;
  }

  wrap.innerHTML = '';

  const article = document.createElement('article');
  article.className = 'card';

  const top = document.createElement('div');
  top.className = 'row-actions scan-result-top';

  const left = document.createElement('div');
  const title = document.createElement('strong');
  title.textContent = product.productName;
  left.appendChild(title);
  left.appendChild(document.createElement('br'));

  const brand = document.createElement('span');
  brand.className = 'muted';
  brand.textContent = product.brands || 'Unknown brand';
  left.appendChild(brand);
  left.appendChild(document.createElement('br'));

  const barcode = document.createElement('span');
  barcode.className = 'muted tiny';
  barcode.textContent = `Barcode: ${product.barcode}`;
  left.appendChild(barcode);

  const thumb = createFoodThumb(product.imageThumbUrl || product.imageUrl, product.productName, '📦');
  thumb.classList.add('scan-thumb-wrap');

  top.append(left, thumb);

  const meta = document.createElement('p');
  meta.className = 'muted';
  meta.textContent = `Per 100g — kcal: ${macroValue(product.nutrition.kcal100g)}, P: ${macroValue(product.nutrition.p100g)}, C: ${macroValue(product.nutrition.c100g)}, F: ${macroValue(product.nutrition.f100g)}`;

  const micros = document.createElement('p');
  micros.className = 'muted tiny';
  micros.textContent = `Micros per 100g — ${scanMicrosSummary(product.nutrition || {})}`;

  const actions = document.createElement('div');
  actions.className = 'row-actions';

  const logBtn = document.createElement('button');
  logBtn.type = 'button';
  logBtn.id = 'logScannedProductBtn';
  logBtn.textContent = 'Log via portion picker';
  actions.appendChild(logBtn);

  article.append(top, meta, micros, actions);
  wrap.appendChild(article);
}

function macroPer100FromAny(nutrition = {}) {
  return {
    kcal: Number(nutrition.kcal100g),
    protein: Number(nutrition.p100g),
    carbs: Number(nutrition.c100g),
    fat: Number(nutrition.f100g)
  };
}

export function renderMealTemplates(mealTemplates = []) {
  const wrap = el('mealTemplatesRow');
  if (!wrap) return;
  wrap.innerHTML = '';

  const newBtn = document.createElement('button');
  newBtn.type = 'button';
  newBtn.className = 'secondary meal-template-card';
  newBtn.dataset.action = 'new-meal-template';
  const title = document.createElement('strong');
  title.textContent = '+ New Meal';
  const hint = document.createElement('span');
  hint.className = 'muted tiny';
  hint.textContent = 'Create a reusable template';
  newBtn.append(title, hint);
  wrap.appendChild(newBtn);

  mealTemplates.forEach((template) => {
    const totalKcal = (template.items || []).reduce((sum, item) => {
      const grams = Number(item?.gramsDefault || 0);
      const per100 = Number(item?.per100g?.kcal || 0);
      if (!Number.isFinite(grams) || !Number.isFinite(per100)) return sum;
      return sum + (grams / 100) * per100;
    }, 0);

    const card = document.createElement('div');
    card.className = 'meal-template-card-shell';

    const logBtn = document.createElement('button');
    logBtn.type = 'button';
    logBtn.className = 'meal-template-card';
    logBtn.dataset.action = 'log-meal-template';
    logBtn.dataset.templateId = template.id;

    const h = document.createElement('strong');
    h.textContent = String(template.name || 'Unnamed meal');
    const meta = document.createElement('span');
    meta.className = 'muted tiny';
    meta.textContent = `${(template.items || []).length} items • ${Math.round(totalKcal)} kcal`;
    logBtn.append(h, meta);

    const actions = document.createElement('div');
    actions.className = 'meal-template-actions';

    const editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.className = 'secondary tiny-action';
    editBtn.dataset.action = 'edit-meal-template';
    editBtn.dataset.templateId = template.id;
    editBtn.textContent = 'Edit';

    const dupBtn = document.createElement('button');
    dupBtn.type = 'button';
    dupBtn.className = 'secondary tiny-action';
    dupBtn.dataset.action = 'duplicate-meal-template';
    dupBtn.dataset.templateId = template.id;
    dupBtn.textContent = 'Duplicate';

    const delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.className = 'secondary tiny-action';
    delBtn.dataset.action = 'delete-meal-template';
    delBtn.dataset.templateId = template.id;
    delBtn.textContent = 'Delete';

    actions.append(editBtn, dupBtn, delBtn);
    card.append(logBtn, actions);
    wrap.appendChild(card);
  });
}

export function renderMealTemplateItems(items = []) {
  const wrap = el('mealTemplateItems');
  if (!wrap) return;
  wrap.innerHTML = '';

  if (!items.length) {
    const empty = document.createElement('p');
    empty.className = 'muted';
    empty.textContent = 'No items yet. Click “Add item”.';
    wrap.appendChild(empty);
    return;
  }

  items.forEach((item, index) => {
    const row = document.createElement('div');
    row.className = 'meal-template-item-row';

    const top = document.createElement('div');
    top.className = 'meal-template-item-top';

    const label = document.createElement('strong');
    label.textContent = item.label;

    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'secondary';
    removeBtn.dataset.action = 'remove-meal-item';
    removeBtn.dataset.index = String(index);
    removeBtn.textContent = 'Remove';

    top.append(label, removeBtn);

    const gramsLabel = document.createElement('label');
    gramsLabel.textContent = 'Default grams';
    const gramsInput = document.createElement('input');
    gramsInput.type = 'number';
    gramsInput.min = '1';
    gramsInput.step = '1';
    gramsInput.value = String(Math.round(Number(item.gramsDefault || 100)) || 100);
    gramsInput.dataset.index = String(index);
    gramsInput.dataset.action = 'meal-item-grams';
    gramsLabel.appendChild(gramsInput);

    const kcalInfo = document.createElement('div');
    kcalInfo.className = 'muted tiny';
    const grams = Number(item.gramsDefault || 100);
    const per100 = Number(item.per100g?.kcal || 0);
    const kcal = Number.isFinite(grams) && Number.isFinite(per100) ? Math.round((grams / 100) * per100) : 0;
    kcalInfo.textContent = `~ ${kcal} kcal`;

    row.append(top, gramsLabel, kcalInfo);
    wrap.appendChild(row);
  });
}

export function renderMealTemplateSearchResults(items = []) {
  const wrap = el('mealTemplateSearchResults');
  if (!wrap) return;
  wrap.innerHTML = '';

  if (!items.length) {
    const empty = document.createElement('p');
    empty.className = 'muted';
    empty.textContent = 'No matching foods found.';
    wrap.appendChild(empty);
    return;
  }

  items.forEach((item) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'suggestion';
    btn.dataset.action = 'select-meal-item';
    btn.dataset.foodId = item.foodId;

    const left = document.createElement('div');
    const strong = document.createElement('strong');
    strong.textContent = item.label;
    const sub = document.createElement('div');
    sub.className = 'muted tiny';
    sub.textContent = item.groupLabel || '';
    left.append(strong, sub);

    const right = document.createElement('span');
    right.className = 'muted tiny';
    const per100 = macroPer100FromAny(item.nutrition);
    right.textContent = `${Math.round(Number(per100.kcal) || 0)} kcal/100g`;

    btn.append(left, right);
    wrap.appendChild(btn);
  });
}

export function renderRecipes(recipes = []) {
  const wrap = el('recipesRow');
  if (!wrap) return;
  wrap.innerHTML = '';

  const newBtn = document.createElement('button');
  newBtn.type = 'button';
  newBtn.className = 'secondary meal-template-card';
  newBtn.dataset.action = 'new-recipe';
  const title = document.createElement('strong');
  title.textContent = '+ New Recipe';
  const hint = document.createElement('span');
  hint.className = 'muted tiny';
  hint.textContent = 'Create a reusable recipe';
  newBtn.append(title, hint);
  wrap.appendChild(newBtn);

  recipes.forEach((recipe) => {
    const card = document.createElement('div');
    card.className = 'meal-template-card-shell';

    const logBtn = document.createElement('button');
    logBtn.type = 'button';
    logBtn.className = 'meal-template-card';
    logBtn.dataset.action = 'log-recipe';
    logBtn.dataset.recipeId = recipe.id;

    const h = document.createElement('strong');
    h.textContent = String(recipe.name || 'Unnamed recipe');
    const meta = document.createElement('span');
    meta.className = 'muted tiny';
    const perServingKcal = Math.round(Number(recipe?.derived?.perServing?.kcal || 0));
    const servings = Math.round(Number(recipe?.servingsDefault || 1) * 10) / 10;
    meta.textContent = `${(recipe.items || []).length} items • ${perServingKcal} kcal/serving • ${servings} servings`;
    logBtn.append(h, meta);

    const stats = document.createElement('div');
    stats.className = 'muted tiny';
    const per100 = recipe?.derived?.per100g || {};
    stats.textContent = `Per 100g: ${Math.round(Number(per100.kcal || 0))} kcal • P${Math.round(Number(per100.protein || 0))} C${Math.round(Number(per100.carbs || 0))} F${Math.round(Number(per100.fat || 0))}`;

    card.append(logBtn, stats);
    wrap.appendChild(card);
  });
}

export function renderRecipeItems(items = []) {
  const wrap = el('recipeItems');
  if (!wrap) return;
  wrap.innerHTML = '';

  if (!items.length) {
    const empty = document.createElement('p');
    empty.className = 'muted';
    empty.textContent = 'No ingredients yet. Click “Add ingredient”.';
    wrap.appendChild(empty);
    return;
  }

  items.forEach((item, index) => {
    const row = document.createElement('div');
    row.className = 'meal-template-item-row';

    const top = document.createElement('div');
    top.className = 'meal-template-item-top';

    const label = document.createElement('strong');
    label.textContent = item.label;

    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'secondary';
    removeBtn.dataset.action = 'remove-recipe-item';
    removeBtn.dataset.index = String(index);
    removeBtn.textContent = 'Remove';

    top.append(label, removeBtn);

    const gramsLabel = document.createElement('label');
    gramsLabel.textContent = 'Ingredient grams';
    const gramsInput = document.createElement('input');
    gramsInput.type = 'number';
    gramsInput.min = '1';
    gramsInput.step = '1';
    gramsInput.value = String(Math.round(Number(item.grams || 100)) || 100);
    gramsInput.dataset.index = String(index);
    gramsInput.dataset.action = 'recipe-item-grams';
    gramsLabel.appendChild(gramsInput);

    row.append(top, gramsLabel);
    wrap.appendChild(row);
  });
}

export function renderRecipeSearchResults(items = []) {
  const wrap = el('recipeSearchResults');
  if (!wrap) return;
  wrap.innerHTML = '';

  if (!items.length) {
    const empty = document.createElement('p');
    empty.className = 'muted';
    empty.textContent = 'No matching foods found.';
    wrap.appendChild(empty);
    return;
  }

  items.forEach((item) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'suggestion';
    btn.dataset.action = 'select-recipe-item';
    btn.dataset.foodId = item.foodId;

    const left = document.createElement('div');
    const strong = document.createElement('strong');
    strong.textContent = item.label;
    const sub = document.createElement('div');
    sub.className = 'muted tiny';
    sub.textContent = item.groupLabel || '';
    left.append(strong, sub);

    const right = document.createElement('span');
    right.className = 'muted tiny';
    const per100 = macroPer100FromAny(item.nutrition);
    right.textContent = `${Math.round(Number(per100.kcal) || 0)} kcal/100g`;

    btn.append(left, right);
    wrap.appendChild(btn);
  });
}

export function openRecipeDialog() {
  el('recipeDialog').showModal();
}

export function closeRecipeDialog() {
  el('recipeDialog').close();
}

export function openMealTemplateDialog() {
  el('mealTemplateDialog').showModal();
}

export function closeMealTemplateDialog() {
  el('mealTemplateDialog').close();
}
