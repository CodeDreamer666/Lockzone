import assert from "node:assert/strict";
import {
  ATTACKER_LIMITS,
  ENDLESS_WAVE_CONFIG,
  ENEMY_ARCHETYPES,
  PLAYER_WEAPON_DAMAGE,
  countEnemyTypes,
  createEnemyArchetype,
  createWaveConfig,
  enemyDamageAtDistance,
  isBossWave,
  selectAttackerIds,
  WAVE_TRANSITION_SECONDS,
} from "../src/game/gameConfig.ts";
import {
  canStartReload,
  consumeMagazineRound,
} from "../src/combat/weaponRules.ts";

for (const waveNumber of [1, 2, 3, 4, 7, 10, 29, 80, 250]) {
  const wave = createWaveConfig(waveNumber);
  assert.equal(
    wave.totalEnemies,
    Math.min(120, 8 + (waveNumber - 1) * 4),
    `Wave ${waveNumber} follows the 8, +4, maximum 120 curve`,
  );
  assert.equal(
    wave.maximumAlive,
    Math.min(12, 3 + Math.floor((waveNumber - 1) / 3)),
    `Wave ${waveNumber} follows the 3, +1 every three waves, maximum 12 curve`,
  );
  assert.equal(wave.enemyRoster.length, wave.totalEnemies);
}

assert.equal(createWaveConfig(1).maximumAlive, 3);
assert.equal(createWaveConfig(3).maximumAlive, 3);
assert.equal(createWaveConfig(4).maximumAlive, 4);
assert.equal(createWaveConfig(6).maximumAlive, 4);
assert.equal(createWaveConfig(7).maximumAlive, 5);
assert.equal(createWaveConfig(10).maximumAlive, 6);
assert.equal(createWaveConfig(28).maximumAlive, 12);
assert.equal(createWaveConfig(500).maximumAlive, 12);
assert.equal(createWaveConfig(29).totalEnemies, 120);
assert.equal(createWaveConfig(500).totalEnemies, 120);
assert.equal(createWaveConfig(1).replacementDelayMs, 1_000);

assert.equal(createWaveConfig(1).maximumShooters, 2);
assert.equal(createWaveConfig(6).maximumShooters, 2);
assert.equal(createWaveConfig(7).maximumShooters, 3);
assert.equal(createWaveConfig(15).maximumShooters, 3);
assert.equal(createWaveConfig(16).maximumShooters, 4);
assert.deepEqual(
  ATTACKER_LIMITS.map((limit) => limit.maximumShooters),
  [2, 3, 4],
);

assert.deepEqual(
  countEnemyTypes(createWaveConfig(1).enemyRoster),
  {
    normal: 8,
    armoured: 0,
    smg: 0,
    shotgun: 0,
    sniper: 0,
    boss: 0,
  },
);
assert.deepEqual(
  countEnemyTypes(createWaveConfig(4).enemyRoster),
  {
    normal: 15,
    armoured: 5,
    smg: 0,
    shotgun: 0,
    sniper: 0,
    boss: 0,
  },
);
assert.deepEqual(
  countEnemyTypes(createWaveConfig(7).enemyRoster),
  {
    normal: 19,
    armoured: 7,
    smg: 6,
    shotgun: 0,
    sniper: 0,
    boss: 0,
  },
);
assert.deepEqual(
  countEnemyTypes(createWaveConfig(10).enemyRoster),
  {
    normal: 22,
    armoured: 9,
    smg: 9,
    shotgun: 4,
    sniper: 0,
    boss: 0,
  },
);
assert.deepEqual(
  countEnemyTypes(createWaveConfig(13).enemyRoster),
  {
    normal: 25,
    armoured: 11,
    smg: 11,
    shotgun: 6,
    sniper: 3,
    boss: 0,
  },
);
assert.deepEqual(
  countEnemyTypes(createWaveConfig(15).enemyRoster),
  {
    normal: 28,
    armoured: 13,
    smg: 13,
    shotgun: 6,
    sniper: 3,
    boss: 1,
  },
  "the boss replaces one normal enemy without increasing the wave total",
);
for (const [waveNumber, introducedType] of [
  [4, "armoured"],
  [7, "smg"],
  [10, "shotgun"],
  [13, "sniper"],
  [15, "boss"],
]) {
  const wave = createWaveConfig(waveNumber);
  assert.equal(
    wave.enemyRoster
      .slice(0, wave.maximumAlive)
      .includes(introducedType),
    true,
    `${introducedType} appears in the active opening group on Wave ${waveNumber}`,
  );
}
for (const waveNumber of [15, 25, 35, 45, 55]) {
  assert.equal(isBossWave(waveNumber), true);
  assert.equal(
    countEnemyTypes(createWaveConfig(waveNumber).enemyRoster).boss,
    1,
  );
}
for (const waveNumber of [1, 14, 16, 24, 26]) {
  assert.equal(isBossWave(waveNumber), false);
}

