/* ==========================================================================
   inky (印纪) — Shared site behaviour
   - Mobile navigation (hamburger)
   - Fade-in-up on scroll (IntersectionObserver)
   - Animated hero canvas on the landing page (only if #hero-canvas exists)
   ========================================================================== */

// Lets the CSS hide .reveal elements only when JS can reveal them again
document.documentElement.classList.add('js');

/* --------------------------------------------------------------------------
   Mobile navigation
   -------------------------------------------------------------------------- */
function setupNavigation() {
  const toggle = document.querySelector('.nav-toggle');
  const links = document.getElementById('nav-links');
  if (!toggle || !links) return;

  function setOpen(isOpen) {
    toggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    toggle.setAttribute('aria-label', isOpen ? 'Close menu' : 'Open menu');
    document.body.classList.toggle('nav-open', isOpen);
  }

  toggle.addEventListener('click', function() {
    setOpen(toggle.getAttribute('aria-expanded') !== 'true');
  });

  // Close the menu after picking a link, or pressing Escape
  links.querySelectorAll('a').forEach(function(link) {
    link.addEventListener('click', function() { setOpen(false); });
  });
  document.addEventListener('keydown', function(event) {
    if (event.key === 'Escape') setOpen(false);
  });
}

/* --------------------------------------------------------------------------
   Fade-in-up on scroll
   Any element with class "reveal" slides up gently when it enters view.
   -------------------------------------------------------------------------- */
function setupScrollReveal() {
  const items = document.querySelectorAll('.reveal');
  if (items.length === 0) return;

  // No observer support → just show everything
  if (!('IntersectionObserver' in window)) {
    items.forEach(function(item) { item.classList.add('is-visible'); });
    return;
  }

  const observer = new IntersectionObserver(function(entries) {
    entries.forEach(function(entry) {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target); // animate once only
      }
    });
  }, { threshold: 0.15, rootMargin: '0px 0px -40px 0px' });

  items.forEach(function(item, index) {
    // Stagger siblings slightly (cards in a grid ripple in)
    item.style.transitionDelay = (index % 4) * 90 + 'ms';
    observer.observe(item);
  });
}

/* --------------------------------------------------------------------------
   Hero demo canvas — one design GROWING from nothing to full, then the next
   occasion: a marathon in laurel sprigs, a wedding, a marathon medallion,
   a birthday, a match. Uses the growth engine in growth.js; colours never
   change. Not interactive.
   -------------------------------------------------------------------------- */
const HERO_SIZE     = 380;    // px, square
const HERO_GROW_MS  = 3200;   // nothing → full
const HERO_HOLD_MS  = 1600;   // admire the finished design
const HERO_FADE_MS  = 600;    // dissolve into the next one
const HERO_DATE     = '12.06.2027';
const HERO_PLACE    = 'Dundalk';
// A believable race: steady start, slower middle miles, strong finish
const HERO_SPLITS   = '5:05 5:00 5:02 5:08 5:15 5:22 5:30 5:41 5:35 5:20 5:05 4:50';

function formatClock(totalSeconds) {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return h + ':' + String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
}

// Each cycle: who, which occasion, and its data at growth stage p (0 → 1)
const HERO_CYCLES = [
  { name: 'Aoife', occasion: 'marathon', style: 'sprigs', data: function(p) {
      const km = 42.195 * p;
      return { distanceKm: km > 0.2 ? km : null, finishTime: p > 0 ? formatClock(Math.round(km * 315)) : '', splits: HERO_SPLITS, intensity: 7 };
    } },
  { name: 'Aoife & Ciarán', occasion: 'wedding', data: function(p) {
      return { years: Math.round(30 * p), guests: Math.round(160 * p), intensity: 6 };
    } },
  { name: 'Aoife', occasion: 'marathon', style: 'medallion', data: function(p) {
      const km = 42.195 * p;
      return { distanceKm: km > 0.2 ? km : null, finishTime: p > 0 ? formatClock(Math.round(km * 315)) : '', splits: HERO_SPLITS, intensity: 7 };
    } },
  { name: 'Saoirse', occasion: 'birthday', data: function(p) {
      return { age: Math.max(1, Math.round(44 * p)), intensity: 7 };
    } },
  { name: 'Dundalk GAA', occasion: 'match', data: function(p) {
      return { us: String(Math.round(23 * p)), them: String(Math.round(15 * p)), intensity: 8 };
    } }
];

function heroDesign(cycle, progress) {
  return buildDesign({
    occasion: cycle.occasion, style: cycle.style,
    name: cycle.name, date: HERO_DATE, place: HERO_PLACE,
    seed: 1, data: cycle.data(progress), product: 'tote'
  });
}

function setupHeroCanvas() {
  const holder = document.getElementById('hero-canvas');
  if (!holder || typeof p5 === 'undefined' || typeof buildDesign === 'undefined') return;

  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const heroSketch = function(p) {
    let cycleIndex = 0;
    let cycleStart = 0;
    let previousFrame = null;   // p5.Graphics with the last finished design
    let hasPrevious = false;
    let size = HERO_SIZE;

    function heroSize() {
      return Math.min(HERO_SIZE, holder.clientWidth || HERO_SIZE);
    }

    p.setup = function() {
      size = heroSize();
      p.createCanvas(size, size).parent(holder);
      p.frameRate(30);
      previousFrame = p.createGraphics(size, size);
      cycleStart = p.millis();
    };

    p.draw = function() {
      const elapsed = p.millis() - cycleStart;
      const cycle = HERO_CYCLES[cycleIndex];

      // Cycle finished: keep the full-grown design for the fade, move on
      if (elapsed >= HERO_GROW_MS + HERO_HOLD_MS) {
        paintDesign(previousFrame, size, heroDesign(cycle, 1));
        hasPrevious = true;
        cycleIndex = (cycleIndex + 1) % HERO_CYCLES.length;
        cycleStart = p.millis();
        return;
      }

      // Ease-out: fast early kilometres, settling into the finish
      const linear = prefersReducedMotion ? 1 : Math.min(1, elapsed / HERO_GROW_MS);
      const progress = 1 - Math.pow(1 - linear, 2);
      paintDesign(p, size, heroDesign(cycle, progress));

      // The previous design dissolves on top (screen only — never printed)
      if (hasPrevious && elapsed < HERO_FADE_MS) {
        p.push();
        p.tint(255, 255 * (1 - elapsed / HERO_FADE_MS));
        p.image(previousFrame, 0, 0, size, size);
        p.pop();
      }
    };

    p.windowResized = function() {
      const newSize = heroSize();
      if (newSize === size) return;
      size = newSize;
      p.resizeCanvas(size, size);
      previousFrame.remove();
      previousFrame = p.createGraphics(size, size);
      hasPrevious = false;
    };
  };

  new p5(heroSketch);
}

/* --------------------------------------------------------------------------
   Start everything once the page is ready
   -------------------------------------------------------------------------- */
document.addEventListener('DOMContentLoaded', function() {
  setupNavigation();
  setupScrollReveal();
  setupHeroCanvas();
});
