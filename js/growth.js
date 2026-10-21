/* ==========================================================================
   inky (印纪) — Growth engine (v1: marathon)
   --------------------------------------------------------------------------
   A pattern that GROWS with the data instead of being re-rolled by it.

   The one rule everything follows:
     the SEED decides what the pattern looks like  (skeleton)
     the DATA decides how much of it has grown     (growth)

   Two styles share the same data:
     A · Laurel sprigs  one leaf pair per km on fixed sprigs; more km = more
                        sprigs, never tighter spacing
     B · Medallion      one ray per km around a centre seal, inside a laurel
                        ring that grows with finish time

   - buildMarathonSkeleton(seedKey)  identity only: name, date, place, seed no.
   - normaliseRunData(raw)           raw run data → 0..1 values
   - growSprigs / growMedallion      continuous functions decide what shows,
                                     how big, which brand colour. No randomness.
   - paintDesign(p, sizePx, design)  on-screen preview (p5 canvas or graphics)
   - buildDesignSvg(design, meta)    the PRINT FILE: solid colour, hard edges,
                                     text converted to outlines

   Everything is laid out in a 1000 × 1000 design box (DESIGN_SIZE) and only
   scaled at the very end, so one design fits a 5 cm keychain or a 20 cm tote.
   Needs patterns.js (hashString, createRng, rngRange, removeAccents …) and,
   for the SVG text outlines, opentype.js.
   ========================================================================== */

/* --------------------------------------------------------------------------
   1. Fixed settings
   -------------------------------------------------------------------------- */

// The three brand colours. Nothing else is ever printed.
const BRAND_COLOURS = {
  terracotta: '#8c4a2a',
  cream:      '#f5ede0',   // the ground — background layer only
  ink:        '#2a1e10'
};

const DESIGN_SIZE = 1000;   // design units per side

// Physical print sizes. The same design is checked against each one.
const PRODUCTS = {
  tote:     { label: 'Tote bag — 20 cm', mm: 200 },
  coaster:  { label: 'Coaster — 9 cm',   mm: 90 },
  keychain: { label: 'Keychain — 5 cm',  mm: 50 }
};

// Smallest marks UV and DTF printing hold reliably
const PRINT_RULES = {
  minLineMm: 0.35,   // thinnest line
  minDotMm:  0.5,    // smallest dot (diameter)
  minTextMm: 1.2     // smallest text height worth printing
};

const MARATHON_KM   = 42.195;
const PACE_SAMPLES  = 12;     // pace profile is stored as 12 points along the run
const PACE_FASTEST  = 180;    // 3:00 /km → speed 1
const PACE_SLOWEST  = 480;    // 8:00 /km → speed 0

// Stretches run faster than this (relative 0..1) are drawn in terracotta
const FAST_THRESHOLD = 0.55;

// Print fonts for converting text to outlines (WOFF — opentype.js can parse these)
const PRINT_FONT_URLS = {
  serif: 'https://cdn.jsdelivr.net/npm/@fontsource/merriweather@5.3.0/files/merriweather-latin-700-normal.woff',
  mono:  'https://cdn.jsdelivr.net/npm/@fontsource/courier-prime@5.3.0/files/courier-prime-latin-400-normal.woff'
};

/* --------------------------------------------------------------------------
   2. Small maths helpers
   -------------------------------------------------------------------------- */
function clamp01(v) { return Math.max(0, Math.min(1, v)); }
function lerp(a, b, t) { return a + (b - a) * t; }
function easeOutQuad(t) { return 1 - (1 - t) * (1 - t); }

// Running total of segment lengths along a polyline
function cumulativeLengths(points) {
  const lengths = [0];
  for (let i = 1; i < points.length; i++) {
    lengths.push(lengths[i - 1] + Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]));
  }
  return lengths;
}

/* --------------------------------------------------------------------------
   3. Reading the run data people type
   -------------------------------------------------------------------------- */

// Finish time → minutes.
// "3:41:20" = h:mm:ss. Two parts: "3:41" (first part under 10) = h:mm,
// "41:20" = mm:ss. A single number = minutes.
function parseFinishTime(text) {
  const clean = String(text || '').trim();
  if (!clean) return null;
  const parts = clean.split(':').map(Number);
  if (parts.some(function(n) { return isNaN(n) || n < 0; })) return null;

  let minutes;
  if (parts.length === 3) minutes = parts[0] * 60 + parts[1] + parts[2] / 60;
  else if (parts.length === 2) minutes = parts[0] < 10 ? parts[0] * 60 + parts[1] : parts[0] + parts[1] / 60;
  else minutes = parts[0];
  return minutes > 0 ? minutes : null;
}

