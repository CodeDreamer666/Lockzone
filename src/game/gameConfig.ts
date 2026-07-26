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
    detectionRange: 42,
    gravity: -24,
    perceptionSeconds: 0.2,
    personalSpace: 2.2,
  },
} as const;

export type EnemyType =
  | "normal"
  | "armoured"
  | "smg"
  | "shotgun"
  | "sniper"
  | "boss";

export type EnemyAttackKind =
  | "rifle"
  | "smg"
  | "shotgun"
  | "sniper"
  | "melee";

export interface EnemyWeaponConfig {
  kind: EnemyAttackKind;
  damagePerHit: number;
  maximumHealthDamageFraction: number;
  range: number;
  minimumRange: number;
  damageFalloffStart: number;
  magazineSize: number;
  reloadMs: number;
  cooldownMs?: readonly [minimum: number, maximum: number];
  warningMs?: number;
}

export interface EnemyArchetype {
  type: EnemyType;
  displayName: string;
  role: string;
  health: number;
  movementMultiplier: number;
  accuracy: number;
  reactionSeconds: number;
  preferredDistance: number;
  roundsPerMinute: number;
  coinReward: number;
  collision: {
    height: number;
    radius: number;
  };
  weapon: EnemyWeaponConfig;
}

export interface WaveConfig {
  number: number;
  name: string;
  totalEnemies: number;
  maximumAlive: number;
  maximumShooters: number;
  enemyRoster: EnemyType[];
  maximumActiveByType: Record<EnemyType, number>;
  playerRegenerationDelayMs: number;
  searchSeconds: number;
  searchRadius: number;
  perceptionMultiplier: number;
  replacementDelayMs: number;
}

export const ENDLESS_WAVE_CONFIG = {
  initialTotalEnemies: 8,
  enemiesAddedPerWave: 4,
  maximumTotalEnemies: 120,
  initialActiveEnemies: 3,
  completedWavesPerActiveIncrease: 3,
  maximumActiveEnemies: 12,
  replacementDelayMs: 1_000,
  bossFirstWave: 15,
  bossWaveInterval: 10,
} as const;

export const ATTACKER_LIMITS = [
  {
    firstWave: 1,
    lastWave: 6,
    maximumShooters: 2,
  },
  {
    firstWave: 7,
    lastWave: 15,
    maximumShooters: 3,
  },
  {
    firstWave: 16,
    lastWave: Infinity,
    maximumShooters: 4,
  },
] as const;

export const ENEMY_INTRODUCTION = [
  {
    firstWave: 1,
    lastWave: 3,
    weights: {
      normal: 1,
      armoured: 0,
      smg: 0,
      shotgun: 0,
      sniper: 0,
    },
  },
  {
    firstWave: 4,
    lastWave: 6,
    weights: {
      normal: 0.75,
      armoured: 0.25,
      smg: 0,
      shotgun: 0,
      sniper: 0,
    },
  },
  {
    firstWave: 7,
    lastWave: 9,
    weights: {
      normal: 0.6,
      armoured: 0.2,
      smg: 0.2,
      shotgun: 0,
      sniper: 0,
    },
  },
  {
    firstWave: 10,
    lastWave: 12,
    weights: {
      normal: 0.5,
      armoured: 0.2,
      smg: 0.2,
      shotgun: 0.1,
      sniper: 0,
    },
  },
  {
    firstWave: 13,
    lastWave: Infinity,
    weights: {
      normal: 0.45,
      armoured: 0.2,
      smg: 0.2,
      shotgun: 0.1,
      sniper: 0.05,
    },
  },
] as const;

