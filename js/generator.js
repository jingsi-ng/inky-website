/* ==========================================================================
   inky (印纪) — Generator page
   --------------------------------------------------------------------------
   p5.js sketch (instance mode) + input wiring + export.
   All the "what does it look like" logic lives in patterns.js;
   this file only decides WHEN and WHERE to paint.
   ========================================================================== */

// ----- Current design state -----
let currentName    = 'Aoife';
let currentDate    = '12.06.2027';
let currentPlace   = 'Dundalk';
let currentOcc     = 'wedding';
let currentSeed    = 1;
let isCompareMode  = false;

let mainSketch = null;
let compareGraphics = [];      // four p5.Graphics reused for Compare mode

const REDRAW_DELAY_MS = 350;   // debounce for text inputs
const COMPARE_SIZE    = 200;   // px, each Compare canvas
const HI_RES          = 2400;  // px, 300 DPI × 8 inches

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
    paintPattern(p, p.width, currentName, currentDate, currentPlace, currentOcc, currentSeed);
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

// Largest square that fits the column and the screen height
function getCanvasSize() {
  const container = document.getElementById('canvas-container');
  const available = container ? Math.min(container.clientWidth, window.innerHeight - 150) : 500;
  return Math.max(Math.min(available, 560), 280);
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
  document.getElementById('order-code').textContent =
    generateOrderCode(currentName, currentDate, currentPlace, currentOcc, currentSeed);
}

function updatePreviewLabel() {
  const parts = [currentName.trim(), currentDate.trim(), currentPlace.trim()]
    .filter(function(part) { return part.length > 0; });
  document.getElementById('preview-label').textContent = parts.join(' · ') || 'Type a name to begin';
}

function setSeed(seed) {
  currentSeed = seed;
  document.getElementById('input-seed').value = seed;
  document.getElementById('seed-value').textContent = '#' + String(seed).padStart(2, '0');
}

function setOccasion(occasion) {
  currentOcc = occasion;
  document.querySelectorAll('.occasion-btn').forEach(function(btn) {
    const isActive = btn.dataset.occasion === occasion;
    btn.classList.toggle('is-active', isActive);
    btn.setAttribute('aria-checked', isActive ? 'true' : 'false');

    // Repeat the chosen occasion's tagline under the grid
    if (isActive) {
      document.getElementById('occasion-note').textContent =
        btn.querySelector('.occasion-tagline').textContent;
    }
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
}

function exitCompareMode() {
  isCompareMode = false;
  document.getElementById('compare-view').hidden = true;
  document.getElementById('single-view').hidden = false;
  mainSketch.windowResized(); // the column may have changed size while hidden
  mainSketch.redraw();
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
    paintPattern(pg, COMPARE_SIZE, currentName, currentDate, currentPlace, currentOcc, seed);
    const tile = pg.elt.parentElement;
    tile.classList.toggle('is-current', seed === currentSeed);
    tile.setAttribute('aria-label', 'Choose variation ' + seed);
  });
}

/* --------------------------------------------------------------------------
   Export
   -------------------------------------------------------------------------- */
function exportHighResPng(name, date, place, occasion, seed) {
  // Create an off-screen p5 Graphics object at print resolution
  const pg = mainSketch.createGraphics(HI_RES, HI_RES);
  pg.pixelDensity(1); // exactly 2400 × 2400, whatever the screen is

  // Paint the full pattern onto pg at HI_RES scale
  paintPattern(pg, HI_RES, name, date, place, occasion, seed);

  // Save
  const orderCode = generateOrderCode(name, date, place, occasion, seed);
  pg.save('inky-' + orderCode + '-300dpi.png');
  pg.remove();
}

function exportSvg(name, date, place, occasion, seed) {
  const svg = buildPatternSvg(name, date, place, occasion, seed);
  const blob = new Blob([svg], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = 'inky-' + generateOrderCode(name, date, place, occasion, seed) + '.svg';
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
  // Text fields → debounced redraw
  const textFields = [
    { id: 'input-name',  apply: function(v) { currentName  = v; } },
    { id: 'input-date',  apply: function(v) { currentDate  = v; } },
    { id: 'input-place', apply: function(v) { currentPlace = v; } }
  ];
  textFields.forEach(function(field) {
    document.getElementById(field.id).addEventListener('input', function(event) {
      field.apply(event.target.value);
      scheduleRedraw();
    });
  });

  // Occasion buttons
  document.querySelectorAll('.occasion-btn').forEach(function(btn) {
    btn.addEventListener('click', function() {
      setOccasion(btn.dataset.occasion);
      triggerRedraw();
    });
  });

  // Seed slider — the number updates instantly, the canvas follows
  document.getElementById('input-seed').addEventListener('input', function(event) {
    setSeed(parseInt(event.target.value, 10));
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

  document.getElementById('btn-copy').addEventListener('click', function() {
    const code = document.getElementById('order-code').textContent;
    copyText(code)
      .then(function() { showToast('Order code copied: ' + code); })
      .catch(function() { showToast('Select the code and copy it by hand'); });
  });

  document.getElementById('btn-png').addEventListener('click', function() {
    showToast('Rendering 2400 × 2400 px…');
    // Let the toast paint before the heavy render blocks the page
    setTimeout(function() {
      exportHighResPng(currentName, currentDate, currentPlace, currentOcc, currentSeed);
    }, 50);
  });

  document.getElementById('btn-svg').addEventListener('click', function() {
    exportSvg(currentName, currentDate, currentPlace, currentOcc, currentSeed);
    showToast('SVG saved — outline the text before printing');
  });
}

// Read the starting values from the HTML so they always match
function readInitialValues() {
  currentName  = document.getElementById('input-name').value;
  currentDate  = document.getElementById('input-date').value;
  currentPlace = document.getElementById('input-place').value;
  setSeed(parseInt(document.getElementById('input-seed').value, 10));
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
