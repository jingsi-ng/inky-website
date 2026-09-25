/* ==========================================================================
   inky (印纪) — Pattern algorithm library
   --------------------------------------------------------------------------
   Everything that decides WHAT a pattern looks like lives here.
   - hashString / createRng  : deterministic randomness (same input → same art)
   - LETTER_STROKES          : a hand-drawn skeleton for every letter A–Z
   - PALETTES                : one colour palette per occasion
   - buildPatternData        : turns name/date/place/occasion/seed into pure data
   - paintPattern            : draws that data onto any p5 canvas or p5.Graphics
   - generateOrderCode       : the code a customer quotes when ordering
   - buildPatternSvg         : a vector (SVG) version of the same pattern

   All coordinates inside the pattern data are NORMALISED (0–1), and all
   pixel sizes are written for a 560px reference canvas. That is what lets
   the exact same design be painted at 200px, 560px or 2400px.

   Loaded as a plain <script> before generator.js / main.js, so every
   function here is available to those files.
   ========================================================================== */

// Pixel sizes in the spec are designed for a canvas of this width.
const REFERENCE_SIZE = 560;

/* --------------------------------------------------------------------------
   1. Letter stroke skeletons
   Each letter = array of strokes; each stroke = array of [x, y] points in a
   0–1 unit square (origin top-left). Curved letters use 6–12 points.
   -------------------------------------------------------------------------- */
