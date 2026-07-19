import {
  GAME_CONFIG,
  WAVE_CONFIGS,
  WAVE_TRANSITION_SECONDS,
} from "../src/game/gameConfig.ts";
import {
  canStartReload,
  consumeMagazineRound,
} from "../src/combat/weaponRules.ts";

const applyDamage = (health, damage) => Math.max(0, health - damage);
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

let playerHealth = GAME_CONFIG.player.health;
for (let hit = 0; hit < 9; hit += 1) {
  playerHealth = applyDamage(playerHealth, GAME_CONFIG.bot.shotDamage);
}
assert(playerHealth === 10, `Expected 10 player health after 9 hits, got ${playerHealth}`);
playerHealth = applyDamage(playerHealth, GAME_CONFIG.bot.shotDamage);
assert(playerHealth === 0, `Expected the 10th hit to kill the player, got ${playerHealth}`);

let bodyShotHealth = GAME_CONFIG.player.health;
for (let shot = 0; shot < 5; shot += 1) {
  bodyShotHealth = applyDamage(bodyShotHealth, GAME_CONFIG.weapon.bodyDamage);
}
assert(bodyShotHealth === 0, `Expected five body shots to kill, got ${bodyShotHealth}`);

let mixedHealth = GAME_CONFIG.player.health;
mixedHealth = applyDamage(mixedHealth, GAME_CONFIG.weapon.headshotDamage);
mixedHealth = applyDamage(mixedHealth, GAME_CONFIG.weapon.bodyDamage);
mixedHealth = applyDamage(mixedHealth, GAME_CONFIG.weapon.bodyDamage);
assert(mixedHealth === 0, `Expected headshot plus two body shots to kill, got ${mixedHealth}`);

let headshotHealth = GAME_CONFIG.player.health;
headshotHealth = applyDamage(headshotHealth, GAME_CONFIG.weapon.headshotDamage);
assert(headshotHealth === 40, `Expected one headshot to leave 40 health, got ${headshotHealth}`);
headshotHealth = applyDamage(headshotHealth, GAME_CONFIG.weapon.headshotDamage);
assert(headshotHealth === 0, `Expected two headshots to kill, got ${headshotHealth}`);

assert(GAME_CONFIG.regeneration.delayMs === 800, "Regeneration delay must be 800 ms");

const expectedWaves = [
  { total: 15, maximumAlive: 3, accuracy: 0.45, reaction: 0.8, movement: 1 },
  { total: 20, maximumAlive: 5, accuracy: 0.65, reaction: 0.6, movement: 1.08 },
  { total: 28, maximumAlive: 7, accuracy: 0.75, reaction: 0.5, movement: 1.14 },
];
WAVE_CONFIGS.forEach((wave, index) => {
  const expected = expectedWaves[index];
  assert(wave.totalEnemies === expected.total, `Wave ${wave.number} total is incorrect`);
  assert(wave.maximumAlive === expected.maximumAlive, `Wave ${wave.number} active limit is incorrect`);
  assert(wave.effectiveAccuracy === expected.accuracy, `Wave ${wave.number} accuracy is incorrect`);
  assert(wave.reactionSeconds === expected.reaction, `Wave ${wave.number} reaction delay is incorrect`);
  assert(wave.movementMultiplier === expected.movement, `Wave ${wave.number} movement multiplier is incorrect`);
  assert(
    wave.replacementDelayMs >= 1000 && wave.replacementDelayMs <= 1500,
    `Wave ${wave.number} replacement delay is outside 1–1.5 seconds`,
  );
});
assert(
  WAVE_CONFIGS[0].roundsPerMinute < WAVE_CONFIGS[1].roundsPerMinute
  && WAVE_CONFIGS[1].roundsPerMinute < WAVE_CONFIGS[2].roundsPerMinute,
  "Enemy firing cadence must increase across waves",
);
assert(
  WAVE_CONFIGS[0].searchSeconds < WAVE_CONFIGS[1].searchSeconds
  && WAVE_CONFIGS[1].searchSeconds < WAVE_CONFIGS[2].searchSeconds,
  "Enemy search persistence must increase across waves",
);
assert(WAVE_TRANSITION_SECONDS === 5, "Wave transition must last 5 seconds");

let magazine = GAME_CONFIG.weapon.magazineSize;
assert(magazine === 40, "The player must start with 40 bullets");
for (let shot = 0; shot < 40; shot += 1) {
  magazine = consumeMagazineRound(magazine);
  assert(magazine === 39 - shot, `Shot ${shot + 1} did not consume exactly one bullet`);
}
assert(consumeMagazineRound(magazine) === 0, "Magazine ammunition must not fall below 0");
assert(canStartReload(magazine, 40, false), "Empty magazine should begin reloading");
assert(!canStartReload(magazine, 40, true), "A second reload must not start");
magazine = 40;
assert(!canStartReload(magazine, 40, false), "A full magazine must not reload");
magazine = consumeMagazineRound(magazine);
assert(canStartReload(magazine, 40, false), "Manual reload should work below 40 bullets");
assert(GAME_CONFIG.weapon.reloadMs === 1800, "Reload duration must be exactly 1.8 seconds");
console.log("Combat balance verification passed.");