// Km splits → seconds per km. Accepts "5:12, 5:08 5:15" or decimal minutes "5.2"
function parseSplits(text) {
  return String(text || '')
    .split(/[\s,;]+/)
    .map(function(token) {
      if (!token) return null;
      if (token.indexOf(':') !== -1) {
        const mmss = token.split(':').map(Number);
        return mmss[0] * 60 + (mmss[1] || 0);
      }
      const value = Number(token);
      return isNaN(value) ? null : value * 60;
    })
    .filter(function(seconds) { return seconds && seconds >= 120 && seconds <= 1200; });
}

// Seconds per km → speed 0 (slow) .. 1 (fast)
function paceToSpeed(secondsPerKm) {
  return clamp01((PACE_SLOWEST - secondsPerKm) / (PACE_SLOWEST - PACE_FASTEST));
}

// Any number of splits → exactly PACE_SAMPLES speeds, quantised to 36 levels
// (so the profile fits in the order code as 12 base-36 characters)
function resamplePace(splits) {
  const samples = [];
  for (let i = 0; i < PACE_SAMPLES; i++) {
    const position = (i / (PACE_SAMPLES - 1)) * (splits.length - 1);
    const low = Math.floor(position);
    const high = Math.min(low + 1, splits.length - 1);
    const seconds = lerp(splits[low], splits[high], position - low);
    samples.push(Math.round(paceToSpeed(seconds) * 35) / 35);
  }
  return samples;
}

/* --------------------------------------------------------------------------
   4. Normalise: raw run data → 0..1 values the growth stage understands
   -------------------------------------------------------------------------- */
function normaliseRunData(raw) {
  const km = raw.distanceKm > 0 ? Math.min(raw.distanceKm, 100) : null;
  const minutes = parseFinishTime(raw.finishTime);
  const splits = parseSplits(raw.splits);
  const profile = splits.length >= 2 ? resamplePace(splits) : null;
  const intensity = clamp01((raw.intensity === undefined ? 5 : raw.intensity) / 10);

  return {
    distanceKm: km,
    finishMinutes: minutes,
    paceProfile: profile,
    intensity: intensity,
    time: minutes ? easeOutQuad(clamp01(minutes / 360)) : 0     // finish time → 0..1
  };
}

// Relative speed at position t (0..1) along the run: 0 = this runner's slowest
// stretch, 1 = their fastest. Relative, so every runner gets their own story —
// a 6-hour finisher's strong finish shows just as clearly as a 3-hour one's.
function relativeSpeedAt(run, t) {
  const profile = run.paceProfile;
  if (!profile) return 0.5;
  const slowest = Math.min.apply(null, profile);
  const fastest = Math.max.apply(null, profile);
  if (fastest - slowest < 0.03) return 0.5;           // even pacing
  const position = clamp01(t) * (profile.length - 1);
  const low = Math.floor(position);
  const high = Math.min(low + 1, profile.length - 1);
  const speed = lerp(profile[low], profile[high], position - low);
  return (speed - slowest) / (fastest - slowest);
}

// Run data for the order code, e.g. "D422-T034120-I7-PABCD…"
function encodeRunData(run) {
  const parts = [];
  if (run.distanceKm) parts.push('D' + Math.round(run.distanceKm * 10));
  if (run.finishMinutes) {
    const totalSeconds = Math.round(run.finishMinutes * 60);
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    parts.push('T' + [h, m, s].map(function(v) { return String(v).padStart(2, '0'); }).join(''));
  }
  parts.push('I' + Math.round(run.intensity * 10));
  if (run.paceProfile) {
    parts.push('P' + run.paceProfile.map(function(v) {
      return Math.round(v * 35).toString(36);
    }).join('').toUpperCase());
  }
  return parts.join('-');
}

/* --------------------------------------------------------------------------
   5. Skeleton — decided by the seed alone
   Each style gets its own random stream, so the two never affect each other
   and run data can never re-randomise anything here.
   -------------------------------------------------------------------------- */
const skeletonCache = new Map();

function buildMarathonSkeleton(seedKey) {
  if (skeletonCache.has(seedKey)) return skeletonCache.get(seedKey);

  const root = hashString(seedKey);
  const skeleton = {
    sprigs: makeSprigSkeleton(createRng(hashString(root + ':sprigs'))),
    medallion: makeMedallionSkeleton(createRng(hashString(root + ':medallion')))
  };

  // Keep the cache small: the hero and the compare view only need a few
  if (skeletonCache.size > 12) skeletonCache.delete(skeletonCache.keys().next().value);
  skeletonCache.set(seedKey, skeleton);
  return skeleton;
}