const LETTER_STROKES = {
  A: [
    [[0.5, 0.05], [0.15, 0.95]],                 // left leg
    [[0.5, 0.05], [0.85, 0.95]],                 // right leg
    [[0.25, 0.58], [0.75, 0.58]]                 // crossbar
  ],
  B: [
    [[0.2, 0.05], [0.2, 0.95]],
    [[0.2, 0.05], [0.65, 0.05], [0.8, 0.15], [0.8, 0.3], [0.65, 0.5], [0.2, 0.5]],
    [[0.2, 0.5], [0.7, 0.5], [0.85, 0.65], [0.85, 0.82], [0.7, 0.95], [0.2, 0.95]]
  ],
  C: [
    [[0.82, 0.2], [0.66, 0.07], [0.46, 0.05], [0.27, 0.14], [0.16, 0.33],
     [0.15, 0.6], [0.24, 0.8], [0.43, 0.94], [0.64, 0.94], [0.83, 0.8]]
  ],
  D: [
    [[0.2, 0.05], [0.2, 0.95]],
    [[0.2, 0.05], [0.5, 0.06], [0.71, 0.17], [0.84, 0.37], [0.84, 0.62],
     [0.72, 0.82], [0.5, 0.94], [0.2, 0.95]]
  ],
  E: [
    [[0.22, 0.05], [0.22, 0.95]],
    [[0.22, 0.05], [0.8, 0.05]],
    [[0.22, 0.5], [0.68, 0.5]],
    [[0.22, 0.95], [0.82, 0.95]]
  ],
  F: [
    [[0.24, 0.05], [0.24, 0.95]],
    [[0.24, 0.05], [0.82, 0.05]],
    [[0.24, 0.5], [0.68, 0.5]]
  ],
  G: [
    [[0.82, 0.2], [0.66, 0.07], [0.46, 0.05], [0.27, 0.14], [0.16, 0.33],
     [0.15, 0.6], [0.24, 0.8], [0.43, 0.94], [0.64, 0.94], [0.84, 0.82], [0.85, 0.58]],
    [[0.55, 0.58], [0.86, 0.58]]
  ],
  H: [
    [[0.18, 0.05], [0.18, 0.95]],
    [[0.82, 0.05], [0.82, 0.95]],
    [[0.18, 0.5], [0.82, 0.5]]
  ],
  I: [
    [[0.5, 0.05], [0.5, 0.95]],
    [[0.3, 0.05], [0.7, 0.05]],
    [[0.3, 0.95], [0.7, 0.95]]
  ],
  J: [
    [[0.32, 0.05], [0.85, 0.05]],
    [[0.66, 0.05], [0.66, 0.7], [0.6, 0.86], [0.47, 0.95], [0.32, 0.93], [0.2, 0.82]]
  ],
  K: [
    [[0.2, 0.05], [0.2, 0.95]],
    [[0.8, 0.05], [0.22, 0.56]],
    [[0.4, 0.42], [0.85, 0.95]]
  ],
  L: [
    [[0.24, 0.05], [0.24, 0.95]],
    [[0.24, 0.95], [0.82, 0.95]]
  ],
  M: [
    [[0.12, 0.95], [0.18, 0.05]],
    [[0.18, 0.05], [0.5, 0.65]],
    [[0.5, 0.65], [0.82, 0.05]],
    [[0.82, 0.05], [0.88, 0.95]]
  ],
  N: [
    [[0.18, 0.95], [0.18, 0.05]],
    [[0.18, 0.05], [0.82, 0.95]],
    [[0.82, 0.95], [0.82, 0.05]]
  ],
  O: [
    [[0.5, 0.05], [0.72, 0.12], [0.85, 0.3], [0.87, 0.52], [0.8, 0.75],
     [0.63, 0.92], [0.42, 0.94], [0.23, 0.82], [0.13, 0.6], [0.15, 0.34],
     [0.28, 0.13], [0.5, 0.05]]
  ],
  P: [
    [[0.22, 0.05], [0.22, 0.95]],
    [[0.22, 0.05], [0.62, 0.05], [0.78, 0.13], [0.84, 0.28], [0.78, 0.44],
     [0.62, 0.52], [0.22, 0.52]]
  ],
  Q: [
    [[0.5, 0.05], [0.72, 0.12], [0.85, 0.3], [0.87, 0.52], [0.8, 0.75],
     [0.63, 0.92], [0.42, 0.94], [0.23, 0.82], [0.13, 0.6], [0.15, 0.34],
     [0.28, 0.13], [0.5, 0.05]],
    [[0.55, 0.7], [0.72, 0.86], [0.92, 1.0]]
  ],
  R: [
    [[0.22, 0.05], [0.22, 0.95]],
    [[0.22, 0.05], [0.62, 0.05], [0.78, 0.13], [0.84, 0.28], [0.78, 0.44],
     [0.62, 0.52], [0.22, 0.52]],
    [[0.48, 0.52], [0.86, 0.95]]
  ],
  S: [
    [[0.8, 0.16], [0.63, 0.05], [0.4, 0.05], [0.22, 0.15], [0.2, 0.33],
     [0.38, 0.47], [0.62, 0.54], [0.8, 0.66], [0.8, 0.85], [0.61, 0.95],
     [0.37, 0.95], [0.17, 0.84]]
  ],
  T: [
    [[0.12, 0.05], [0.88, 0.05]],
    [[0.5, 0.05], [0.5, 0.95]]
  ],
  U: [
    [[0.18, 0.05], [0.18, 0.64], [0.25, 0.84], [0.4, 0.95], [0.6, 0.95],
     [0.75, 0.84], [0.82, 0.64], [0.82, 0.05]]
  ],
  V: [
    [[0.14, 0.05], [0.5, 0.95]],
    [[0.5, 0.95], [0.86, 0.05]]
  ],
  W: [
    [[0.08, 0.05], [0.28, 0.95]],
    [[0.28, 0.95], [0.5, 0.35]],
    [[0.5, 0.35], [0.72, 0.95]],
    [[0.72, 0.95], [0.92, 0.05]]
  ],
  X: [
    [[0.16, 0.05], [0.84, 0.95]],
    [[0.84, 0.05], [0.16, 0.95]]
  ],
  Y: [
    [[0.14, 0.05], [0.5, 0.5]],
    [[0.86, 0.05], [0.5, 0.5]],
    [[0.5, 0.5], [0.5, 0.95]]
  ],
  Z: [
    [[0.16, 0.05], [0.84, 0.05]],
    [[0.84, 0.05], [0.16, 0.95]],
    [[0.16, 0.95], [0.86, 0.95]]
  ],
  // Ampersand — so "Aoife & Ciarán" gets a flourish between the two names
  '&': [
    [[0.84, 0.95], [0.34, 0.42], [0.26, 0.24], [0.36, 0.07], [0.54, 0.08],
     [0.6, 0.25], [0.46, 0.42], [0.22, 0.6], [0.2, 0.82], [0.36, 0.95],
     [0.58, 0.92], [0.84, 0.58]]
  ],
  // Space: takes up a lane but draws nothing
  ' ': []
};

/* --------------------------------------------------------------------------
   2. Deterministic hash + random number generator
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

// Small helpers built on top of an rng function
function rngRange(rng, min, max) {
  return min + rng() * (max - min);
}

function rngInt(rng, min, max) {
  // inclusive of both ends
  return Math.floor(rngRange(rng, min, max + 1));
}

function rngPick(rng, list) {
  return list[Math.floor(rng() * list.length)];
}

/* --------------------------------------------------------------------------
   3. Occasion palettes
   -------------------------------------------------------------------------- */
const PALETTES = {
  wedding: {
    bg: '#f5ede0',
    brushColors: ['#c2a888', '#8c6040', '#c8b090', '#d4bc9c'],
    accent: '#8c4a2a',
    ink: '#2a1e10'
  },
  birthday: {
    bg: '#edf0e6',
    brushColors: ['#88a870', '#4a6828', '#a8c890', '#6a9858'],
    accent: '#3a5818',
    ink: '#1c2814'
  },
  marathon: {
    bg: '#f0e8e0',
    brushColors: ['#b89078', '#7a4830', '#d0a888', '#a07858'],
    accent: '#6a3820',
    ink: '#241810'
  },
  match: {
    bg: '#e8eaf0',
    brushColors: ['#8090b8', '#304870', '#a0b0d0', '#5870a0'],
    accent: '#2a3860',
    ink: '#141c28'
  }
};

