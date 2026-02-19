const OFF_BASE_URL = 'https://world.openfoodfacts.org/api/v2/product';
const OFF_SEARCH_URL = 'https://world.openfoodfacts.org/cgi/search.pl';

function parseNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function pickFirstNumber(obj, keys) {
  for (const key of keys) {
    const value = parseNumber(obj?.[key]);
    if (value !== null) return value;
  }
  return null;
}

function pickPer100gNumber(obj, key100g) {
  return parseNumber(obj?.[key100g]);
}

function sodiumMgPer100g(nutriments) {
  const sodiumG = pickFirstNumber(nutriments, ['sodium_100g', 'sodium']);
  if (sodiumG !== null) return sodiumG * 1000;

  const saltG = pickFirstNumber(nutriments, ['salt_100g', 'salt']);
  if (saltG !== null) return saltG * 393;

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

  const microsPer100g = {
    saturatedFat100g: pickPer100gNumber(nutriments, 'saturated-fat_100g'),
    monounsaturatedFat100g: pickPer100gNumber(nutriments, 'monounsaturated-fat_100g'),
    polyunsaturatedFat100g: pickPer100gNumber(nutriments, 'polyunsaturated-fat_100g'),
    omega3100g: pickPer100gNumber(nutriments, 'omega-3-fat_100g'),
    omega6100g: pickPer100gNumber(nutriments, 'omega-6-fat_100g'),
    transFat100g: pickPer100gNumber(nutriments, 'trans-fat_100g'),
    fiber100g: pickFirstNumber(nutriments, ['fiber_100g', 'fiber']),
    sugar100g: pickFirstNumber(nutriments, ['sugars_100g', 'sugars']),
    sodiumMg100g: sodiumMgPer100g(nutriments),
    potassiumMg100g: pickFirstNumber(nutriments, ['potassium_100g', 'potassium']),
    calciumMg100g: pickFirstNumber(nutriments, ['calcium_100g', 'calcium']),
    ironMg100g: pickFirstNumber(nutriments, ['iron_100g', 'iron']),
    vitaminCMg100g: pickFirstNumber(nutriments, ['vitamin-c_100g', 'vitamin-c'])
  };

  return {
    barcode: String(product?.code || barcodeFallback || ''),
    productName: product?.product_name || 'Unknown product',
    brands: product?.brands || '',
    imageUrl: product?.image_front_small_url || product?.image_front_url || '',
    imageThumbUrl,
    nutrition: {
      kcal100g: kcalNormalized,
      p100g: pickFirstNumber(nutriments, ['proteins_100g', 'proteins']),
      c100g: pickFirstNumber(nutriments, ['carbohydrates_100g', 'carbohydrates']),
      f100g: pickFirstNumber(nutriments, ['fat_100g', 'fat']),
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
