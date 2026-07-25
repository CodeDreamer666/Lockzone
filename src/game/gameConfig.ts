export const GAME_CONFIG = {
  player: {
    health: 100,
    forwardSpeed: 7.2,
    strafeSpeed: 6.8,
    backwardSpeed: 6.2,
    groundAcceleration: 40,
    groundDeceleration: 48,
    standingHeight: 1.7,
    cameraFovDegrees: 80,
    jumpInitialVelocity: 6.8,
    gravity: -24,
    airControlMultiplier: 0.3,
    airDeceleration: 10,
    jumpBufferSeconds: 0.14,
  },
  camera: {
    sensitivity: 0.0012,
    minSensitivity: 0.0006,
    maxSensitivity: 0.003,
    verticalLimit: 1.5,
  },
  weapon: {
    magazineSize: 40,
    roundsPerMinute: 600,
    reloadMs: 1800,
    range: 80,
    recoilPerShot: 0.006,
    hipSpread: 0.012,
  },
  regeneration: {
    delayMs: 800,
    healthPerSecond: 20,
  },
  bot: {
    detectionRange: 30,
    fieldOfViewRadians: 1.85,
    firingAngleRadians: 0.18,
    gravity: -24,
    perceptionSeconds: 0.2,
    personalSpace: 2.2,
  },
} as const;

export type EnemyType =
  | "rifle"
  | "armoured"
  | "smg"
  | "heavy-rifle"
  | "shotgun"
  | "boss"
  | "sniper"
  | "elite-sniper";

export type EnemyWeaponType = "rifle" | "smg" | "shotgun" | "sniper";

export interface EnemyWeaponConfig {
  type: EnemyWeaponType;
  damagePerHit: number;
  pellets: number;
  range: number;
  magazineSize: number;
  reloadMs: number;
  roundsPerMinuteMultiplier: number;
}

interface EnemyArchetypeDefinition {
  displayName: string;
  unlockWave: number;
  baseHealth: number;
  healthOffsetFromNormal: number;
  movementMultiplier: number;
  accuracyBonus: number;
  reactionTimeModifier: number;
  preferredDistance: number;
  weapon: EnemyWeaponConfig;
  boss: boolean;
}

export interface EnemyArchetype extends EnemyArchetypeDefinition {
  type: EnemyType;
  health: number;
  movementMultiplier: number;
  accuracy: number;
  reactionSeconds: number;
  roundsPerMinute: number;
}

export interface WaveConfig {
  number: number;
  name: string;
  totalEnemies: number;
  maximumAlive: number;
  maximumShooters: number;
  movementMultiplier: number;
  reactionSeconds: number;
  effectiveAccuracy: number;
  normalHealth: number;
  durabilityTier: number;
  playerRegenerationDelayMs: number;
  roundsPerMinute: number;
  searchSeconds: number;
  searchRadius: number;
  perceptionMultiplier: number;
  aggressionMultiplier: number;
  replacementDelayMs: number;
  flankingEnabled: boolean;
  milestoneNotice?: string;
}

export const ENDLESS_WAVE_CONFIG = {
  initialTotalEnemies: 6,
  enemiesAddedPerWave: 2,
  maximumTotalEnemies: 24,
  maximumActiveEnemies: 6,
  baseMovementMultiplier: 0.85,
  baseAccuracy: 0.28,
  baseReactionSeconds: 1.5,
  baseRoundsPerMinute: 120,
  baseNormalHealth: 100,
  upgradeInterval: 5,
  upgradeCycleWaves: 30,
  movementUpgradeMultiplier: 1.05,
  accuracyUpgrade: 0.02,
  reactionUpgradeSeconds: 0.05,
  fireRateUpgradeMultiplier: 1.05,
  healthUpgrade: 20,
  flankingWave: 30,
  finalEnemyRevealCount: 5,
  safetyCaps: {
    accuracy: 0.85,
    reactionSeconds: 0.25,
    movementMultiplier: 1.4,
    roundsPerMinute: 300,
    normalBulletDamage: 20,
    activeEnemies: 6,
  },
} as const;

export const PLAYER_WEAPON_DAMAGE = {
  "assault-rifle": {
    body: 20,
    head: 60,
  },
} as const;

