/* ==========================================================================
   inky (印纪) — Growth engine (v1: marathon)
   --------------------------------------------------------------------------
   A pattern that GROWS with the data instead of being re-rolled by it.

   The one rule everything follows:
     the SEED decides what the pattern looks like  (skeleton)
     the DATA decides how much of it has grown     (growth)

   - buildMarathonSkeleton(seedKey)  identity only: name, date, place, seed no.
                                     Route shape, wreath leaf slots, feather slots.
                                     Run data never re-randomises any of this.
   - normaliseRunData(raw)           raw run data → 0..1 "richness" values
   - growMarathon(skeleton, run, print)
                                     continuous functions decide how much is
                                     shown, how thick, which brand colour.
                                     No randomness at this stage.
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
const ROUTE_POINTS  = 480;    // resolution of the full seeded route
const LANES_PER_SIDE = 5;     // contour lines that grow beside the route

// Where things live in the 1000 × 1000 box
const ROUTE_AREA = { cx: 500, cy: 420, rx: 290, ry: 255 };    // route fits inside this ellipse
const WREATH     = { cx: 500, cy: 420, rx: 420, ry: 360, slotsPerSide: 18 };

// Colour switch: stretches run faster than this (relative 0..1) turn terracotta
const FAST_THRESHOLD = 0.55;

// Print fonts for converting text to outlines (WOFF — opentype.js can parse these)
const PRINT_FONT_URLS = {
  serif: 'https://cdn.jsdelivr.net/npm/@fontsource/merriweather@5.3.0/files/merriweather-latin-700-normal.woff',
  mono:  'https://cdn.jsdelivr.net/npm/@fontsource/courier-prime@5.3.0/files/courier-prime-latin-400-normal.woff'
};

// "印纪" as outlines (Noto Serif SC, SIL Open Font License 1.1), drawn at
// size 1000 on a baseline at y = 0, 2000 units wide. Stored here so the print
// file never needs to download a Chinese font.
const BRAND_CJK_PATH = 'M613-733L837-733L870-774L955-711Q944-699 912-692L912-692L912-189Q912-164 904.5-144Q897-124 872-111Q847-98 795-92L795-92Q793-108 786.5-120.5Q780-133 769-140L769-140Q756-149 731-156Q706-163 665-168L665-168L665-183L685-182Q705-180 732-178.5Q759-177 784-175.5Q809-174 818-174L818-174Q835-174 841-179.5Q847-185 847-198L847-198L847-704L601-704L601 55Q601 58 594.5 63.5Q588 69 576 73.5Q564 78 546 78L546 78L536 78L536-773L613-733ZM106-187L106-757L177-717Q204-726 236-737L236-737Q283-754 332.5-774.5Q382-795 427-818L427-818L493-749Q486-744 478-743.5Q470-743 457-748L457-748Q411-733 355.5-721.5Q300-710 247-703L247-703Q204-697 170-693L170-693L170-455L335-455L382-515L391-508Q400-501 413-489.5Q426-478 441-465.5Q456-453 468-441L468-441Q464-425 441-425L441-425L170-425L170-167Q176-169 182-170L182-170Q242-184 318.5-203Q395-222 475-242L475-242L479-227Q420-202 324-162L324-162Q232-124 124-83L124-83Q123-83 123-82L123-82Q113-73 105-69L105-69L70-147Q94-158 100-165.5Q106-173 106-187L106-187ZM1417-759L1813-759L1850-801L1934-736Q1929-730 1916.5-724.5Q1904-719 1887-715L1887-715L1887-367Q1887-363 1877.5-358Q1868-353 1856-349Q1844-345 1833-345L1833-345L1823-345L1823-428L1520-428L1520-37Q1520-21 1531-15Q1542-9 1582-9L1582-9L1726-9Q1776-9 1811-9.5Q1846-10 1861-12L1861-12Q1872-13 1877-16.5Q1882-20 1886-28L1886-28Q1892-42 1901.5-81.5Q1911-121 1920-174L1920-174L1933-174L1936-21Q1954-16 1960.5-10Q1967-4 1967 7L1967 7Q1967 19 1957.5 27.5Q1948 36 1922.5 40.5Q1897 45 1849 46.5Q1801 48 1724 48L1724 48L1576 48Q1528 48 1502 42Q1476 36 1466.5 19.5Q1457 3 1457-27L1457-27L1457-491L1533-457L1823-457L1823-730L1426-730L1417-759ZM1359-663L1449-604Q1443-595 1428-592L1428-592Q1420-590 1409-594L1409-594Q1388-563 1357-527L1357-527Q1318-482 1271-434Q1224-386 1175-342L1175-342Q1144-315 1114-291L1114-291Q1126-293 1140-295L1140-295Q1195-302 1265.5-312Q1336-322 1409-334L1409-334L1411-318Q1361-301 1275-272L1275-272Q1193-244 1095-216L1095-216Q1084-201 1073-196L1073-196L1037-288L1049-291Q1061-293 1067-298L1067-298Q1105-328 1147.5-374Q1190-420 1232-473L1232-473Q1251-497 1268-521L1268-521Q1244-514 1214-506L1214-506Q1154-489 1088-471L1088-471Q1079-460 1069-456L1069-456L1033-548L1044-551Q1054-553 1059-557L1059-557Q1084-579 1110-613.5Q1136-648 1160.5-687.5Q1185-727 1205-764.5Q1225-802 1236-831L1236-831L1333-784Q1329-775 1314-771L1314-771Q1306-768 1296-770L1296-770Q1280-746 1259-720L1259-720Q1232-685 1201-650Q1170-615 1137-582L1137-582Q1115-560 1094-542L1094-542Q1104-542 1114-543L1114-543Q1156-544 1208-546L1208-546Q1248-548 1289-550L1289-550Q1298-562 1306-575L1306-575Q1339-625 1359-663L1359-663ZM1084 22L1041-69Q1077-76 1137.5-91Q1198-106 1273-126Q1348-146 1424-167L1424-167L1429-154Q1373-124 1293-86Q1213-48 1106-4L1106-4Q1100 15 1084 22L1084 22Z';
const BRAND_CJK_ADVANCE = 2000;

/* --------------------------------------------------------------------------
   2. Small maths helpers
   -------------------------------------------------------------------------- */