// --- Style A: laurel sprigs --------------------------------------------------
// Five sprig slots with FIXED angles. Every kilometre owns one leaf pair at a
// fixed place on a fixed sprig, so a longer run only ever adds leaves:
//   km 1–18  alternate between the two inner sprigs  (a 10K is a light "V")
//   km 19–27 the centre sprig
//   km 28–36 the outer left sprig, km 37–45 the outer right one
// Leaf spacing never changes, so a full marathon is fuller, never more crowded.
const SPRIGS = {
  baseX: 500, baseY: 760,
  pairGap: 50,          // stem length between leaf pairs (design units)
  lead: 60,             // bare stem before the first pair
  pairsPerSprig: 9,
  maxPairs: 45,
  slots: [-0.38, 0.38, 0.02, -0.95, 0.95]   // angle from vertical, in order of appearance
};

function sprigSlotForKm(k) {             // k = 0-based km index
  if (k < 18) return { sprig: k % 2, position: Math.floor(k / 2) };
  if (k < 27) return { sprig: 2, position: k - 18 };
  if (k < 36) return { sprig: 3, position: k - 27 };
  return { sprig: 4, position: k - 36 };
}

function makeSprigSkeleton(rng) {
  const fullLength = SPRIGS.lead + SPRIGS.pairsPerSprig * SPRIGS.pairGap + 40;
  const sprigs = SPRIGS.slots.map(function(slotAngle) {
    const angle = slotAngle + rngRange(rng, -0.06, 0.06);
    const bend = slotAngle * 0.9 + rngRange(rng, -0.12, 0.12);   // outer sprigs arc further out
    const wave = rngRange(rng, -0.45, 0.45);
    const phase = rng() * Math.PI * 2;
    const lengthScale = rngRange(rng, 0.92, 1.08);

    // The whole stem path, walked in small steps; growth reveals it from the base
    const steps = 80;
    const stepLength = fullLength * lengthScale / steps;
    const stem = [[SPRIGS.baseX, SPRIGS.baseY]];
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const heading = -Math.PI / 2 + angle * 0.75 + bend * t * t + wave * Math.sin(t * 5 + phase) * 0.35;
      const last = stem[stem.length - 1];
      stem.push([last[0] + Math.cos(heading) * stepLength, last[1] + Math.sin(heading) * stepLength]);
    }
    return {
      stem: stem,
      stemLengths: cumulativeLengths(stem),
      inkSide: rng() < 0.5 ? -1 : 1,     // which side gets ink leaves on slower stretches
      leafScale: Array.from({ length: SPRIGS.pairsPerSprig }, function() { return rngRange(rng, 0.9, 1.1); })
    };
  });

  // Little leaves gathered at the base; finish time × feeling decides how many.
  // Low rank = appears first.
  const baseLeaves = Array.from({ length: 8 }, function(_, i) {
    const side = i % 2 === 0 ? -1 : 1;
    return { rank: (i + rng() * 0.6) / 8, angle: Math.PI / 2 + side * (0.35 + Math.floor(i / 2) * 0.32), scale: rngRange(rng, 0.85, 1.1) };
  });

  return { sprigs: sprigs, baseLeaves: baseLeaves };
}

// --- Style B: medallion --------------------------------------------------------
// One ray per kilometre at a fixed clock position (km 1 at the top, going
// clockwise), a laurel ring that grows from the bottom up, and a centre seal.
const MEDALLION = {
  cx: 500, cy: 400,
  discR: 54, ringR: 72, rayStart: 92,
  wreathR: 335, leavesPerSide: 15,
  raySlots: 42
};

function makeMedallionSkeleton(rng) {
  const wobblePhase = rng() * Math.PI * 2;
  const wobbleAmount = rngRange(rng, 0.04, 0.12);
  return {
    // A gentle, seeded rhythm in ray lengths so each variation has its own crown
    rayWobble: Array.from({ length: MEDALLION.raySlots + 1 }, function(_, i) {
      return 1 + wobbleAmount * Math.sin(i * 0.9 + wobblePhase) + rngRange(rng, -0.03, 0.03);
    }),
    leafScale: Array.from({ length: MEDALLION.leavesPerSide * 2 }, function() { return rngRange(rng, 0.88, 1.12); }),
    doubleRing: rng() < 0.5
  };
}

