# Claude Code Prompt: inky (印纪) — Full Website + Generative Pattern Tool

> Version 5. Supersedes earlier versions. Where this document gives exact CSS,
> values or behaviour, use them as written — do not substitute your own taste.
> Where something is listed under **Do not**, it is a hard rule.

---

## 1. Project overview

Build a complete multi-page website for **inky (印纪)**, a small Irish personalised-print
studio in Dundalk. It does two jobs:

1. Present the brand and its products.
2. Let customers generate their own pattern, preview it, and get an order code (no backend).

**Hidden concept — transformation preserves essence** (from Ovid's *Metamorphoses*,
public domain). Daphne becomes a laurel but her story remains; a customer's name becomes a
pattern but their moment remains. Ovid is **never named on the site**. It shows up only as:
brand language about transformation, occasion motifs (laurel, flower, crown, stars), and a
"Metamorphoses Collection — coming 2027" teaser on the About page.

**Tech:** vanilla HTML + CSS + JavaScript. p5.js 1.9.4 from
`https://cdnjs.cloudflare.com/ajax/libs/p5.js/1.9.4/p5.min.js` in **instance mode**
(`new p5(sketch)`). opentype.js 1.3.4 from
`https://cdnjs.cloudflare.com/ajax/libs/opentype.js/1.3.4/opentype.min.js` (generator page only,
for print files). No frameworks, no build step, plain `<script>` tags (works from `file://`).
Instructor-style code: clear names, comments that explain *why*, small functions.

### File structure

```
inky/
├── index.html          Landing page
├── generator.html      Pattern generator (most important page)
├── about.html          Brand story, how it works, occasions, collection, contact
├── css/style.css       All styles, light + dark
├── js/main.js          Nav, scroll reveal, landing-page hero animation
├── js/patterns.js      Brushstroke engine (wedding, birthday, match) + shared helpers
├── js/growth.js        Growth engine (marathon): styles, print rules, print-ready SVG
├── js/generator.js     Generator page: p5 sketch, inputs, compare mode, export
└── assets/             (placeholder for future product photos)
```

Script order on generator.html: p5 → opentype → patterns.js → growth.js → main.js → generator.js.
On index.html: p5 → patterns.js → growth.js → main.js. about.html: main.js only.

---

## 2. Brand

**Name:** inky (印纪) · **Tagline:** *Every design, generated once.*

inky is a warm, local, special-occasion print studio — someone at a Dundalk craft fair buying
a tote for their daughter's wedding, a GAA club secretary ordering for the county final.

- **Feel:** welcoming, a little handmade, honest, warm.
- **Not:** cold, editorial, archive-flavoured, typographically severe, startup-clean,
  luxury-minimal, glassy. Also not childish, confetti-bright, bubbly, over-rounded.
- **Copy:** warm, direct, a little personal — the founder at a market stall.
  RIGHT: "Your name becomes the pattern. We print the pattern. You keep it."
  WRONG: "Elevate your cherished moments with our bespoke artisan keepsakes."
- **Forbidden words:** crafted, bespoke, artisan, elevate, unique journey, stunning.
- No lorem ipsum anywhere.

### Two palettes — don't mix them up

**Site UI palette** (pages, cards, buttons):

```css
--cream:      #f5ede0;  /* page background */
--bone:       #d8cba8;  /* borders, ruled lines, "how it works" ground */
--amber:      #c2b280;  /* decoration; text only on dark grounds (see --amber-text) */
--rust:       #8c4a2a;  /* buttons, active states, pull quotes */
--rust-light: #b87050;  /* hover */
--ink:        #2a1e10;  /* text — never #000 */
--teal:       #6b8c7c;  /* reserved; not used for printed work */
--surface:    #faf6f0;  /* cards, panels */
```

**Print palette** (every generated pattern, every occasion, the preview canvas, the SVG):
exactly three colours, never animated or swapped per occasion.

| Name | Hex | Role |
| --- | --- | --- |
| terracotta | `#8c4a2a` | ink 1 |
| ink | `#2a1e10` | ink 2 |
| cream | `#f5ede0` | ground (background layer only) |

