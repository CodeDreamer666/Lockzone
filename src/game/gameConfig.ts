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
  camera: { sensitivity: 0.0012, minSensitivity: 0.0006, maxSensitivity: 0.003, verticalLimit: 1.5 },
  weapon: {
    bodyDamage: 20,
    headshotDamage: 60,
    magazineSize: 40,
    roundsPerMinute: 600,
    reloadMs: 1800,
    range: 80,
    recoilPerShot: 0.006,
    hipSpread: 0.012,
  },
  regeneration: { delayMs: 800, healthPerSecond: 20 },
  bot: {
    shotDamage: 10,
    detectionRange: 30,
    fieldOfViewRadians: 1.85,
    firingAngleRadians: 0.18,
    gravity: -24,
    perceptionSeconds: 0.2,
    personalSpace: 2.2,
  },
} as const;

export interface WaveConfig {
  number: 1 | 2 | 3;
  name: string;
  totalEnemies: number;
  durationSeconds: number;
  maximumAlive: number;
  movementMultiplier: number;
  reactionSeconds: number;
  effectiveAccuracy: number;
  roundsPerMinute: number;
  searchSeconds: number;
  searchRadius: number;
  perceptionMultiplier: number;
  aggressionMultiplier: number;
  elevatedSpawnFrequency: number;
  replacementDelayMs: number;
}

export const WAVE_CONFIGS: readonly WaveConfig[] = [
  {
    number: 1,
    name: "Introduction",
    totalEnemies: 15,
    durationSeconds: 3 * 60,
    maximumAlive: 3,
    movementMultiplier: 1,
    reactionSeconds: 0.8,
    effectiveAccuracy: 0.45,
    roundsPerMinute: 180,
    searchSeconds: 3,
    searchRadius: 2,
    perceptionMultiplier: 1,
    aggressionMultiplier: 1,
    elevatedSpawnFrequency: 5,
    replacementDelayMs: 1250,
  },
  {
    number: 2,
    name: "Pressure",
    totalEnemies: 20,
    durationSeconds: 5 * 60,
    maximumAlive: 5,
    movementMultiplier: 1.08,
    reactionSeconds: 0.6,
    effectiveAccuracy: 0.65,
    roundsPerMinute: 220,
    searchSeconds: 5,
    searchRadius: 4,
    perceptionMultiplier: 0.82,
    aggressionMultiplier: 1.16,
    elevatedSpawnFrequency: 4,
    replacementDelayMs: 1150,
  },
  {
    number: 3,
    name: "Final Assault",
    totalEnemies: 28,
    durationSeconds: 8 * 60,
    maximumAlive: 7,
    movementMultiplier: 1.14,
    reactionSeconds: 0.5,
    effectiveAccuracy: 0.75,
    roundsPerMinute: 260,
    searchSeconds: 7,
    searchRadius: 6,
    perceptionMultiplier: 0.68,
    aggressionMultiplier: 1.3,
    elevatedSpawnFrequency: 3,
    replacementDelayMs: 1050,
  },
] as const;

export const WAVE_TRANSITION_SECONDS = 5;
export const OPENING_COUNTDOWN_SECONDS = 3;
