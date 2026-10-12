# HELIOS CORE

**Mechanica Collection · Specimen No. 002**

A controlled artificial sun built as a precision mechanical artifact: a plasma core in amber
glass, four gyroscopic rings on a polar axis, six articulated solar fins, a working regulator
train and a graduated pedestal. Everything is procedural geometry rendered in the browser.
There is no model file, image or video behind the hero.

Sibling of `apis-mechanica` (Specimen No. 001) and built on the same stack:
Vite · React 19 · three.js · React Three Fiber · drei · postprocessing · zustand.

## Run

```bash
pnpm install
pnpm dev        # http://127.0.0.1:5180
```

```bash
pnpm build      # typecheck + production build into dist/
pnpm preview    # serve dist/ on http://127.0.0.1:5181
```

`dist/` is a static site. It deploys as-is to Vercel, Cloudflare Pages or Netlify.

## Using it

| Action | Pointer | Key |
| --- | --- | --- |
| Orbit | drag | |
| Zoom | wheel, trackpad pinch, two-finger pinch | |
| Operating mode | IGNITION · STABILIZING · RADIANCE · OVERDRIVE | `1` `2` `3` `4` |
| Hold the mechanism | PAUSE | `Space` |
| See through the shells | X-RAY | `X` |
| Automatic orbit | ORBIT | `O` |
| Restore everything | RESET | `R` |
| Fly the camera home | RESET VIEW | `V` |
| Leave EXPLORE / COLLECT | | `Esc` |

The navigation re-weights one interface rather than switching pages:
**OBSERVE** is the resting view, **EXPLORE** examines a part of the anatomy (the camera flies
to it), **INTERACT** brings the console forward, and **COLLECT** saves the view you composed
as a labelled PNG. On a phone each of the four shows one bottom sheet.

Pressing the title shows the maker's mark.

## How it is put together

```
src/
  sim/            pure logic, no three.js or React
    modes.ts        operating profiles and every output -> behaviour mapping
    simulation.ts   the machine state and its per-frame step
    kinematics.ts   gear meshing, slider-crank, four-bar, governor
  store/          zustand: what the visitor has asked for
  controls/       camera framing rules and the orbit / flight controller
  scene/
    helios/         the artifact: Pedestal, CentralAxis, Core, Gyroscope,
                    SolarFins, Regulator, Stabilizer + geometry and materials
    environment/    chamber floor, lighting rig, dust and energy motes
  components/     canvas, post-processing, loading, fallback, HUD
```

Three ideas carry most of the weight:

- **One simulation, read by refs.** `stepSimulation` advances a single mutable state object
  once per frame; components read it inside `useFrame`. React state changes only when the
  visitor changes a control, never per frame.
- **Cause before effect.** Output, ring speed and fin position are damped with different
  time constants, so a mode change reads as core, then rings, then fins. Gear angles are
  derived from one drive angle through real tooth ratios, so the train stays in mesh.
- **Rings on their own shells.** Each ring has a distinct radius, so no tilt or phase can
  make two of them touch.

## Performance tiers

Detected from the device, or pinned with `?tier=high|medium|low`.

| | high | medium | low |
| --- | --- | --- | --- |
| Pixel ratio cap (desktop) | 1.75 | 1.5 | 1.0 |
| Shadows | 2048 | 1024 | off |
| Bloom / tone-mapping pass | yes, 4x MSAA | yes, 2x MSAA | off |
| Floor reflection | yes | no | no |
| Plasma noise octaves | 4 | 3 | 2 |

Phones are capped at a pixel ratio of 1.25 on every tier. A sustained low frame rate steps
the tier down once per session. Geometry and every interaction are identical on all three.

## Checks

```bash
pnpm typecheck
pnpm lint
pnpm test          # sim, kinematics, store, geometry winding, tiers, framing
pnpm qa:visual     # drives a GPU-backed Chrome through the real interface
```

`qa:visual` needs the dev server running (or `--url http://127.0.0.1:5181` for a preview
build) and a local Chrome or Edge. It orbits, zooms, operates every control, runs the phone
and tablet layouts, checks keyboard and touch input, the WebGL fallback and reduced motion,
writes screenshots to `.qa/`, and fails on any console error. Its `stability` scenario
samples 90 consecutive frames and fails if any is black.

## Notes

- **Sound** is intentionally absent. No assets of sufficient quality were available, and a
  synthesised hum would have cheapened the piece.
- The telemetry is in-world instrumentation. `°A` is the atelier's own scale, not kelvin.
- WebGL 2 is required. Without it the page shows a short explanation instead of the scene.
