# HIGO — Anatomy Aim Trainer

An anatomy quiz built on the NEONSHOT aim trainer. In **Scapula** mode a
landmark is named (e.g. *Coracoid process · 오훼돌기*) and five identical
targets appear on a photo of the scapula — one on the real landmark, four on
other landmarks as decoys. Shoot the right one.

- The view stays still; the crosshair follows the mouse cursor (click to shoot,
  `Esc` to end the round). Touch: tap a target.
- The visible circle is exactly the hit area. Clicking off every target is not
  counted; a decoy or a timeout reveals the answer in green.
- Easy: 3 targets, 8 s · Medium: 5 targets, 6 s · Hard: 5 smaller targets, 4 s.
- Bones and landmarks live in `src/anatomy.js` (`BONES`): an image plus
  landmark pixel coordinates in that image.

### 3D Bones — stages (1P or 2P split screen)

Five stages in a row: **scapula → humerus → hand → pelvis → sacrum**. Each
stage asks 8 landmarks on one 3D bone (the hand asks individual carpals,
metacarpals and phalanges). The bone turns to face each landmark and identical
targets appear on the real landmark and on decoy landmarks on the same side
(Easy 3, Medium/Hard 5).

- 1P: get at least 60% of a stage right to move on; otherwise it restarts.
- Shooting a decoy costs points (150 × the difficulty multiplier; the score
  can go below zero) but doesn't end the question — keep shooting until the
  real target is hit or time runs out.
- 2P: the screen splits and both players race on the same question. The first
  to hit the real target scores. Every stage is played once and the totals
  decide the winner.
- P1: mouse aims, click fires, right-drag turns the bone.
- P2: arrow keys aim, Enter (or Space) fires, Shift + arrows turn the bone.
- `Esc` ends the run; `M` (or the speaker button) toggles sound.
- Bones, landmarks and turn directions live in `src/bones.js`; the stage flow
  is in `src/bone3d.js`; synthesized sound effects are in `src/sfx.js`.
- Korean names follow the KMA medical terminology (의학용어집 6th ed.), with
  the Sino-Korean term in parentheses where the KMA lists one.
- The start screen is just **Game Start** plus 1P/2P and difficulty; the older
  FPS and photo scenarios are still in the code but hidden from the menu.
- The 3D models are BodyParts3D (© 2008 DBCLS, CC BY-SA 2.1 JP); see
  `assets/BODYPARTS3D-LICENSE.txt`.

Run locally on Windows with `powershell -File serve.ps1`, then open
http://localhost:8000.

Forked from [LUCASDREYER/aim-trainer-game](https://github.com/LUCASDREYER/aim-trainer-game)
(MIT). The original README follows.

---

# NEONSHOT — FPS Aim Trainer

A first-person, **synthwave** aim trainer that runs entirely in the browser.
Pointer-lock mouse look, raycast shooting from a fixed crosshair, three
scenarios, and **persistent personal bests** — all client-side, no backend.

> Live: https://lucasdreyer.github.io/aim-trainer-game

![Synthwave first-person aim trainer with a retro sun, neon grid, and glowing targets](docs/screenshot.png)

## How it plays

- Press **Enter the Grid** — the browser requests pointer lock, then your mouse
  controls the camera (look around) instead of an OS cursor.
- The crosshair is fixed at screen center; **left-click to fire** a ray.
- Press **Esc** to release the mouse; click again to resume.

### Scenarios

| Mode | Goal |
|---|---|
| **Flick** | One target at a time — snap to it and fire. |
| **Gridshot** | A field of targets; clear them as fast as you can. |
| **Tracking** | Targets drift around; keep your aim glued on. |

## Features

- True first-person 3D (Three.js) with a synthwave grid, retro sun, and neon targets
- Pointer-lock mouse look with adjustable **sensitivity**
- Raycast hit detection from the center crosshair
- FPS-style hitmarker, miss flash, combo streaks, and a weapon viewmodel with recoil
- **Persistent stats & personal bests** per scenario × difficulty (localStorage)
- Stats & Records panel with PB table and recent-run history
- Settings (scenario, difficulty, sensitivity) persist between sessions
- **Zero runtime dependencies** — Three.js is vendored into the repo, so the
  site is fully self-contained and works on any static host (and offline)

## Architecture

Plain ES modules — no build step, no framework.

```
index.html            # markup, import map, CRT/HUD/menu shells
style.css             # synthwave design system (CSS custom properties)
vendor/
  three.module.min.js # vendored Three.js (no external CDN at runtime)
src/
  config.js           # scenarios, difficulty tuning, palette, play volume
  storage.js          # localStorage persistence (settings, bests, history)
  scene.js            # renderer, camera, sky/grid/sun, weapon viewmodel
  targets.js          # target spawn/lifecycle/animation + hit resolution
  ui.js               # all DOM: HUD, menu, results, stats modal, feedback
  main.js             # state machine, input, scoring, game loop (entry point)
```

## Running locally

Because it uses native ES modules, open it through a local web server (not the
`file://` protocol):

```bash
git clone https://github.com/LUCASDREYER/aim-trainer-game.git
cd aim-trainer-game
python3 -m http.server 8000
# then visit http://localhost:8000
```

## Deploy (GitHub Pages)

It's a static site, so push to `main` and serve from the repo root
(**Settings → Pages → Deploy from branch → `main` / root**). A `.nojekyll`
file is included so Pages serves the files as-is without Jekyll processing.

## Scoring

| Factor | Effect |
|---|---|
| Reaction time | Faster hits = more points |
| Difficulty | Easy 1×, Medium 1.5×, Hard 2× multiplier |

## License

MIT. Three.js is © its authors, also MIT (see `vendor/THREE.LICENSE`).
