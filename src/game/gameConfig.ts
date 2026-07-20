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
  number: number;
  name: string;
  totalEnemies: number;
  maximumAlive: number;
  movementMultiplier: number;
  reactionSeconds: number;
  effectiveAccuracy: number;
  playerRegenerationDelayMs: number;
  roundsPerMinute: number;
  searchSeconds: number;
  searchRadius: number;
  perceptionMultiplier: number;
  aggressionMultiplier: number;
  replacementDelayMs: number;
}

export function createWaveConfig(number: number): WaveConfig {
  const totalEnemies = number * 5;

  return {
    number,
    name: `Wave ${number}`,
    totalEnemies,
    maximumAlive: Math.min(totalEnemies, 8),
    movementMultiplier: Math.min(1.25, 1 + (number - 1) * 0.025),
    reactionSeconds: 0.6,
    effectiveAccuracy: 0,
    playerRegenerationDelayMs: 800,
    roundsPerMinute: 180,
    searchSeconds: 4,
    searchRadius: 4,
    perceptionMultiplier: 1,
    aggressionMultiplier: 1,
    replacementDelayMs: 650,
  };
}

export const WAVE_TRANSITION_SECONDS = 5;
export const OPENING_COUNTDOWN_SECONDS = 3;
