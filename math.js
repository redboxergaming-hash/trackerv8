export function safeNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function roundTo(value, decimals = 1) {
  const factor = 10 ** decimals;
  return Math.round(safeNumber(value) * factor) / factor;
}

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function computeNutritionFromPer100g(per100g, grams) {
  const g = Math.max(0, safeNumber(grams));
  const ratio = g / 100;
  return {
    kcal: roundTo(safeNumber(per100g.kcal100g) * ratio, 1),
    p: roundTo(safeNumber(per100g.p100g) * ratio, 1),
    c: roundTo(safeNumber(per100g.c100g) * ratio, 1),
    f: roundTo(safeNumber(per100g.f100g) * ratio, 1)
  };
}


export function computeConsistencyBadges({ days = [], streakDays = 0 } = {}) {
  const recent = Array.isArray(days) ? days.slice(0, 7) : [];
  const loggedDays = recent.filter((d) => Boolean(d?.logged)).length;
  const proteinGoalMetDays = recent.filter((d) => Boolean(d?.proteinGoalMet)).length;
  const consistencyScore = roundTo((loggedDays / 7) * 100, 0);

  const badges = [];
  if (Number(streakDays) >= 7) badges.push('Logged 7 days in a row');
  if (proteinGoalMetDays >= 5) badges.push('Hit protein goal 5/7 days');
  if (consistencyScore >= 80) badges.push('Consistency 80%+');

  return {
    consistencyScore,
    loggedDays,
    proteinGoalMetDays,
    badges: badges.slice(0, 3)
  };
}
