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
| `js/patterns.js` | Algorithm: hash/RNG, letter skeletons, palettes, `buildPatternData`, `paintPattern`, `generateOrderCode`, SVG builder |
| `js/generator.js` | p5 sketch (instance mode), input wiring, compare mode, PNG/SVG export |
| `js/main.js` | Mobile nav, scroll reveal, landing-page hero animation |

## How the generator stays deterministic

`name + date + place + occasion + seed` → DJB2 hash → seeded LCG. Every mark is
generated from that RNG in normalised (0–1) coordinates, so the same inputs repaint
the identical design at any size — 200px previews, the 560px canvas, or the
2400×2400px (300 DPI @ 8in) print export. The order code
(e.g. `INK-WE-AOIFE-12062027-DUN-01`) carries all the inputs, so no backend is needed.

SVG exports contain live `<text>` — convert text to outlines before sending to the printer.
