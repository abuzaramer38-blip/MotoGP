# MotoGP Extreme — Web Racing Simulator

## File Structure

```
motogp-game/
├── index.html          # Entry point
├── style.css           # Full UI stylesheet (carbon fiber HUD, screens)
├── vercel.json         # Vercel static deploy config
└── js/
    ├── utils.js        # Helpers, event bus, procedural textures
    ├── physics.js      # Cannon.js world, bodies, collision
    ├── track.js        # Procedural track builder (road, barriers, stands)
    ├── bike.js         # Player bike mesh + physics controller
    ├── ai.js           # AI rival bikes
    ├── particles.js    # Sparks, smoke, exhaust
    ├── hud.js          # RPM gauge canvas, HUD overlays
    ├── garage.js       # Upgrade & pit stop system
    └── main.js         # Game loop, scene setup, UI wiring
```

## Deploy to Vercel

### Option A — Vercel CLI
```bash
npm i -g vercel
cd motogp-game
vercel
```

### Option B — Vercel Dashboard
1. Zip the entire `motogp-game/` folder
2. Go to vercel.com → New Project → Deploy
3. Drag & drop the zip — it auto-detects `vercel.json` as static

## Controls

| Key | Action |
|-----|--------|
| ↑ / W | Throttle |
| ↓ / S | Brake |
| ← / A | Steer Left (**fixed**) |
| → / D | Steer Right (**fixed**) |
| Space | Nitro Boost |

Mobile: on-screen buttons auto-appear on touch devices.

## Critical Fixes Applied

1. **Steering Bug Fixed** — Left=Left, Right=Right via `input.left`/`input.right` mapped correctly; yaw force is negated to match intuition.
2. **Obstacle Placement Fixed** — `LANE_CLEAR = 5.5` constant enforces a 11m-wide obstacle-free centre lane. Cones/tires only spawn at `|x| > LANE_CLEAR + 0.5`.
3. **Collision Solid** — Cannon.js compound `Box` bodies on the bike match the visible chassis. Barriers use box shapes too. `contactEquationStiffness = 1e9` prevents tunnelling. On collision the bike bounces back and loses speed.
4. **PBR Textures** — All surfaces use `MeshStandardMaterial` with procedurally generated `CanvasTexture` (asphalt grain, rumble stripes, barrier sponsor graphics, grandstand seats, checkered start line). No external CDN required — zero 404 risk.
5. **Damage & Repair** — Health bar deducts on collision, sparks + smoke emit, "Engine Blown" screen at 0%. Garage screen lets you spend race credits on Repair/Engine/Tires/Nitro.
6. **Professional HUD** — Orbitron font, canvas RPM dial with animated needle, speed readout, gear indicator, nitro pips, gradient health bar.

## Architecture Notes

- Physics loop is driven inside `Physics.step(dt)` called once per rAF frame with the frame delta, using Cannon's `world.step(1/60, dt, 3)` fixed-timestep accumulator.
- Three.js and Cannon.js are loaded from cdnjs (r134 and 0.6.2 respectively — stable, proven versions).
- Event bus (`Utils.on/off/emit`) decouples subsystems cleanly.
