export interface HorizontalVector {
  x: number;
  z: number;
}

export interface MovementInput {
  forward: boolean;
  backward: boolean;
  left: boolean;
  right: boolean;
}

export interface MovementSpeeds {
  forward: number;
  strafe: number;
  backward: number;
}

export const MAX_DELTA_SECONDS = 0.05;

export function clampDeltaSeconds(deltaMilliseconds: number) {
  if (!Number.isFinite(deltaMilliseconds) || deltaMilliseconds <= 0) {
    return 0;
  }

  return Math.min(deltaMilliseconds / 1000, MAX_DELTA_SECONDS);
}

export function calculateDesiredHorizontalVelocity(
  input: MovementInput,
  yaw: number,
  speeds: MovementSpeeds,
): HorizontalVector {
  let inputX = Number(input.right) - Number(input.left);
  let inputZ = Number(input.forward) - Number(input.backward);
  const inputLength = Math.hypot(inputX, inputZ);

  if (inputLength > 1) {
    inputX /= inputLength;
    inputZ /= inputLength;
  }

  const localX = inputX * speeds.strafe;
  const localZ = inputZ * (inputZ >= 0 ? speeds.forward : speeds.backward);
  const sinYaw = Math.sin(yaw);
  const cosYaw = Math.cos(yaw);

  return {
    x: localX * cosYaw + localZ * sinYaw,
    z: localZ * cosYaw - localX * sinYaw,
  };
}

export function moveHorizontalVelocityToward(
  current: HorizontalVector,
  target: HorizontalVector,
  maximumChange: number,
): HorizontalVector {
  const differenceX = target.x - current.x;
  const differenceZ = target.z - current.z;
  const differenceLength = Math.hypot(differenceX, differenceZ);

  if (differenceLength <= maximumChange || differenceLength === 0) {
    return { ...target };
  }

  const scale = maximumChange / differenceLength;

  return {
    x: current.x + differenceX * scale,
    z: current.z + differenceZ * scale,
  };
}
