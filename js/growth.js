/* ==========================================================================
   inky (印纪) — Growth engine (all four occasions)
   --------------------------------------------------------------------------
   A pattern that GROWS with the data instead of being re-rolled by it.

   The one rule everything follows:
     the SEED decides what the pattern looks like  (skeleton)
     the DATA decides how much of it has grown     (growth)

   Marathon has two styles sharing the same data:
     A · Laurel sprigs  one leaf pair per km on fixed sprigs; more km = more
                        sprigs, never tighter spacing
     B · Medallion      one ray per km around a centre seal, inside a laurel
                        ring that grows with finish time
   Wedding   two laurel branches from a bow around the initials; a leaf pair
             per year together, blossoms for guests
   Birthday  one flower: a ring of petals per decade, a leaf per extra year
   Match     twin stars sized by each side's score, an arch of small stars
             (one per point), laurel underneath for how it felt

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

// Splits → seconds per unit. Accepts "5:12, 5:08 5:15", decimal minutes "5.2",
// or a table pasted from Strava / Garmin: if any m:ss times are present, only
// those are used (lap numbers, elevation etc. are ignored; h:mm:ss totals too).
function parseSplits(text) {
  const clean = String(text || '');
  const times = clean.match(/(^|[^\d:])(\d{1,2}:\d{2})(?![:\d])/g);
  const tokens = times
    ? times.map(function(t) { return t.replace(/^[^\d]/, ''); })
    : clean.split(/[\s,;]+/);
  return tokens
    .map(function(token) {
      if (!token) return null;
      if (token.indexOf(':') !== -1) {
        const mmss = token.split(':').map(Number);
        return mmss[0] * 60 + (mmss[1] || 0);
      }
      const value = Number(token);
      return isNaN(value) ? null : value * 60;
    })
    .filter(function(seconds) { return seconds && seconds >= 120 && seconds <= 1500; });
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
const KM_PER_MILE = 1.609344;

function normaliseRunData(raw) {
  // raw.distance is in raw.unit ('km' or 'mi'); splits are per that unit
  const unit = raw.unit === 'mi' ? 'mi' : 'km';
  const perUnit = unit === 'mi' ? KM_PER_MILE : 1;
  const typed = parseFloat(raw.distance);
  const km = typed > 0 ? Math.min(typed * perUnit, 100) : null;
  const minutes = parseFinishTime(raw.finishTime);
  const splits = parseSplits(raw.splits).map(function(seconds) { return seconds / perUnit; });
  const profile = splits.length >= 2 ? resamplePace(splits) : null;
  const intensity = clamp01((raw.intensity === undefined ? 5 : raw.intensity) / 10);

  return {
    unit: unit,
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

// How many rays the run has earned (medallion). With no distance yet, two.
function earnedKm(run, cap) {
  if (!run.distanceKm) return 2;
  return Math.min(cap, Math.max(1, run.distanceKm));
}

// Leaf pairs for the sprigs. Every run starts from a full-looking base of six
// pairs so a 5K is a complete little bouquet; distance then adds up to 39 more.
function sprigPairsFor(run) {
  const km = run.distanceKm ? Math.min(run.distanceKm, MARATHON_KM) : 0;
  return Math.min(SPRIGS.maxPairs, Math.round(6 + km * 39 / MARATHON_KM));
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
  const pairs = sprigPairsFor(run);
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

  // The full dial is always there: every kilometre slot starts as a short ink
  // tick, so even a 5K reads as a complete medallion. Run kilometres grow out
  // of their ticks as full rays.
  for (let i = Math.ceil(km); i < M.raySlots; i += every) {
    const angle = -Math.PI / 2 + (i / M.raySlots) * Math.PI * 2;
    shapes.push({ kind: 'fill', colour: 'ink',
      points: rayOutline(M.cx, M.cy, angle, M.rayStart, 16, Math.max(5, print.minLine), Math.max(1.4, print.minLine / 2)) });
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
   7. Wedding, birthday, match — same rule: seed = shape, data = growth
   -------------------------------------------------------------------------- */

// "12", " 120 " → number, or null
function parseCount(value, max) {
  const n = parseFloat(String(value === undefined || value === null ? '' : value).trim());
  return isNaN(n) || n < 0 ? null : Math.min(n, max);
}

// GAA "2-14" (goals-points, a goal = 3 points) or a plain "20" → { total, label }
function parseScore(text) {
  const clean = String(text || '').trim();
  if (!clean) return null;
  const gaa = clean.match(/^(\d{1,2})\s*[-–:]\s*(\d{1,2})$/);
  if (gaa) {
    const goals = Number(gaa[1]), points = Number(gaa[2]);
    return { total: goals * 3 + points, label: goals + '-' + points };
  }
  const plain = Number(clean);
  return isNaN(plain) || plain < 0 ? null : { total: Math.min(plain, 99), label: String(plain) };
}

function normaliseFeeling(raw) {
  return clamp01((raw.intensity === undefined ? 5 : raw.intensity) / 10);
}

// Small five-petal blossom with a little centre, as fill shapes
function addBlossom(shapes, x, y, size, rotation, print) {
  for (let i = 0; i < 5; i++) {
    const angle = rotation + (i / 5) * Math.PI * 2;
    shapes.push({ kind: 'fill', colour: 'terracotta',
      points: leafOutline(x, y, size, Math.max(size * 0.62, print.minLine * 2), angle) });
  }
  shapes.push({ kind: 'dot', colour: 'ink', x: x, y: y, r: Math.max(size * 0.16, print.minDot) });
}

// A sparkle star: `points` long rays with short notches between them
function starOutline(cx, cy, radius, points, inner, rotation) {
  const outline = [];
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? radius : radius * inner;
    const a = rotation + (i / (points * 2)) * Math.PI * 2;
    outline.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  return outline;
}

// --- Wedding: two laurel branches rising from a bow around the couple's initials
// One leaf pair per year together, alternating left / right, at fixed places.
// Eight pairs for the wedding day, then one per year; the branches meet after 22 years.
const WEDDING = { cx: 500, cy: 430, r: 300, slotsPerSide: 15, maxYears: 30, maxBlossoms: 8 };

function makeWeddingSkeleton(rng) {
  return {
    leafScale: Array.from({ length: WEDDING.slotsPerSide * 2 }, function() { return rngRange(rng, 0.9, 1.1); }),
    outerColourFirst: rng() < 0.5,
    lean: rngRange(rng, 0.48, 0.78),          // how far leaves splay from the stem
    squash: rngRange(rng, 0.9, 1.06),          // rounder or taller wreath
    // Blossoms gather around the bow, working outward along the branches
    blossoms: Array.from({ length: WEDDING.maxBlossoms }, function(_, i) {
      const side = i % 2 === 0 ? -1 : 1;
      return {
        angle: Math.PI / 2 + side * (0.2 + Math.floor(i / 2) * 0.13) + rngRange(rng, -0.03, 0.03),
        radius: WEDDING.r + (i % 4 < 2 ? -22 : 20) + rngRange(rng, -5, 5),
        size: rngRange(rng, 14, 19),
        rotation: rng() * Math.PI
      };
    })
  };
}

