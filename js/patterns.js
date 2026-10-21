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

// Strip Irish fadas and other accents so "Ciarán" → "Ciaran"
function removeAccents(str) {
  return String(str || '').normalize('NFD').replace(/[̀-ͯ]/g, '');
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
   3. Order code — who / when / where / which variation.
   The generator appends the data the design grew from (see growth.js,
   encodeDesignCode), so the code alone rebuilds the exact design.
   Example: INK-WE-AOIFE-12062027-DUN-01-Y8-G120-I5
   -------------------------------------------------------------------------- */
const OCCASION_CODES = { wedding: 'WE', birthday: 'BI', marathon: 'MA', match: 'MT' };

function generateOrderCode(name, date, place, occasion, seed) {
  const n  = removeAccents(name).toUpperCase().replace(/[^A-Z]/g, '').slice(0, 6) || 'INKY';
  const d  = String(date || '').replace(/[^0-9]/g, '').slice(0, 8) || '0';
  const pl = removeAccents(place).toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3) || 'X';
  const oc = OCCASION_CODES[occasion] || occasion.slice(0, 2).toUpperCase();
  const sv = String(seed).padStart(2, '0');
  return `INK-${oc}-${n}-${d}-${pl}-${sv}`;
}