export const ENEMY_ARCHETYPES: Record<EnemyType, EnemyArchetype> = {
  normal: {
    type: "normal",
    displayName: "Rifle",
    role: "Balanced standard enemy",
    health: 100,
    movementMultiplier: 1,
    accuracy: 0.65,
    reactionSeconds: 0.8,
    preferredDistance: 14,
    roundsPerMinute: 120,
    coinReward: 10,
    collision: {
      height: 2.6,
      radius: 0.42,
    },
    weapon: {
      kind: "rifle",
      damagePerHit: 12.5,
      maximumHealthDamageFraction: 0,
      range: 36,
      minimumRange: 0,
      damageFalloffStart: 36,
      magazineSize: 24,
      reloadMs: 2_100,
    },
  },
  armoured: {
    type: "armoured",
    displayName: "Armoured Rifle",
    role: "Slow tank enemy",
    health: 200,
    movementMultiplier: 0.6,
    accuracy: 0.65,
    reactionSeconds: 0.8,
    preferredDistance: 14,
    roundsPerMinute: 120,
    coinReward: 20,
    collision: {
      height: 2.8,
      radius: 0.5,
    },
    weapon: {
      kind: "rifle",
      damagePerHit: 12.5,
      maximumHealthDamageFraction: 0,
      range: 36,
      minimumRange: 0,
      damageFalloffStart: 36,
      magazineSize: 30,
      reloadMs: 2_400,
    },
  },
  smg: {
    type: "smg",
    displayName: "SMG",
    role: "Rapid-fire pressure enemy",
    health: 100,
    movementMultiplier: 1,
    accuracy: 0.7,
    reactionSeconds: 0.8,
    preferredDistance: 11,
    roundsPerMinute: 450,
    coinReward: 12,
    collision: {
      height: 2.5,
      radius: 0.39,
    },
    weapon: {
      kind: "smg",
      damagePerHit: 10,
      maximumHealthDamageFraction: 0,
      range: 30,
      minimumRange: 0,
      damageFalloffStart: 30,
      magazineSize: 32,
      reloadMs: 1_800,
    },
  },
  shotgun: {
    type: "shotgun",
    displayName: "Shotgun",
    role: "Aggressive close-range enemy",
    health: 150,
    movementMultiplier: 1.2,
    accuracy: 0.75,
    reactionSeconds: 0.6,
    preferredDistance: 4.5,
    roundsPerMinute: 15,
    coinReward: 20,
    collision: {
      height: 2.7,
      radius: 0.47,
    },
    weapon: {
      kind: "shotgun",
      damagePerHit: 0,
      maximumHealthDamageFraction: 0.5,
      range: 7.5,
      minimumRange: 0,
      damageFalloffStart: 4,
      magazineSize: 5,
      reloadMs: 2_700,
      cooldownMs: [4_000, 6_000],
    },
  },
  sniper: {
    type: "sniper",
    displayName: "Sniper",
    role: "Fragile long-range threat",
    health: 50,
    movementMultiplier: 1.1,
    accuracy: 0.9,
    reactionSeconds: 0.5,
    preferredDistance: 28,
    roundsPerMinute: 10,
    coinReward: 25,
    collision: {
      height: 2.5,
      radius: 0.38,
    },
    weapon: {
      kind: "sniper",
      damagePerHit: 0,
      maximumHealthDamageFraction: 0.95,
      range: 46,
      minimumRange: 12,
      damageFalloffStart: 46,
      magazineSize: 5,
      reloadMs: 3_200,
      cooldownMs: [6_000, 8_000],
      warningMs: 850,
    },
  },
  boss: {
    type: "boss",
    displayName: "Boss",
    role: "Fast melee boss",
    health: 300,
    movementMultiplier: 1.5,
    accuracy: 0.85,
    reactionSeconds: 0.3,
    preferredDistance: 1.45,
    roundsPerMinute: 20,
    coinReward: 100,
    collision: {
      height: 3.5,
      radius: 0.62,
    },
    weapon: {
      kind: "melee",
      damagePerHit: 0,
      maximumHealthDamageFraction: 0.65,
      range: 2.25,
      minimumRange: 0,
      damageFalloffStart: 2.25,
      magazineSize: 1,
      reloadMs: 1,
      cooldownMs: [2_000, 4_000],
    },
  },
};

