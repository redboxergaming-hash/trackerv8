const OFF_BASE_URL = 'https://world.openfoodfacts.org/api/v2/product';
const OFF_SEARCH_URL = 'https://world.openfoodfacts.org/cgi/search.pl';

function parseNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function normalizeNutrientValue(value) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function convertUnitsToTarget(value, unit, targetUnit) {
  const v = normalizeNutrientValue(value);
  if (v === null) return null;
  const from = String(unit || '').toLowerCase();
  const to = String(targetUnit || '').toLowerCase();
  if (!from || !to || from === to) return v;

  if (from === 'g' && to === 'mg') return v * 1000;
  if (from === 'mg' && to === 'g') return v / 1000;
  if (from === 'mg' && to === 'ug') return v * 1000;
  if (from === 'ug' && to === 'mg') return v / 1000;
  if (from === 'g' && to === 'ug') return v * 1000000;
  if (from === 'ug' && to === 'g') return v / 1000000;
  return null;
}

function pickFirstNumber(obj, keys) {
  for (const key of keys) {
    const value = parseNumber(obj?.[key]);
    if (value !== null) return value;
  }
  return null;
}

function pickPer100gNumber(obj, key100g) {
  return normalizeNutrientValue(obj?.[key100g]);
}

function sodiumMgPer100g(nutriments) {
  const sodiumG = pickFirstNumber(nutriments, ['sodium_100g', 'sodium']);
  if (sodiumG !== null) return convertUnitsToTarget(sodiumG, 'g', 'mg');

  const saltG = pickFirstNumber(nutriments, ['salt_100g', 'salt']);
  if (saltG !== null) return normalizeNutrientValue(saltG * 393);

  return null;
}