Occasions are told apart by **shapes** (motifs), never by colour.

### Typography

```html
<link href="https://fonts.googleapis.com/css2?family=Merriweather:ital,wght@0,300;0,700;1,300&family=Courier+Prime:ital,wght@0,400;0,700;1,400&display=swap" rel="stylesheet">
```

- Headings: Merriweather 700, left-aligned, never gratuitously large.
- Body: Merriweather 300, 16.5px, line-height 1.75. Italic 300 for quotes and secondary lines.
- Labels, metadata, UI, dates, order codes: Courier Prime 10–12px, letter-spacing 0.08em,
  **lowercase as written** (no `text-transform`).
- Fallbacks: `'Merriweather', Georgia, serif` and `'Courier Prime', 'Courier New', monospace`.

---

## 3. CSS — use these rules as written

### 3.1 Tokens (light + dark)

```css
:root {
  /* brand palette from §2, plus semantic tokens components actually use */
  --bg: var(--cream);        --card: var(--surface);   --border: var(--bone);
  --text: var(--ink);        --text-muted: #5e4d38;
  --accent: var(--rust);     --accent-hover: var(--rust-light);   --on-accent: var(--cream);
  /* --amber is 1.8:1 on cream — unreadable as small text. Small amber LABELS use: */
  --amber-text: #6e5e32;     /* 5.5:1 on cream; use #5f512b inside bone sections */
  --section-bone: var(--bone);   --section-ink: var(--ink);   --on-ink: var(--cream);
  --nav-bg: var(--cream);    /* SOLID. See "Do not" below. */
  --shadow: 0 2px 8px rgba(42, 30, 16, 0.06);
  --font-serif: 'Merriweather', Georgia, serif;
  --font-mono: 'Courier Prime', 'Courier New', monospace;
  --nav-height: 56px;  --max-width: 1120px;  --radius: 6px;  --radius-btn: 4px;  --gutter: 24px;
}
@media (prefers-color-scheme: dark) {     /* a dimly lit studio, not a generic night mode */
  :root {
    --bg: #1a130c;  --card: #221a12;  --border: #3a2e22;  --text: #f0e8d8;  --text-muted: #c4b49a;
    --accent: #c07050;  --accent-hover: #d48a6a;  --on-accent: #1a130c;
    --amber-text: var(--amber);  --section-bone: #2a2016;  --section-ink: #120d08;
    --nav-bg: #1a130c;  --shadow: 0 2px 10px rgba(0, 0, 0, 0.35);
  }
}
```

The pattern canvas and print palette do **not** change in dark mode — the canvas stays cream.

### 3.2 Base

```css
body { margin: 0; background: var(--bg); color: var(--text);
       font: 300 16.5px/1.75 var(--font-serif); overflow-x: clip; }
/* clip, not hidden: overflow-x: hidden breaks position: sticky */
h1, h2, h3 { font-weight: 700; line-height: 1.25; margin: 0 0 .6em; text-wrap: balance; }
h1 { font-size: clamp(2rem, 4.6vw, 3rem); }
h2 { font-size: clamp(1.5rem, 3vw, 2rem); }
.label { display: block; font: 400 11px/1.5 var(--font-mono); letter-spacing: .08em;
         color: var(--amber-text); margin: 0 0 10px; }
.section { padding: clamp(56px, 8vw, 96px) 0; }
.section--bone { background: var(--section-bone); --amber-text: #5f512b; }
.section-inner { max-width: var(--max-width); margin: 0 auto; padding: 0 var(--gutter); }
:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; }
```

### 3.3 Navigation

