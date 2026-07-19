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
    damage: 12.5,
    magazineSize: 30,
    roundsPerMinute: 600,
    reloadMs: 2200,
    range: 80,
    recoilPerShot: 0.006,
    hipSpread: 0.012,
  },
  regeneration: { delayMs: 2000, healthPerSecond: 20 },
  bot: {
    detectionRange: 30,
    fieldOfViewRadians: 1.85,
    perceptionSeconds: 0.2,
    decisionSeconds: 0.65,
    reactionSeconds: 0.32,
    accuracy: 0.5,
    personalSpace: 2.2,
  },
} as const;

export interface WaveConfig {
  number: 1 | 2 | 3;
  totalEnemies: number;
  durationSeconds: number;
  maximumAlive: number;
  movementMultiplier: number;
  reactionMultiplier: number;
  accuracyMultiplier: number;
  perceptionMultiplier: number;
  decisionMultiplier: number;
  aggressionMultiplier: number;
  damageMultiplier: number;
  elevatedSpawnFrequency: number;
  replacementDelayMs: number;
}

export const WAVE_CONFIGS: readonly WaveConfig[] = [
  {
    number: 1,
    totalEnemies: 15,
    durationSeconds: 3 * 60,
    maximumAlive: 5,
    movementMultiplier: 1,
    reactionMultiplier: 1,
    accuracyMultiplier: 1,
    perceptionMultiplier: 1,
    decisionMultiplier: 1,
    aggressionMultiplier: 1,
    damageMultiplier: 1,
    elevatedSpawnFrequency: 5,
    replacementDelayMs: 850,
  },
  {
    number: 2,
    totalEnemies: 20,
    durationSeconds: 5 * 60,
    maximumAlive: 6,
    movementMultiplier: 1.12,
    reactionMultiplier: 0.78,
    accuracyMultiplier: 1.16,
    perceptionMultiplier: 0.82,
    decisionMultiplier: 0.78,
    aggressionMultiplier: 1.16,
    damageMultiplier: 1,
    elevatedSpawnFrequency: 4,
    replacementDelayMs: 720,
  },
  {
    number: 3,
    totalEnemies: 28,
    durationSeconds: 8 * 60,
    maximumAlive: 7,
    movementMultiplier: 1.22,
    reactionMultiplier: 0.62,
    accuracyMultiplier: 1.32,
    perceptionMultiplier: 0.68,
    decisionMultiplier: 0.62,
    aggressionMultiplier: 1.3,
    damageMultiplier: 1.15,
    elevatedSpawnFrequency: 3,
    replacementDelayMs: 620,
  },
] as const;

export const WAVE_TRANSITION_SECONDS = 8;
export const OPENING_COUNTDOWN_SECONDS = 3;
