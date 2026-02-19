function normalizeNumber(value) {
  if (!value) return null;
  const cleaned = String(value).replace(',', '.').replace(/[^0-9.]+/g, '');
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function extractFirst(text, patterns) {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match && match[1] != null) {
      const value = normalizeNumber(match[1]);
      if (value !== null) return value;
    }
  }
  return null;
}

export function parseLabelText(rawText = '') {
  const text = String(rawText || '');
  const lower = text.toLowerCase();
  const warnings = [];

  const per100 = /(per|je)\s*100\s*g/.test(lower);
  if (!per100) warnings.push('Detected text may not be per 100g. Please verify values manually.');

  const saltG = extractFirst(lower, [
    /(?:salt|salz)\s*[:\-]?\s*([0-9]+(?:[\.,][0-9]+)?)\s*g/i
  ]);
  const sodiumMg = extractFirst(lower, [
    /(?:sodium|natrium)\s*[:\-]?\s*([0-9]+(?:[\.,][0-9]+)?)\s*mg/i
  ]);

  const extracted = {
    macros: {
      kcal100g: extractFirst(lower, [
        /(?:energy|energie)[^\n\r]{0,40}?([0-9]+(?:[\.,][0-9]+)?)\s*kcal/i,
        /([0-9]+(?:[\.,][0-9]+)?)\s*kcal/i
      ]),
      f100g: extractFirst(lower, [
        /(?:fat|fett)\s*[:\-]?\s*([0-9]+(?:[\.,][0-9]+)?)\s*g/i
      ]),
      c100g: extractFirst(lower, [
        /(?:carbohydrate|carbohydrates|kohlenhydrate)\s*[:\-]?\s*([0-9]+(?:[\.,][0-9]+)?)\s*g/i
      ]),
      p100g: extractFirst(lower, [
        /(?:protein|eiwei(?:ß|ss))\s*[:\-]?\s*([0-9]+(?:[\.,][0-9]+)?)\s*g/i
      ])
    },
    micros: {
      sugar_g: extractFirst(lower, [/(?:sugars|sugar|zucker)\s*[:\-]?\s*([0-9]+(?:[\.,][0-9]+)?)\s*g/i]),
      fiber_g: extractFirst(lower, [/(?:fiber|fibre|ballaststoffe?)\s*[:\-]?\s*([0-9]+(?:[\.,][0-9]+)?)\s*g/i]),
      sodium_mg: sodiumMg ?? (saltG !== null ? Math.round(saltG * 393 * 100) / 100 : null),
      salt_g: saltG
    },
    warnings,
    mode: 'text-parse'
  };

  return extracted;
}

async function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('Could not read image file'));
    reader.readAsDataURL(file);
  });
}

async function maybeLoadTesseract() {
  if (window.Tesseract) return window.Tesseract;
  await new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-tesseract-loader="1"]');
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error('Failed to load OCR library')), { once: true });
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://unpkg.com/tesseract.js@5/dist/tesseract.min.js';
    script.async = true;
    script.dataset.tesseractLoader = '1';
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load OCR library'));
    document.head.appendChild(script);
  });
  return window.Tesseract;
}

export async function scanLabel(imageFile, { attemptOcr = true } = {}) {
  const warnings = [];
  if (!imageFile) {
    return { macros: {}, micros: {}, warnings: ['No image selected.'], mode: 'none' };
  }

  if (attemptOcr) {
    try {
      const Tesseract = await maybeLoadTesseract();
      const dataUrl = await readFileAsDataUrl(imageFile);
      const result = await Tesseract.recognize(dataUrl, 'eng+deu');
      const text = String(result?.data?.text || '');
      if (text.trim()) {
        const parsed = parseLabelText(text);
        parsed.mode = 'ocr';
        return parsed;
      }
      warnings.push('OCR returned no readable text.');
    } catch (error) {
      warnings.push('OCR unavailable in this environment. Use paste-text fallback.');
    }
  }

  return { macros: {}, micros: {}, warnings, mode: 'fallback' };
}