function normalizePer100g(product, barcodeFallback = '') {
  const nutriments = product?.nutriments || {};

  const kcal = pickFirstNumber(nutriments, ['energy-kcal_100g', 'energy-kcal']);
  const kj = pickFirstNumber(nutriments, ['energy-kj_100g', 'energy-kj']);
  const kcalNormalized = kcal ?? (kj !== null ? kj / 4.184 : null);

  const selectedFront = product?.selected_images?.front;
  const imageThumbUrl =
    product?.image_front_small_url
    || selectedFront?.small?.en
    || selectedFront?.small?.fr
    || selectedFront?.small?.de
    || product?.image_front_thumb_url
    || product?.image_front_url
    || '';

  const microsPer100g = {};
  const fiber = pickFirstNumber(nutriments, ['fiber_100g', 'fiber']);
  if (fiber !== null) microsPer100g.fiber_g = normalizeNutrientValue(fiber);
  const sugar = pickFirstNumber(nutriments, ['sugars_100g', 'sugars']);
  if (sugar !== null) microsPer100g.sugar_g = normalizeNutrientValue(sugar);
  const sodium = sodiumMgPer100g(nutriments);
  if (sodium !== null) microsPer100g.sodium_mg = normalizeNutrientValue(sodium);

  const potassium = pickFirstNumber(nutriments, ['potassium_100g', 'potassium']);
  const potassiumUnit = (product?.nutriments_units?.potassium || 'mg').toLowerCase();
  const potassiumMg = convertUnitsToTarget(potassium, potassiumUnit, 'mg');
  if (potassiumMg !== null) microsPer100g.potassium_mg = normalizeNutrientValue(potassiumMg);

  const calcium = pickFirstNumber(nutriments, ['calcium_100g', 'calcium']);
  const calciumUnit = (product?.nutriments_units?.calcium || 'mg').toLowerCase();
  const calciumMg = convertUnitsToTarget(calcium, calciumUnit, 'mg');
  if (calciumMg !== null) microsPer100g.calcium_mg = normalizeNutrientValue(calciumMg);

  const magnesium = pickFirstNumber(nutriments, ['magnesium_100g', 'magnesium']);
  const magnesiumUnit = (product?.nutriments_units?.magnesium || 'mg').toLowerCase();
  const magnesiumMg = convertUnitsToTarget(magnesium, magnesiumUnit, 'mg');
  if (magnesiumMg !== null) microsPer100g.magnesium_mg = normalizeNutrientValue(magnesiumMg);

  const iron = pickFirstNumber(nutriments, ['iron_100g', 'iron']);
  const ironUnit = (product?.nutriments_units?.iron || 'mg').toLowerCase();
  const ironMg = convertUnitsToTarget(iron, ironUnit, 'mg');
  if (ironMg !== null) microsPer100g.iron_mg = normalizeNutrientValue(ironMg);

  const zinc = pickFirstNumber(nutriments, ['zinc_100g', 'zinc']);
  const zincUnit = (product?.nutriments_units?.zinc || 'mg').toLowerCase();
  const zincMg = convertUnitsToTarget(zinc, zincUnit, 'mg');
  if (zincMg !== null) microsPer100g.zinc_mg = normalizeNutrientValue(zincMg);

  const vitaminC = pickFirstNumber(nutriments, ['vitamin-c_100g', 'vitamin-c']);
  const vitaminCUnit = (product?.nutriments_units?.['vitamin-c'] || 'mg').toLowerCase();
  const vitaminCMg = convertUnitsToTarget(vitaminC, vitaminCUnit, 'mg');
  if (vitaminCMg !== null) microsPer100g.vitamin_c_mg = normalizeNutrientValue(vitaminCMg);

  const vitaminD = pickFirstNumber(nutriments, ['vitamin-d_100g', 'vitamin-d']);
  const vitaminDUnit = (product?.nutriments_units?.['vitamin-d'] || '').toLowerCase();
  const vitaminDUg = convertUnitsToTarget(vitaminD, vitaminDUnit, 'ug');
  if (vitaminDUg !== null) microsPer100g.vitamin_d_ug = normalizeNutrientValue(vitaminDUg);

  const per100g = {
    kcal: kcalNormalized,
    protein: pickFirstNumber(nutriments, ['proteins_100g', 'proteins']),
    carbs: pickFirstNumber(nutriments, ['carbohydrates_100g', 'carbohydrates']),
    fat: pickFirstNumber(nutriments, ['fat_100g', 'fat'])
  };

  return {
    barcode: String(product?.code || barcodeFallback || ''),
    productName: product?.product_name || 'Unknown product',
    brands: product?.brands || '',
    imageUrl: product?.image_front_small_url || product?.image_front_url || '',
    imageThumbUrl,
    per100g,
    nutrition: {
      kcal100g: per100g.kcal,
      p100g: per100g.protein,
      c100g: per100g.carbs,
      f100g: per100g.fat,
      ...microsPer100g
    },
    microsPer100g,
    source: 'Open Food Facts',
    fetchedAt: Date.now()
  };
}

export async function lookupOpenFoodFacts(barcode) {
  const response = await fetch(`${OFF_BASE_URL}/${encodeURIComponent(barcode)}.json`);
  if (!response.ok) {
    throw new Error(`OFF lookup failed: ${response.status}`);
  }

  const data = await response.json();
  if (data?.status !== 1 || !data?.product) {
    throw new Error('Product not found in Open Food Facts');
  }

  return normalizePer100g(data.product, barcode);
}

export async function searchOpenFoodFacts(query, pageSize = 12) {
  const q = String(query || '').trim();
  if (q.length < 2) return [];

  const url = new URL(OFF_SEARCH_URL);
  url.searchParams.set('search_terms', q);
  url.searchParams.set('search_simple', '1');
  url.searchParams.set('action', 'process');
  url.searchParams.set('json', '1');
  url.searchParams.set('page_size', String(Math.max(1, Math.min(20, Number(pageSize) || 12))));
  url.searchParams.set('fields', 'code,product_name,brands,nutriments,image_small_url,image_front_small_url,image_front_url,selected_images');

  const response = await fetch(url.toString());
  if (!response.ok) {
    throw new Error(`OFF search failed: ${response.status}`);
  }

  const data = await response.json();
  const products = Array.isArray(data?.products) ? data.products : [];
  return products
    .map((product) => normalizePer100g(product, product?.code || ''))
    .filter((item) => item.productName && (item.nutrition?.kcal100g !== null || item.nutrition?.p100g !== null || item.nutrition?.c100g !== null || item.nutrition?.f100g !== null));
}