function normaliseWeddingData(raw) {
  return { years: parseCount(raw.years, 75), guests: parseCount(raw.guests, 1000), intensity: normaliseFeeling(raw) };
}

function growWedding(skeleton, data, print) {
  const shapes = [];
  const W = WEDDING;
  // The wreath starts with the wedding day itself (eight pairs, four a side),
  // then grows a pair for every year together; after 22 years the branches meet.
  const years = Math.min(W.maxYears, 8 + (data.years === null ? 0 : Math.round(data.years)));
  const sizeBoost = 0.9 + 0.25 * data.intensity;
  const span = Math.PI - 0.22;                       // bottom → top, a hair short of meeting
  const thetaAt = function(side, u) { return Math.PI / 2 + side * (0.12 + u * span); };
  const pointAt = function(theta) { return [W.cx + W.r * Math.cos(theta), W.cy + W.r * skeleton.squash * Math.sin(theta)]; };

  [1, -1].forEach(function(side, sideIndex) {
    // year y lives on side (y % 2), at slot floor(y / 2) — so years only ever add
    const onThisSide = Math.floor(years / 2) + (sideIndex === 0 ? years % 2 : 0);
    if (!onThisSide) return;
    const end = (onThisSide - 0.4) / W.slotsPerSide + (onThisSide >= W.slotsPerSide ? 0.4 / W.slotsPerSide : 0.03);
    const stem = [];
    for (let i = 0; i <= 48; i++) stem.push(pointAt(thetaAt(side, Math.min(1, end) * i / 48)));
    shapes.push({ kind: 'line', colour: 'ink', width: Math.max(2.6, print.minLine), points: stem });

    for (let slot = 0; slot < onThisSide; slot++) {
      const theta = thetaAt(side, (slot + 0.6) / W.slotsPerSide);
      const base = pointAt(theta);
      const up = theta + side * Math.PI / 2;
      const length = 36 * skeleton.leafScale[sideIndex * W.slotsPerSide + slot] * sizeBoost;
      const width = Math.max(length * 0.36, print.minLine * 2);
      const outerFirst = (slot % 2 === 0) === skeleton.outerColourFirst;
      // one leaf leaning out, one leaning in
      shapes.push({ kind: 'fill', colour: outerFirst ? 'terracotta' : 'ink',
        points: leafOutline(base[0], base[1], length, width, up - side * skeleton.lean) });
      shapes.push({ kind: 'fill', colour: outerFirst ? 'ink' : 'terracotta',
        points: leafOutline(base[0], base[1], length * 0.9, width, up + side * skeleton.lean) });
    }
  });

  // The bow that ties the two branches
  const bowX = W.cx, bowY = W.cy + W.r * skeleton.squash + 8;
  const bowWidth = Math.max(12, print.minLine * 2);
  shapes.push({ kind: 'fill', colour: 'terracotta', points: leafOutline(bowX, bowY, 38, bowWidth * 1.4, Math.PI + 0.35) });
  shapes.push({ kind: 'fill', colour: 'terracotta', points: leafOutline(bowX, bowY, 38, bowWidth * 1.4, -0.35) });
  shapes.push({ kind: 'line', colour: 'terracotta', width: Math.max(3, print.minLine), points: [[bowX, bowY], [bowX - 18, bowY + 40]] });
  shapes.push({ kind: 'line', colour: 'terracotta', width: Math.max(3, print.minLine), points: [[bowX, bowY], [bowX + 18, bowY + 40]] });
  shapes.push({ kind: 'dot', colour: 'ink', x: bowX, y: bowY, r: Math.max(6, print.minDot) });

  // Guests → blossoms gathered at the bow (one per 25 guests)
  const blossomCount = data.guests ? Math.min(W.maxBlossoms, Math.round(data.guests / 25)) : 0;
  skeleton.blossoms.slice(0, blossomCount).forEach(function(b) {
    addBlossom(shapes, W.cx + b.radius * Math.cos(b.angle), W.cy + b.radius * skeleton.squash * Math.sin(b.angle),
      b.size * sizeBoost, b.rotation, print);
  });
  return shapes;
}

// "Aoife & Ciarán" → ["A", "C"]; "Aoife" → ["A"]
function initialsFrom(name) {
  return removeAccents(name)
    .split(/\s*(?:&|\+|\band\b)\s*/i)
    .map(function(part) { return part.trim(); })
    .filter(Boolean)
    .slice(0, 2)
    .map(function(part) { return part[0].toUpperCase(); });
}

function weddingMonogram(name) {
  const letters = initialsFrom(name || 'inky');
  if (letters.length < 2) {
    return [{ role: 'monogram', text: letters[0] || 'I', font: 'serif', size: 150,
      x: WEDDING.cx, y: WEDDING.cy + 52, align: 'center', valign: 'baseline', colour: 'ink' }];
  }
  return [
    { role: 'monogram', text: letters[0], font: 'serif', size: 128, x: WEDDING.cx - 52, y: WEDDING.cy + 44, align: 'right', valign: 'baseline', colour: 'ink' },
    { role: 'monogram', text: '&', font: 'serif', size: 80, x: WEDDING.cx, y: WEDDING.cy + 34, align: 'center', valign: 'baseline', colour: 'terracotta' },
    { role: 'monogram', text: letters[1], font: 'serif', size: 128, x: WEDDING.cx + 52, y: WEDDING.cy + 44, align: 'left', valign: 'baseline', colour: 'ink' }
  ];
}

function weddingStats(data) {
  const parts = [];
  if (data.years !== null) parts.push(Math.round(data.years) + (Math.round(data.years) === 1 ? ' YEAR' : ' YEARS') + ' TOGETHER');
  if (data.guests) parts.push(Math.round(data.guests) + ' GUESTS');
  return parts.join(' · ');
}

// --- Birthday: one flower that gains a ring of petals per decade -------------
// Years past the last full decade become leaves at the foot of the stem.
const BIRTHDAY = { cx: 500, cy: 380, stemBottom: 775, ringStep: 30, coreR: 20, maxRings: 7 };

function makeBirthdaySkeleton(rng) {
  return {
    rings: Array.from({ length: BIRTHDAY.maxRings }, function(_, k) {
      return { petals: 8 + 3 * k, rotation: rng() * Math.PI * 2, lengthScale: rngRange(rng, 0.92, 1.08) };
    }),
    stemSway: rngRange(rng, -26, 26),
    leaves: Array.from({ length: 9 }, function(_, i) {
      return { side: i % 2 === 0 ? -1 : 1, scale: rngRange(rng, 0.9, 1.12) };
    })
  };
}

function normaliseBirthdayData(raw) {
  return { age: parseCount(raw.age, 120), intensity: normaliseFeeling(raw) };
}

