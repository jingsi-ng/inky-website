/* ==========================================================================
   inky (印纪) — Generator page
   --------------------------------------------------------------------------
   p5.js sketch (instance mode) + input wiring + compare mode + export.
   All the "what does it look like" logic lives in growth.js; this file only
   decides WHEN and WHERE to paint, and keeps the page in sync.
   ========================================================================== */

// ----- Current design state -----
// The page opens empty: until a name is typed, the canvas shows a demo
// pattern for DEMO_NAME so it is never blank.
let currentName    = '';
let currentDate    = '';
let currentPlace   = '';
let currentOcc     = 'wedding';
let currentSeed    = 1;
let currentStyle   = 'sprigs';     // marathon only: 'sprigs' or 'medallion'
let currentProduct = 'tote';
let currentFeeling = 5;            // "fullness", shared by every occasion
let currentFabric  = 'light';      // 'light' or 'dark'
let currentClub    = '';           // '' = inky colours, a CLUB_COLOURS key, or { primary, secondary, label }
let showNumbers    = true;
let isCompareMode  = false;

// The data each occasion grows from, exactly as typed
const occasionData = {
  wedding:  { years: '', guests: '' },
  birthday: { age: '' },
  marathon: { distance: '', unit: 'km', finishTime: '', splits: '' },
  match:    { us: '', them: '', opponent: '' }
};

let mainSketch = null;
let compareGraphics = [];      // four p5.Graphics reused for Compare mode
let mockupGraphics = {};       // one small p5.Graphics per product

const REDRAW_DELAY_MS = 350;   // debounce for text inputs
const COMPARE_SIZE    = 200;   // px, each Compare canvas
const MOCKUP_SIZE     = 120;   // px, each product mockup
const DEMO_NAME       = 'inky';
const MIN_NAME_LENGTH = 2;     // letters needed before the order code appears
const SHOP_EMAIL      = 'hello@inky.ie';
const JSZIP_URL       = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
const MAX_GROUP       = 100;   // names per group download

const OCCASION_NAMES = { wedding: 'Wedding', birthday: 'Birthday', marathon: 'Marathon', match: 'Match / GAA' };
const PRODUCT_NAMES  = { tote: 'Tote bag', coaster: 'Coaster set', keychain: 'Acrylic keychain' };

let hasTypedName = false;      // overlay hides on the first keystroke, for good

/* --------------------------------------------------------------------------
   p5 sketch (instance mode so it doesn't pollute global scope)
   -------------------------------------------------------------------------- */
const sketch = function(p) {

  p.setup = function() {
    let canvasSize = getCanvasSize();
    let canvas = p.createCanvas(canvasSize, canvasSize);
    canvas.parent('canvas-container');
    p.noLoop(); // only redraw when inputs change
    buildMockups(p);
  };

  p.draw = function() {
    paintDesign(p, p.width, currentDesign(currentSeed));
    paintMockups();
  };

  p.windowResized = function() {
    let newSize = getCanvasSize();
    if (newSize !== p.width) {
      p.resizeCanvas(newSize, newSize);
      p.redraw();
    }
  };
};

mainSketch = new p5(sketch);

// The name actually drawn: the visitor's, or the demo name while empty
function patternName() {
  return currentName.trim() ? currentName : DEMO_NAME;
}

// Everything that defines the design — also what the design key stores
function currentDetails(seed, overrides) {
  return Object.assign({
    occasion: currentOcc,
    name: patternName(), date: currentDate, place: currentPlace,
    seed: seed, style: currentStyle, product: currentProduct,
    colours: { fabric: currentFabric, club: currentOcc === 'match' ? (currentClub || null) : null },
    showNumbers: showNumbers,
    data: Object.assign({ intensity: currentFeeling }, occasionData[currentOcc])
  }, overrides || {});
}

function currentDesign(seed, overrides) {
  return buildDesign(currentDetails(seed, overrides));
}

// A link that reopens exactly this design (works from a website or a saved file)
function designLink(details) {
  return location.href.split('#')[0] + '#design=' + encodeDesignKey(details);
}

// Biggest canvas allowed at each screen width (matches the CSS breakpoints)
function maxCanvasSize() {
  if (window.innerWidth < 768) return 400;    // phone
  if (window.innerWidth <= 1024) return 500;  // tablet
  return 560;                                 // desktop
}