function clamp01(v) { return Math.max(0, Math.min(1, v)); }
function lerp(a, b, t) { return a + (b - a) * t; }
function easeOutQuad(t) { return 1 - (1 - t) * (1 - t); }

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

  // With no distance yet, show a small "seedling" of route rather than nothing
  const routeFraction = km ? Math.max(0.04, clamp01(km / MARATHON_KM)) : 0.04;

  const filled = [km, minutes, profile, String(raw.date || '').trim(), String(raw.place || '').trim()];

  return {
    distanceKm: km,
    finishMinutes: minutes,
    paceProfile: profile,
    intensity: intensity,
    routeFraction: routeFraction,                 // how much of the route is drawn
    distance: easeOutQuad(routeFraction),         // 0..1 density driver
    time: minutes ? easeOutQuad(clamp01(minutes / 360)) : 0,
    richness: filled.filter(Boolean).length / filled.length   // "more data, fuller pattern"
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
   Each layer gets its own random stream, so nothing in one layer can shift
   when another layer changes.
   -------------------------------------------------------------------------- */
const skeletonCache = new Map();

function buildMarathonSkeleton(seedKey) {
  if (skeletonCache.has(seedKey)) return skeletonCache.get(seedKey);

  const root = hashString(seedKey);
  const routeRng   = createRng(hashString(root + ':route'));
  const wreathRng  = createRng(hashString(root + ':wreath'));
  const featherRng = createRng(hashString(root + ':feather'));

  const route = makeRouteShape(routeRng);
  const skeleton = {
    route: route,
    routeLengths: cumulativeLengths(route),
    leaves: makeLeafSlots(wreathRng),
    feathers: makeFeatherSlots(featherRng)
  };

  // Keep the cache small — the hero and compare view only need a handful
  if (skeletonCache.size > 12) skeletonCache.delete(skeletonCache.keys().next().value);
  skeletonCache.set(seedKey, skeleton);
  return skeleton;
}

// A wandering "running route": three gentle sine waves per axis plus a drift,
// so start and finish end up in different places. Whole thing = 42.195 km.
function makeRouteShape(rng) {
  const waves = [1, 2, 3].map(function(k) {
    return {
      ampX: rngRange(rng, 0.35, 1) / k,
      ampY: rngRange(rng, 0.35, 1) / k,
      freqX: k * rngRange(rng, 0.75, 1.3),
      freqY: k * rngRange(rng, 0.75, 1.3),
      phaseX: rng() * Math.PI * 2,
      phaseY: rng() * Math.PI * 2
    };
  });
  const driftX = rngRange(rng, -0.6, 0.6);
  const driftY = rngRange(rng, -0.4, 0.4);

  const points = [];
  for (let i = 0; i < ROUTE_POINTS; i++) {
    const s = i / (ROUTE_POINTS - 1);
    let x = driftX * s;
    let y = driftY * s;
    waves.forEach(function(w) {
      x += w.ampX * Math.sin(Math.PI * 2 * w.freqX * s + w.phaseX);
      y += w.ampY * Math.sin(Math.PI * 2 * w.freqY * s + w.phaseY);
    });
    points.push([x, y]);
  }
  return points;
}

function cumulativeLengths(points) {
  const lengths = [0];
  for (let i = 1; i < points.length; i++) {
    lengths.push(lengths[i - 1] + Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]));
  }
  return lengths;
}