export const PLAYER_WEAPON_DAMAGE = {
  "assault-rifle": {
    body: 20,
    head: 60,
  },
} as const;

export function createWaveConfig(number: number): WaveConfig {
  const waveNumber = Math.max(1, Math.floor(number));
  const totalEnemies = Math.min(
    ENDLESS_WAVE_CONFIG.maximumTotalEnemies,
    ENDLESS_WAVE_CONFIG.initialTotalEnemies
      + (waveNumber - 1) * ENDLESS_WAVE_CONFIG.enemiesAddedPerWave,
  );
  const maximumAlive = Math.min(
    ENDLESS_WAVE_CONFIG.maximumActiveEnemies,
    ENDLESS_WAVE_CONFIG.initialActiveEnemies
      + Math.floor(
        (waveNumber - 1)
          / ENDLESS_WAVE_CONFIG.completedWavesPerActiveIncrease,
      ),
  );
  const attackerLimit = ATTACKER_LIMITS.find(
    (limit) => (
      waveNumber >= limit.firstWave
      && waveNumber <= limit.lastWave
    ),
  )!;

  return {
    number: waveNumber,
    name: `Wave ${waveNumber}`,
    totalEnemies,
    maximumAlive,
    maximumShooters: attackerLimit.maximumShooters,
    enemyRoster: createWaveEnemyRoster(waveNumber, totalEnemies),
    maximumActiveByType: {
      normal: maximumAlive,
      armoured: maximumAlive,
      smg: maximumAlive,
      shotgun: waveNumber >= 19 ? 2 : 1,
      sniper: 1,
      boss: 1,
    },
    playerRegenerationDelayMs: GAME_CONFIG.regeneration.delayMs,
    searchSeconds: 4,
    searchRadius: 4,
    perceptionMultiplier: 1,
    replacementDelayMs: ENDLESS_WAVE_CONFIG.replacementDelayMs,
  };
}

export function createEnemyArchetype(
  type: EnemyType = "normal",
): EnemyArchetype {
  const archetype = ENEMY_ARCHETYPES[type];
  return {
    ...archetype,
    collision: {
      ...archetype.collision,
    },
    weapon: {
      ...archetype.weapon,
    },
  };
}

export function isBossWave(waveNumber: number) {
  return (
    waveNumber >= ENDLESS_WAVE_CONFIG.bossFirstWave
    && (
      waveNumber - ENDLESS_WAVE_CONFIG.bossFirstWave
    ) % ENDLESS_WAVE_CONFIG.bossWaveInterval === 0
  );
}

export function countEnemyTypes(enemyTypes: readonly EnemyType[]) {
  const counts: Record<EnemyType, number> = {
    normal: 0,
    armoured: 0,
    smg: 0,
    shotgun: 0,
    sniper: 0,
    boss: 0,
  };
  for (const enemyType of enemyTypes) {
    counts[enemyType] += 1;
  }
  return counts;
}

export function selectAttackerIds(
  candidates: Array<{
    id: number;
    ready: boolean;
    distanceSquared: number;
    enemyType: EnemyType;
  }>,
  maximumShooters: number,
) {
  const selected: typeof candidates = [];
  const ordered = candidates
    .filter((candidate) => candidate.ready)
    .sort(
      (left, right) => left.distanceSquared - right.distanceSquared,
    );

  for (const candidate of ordered) {
    if (selected.length >= Math.max(0, Math.floor(maximumShooters))) {
      break;
    }
    const conflictsWithSpecialAttacker = (
      (
        candidate.enemyType === "boss"
        && selected.some(({ enemyType }) => enemyType === "sniper")
      )
      || (
        candidate.enemyType === "sniper"
        && selected.some(({ enemyType }) => enemyType === "boss")
      )
    );
    if (!conflictsWithSpecialAttacker) {
      selected.push(candidate);
    }
  }

  return selected.map((candidate) => candidate.id);
}

