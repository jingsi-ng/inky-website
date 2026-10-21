/* ==========================================================================
   inky (印纪) — Shared helpers
   --------------------------------------------------------------------------
   Small building blocks the growth engine (growth.js) and the pages share:
   - hashString / createRng / rngRange  deterministic randomness:
                                        the same text always gives the same design
   - removeAccents / formatDatePlace    tidy text for designs and codes
   - generateOrderCode                  the code a customer quotes when ordering
   - escapeXml                          safe text inside the SVG print file

   (This file used to hold the original brushstroke engine. Every occasion now
   grows from data in growth.js, so only the shared pieces remain.)
   ========================================================================== */

/* --------------------------------------------------------------------------
   1. Deterministic hash + random number generator
   -------------------------------------------------------------------------- */

// DJB2 hash — same string always gives same number
function hashString(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) + h + str.charCodeAt(i)) | 0;
  }
  return h >>> 0;
}

// Linear congruential generator seeded by hash
function createRng(seed) {
  let state = (seed + 1) * 1013904223;
  return function() {
    state = Math.imul(state, 1664525) + 1013904223 | 0;
    return (state >>> 0) / 4294967296;
  };
}

// A random number between min and max from an rng function
function rngRange(rng, min, max) {
  return min + rng() * (max - min);
}

/* --------------------------------------------------------------------------
   2. Text clean-up
   -------------------------------------------------------------------------- */

// Letters that don't decompose into "base + accent"
const LETTER_SWAPS = { 'ł': 'l', 'Ł': 'L', 'ø': 'o', 'Ø': 'O', 'đ': 'd', 'Đ': 'D', 'ß': 'ss', 'æ': 'ae', 'Æ': 'AE', 'œ': 'oe', 'Œ': 'OE', 'þ': 'th', 'Þ': 'Th' };

// Strip Irish fadas and other accents so "Ciarán" → "Ciaran", "Łukasz" → "Lukasz"
function removeAccents(str) {
  return String(str || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[\u0142\u0141\u00f8\u00d8\u0111\u0110\u00df\u00e6\u00c6\u0153\u0152\u00fe\u00de]/g, function(ch) { return LETTER_SWAPS[ch]; });
}

// "12.06.2027 · Dundalk" — skips empty parts
function formatDatePlace(date, place) {
  return [String(date || '').trim(), String(place || '').trim()]
    .filter(function(part) { return part.length > 0; })
    .join(' · ');
}

function escapeXml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/* --------------------------------------------------------------------------
   3. Order code — short and readable: occasion, name, date, and a 5-character
   check that ties it to the exact design key (see growth.js, section 13).
   Example: INK-WE-AOIFEC-12062027-K7Q2M
   -------------------------------------------------------------------------- */
const OCCASION_CODES = { wedding: 'WE', birthday: 'BI', marathon: 'MA', match: 'MT' };

function generateOrderCode(name, date, occasion, check) {
  const n  = removeAccents(name).toUpperCase().replace(/[^A-Z]/g, '').slice(0, 6) || 'INKY';
  const d  = String(date || '').replace(/[^0-9]/g, '').slice(0, 8) || '0';
  const oc = OCCASION_CODES[occasion] || String(occasion).slice(0, 2).toUpperCase();
  return `INK-${oc}-${n}-${d}-${check}`;
}