/* --------------------------------------------------------------------------
   6. Growth — how much of the skeleton the data has "grown"
   -------------------------------------------------------------------------- */

// Print context: the smallest allowed marks, converted to design units
function printContext(productKey) {
  const key = productKey in PRODUCTS ? productKey : 'tote';
  const unitsPerMm = DESIGN_SIZE / PRODUCTS[key].mm;
  return {
    product: key,
    mm: PRODUCTS[key].mm,
    unitsPerMm: unitsPerMm,
    minLine: PRINT_RULES.minLineMm * unitsPerMm,
    minDot: (PRINT_RULES.minDotMm / 2) * unitsPerMm,       // as a radius
    minText: PRINT_RULES.minTextMm * unitsPerMm,
    // Small products (keychain): thick minimum lines would clog fine detail
    isSmall: PRINT_RULES.minLineMm * unitsPerMm > 3
  };
}

// How many leaf pairs / rays the run has earned. With no distance yet, a
// two-kilometre "seedling" so the canvas is never empty.
function earnedKm(run, cap) {
  if (!run.distanceKm) return 2;
  return Math.min(cap, Math.max(1, run.distanceKm));
}

// Point and heading at a given length along a polyline
function pointAtLength(points, lengths, target) {
  let i = 1;
  while (i < lengths.length - 1 && lengths[i] < target) i++;
  const span = lengths[i] - lengths[i - 1] || 1;
  const t = clamp01((target - lengths[i - 1]) / span);
  return {
    x: lerp(points[i - 1][0], points[i][0], t),
    y: lerp(points[i - 1][1], points[i][1], t),
    angle: Math.atan2(points[i][1] - points[i - 1][1], points[i][0] - points[i - 1][0])
  };
}

function polylineUpTo(points, lengths, target) {
  const out = [points[0]];
  for (let i = 1; i < points.length; i++) {
    if (lengths[i] >= target) {
      const p = pointAtLength(points, lengths, target);
      out.push([p.x, p.y]);
      break;
    }
    out.push(points[i]);
  }
  return out;
}

// Style A
function growSprigs(skeleton, run, print) {
  const shapes = [];
  const km = earnedKm(run, SPRIGS.maxPairs);
  const pairs = Math.round(km);
  const stemWidth = Math.max(2.6, print.minLine);
  const sizeBoost = 0.9 + 0.2 * run.intensity;             // how it felt → fuller leaves

  // How many pairs each sprig has, from the fixed km → slot mapping
  const pairsOn = [0, 0, 0, 0, 0];
  for (let k = 0; k < pairs; k++) pairsOn[sprigSlotForKm(k).sprig]++;

  // Stems first, so leaves sit on top of them
  skeleton.sprigs.forEach(function(sprig, s) {
    if (!pairsOn[s]) return;
    const length = SPRIGS.lead + (pairsOn[s] - 0.5) * SPRIGS.pairGap + 26;
    shapes.push({ kind: 'line', colour: 'ink', width: stemWidth,
      points: polylineUpTo(sprig.stem, sprig.stemLengths, length) });
  });

  // One leaf pair per km, at its fixed place
  for (let k = 0; k < pairs; k++) {
    const slot = sprigSlotForKm(k);
    const sprig = skeleton.sprigs[slot.sprig];
    const at = pointAtLength(sprig.stem, sprig.stemLengths, SPRIGS.lead + (slot.position + 0.5) * SPRIGS.pairGap);
    const speed = relativeSpeedAt(run, (k + 0.5) / Math.max(pairs, 1));
    const length = (34 + 22 * speed) * sprig.leafScale[slot.position] * sizeBoost;
    [-1, 1].forEach(function(side) {
      // Faster km: both leaves terracotta. Otherwise one side is ink.
      const colour = speed >= FAST_THRESHOLD || side !== sprig.inkSide ? 'terracotta' : 'ink';
      shapes.push({ kind: 'fill', colour: colour,
        points: leafOutline(at.x, at.y, length, Math.max(length * 0.36, print.minLine * 2), at.angle + side * 0.72) });
    });
  }

  // A leaf at the tip of every sprig that has grown
  skeleton.sprigs.forEach(function(sprig, s) {
    if (!pairsOn[s]) return;
    const tip = pointAtLength(sprig.stem, sprig.stemLengths, SPRIGS.lead + (pairsOn[s] - 0.5) * SPRIGS.pairGap + 26);
    shapes.push({ kind: 'fill', colour: 'terracotta',
      points: leafOutline(tip.x, tip.y, 34 * sizeBoost, Math.max(12, print.minLine * 2), tip.angle) });
  });

  // Finish time × feeling: little ink leaves gathering at the base
  const gathered = lerp(0, 1, run.time * (0.5 + 0.5 * run.intensity));
  skeleton.baseLeaves.forEach(function(leafSlot) {
    if (leafSlot.rank >= gathered) return;
    const length = 26 * leafSlot.scale;
    shapes.push({ kind: 'fill', colour: 'ink',
      points: leafOutline(SPRIGS.baseX, SPRIGS.baseY, length, Math.max(length * 0.36, print.minLine * 2), leafSlot.angle) });
  });
  return shapes;
}