const ENEMY_ARCHETYPES: Record<EnemyType, EnemyArchetypeDefinition> = {
  rifle: {
    displayName: "Rifle",
    unlockWave: 1,
    baseHealth: 100,
    healthOffsetFromNormal: 0,
    movementMultiplier: 1,
    accuracyBonus: 0,
    reactionTimeModifier: 0,
    preferredDistance: 14,
    weapon: {
      type: "rifle",
      damagePerHit: 10,
      pellets: 1,
      range: 34,
      magazineSize: 24,
      reloadMs: 2_100,
      roundsPerMinuteMultiplier: 1,
    },
    boss: false,
  },
  armoured: {
    displayName: "Armoured Rifle",
    unlockWave: 20,
    baseHealth: 150,
    healthOffsetFromNormal: 50,
    movementMultiplier: 0.88,
    accuracyBonus: 0,
    reactionTimeModifier: 0.08,
    preferredDistance: 14,
    weapon: {
      type: "rifle",
      damagePerHit: 10,
      pellets: 1,
      range: 34,
      magazineSize: 28,
      reloadMs: 2_250,
      roundsPerMinuteMultiplier: 0.9,
    },
    boss: false,
  },
  smg: {
    displayName: "SMG",
    unlockWave: 40,
    baseHealth: 100,
    healthOffsetFromNormal: 0,
    movementMultiplier: 1.15,
    accuracyBonus: -0.03,
    reactionTimeModifier: -0.05,
    preferredDistance: 9,
    weapon: {
      type: "smg",
      damagePerHit: 7,
      pellets: 1,
      range: 24,
      magazineSize: 32,
      reloadMs: 1_700,
      roundsPerMinuteMultiplier: 2,
    },
    boss: false,
  },
  "heavy-rifle": {
    displayName: "Veteran Rifle",
    unlockWave: 50,
    baseHealth: 120,
    healthOffsetFromNormal: 20,
    movementMultiplier: 0.96,
    accuracyBonus: 0.1,
    reactionTimeModifier: -0.1,
    preferredDistance: 17,
    weapon: {
      type: "rifle",
      damagePerHit: 14,
      pellets: 1,
      range: 40,
      magazineSize: 24,
      reloadMs: 2_000,
      roundsPerMinuteMultiplier: 0.92,
    },
    boss: false,
  },
  shotgun: {
    displayName: "Shotgun",
    unlockWave: 60,
    baseHealth: 110,
    healthOffsetFromNormal: 10,
    movementMultiplier: 1.05,
    accuracyBonus: 0.04,
    reactionTimeModifier: -0.05,
    preferredDistance: 7,
    weapon: {
      type: "shotgun",
      damagePerHit: 9,
      pellets: 6,
      range: 18,
      magazineSize: 6,
      reloadMs: 2_600,
      roundsPerMinuteMultiplier: 0.5,
    },
    boss: false,
  },
  boss: {
    displayName: "Boss",
    unlockWave: 70,
    baseHealth: 300,
    healthOffsetFromNormal: 0,
    movementMultiplier: 0.82,
    accuracyBonus: 0.14,
    reactionTimeModifier: -0.2,
    preferredDistance: 18,
    weapon: {
      type: "rifle",
      damagePerHit: 18,
      pellets: 1,
      range: 44,
      magazineSize: 36,
      reloadMs: 1_850,
      roundsPerMinuteMultiplier: 1.15,
    },
    boss: true,
  },
  sniper: {
    displayName: "Sniper",
    unlockWave: 80,
    baseHealth: 120,
    healthOffsetFromNormal: 20,
    movementMultiplier: 0.82,
    accuracyBonus: 0.16,
    reactionTimeModifier: 0.15,
    preferredDistance: 30,
    weapon: {
      type: "sniper",
      damagePerHit: 40,
      pellets: 1,
      range: 64,
      magazineSize: 5,
      reloadMs: 2_900,
      roundsPerMinuteMultiplier: 0.36,
    },
    boss: false,
  },
  "elite-sniper": {
    displayName: "Elite Sniper",
    unlockWave: 80,
    baseHealth: 220,
    healthOffsetFromNormal: 0,
    movementMultiplier: 0.9,
    accuracyBonus: 0.22,
    reactionTimeModifier: -0.15,
    preferredDistance: 34,
    weapon: {
      type: "sniper",
      damagePerHit: 0,
      pellets: 1,
      range: 72,
      magazineSize: 4,
      reloadMs: 3_100,
      roundsPerMinuteMultiplier: 0.3,
    },
    boss: false,
  },
};

