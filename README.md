# Lockdown-Sector

Lockdown-Sector is a first-person browser shooter set in a compact 40 × 40 industrial combat yard. Survive endless mixed-enemy waves, fight through shipping-container lanes and one organised command platform, aim for headshots, and improve your run at the safe-zone shop.

## Features

- Endless waves that begin with 8 enemies, add 4 per wave, and cap at 120
- Active-enemy limits that begin at 3, add 1 every three waves, and cap at 12
- Fixed-stat Rifle, Armoured, SMG, Shotgun, and Sniper enemies introduced across Waves 1–13
- A fast melee Boss on Wave 15 and every ten waves afterward
- Two, three, or four simultaneous attacker slots based on the current wave, with additional Sniper, Boss, and Shotgun restrictions
- First-person movement, jumping, aiming, scoped sniper view, and mouse-look controls
- A repeatable-upgrade assault rifle plus a separate six-shot, 200-damage sniper with a 60-second recharge
- Headshot and body-shot combat with enemy health, player regeneration, restrained blood feedback, and pooled wave cleanup
- Unlimited reserve ammunition with a 40-round magazine and manual reloads
- One protected corner shop with repeatable speed, health, rifle-damage, and magazine upgrades
- Dense solid container, barrier, short-wall, and crate cover
- One raised command platform with two realistic ramp routes
- Range-aware bots that detect, react, aim, attack, reload, search, reposition, use cover, maintain separation, and navigate the arena
- Live location markers for the final five enemies and controlled body/effect cleanup between waves
- Dynamic lighting, shadows, bloom, and sound effects

## Run locally

Install dependencies, then start the Vite development server:

```bash
npm install
npm run dev
```

Open the local URL printed by Vite in a browser.

## Controls

- `W`, `A`, `S`, `D` — Move
- `Space` — Jump
- Mouse — Look
- Left click — Fire
- Right click — Aim
- `1` — Equip Assault Rifle
- `2` — Equip Sniper
- `R` — Reload
- `E` — Open or close the safe-zone shop
- `Esc` — Pause