// Human-readable occasion names (used in labels + corner typography)
const OCCASION_LABELS = {
  wedding: 'Wedding',
  birthday: 'Birthday',
  marathon: 'Marathon',
  match: 'Match / GAA'
};

/* --------------------------------------------------------------------------
   4. Text clean-up helpers
   -------------------------------------------------------------------------- */

// Strip Irish fadas and other accents so "Ciarán" → "Ciaran"
function removeAccents(str) {
  return String(str || '').normalize('NFD').replace(/[̀-ͯ]/g, '');
}

// The letters that get turned into brushstrokes (max 16)
function lettersFromName(name) {
  return removeAccents(name).toUpperCase().replace(/[^A-Z &]/g, '').slice(0, 16);
}

// "12.06.2027 · Dundalk" — skips empty parts
function formatDatePlace(date, place) {
  return [String(date || '').trim(), String(place || '').trim()]
    .filter(function(part) { return part.length > 0; })
    .join(' · ');
}

/* --------------------------------------------------------------------------
   5. Geometry helpers for walking along a letter stroke
   -------------------------------------------------------------------------- */

// Total length of a polyline
function polylineLength(points) {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]);
  }
  return total;
}

// Point + direction at fraction t (0–1) of the way along a polyline
function pointAlongPolyline(points, t) {
  if (points.length === 1) {
    return { x: points[0][0], y: points[0][1], angle: 0 };
  }
  const target = polylineLength(points) * t;
  let walked = 0;
  for (let i = 1; i < points.length; i++) {
    const ax = points[i - 1][0], ay = points[i - 1][1];
    const bx = points[i][0], by = points[i][1];
    const segment = Math.hypot(bx - ax, by - ay);
    if (walked + segment >= target || i === points.length - 1) {
      const local = segment === 0 ? 0 : Math.min(1, (target - walked) / segment);
      return {
        x: ax + (bx - ax) * local,
        y: ay + (by - ay) * local,
        angle: Math.atan2(by - ay, bx - ax)
      };
    }
    walked += segment;
  }
}

/* --------------------------------------------------------------------------
   6. buildPatternData — pure data, no drawing
   Returns an ordered list of elements. Each element has a `type` and
   normalised coordinates. `px` values are pixels at REFERENCE_SIZE.
   -------------------------------------------------------------------------- */
function buildPatternData(name, date, place, occasion, seedOffset) {
  const seedKey = removeAccents(name).toUpperCase() + '::' + date + '::' + place + '::' + occasion + '::' + seedOffset;
  const seed = hashString(seedKey);
  const rng = createRng(seed);

  const palette = PALETTES[occasion] || PALETTES.wedding;
  // Fall back to the brand name so an empty field still makes a pattern
  const letters = lettersFromName(name) || 'INKY';

  const elements = [];
  const px = function(value) { return value / REFERENCE_SIZE; }; // px → normalised

  addBackgroundDots(elements, rng, palette, px);
  addGeometricUnderlay(elements, rng, palette, px);
  const letterCentres = addLetterBrushstrokes(elements, rng, palette, px, letters);
  addDecorativeLines(elements, rng, palette, px, letterCentres);
  addAccentMarks(elements, rng, palette, px);

  // (Text is drawn directly by paintPattern, not stored as data)
  return { elements, palette, letters, seed };
}

// 1. Paper-grain dot field
function addBackgroundDots(elements, rng, palette, px) {
  for (let i = 0; i < 200; i++) {
    elements.push({
      type: 'dot',
      layer: 'background',
      x: rng(),
      y: rng(),
      r: px(rngRange(rng, 1, 2)),
      color: palette.brushColors[3],
      alpha: rngRange(rng, 0.05, 0.1)
    });
  }
}