// Style B
function growMedallion(skeleton, run, print) {
  const shapes = [];
  const M = MEDALLION;
  const km = earnedKm(run, M.raySlots);
  const every = print.isSmall ? 2 : 1;                     // keychain: every other km
  const sizeBoost = 0.9 + 0.2 * run.intensity;

  // Centre seal
  shapes.push({ kind: 'dot', colour: 'terracotta', x: M.cx, y: M.cy, r: M.discR });
  shapes.push({ kind: 'ring', colour: 'ink', x: M.cx, y: M.cy, r: M.ringR, width: Math.max(2.6, print.minLine) });
  if (skeleton.doubleRing && !print.isSmall) {
    shapes.push({ kind: 'ring', colour: 'ink', x: M.cx, y: M.cy, r: M.ringR - 7, width: Math.max(1, print.minLine) });
  }

  // Rays, clockwise from the top. The last ray grows with the part-kilometre.
  const wholeKm = Math.floor(km);
  for (let i = 0; i < Math.ceil(km); i += every) {
    const grown = i < wholeKm ? 1 : km - wholeKm;
    const speed = relativeSpeedAt(run, (i + 0.5) / Math.max(km, 1));
    const length = (80 + 120 * speed) * skeleton.rayWobble[i] * grown;
    if (length < 4) continue;
    const angle = -Math.PI / 2 + (i / M.raySlots) * Math.PI * 2;
    shapes.push({ kind: 'fill', colour: speed >= FAST_THRESHOLD ? 'terracotta' : 'ink',
      points: rayOutline(M.cx, M.cy, angle, M.rayStart, length,
        13, Math.max(1.6, print.minLine / 2)) });   // full base width, tip radius
  }

  // Laurel ring: finish time × feeling decides how far up it has grown
  const grow = lerp(0.1, 1, run.time * (0.5 + 0.5 * run.intensity));
  const shown = Math.round(M.leavesPerSide * grow);
  const span = Math.PI - 0.5;
  [1, -1].forEach(function(side, sideIndex) {
    if (!shown) return;
    const thetaAt = function(u) { return Math.PI / 2 + side * (0.14 + u * span); };
    const arc = [];
    const end = shown / M.leavesPerSide;
    for (let i = 0; i <= 40; i++) {
      const theta = thetaAt(end * i / 40);
      arc.push([M.cx + M.wreathR * Math.cos(theta), M.cy + M.wreathR * Math.sin(theta)]);
    }
    shapes.push({ kind: 'line', colour: 'ink', width: Math.max(2.4, print.minLine), points: arc });

    for (let i = 0; i < shown; i++) {
      const theta = thetaAt((i + 0.6) / M.leavesPerSide);
      const x = M.cx + M.wreathR * Math.cos(theta);
      const y = M.cy + M.wreathR * Math.sin(theta);
      const up = theta + side * Math.PI / 2;               // direction the branch grows
      const outward = i % 2 === 0 ? 1 : -1;                // alternate outside / inside
      const length = 36 * skeleton.leafScale[sideIndex * M.leavesPerSide + i] * sizeBoost;
      shapes.push({ kind: 'fill', colour: 'terracotta',
        points: leafOutline(x, y, length, Math.max(length * 0.36, print.minLine * 2), up - side * outward * 0.55) });
    }
  });
  return shapes;
}