```css
.nav { position: sticky; top: 0; z-index: 50; height: var(--nav-height);
       background: var(--nav-bg); border-bottom: 1px solid var(--border); }
.wordmark { font: 700 1.15rem var(--font-serif); color: var(--text); text-decoration: none; }
.nav-links { display: flex; gap: 32px; }
.nav-links a { font: 300 .98rem var(--font-serif); color: var(--text); text-decoration: none;
               padding: 6px 0; border-bottom: 1px solid transparent; }
.nav-links a:hover { color: var(--accent); }
.nav-links a[aria-current="page"] { color: var(--accent); font-weight: 700;
                                     border-bottom-color: var(--accent); }
```

Mobile (≤700px): a hamburger (three 1.5px ink lines, turns into ✕) opens a plain dropdown
under the bar — full-width cream panel, links stacked, 14px vertical padding, 1px bone
dividers, fades in over 0.2s. Closes on link click and on Escape.

### 3.4 Buttons, cards, inputs

```css
.btn { min-height: 44px; padding: 10px 22px; font: 700 .95rem var(--font-mono);
       border-radius: var(--radius-btn); border: 1px solid transparent; cursor: pointer; }
.btn-primary   { background: var(--accent); color: var(--on-accent); }
.btn-primary:hover { background: var(--accent-hover); }
.btn-secondary { background: transparent; color: var(--text); border-color: var(--text); }
.btn-secondary:hover { background: var(--border); }
.card { background: var(--card); border: 1px solid var(--border); border-radius: var(--radius); }
.card--float { box-shadow: var(--shadow); }   /* only when floating on a same-colour ground */
input[type="text"], input[type="number"], textarea, select {
  width: 100%; min-height: 44px; padding: 10px 12px; font: 300 1rem var(--font-serif);
  color: var(--text); background: var(--bg); border: 1px solid var(--border);
  border-radius: var(--radius-btn); }
input:focus, textarea:focus, select:focus { outline: none; border-color: var(--accent);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 18%, transparent); }
input[type="range"] { /* 3px bone track; 18px rust thumb with a 3px card-coloured ring */ }
```

### 3.5 Footer