function growBirthday(skeleton, data, print) {
  const shapes = [];
  const B = BIRTHDAY;
  const age = data.age === null ? 1 : Math.max(1, Math.round(data.age));
  const rings = Math.min(B.maxRings, 2 + Math.floor(age / 10));   // a child's flower is still full
  const leaves = age % 10;
  const petalWidth = 0.42 + 0.2 * data.intensity;           // a bigger day, rounder petals
  // Every tenth year the nine leaves at the foot become a new ring of petals —
  // the one place where growth transforms rather than simply adds.

  // Stem: from the flower's centre (hidden under the petals) to the ground,
  // with a gentle sway. Its shape never depends on the data, so leaves stay put.
  const stem = [];
  for (let i = 0; i <= 30; i++) {
    const t = i / 30;
    stem.push([B.cx + skeleton.stemSway * Math.sin(t * Math.PI), lerp(B.cy, B.stemBottom, t)]);
  }
  shapes.push({ kind: 'line', colour: 'ink', width: Math.max(3, print.minLine), points: stem });

  // One leaf per year past the decade, climbing from the ground up
  const upward = stem.slice().reverse();
  const upwardLengths = cumulativeLengths(upward);
  for (let i = 0; i < leaves; i++) {
    const slot = skeleton.leaves[i];
    const at = pointAtLength(upward, upwardLengths, 24 + i * 22);
    const length = 50 * slot.scale * (0.9 + 0.25 * data.intensity);   // a bigger day, fuller leaves
    shapes.push({ kind: 'fill', colour: i % 3 === 2 ? 'terracotta' : 'ink',
      points: leafOutline(at.x, at.y, length, Math.max(length * 0.36, print.minLine * 2),
        -Math.PI / 2 + slot.side * 1.05) });
  }

  // Petal rings, outermost first so inner rings sit on top
  for (let k = rings - 1; k >= 0; k--) {
    const ring = skeleton.rings[k];
    const start = B.coreR + k * B.ringStep * 0.55;
    const length = (B.ringStep * 1.6 + k * 4) * ring.lengthScale;
    const colour = k % 3 === 1 ? 'ink' : 'terracotta';      // mostly terracotta, an ink ring now and then
    for (let i = 0; i < ring.petals; i++) {
      const angle = ring.rotation + (i / ring.petals) * Math.PI * 2;
      shapes.push({ kind: 'fill', colour: colour,
        points: leafOutline(B.cx + Math.cos(angle) * start, B.cy + Math.sin(angle) * start,
          length, Math.max(length * petalWidth, print.minLine * 2), angle) });
    }
  }
  shapes.push({ kind: 'dot', colour: 'ink', x: B.cx, y: B.cy, r: B.coreR + 2 });

  return shapes;
}

function birthdayStats(data) {
  return data.age === null ? '' : Math.round(data.age) + (Math.round(data.age) === 1 ? ' YEAR' : ' YEARS');
}

// --- Match / GAA: twin stars, one per side, under an arch of small stars ----
// Each side's star grows with its score; every point scored adds a small star
// to that side of the arch. A laurel underneath grows with how it felt.
const MATCH = { leftX: 345, rightX: 655, y: 440, archR: 360, archCy: 470, slotsPerSide: 24, maxLeaves: 8 };

function makeMatchSkeleton(rng) {
  return {
    bigRotation: rngRange(rng, -0.12, 0.12),
    sharpness: rngRange(rng, 0.26, 0.42),     // inner radius of the twin stars
    archR: rngRange(rng, 330, 395),           // how high the arch of points rises
    laurelLift: rngRange(rng, 35, 85),        // curve of the laurel underneath
    sparkles: Array.from({ length: MATCH.slotsPerSide * 2 }, function() {
      return { scale: rngRange(rng, 0.85, 1.15), rotation: rngRange(rng, -0.3, 0.3), wobble: rngRange(rng, -4, 4) };
    }),
    leafScale: Array.from({ length: MATCH.maxLeaves * 2 }, function() { return rngRange(rng, 0.9, 1.1); })
  };
}

function normaliseMatchData(raw) {
  return { us: parseScore(raw.us), them: parseScore(raw.them),
    opponent: String(raw.opponent || '').trim(), intensity: normaliseFeeling(raw) };
}

function growMatch(skeleton, data, print) {
  const shapes = [];
  const M = MATCH;
  const sizeBoost = 0.9 + 0.2 * data.intensity;

  // Arch of small stars: our points climb the left half, theirs the right
  [{ score: data.us, side: -1, colour: 'terracotta', offset: 0 },
   { score: data.them, side: 1, colour: 'ink', offset: M.slotsPerSide }].forEach(function(team) {
    const count = team.score ? Math.min(M.slotsPerSide, team.score.total) : 0;
    for (let i = 0; i < count; i++) {
      const slot = skeleton.sparkles[team.offset + i];
      // from the side (level with the stars) up toward the top, evenly spaced
      const angle = -Math.PI / 2 + team.side * (Math.PI * 0.5 - (i / M.slotsPerSide) * Math.PI * 0.44);
      const r = skeleton.archR + slot.wobble;
      const size = 13 * slot.scale * sizeBoost;
      shapes.push({ kind: 'fill', colour: team.colour,
        points: starOutline(500 + Math.cos(angle) * r, M.archCy + Math.sin(angle) * r,
          Math.max(size, print.minLine * 2), 4, 0.38, slot.rotation) });
    }
  });

  // The twins are always equal — the day belongs to both sides, win or lose.
  // Together they grow with the total points scored in the match.
  const total = (data.us ? data.us.total : 0) + (data.them ? data.them.total : 0);
  const usR = 90 + 1.3 * Math.min(total, 50), themR = usR;
  shapes.push({ kind: 'line', colour: 'ink', width: Math.max(2, print.minLine),
    points: [[M.leftX, M.y], [M.rightX, M.y]] });
  shapes.push({ kind: 'fill', colour: 'terracotta', points: starOutline(M.leftX, M.y, usR, 4, skeleton.sharpness, -Math.PI / 2 + skeleton.bigRotation) });
  shapes.push({ kind: 'fill', colour: 'ink', points: starOutline(M.rightX, M.y, themR, 4, skeleton.sharpness, -Math.PI / 2 - skeleton.bigRotation) });

  // Laurel underneath, two short branches from the middle
  const leaves = Math.round(lerp(2, M.maxLeaves, data.intensity));
  [-1, 1].forEach(function(side, sideIndex) {
    const stem = [];
    for (let i = 0; i <= 24; i++) {
      const t = i / 24;
      stem.push([500 + side * (10 + t * 230), 690 - Math.sin(t * Math.PI * 0.55) * skeleton.laurelLift]);
    }
    const reach = (leaves + 0.5) / (M.maxLeaves + 0.5);
    const lengths = cumulativeLengths(stem);
    const shown = polylineUpTo(stem, lengths, lengths[lengths.length - 1] * reach);
    shapes.push({ kind: 'line', colour: 'ink', width: Math.max(2.4, print.minLine), points: shown });
    for (let i = 0; i < leaves; i++) {
      const at = pointAtLength(stem, lengths, lengths[lengths.length - 1] * (i + 0.7) / (M.maxLeaves + 0.5));
      const length = 32 * skeleton.leafScale[sideIndex * M.maxLeaves + i] * sizeBoost;
      [-1, 1].forEach(function(lean) {
        shapes.push({ kind: 'fill', colour: 'terracotta',
          points: leafOutline(at.x, at.y, length, Math.max(length * 0.36, print.minLine * 2), at.angle + lean * 0.62) });
      });
    }
  });
  return shapes;
}