// A tapered ray with a rounded tip
function rayOutline(cx, cy, angle, start, length, baseWidth, tipWidth) {
  const cos = Math.cos(angle), sin = Math.sin(angle);
  const nx = -sin, ny = cos;
  const x0 = cx + cos * start, y0 = cy + sin * start;
  const x1 = cx + cos * (start + length), y1 = cy + sin * (start + length);
  const points = [[x0 + nx * baseWidth / 2, y0 + ny * baseWidth / 2], [x1 + nx * tipWidth, y1 + ny * tipWidth]];
  for (let i = 1; i < 6; i++) {                             // rounded cap
    const a = angle + Math.PI / 2 - (i / 6) * Math.PI;
    points.push([x1 + Math.cos(a) * tipWidth, y1 + Math.sin(a) * tipWidth]);
  }
  points.push([x1 - nx * tipWidth, y1 - ny * tipWidth], [x0 - nx * baseWidth / 2, y0 - ny * baseWidth / 2]);
  return points;
}

// Almond leaf from its base point (x, y) outward along `angle`, as a polygon
function leafOutline(x, y, length, width, angle) {
  const points = [];
  const steps = 10;
  const cos = Math.cos(angle), sin = Math.sin(angle);
  const add = function(u, v) { points.push([x + u * cos - v * sin, y + u * sin + v * cos]); };
  for (let i = 0; i <= steps; i++) {                // one edge, base to tip
    const t = i / steps;
    add(t * length, -Math.sin(t * Math.PI) * width / 2);
  }
  for (let i = steps - 1; i > 0; i--) {             // other edge, slightly slimmer
    const t = i / steps;
    add(t * length, Math.sin(t * Math.PI) * width * 0.37);
  }
  return points;
}

/* --------------------------------------------------------------------------
   7. Text block — name, a short rule, date · place, run stats
   Text smaller than PRINT_RULES.minTextMm on the chosen product is dropped
   (the name always stays and shrinks to fit instead).
   -------------------------------------------------------------------------- */