assert.equal(createWaveConfig(18).maximumActiveByType.shotgun, 1);
assert.equal(createWaveConfig(19).maximumActiveByType.shotgun, 2);
assert.equal(createWaveConfig(500).maximumActiveByType.shotgun, 2);
assert.equal(createWaveConfig(500).maximumActiveByType.sniper, 1);
assert.equal(createWaveConfig(500).maximumActiveByType.boss, 1);

assert.deepEqual(
  selectAttackerIds(
    [
      {
        id: 1,
        ready: true,
        distanceSquared: 25,
        enemyType: "normal",
      },
      {
        id: 2,
        ready: true,
        distanceSquared: 9,
        enemyType: "smg",
      },
      {
        id: 3,
        ready: false,
        distanceSquared: 4,
        enemyType: "shotgun",
      },
      {
        id: 4,
        ready: true,
        distanceSquared: 16,
        enemyType: "armoured",
      },
    ],
    2,
  ),
  [2, 4],
  "only the nearest ready bots receive attack slots",
);
assert.deepEqual(
  selectAttackerIds(
    [
      {
        id: 1,
        ready: true,
        distanceSquared: 4,
        enemyType: "boss",
      },
      {
        id: 2,
        ready: true,
        distanceSquared: 9,
        enemyType: "sniper",
      },
      {
        id: 3,
        ready: true,
        distanceSquared: 16,
        enemyType: "normal",
      },
    ],
    3,
  ),
  [1, 3],
  "boss and sniper bots never receive attack slots together",
);

const expectedStats = {
  normal: {
    health: 100,
    movementMultiplier: 1,
    reactionSeconds: 0.8,
    accuracy: 0.65,
    damage: 12.5,
    roundsPerMinute: 120,
    reward: 10,
  },
  armoured: {
    health: 200,
    movementMultiplier: 0.6,
    reactionSeconds: 0.8,
    accuracy: 0.65,
    damage: 12.5,
    roundsPerMinute: 120,
    reward: 20,
  },
  smg: {
    health: 100,
    movementMultiplier: 1,
    reactionSeconds: 0.8,
    accuracy: 0.7,
    damage: 10,
    roundsPerMinute: 450,
    reward: 12,
  },
  shotgun: {
    health: 150,
    movementMultiplier: 1.2,
    reactionSeconds: 0.6,
    accuracy: 0.75,
    damage: 50,
    roundsPerMinute: 15,
    reward: 20,
  },
  sniper: {
    health: 50,
    movementMultiplier: 1.1,
    reactionSeconds: 0.5,
    accuracy: 0.9,
    damage: 95,
    roundsPerMinute: 10,
    reward: 25,
  },
  boss: {
    health: 300,
    movementMultiplier: 1.5,
    reactionSeconds: 0.3,
    accuracy: 0.85,
    damage: 65,
    roundsPerMinute: 20,
    reward: 100,
  },
};

for (const [enemyType, expected] of Object.entries(expectedStats)) {
  const enemy = createEnemyArchetype(enemyType);
  assert.equal(enemy.health, expected.health);
  assert.equal(enemy.movementMultiplier, expected.movementMultiplier);
  assert.equal(enemy.reactionSeconds, expected.reactionSeconds);
  assert.equal(enemy.accuracy, expected.accuracy);
  assert.equal(enemy.roundsPerMinute, expected.roundsPerMinute);
  assert.equal(enemy.coinReward, expected.reward);
  assert.equal(
    enemyDamageAtDistance(enemy, 100, enemy.weapon.damageFalloffStart),
    expected.damage,
  );
  assert.deepEqual(enemy, ENEMY_ARCHETYPES[enemyType]);
}

assert.ok(
  Math.abs(
    enemyDamageAtDistance(
      createEnemyArchetype("shotgun"),
      100,
      7.5,
    ) - 10,
  ) < 0.000_001,
  "shotgun damage falls to 20% at maximum range",
);
assert.equal(
  enemyDamageAtDistance(createEnemyArchetype("sniper"), 200, 30),
  190,
  "sniper damage tracks current maximum health without wave scaling",
);
assert.deepEqual(
  createEnemyArchetype("normal"),
  createEnemyArchetype("normal"),
  "enemy stats remain fixed between waves",
);

assert.deepEqual(
  Object.keys(ENDLESS_WAVE_CONFIG).sort(),
  [
    "bossFirstWave",
    "bossWaveInterval",
    "completedWavesPerActiveIncrease",
    "enemiesAddedPerWave",
    "initialActiveEnemies",
    "initialTotalEnemies",
    "maximumActiveEnemies",
    "maximumTotalEnemies",
    "replacementDelayMs",
  ],
);

assert.equal(PLAYER_WEAPON_DAMAGE["assault-rifle"].body, 20);
assert.equal(PLAYER_WEAPON_DAMAGE["assault-rifle"].head, 60);

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

console.log(
  "Endless population, enemy variety, fixed stats, and attack restrictions passed.",
);