// 2. Large, very faint geometric shapes behind everything
function addGeometricUnderlay(elements, rng, palette, px) {
  const shapeCount = rngInt(rng, 3, 6);
  const shapeTypes = ['arc', 'rect', 'triangle', 'diagonal', 'polygon'];

  for (let i = 0; i < shapeCount; i++) {
    const shapeType = rngPick(rng, shapeTypes);
    const color = rngPick(rng, palette.brushColors);
    const alpha = rngRange(rng, 0.04, 0.08);
    const base = { layer: 'underlay', color, alpha };

    if (shapeType === 'arc') {
      const start = rngRange(rng, 0, Math.PI * 2);
      elements.push(Object.assign({}, base, {
        type: 'arc',
        x: rngRange(rng, 0.2, 0.8),
        y: rngRange(rng, 0.2, 0.7),
        d: rngRange(rng, 0.35, 0.8),
        start: start,
        stop: start + rngRange(rng, Math.PI * 0.6, Math.PI * 2),
        weight: px(rngRange(rng, 6, 18))   // thick, soft wash of colour
      }));
    } else if (shapeType === 'rect') {
      const w = rngRange(rng, 0.25, 0.6);
      const h = rngRange(rng, 0.2, 0.55);
      elements.push(Object.assign({}, base, {
        type: 'rect',
        x: rngRange(rng, 0.05, 0.95 - w),
        y: rngRange(rng, 0.05, 0.9 - h),
        w: w,
        h: h,
        weight: px(1),
        alpha: alpha * 2.5 // a 1px outline needs more alpha to read at all
      }));
    } else if (shapeType === 'triangle') {
      const cx = rngRange(rng, 0.25, 0.75);
      const cy = rngRange(rng, 0.25, 0.65);
      const size = rngRange(rng, 0.2, 0.4);
      const points = [];
      for (let k = 0; k < 3; k++) {
        const angle = rng() * Math.PI * 2;
        points.push([cx + Math.cos(angle) * size, cy + Math.sin(angle) * size]);
      }
      elements.push(Object.assign({}, base, { type: 'polygon', points: points }));
    } else if (shapeType === 'diagonal') {
      const fromLeft = rng() < 0.5;
      elements.push(Object.assign({}, base, {
        type: 'line',
        x1: fromLeft ? rngRange(rng, 0, 0.15) : rngRange(rng, 0.85, 1),
        y1: rngRange(rng, 0, 0.2),
        x2: fromLeft ? rngRange(rng, 0.85, 1) : rngRange(rng, 0, 0.15),
        y2: rngRange(rng, 0.8, 1),
        weight: px(1),
        alpha: alpha * 2.5
      }));
    } else {
      // Irregular polygon with 5–7 points around a centre
      const cx = rngRange(rng, 0.25, 0.75);
      const cy = rngRange(rng, 0.25, 0.65);
      const pointCount = rngInt(rng, 5, 7);
      const points = [];
      for (let k = 0; k < pointCount; k++) {
        const angle = (k / pointCount) * Math.PI * 2 + rngRange(rng, -0.3, 0.3);
        const radius = rngRange(rng, 0.12, 0.32);
        points.push([cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius]);
      }
      elements.push(Object.assign({}, base, { type: 'polygon', points: points }));
    }
  }
}

// 3. The main event: brushstroke bundles traced along each letter
function addLetterBrushstrokes(elements, rng, palette, px, letters) {
  const marginX = 0.07;
  const bandTop = 0.13;       // letters live between 13% and 66% of height
  const bandHeight = 0.53;
  const laneWidth = (1 - marginX * 2) / letters.length;
  const letterCentres = [];

  for (let i = 0; i < letters.length; i++) {
    const letter = letters[i];
    const strokes = LETTER_STROKES[letter] || [];

    // Each letter sits in its own lane, nudged up/down a little for rhythm
    const boxWidth = Math.min(laneWidth * 0.82, 0.26);
    const boxX = marginX + laneWidth * i + (laneWidth - boxWidth) / 2;
    const boxY = bandTop + rngRange(rng, -0.025, 0.025);
    const toCanvas = function(pt) {
      return [boxX + pt[0] * boxWidth, boxY + pt[1] * bandHeight];
    };

    if (strokes.length > 0) {
      letterCentres.push({ x: boxX + boxWidth / 2, y: boxY + bandHeight / 2 });
    }

    strokes.forEach(function(stroke) {
      const path = stroke.map(toCanvas);
      const markCount = rngInt(rng, 6, 12);
      for (let m = 0; m < markCount; m++) {
        // Spread marks evenly along the stroke, with a little wobble
        const t = Math.min(1, Math.max(0, (m + 0.5) / markCount + rngRange(rng, -0.04, 0.04)));
        const spot = pointAlongPolyline(path, t);
        elements.push(makeBrushMark(rng, palette, px,
          spot.x + rngRange(rng, -0.006, 0.006),
          spot.y + rngRange(rng, -0.006, 0.006),
          spot.angle + rngRange(rng, -0.4, 0.4)));
      }
    });

    // Scatter strokes that bleed out of the lane — keeps it organic
    if (strokes.length > 0) {
      const scatterCount = rngInt(rng, 4, 8);
      for (let s = 0; s < scatterCount; s++) {
        elements.push(makeBrushMark(rng, palette, px,
          boxX + boxWidth / 2 + rngRange(rng, -laneWidth * 0.95, laneWidth * 0.95),
          boxY + rngRange(rng, -0.04, bandHeight + 0.04),
          rngRange(rng, 0, Math.PI * 2)));
      }
    }
  }

  return letterCentres;
}