export function enemyDamageAtDistance(
  archetype: EnemyArchetype,
  playerMaximumHealth: number,
  distance: number,
) {
  const baseDamage = archetype.weapon.maximumHealthDamageFraction > 0
    ? Math.max(0, playerMaximumHealth)
      * archetype.weapon.maximumHealthDamageFraction
    : archetype.weapon.damagePerHit;
  if (
    archetype.weapon.kind !== "shotgun"
    || distance <= archetype.weapon.damageFalloffStart
  ) {
    return baseDamage;
  }
  const falloffSpan = Math.max(
    0.001,
    archetype.weapon.range - archetype.weapon.damageFalloffStart,
  );
  const progress = Math.min(
    1,
    (distance - archetype.weapon.damageFalloffStart) / falloffSpan,
  );
  return baseDamage * (1 - progress * 0.8);
}

function createWaveEnemyRoster(
  waveNumber: number,
  totalEnemies: number,
) {
  const phase = ENEMY_INTRODUCTION.find(
    (entry) => (
      waveNumber >= entry.firstWave
      && waveNumber <= entry.lastWave
    ),
  )!;
  const weightedTypes = (
    Object.entries(phase.weights) as Array<
      [Exclude<EnemyType, "boss">, number]
    >
  ).filter(([, weight]) => weight > 0);
  const allocations: Array<{
    type: EnemyType;
    order: number;
    count: number;
    remainder: number;
  }> = weightedTypes.map(([type, weight], order) => {
    const exact = totalEnemies * weight;
    return {
      type,
      order,
      count: Math.floor(exact),
      remainder: exact - Math.floor(exact),
    };
  });
  let allocated = allocations.reduce(
    (total, allocation) => total + allocation.count,
    0,
  );
  const remainderOrder = [...allocations].sort(
    (left, right) => (
      right.remainder - left.remainder
      || left.order - right.order
    ),
  );
  for (
    let index = 0;
    allocated < totalEnemies;
    index = (index + 1) % remainderOrder.length
  ) {
    remainderOrder[index].count += 1;
    allocated += 1;
  }

  if (isBossWave(waveNumber)) {
    const normal = allocations.find(({ type }) => type === "normal");
    if (normal && normal.count > 0) {
      normal.count -= 1;
      allocations.push({
        type: "boss",
        order: allocations.length,
        count: 1,
        remainder: 0,
      });
    }
  }

  const roster = allocations.flatMap(({ type, count }) => (
    Array.from({ length: count }, () => type)
  ));
  return promoteIntroducedEnemyTypes(
    deterministicShuffle(roster, waveNumber),
    waveNumber,
  );
}

function deterministicShuffle<T>(values: T[], seed: number) {
  let state = (seed * 2_654_435_761) >>> 0;
  for (let index = values.length - 1; index > 0; index -= 1) {
    state = (state * 1_664_525 + 1_013_904_223) >>> 0;
    const swapIndex = state % (index + 1);
    [values[index], values[swapIndex]] = [
      values[swapIndex],
      values[index],
    ];
  }
  return values;
}

function promoteIntroducedEnemyTypes(
  roster: EnemyType[],
  waveNumber: number,
) {
  const priority: EnemyType[] = [];
  if (isBossWave(waveNumber)) priority.push("boss");
  if (waveNumber >= 13) priority.push("sniper");
  if (waveNumber >= 10) priority.push("shotgun");
  if (waveNumber >= 7) priority.push("smg");
  if (waveNumber >= 4) priority.push("armoured");
  priority.push("normal");

  priority.forEach((enemyType, destinationIndex) => {
    const sourceIndex = roster.findIndex(
      (type, index) => (
        index >= destinationIndex
        && type === enemyType
      ),
    );
    if (sourceIndex < 0) return;
    const [selected] = roster.splice(sourceIndex, 1);
    roster.splice(destinationIndex, 0, selected);
  });
  return roster;
}

export const WAVE_TRANSITION_SECONDS = 5;
export const OPENING_COUNTDOWN_SECONDS = 3;
