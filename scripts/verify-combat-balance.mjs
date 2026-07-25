import assert from "node:assert/strict";
import {
  ENDLESS_WAVE_CONFIG,
  PLAYER_WEAPON_DAMAGE,
  createEnemyArchetype,
  createWaveConfig,
  getEliteSniperDamage,
  getEnemyTypeForSpawn,
  getNormalEnemyDamageMultiplier,
  selectAttackerIds,
  WAVE_TRANSITION_SECONDS,
} from "../src/game/gameConfig.ts";
import {
  canStartReload,
  consumeMagazineRound,
} from "../src/combat/weaponRules.ts";

const assertClose = (actual, expected) => {
  assert.ok(Math.abs(actual - expected) < 1e-9);
};

const wave1 = createWaveConfig(1);
assert.equal(wave1.totalEnemies, 6);
assert.equal(wave1.maximumAlive, 4);
assert.equal(wave1.maximumShooters, 2);
assert.equal(wave1.normalHealth, 100);
assert.equal(wave1.effectiveAccuracy, 0.28);
assert.equal(wave1.reactionSeconds, 1.5);
assert.equal(wave1.movementMultiplier, 0.85);
assert.equal(wave1.roundsPerMinute, 120);
assert.equal(wave1.flankingEnabled, false);

for (const waveNumber of [1, 2, 3, 4, 7, 10, 35, 80, 250]) {
  const wave = createWaveConfig(waveNumber);
  assert.equal(
    wave.totalEnemies,
    Math.min(24, 6 + (waveNumber - 1) * 2),
    `Wave ${waveNumber} follows the 6, +2, maximum 24 curve`,
  );
  assert.ok(wave.maximumAlive <= wave.totalEnemies);
}

assert.equal(createWaveConfig(3).maximumAlive, 4);
assert.equal(createWaveConfig(4).maximumAlive, 5);
assert.equal(createWaveConfig(6).maximumAlive, 5);
assert.equal(createWaveConfig(7).maximumAlive, 6);
assert.equal(createWaveConfig(500).maximumAlive, 6);
assert.equal(createWaveConfig(10).totalEnemies, 24);
assert.equal(createWaveConfig(500).totalEnemies, 24);
assert.equal(createWaveConfig(20).maximumShooters, 2);
assert.equal(createWaveConfig(21).maximumShooters, 3);
assert.equal(createWaveConfig(50).maximumShooters, 3);
assert.equal(createWaveConfig(51).maximumShooters, 4);
assert.deepEqual(
  selectAttackerIds(
    [
      { id: 1, ready: true, distanceSquared: 25 },
      { id: 2, ready: true, distanceSquared: 9 },
      { id: 3, ready: false, distanceSquared: 4 },
      { id: 4, ready: true, distanceSquared: 16 },
    ],
    2,
  ),
  [2, 4],
  "only the nearest ready bots receive the limited attack slots",
);

assert.equal(createWaveConfig(5).movementMultiplier, 0.85 * 1.05);
assertClose(createWaveConfig(10).effectiveAccuracy, 0.3);
assert.equal(createWaveConfig(15).reactionSeconds, 1.45);
assert.equal(createWaveConfig(20).roundsPerMinute, 126);
assert.equal(createWaveConfig(25).normalHealth, 120);
assert.equal(createWaveConfig(30).durabilityTier, 1);
assert.equal(createWaveConfig(35).movementMultiplier, 0.85 * 1.05 ** 2);
assertClose(createWaveConfig(40).effectiveAccuracy, 0.32);
assert.equal(createWaveConfig(45).reactionSeconds, 1.4);
assert.equal(createWaveConfig(50).roundsPerMinute, 120 * 1.05 ** 2);
assert.equal(createWaveConfig(55).normalHealth, 140);
assert.equal(createWaveConfig(60).durabilityTier, 2);
assert.equal(createWaveConfig(115).normalHealth, 180);
assert.equal(createWaveConfig(150).durabilityTier, 5);
assert.equal(createWaveConfig(29).flankingEnabled, false);
assert.equal(createWaveConfig(30).flankingEnabled, true);