// One short, tapered brush mark centred on (x, y)
function makeBrushMark(rng, palette, px, x, y, angle) {
  const length = rngRange(rng, 0.015, 0.05);
  return {
    type: 'brush',
    layer: 'brush',
    x1: x - Math.cos(angle) * length / 2,
    y1: y - Math.sin(angle) * length / 2,
    x2: x + Math.cos(angle) * length / 2,
    y2: y + Math.sin(angle) * length / 2,
    weight: px(rngRange(rng, 0.8, 4)),
    color: rngPick(rng, palette.brushColors),
    alpha: rngRange(rng, 0.25, 0.75)
  };
}

// 4. Ruling lines + stamp-like rings
function addDecorativeLines(elements, rng, palette, px, letterCentres) {
  const ruleCount = rngInt(rng, 3, 5);
  for (let i = 0; i < ruleCount; i++) {
    const y = rngRange(rng, 0.2, 0.75);
    const tilt = rng() < 0.6 ? 0 : rngRange(rng, -0.12, 0.12); // mostly horizontal
    elements.push({
      type: 'line',
      layer: 'decor',
      x1: rngRange(rng, 0.02, 0.2),
      y1: y,
      x2: rngRange(rng, 0.8, 0.98),
      y2: y + tilt,
      weight: px(0.5),
      color: palette.ink,
      alpha: rngRange(rng, 0.12, 0.2)
    });
  }

  const ringCount = rngInt(rng, 2, 3);
  for (let i = 0; i < ringCount; i++) {
    const centre = letterCentres.length > 0
      ? rngPick(rng, letterCentres)
      : { x: 0.5, y: 0.4 };
    elements.push({
      type: 'ring',
      layer: 'decor',
      x: centre.x + rngRange(rng, -0.05, 0.05),
      y: centre.y + rngRange(rng, -0.12, 0.12),
      r: px(rngRange(rng, 15, 35)),
      weight: px(rngRange(rng, 0.6, 1.2)),
      color: palette.accent,
      alpha: rngRange(rng, 0.15, 0.3)
    });
  }
}

// 5. Small crafted accents: + ◇ • /
function addAccentMarks(elements, rng, palette, px) {
  const markCount = rngInt(rng, 8, 15);
  const markTypes = ['cross', 'diamond', 'tinyCircle', 'tick'];

  for (let i = 0; i < markCount; i++) {
    const markType = rngPick(rng, markTypes);
    const mark = {
      type: markType,
      layer: 'accent',
      x: rngRange(rng, 0.05, 0.95),
      y: rngRange(rng, 0.08, 0.72),   // keep clear of the name text
      color: palette.accent,
      alpha: rngRange(rng, 0.2, 0.45),
      weight: px(1)
    };
    if (markType === 'cross') mark.size = px(rngRange(rng, 6, 10));
    if (markType === 'diamond') {
      mark.size = px(rngRange(rng, 4, 8));
      mark.angle = Math.PI / 4 + rngRange(rng, -0.2, 0.2);
    }
    if (markType === 'tinyCircle') mark.r = px(rngRange(rng, 2, 4));
    if (markType === 'tick') {
      mark.size = px(rngRange(rng, 5, 8));
      mark.angle = rngRange(rng, 0, Math.PI * 2);
    }
    elements.push(mark);
  }
}

/* --------------------------------------------------------------------------
   7. paintPattern — draws everything onto a p5 instance OR a p5.Graphics
   `options.progress` (0–1) reveals brush marks gradually (used by the
   animated hero on the landing page). Defaults to fully drawn.
   -------------------------------------------------------------------------- */
function paintPattern(p, size, name, date, place, occasion, seed, options) {
  const opts = options || {};
  const progress = opts.progress === undefined ? 1 : opts.progress;
  const data = buildPatternData(name, date, place, occasion, seed);
  const palette = data.palette;

  p.push();
  p.background(palette.bg);

  // Brush marks appear one after another as progress goes 0 → 1
  const brushTotal = data.elements.filter(function(el) { return el.layer === 'brush'; }).length;
  const brushVisible = Math.floor(brushTotal * progress);
  let brushDrawn = 0;

  data.elements.forEach(function(el) {
    if (el.layer === 'brush') {
      if (brushDrawn >= brushVisible) return;
      brushDrawn++;
    }
    // Decoration fades in during the last part of the reveal
    const fade = (el.layer === 'decor' || el.layer === 'accent')
      ? Math.max(0, Math.min(1, (progress - 0.7) / 0.3))
      : 1;
    drawElement(p, size, el, fade);
  });

  drawPatternText(p, size, name, date, place, occasion, seed, palette);
  p.pop();
}

// Convert "#rrggbb" + alpha(0–1) into p5 colour arguments [r, g, b, a255]
function hexToRgba(hex, alpha) {
  const value = parseInt(hex.replace('#', ''), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255, Math.round(alpha * 255)];
}

function setStroke(p, color, alpha, weight) {
  const rgba = hexToRgba(color, alpha);
  p.stroke(rgba[0], rgba[1], rgba[2], rgba[3]);
  p.strokeWeight(weight);
}