function formatRunStats(run) {
  const parts = [];
  if (run.distanceKm) parts.push((Math.round(run.distanceKm * 10) / 10).toFixed(1) + ' KM');
  if (run.finishMinutes) {
    const totalSeconds = Math.round(run.finishMinutes * 60);
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    parts.push((h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(s).padStart(2, '0'));
  }
  return parts.join(' · ');
}

function buildTextItems(details, run, print) {
  const items = [
    { role: 'name', text: String(details.name || '').trim() || 'Your Name', font: 'serif',
      size: 92, x: 500, y: 885, align: 'center', valign: 'baseline', colour: 'ink', maxWidth: 860 },
    { role: 'subtitle', text: formatDatePlace(details.date, details.place).toUpperCase(), font: 'mono',
      size: 22, x: 500, y: 948, align: 'center', valign: 'baseline', colour: 'terracotta' },
    { role: 'stats', text: formatRunStats(run), font: 'mono',
      size: 18, x: 500, y: 978, align: 'center', valign: 'baseline', colour: 'ink' }
  ];
  return items.filter(function(item) {
    if (!item.text) return false;
    return item.role === 'name' || item.size >= print.minText;
  });
}

/* --------------------------------------------------------------------------
   8. One call to build a whole design (data only)
   -------------------------------------------------------------------------- */
const MARATHON_STYLES = {
  sprigs:    { label: 'Laurel sprigs', code: 'A' },
  medallion: { label: 'Medallion',     code: 'B' }
};

// details = { name, date, place, seed, style, run: {distanceKm, finishTime, splits, intensity}, product }
function buildMarathonDesign(details) {
  const style = details.style in MARATHON_STYLES ? details.style : 'sprigs';
  const seedKey = removeAccents(details.name).toUpperCase() + '::' + details.date + '::' +
    details.place + '::marathon::' + details.seed;
  const skeleton = buildMarathonSkeleton(seedKey);
  const run = normaliseRunData(details.run || {});
  const print = printContext(details.product);

  const shapes = style === 'medallion'
    ? growMedallion(skeleton.medallion, run, print)
    : growSprigs(skeleton.sprigs, run, print);

  // Short terracotta rule between the name and the date line
  shapes.push({ kind: 'line', colour: 'terracotta', width: Math.max(2, print.minLine),
    points: [[430, 912], [570, 912]] });

  return { style: style, shapes: shapes, texts: buildTextItems(details, run, print), run: run, print: print };
}

// The part of the order code that only growth-engine designs carry,
// e.g. "A-D422-T034120-I7-P…" (style letter first)
function encodeDesignCode(design) {
  return MARATHON_STYLES[design.style].code + '-' + encodeRunData(design.run);
}

/* --------------------------------------------------------------------------
   9. Preview on a p5 canvas / p5.Graphics (screen only — not the print file)
   -------------------------------------------------------------------------- */
function paintDesign(p, sizePx, design) {
  const k = sizePx / DESIGN_SIZE;
  p.push();
  p.background(BRAND_COLOURS.cream);
  design.shapes.forEach(function(shape) { paintShape(p, shape, k); });
  design.texts.forEach(function(item) { paintText(p, item, k); });
  p.pop();
}

function paintShape(p, shape, k) {
  const colour = BRAND_COLOURS[shape.colour];
  if (shape.kind === 'line') {
    p.noFill();
    p.stroke(colour);
    p.strokeWeight(shape.width * k);
    p.strokeCap('round');
    p.strokeJoin('round');
    p.beginShape();
    shape.points.forEach(function(pt) { p.vertex(pt[0] * k, pt[1] * k); });
    p.endShape(shape.closed ? 'close' : undefined);
  } else if (shape.kind === 'fill') {
    p.noStroke();
    p.fill(colour);
    p.beginShape();
    shape.points.forEach(function(pt) { p.vertex(pt[0] * k, pt[1] * k); });
    p.endShape('close');
  } else if (shape.kind === 'dot') {
    p.noStroke();
    p.fill(colour);
    p.circle(shape.x * k, shape.y * k, shape.r * 2 * k);
  } else if (shape.kind === 'ring') {
    p.noFill();
    p.stroke(colour);
    p.strokeWeight(shape.width * k);
    p.circle(shape.x * k, shape.y * k, shape.r * 2 * k);
  }
}

function paintText(p, item, k) {
  const label = item.text;
  p.noStroke();
  p.fill(BRAND_COLOURS[item.colour]);
  p.textFont(item.font === 'serif' ? 'Merriweather' : 'Courier Prime');
  p.textStyle(item.font === 'serif' ? 'bold' : 'normal');
  let size = item.size * k;
  p.textSize(size);
  if (item.maxWidth && p.textWidth(label) > item.maxWidth * k) {
    size = size * (item.maxWidth * k) / p.textWidth(label);
    p.textSize(size);
  }
  const vertical = { middle: 'center', top: 'top', bottom: 'bottom', baseline: 'alphabetic' };
  p.textAlign(item.align, vertical[item.valign]);
  p.text(label, item.x * k, item.y * k);
}

/* --------------------------------------------------------------------------
   10. Print file (SVG)
   - Solid brand colours only, no transparency anywhere
   - Background on its own layer, so it can be dropped for cream stock
   - Text converted to outlines with opentype.js; if the fonts can't load
     (offline), live <text> is written with a clear PRINT NOTE instead
   -------------------------------------------------------------------------- */
let printFontsPromise = null;

function loadPrintFonts() {
  if (typeof opentype === 'undefined') return Promise.reject(new Error('opentype.js not loaded'));
  if (!printFontsPromise) {
    const load = function(url) {
      return fetch(url)
        .then(function(response) {
          if (!response.ok) throw new Error('Font download failed: ' + url);
          return response.arrayBuffer();
        })
        .then(function(buffer) { return opentype.parse(buffer); });
    };
    printFontsPromise = Promise.all([load(PRINT_FONT_URLS.serif), load(PRINT_FONT_URLS.mono)])
      .then(function(fonts) { return { serif: fonts[0], mono: fonts[1] }; })
      .catch(function(error) { printFontsPromise = null; throw error; });
  }
  return printFontsPromise;
}

// Returns { svg, outlined } — outlined is false when text fell back to <text>
function buildDesignSvg(design, meta) {
  return loadPrintFonts()
    .then(function(fonts) { return { svg: writeSvg(design, meta, fonts), outlined: true }; })
    .catch(function() { return { svg: writeSvg(design, meta, null), outlined: false }; });
}

function writeSvg(design, meta, fonts) {
  const mm = design.print.mm;
  const out = [];
  out.push('<?xml version="1.0" encoding="UTF-8"?>');
  out.push('<!-- inky (印纪) print file');
  out.push('     order code: ' + meta.orderCode);
  out.push('     product:    ' + PRODUCTS[design.print.product].label + ' (' + mm + ' × ' + mm + ' mm)');
  out.push('     colours:    terracotta ' + BRAND_COLOURS.terracotta + ', ink ' + BRAND_COLOURS.ink +
    ' on cream ' + BRAND_COLOURS.cream);
  out.push('     All artwork is solid colour: no transparency, no gradients.');
  out.push('     Minimum line ' + PRINT_RULES.minLineMm + ' mm, minimum dot ' + PRINT_RULES.minDotMm + ' mm. -->');
  out.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${mm}mm" height="${mm}mm" viewBox="0 0 ${DESIGN_SIZE} ${DESIGN_SIZE}">`);
  out.push('  <!-- Background layer: delete when printing straight onto cream / natural stock -->');
  out.push(`  <g id="background"><rect width="${DESIGN_SIZE}" height="${DESIGN_SIZE}" fill="${BRAND_COLOURS.cream}"/></g>`);

  // Artwork in paint order. Consecutive shapes of one colour share a group,
  // labelled by ink, which keeps the stacking and still makes separation easy.
  out.push('  <g id="artwork">');
  let openColour = null;
  design.shapes.forEach(function(shape) {
    if (shape.colour !== openColour) {
      if (openColour) out.push('    </g>');
      out.push(`    <g class="ink-${shape.colour}">`);
      openColour = shape.colour;
    }
    out.push('      ' + shapeToSvg(shape));
  });
  if (openColour) out.push('    </g>');
  out.push('  </g>');

  out.push('  <g id="text">');
  if (!fonts) {
    out.push('    <!-- PRINT NOTE: Convert all text to outlines in Illustrator/Inkscape before sending to xTool -->');
  }
  design.texts.forEach(function(item) {
    out.push('    ' + (fonts ? textToSvgPath(item, fonts) : textToSvgText(item)));
  });
  out.push('  </g>');
  out.push('</svg>');
  return out.join('\n');
}

function svgPoints(points) {
  return points.map(function(pt) { return pt[0].toFixed(1) + ',' + pt[1].toFixed(1); }).join(' ');
}

function shapeToSvg(shape) {
  const colour = BRAND_COLOURS[shape.colour];
  if (shape.kind === 'line') {
    const tag = shape.closed ? 'polygon' : 'polyline';
    return `<${tag} points="${svgPoints(shape.points)}" fill="none" stroke="${colour}" stroke-width="${shape.width.toFixed(2)}" stroke-linecap="round" stroke-linejoin="round"/>`;
  }
  if (shape.kind === 'fill') {
    return `<polygon points="${svgPoints(shape.points)}" fill="${colour}"/>`;
  }
  if (shape.kind === 'dot') {
    return `<circle cx="${shape.x.toFixed(1)}" cy="${shape.y.toFixed(1)}" r="${shape.r.toFixed(2)}" fill="${colour}"/>`;
  }
  if (shape.kind === 'ring') {
    return `<circle cx="${shape.x.toFixed(1)}" cy="${shape.y.toFixed(1)}" r="${shape.r.toFixed(2)}" fill="none" stroke="${colour}" stroke-width="${shape.width.toFixed(2)}"/>`;
  }
  return '';
}

// Text as outlines. Vertical alignment mirrors the canvas preview, which
// aligns to the font's em box (ascender / descender).
function textToSvgPath(item, fonts) {
  const font = item.font === 'serif' ? fonts.serif : fonts.mono;
  const upm = font.unitsPerEm;
  let size = item.size;
  let width = font.getAdvanceWidth(item.text, size);
  if (item.maxWidth && width > item.maxWidth) {
    size = size * item.maxWidth / width;
    width = item.maxWidth;
  }

  let baseline = item.y;
  if (item.valign === 'middle') baseline = item.y + size * (font.ascender + font.descender) / (2 * upm);
  if (item.valign === 'top') baseline = item.y + size * font.ascender / upm;
  if (item.valign === 'bottom') baseline = item.y + size * font.descender / upm;

  let x = item.x;
  if (item.align === 'center') x = item.x - width / 2;
  if (item.align === 'right') x = item.x - width;

  return `<path fill="${BRAND_COLOURS[item.colour]}" d="${font.getPath(item.text, x, baseline, size).toPathData(2)}"/>`;
}

// Fallback when the print fonts are unavailable
function textToSvgText(item) {
  const anchor = { left: 'start', center: 'middle', right: 'end' }[item.align];
  const baseline = { top: 'hanging', middle: 'middle', bottom: 'text-after-edge', baseline: 'alphabetic' }[item.valign];
  const family = item.font === 'serif' ? "Merriweather, Georgia, serif" : "'Courier Prime', 'Courier New', monospace";
  const weight = item.font === 'serif' ? ' font-weight="700"' : '';
  const label = item.text;
  return `<text x="${item.x}" y="${item.y}" font-family="${family}"${weight} font-size="${item.size}" fill="${BRAND_COLOURS[item.colour]}" text-anchor="${anchor}" dominant-baseline="${baseline}">${escapeXml(label)}</text>`;
}