`--section-ink` background, `--on-ink` text, 56px top padding. Three columns (one column
≤720px): wordmark + italic tagline · links one per line (Merriweather 300) · right-aligned
Courier Prime 11px **amber** (`--amber`, it's a dark ground): `Dundalk · Co. Louth · Ireland`,
`hello@inky.ie`, `@inky.ie`. Bottom row: `© 2026 inky`, Courier Prime 10px amber, above a
1px `rgba(194,178,128,.2)` rule.

### 3.6 Motion

Cards and steps use `.reveal`: `opacity 0 → 1`, `translateY(20px) → 0`, 0.7s ease, staggered
90ms within a group, triggered once by IntersectionObserver (threshold 0.15). Hide `.reveal`
only when JS runs (`.js .reveal`). Respect `prefers-reduced-motion`: no transitions, hero
shows finished designs.

### 3.7 Do not

- **No `backdrop-filter` / blur / frosted glass** anywhere (it reads cold and "tech", not inky).
- No translucent nav, no gradients on page sections, no glassmorphism.
- No drop shadows on buttons; card shadow only `--shadow`, and only on floating cards.
- No `#000` or `#fff` — use ink and cream/surface.
- No border-radius above 6px (buttons 4px); no pill shapes.
- No uppercase transforms on labels (write the text in the case you want).
- No colours outside the palettes, in UI or print.

---

## 4. Navigation and the active state

Every page has the same nav: wordmark `inky · 印纪` (left, links to index.html — the Chinese
at the same size as the English) and links `Products` · `Generator` · `About`.

| Page | Products link | Active link |
| --- | --- | --- |
| index.html | `#products` | none — the wordmark is "home" |
| generator.html | `index.html#products` | Generator |
| about.html | `index.html#products` | About |

Mark the active link with `aria-current="page"` in the HTML (not only a class) and style it
with §3.3: rust text, bold, 1px rust underline. In the mobile dropdown the active link is rust
text without the underline. Footer links have no active state.

---

## 5. index.html

1. **Hero** — two columns (55 / 45), cream, no background pattern. Left: label
   `Dundalk, Ireland — personalised print`; h1 (48–54px) `Your name.` / `Transformed.` /
   `Permanent.`; italic 17px "Every pattern begins as a name. The letters become composition.
   The composition becomes an object you keep."; primary button `Create Your Design →`
   (generator.html) with a soft amber link `See how it works ↓` (#how) under it.
   Right: 380×380 canvas, 6px radius, bone border, `--shadow`, label
   `live preview — enter your own name in the generator`. The canvas loops a **marathon
   design for "Aoife" growing from 0 to 42.195 km** (3.2s grow, 1.6s hold, 0.6s dissolve),
   alternating the two marathon styles (see §8). Colours never change. Stacks below 820px.
2. **Products** (`#products`, 1px bone rule above) — label `what we print`, h2
   `Things that last.`; 2×2 cards (1 column ≤640px), each with a 40px colour strip
   (cream `#f5ede0`, terracotta `#8c4a2a`, ink `#2a1e10`, bone `#d8cba8`), index `01`–`04`,
   name (20px bold), one sentence (15px), price (Courier Prime 13px amber):
   Tote Bag — "Your generated pattern, screen-printed. Reusable, sturdy, yours." — `€18 – 28`;
   Acrylic Keychain — "Your name drawn as brushstrokes, UV-printed on 3mm acrylic." — `€8 – 14`;
   Coaster Set — "Four coasters. Four patterns generated from the same name." — `€22 – 35`;
   Event Package — "Custom merchandise for marathons, societies and clubs." — `Get a quote`.
3. **How it works** (`#how`, `.section--bone`) — label `the process`, h2
   `How your design is made.`; three steps with faint vertical dividers; `01` rust 24px,
   18px bold heading, italic sentence: Enter your details / The pattern generates /
   Lock it with a code (copy from v4).
4. **Quote** — centred, max 640px, italic 300 ~26px rust: "Names become patterns. Moments
   become objects. You become permanent." Caption label `— the idea behind every inky design`.
5. **Footer** (§3.5).

---

## 6. generator.html

### 6.1 Layout

- **Desktop (>1024px):** grid `320px 1fr`, 32px gap. Left: one panel card, `position: sticky`
  under the nav, `max-height: calc(100vh − nav − 32px)`, `overflow-y: auto` (scrolls on its
  own). Right: canvas area, also sticky.
- **Tablet (768–1024px) and phone (<768px):** one column in this order — occasion card →
  canvas + preview label → details card (details, run data, seed, actions, order code,
  export). Implement with one markup: the panel has two groups; below 1025px the panel is
  `display: contents` and the groups/canvas get `order` 1/2/3. Canvas max 500px on tablet,
  `screen − 32px` (max 400px) on phone (16px gutters).

### 6.2 Starting state

Inputs empty, Wedding selected, seed 1. The canvas shows a demo pattern for the name `inky`
and a centred overlay (Courier Prime 12px, deep amber on a translucent surface pill):
"Enter your name to generate your pattern". The overlay fades out on the **first** input event
in the name field and never returns. The order code and export sections are `display: none`
until the name has ≥ 2 characters, then stay visible even if the name is cleared (the canvas
falls back to the `inky` demo).

### 6.3 Controls

- **Occasion** — 2×2 toggle buttons, two lines each: emoji + name (Merriweather bold) and an
  italic Courier Prime 10px amber tagline: 💍 Wedding / "drawn from the laurel — love that
  endures"; 🎂 Birthday / "drawn from the flower — the joy of becoming"; 🏃 Marathon / "drawn
  from the crown — a finish line earned"; 🏐 Match / GAA / "drawn from the stars — two sides,
  one moment". Selected: rust border (plus 1px inset rust ring) on cream. The selected tagline
  repeats under the grid in 12px rust italic. `role="radiogroup"`, `aria-checked`.
- **Style** (marathon only, in the occasion card so it sits above the canvas on mobile) —
  two toggles like the occasion buttons: `Laurel sprigs` / "a leaf pair for every km",
  `Medallion` / "a ray for every km".
- **Your details** — Name (max 30, placeholder "e.g. Aoife & Ciarán"), Date (max 20,
  "e.g. 12.06.2027"), Place (max 24, "e.g. Dundalk"). 350ms debounce.
- **Your run** (marathon only) — distance km (number input + chips `5K` `10K` `Half`
  `Full` = 5 / 10 / 21.0975 / 42.195), finish time (`3:41:20`; two parts: first part under 10
  = h:mm, else mm:ss), km splits (optional textarea, "5:12, 5:08 …" or decimal minutes),
  "how it felt" slider 0–10 (default 5, value shown in rust). Hint: "The more you add, the
  more it grows: every km adds a leaf pair (or a ray), your splits colour the faster ones,
  and your time grows the laurel." Text fields debounce 350ms; sliders and chips redraw now.
- **Design variation** — slider 1–99, value `#01` in Courier Prime rust; hint "Drag to explore
  different arrangements for the same name."
- **Actions** — `Compare 4 Variations` (primary) and `Shuffle ↺` (secondary, random seed
  ≠ current), full width, stacked.
- **Order code** — dashed-border box in rust Courier Prime + `Copy` button (clipboard, with an
  `execCommand` fallback) + hint "Share this code when ordering — we'll reproduce your exact
  design." A toast confirms the copy.
- **Export** — marathon: print size select (Tote bag — 20 cm / Coaster — 9 cm /
  Keychain — 5 cm) and `↓ SVG` only, hint "Print-ready SVG: two solid inks, text as outlines,
  lines no thinner than 0.35 mm at the size you pick." Other occasions: `↓ PNG (300 DPI)`
  (2400×2400 off-screen `createGraphics`, `pixelDensity(1)`) and `↓ SVG`.

Below the canvas: preview label `Name · Date · Place` (Courier Prime), or `inky · sample
pattern` in the demo state.

### 6.4 Compare 4 Variations — exact behaviour

1. Clicking `Compare 4 Variations` **replaces the single canvas in the right-hand canvas area**
   (desktop) / in the canvas slot between the occasion and details cards (mobile). The single
   canvas and its preview label are hidden (`hidden` attribute), not removed. The panel stays
   usable.
2. The compare view shows a header row — label `pick your favourite` on the left, a small
   secondary button `Back ✕` on the right — then a 2×2 grid of four tiles (each up to 200px,
   `minmax(0, 200px)` columns, 16px gap, centred), then the hint "Tap a variation to choose
   it — it becomes your design. "Back" or Esc keeps the one you had."
3. Tiles are `<button>`s holding a 200px canvas of the **current inputs** (occasion, style,
   name, date, place, run data, print size) at **seeds 1, 2, 3, 4**, with a label
   `Variation #01` … `#04`. The tile matching the current seed has a rust border.
   Build the four `p5.Graphics` once and repaint them on later calls.
4. While comparing, any input change repaints the tiles live.
5. Choosing a tile: set the seed (slider + `#0N` readout), leave compare mode, redraw the single
   canvas, update the order code, toast "Variation #0N selected".
6. `Back ✕`, **Escape**, or `Shuffle ↺` leave compare mode without changing the seed
   (Shuffle then applies its random seed).
7. Focus: on entering, focus the current tile (or the first); on leaving, return focus to the
   `Compare 4 Variations` button. If the compare view starts above the viewport, scroll it into
   view smoothly.
8. On leaving, call the sketch's `windowResized()` so the single canvas re-fits its column.

---

## 7. about.html

Five sections, alternating cream / bone:

1. **What we believe** (cream) — label `what we believe`, large italic 300 heading
   "Something of you stays inside it.", two text columns (v4 copy), then the flow
   `A name → becomes a pattern → becomes an object` as three bone-bordered Courier boxes with
   rust arrows (↓ arrows stacked on ≤640px).
2. **How your design is made** (`.section--bone`, ink text — not dark) — 2×2 steps, rust
   Courier `01`–`04` (32px), bold heading, one sentence (v4 copy).
3. **The occasions** (cream) — h2 "Four occasions. Four visual languages.", then one line
   "One palette for everything we print — terracotta, cream and ink. Each occasion grows its own
   shapes instead." with three swatch dots. Four cards (4 across, 2×2 ≤980px, 1 ≤460px): cream
   strip, icon, title (Wedding · Birthday · Marathon / Run · Match / Event), amber motif line
   (v4 copy), a faint flat SVG motif bottom-right at 15% opacity (3-leaf branch, 5-petal flower,
   crown arc, 6-point star + two-dot constellation). The marathon card adds an italic line:
   "Grows with your run: every km adds a leaf pair (or a ray), your faster stretches turn
   terracotta, your time grows the laurel."
4. **The Metamorphoses Collection** (`.section--bone`) — eyebrow `COMING 2027`, bold italic
   heading, intro (v4 copy), four cream series cards (Daphne, Narcissus, Atalanta, Gemini — tags,
   descriptions, line-art motif in rust at 40%, `Coming 2027` badge). Four columns on desktop;
   a scroll-snapping horizontal row ≤900px. CTA line in Courier: "Want to be first to know? Email
   us at hello@inky.ie".
5. **Contact** (cream) — label `get in touch`, h2 "Say hello."; left: email / instagram / studio
   (plain, copyable text, no mailto); right: italic note (v4 copy) + `Create Your Design →`.

---

## 8. Pattern engines

Both engines lay everything out in **normalised design units** and only scale at the end, so
one design fits a 5 cm keychain or a 20 cm tote. Same inputs → same design, always
(DJB2 `hashString` + LCG `createRng`, both as in v4). Seed key:
`NAME_WITHOUT_ACCENTS_UPPER::date::place::occasion::seed`.

### 8.1 Brushstroke engine — wedding, birthday, match (`patterns.js`)

Letter skeletons A–Z and `&` (normalised strokes); per letter, 6–12 short tapered brush
marks along each stroke (±0.4 rad, 1.5–5% length, 0.8–4px, alpha 0.25–0.75) plus 4–8 stray
marks; 4–7 faint motif shapes behind (wedding laurel/branch/leaf, birthday flower/petal/bloom,
match star/constellation/orbit); 3–5 ruling lines; 2–3 seal rings; 8–15 accent marks plus 2–4
tiny motif accents; name/date/corner text. **Brand print palette only. No paper-grain dot field.**
Known gap: this engine still uses transparency, so its SVG is not yet print-grade. These
occasions will move to the growth engine next (wedding: years together → rings, using the same
"only ever add" rule).

### 8.2 Growth engine — marathon (`growth.js`)

**The rule:** the *seed* decides what the pattern looks like (skeleton); the *data* decides how
much of it has grown. Changing run data never re-randomises anything, and a bigger number only
ever **adds** marks — it never moves or reshuffles existing ones. Each layer uses its own
random stream (`hashString(root + ':sprigs')`, `':medallion'`).

**Run data → 0..1:** distance km (≤100); finish minutes → `time = easeOut(min/360)`;
splits resampled to 12 speeds (3:00/km = 1, 8:00/km = 0, quantised to 36 levels);
feeling 0–10 → `intensity`. Speed colours use **relative** speed — 0 = this runner's slowest
stretch, 1 = their fastest — so every runner's strong stretches show. No splits → 0.5 (even).
Stretches with relative speed ≥ 0.55 are terracotta.

**Style A · Laurel sprigs** — five sprig slots with fixed angles from vertical
`[-0.38, 0.38, 0.02, -0.95, 0.95]`, from one base at (500, 760), seeded bend/wave/length.
One leaf pair per km at a **fixed place**: km 1–18 alternate on the two inner sprigs, km 19–27
centre sprig, 28–36 outer left, 37–45 outer right (cap 45). Pair spacing 50 units after a
60-unit bare lead, so more km = more sprigs, never tighter spacing. Leaf length
`(34 + 22·speed) × seeded 0.9–1.1 × (0.9 + 0.2·intensity)`, ±0.72 rad off the stem; fast km →
both leaves terracotta, otherwise one seeded side ink. A terracotta tip leaf per sprig. Up to
8 small ink leaves gather at the base, shown in rank order as `time × (0.5 + 0.5·intensity)`
grows. With no distance: a 2 km seedling.

**Style B · Medallion** — centre seal (terracotta disc r 54, ink ring r 72, seeded optional
inner ring) at (500, 400). One tapered, round-tipped ray per km at fixed clock positions
(km 1 at the top, clockwise, 42 slots), starting at r 92, length
`(80 + 120·speed) × seeded wobble`, the last ray growing with the part-km; fast → terracotta,
else ink. Laurel ring r 335: two branches rising from the bottom, 15 leaves per side alternating
in/out, shown up to `lerp(0.1, 1, time × (0.5 + 0.5·intensity))`.

**Text block (both):** name Merriweather Bold 92 (shrinks to fit 860), baseline 885; short
terracotta rule 430–570 at 912; `DATE · PLACE` Courier 22 terracotta at 948; `42.2 KM · 3:41:20`
Courier 18 ink at 978. No frames, no corner labels.

**Do not** (growth engine): circles with radiating lines other than the medallion's own seal;
scattered dots, rings or "cell-like" textures; contour lines or km tick marks; noise, glitch or
distressed effects; gradients or transparency in anything printed.

**Print rules** per product (tote 200 mm, coaster 90 mm, keychain 50 mm): lines ≥ 0.35 mm, dots
≥ 0.5 mm, text under 1.2 mm dropped (the name always stays). "Small" products (min line > 3
units) simplify: medallion draws every other km's ray. The preview applies the same rules for
the chosen size.

**Print file (SVG):** `width/height` in mm, `viewBox 0 0 1000 1000`; a header comment with
order code, product, colours; `<g id="background">` cream rect (delete for cream stock);
`<g id="artwork">` in paint order, consecutive same-colour shapes grouped as
`class="ink-terracotta"` / `class="ink-ink"`; `<g id="text">` with text **converted to
outlines** via opentype.js (fonts: `@fontsource/merriweather@5.3.0` latin-700 WOFF and
`@fontsource/courier-prime@5.3.0` latin-400 WOFF from cdn.jsdelivr.net, parsed with
`opentype.parse(arrayBuffer)`). If fonts can't load, write `<text>` plus
`<!-- PRINT NOTE: Convert all text to outlines in Illustrator/Inkscape before sending to xTool -->`
and tell the user in the toast. No `opacity`, no gradients, three colours only.

### 8.3 Order codes

Base (all occasions): `INK-{OC}-{NAME≤6}-{DIGITS≤8}-{PLACE≤3}-{SEED2}`, accents removed, e.g.
`INK-WE-AOIFE-12062027-DUN-01`. Marathon appends `-{A|B}-D{km×10}-T{hhmmss}-I{0–10}-P{12 base-36
pace chars}` (D/T/P only when given), e.g.
`INK-MA-AOIFE-12062027-DUN-01-A-D422-T034120-I7-PKLLKJIIGHJKM`.

---

## 9. Acceptance checks

- `.nav` computed `backdrop-filter` is `none`; nav background is solid cream (dark: `#1a130c`).
- generator.html and about.html each have exactly one `aria-current="page"` nav link; index has none.
- No horizontal scroll at 390px; generator order on phone is occasion → canvas → details.
- Typing one letter hides the overlay; order code + export appear at two letters.
- Compare: single canvas hidden, four tiles visible, Esc returns with the seed unchanged and
  focus on the Compare button; choosing tile 3 sets the slider to 3.
- Marathon 10 km → 42.195 km: every leaf/ray present at 10 km is still present, unmoved, at 42 km.
- Exported marathon SVG: valid XML, no `opacity`, no `<text>` (when fonts load), only
  `#8c4a2a`, `#2a1e10`, `#f5ede0`; keychain export has no line under 7 units (0.35 mm).
- No forbidden words on any page; no colour outside the palettes.