const distantWave = createWaveConfig(10_000);
assert.ok(
  distantWave.effectiveAccuracy
    <= ENDLESS_WAVE_CONFIG.safetyCaps.accuracy,
);
assert.ok(
  distantWave.reactionSeconds
    >= ENDLESS_WAVE_CONFIG.safetyCaps.reactionSeconds,
);
assert.ok(
  distantWave.movementMultiplier
    <= ENDLESS_WAVE_CONFIG.safetyCaps.movementMultiplier,
);
assert.ok(
  distantWave.roundsPerMinute
    <= ENDLESS_WAVE_CONFIG.safetyCaps.roundsPerMinute,
);
assert.ok(
  distantWave.maximumAlive
    <= ENDLESS_WAVE_CONFIG.safetyCaps.activeEnemies,
);

const armoured = createEnemyArchetype(
  "armoured",
  createWaveConfig(20),
);
assert.equal(armoured.health, 150);
const shotgun = createEnemyArchetype(
  "shotgun",
  createWaveConfig(60),
);
assert.equal(shotgun.weapon.pellets, 6);
assert.equal(shotgun.weapon.damagePerHit, 9);
assert.equal(shotgun.weapon.pellets * shotgun.weapon.damagePerHit, 54);
const boss = createEnemyArchetype("boss", createWaveConfig(70));
assert.equal(boss.health, 300);
assert.equal(boss.weapon.damagePerHit, 18);
const sniper = createEnemyArchetype("sniper", createWaveConfig(80));
assert.equal(sniper.weapon.damagePerHit, 40);
const eliteSniper = createEnemyArchetype(
  "elite-sniper",
  createWaveConfig(80),
);
assert.equal(eliteSniper.health, 220);
assert.equal(getEliteSniperDamage(100), 95);
assert.equal(getEliteSniperDamage(250), 237.5);
assert.ok(getEliteSniperDamage(250) < 250);

assert.equal(getEnemyTypeForSpawn(20, 0), "armoured");
assert.equal(getEnemyTypeForSpawn(40, 0), "smg");
assert.equal(getEnemyTypeForSpawn(50, 0), "heavy-rifle");
assert.equal(getEnemyTypeForSpawn(60, 0), "shotgun");
assert.equal(getEnemyTypeForSpawn(70, 0), "boss");
assert.equal(getEnemyTypeForSpawn(80, 0), "elite-sniper");
assert.equal(getEnemyTypeForSpawn(80, 1), "boss");

assert.equal(PLAYER_WEAPON_DAMAGE["assault-rifle"].body, 20);
assert.equal(PLAYER_WEAPON_DAMAGE["assault-rifle"].head, 60);

const healthBeforeDurability = createWaveConfig(25).normalHealth;
const healthAtDurability = createWaveConfig(30).normalHealth;
const durabilityTier = createWaveConfig(30).durabilityTier;
const assaultHitsBefore = Math.ceil(
  healthBeforeDurability / PLAYER_WEAPON_DAMAGE["assault-rifle"].body,
);
const assaultHitsAfter = Math.ceil(
  healthAtDurability
    / (
      PLAYER_WEAPON_DAMAGE["assault-rifle"].body
      * getNormalEnemyDamageMultiplier(durabilityTier)
    ),
);
assert.equal(assaultHitsAfter, assaultHitsBefore + 1);

let magazine = 40;
for (let shotIndex = 0; shotIndex < 40; shotIndex += 1) {
  magazine = consumeMagazineRound(magazine);
  assert.equal(magazine, 39 - shotIndex);
}
assert.equal(consumeMagazineRound(magazine), 0);
assert.equal(canStartReload(magazine, 40, false), true);
assert.equal(canStartReload(magazine, 40, true), false);
assert.equal(canStartReload(40, 40, false), false);
assert.equal(WAVE_TRANSITION_SECONDS, 5);

console.log("Endless combat balance verification passed.");