// Largest square that fits the column (and, on desktop, the screen height)
function getCanvasSize() {
  const container = document.getElementById('canvas-container');
  let available = container ? container.clientWidth : 500;
  if (window.innerWidth > 1024) available = Math.min(available, window.innerHeight - 150);
  return Math.max(Math.min(available, maxCanvasSize()), 280);
}

/* --------------------------------------------------------------------------
   Redraw + UI sync
   -------------------------------------------------------------------------- */
function triggerRedraw() {
  if (mainSketch) mainSketch.redraw();
  if (isCompareMode) renderCompareGrid();
  updateOrderCode();
  updatePreviewLabel();
}

// Wait until typing pauses before repainting
let redrawTimer = null;
function scheduleRedraw() {
  clearTimeout(redrawTimer);
  redrawTimer = setTimeout(triggerRedraw, REDRAW_DELAY_MS);
}

// Order code, the email to the shop, and the design link all stay in sync
function updateOrderCode() {
  const details = currentDetails(currentSeed);
  const code = orderCodeFor(details);
  document.getElementById('order-code').textContent = code;
  document.getElementById('btn-email').href = orderEmailHref(details, code);
}

function orderEmailHref(details, code) {
  const lines = [
    'Hi inky,', '',
    "I'd like to order this design:", '',
    'Order code: ' + code,
    'Occasion: ' + OCCASION_NAMES[details.occasion],
    'Name: ' + details.name,
    details.date ? 'Date: ' + details.date : null,
    details.place ? 'Place: ' + details.place : null,
    'Product: ' + PRODUCT_NAMES[details.product],
    'Fabric: ' + (details.colours.fabric === 'dark' ? 'dark' : 'light'),
    'Quantity: ', '',
    'Design link: ' + designLink(details), '',
    'Thanks!'
  ].filter(function(line) { return line !== null; });
  return 'mailto:' + SHOP_EMAIL + '?subject=' + encodeURIComponent('Order ' + code) +
    '&body=' + encodeURIComponent(lines.join('\n'));
}

function updatePreviewLabel() {
  const label = document.getElementById('preview-label');
  if (!currentName.trim()) {
    label.textContent = DEMO_NAME + ' · sample pattern';
    return;
  }
  const parts = [currentName.trim(), currentDate.trim(), currentPlace.trim()]
    .filter(function(part) { return part.length > 0; });
  label.textContent = parts.join(' · ');
}

// First keystroke in the name field: drop the "enter your name" overlay.
// Once the name has 2+ letters, show the order code + export for good.
function updateNameDependentUi() {
  if (!hasTypedName) {
    hasTypedName = true;
    document.getElementById('canvas-overlay').classList.add('is-hidden');
  }
  if (currentName.trim().length >= MIN_NAME_LENGTH) {
    document.querySelectorAll('[data-needs-name]').forEach(function(section) {
      section.classList.add('is-shown');
    });
  }
}

// Warn as soon as someone types a character we can't print (e.g. an emoji)
function checkPrintable(inputId, warningId) {
  const bad = unprintableChars(document.getElementById(inputId).value);
  document.getElementById(warningId).textContent = bad.length
    ? "We can't print " + bad.join(' ') + ' — please leave ' + (bad.length > 1 ? 'them' : 'it') + ' out.'
    : '';
}

function setSeed(seed) {
  currentSeed = seed;
  document.getElementById('input-seed').value = seed;
  document.getElementById('seed-value').textContent = '#' + String(seed).padStart(2, '0');
}

// Mark one button in a radio-style group as chosen
function selectInGroup(buttons, isChosen) {
  buttons.forEach(function(btn) {
    const chosen = isChosen(btn);
    btn.classList.toggle('is-active', chosen);
    btn.setAttribute('aria-checked', chosen ? 'true' : 'false');
  });
}

function setOccasion(occasion) {
  currentOcc = occasion;
  const buttons = document.querySelectorAll('.occasion-btn');
  selectInGroup(buttons, function(btn) { return btn.dataset.occasion === occasion; });

  // Repeat the chosen occasion's tagline under the grid
  buttons.forEach(function(btn) {
    if (btn.dataset.occasion === occasion) {
      document.getElementById('occasion-note').textContent = btn.querySelector('.occasion-tagline').textContent;
    }
  });

  // Show only this occasion's data fields (and the marathon style picker)
  document.querySelectorAll('[data-occasion-only]').forEach(function(el) {
    el.hidden = el.dataset.occasionOnly !== occasion;
  });
}

