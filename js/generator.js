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
let currentFeeling = 5;            // "how it felt", shared by every occasion
let isCompareMode  = false;

// The data each occasion grows from, exactly as typed
const occasionData = {
  wedding:  { years: '', guests: '' },
  birthday: { age: '' },
  marathon: { distanceKm: null, finishTime: '', splits: '' },
  match:    { us: '', them: '' }
};

let mainSketch = null;
let compareGraphics = [];      // four p5.Graphics reused for Compare mode

const REDRAW_DELAY_MS = 350;   // debounce for text inputs
const COMPARE_SIZE    = 200;   // px, each Compare canvas
const DEMO_NAME       = 'inky';
const MIN_NAME_LENGTH = 2;     // letters needed before the order code appears

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
  };

  p.draw = function() {
    paintDesign(p, p.width, currentDesign(currentSeed));
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

// The full design for the current inputs at a given seed (pure data)
function currentDesign(seed) {
  return buildDesign({
    occasion: currentOcc,
    name: patternName(), date: currentDate, place: currentPlace,
    seed: seed, style: currentStyle, product: currentProduct,
    data: Object.assign({ intensity: currentFeeling }, occasionData[currentOcc])
  });
}

// Order code: who / when / where, then the data the design grew from
function currentOrderCode() {
  return generateOrderCode(patternName(), currentDate, currentPlace, currentOcc, currentSeed) +
    '-' + encodeDesignCode(currentDesign(currentSeed));
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

function updateOrderCode() {
  document.getElementById('order-code').textContent = currentOrderCode();
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

// Little confirmation message under the canvas
let toastTimer = null;
function showToast(message) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.classList.add('is-visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function() { toast.classList.remove('is-visible'); }, 2200);
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
   Export — one print-ready SVG for every occasion
   -------------------------------------------------------------------------- */
function exportPrintFile() {
  const design = currentDesign(currentSeed);
  const orderCode = currentOrderCode();
  showToast('Preparing print file…');
  buildDesignSvg(design, { orderCode: orderCode }).then(function(result) {
    downloadSvg(result.svg, 'inky-' + orderCode + '-' + currentProduct + '.svg');
    showToast(result.outlined
      ? 'Print file saved — text already outlined'
      : 'Saved, but fonts were offline: outline the text before printing');
  });
}

function downloadSvg(svg, filename) {
  const blob = new Blob([svg], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(function() { URL.revokeObjectURL(url); }, 1000);
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
   Wire up inputs
   -------------------------------------------------------------------------- */
function wireInputs() {
  // Name, date, place → debounced redraw
  const detailFields = [
    { id: 'input-name',  apply: function(v) { currentName  = v; } },
    { id: 'input-date',  apply: function(v) { currentDate  = v; } },
    { id: 'input-place', apply: function(v) { currentPlace = v; } }
  ];
  detailFields.forEach(function(field) {
    document.getElementById(field.id).addEventListener('input', function(event) {
      field.apply(event.target.value);
      if (field.id === 'input-name') updateNameDependentUi();
      scheduleRedraw();
    });
  });

  // Occasion-specific data fields: [input id, occasion, key in occasionData]
  const dataFields = [
    ['input-years', 'wedding', 'years'], ['input-guests', 'wedding', 'guests'],
    ['input-age', 'birthday', 'age'],
    ['input-time', 'marathon', 'finishTime'], ['input-splits', 'marathon', 'splits'],
    ['input-us', 'match', 'us'], ['input-them', 'match', 'them']
  ];
  dataFields.forEach(function(field) {
    document.getElementById(field[0]).addEventListener('input', function(event) {
      occasionData[field[1]][field[2]] = event.target.value;
      scheduleRedraw();
    });
  });

  // Marathon distance: number field + preset chips
  const distanceInput = document.getElementById('input-distance');
  const setDistance = function(value) {
    const km = parseFloat(value);
    occasionData.marathon.distanceKm = km > 0 ? km : null;
  };
  distanceInput.addEventListener('input', function() {
    setDistance(distanceInput.value);
    scheduleRedraw();
  });
  document.querySelectorAll('.chip[data-km]').forEach(function(chip) {
    chip.addEventListener('click', function() {
      distanceInput.value = chip.dataset.km;
      setDistance(chip.dataset.km);
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
  const styleButtons = document.querySelectorAll('.style-btn');
  styleButtons.forEach(function(btn) {
    btn.addEventListener('click', function() {
      currentStyle = btn.dataset.style;
      selectInGroup(styleButtons, function(other) { return other === btn; });
      triggerRedraw();
    });
  });

  // Sliders — the number updates instantly, the canvas follows
  document.getElementById('input-seed').addEventListener('input', function(event) {
    setSeed(parseInt(event.target.value, 10));
    triggerRedraw();
  });
  document.getElementById('input-feeling').addEventListener('input', function(event) {
    currentFeeling = parseInt(event.target.value, 10);
    document.getElementById('feeling-value').textContent = event.target.value;
    triggerRedraw();
  });

  // Print size changes the preview too: minimum line widths are real
  document.getElementById('input-product').addEventListener('change', function(event) {
    currentProduct = event.target.value;
    triggerRedraw();
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

  document.getElementById('btn-svg').addEventListener('click', exportPrintFile);
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

// Canvas text only uses a web font once it has loaded — repaint when ready
if (document.fonts && document.fonts.load) {
  Promise.all([
    document.fonts.load('700 40px "Merriweather"'),
    document.fonts.load('400 20px "Courier Prime"')
  ]).then(triggerRedraw).catch(function() { /* fall back to system fonts */ });
}