// 18 leaf slots per side of the wreath. A slot's RANK decides when it appears:
// leaves near the base have low ranks, so the wreath grows from the bottom up.
function makeLeafSlots(rng) {
  const slots = [];
  [1, -1].forEach(function(side) {
    for (let i = 0; i < WREATH.slotsPerSide; i++) {
      slots.push({
        side: side,
        u: (i + 0.5) / WREATH.slotsPerSide,                 // position up the wreath
        rank: clamp01((i + rngRange(rng, -0.45, 0.45)) / WREATH.slotsPerSide + 0.02),
        scale: rngRange(rng, 0.85, 1.15),
        flip: i % 2 === 0 ? 1 : -1                           // alternate out / in
      });
    }
  });
  return slots;
}

// Up to three feathers at the finish line — they appear as intensity rises
function makeFeatherSlots(rng) {
  return [0, 1, 2].map(function(j) {
    return { order: j, rank: (j + rng() * 0.6) / 3, spread: rngRange(rng, -0.15, 0.15) };
  });
}

/* --------------------------------------------------------------------------
   6. Growth — how much of the skeleton the data has "grown"
   -------------------------------------------------------------------------- */

// Print context: the smallest allowed marks, converted to design units
function printContext(productKey) {
  const product = PRODUCTS[productKey] || PRODUCTS.tote;
  const unitsPerMm = DESIGN_SIZE / product.mm;
  return {
    product: productKey in PRODUCTS ? productKey : 'tote',
    mm: product.mm,
    unitsPerMm: unitsPerMm,
    minLine: PRINT_RULES.minLineMm * unitsPerMm,
    minDot: (PRINT_RULES.minDotMm / 2) * unitsPerMm,      // as a radius
    minText: PRINT_RULES.minTextMm * unitsPerMm,
    // Small products (keychain): thick minimum lines would clog fine detail,
    // so those prints draw fewer lanes and only every 5th km tick
    isSmall: PRINT_RULES.minLineMm * unitsPerMm > 3
  };
}

function growMarathon(skeleton, run, print) {
  const shapes = [];
  const path = layoutRoute(skeleton, run);

  addFrameRings(shapes, run, print);         // richness → border lines
  addPaceLanes(shapes, path, run, print);    // distance → lane count; pace → colour
  addRouteRibbon(shapes, path, run, print);  // pace → width + colour
  addKmTicks(shapes, path, run, print);      // one tick per km run
  addStartFinish(shapes, path, print);
  addWreath(shapes, skeleton, run, print);   // finish time × feeling → leaves
  addFinishFeathers(shapes, skeleton, path, run, print);   // feeling → feathers
  return shapes;
}

// Take the part of the route this run covers, fit it into the route area,
// and resample it evenly. Short runs are drawn smaller (55% of the area for
// a seedling, 100% for a full marathon) so the frame never looks empty.
function layoutRoute(skeleton, run) {
  const partial = routeUpTo(skeleton.route, skeleton.routeLengths, run.routeFraction);

  // Centre on the drawn part's bounding box
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  partial.forEach(function(pt) {
    minX = Math.min(minX, pt[0]); maxX = Math.max(maxX, pt[0]);
    minY = Math.min(minY, pt[1]); maxY = Math.max(maxY, pt[1]);
  });
  const midX = (minX + maxX) / 2;
  const midY = (minY + maxY) / 2;

  // Scale so the furthest point touches the target ellipse
  let reach = 0;
  partial.forEach(function(pt) {
    reach = Math.max(reach, Math.hypot((pt[0] - midX) / ROUTE_AREA.rx, (pt[1] - midY) / ROUTE_AREA.ry));
  });
  const target = lerp(0.55, 1, run.distance);
  const scale = reach > 0 ? target / reach : 1;

  const placed = partial.map(function(pt) {
    return [ROUTE_AREA.cx + (pt[0] - midX) * scale, ROUTE_AREA.cy + (pt[1] - midY) * scale];
  });
  const count = Math.round(40 + 360 * run.routeFraction);
  return resampleWithNormals(placed, count);
}

