# Lockzone

Lockzone is a first-person browser shooter set in a compact 40 × 40 industrial combat yard. Survive increasingly large enemy waves, fight through shipping-container lanes and a raised command platform, earn coins from eliminations, and improve the current run at the protected safe-zone shop.

## How to play

1. Select **Start Mission** and click the game view when prompted to lock the mouse.
2. Eliminate every enemy in the current wave. Defeated enemies are replaced until the wave roster is empty.
3. Use cover to break enemy line of sight. Solid walls, containers, ramps, and platforms block enemy shots.
4. Earn coins from eliminations, with a bonus for headshot kills, and from completed waves.
5. Enter the marked safe zone in the southwest corner and press `E` to buy upgrades.
6. Continue through endless waves until your health reaches zero.

Completing a wave awards 25 coins and restores the player's health and assault-rifle magazine before the next wave. The safe zone disables player gunfire, prevents enemies from entering, and blocks enemy fire through it.

## Waves and enemies

- Wave 1 starts with 8 total enemies; each later wave adds 4, up to 120 enemies.
- Up to 3 enemies can be alive at once initially. The active limit increases by 1 every three completed waves, up to 12.
- The simultaneous attacker limit is 2 on Waves 1–6, 3 on Waves 7–15, and 4 from Wave 16 onward.
- Rifle enemies appear from Wave 1.
- Armoured Rifle enemies appear from Wave 4.
- SMG enemies appear from Wave 7.
- Shotgun enemies appear from Wave 10.
- Sniper enemies appear from Wave 13.
- A melee Boss appears on Wave 15 and every ten waves afterward.

Enemy types have fixed health, movement, accuracy, range, damage, and coin rewards. Special enemies also have active-count and attacker restrictions. Bots detect and react to the player, navigate container lanes and platform routes, maintain spacing, search after losing sight, and reposition when obstructed. A bot stops moving while it owns an attack slot and cannot shoot until its body and weapon face the player. A fresh line-of-sight check prevents bots from damaging the player through solid geometry.

## Weapons

### Assault Rifle

- 40-round base magazine
- Unlimited reserve ammunition
- 600 rounds per minute
- 20 body damage and 60 headshot damage before upgrades
- Manual reload with `R`
- Hip fire and right-click aiming

### Sniper

- Six available shots
- 200 damage per hit
- Long-range scoped view while aiming
- Automatically begins a 60-second recharge after the sixth shot
- Cannot be manually reloaded; the Assault Rifle remains available during recharge

Use `1` and `2` to switch weapons. Player shots collide with enemies, cover, walkable structures, and pushable props.

## Safe-zone shop

The southwest safe zone contains one Field Upgrade Shop. Press `E` while inside to open or close it.

Available repeatable upgrades:

- `+10%` movement speed
- `+10%` maximum health
- `+10%` Assault Rifle damage
- `+10%` Assault Rifle magazine size

Each upgrade's price increases by 25% after every purchase. Coins and upgrades last only for the current run and reset when a new mission starts. The shop closes automatically if the player leaves the safe zone.

## Other gameplay features

- Player health regeneration after 0.8 seconds without damage
- Separate enemy health, movement, weapons, warnings, and attack cadence by enemy type
- Headshot and body-shot detection
- Restrained blood particles, decals, muzzle flashes, impact feedback, and sound effects
- Pushable small props that react to movement and bullet impacts
- Final-five enemy location and distance indicators, including off-screen directions
- Cleanup of defeated bodies and temporary combat effects between waves
- Dynamic lighting, shadows, bloom, an overcast damp atmosphere, and surface-aware audio
- One raised command platform with two grounded ramp routes

## Controls

- `W`, `A`, `S`, `D` — Move
- `Space` — Jump
- Mouse — Look
- Left click — Fire
- Right click — Aim or use the Sniper scope
- `1` — Equip Assault Rifle
- `2` — Equip Sniper
- `R` — Reload the Assault Rifle
- `E` — Open or close the safe-zone shop
- `Esc` — Close the shop or pause the mission

On localhost, `F3` toggles collision diagnostics and `F7` toggles active-contact diagnostics.

## Run locally

Install dependencies and start the Vite development server:

```bash
npm install
npm run dev
```

Open the local URL printed by Vite. Create a production build with:

```bash
npm run build
```

## Verification

The repository includes focused checks for the implemented gameplay systems:

```bash
npm run verify:movement
npm run verify:jump
npm run verify:props
npm run verify:combat
npm run verify:bot-combat
npm run verify:safe-zones
npm run verify:navigation
npm run verify:sniper
npm run verify:effects
npm run verify:camera-look
npm run verify:shops
npm run build
```
