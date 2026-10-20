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
| `js/patterns.js` | Algorithm: hash/RNG, letter skeletons, palettes + occasion motifs, motif drawing functions, `buildPatternData`, `paintPattern`, `generateOrderCode`, SVG builder |
| `js/generator.js` | p5 sketch (instance mode), input wiring, compare mode, PNG/SVG export |
| `js/main.js` | Mobile nav, scroll reveal, landing-page hero animation |

## How the generator stays deterministic

`name + date + place + occasion + seed` → DJB2 hash → seeded LCG. Every mark is
generated from that RNG in normalised (0–1) coordinates, so the same inputs repaint
the identical design at any size — 200px previews, the 560px canvas, or the
2400×2400px (300 DPI @ 8in) print export. The order code
(e.g. `INK-WE-AOIFE-12062027-DUN-01`) carries all the inputs, so no backend is needed.

## Generator page behaviour

- Opens empty: the canvas shows a demo pattern for “inky” (wedding, #01) with a
  small overlay that disappears on the first keystroke in the name field.
- Order code + export stay hidden until the name has 2+ letters, then stay visible.
- Desktop (>1024px): 320px controls panel (scrolls on its own) beside a sticky canvas.
- Tablet / phone: one column — occasion → canvas → details → slider → actions →
  code → export. Canvas max 500px on tablet, 400px (screen − 32px) on phone.

## Occasion motifs

Each occasion palette carries a set of symbolic shapes drawn from stories of
transformation (the design's quiet backbone — never named on the site):

| Occasion | Motifs | Story |
| --- | --- | --- |
| Wedding | laurel, branch, leaf | Daphne becomes the laurel |
| Birthday | flower, petal, bloom | Narcissus; Persephone and spring |
| Marathon | crown, feather, wing | Atalanta; the victor's laurel crown |
| Match / GAA | star, constellation, orbit | Castor & Pollux become Gemini |

4–7 large motifs sit faintly under the brushstrokes (alpha 0.12–0.2 — raised from the
original 0.04–0.09, which disappeared at preview size), and 2–4 tiny ones appear as
foreground accents. The SVG export draws them with the same functions via a small
"SVG pen" that mimics the p5 calls they use.

## Colour note

`--amber` (`#c2b280`) is only 1.8:1 on cream, so small amber text uses
`--amber-text` (`#6e5e32` on cream, `#5f512b` on bone sections) to pass WCAG AA.
The true amber is kept for decoration and on dark grounds (footer, dark mode).

SVG exports contain live `<text>` — convert text to outlines before sending to the printer.