function setStyle(style) {
  currentStyle = style;
  selectInGroup(document.querySelectorAll('.style-btn'), function(btn) { return btn.dataset.style === style; });
}

function setProduct(product) {
  currentProduct = product;
  document.getElementById('input-product').value = product;
  Object.keys(mockupGraphics).forEach(function(key) {
    const tile = mockupGraphics[key].elt.parentElement;
    tile.classList.toggle('is-current', key === product);
    tile.setAttribute('aria-pressed', key === product ? 'true' : 'false');
  });
}

// Little confirmation message under the canvas
let toastTimer = null;
function showToast(message) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.classList.add('is-visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function() { toast.classList.remove('is-visible'); }, 2600);
}

/* --------------------------------------------------------------------------
   Product mockups — the design on a tote, a coaster and a keychain.
   Each uses that product's own print rules, so a keychain shows the
   simplified detail it will really get. Tap one to choose that product.
   -------------------------------------------------------------------------- */
function buildMockups(p) {
  const row = document.getElementById('mockups');
  ['tote', 'coaster', 'keychain'].forEach(function(product) {
    const pg = p.createGraphics(MOCKUP_SIZE, MOCKUP_SIZE);
    pg.elt.style.display = 'block';
    pg.elt.classList.add('mockup-canvas');
    const tile = document.createElement('button');
    tile.type = 'button';
    tile.className = 'mockup-tile';
    tile.appendChild(pg.elt);
    const label = document.createElement('span');
    label.className = 'compare-label';
    label.textContent = PRODUCT_NAMES[product];
    tile.appendChild(label);
    tile.addEventListener('click', function() {
      setProduct(product);
      triggerRedraw();
    });
    row.appendChild(tile);
    mockupGraphics[product] = pg;
  });
  setProduct(currentProduct);
}

// A small offscreen copy of the design for one product
const mockupDesignBuffer = {};
function designImageFor(product, size) {
  if (!mockupDesignBuffer[product]) mockupDesignBuffer[product] = mainSketch.createGraphics(size, size);
  const buffer = mockupDesignBuffer[product];
  paintDesign(buffer, size, currentDesign(currentSeed, { product: product }));
  return buffer;
}

function paintMockups() {
  const fabric = currentFabric === 'dark' ? '#2a1e10' : '#e8dcc4';
  const outline = '#8a7a5c';
  Object.keys(mockupGraphics).forEach(function(product) {
    const g = mockupGraphics[product];
    const s = MOCKUP_SIZE;
    g.clear();
    g.push();
    if (product === 'tote') {
      // handles, bag, then the print area on the front
      g.noFill(); g.stroke(outline); g.strokeWeight(3);
      g.arc(s * 0.5, s * 0.3, s * 0.42, s * 0.36, Math.PI, 0);
      g.noStroke(); g.fill(fabric);
      g.rect(s * 0.14, s * 0.28, s * 0.72, s * 0.68, 4);
      g.image(designImageFor(product, 120), s * 0.29, s * 0.4, s * 0.42, s * 0.42);
    } else if (product === 'coaster') {
      g.noStroke(); g.fill('#d8cba8');
      g.rect(s * 0.1, s * 0.1, s * 0.8, s * 0.8, 10);
      g.image(designImageFor(product, 120), s * 0.15, s * 0.15, s * 0.7, s * 0.7);
    } else {
      // ring, then a small acrylic tag
      g.noFill(); g.stroke(outline); g.strokeWeight(3);
      g.circle(s * 0.5, s * 0.16, s * 0.16);
      g.noStroke(); g.fill('#efe6d6'); g.stroke('#d8cba8'); g.strokeWeight(2);
      g.rect(s * 0.25, s * 0.25, s * 0.5, s * 0.62, 12);
      g.noStroke();
      g.image(designImageFor(product, 120), s * 0.3, s * 0.34, s * 0.4, s * 0.4);
    }
    g.pop();
  });
}

/* --------------------------------------------------------------------------
   Compare 4 Variations
   The four tiles REPLACE the single canvas in the canvas area. Choosing a tile
   adopts its seed; Back, Escape or Shuffle leave without choosing.
   -------------------------------------------------------------------------- */