const MILESTONE_NOTICES: Record<number, string> = {
  10: "Enemy reinforcement capacity increased",
  20: "Armoured rifle units entered the district",
  30: "Enemy squads learned basic flanking routes",
  40: "Fast SMG units entered the district",
  50: "Veteran rifle units entered the district",
  60: "Close-range shotgun units entered the district",
  70: "Boss unit detected",
  80: "Elite sniper detected",
};

export function createWaveConfig(number: number): WaveConfig {
  const waveNumber = Math.max(1, Math.floor(number));
  const movementUpgrades = countCycleStep(waveNumber, 5);
  const accuracyUpgrades = countCycleStep(waveNumber, 10);
  const reactionUpgrades = countCycleStep(waveNumber, 15);
  const fireRateUpgrades = countCycleStep(waveNumber, 20);
  const healthUpgrades = countCycleStep(waveNumber, 25);
  const durabilityUpgrades = countCycleStep(waveNumber, 30);
  const normalHealth = Math.min(
    Number.MAX_SAFE_INTEGER,
    ENDLESS_WAVE_CONFIG.baseNormalHealth
      + healthUpgrades * ENDLESS_WAVE_CONFIG.healthUpgrade,
  );

  return {
    number: waveNumber,
    name: `Wave ${waveNumber}`,
    totalEnemies: Math.min(
      ENDLESS_WAVE_CONFIG.maximumTotalEnemies,
      ENDLESS_WAVE_CONFIG.initialTotalEnemies
        + (waveNumber - 1) * ENDLESS_WAVE_CONFIG.enemiesAddedPerWave,
    ),
    maximumAlive: waveNumber <= 3
      ? 4
      : waveNumber <= 6
        ? 5
        : ENDLESS_WAVE_CONFIG.maximumActiveEnemies,
    maximumShooters: waveNumber <= 20 ? 2 : waveNumber <= 50 ? 3 : 4,
    movementMultiplier: Math.min(
      ENDLESS_WAVE_CONFIG.safetyCaps.movementMultiplier,
      ENDLESS_WAVE_CONFIG.baseMovementMultiplier
        * ENDLESS_WAVE_CONFIG.movementUpgradeMultiplier ** movementUpgrades,
    ),
    reactionSeconds: Math.max(
      ENDLESS_WAVE_CONFIG.safetyCaps.reactionSeconds,
      ENDLESS_WAVE_CONFIG.baseReactionSeconds
        - reactionUpgrades * ENDLESS_WAVE_CONFIG.reactionUpgradeSeconds,
    ),
    effectiveAccuracy: Math.min(
      ENDLESS_WAVE_CONFIG.safetyCaps.accuracy,
      ENDLESS_WAVE_CONFIG.baseAccuracy
        + accuracyUpgrades * ENDLESS_WAVE_CONFIG.accuracyUpgrade,
    ),
    normalHealth,
    durabilityTier: durabilityUpgrades,
    playerRegenerationDelayMs: GAME_CONFIG.regeneration.delayMs,
    roundsPerMinute: Math.min(
      ENDLESS_WAVE_CONFIG.safetyCaps.roundsPerMinute,
      ENDLESS_WAVE_CONFIG.baseRoundsPerMinute
        * ENDLESS_WAVE_CONFIG.fireRateUpgradeMultiplier ** fireRateUpgrades,
    ),
    searchSeconds: 4,
    searchRadius: 4,
    perceptionMultiplier: 1,
    aggressionMultiplier: 1,
    replacementDelayMs: 650,
    flankingEnabled: waveNumber >= ENDLESS_WAVE_CONFIG.flankingWave,
    milestoneNotice: waveNumber % 10 === 0
      ? MILESTONE_NOTICES[waveNumber]
        ?? "Enemy variants reinforced"
      : undefined,
  };
}