// Route points from the start up to `fraction` of its total length
function routeUpTo(points, lengths, fraction) {
  const stopAt = lengths[lengths.length - 1] * clamp01(fraction);
  const result = [points[0]];
  for (let i = 1; i < points.length; i++) {
    if (lengths[i] >= stopAt) {
      const segment = lengths[i] - lengths[i - 1];
      const t = segment > 0 ? (stopAt - lengths[i - 1]) / segment : 0;
      result.push([lerp(points[i - 1][0], points[i][0], t), lerp(points[i - 1][1], points[i][1], t)]);
      break;
    }
    result.push(points[i]);
  }
  return result;
}

// Even spacing along the path, with a unit normal at every point
function resampleWithNormals(points, count) {
  const lengths = cumulativeLengths(points);
  const total = lengths[lengths.length - 1];
  const even = [];
  let segment = 1;
  for (let i = 0; i < count; i++) {
    const target = total * i / (count - 1);
    while (segment < points.length - 1 && lengths[segment] < target) segment++;
    const span = lengths[segment] - lengths[segment - 1];
    const t = span > 0 ? (target - lengths[segment - 1]) / span : 0;
    even.push({
      x: lerp(points[segment - 1][0], points[segment][0], t),
      y: lerp(points[segment - 1][1], points[segment][1], t),
      t: i / (count - 1)
    });
  }
  even.forEach(function(pt, i) {
    const before = even[Math.max(0, i - 1)];
    const after = even[Math.min(even.length - 1, i + 1)];
    const length = Math.hypot(after.x - before.x, after.y - before.y) || 1;
    pt.nx = -(after.y - before.y) / length;
    pt.ny = (after.x - before.x) / length;
  });
  return even;
}

// Split a list of points into runs that share one colour.
// The boundary point belongs to both runs so there are no gaps.
function splitByColour(points, colourOf) {
  const runs = [];
  let current = null;
  points.forEach(function(pt, i) {
    const colour = colourOf(pt, i);
    if (!current || current.colour !== colour) {
      const previous = current ? current.points[current.points.length - 1] : null;
      current = { colour: colour, points: previous ? [previous] : [] };
      runs.push(current);
    }
    current.points.push(pt);
  });
  return runs.filter(function(r) { return r.points.length >= 2; });
}

// Richness → 0–2 thin border lines. "More data, fuller pattern."
function addFrameRings(shapes, run, print) {
  let count = Math.round(run.richness * 2);
  if (print.minLine > 4) count = Math.min(count, 1);   // tiny prints: lines would merge
  for (let k = 0; k < count; k++) {
    const inset = 22 + k * 10;
    shapes.push({
      kind: 'line', colour: 'ink', closed: true,
      width: Math.max(1, print.minLine),
      points: [[inset, inset], [DESIGN_SIZE - inset, inset],
               [DESIGN_SIZE - inset, DESIGN_SIZE - inset], [inset, DESIGN_SIZE - inset]]
    });
  }
}

// Contour lanes beside the route, like a running track.
// Distance decides how many lanes: each new lane grows along the route from
// the start, so going from 10 km to 42 km is a smooth fill-in, not a jump.
// Pace decides colour, with each lane switching at a slightly higher speed
// than the one inside it — so a faster stretch reads as a "gradient" of more
// and more terracotta lines, using only two inks.
function addPaceLanes(shapes, path, run, print) {
  const lanes = print.isSmall ? 2 : LANES_PER_SIDE;
  const progress = run.distance * lanes;
  const gap = Math.max(7, print.minLine * 2.2);
  const width = Math.max(0.9, print.minLine);

  for (let k = 1; k <= lanes; k++) {
    const grown = clamp01(progress - (k - 1));
    if (grown <= 0) continue;
    const lastIndex = Math.max(1, Math.round(grown * (path.length - 1)));
    const offset = 9 + k * gap;
    const threshold = FAST_THRESHOLD + 0.07 * k;

    [-1, 1].forEach(function(side) {
      const lane = path.slice(0, lastIndex + 1).map(function(pt) {
        return { x: pt.x + pt.nx * offset * side, y: pt.y + pt.ny * offset * side, t: pt.t };
      });
      splitByColour(lane, function(pt) {
        return relativeSpeedAt(run, pt.t) >= threshold ? 'terracotta' : 'ink';
      }).forEach(function(segment) {
        shapes.push({ kind: 'line', colour: segment.colour, width: width, points: toXY(segment.points) });
      });
    });
  }
}