function setFill(p, color, alpha) {
  const rgba = hexToRgba(color, alpha);
  p.fill(rgba[0], rgba[1], rgba[2], rgba[3]);
}

// Draws a single data element at canvas `size`
function drawElement(p, size, el, fade) {
  const alpha = el.alpha * fade;
  if (alpha <= 0) return;
  const S = function(v) { return v * size; };

  switch (el.type) {
    case 'dot':
      p.noStroke();
      setFill(p, el.color, alpha);
      p.circle(S(el.x), S(el.y), S(el.r) * 2);
      break;

    case 'arc':
      p.noFill();
      setStroke(p, el.color, alpha, S(el.weight));
      p.strokeCap('round');
      p.arc(S(el.x), S(el.y), S(el.d), S(el.d), el.start, el.stop);
      break;

    case 'rect':
      p.noFill();
      setStroke(p, el.color, alpha, S(el.weight));
      p.rect(S(el.x), S(el.y), S(el.w), S(el.h));
      break;

    case 'polygon':
      p.noStroke();
      setFill(p, el.color, alpha);
      p.beginShape();
      el.points.forEach(function(pt) { p.vertex(S(pt[0]), S(pt[1])); });
      p.endShape('close');
      break;

    case 'line':
      setStroke(p, el.color, alpha, S(el.weight));
      p.line(S(el.x1), S(el.y1), S(el.x2), S(el.y2));
      break;

    case 'brush':
      drawBrushMark(p, S, el, alpha);
      break;

    case 'ring':
      p.noFill();
      setStroke(p, el.color, alpha, S(el.weight));
      p.circle(S(el.x), S(el.y), S(el.r) * 2);
      break;

    case 'cross': {
      const half = S(el.size) / 2;
      setStroke(p, el.color, alpha, S(el.weight));
      p.line(S(el.x) - half, S(el.y), S(el.x) + half, S(el.y));
      p.line(S(el.x), S(el.y) - half, S(el.x), S(el.y) + half);
      break;
    }

    case 'diamond': {
      const side = S(el.size);
      p.push();
      p.translate(S(el.x), S(el.y));
      p.rotate(el.angle);
      p.noStroke();
      setFill(p, el.color, alpha);
      p.rect(-side / 2, -side / 2, side, side);
      p.pop();
      break;
    }

    case 'tinyCircle':
      p.noStroke();
      setFill(p, el.color, alpha);
      p.circle(S(el.x), S(el.y), S(el.r) * 2);
      break;

    case 'tick': {
      const half = S(el.size) / 2;
      const dx = Math.cos(el.angle) * half;
      const dy = Math.sin(el.angle) * half;
      setStroke(p, el.color, alpha, S(el.weight));
      p.line(S(el.x) - dx, S(el.y) - dy, S(el.x) + dx, S(el.y) + dy);
      break;
    }
  }
}

// A brush mark is a chain of short lines whose weight swells then thins:
// the brush lands, presses, and lifts off — a tapered stroke of ink.
const BRUSH_PROFILE = [
  { from: 0.0,  to: 0.2,  weight: 0.55, alpha: 0.9 },   // brush lands
  { from: 0.2,  to: 0.55, weight: 1.0,  alpha: 1 },     // full pressure
  { from: 0.55, to: 0.8,  weight: 0.65, alpha: 0.9 },   // easing off
  { from: 0.8,  to: 1.0,  weight: 0.3,  alpha: 0.75 }   // dry tail
];

function brushMarkSegments(el) {
  const dx = el.x2 - el.x1;
  const dy = el.y2 - el.y1;
  return BRUSH_PROFILE.map(function(part) {
    return {
      x1: el.x1 + dx * part.from, y1: el.y1 + dy * part.from,
      x2: el.x1 + dx * part.to,   y2: el.y1 + dy * part.to,
      weight: el.weight * part.weight,
      alpha: part.alpha
    };
  });
}

function drawBrushMark(p, S, el, alpha) {
  p.strokeCap('butt'); // flat ends so segments meet without darker overlaps
  brushMarkSegments(el).forEach(function(seg) {
    setStroke(p, el.color, alpha * seg.alpha, S(seg.weight));
    p.line(S(seg.x1), S(seg.y1), S(seg.x2), S(seg.y2));
  });
}

// Layout of all text on the pattern, shared by canvas + SVG output
function patternTextLayout(name, date, place, occasion, seed) {
  return {
    displayName: String(name || '').trim() || 'Your Name',
    datePlace: formatDatePlace(date, place),
    occasionLabel: (OCCASION_LABELS[occasion] || occasion).toUpperCase(),
    seedLabel: '#' + String(seed).padStart(2, '0'),
    brand: 'inky · 印纪'
  };
}