function enterCompareMode() {
  isCompareMode = true;
  document.getElementById('single-view').hidden = true;
  const compareView = document.getElementById('compare-view');
  compareView.hidden = false;
  renderCompareGrid();

  // On long pages the grid may be above the fold — bring it into view
  if (compareView.getBoundingClientRect().top < 64) {
    compareView.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  // Keyboard users land on the current variation
  const current = document.querySelector('.compare-tile.is-current') || document.querySelector('.compare-tile');
  if (current) current.focus({ preventScroll: true });
}

function exitCompareMode() {
  isCompareMode = false;
  document.getElementById('compare-view').hidden = true;
  document.getElementById('single-view').hidden = false;
  mainSketch.windowResized(); // the column may have changed size while hidden
  mainSketch.redraw();
  document.getElementById('btn-compare').focus({ preventScroll: true });
}

// Builds the four tiles once, then just repaints them on later calls
function renderCompareGrid() {
  const grid = document.getElementById('compare-grid');

  if (compareGraphics.length === 0) {
    for (let seed = 1; seed <= 4; seed++) {
      const pg = mainSketch.createGraphics(COMPARE_SIZE, COMPARE_SIZE);
      pg.elt.style.display = 'block';            // createGraphics hides it by default
      pg.elt.classList.add('compare-canvas');

      const tile = document.createElement('button');
      tile.type = 'button';
      tile.className = 'compare-tile';
      tile.dataset.seed = seed;
      tile.appendChild(pg.elt);

      const label = document.createElement('span');
      label.className = 'compare-label';
      label.textContent = 'Variation #' + String(seed).padStart(2, '0');
      tile.appendChild(label);

      tile.addEventListener('click', function() {
        setSeed(seed);
        exitCompareMode();
        triggerRedraw();
        showToast('Variation #' + String(seed).padStart(2, '0') + ' selected');
      });

      grid.appendChild(tile);
      compareGraphics.push(pg);
    }
  }

  compareGraphics.forEach(function(pg, index) {
    const seed = index + 1;
    paintDesign(pg, COMPARE_SIZE, currentDesign(seed));
    const tile = pg.elt.parentElement;
    tile.classList.toggle('is-current', seed === currentSeed);
    tile.setAttribute('aria-label', 'Choose variation ' + seed);
  });
}

/* --------------------------------------------------------------------------
   Export — one print-ready SVG; and a zip for group orders
   -------------------------------------------------------------------------- */
function exportPrintFile() {
  const details = currentDetails(currentSeed);
  const orderCode = orderCodeFor(details);
  showToast('Preparing print file…');
  buildDesignSvg(buildDesign(details), { orderCode: orderCode, designKey: encodeDesignKey(details) }).then(function(result) {
    downloadBlob(new Blob([result.svg], { type: 'image/svg+xml' }), 'inky-' + orderCode + '-' + currentProduct + '.svg');
    reportPrintProblems(result);
  });
}

// Tell the customer straight away if anything won't print as they see it
function reportPrintProblems(result) {
  const warning = document.getElementById('export-warning');
  if (result.missing && result.missing.length) {
    warning.textContent = "Some characters couldn't be drawn in our print fonts: " + result.missing.join(' ') +
      '. Please change them, or email us and we\'ll sort it out by hand.';
    showToast('Saved — but some characters need attention');
  } else if (!result.outlined) {
    warning.textContent = '';
    showToast('Saved, but fonts were offline: outline the text before printing');
  } else {
    warning.textContent = '';
    showToast('Print file saved — text already outlined');
  }
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(function() { URL.revokeObjectURL(url); }, 1000);
}

// JSZip is only needed for group orders, so it loads on first use
let jszipPromise = null;
function loadJsZip() {
  if (typeof JSZip !== 'undefined') return Promise.resolve();
  if (!jszipPromise) {
    jszipPromise = new Promise(function(resolve, reject) {
      const script = document.createElement('script');
      script.src = JSZIP_URL;
      script.onload = resolve;
      script.onerror = function() { jszipPromise = null; reject(new Error('Could not load JSZip')); };
      document.head.appendChild(script);
    });
  }
  return jszipPromise;
}

function csvCell(value) {
  return '"' + String(value).replace(/"/g, '""') + '"';
}

// One design per name, same everything else. Files are built one after
// another so the page stays responsive and progress can be shown.
function exportGroup() {
  const status = document.getElementById('group-status');
  const names = document.getElementById('input-group').value.split('\n')
    .map(function(line) { return line.trim(); })
    .filter(Boolean)
    .slice(0, MAX_GROUP);
  if (!names.length) { status.textContent = 'Add at least one name, one per line.'; return; }

  status.textContent = 'Preparing ' + names.length + ' designs…';
  loadJsZip().then(function() {
    const zip = new JSZip();
    const rows = [['Name', 'Order code', 'Design link'].map(csvCell).join(',')];
    const missing = new Set();
    let chain = Promise.resolve();
    names.forEach(function(name, i) {
      chain = chain.then(function() {
        const details = currentDetails(currentSeed, { name: name });
        const code = orderCodeFor(details);
        return buildDesignSvg(buildDesign(details), { orderCode: code, designKey: encodeDesignKey(details) })
          .then(function(result) {
            (result.missing || []).forEach(function(ch) { missing.add(ch); });
            zip.file('inky-' + code + '-' + currentProduct + '.svg', result.svg);
            rows.push([name, code, designLink(details)].map(csvCell).join(','));
            status.textContent = 'Prepared ' + (i + 1) + ' of ' + names.length + '…';
          });
      });
    });
    return chain.then(function() {
      zip.file('order-codes.csv', rows.join('\n'));
      return zip.generateAsync({ type: 'blob' });
    }).then(function(blob) {
      downloadBlob(blob, 'inky-group-order-' + names.length + '.zip');
      status.textContent = 'Done — ' + names.length + ' designs. Email us the zip (or just order-codes.csv) to place the order.' +
        (missing.size ? " Note: we couldn't draw " + Array.from(missing).join(' ') + ' — we\'ll check those names by hand.' : '');
    });
  }).catch(function() {
    status.textContent = "Couldn't build the zip (are you offline?). Try again, or email us the list of names.";
  });
}

// Clipboard with a fallback for older browsers / file:// pages
function copyText(text) {
  if (navigator.clipboard && window.isSecureContext) {
    return navigator.clipboard.writeText(text);
  }
  return new Promise(function(resolve, reject) {
    const temp = document.createElement('textarea');
    temp.value = text;
    temp.setAttribute('readonly', '');
    temp.style.position = 'fixed';
    temp.style.opacity = '0';
    document.body.appendChild(temp);
    temp.select();
    const ok = document.execCommand('copy');
    temp.remove();
    ok ? resolve() : reject(new Error('copy failed'));
  });
}

/* --------------------------------------------------------------------------
   Reopening a saved design (from #design=… in the address, or pasted)
   -------------------------------------------------------------------------- */
function applyDetails(d) {
  const set = function(id, value) { document.getElementById(id).value = value === undefined || value === null ? '' : value; };
  currentName = d.name || ''; currentDate = d.date || ''; currentPlace = d.place || '';
  set('input-name', currentName); set('input-date', currentDate); set('input-place', currentPlace);

  setOccasion(d.occasion);
  setStyle(d.style === 'medallion' ? 'medallion' : 'sprigs');
  setSeed(d.seed || 1);
  setProduct(d.product in PRODUCT_NAMES ? d.product : 'tote');
  currentFabric = d.colours && d.colours.fabric === 'dark' ? 'dark' : 'light';
  set('input-fabric', currentFabric);
  showNumbers = d.showNumbers !== false;
  document.getElementById('input-numbers').checked = showNumbers;

  const data = d.data || {};
  currentFeeling = data.intensity === undefined ? 5 : Number(data.intensity);
  set('input-feeling', currentFeeling);
  Object.keys(occasionData[d.occasion]).forEach(function(key) {
    if (data[key] !== undefined) occasionData[d.occasion][key] = data[key];
  });
  const fieldFor = { years: 'input-years', guests: 'input-guests', age: 'input-age', distance: 'input-distance',
    unit: 'input-unit', finishTime: 'input-time', splits: 'input-splits', us: 'input-us', them: 'input-them', opponent: 'input-opponent' };
  Object.keys(occasionData[d.occasion]).forEach(function(key) {
    if (fieldFor[key]) set(fieldFor[key], occasionData[d.occasion][key]);
  });
  updateSplitsLabel();

  // Club colours: a preset key, or a custom pair
  const club = d.colours ? d.colours.club : null;
  if (club && typeof club === 'object') {
    currentClub = { primary: club.primary, secondary: club.secondary, label: 'Custom' };
    set('input-club', 'custom');
    set('input-colour-1', club.primary); set('input-colour-2', club.secondary);
    document.getElementById('custom-colours').hidden = false;
  } else {
    currentClub = club || '';
    set('input-club', currentClub);
    document.getElementById('custom-colours').hidden = true;
  }

  updateNameDependentUi();
  ['name', 'date', 'place'].forEach(function(f) { checkPrintable('input-' + f, 'warn-' + f); });
  triggerRedraw();
}

function openFromText(text) {
  const details = decodeDesignKey(text);
  if (!details) return false;
  applyDetails(details);
  return true;
}

/* --------------------------------------------------------------------------
   Wire up inputs
   -------------------------------------------------------------------------- */
function updateSplitsLabel() {
  document.getElementById('splits-label').textContent =
    occasionData.marathon.unit === 'mi' ? 'splits per mile (optional)' : 'splits per km (optional)';
}

function populateClubOptions() {
  const group = document.getElementById('club-options');
  Object.keys(CLUB_COLOURS).forEach(function(key) {
    const option = document.createElement('option');
    option.value = key;
    option.textContent = CLUB_COLOURS[key].label;
    group.appendChild(option);
  });
}

function wireInputs() {
  // Name, date, place → debounced redraw, with a live "can we print this?" check
  const detailFields = [
    { id: 'input-name',  warn: 'warn-name',  apply: function(v) { currentName  = v; } },
    { id: 'input-date',  warn: 'warn-date',  apply: function(v) { currentDate  = v; } },
    { id: 'input-place', warn: 'warn-place', apply: function(v) { currentPlace = v; } }
  ];
  detailFields.forEach(function(field) {
    document.getElementById(field.id).addEventListener('input', function(event) {
      field.apply(event.target.value);
      checkPrintable(field.id, field.warn);
      if (field.id === 'input-name') updateNameDependentUi();
      scheduleRedraw();
    });
  });

  // Occasion-specific data fields: [input id, occasion, key in occasionData]
  const dataFields = [
    ['input-years', 'wedding', 'years'], ['input-guests', 'wedding', 'guests'],
    ['input-age', 'birthday', 'age'],
    ['input-distance', 'marathon', 'distance'], ['input-time', 'marathon', 'finishTime'], ['input-splits', 'marathon', 'splits'],
    ['input-us', 'match', 'us'], ['input-them', 'match', 'them'], ['input-opponent', 'match', 'opponent']
  ];
  dataFields.forEach(function(field) {
    document.getElementById(field[0]).addEventListener('input', function(event) {
      occasionData[field[1]][field[2]] = event.target.value;
      scheduleRedraw();
    });
  });

  // Units: switching keeps the same distance (5 km ↔ 3.107 mi)
  document.getElementById('input-unit').addEventListener('change', function(event) {
    const run = occasionData.marathon;
    const value = parseFloat(run.distance);
    if (value > 0) {
      const converted = event.target.value === 'mi' ? value / KM_PER_MILE : value * KM_PER_MILE;
      run.distance = String(Math.round(converted * 1000) / 1000);
      document.getElementById('input-distance').value = run.distance;
    }
    run.unit = event.target.value;
    updateSplitsLabel();
    triggerRedraw();
  });

  // Race presets fill the distance in whichever unit is chosen
  document.querySelectorAll('.chip[data-km]').forEach(function(chip) {
    chip.addEventListener('click', function() {
      const km = parseFloat(chip.dataset.km);
      const value = occasionData.marathon.unit === 'mi' ? Math.round(km / KM_PER_MILE * 1000) / 1000 : km;
      occasionData.marathon.distance = String(value);
      document.getElementById('input-distance').value = value;
      triggerRedraw();
    });
  });

  // Occasion buttons
  document.querySelectorAll('.occasion-btn').forEach(function(btn) {
    btn.addEventListener('click', function() {
      setOccasion(btn.dataset.occasion);
      triggerRedraw();
    });
  });

  // Marathon style
  document.querySelectorAll('.style-btn').forEach(function(btn) {
    btn.addEventListener('click', function() {
      setStyle(btn.dataset.style);
      triggerRedraw();
    });
  });

  // Sliders — instant
  document.getElementById('input-seed').addEventListener('input', function(event) {
    setSeed(parseInt(event.target.value, 10));
    triggerRedraw();
  });
  document.getElementById('input-feeling').addEventListener('input', function(event) {
    currentFeeling = parseInt(event.target.value, 10);
    triggerRedraw();
  });
  document.getElementById('input-numbers').addEventListener('change', function(event) {
    showNumbers = event.target.checked;
    triggerRedraw();
  });

  // Product + fabric (print size changes the preview: minimum line widths are real)
  document.getElementById('input-product').addEventListener('change', function(event) {
    setProduct(event.target.value);
    triggerRedraw();
  });
  document.getElementById('input-fabric').addEventListener('change', function(event) {
    currentFabric = event.target.value;
    triggerRedraw();
  });

  // Club colours (match only)
  populateClubOptions();
  const readCustom = function() {
    return { primary: document.getElementById('input-colour-1').value,
             secondary: document.getElementById('input-colour-2').value, label: 'Custom' };
  };
  document.getElementById('input-club').addEventListener('change', function(event) {
    const custom = event.target.value === 'custom';
    document.getElementById('custom-colours').hidden = !custom;
    currentClub = custom ? readCustom() : event.target.value;
    triggerRedraw();
  });
  ['input-colour-1', 'input-colour-2'].forEach(function(id) {
    document.getElementById(id).addEventListener('input', function() {
      currentClub = readCustom();
      scheduleRedraw();
    });
  });

  // Shuffle: any seed except the current one
  document.getElementById('btn-shuffle').addEventListener('click', function() {
    let next = currentSeed;
    while (next === currentSeed) next = 1 + Math.floor(Math.random() * 99);
    setSeed(next);
    if (isCompareMode) exitCompareMode();
    triggerRedraw();
  });

  document.getElementById('btn-compare').addEventListener('click', enterCompareMode);
  document.getElementById('btn-compare-close').addEventListener('click', exitCompareMode);
  // Escape leaves compare mode without changing the design
  document.addEventListener('keydown', function(event) {
    if (event.key === 'Escape' && isCompareMode) exitCompareMode();
  });

  document.getElementById('btn-copy').addEventListener('click', function() {
    const code = document.getElementById('order-code').textContent;
    copyText(code)
      .then(function() { showToast('Order code copied: ' + code); })
      .catch(function() { showToast('Select the code and copy it by hand'); });
  });
  document.getElementById('btn-copy-link').addEventListener('click', function() {
    copyText(designLink(currentDetails(currentSeed)))
      .then(function() { showToast('Design link copied — it reopens this exact design'); })
      .catch(function() { showToast('Could not copy the link'); });
  });

  document.getElementById('btn-svg').addEventListener('click', exportPrintFile);
  document.getElementById('btn-group').addEventListener('click', exportGroup);

  document.getElementById('btn-open').addEventListener('click', function() {
    const ok = openFromText(document.getElementById('input-open').value);
    document.getElementById('open-status').textContent = ok ? '' : "That doesn't look like an inky design link — check it was copied in full.";
    if (ok) showToast('Design opened');
  });
}

// Read the starting values from the HTML so they always match
function readInitialValues() {
  currentName  = document.getElementById('input-name').value;
  currentDate  = document.getElementById('input-date').value;
  currentPlace = document.getElementById('input-place').value;
  currentFeeling = parseInt(document.getElementById('input-feeling').value, 10);
  setSeed(parseInt(document.getElementById('input-seed').value, 10));
  setOccasion(currentOcc);   // sync the occasion-specific controls
}

readInitialValues();
wireInputs();
updateOrderCode();
updatePreviewLabel();

// Opened from a design link? Restore it once the sketch exists.
if (location.hash.indexOf('#design=') === 0) {
  window.addEventListener('load', function() {
    if (!openFromText(location.hash)) showToast("That design link couldn't be read");
  });
}

// Canvas text only uses a web font once it has loaded — repaint when ready
if (document.fonts && document.fonts.load) {
  Promise.all([
    document.fonts.load('700 40px "Merriweather"'),
    document.fonts.load('400 20px "Courier Prime"')
  ]).then(triggerRedraw).catch(function() { /* fall back to system fonts */ });
}