// The route itself: a solid ribbon whose width follows pace (faster = wider)
// and whose colour switches to terracotta on the runner's faster stretches.
function addRouteRibbon(shapes, path, run, print) {
  const widthAt = function(pt) {
    const w = lerp(2.2, 8, relativeSpeedAt(run, pt.t)) * (0.85 + 0.3 * run.intensity);
    return Math.max(w, print.minLine);
  };
  const colourAt = function(pt) {
    return relativeSpeedAt(run, pt.t) >= FAST_THRESHOLD ? 'terracotta' : 'ink';
  };

  splitByColour(path, colourAt).forEach(function(segment) {
    const left = segment.points.map(function(pt) {
      const half = widthAt(pt) / 2;
      return [pt.x + pt.nx * half, pt.y + pt.ny * half];
    });
    const right = segment.points.map(function(pt) {
      const half = widthAt(pt) / 2;
      return [pt.x - pt.nx * half, pt.y - pt.ny * half];
    }).reverse();
    shapes.push({ kind: 'fill', colour: segment.colour, points: left.concat(right) });
  });

  // Rounded ends
  [path[0], path[path.length - 1]].forEach(function(pt) {
    shapes.push({ kind: 'dot', colour: colourAt(pt), x: pt.x, y: pt.y, r: widthAt(pt) / 2 });
  });
}

// A short tick across the route at every whole kilometre (longer every 5 km)
function addKmTicks(shapes, path, run, print) {
  if (!run.distanceKm) return;
  const wholeKm = Math.min(Math.floor(run.distanceKm), 100);
  const every = print.isSmall ? 5 : 1;
  for (let km = every; km <= wholeKm; km += every) {
    const index = Math.round((km / run.distanceKm) * (path.length - 1));
    if (index >= path.length - 1) continue;           // the finish has its own marker
    const pt = path[index];
    const half = km % 5 === 0 ? 14 : 9;
    shapes.push({
      kind: 'line', colour: 'ink', width: Math.max(1.1, print.minLine),
      points: [[pt.x - pt.nx * half, pt.y - pt.ny * half], [pt.x + pt.nx * half, pt.y + pt.ny * half]]
    });
  }
}

function addStartFinish(shapes, path, print) {
  const start = path[0];
  const finish = path[path.length - 1];
  const ringWidth = Math.max(1.4, print.minLine);
  shapes.push({ kind: 'ring', colour: 'ink', x: start.x, y: start.y, r: 11, width: ringWidth });
  shapes.push({ kind: 'dot', colour: 'terracotta', x: finish.x, y: finish.y, r: Math.max(6, print.minDot) });
  shapes.push({ kind: 'ring', colour: 'ink', x: finish.x, y: finish.y, r: 13, width: ringWidth });
}

