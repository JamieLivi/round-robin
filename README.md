# Round-Robin Allocation Visualiser

Interactive visualisation of the plain round-robin allocation algorithm for matching
borrow requests to lenders in a peer-to-peer lending pool. Built as an "explorable
explanation" to illustrate how chunk size and lender count affect the resulting
allocation pattern.

## Layout

- **Top panel** — dots, one per lender. The currently-served dot is highlighted; each dot fills up as the lender accumulates allocations.
- **Bottom panel** — Gantt-style timeline. Each row is a lender; each coloured block is one chunk allocated in a turn.
- **Controls** — play/pause/step/reset, a scrubber to jump to any point in time, playback speed, and sliders for the simulation parameters.

## Run

```bash
bun install
bun dev
```

Then open [http://localhost:5173](http://localhost:5173).

## Try this

- Set **chunk = 1** and watch every lender get served in strict rotation.
- Set **chunk = borrow request** — only the first lender gets the whole thing.
- Crank **speed** to 60× and scrub through the timeline to see the emerging pattern.
- Make **borrow request > total capacity** — the allocation stops early when every lender is full.

## Structure

```
src/
├── simulation.ts   # pure allocation logic — produces an event stream
├── DotsView.tsx    # top panel: dots with fill animation
├── GanttView.tsx   # bottom panel: Gantt timeline with playhead
└── App.tsx         # state, controls, layout
```

## Stack

- Vite + React 19 + TypeScript
- [motion](https://motion.dev/) for SVG animations
- Plain CSS

## Deploy

Pushed automatically to GitHub Pages on every push to `main` via
[`.github/workflows/deploy.yml`](.github/workflows/deploy.yml). One-time setup in the
repo's **Settings → Pages → Source** — pick **GitHub Actions**.

The Vite `base` path is set to `/round-robin/` to match the Pages URL. For local dev
the default still works; override with `VITE_BASE=/ bun run build` if deploying elsewhere.