export function getEnemyTypeForSpawn(
  waveNumber: number,
  spawnIndex: number,
): EnemyType {
  const wave = Math.max(1, Math.floor(waveNumber));
  const index = Math.max(0, Math.floor(spawnIndex));

  if (wave >= 80 && wave % 10 === 0 && index === 0) {
    return "elite-sniper";
  }
  if (wave >= 70 && wave % 10 === 0 && index === (wave >= 80 ? 1 : 0)) {
    return "boss";
  }

  const introducedType = milestoneTypeForWave(wave);
  if (introducedType && index === 0) {
    return introducedType;
  }

  const pool: EnemyType[] = ["rifle", "rifle", "rifle", "rifle"];
  if (wave >= 20) pool.push("armoured");
  if (wave >= 40) pool.push("smg", "smg");
  if (wave >= 50) pool.push("heavy-rifle");
  if (wave >= 60) pool.push("shotgun");
  if (wave >= 80) pool.push("sniper");
  return pool[(index + wave) % pool.length];
}

export function createEnemyArchetype(
  type: EnemyType,
  wave: WaveConfig,
): EnemyArchetype {
  const definition = ENEMY_ARCHETYPES[type];
  const isFixedMilestoneHealth = (
    (type === "armoured" && wave.number === 20)
    || (type === "boss" && wave.number === 70)
    || (type === "elite-sniper" && wave.number === 80)
  );
  const scaledHealth = definition.boss
    ? definition.baseHealth + Math.max(0, wave.number - 70) * 2
    : Math.max(
        definition.baseHealth,
        wave.normalHealth + definition.healthOffsetFromNormal,
      );
  const health = Math.min(
    Number.MAX_SAFE_INTEGER,
    isFixedMilestoneHealth ? definition.baseHealth : scaledHealth,
  );

  return {
    ...definition,
    type,
    health,
    movementMultiplier: Math.min(
      ENDLESS_WAVE_CONFIG.safetyCaps.movementMultiplier,
      wave.movementMultiplier * definition.movementMultiplier,
    ),
    accuracy: Math.min(
      ENDLESS_WAVE_CONFIG.safetyCaps.accuracy,
      Math.max(0, wave.effectiveAccuracy + definition.accuracyBonus),
    ),
    reactionSeconds: Math.max(
      ENDLESS_WAVE_CONFIG.safetyCaps.reactionSeconds,
      wave.reactionSeconds + definition.reactionTimeModifier,
    ),
    roundsPerMinute: Math.min(
      ENDLESS_WAVE_CONFIG.safetyCaps.roundsPerMinute,
      wave.roundsPerMinute * definition.weapon.roundsPerMinuteMultiplier,
    ),
  };
}

export function getEliteSniperDamage(maximumPlayerHealth: number) {
  return Math.max(0, maximumPlayerHealth) * 0.95;
}

export function getNormalEnemyDamageMultiplier(
  durabilityTier: number,
) {
  const tier = Math.max(0, Math.floor(durabilityTier));
  return 0.86 ** tier;
}

export function selectAttackerIds(
  candidates: Array<{
    id: number;
    ready: boolean;
    distanceSquared: number;
  }>,
  maximumShooters: number,
) {
  return candidates
    .filter((candidate) => candidate.ready)
    .sort(
      (left, right) => left.distanceSquared - right.distanceSquared,
    )
    .slice(0, Math.max(0, Math.floor(maximumShooters)))
    .map((candidate) => candidate.id);
}

function countCycleStep(waveNumber: number, stepWave: number) {
  if (waveNumber < stepWave) return 0;
  return (
    Math.floor(
      (waveNumber - stepWave) / ENDLESS_WAVE_CONFIG.upgradeCycleWaves,
    )
    + 1
  );
}

function milestoneTypeForWave(waveNumber: number): EnemyType | undefined {
  if (waveNumber === 20) return "armoured";
  if (waveNumber === 40) return "smg";
  if (waveNumber === 50) return "heavy-rifle";
  if (waveNumber === 60) return "shotgun";
  if (waveNumber === 70) return "boss";
  if (waveNumber === 80) return "elite-sniper";
  return undefined;
}

export const WAVE_TRANSITION_SECONDS = 5;
export const OPENING_COUNTDOWN_SECONDS = 3;