// The laurel crown of victory. Leaves appear in rank order from the base
// upward; finish time and how it felt decide how far the wreath has grown.
// Leaves never move once they have appeared — later data only adds more.
function addWreath(shapes, skeleton, run, print) {
  const threshold = lerp(0.1, 1, run.time * (0.5 + 0.5 * run.intensity));
  const span = Math.PI - 0.3;           // leaves a small gap at the crown's top
  const angleAt = function(side, u) { return Math.PI / 2 + side * (0.16 + u * span); };
  const pointAt = function(theta) {
    return [WREATH.cx + WREATH.rx * Math.cos(theta), WREATH.cy + WREATH.ry * Math.sin(theta)];
  };

  [1, -1].forEach(function(side) {
    const visible = skeleton.leaves.filter(function(slot) {
      return slot.side === side && slot.rank < threshold;
    });
    const topU = visible.reduce(function(top, slot) { return Math.max(top, slot.u); }, 0.02);

    // Stem from the base up to just past the highest leaf
    const stem = [];
    const stemEnd = Math.min(1, topU + 0.5 / WREATH.slotsPerSide);
    for (let i = 0; i <= 40; i++) stem.push(pointAt(angleAt(side, (i / 40) * stemEnd)));
    shapes.push({ kind: 'line', colour: 'ink', width: Math.max(1.6, print.minLine), points: stem });

    visible.forEach(function(slot) {
      const theta = angleAt(side, slot.u);
      const base = pointAt(theta);
      // Direction of growth along the wreath, and the outward normal
      let tx = -WREATH.rx * Math.sin(theta) * side, ty = WREATH.ry * Math.cos(theta) * side;
      const tLen = Math.hypot(tx, ty); tx /= tLen; ty /= tLen;
      let nx = WREATH.ry * Math.cos(theta), ny = WREATH.rx * Math.sin(theta);
      const nLen = Math.hypot(nx, ny); nx /= nLen; ny /= nLen;
      // Lean each leaf 0.6 rad off the stem, alternating outward / inward
      const lean = 0.6;
      const dx = tx * Math.cos(lean) + nx * slot.flip * Math.sin(lean);
      const dy = ty * Math.cos(lean) + ny * slot.flip * Math.sin(lean);
      const length = 34 * slot.scale * (0.9 + 0.25 * run.intensity);
      shapes.push({
        kind: 'fill', colour: 'terracotta',
        points: leafOutline(base[0] + dx * length / 2, base[1] + dy * length / 2,
          length, Math.max(length * 0.36, print.minLine * 2), Math.atan2(dy, dx))
      });
    });
  });

  // A small knot where the two branches meet
  shapes.push({ kind: 'dot', colour: 'ink', x: WREATH.cx, y: WREATH.cy + WREATH.ry, r: Math.max(4, print.minDot) });
}

// Almond leaf, pointed at both ends, as a solid polygon
function leafOutline(cx, cy, length, width, angle) {
  const points = [];
  const steps = 10;
  const cos = Math.cos(angle), sin = Math.sin(angle);
  const add = function(x, y) { points.push([cx + x * cos - y * sin, cy + x * sin + y * cos]); };
  for (let i = 0; i <= steps; i++) {               // upper edge, tip to tip
    const t = i / steps;
    add(lerp(-length / 2, length / 2, t), -Math.sin(t * Math.PI) * width / 2);
  }
  for (let i = steps - 1; i > 0; i--) {             // lower edge, back again
    const t = i / steps;
    add(lerp(-length / 2, length / 2, t), Math.sin(t * Math.PI) * width / 2);
  }
  return points;
}

// Feathers for speed at the finish line. None below a 3/10 feeling; all
// three at 10/10. On very small prints the barbs are left out.
function addFinishFeathers(shapes, skeleton, path, run, print) {
  const showUpTo = clamp01((run.intensity - 0.3) / 0.7);
  const finish = path[path.length - 1];
  const away = Math.atan2(finish.y - ROUTE_AREA.cy, finish.x - ROUTE_AREA.cx);
  const width = Math.max(1, print.minLine);
  const withBarbs = print.minLine < 2.5;

  skeleton.feathers.forEach(function(slot) {
    if (slot.rank >= showUpTo) return;
    const angle = away + (slot.order - 1) * 0.55 + slot.spread;
    const length = 36;
    const baseX = finish.x + Math.cos(angle) * 18;
    const baseY = finish.y + Math.sin(angle) * 18;
    const dirX = Math.cos(angle), dirY = Math.sin(angle);
    const normX = -dirY, normY = dirX;

    // Gently curved spine
    const spine = [];
    for (let i = 0; i <= 8; i++) {
      const t = i / 8;
      const bend = Math.sin(t * Math.PI) * 3;
      spine.push([baseX + dirX * length * t + normX * bend, baseY + dirY * length * t + normY * bend]);
    }
    shapes.push({ kind: 'line', colour: 'ink', width: width, points: spine });

    if (!withBarbs) return;
    for (let i = 2; i <= 7; i++) {
      const pt = spine[i];
      const barb = 9 * (1 - i / 10);
      [-1, 1].forEach(function(side) {
        const bx = dirX * Math.cos(0.6) + normX * side * Math.sin(0.6);
        const by = dirY * Math.cos(0.6) + normY * side * Math.sin(0.6);
        shapes.push({ kind: 'line', colour: 'ink', width: width,
          points: [[pt[0], pt[1]], [pt[0] + bx * barb, pt[1] + by * barb]] });
      });
    }
  });
}

