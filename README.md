# Round-Robin Allocation Visualiser

Interactive visualisation of the plain round-robin allocation algorithm. Built as an
"explorable explanation" to illustrate how chunk size and
agent count affect the resulting allocation pattern.

## Layout

- **Top panel** — dots, one per agent. The current active dot is highlighted; each dot fills up as it accumulates allocations.
- **Bottom panel** — Gantt-style timeline. Each row is an agent; each coloured block is one allocation event.
- **Controls** — play/pause/step/reset, a scrubber to jump to any point in time, playback speed, and sliders for the simulation parameters.

## Run

```bash
bun install
bun dev
```

Then open [http://localhost:5173](http://localhost:5173).

## Try this

- Set **chunk = 1** and watch every agent get served in strict rotation.
- Set **chunk = request** — only the first agent gets anything.
- Crank **speed** to 60× and scrub through the timeline to see the emerging pattern.
- Make **request > total capacity** — the allocation stops early when everyone's full.

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