// 6 + 7. Name, rule, date/place and the little corner labels
function drawPatternText(p, size, name, date, place, occasion, seed, palette) {
  const text = patternTextLayout(name, date, place, occasion, seed);

  // Name as large display text — shrinks to fit long names
  p.noStroke();
  p.textFont('Merriweather');
  p.textStyle('bold');
  let nameSize = size * 0.095;
  p.textSize(nameSize);
  const maxWidth = size * 0.86;
  if (p.textWidth(text.displayName) > maxWidth) {
    nameSize = nameSize * maxWidth / p.textWidth(text.displayName);
    p.textSize(nameSize);
  }
  p.textAlign('center', 'center');
  p.fill(palette.ink);
  p.text(text.displayName, size / 2, size * 0.82);

  // Thin decorative rule between name and subtitle
  const ruleHalf = size * 0.14;
  setStroke(p, palette.accent, 1, size * 0.0012);
  p.line(size / 2 - ruleHalf, size * 0.875, size / 2 + ruleHalf, size * 0.875);

  // Date · Place subtitle
  p.noStroke();
  p.textFont('Courier Prime');
  p.textStyle('normal');
  p.textSize(size * 0.028);
  p.fill(palette.accent);
  if (text.datePlace) {
    p.text(text.datePlace, size / 2, size * 0.905);
  }

  // Corner / margin typography
  p.textSize(size * 0.018);
  p.fill(palette.brushColors[1]);

  p.textAlign('left', 'top');
  p.text(text.occasionLabel, size * 0.04, size * 0.04);

  p.textAlign('right', 'top');
  p.text(text.seedLabel, size * 0.96, size * 0.04);

  p.textAlign('left', 'bottom');
  p.text(text.brand, size * 0.04, size * 0.965);
}

/* --------------------------------------------------------------------------
   8. Order code — encodes every parameter, so no database is needed
   Example: INK-WE-AOIFE-12062027-DUN-01
   -------------------------------------------------------------------------- */
function generateOrderCode(name, date, place, occasion, seed) {
  const n  = removeAccents(name).toUpperCase().replace(/[^A-Z]/g, '').slice(0, 6) || 'INKY';
  const d  = String(date || '').replace(/[^0-9]/g, '').slice(0, 8) || '0';
  const pl = removeAccents(place).toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3) || 'X';
  const oc = occasion.slice(0, 2).toUpperCase();
  const sv = String(seed).padStart(2, '0');
  return `INK-${oc}-${n}-${d}-${pl}-${sv}`;
}

/* --------------------------------------------------------------------------
   9. SVG export — built by hand from the same pattern data
   (p5's SVG mode is avoided on purpose.) Units: 1000 × 1000 viewBox,
   printed at 200 × 200 mm.
   -------------------------------------------------------------------------- */
function buildPatternSvg(name, date, place, occasion, seed) {
  const SIZE = 1000;
  const data = buildPatternData(name, date, place, occasion, seed);
  const palette = data.palette;
  const text = patternTextLayout(name, date, place, occasion, seed);
  const n = function(v) { return +(v * SIZE).toFixed(2); };
  const a = function(v) { return +v.toFixed(3); };
  const lines = [];

  lines.push('<?xml version="1.0" encoding="UTF-8"?>');
  lines.push('<!-- inky (印纪) — order code ' + generateOrderCode(name, date, place, occasion, seed) + ' -->');
  lines.push(`<svg xmlns="http://www.w3.org/2000/svg" width="200mm" height="200mm" viewBox="0 0 ${SIZE} ${SIZE}">`);
  lines.push(`  <rect width="${SIZE}" height="${SIZE}" fill="${palette.bg}"/>`);
  lines.push('  <g id="pattern" stroke-linecap="round">');

  data.elements.forEach(function(el) {
    lines.push('    ' + elementToSvg(el, n, a));
  });

  lines.push('  </g>');
  lines.push('  <!-- PRINT NOTE: Convert all text to outlines in Illustrator/Inkscape before sending to xTool -->');
  lines.push('  <g id="text">');

  // Name — the SVG has no textWidth(), so estimate: Merriweather Bold ≈ 0.62em per glyph
  let nameSize = SIZE * 0.095;
  const estimatedWidth = text.displayName.length * nameSize * 0.62;
  if (estimatedWidth > SIZE * 0.86) nameSize = nameSize * SIZE * 0.86 / estimatedWidth;

  lines.push(`    <text x="${SIZE / 2}" y="${SIZE * 0.82}" font-family="Merriweather, Georgia, serif" font-weight="700" font-size="${nameSize.toFixed(1)}" fill="${palette.ink}" text-anchor="middle" dominant-baseline="middle">${escapeXml(text.displayName)}</text>`);
  lines.push(`    <line x1="${SIZE * 0.36}" y1="${SIZE * 0.875}" x2="${SIZE * 0.64}" y2="${SIZE * 0.875}" stroke="${palette.accent}" stroke-width="${(SIZE * 0.0012).toFixed(2)}"/>`);
  if (text.datePlace) {
    lines.push(`    <text x="${SIZE / 2}" y="${SIZE * 0.905}" font-family="'Courier Prime', 'Courier New', monospace" font-size="${SIZE * 0.028}" fill="${palette.accent}" text-anchor="middle" dominant-baseline="middle">${escapeXml(text.datePlace)}</text>`);
  }
  const corner = `font-family="'Courier Prime', 'Courier New', monospace" font-size="${SIZE * 0.018}" fill="${palette.brushColors[1]}"`;
  lines.push(`    <text x="${SIZE * 0.04}" y="${SIZE * 0.04}" ${corner} dominant-baseline="hanging">${escapeXml(text.occasionLabel)}</text>`);
  lines.push(`    <text x="${SIZE * 0.96}" y="${SIZE * 0.04}" ${corner} text-anchor="end" dominant-baseline="hanging">${escapeXml(text.seedLabel)}</text>`);
  lines.push(`    <text x="${SIZE * 0.04}" y="${SIZE * 0.965}" ${corner}>${escapeXml(text.brand)}</text>`);
  lines.push('  </g>');
  lines.push('</svg>');

  return lines.join('\n');
}