function toXY(points) {
  return points.map(function(pt) { return [pt.x, pt.y]; });
}

/* --------------------------------------------------------------------------
   7. Text block — name, rule, date · place, corner labels
   Text smaller than PRINT_RULES.minTextMm on the chosen product is dropped
   (the name always stays and shrinks to fit instead).
   -------------------------------------------------------------------------- */
function formatRunStats(run) {
  const parts = [];
  if (run.distanceKm) parts.push((Math.round(run.distanceKm * 10) / 10) + ' KM');
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
      size: 95, x: 500, y: 856, align: 'center', valign: 'middle', colour: 'ink', maxWidth: 860 },
    { role: 'subtitle', text: formatDatePlace(details.date, details.place), font: 'mono',
      size: 28, x: 500, y: 936, align: 'center', valign: 'middle', colour: 'terracotta' },
    { role: 'corner', text: 'MARATHON', font: 'mono', size: 18, x: 40, y: 40, align: 'left', valign: 'top', colour: 'ink' },
    { role: 'corner', text: '#' + String(details.seed).padStart(2, '0'), font: 'mono', size: 18, x: 960, y: 40, align: 'right', valign: 'top', colour: 'ink' },
    { role: 'brand', text: 'inky · ', cjk: true, font: 'mono', size: 18, x: 40, y: 965, align: 'left', valign: 'bottom', colour: 'ink' },
    { role: 'corner', text: formatRunStats(run), font: 'mono', size: 18, x: 960, y: 965, align: 'right', valign: 'bottom', colour: 'ink' }
  ];
  return items.filter(function(item) {
    if (!item.text) return false;
    return item.role === 'name' || item.size >= print.minText;
  });
}

/* --------------------------------------------------------------------------
   8. One call to build a whole design (data only)
   -------------------------------------------------------------------------- */
// details = { name, date, place, seed, run: {distanceKm, finishTime, splits, intensity}, product }
function buildMarathonDesign(details) {
  const seedKey = removeAccents(details.name).toUpperCase() + '::' + details.date + '::' +
    details.place + '::marathon::' + details.seed;
  const skeleton = buildMarathonSkeleton(seedKey);
  const run = normaliseRunData(Object.assign({ date: details.date, place: details.place }, details.run));
  const print = printContext(details.product);

  const shapes = growMarathon(skeleton, run, print);
  // Thin terracotta rule between the name and the date line
  shapes.push({ kind: 'line', colour: 'terracotta', width: Math.max(1.2, print.minLine),
    points: [[360, 903], [640, 903]] });

  return {
    shapes: shapes,
    texts: buildTextItems(details, run, print),
    run: run,
    print: print
  };
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
  const label = item.cjk ? item.text + '印纪' : item.text;
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
  p.textAlign(item.align, item.valign === 'middle' ? 'center' : item.valign);
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
  const cjkWidth = item.cjk ? size * BRAND_CJK_ADVANCE / 1000 : 0;
  let width = font.getAdvanceWidth(item.text, size) + cjkWidth;
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

  const colour = BRAND_COLOURS[item.colour];
  let svg = `<path fill="${colour}" d="${font.getPath(item.text, x, baseline, size).toPathData(2)}"/>`;
  if (item.cjk) {
    const latinWidth = font.getAdvanceWidth(item.text, size);
    svg += `<path fill="${colour}" transform="translate(${(x + latinWidth).toFixed(2)} ${baseline.toFixed(2)}) scale(${(size / 1000).toFixed(4)})" d="${BRAND_CJK_PATH}"/>`;
  }
  return svg;
}

// Fallback when the print fonts are unavailable
function textToSvgText(item) {
  const anchor = { left: 'start', center: 'middle', right: 'end' }[item.align];
  const baseline = { top: 'hanging', middle: 'middle', bottom: 'text-after-edge' }[item.valign];
  const family = item.font === 'serif' ? "Merriweather, Georgia, serif" : "'Courier Prime', 'Courier New', monospace";
  const weight = item.font === 'serif' ? ' font-weight="700"' : '';
  const label = item.cjk ? item.text + '印纪' : item.text;
  return `<text x="${item.x}" y="${item.y}" font-family="${family}"${weight} font-size="${item.size}" fill="${BRAND_COLOURS[item.colour]}" text-anchor="${anchor}" dominant-baseline="${baseline}">${escapeXml(label)}</text>`;
}
