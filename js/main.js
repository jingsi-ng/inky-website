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
   Hero demo canvas — a marathon design for "Aoife" GROWING from the start
   line to the finish: the route draws out, lanes fill in, the laurel
   climbs. Then it holds, and the next variation grows. Not interactive.
   Uses the growth engine in growth.js; colours never change.
   -------------------------------------------------------------------------- */
const HERO_NAME     = 'Aoife';
const HERO_DATE     = '12.06.2027';
const HERO_PLACE    = 'Dundalk';
const HERO_SIZE     = 380;    // px, square
const HERO_GROW_MS  = 3200;   // start line → finish
const HERO_HOLD_MS  = 1600;   // admire the finished design
const HERO_FADE_MS  = 600;    // dissolve into the next variation
const HERO_SEEDS    = [1, 2, 3];
// A believable race: steady start, slower middle miles, strong finish
const HERO_SPLITS   = '5:05 5:00 5:02 5:08 5:15 5:22 5:30 5:41 5:35 5:20 5:05 4:50';
const HERO_PACE_MIN_PER_KM = 5.25;

// Run data at a given growth stage (0 = start line, 1 = finish)
function heroRunAt(progress) {
  const km = 42.195 * progress;
  const totalSeconds = Math.round(km * HERO_PACE_MIN_PER_KM * 60);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const sec = totalSeconds % 60;
  return {
    distanceKm: km > 0.2 ? km : null,
    finishTime: totalSeconds > 0 ? h + ':' + String(m).padStart(2, '0') + ':' + String(sec).padStart(2, '0') : '',
    splits: HERO_SPLITS,
    intensity: 7
  };
}

function heroDesign(seed, progress) {
  return buildMarathonDesign({
    name: HERO_NAME, date: HERO_DATE, place: HERO_PLACE,
    seed: seed, run: heroRunAt(progress), product: 'tote'
  });
}

function setupHeroCanvas() {
  const holder = document.getElementById('hero-canvas');
  if (!holder || typeof p5 === 'undefined' || typeof buildMarathonDesign === 'undefined') return;

  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const heroSketch = function(p) {
    let seedIndex = 0;
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
      const seed = HERO_SEEDS[seedIndex];

      // Cycle finished: keep the full-grown design for the fade, move on
      if (elapsed >= HERO_GROW_MS + HERO_HOLD_MS) {
        paintDesign(previousFrame, size, heroDesign(seed, 1));
        hasPrevious = true;
        seedIndex = (seedIndex + 1) % HERO_SEEDS.length;
        cycleStart = p.millis();
        return;
      }

      // Ease-out: fast early kilometres, settling into the finish
      const linear = prefersReducedMotion ? 1 : Math.min(1, elapsed / HERO_GROW_MS);
      const progress = 1 - Math.pow(1 - linear, 2);
      paintDesign(p, size, heroDesign(seed, progress));

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
