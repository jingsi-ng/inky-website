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
   Hero demo canvas — "Aoife" cycling through the four occasion palettes.
   Each cycle lasts 4 seconds: brushstrokes draw themselves in, hold,
   then the next palette cross-fades over the top. Not interactive.
   -------------------------------------------------------------------------- */
const HERO_NAME      = 'Aoife';
const HERO_DATE      = '12.06.2027';
const HERO_PLACE     = 'Dundalk';
const HERO_OCCASIONS = ['wedding', 'birthday', 'marathon', 'match'];
const HERO_SIZE      = 380;    // px, square
const HERO_CYCLE_MS  = 4000;
const HERO_DRAW_MS   = 2400;   // time for the strokes to draw in
const HERO_FADE_MS   = 600;    // cross-fade from the previous palette

function setupHeroCanvas() {
  const holder = document.getElementById('hero-canvas');
  if (!holder || typeof p5 === 'undefined') return;

  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const heroSketch = function(p) {
    let cycleIndex = 0;
    let cycleStart = 0;
    let previousFrame = null;   // p5.Graphics holding the last finished pattern
    let hasPrevious = false;    // nothing to fade from on the very first cycle
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

      // Time for the next occasion: remember the finished pattern for the fade
      if (elapsed >= HERO_CYCLE_MS) {
        paintPattern(previousFrame, size, HERO_NAME, HERO_DATE, HERO_PLACE,
          HERO_OCCASIONS[cycleIndex], 1);
        hasPrevious = true;
        cycleIndex = (cycleIndex + 1) % HERO_OCCASIONS.length;
        cycleStart = p.millis();
        return;
      }

      // Ease-out so strokes rush in then settle
      const linear = prefersReducedMotion ? 1 : Math.min(1, elapsed / HERO_DRAW_MS);
      const progress = 1 - Math.pow(1 - linear, 3);

      paintPattern(p, size, HERO_NAME, HERO_DATE, HERO_PLACE,
        HERO_OCCASIONS[cycleIndex], 1, { progress: progress });

      // Cross-fade: the previous pattern dissolves away on top
      if (hasPrevious && elapsed < HERO_FADE_MS) {
        const fadeAlpha = 255 * (1 - elapsed / HERO_FADE_MS);
        p.push();
        p.tint(255, fadeAlpha);
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