function matchStats(data) {
  if (!data.us && !data.them) return data.opponent ? 'V ' + data.opponent.toUpperCase() : '';
  const score = (data.us ? data.us.label : '–') + ' · ' + (data.them ? data.them.label : '–');
  return data.opponent ? score + ' V ' + data.opponent.toUpperCase() : score;
}

/* --------------------------------------------------------------------------
   8. Text block — name, a short rule, date · place, stats
   Text smaller than PRINT_RULES.minTextMm on the chosen product is dropped
   (the name and wedding monogram always stay).
   -------------------------------------------------------------------------- */
function formatRunStats(run) {
  const parts = [];
  if (run.distanceKm) {
    const shown = run.unit === 'mi' ? run.distanceKm / KM_PER_MILE : run.distanceKm;
    parts.push((Math.round(shown * 10) / 10).toFixed(1) + (run.unit === 'mi' ? ' MI' : ' KM'));
  }
  if (run.finishMinutes) {
    const totalSeconds = Math.round(run.finishMinutes * 60);
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    parts.push((h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(s).padStart(2, '0'));
  }
  return parts.join(' · ');
}

function buildTextItems(details, statsText, print) {
  const items = [
    { role: 'name', text: String(details.name || '').trim() || 'Your Name', font: 'serif',
      size: 92, x: 500, y: 885, align: 'center', valign: 'baseline', colour: 'ink', maxWidth: 860 },
    { role: 'subtitle', text: formatDatePlace(details.date, details.place).toUpperCase(), font: 'mono',
      size: 22, x: 500, y: 948, align: 'center', valign: 'baseline', colour: 'terracotta' },
    { role: 'stats', text: statsText, font: 'mono',
      size: 18, x: 500, y: 978, align: 'center', valign: 'baseline', colour: 'ink' }
  ];
  return items.filter(function(item) {
    if (!item.text) return false;
    return item.role === 'name' || item.size >= print.minText;
  });
}

/* --------------------------------------------------------------------------
   9. One call to build any design (data only)
   -------------------------------------------------------------------------- */
const MARATHON_STYLES = {
  sprigs:    { label: 'Laurel sprigs' },
  medallion: { label: 'Medallion' }
};

// Each occasion: how to read its data, grow it and describe it
const OCCASION_ENGINES = {
  marathon: { normalise: normaliseRunData, stats: formatRunStats },   // grows via its two styles
  wedding:  { normalise: normaliseWeddingData, skeleton: makeWeddingSkeleton, grow: growWedding, stats: weddingStats },
  birthday: { normalise: normaliseBirthdayData, skeleton: makeBirthdaySkeleton, grow: growBirthday, stats: birthdayStats },
  match:    { normalise: normaliseMatchData, skeleton: makeMatchSkeleton, grow: growMatch, stats: matchStats }
};

// "12/06/2027", "12-6-27", "2027-06-12" → "12.06.2027", so the way a date is
// typed never changes the design. Anything else is kept as written.
function canonicalDate(text) {
  const clean = String(text || '').trim();
  let m = clean.match(/^(\d{1,2})[.\/\-\s](\d{1,2})[.\/\-\s](\d{2}|\d{4})$/);
  if (m) {
    const year = m[3].length === 2 ? '20' + m[3] : m[3];
    return m[1].padStart(2, '0') + '.' + m[2].padStart(2, '0') + '.' + year;
  }
  m = clean.match(/^(\d{4})[.\/\-](\d{1,2})[.\/\-](\d{1,2})$/);
  if (m) return m[3].padStart(2, '0') + '.' + m[2].padStart(2, '0') + '.' + m[1];
  return clean.toLowerCase();
}

// details = { occasion, name, date, place, seed, style (marathon), data: {…},
//             product, colours: { fabric, club }, showNumbers }
function buildDesign(details) {
  const occasion = details.occasion in OCCASION_ENGINES ? details.occasion : 'wedding';
  const engine = OCCASION_ENGINES[occasion];
  const seedKey = removeAccents(details.name).toUpperCase().trim() + '::' + canonicalDate(details.date) + '::' +
    removeAccents(details.place).toUpperCase().trim() + '::' + occasion + '::' + details.seed;
  const data = engine.normalise(details.data || {});
  const print = printContext(details.product);
  let shapes, style = null;

  if (occasion === 'marathon') {
    style = details.style in MARATHON_STYLES ? details.style : 'sprigs';
    const skeleton = buildMarathonSkeleton(seedKey);
    shapes = style === 'medallion' ? growMedallion(skeleton.medallion, data, print) : growSprigs(skeleton.sprigs, data, print);
  } else {
    shapes = engine.grow(cachedSkeleton(seedKey, engine.skeleton), data, print);
  }

  // Short terracotta rule between the name and the date line
  shapes.push({ kind: 'line', colour: 'terracotta', width: Math.max(2, print.minLine),
    points: [[430, 912], [570, 912]] });

  const statsText = details.showNumbers === false ? '' : engine.stats(data);
  let texts = buildTextItems(details, statsText, print);
  if (occasion === 'wedding') texts = weddingMonogram(details.name).concat(texts);

  return {
    occasion: occasion, style: style, shapes: shapes, texts: texts, data: data, print: print,
    palette: resolvePalette(details.colours, occasion)
  };
}

function cachedSkeleton(seedKey, maker) {
  if (!skeletonCache.has(seedKey)) {
    if (skeletonCache.size > 12) skeletonCache.delete(skeletonCache.keys().next().value);
    skeletonCache.set(seedKey, maker(createRng(hashString(seedKey))));
  }
  return skeletonCache.get(seedKey);
}

/* --------------------------------------------------------------------------
   10. Colour plans
   Designs are drawn with two ROLES — "terracotta" and "ink" — and only turned
   into real colours here, so one design can be printed three ways:
   - light fabric (default): terracotta + ink on cream
   - dark fabric: rust-light + cream on the fabric itself (no background)
   - club colours (match / team orders only): the club's two colours, with a
     too-pale colour (e.g. white on cream) swapped for brand ink so it shows
   -------------------------------------------------------------------------- */
const DARK_FABRIC   = '#2a1e10';   // how a dark tote is shown on screen
const DARK_ACCENT   = '#b87050';   // rust-light: terracotta is too dark on dark fabric

// Approximate county colours. The shop confirms exact club colours before printing.
const CLUB_COLOURS = {
  antrim:    { label: 'Antrim',    primary: '#f2b800', secondary: '#ffffff' },
  armagh:    { label: 'Armagh',    primary: '#f47b20', secondary: '#ffffff' },
  carlow:    { label: 'Carlow',    primary: '#c8102e', secondary: '#007a3d' },
  cavan:     { label: 'Cavan',     primary: '#0033a0', secondary: '#ffffff' },
  clare:     { label: 'Clare',     primary: '#f2b800', secondary: '#0033a0' },
  cork:      { label: 'Cork',      primary: '#c8102e', secondary: '#ffffff' },
  derry:     { label: 'Derry',     primary: '#c8102e', secondary: '#ffffff' },
  donegal:   { label: 'Donegal',   primary: '#007a3d', secondary: '#ffd100' },
  down:      { label: 'Down',      primary: '#c8102e', secondary: '#111111' },
  dublin:    { label: 'Dublin',    primary: '#5cb3ff', secondary: '#0b1f4b' },
  fermanagh: { label: 'Fermanagh', primary: '#007a3d', secondary: '#ffffff' },
  galway:    { label: 'Galway',    primary: '#7a1e3a', secondary: '#ffffff' },
  kerry:     { label: 'Kerry',     primary: '#007a3d', secondary: '#ffd100' },
  kildare:   { label: 'Kildare',   primary: '#ffffff', secondary: '#111111' },
  kilkenny:  { label: 'Kilkenny',  primary: '#111111', secondary: '#ffb81c' },
  laois:     { label: 'Laois',     primary: '#0033a0', secondary: '#ffffff' },
  leitrim:   { label: 'Leitrim',   primary: '#007a3d', secondary: '#ffd100' },
  limerick:  { label: 'Limerick',  primary: '#007a3d', secondary: '#ffffff' },
  longford:  { label: 'Longford',  primary: '#0033a0', secondary: '#ffd100' },
  louth:     { label: 'Louth',     primary: '#c8102e', secondary: '#ffffff' },
  mayo:      { label: 'Mayo',      primary: '#007a3d', secondary: '#c8102e' },
  meath:     { label: 'Meath',     primary: '#007a3d', secondary: '#ffd100' },
  monaghan:  { label: 'Monaghan',  primary: '#ffffff', secondary: '#0033a0' },
  offaly:    { label: 'Offaly',    primary: '#007a3d', secondary: '#ffb81c' },
  roscommon: { label: 'Roscommon', primary: '#f2d35c', secondary: '#0033a0' },
  sligo:     { label: 'Sligo',     primary: '#111111', secondary: '#ffffff' },
  tipperary: { label: 'Tipperary', primary: '#0033a0', secondary: '#ffd100' },
  tyrone:    { label: 'Tyrone',    primary: '#ffffff', secondary: '#c8102e' },
  waterford: { label: 'Waterford', primary: '#ffffff', secondary: '#0033a0' },
  westmeath: { label: 'Westmeath', primary: '#7a1e3a', secondary: '#ffffff' },
  wexford:   { label: 'Wexford',   primary: '#5b2c83', secondary: '#ffd100' },
  wicklow:   { label: 'Wicklow',   primary: '#0033a0', secondary: '#ffd100' }
};

function relativeLuminance(hex) {
  const v = parseInt(hex.replace('#', ''), 16);
  const channel = function(c) { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  return 0.2126 * channel((v >> 16) & 255) + 0.7152 * channel((v >> 8) & 255) + 0.0722 * channel(v & 255);
}

function contrastRatio(a, b) {
  const la = relativeLuminance(a), lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

// colours = { fabric: 'light' | 'dark', club: null | key of CLUB_COLOURS | { primary, secondary } }
function resolvePalette(colours, occasion) {
  const dark = !!colours && colours.fabric === 'dark';
  const ground = dark ? DARK_FABRIC : BRAND_COLOURS.cream;
  const brandAccent = dark ? DARK_ACCENT : BRAND_COLOURS.terracotta;
  const brandInk = dark ? BRAND_COLOURS.cream : BRAND_COLOURS.ink;
  const palette = {
    dark: dark, ground: ground, printGround: !dark,
    terracotta: brandAccent, ink: brandInk,          // artwork roles
    textInk: brandInk, textAccent: brandAccent,       // text always stays brand
    clubLabel: null
  };

  // Club colours: team designs only
  const club = colours && colours.club
    ? (typeof colours.club === 'string' ? CLUB_COLOURS[colours.club] : colours.club)
    : null;
  if (club && occasion === 'match') {
    const legible = function(hex) { return contrastRatio(hex, ground) >= 1.8 ? hex : null; };
    palette.terracotta = legible(club.primary) || brandInk;
    palette.ink = legible(club.secondary) || (palette.terracotta === brandInk ? brandAccent : brandInk);
    palette.clubLabel = club.label || 'Custom';
  }
  return palette;
}

// The distinct inks a design uses (for the print-file header)
function inksUsed(design) {
  const inks = new Set();
  design.shapes.forEach(function(shape) { inks.add(design.palette[shape.colour]); });
  design.texts.forEach(function(item) { inks.add(textColour(design, item.colour)); });
  return Array.from(inks);
}

function textColour(design, role) {
  return role === 'ink' ? design.palette.textInk : design.palette.textAccent;
}

/* --------------------------------------------------------------------------
   11. Preview on a p5 canvas / p5.Graphics (screen only — not the print file)
   -------------------------------------------------------------------------- */
// Fill a whole canvas with the design
function paintDesign(p, sizePx, design, options) {
  p.push();
  p.background(design.palette.ground);
  p.pop();
  paintDesignAt(p, 0, 0, sizePx, design, options);
}

// Draw the design as a square at (x, y) on any canvas — e.g. on a tote.
// options.shapeScale(shape, index) → 0..1 lets the generator "grow" new
// shapes in from their base point; 0 hides a shape, 1 draws it fully.
function paintDesignAt(p, x, y, sizePx, design, options) {
  const k = sizePx / DESIGN_SIZE;
  const scaleOf = options && options.shapeScale;
  p.push();
  p.translate(x, y);
  p.noStroke();
  p.fill(design.palette.ground);
  p.rect(0, 0, sizePx, sizePx);
  design.shapes.forEach(function(shape, index) {
    const grow = scaleOf ? scaleOf(shape, index) : 1;
    if (grow <= 0) return;
    if (grow >= 1) { paintShape(p, shape, k, design.palette[shape.colour]); return; }
    const anchor = shapeAnchor(shape);
    p.push();
    p.translate(anchor[0] * k, anchor[1] * k);
    p.scale(grow);
    p.translate(-anchor[0] * k, -anchor[1] * k);
    paintShape(p, shape, k, design.palette[shape.colour]);
    p.pop();
  });
  design.texts.forEach(function(item) { paintText(p, item, k, textColour(design, item.colour)); });
  p.pop();
}

// Where a shape "grows from": a leaf's base, a stem's start, a dot's centre
function shapeAnchor(shape) {
  return shape.points ? shape.points[0] : [shape.x, shape.y];
}

// A stable identity for a shape, so the generator can tell new from old
function shapeKey(shape) {
  const a = shapeAnchor(shape);
  return shape.kind + ':' + shape.colour + ':' + Math.round(a[0]) + ',' + Math.round(a[1]);
}

function paintShape(p, shape, k, colour) {
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

// Text is drawn with the canvas directly so it can use a font STACK:
// Merriweather / Courier Prime first, then Noto Serif SC for Chinese names —
// the same fonts the print file falls back to.
function previewFont(item, sizePx) {
  return item.font === 'serif'
    ? '700 ' + sizePx + 'px Merriweather, "Noto Serif SC", Georgia, serif'
    : '400 ' + sizePx + 'px "Courier Prime", "Noto Serif SC", "Courier New", monospace';
}

function paintText(p, item, k, colour) {
  const ctx = p.drawingContext;
  let size = item.size * k;
  ctx.save();
  ctx.font = previewFont(item, size);
  if (item.maxWidth) {
    const width = ctx.measureText(item.text).width;
    if (width > item.maxWidth * k) {
      size = size * (item.maxWidth * k) / width;
      ctx.font = previewFont(item, size);
    }
  }
  ctx.fillStyle = colour;
  ctx.textAlign = item.align;
  ctx.textBaseline = { middle: 'middle', top: 'top', bottom: 'bottom', baseline: 'alphabetic' }[item.valign];
  ctx.fillText(item.text, item.x * k, item.y * k);
  ctx.restore();
}

/* --------------------------------------------------------------------------
   11b. Product mockups (screen only)
   Simple flat drawings of each product with the design placed on it — used
   by the homepage product cards and the generator's "on the product" view.
   paintProductMockup(g, w, h, product, designs, opts)
     product: 'tote' | 'coaster' | 'coasters' (set of four) | 'keychain' | 'event'
     designs: one design (or four for 'coasters'; two for 'event': tote, keychain)
     opts.fabric: 'light' | 'dark' (colour of the tote)
   -------------------------------------------------------------------------- */
const MOCKUP_COLOURS = {
  toteLight: '#e8dcc4', toteDark: '#2f241a', strap: '#8a7a5c',
  cork: '#d8cba8', acrylic: '#f3ece0', acrylicEdge: '#d8cba8', metal: '#8a7a5c',
  shadow: 'rgba(42, 30, 16, 0.10)'
};

function paintProductMockup(g, w, h, product, designs, opts) {
  const list = Array.isArray(designs) ? designs : [designs];
  const fabric = opts && opts.fabric === 'dark' ? 'dark' : 'light';
  const s = Math.min(w, h);
  const ox = (w - s) / 2, oy = (h - s) / 2;
  g.push();
  g.translate(ox, oy);
  if (product === 'tote') drawToteMockup(g, 0, 0, s, list[0], fabric);
  else if (product === 'coaster') drawCoasterMockup(g, s * 0.1, s * 0.1, s * 0.8, list[0], 0);
  else if (product === 'coasters') drawCoasterSet(g, s, list);
  else if (product === 'keychain') drawKeychainMockup(g, s * 0.5, s * 0.08, s * 0.84, list[0]);
  else if (product === 'event') {
    drawToteMockup(g, -s * 0.06, s * 0.02, s * 0.86, list[0], fabric);
    drawKeychainMockup(g, s * 0.8, s * 0.36, s * 0.42, list[1] || list[0]);
  }
  g.pop();
}

function mockupShadow(g, x, y, w, h, r) {
  g.noStroke();
  g.fill(MOCKUP_COLOURS.shadow);
  g.rect(x + w * 0.03, y + h * 0.04, w, h, r);
}

// Tote: two handles, the bag, and the print on the front (60% of the bag width)
function drawToteMockup(g, x, y, s, design, fabric) {
  const bagX = x + s * 0.16, bagY = y + s * 0.3, bagW = s * 0.68, bagH = s * 0.64;
  g.noFill();
  g.stroke(MOCKUP_COLOURS.strap);
  g.strokeWeight(Math.max(2, s * 0.022));
  g.strokeCap('round');
  g.arc(x + s * 0.4, bagY + s * 0.01, s * 0.16, s * 0.34, Math.PI, 0);
  g.arc(x + s * 0.6, bagY + s * 0.01, s * 0.16, s * 0.34, Math.PI, 0);
  mockupShadow(g, bagX, bagY, bagW, bagH, s * 0.02);
  g.noStroke();
  g.fill(fabric === 'dark' ? MOCKUP_COLOURS.toteDark : MOCKUP_COLOURS.toteLight);
  g.rect(bagX, bagY, bagW, bagH, s * 0.02);
  const print = bagW * 0.6;
  paintDesignAt(g, bagX + (bagW - print) / 2, bagY + bagH * 0.16, print, design);
}

// One coaster: a cork square with the design printed edge to edge (inset a touch)
function drawCoasterMockup(g, x, y, s, design, rotation) {
  g.push();
  g.translate(x + s / 2, y + s / 2);
  g.rotate(rotation || 0);
  mockupShadow(g, -s / 2, -s / 2, s, s, s * 0.08);
  g.noStroke();
  g.fill(MOCKUP_COLOURS.cork);
  g.rect(-s / 2, -s / 2, s, s, s * 0.08);
  paintDesignAt(g, -s * 0.44, -s * 0.44, s * 0.88, design);
  g.pop();
}

// Four coasters, four variations, slightly scattered on the table
function drawCoasterSet(g, s, designs) {
  const size = s * 0.42;
  const spots = [[0.06, 0.06, -0.06], [0.52, 0.04, 0.05], [0.04, 0.52, 0.04], [0.5, 0.5, -0.04]];
  spots.forEach(function(spot, i) {
    drawCoasterMockup(g, s * spot[0], s * spot[1], size, designs[i % designs.length], spot[2]);
  });
}

// Keychain: a metal ring, a short link, and a clear acrylic tag
function drawKeychainMockup(g, cx, top, s, design) {
  const ringR = s * 0.11;
  const tagW = s * 0.56, tagH = s * 0.7, tagX = cx - tagW / 2, tagY = top + ringR * 2.2;
  g.noFill();
  g.stroke(MOCKUP_COLOURS.metal);
  g.strokeWeight(Math.max(2, s * 0.025));
  g.circle(cx, top + ringR, ringR * 2);
  g.line(cx, top + ringR * 2, cx, tagY + s * 0.02);
  mockupShadow(g, tagX, tagY, tagW, tagH, s * 0.08);
  g.fill(MOCKUP_COLOURS.acrylic);
  g.stroke(MOCKUP_COLOURS.acrylicEdge);
  g.strokeWeight(Math.max(1.5, s * 0.012));
  g.rect(tagX, tagY, tagW, tagH, s * 0.08);
  g.noStroke();
  g.fill(MOCKUP_COLOURS.metal);
  g.circle(cx, tagY + s * 0.05, s * 0.035);
  const print = tagW * 0.84;
  paintDesignAt(g, cx - print / 2, tagY + (tagH - print) / 2 + s * 0.03, print, design);
}

/* --------------------------------------------------------------------------
   12. Print file (SVG)
   - Solid colours only, no transparency anywhere
   - Background on its own layer (light fabric), so it can be dropped for cream stock
   - Text converted to outlines with opentype.js, glyph by glyph:
     Latin → Latin Extended → Noto Serif SC (Chinese), loaded only when needed.
     Characters no font has are reported, never silently dropped.
   - If the fonts can't load (offline), live <text> is written with a PRINT NOTE
   -------------------------------------------------------------------------- */
const FONTSOURCE = 'https://cdn.jsdelivr.net/npm/@fontsource/';
const PRINT_FONT_FILES = {
  serif: [FONTSOURCE + 'merriweather@5.3.0/files/merriweather-latin-700-normal.woff',
          FONTSOURCE + 'merriweather@5.3.0/files/merriweather-latin-ext-700-normal.woff'],
  mono:  [FONTSOURCE + 'courier-prime@5.3.0/files/courier-prime-latin-400-normal.woff',
          FONTSOURCE + 'courier-prime@5.3.0/files/courier-prime-latin-ext-400-normal.woff']
};
// Chinese: Noto Serif SC is split into ~100 small files by Unicode range.
// Its stylesheet says which file holds which characters; we fetch only those.
const CJK_FONT = {
  base: FONTSOURCE + 'noto-serif-sc@5.3.1/',
  weight: { serif: 700, mono: 400 }
};

const fontFileCache = new Map();

function fetchFont(url) {
  if (!fontFileCache.has(url)) {
    fontFileCache.set(url, fetch(url)
      .then(function(response) {
        if (!response.ok) throw new Error('Font download failed: ' + url);
        return response.arrayBuffer();
      })
      .then(function(buffer) { return opentype.parse(buffer); })
      .catch(function(error) { fontFileCache.delete(url); throw error; }));
  }
  return fontFileCache.get(url);
}

function loadPrintFonts() {
  if (typeof opentype === 'undefined') return Promise.reject(new Error('opentype.js not loaded'));
  return Promise.all([Promise.all(PRINT_FONT_FILES.serif.map(fetchFont)), Promise.all(PRINT_FONT_FILES.mono.map(fetchFont))])
    .then(function(lists) { return { serif: lists[0], mono: lists[1] }; });
}

function hasGlyph(font, ch) {
  return font.charToGlyph(ch).index > 0;
}

// Unicode-range index of the Chinese font, per weight
const cjkIndexCache = new Map();

function loadCjkIndex(weight) {
  if (!cjkIndexCache.has(weight)) {
    cjkIndexCache.set(weight, fetch(CJK_FONT.base + weight + '.css')
      .then(function(response) { return response.text(); })
      .then(function(css) {
        const blocks = css.match(/@font-face\s*{[^}]*}/g) || [];
        return blocks.map(function(block) {
          const file = (block.match(/url\(\.\/(files\/[^)]+\.woff)\)/) || [])[1];
          const ranges = (block.match(/unicode-range:\s*([^;]+);/) || [])[1] || '';
          return {
            file: file,
            ranges: ranges.split(',').map(function(part) {
              const bounds = part.trim().replace(/U\+/i, '').split('-');
              const start = parseInt(bounds[0], 16);
              return [start, bounds[1] ? parseInt(bounds[1], 16) : start];
            })
          };
        }).filter(function(entry) { return entry.file; });
      })
      .catch(function(error) { cjkIndexCache.delete(weight); throw error; }));
  }
  return cjkIndexCache.get(weight);
}

// Add the Chinese font files that cover `chars` to a font list
function withCjkFonts(fonts, chars, weight) {
  if (!chars.size) return Promise.resolve(fonts);
  return loadCjkIndex(weight).then(function(index) {
    const files = new Set();
    chars.forEach(function(ch) {
      const code = ch.codePointAt(0);
      index.forEach(function(entry) {
        if (entry.ranges.some(function(r) { return code >= r[0] && code <= r[1]; })) files.add(entry.file);
      });
    });
    return Promise.all(Array.from(files).map(function(file) { return fetchFont(CJK_FONT.base + file); }));
  }).then(function(extra) { return fonts.concat(extra); })
    .catch(function() { return fonts; });         // offline → those characters are reported missing
}

// Returns { svg, outlined, missing } — outlined is false when text fell back
// to <text>; missing lists characters no print font could draw.
function buildDesignSvg(design, meta) {
  return loadPrintFonts()
    .then(function(base) {
      const need = { serif: new Set(), mono: new Set() };
      design.texts.forEach(function(item) {
        Array.from(item.text).forEach(function(ch) {
          if (ch.trim() && !base[item.font].some(function(font) { return hasGlyph(font, ch); })) need[item.font].add(ch);
        });
      });
      return Promise.all([
        withCjkFonts(base.serif, need.serif, CJK_FONT.weight.serif),
        withCjkFonts(base.mono, need.mono, CJK_FONT.weight.mono)
      ]);
    })
    .then(function(lists) {
      const missing = new Set();
      const svg = writeSvg(design, meta, { serif: lists[0], mono: lists[1] }, missing);
      return { svg: svg, outlined: true, missing: Array.from(missing) };
    })
    .catch(function() {
      return { svg: writeSvg(design, meta, null, new Set()), outlined: false, missing: [] };
    });
}

function writeSvg(design, meta, fonts, missing) {
  const mm = design.print.mm;
  const palette = design.palette;
  const out = [];
  out.push('<?xml version="1.0" encoding="UTF-8"?>');
  out.push('<!-- inky (印纪) print file');
  out.push('     order code: ' + meta.orderCode);
  if (meta.designKey) out.push('     design key: ' + meta.designKey);
  out.push('     product:    ' + PRODUCTS[design.print.product].label + ' (' + mm + ' × ' + mm + ' mm)');
  out.push('     fabric:     ' + (palette.dark ? 'dark — print straight onto the fabric, no background' : 'light'));
  if (palette.clubLabel) out.push('     colours:    club colours (' + palette.clubLabel + ') — confirm exact shades before printing');
  out.push('     inks:       ' + inksUsed(design).join(', '));
  out.push('     All artwork is solid colour: no transparency, no gradients.');
  out.push('     Minimum line ' + PRINT_RULES.minLineMm + ' mm, minimum dot ' + PRINT_RULES.minDotMm + ' mm. -->');
  out.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${mm}mm" height="${mm}mm" viewBox="0 0 ${DESIGN_SIZE} ${DESIGN_SIZE}">`);
  if (palette.printGround) {
    out.push('  <!-- Background layer: delete when printing straight onto cream / natural stock -->');
    out.push(`  <g id="background"><rect width="${DESIGN_SIZE}" height="${DESIGN_SIZE}" fill="${palette.ground}"/></g>`);
  }

  // Artwork in paint order. Consecutive shapes of one role share a group,
  // labelled by role, which keeps the stacking and still makes separation easy.
  out.push('  <g id="artwork">');
  let openRole = null;
  design.shapes.forEach(function(shape) {
    if (shape.colour !== openRole) {
      if (openRole) out.push('    </g>');
      out.push(`    <g class="ink-${shape.colour}">`);
      openRole = shape.colour;
    }
    out.push('      ' + shapeToSvg(shape, palette[shape.colour]));
  });
  if (openRole) out.push('    </g>');
  out.push('  </g>');

  out.push('  <g id="text">');
  if (!fonts) {
    out.push('    <!-- PRINT NOTE: Convert all text to outlines in Illustrator/Inkscape before sending to xTool -->');
  }
  design.texts.forEach(function(item) {
    const colour = textColour(design, item.colour);
    out.push('    ' + (fonts ? textToSvgPath(item, fonts[item.font], colour, missing) : textToSvgText(item, colour)));
  });
  out.push('  </g>');
  out.push('</svg>');
  return out.join('\n');
}

function svgPoints(points) {
  return points.map(function(pt) { return pt[0].toFixed(1) + ',' + pt[1].toFixed(1); }).join(' ');
}

function shapeToSvg(shape, colour) {
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

// Split text into runs that each use the first font able to draw them
function fontRuns(text, fonts, missing) {
  const runs = [];
  Array.from(text).forEach(function(ch) {
    let font = fonts.find(function(f) { return hasGlyph(f, ch); });
    if (!font) {
      if (ch.trim()) missing.add(ch);
      font = fonts[0];                     // keeps the spacing; the glyph itself is blank
    }
    const last = runs[runs.length - 1];
    if (last && last.font === font) last.text += ch;
    else runs.push({ font: font, text: ch });
  });
  return runs;
}

// Text as outlines. Vertical alignment mirrors the canvas preview.
function textToSvgPath(item, fonts, colour, missing) {
  const runs = fontRuns(item.text, fonts, missing);
  const primary = fonts[0];
  const upm = primary.unitsPerEm;
  let size = item.size;
  const measure = function(s) {
    return runs.reduce(function(sum, run) { return sum + run.font.getAdvanceWidth(run.text, s); }, 0);
  };
  let width = measure(size);
  if (item.maxWidth && width > item.maxWidth) {
    size = size * item.maxWidth / width;
    width = item.maxWidth;
  }

  let baseline = item.y;
  if (item.valign === 'middle') baseline = item.y + size * (primary.ascender + primary.descender) / (2 * upm);
  if (item.valign === 'top') baseline = item.y + size * primary.ascender / upm;
  if (item.valign === 'bottom') baseline = item.y + size * primary.descender / upm;

  let x = item.x;
  if (item.align === 'center') x = item.x - width / 2;
  if (item.align === 'right') x = item.x - width;

  let d = '';
  runs.forEach(function(run) {
    d += run.font.getPath(run.text, x, baseline, size).toPathData(2);
    x += run.font.getAdvanceWidth(run.text, size);
  });
  return `<path fill="${colour}" d="${d}"/>`;
}

// Fallback when the print fonts are unavailable
function textToSvgText(item, colour) {
  const anchor = { left: 'start', center: 'middle', right: 'end' }[item.align];
  const baseline = { top: 'hanging', middle: 'middle', bottom: 'text-after-edge', baseline: 'alphabetic' }[item.valign];
  const family = item.font === 'serif' ? "Merriweather, 'Noto Serif SC', Georgia, serif" : "'Courier Prime', 'Noto Serif SC', 'Courier New', monospace";
  const weight = item.font === 'serif' ? ' font-weight="700"' : '';
  return `<text x="${item.x}" y="${item.y}" font-family="${family}"${weight} font-size="${item.size}" fill="${colour}" text-anchor="${anchor}" dominant-baseline="${baseline}">${escapeXml(item.text)}</text>`;
}

// Quick check while typing: characters outside what the print fonts cover
// (Latin, Latin Extended, common punctuation, Chinese). Emoji etc. can't print.
function unprintableChars(text) {
  const bad = new Set();
  Array.from(String(text || '')).forEach(function(ch) {
    const c = ch.codePointAt(0);
    const ok = (c >= 0x20 && c <= 0x24F) || (c >= 0x1E00 && c <= 0x1EFF) || (c >= 0x2000 && c <= 0x206F) ||
      c === 0x20AC || (c >= 0x3000 && c <= 0x303F) || (c >= 0x3400 && c <= 0x4DBF) ||
      (c >= 0x4E00 && c <= 0x9FFF) || (c >= 0xFF00 && c <= 0xFFEF);
    if (!ok) bad.add(ch);
  });
  return Array.from(bad);
}

/* --------------------------------------------------------------------------
   13. Design key + order code
   Without a database, the design has to travel with the customer. The DESIGN
   KEY is every input, packed into a URL-safe string: the generator reopens it
   exactly (generator.html#design=…). The ORDER CODE is short and readable for
   humans, and ends in a 5-character check computed from the design key, so the
   shop can confirm a key belongs to the code they were quoted.
   -------------------------------------------------------------------------- */
const DESIGN_KEY_VERSION = 1;

// Every input that changes the design, in a fixed order with short names
function designPayload(details) {
  return {
    v: DESIGN_KEY_VERSION,
    o: details.occasion, n: details.name || '', d: details.date || '', p: details.place || '',
    s: details.seed, st: details.style || 'sprigs', pr: details.product || 'tote',
    fab: (details.colours && details.colours.fabric) || 'light',
    cl: (details.colours && details.colours.club) || null,
    num: details.showNumbers !== false,
    data: details.data || {}
  };
}

function toBase64Url(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  bytes.forEach(function(b) { binary += String.fromCharCode(b); });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(text) {
  const binary = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
  const bytes = Uint8Array.from(binary, function(ch) { return ch.charCodeAt(0); });
  return new TextDecoder().decode(bytes);
}

function encodeDesignKey(details) {
  return toBase64Url(JSON.stringify(designPayload(details)));
}

// A design key (or a whole link containing one) → details, or null
function decodeDesignKey(input) {
  try {
    const key = String(input || '').trim().replace(/^.*#design=/, '');
    const raw = JSON.parse(fromBase64Url(key));
    if (!raw || raw.v !== DESIGN_KEY_VERSION || !(raw.o in OCCASION_ENGINES)) return null;
    return {
      occasion: raw.o, name: raw.n, date: raw.d, place: raw.p, seed: raw.s, style: raw.st,
      product: raw.pr, colours: { fabric: raw.fab, club: raw.cl }, showNumbers: raw.num !== false,
      data: raw.data || {}
    };
  } catch (error) {
    return null;
  }
}

// 5-character check from the design key (base 32, no look-alike letters)
function designCheck(details) {
  const alphabet = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  let h = hashString(JSON.stringify(designPayload(details)));
  let out = '';
  for (let i = 0; i < 5; i++) { out += alphabet[h % 32]; h = Math.floor(h / 32); }
  return out;
}

// e.g. INK-WE-AOIFEC-12062027-K7Q2M
function orderCodeFor(details) {
  return generateOrderCode(details.name, details.date, details.occasion, designCheck(details));
}
