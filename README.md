# inky · 印纪

Website + generative pattern tool for **inky**, a personalised-print studio in Dundalk, Ireland.
*Every design, generated once.*

Vanilla HTML/CSS/JS with [p5.js 1.9.4](https://p5js.org) from CDN — no build step.

## Run it

Open `index.html` in a browser, or serve the folder:

```bash
python3 -m http.server 8000   # then visit http://localhost:8000
```

## Files

| File | What it does |
| --- | --- |
| `index.html` | Landing page: hero with animated pattern demo, products, how it works |
| `generator.html` | The pattern generator (inputs, live canvas, compare, order code, export) |
| `about.html` | Brand story, how the generator works, contact |
| `css/style.css` | Shared styles, light + dark mode |
| `js/patterns.js` | Shared helpers: hash, RNG, text clean-up, order code |
| `js/growth.js` | Growth engine for all occasions: seeded skeletons, data-driven growth, print rules, preview, print-ready SVG with outlined text |
| `js/generator.js` | p5 sketch (instance mode), input wiring, compare mode, print-file export |
| `js/main.js` | Mobile nav, scroll reveal, landing-page hero animation |

## How the generator stays deterministic

`name + date + place + occasion + seed` → DJB2 hash → seeded LCG. Every mark is
generated from that RNG in normalised (0–1) coordinates, so the same inputs repaint
the identical design at any size — 200px previews, the 560px canvas, or the
2400×2400px (300 DPI @ 8in) print export. The order code
(e.g. `INK-WE-AOIFE-12062027-DUN-01`) carries all the inputs, so no backend is needed.

## Growth engine

The seed decides **what the pattern looks like**; the run data decides **how much of it has
grown**. A bigger number only ever adds marks — nothing already drawn moves.

Two styles, same data:

| Data | A · Laurel sprigs | B · Medallion |
| --- | --- | --- |
| distance | one leaf pair per km at a fixed place on fixed sprigs (10K = two sprigs, full = five) | one ray per km, clockwise from the top |
| km splits (optional) | faster km → larger, terracotta leaves | faster km → longer, terracotta rays |
| finish time × how it felt | small leaves gather at the base | the laurel ring grows from the bottom up |
| how it felt | fuller leaves | fuller laurel leaves |

- Colours: terracotta `#8c4a2a` and ink `#2a1e10` on cream `#f5ede0` only; no transparency.
- Print sizes: tote 20 cm, coaster 9 cm, keychain 5 cm. Lines never below 0.35 mm, dots never
  below 0.5 mm; text under 1.2 mm is dropped; the medallion thins to every other ray on small prints.
- SVG export converts text to outlines with opentype.js (Merriweather Bold / Courier Prime WOFF
  from jsDelivr). If the fonts can't load it falls back to `<text>` with a PRINT NOTE.
- Order codes are short (`INK-WE-AOIFEC-12062027-6UAWN`) and end in a check tied to the **design
  link** (`generator.html#design=…`), which carries every input and reopens the exact design.
  The generator's "Email us this design" button sends both to the shop.

Other occasions follow the same rule:

| Occasion | Data → growth |
| --- | --- |
| Wedding | the wedding day starts the wreath (8 pairs) around the initials; a pair per year together (they meet after 22); guests → blossoms by the bow |
| Birthday | at least two petal rings, a new ring per decade, a leaf per year since |
| Match / GAA | twin stars, always equal (win or lose); an arch of small stars, one per point; optional opponent and club colours |

"Fullness" (light ⟷ lush) fills out the leaves and laurel on every occasion. Every design can
be printed on light fabric (on cream), on dark fabric (rust-light + cream, no background), or —
for team orders — in club colours. Names in Latin, Latin Extended and Chinese all print as
outlines; anything else is flagged while typing. Group orders download as a zip of print files
plus a CSV of order codes. Every occasion exports
the same print-ready SVG; there is no PNG export.

The full build spec — including exact CSS, nav/active-state rules and compare-mode behaviour —
is in [`docs/inky-claude-code-prompt.md`](docs/inky-claude-code-prompt.md).

## Look and feel extras

- Homepage product cards and "how it works" use real designs drawn by the engine
  (`paintProductMockup` in `growth.js`, set up in `main.js`).
- Generator: steps that fold into one-line summaries, a "Design / On the product" preview,
  and new leaves / rays / petals grow in when the data changes.
- `assets/favicon.svg`, `assets/apple-touch-icon.png`, `assets/og-image.png` (share preview;
  make `og:image` absolute once there's a domain).

## Generator page behaviour

- Opens empty: the canvas shows a demo pattern for “inky” (wedding, #01) with a
  small overlay that disappears on the first keystroke in the name field.
- Order code + export stay hidden until the name has 2+ letters, then stay visible.
- Desktop (>1024px): 320px controls panel (scrolls on its own) beside a sticky canvas.
- Tablet / phone: one column — occasion → canvas → details → slider → actions →
  code → export. Canvas max 500px on tablet, 400px (screen − 32px) on phone.

## Colour note

`--amber` (`#c2b280`) is only 1.8:1 on cream, so small amber text uses
`--amber-text` (`#6e5e32` on cream, `#5f512b` on bone sections) to pass WCAG AA.
The true amber is kept for decoration and on dark grounds (footer, dark mode).

SVG exports contain live `<text>` — convert text to outlines before sending to the printer.