// One data element → one (or two) SVG tags
function elementToSvg(el, n, a) {
  const strokeAttrs = function(color, alpha, weight) {
    return `fill="none" stroke="${color}" stroke-opacity="${a(alpha)}" stroke-width="${n(weight)}"`;
  };
  const fillAttrs = `fill="${el.color}" fill-opacity="${a(el.alpha)}"`;

  switch (el.type) {
    case 'dot':
    case 'tinyCircle':
      return `<circle cx="${n(el.x)}" cy="${n(el.y)}" r="${n(el.r)}" ${fillAttrs}/>`;

    case 'ring':
      return `<circle cx="${n(el.x)}" cy="${n(el.y)}" r="${n(el.r)}" ${strokeAttrs(el.color, el.alpha, el.weight)}/>`;

    case 'arc': {
      const r = el.d / 2;
      const sx = el.x + Math.cos(el.start) * r, sy = el.y + Math.sin(el.start) * r;
      const ex = el.x + Math.cos(el.stop) * r,  ey = el.y + Math.sin(el.stop) * r;
      const largeArc = (el.stop - el.start) > Math.PI ? 1 : 0;
      return `<path d="M ${n(sx)} ${n(sy)} A ${n(r)} ${n(r)} 0 ${largeArc} 1 ${n(ex)} ${n(ey)}" ${strokeAttrs(el.color, el.alpha, el.weight)}/>`;
    }

    case 'rect':
      return `<rect x="${n(el.x)}" y="${n(el.y)}" width="${n(el.w)}" height="${n(el.h)}" ${strokeAttrs(el.color, el.alpha, el.weight)}/>`;

    case 'polygon':
      return `<polygon points="${el.points.map(function(pt) { return n(pt[0]) + ',' + n(pt[1]); }).join(' ')}" ${fillAttrs}/>`;

    case 'line':
      return `<line x1="${n(el.x1)}" y1="${n(el.y1)}" x2="${n(el.x2)}" y2="${n(el.y2)}" ${strokeAttrs(el.color, el.alpha, el.weight)}/>`;

    case 'brush':
      return brushMarkSegments(el).map(function(seg) {
        return `<line x1="${n(seg.x1)}" y1="${n(seg.y1)}" x2="${n(seg.x2)}" y2="${n(seg.y2)}" stroke-linecap="butt" ${strokeAttrs(el.color, el.alpha * seg.alpha, seg.weight)}/>`;
      }).join('');

    case 'cross': {
      const h = el.size / 2;
      return `<path d="M ${n(el.x - h)} ${n(el.y)} H ${n(el.x + h)} M ${n(el.x)} ${n(el.y - h)} V ${n(el.y + h)}" ${strokeAttrs(el.color, el.alpha, el.weight)}/>`;
    }

    case 'diamond': {
      const s = el.size;
      const deg = (el.angle * 180 / Math.PI).toFixed(2);
      return `<rect x="${n(-s / 2)}" y="${n(-s / 2)}" width="${n(s)}" height="${n(s)}" transform="translate(${n(el.x)} ${n(el.y)}) rotate(${deg})" ${fillAttrs}/>`;
    }

    case 'tick': {
      const dx = Math.cos(el.angle) * el.size / 2;
      const dy = Math.sin(el.angle) * el.size / 2;
      return `<line x1="${n(el.x - dx)}" y1="${n(el.y - dy)}" x2="${n(el.x + dx)}" y2="${n(el.y + dy)}" ${strokeAttrs(el.color, el.alpha, el.weight)}/>`;
    }
  }
  return '';
}

function escapeXml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
