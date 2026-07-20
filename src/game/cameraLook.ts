export interface LookDelta {
  x: number;
  y: number;
}

const MAXIMUM_POINTER_EVENT_DELTA = 160;
const MAXIMUM_PENDING_DELTA = 480;
const LOOK_RESPONSE_PER_SECOND = 20;
const SETTLED_DELTA = 0.001;

export function queueLookDelta(
  pending: LookDelta,
  movementX: number,
  movementY: number,
) {
  if (!Number.isFinite(movementX) || !Number.isFinite(movementY)) {
    return pending;
  }

  return {
    x: clamp(
      pending.x + clamp(
        movementX,
        -MAXIMUM_POINTER_EVENT_DELTA,
        MAXIMUM_POINTER_EVENT_DELTA,
      ),
      -MAXIMUM_PENDING_DELTA,
      MAXIMUM_PENDING_DELTA,
    ),
    y: clamp(
      pending.y + clamp(
        movementY,
        -MAXIMUM_POINTER_EVENT_DELTA,
        MAXIMUM_POINTER_EVENT_DELTA,
      ),
      -MAXIMUM_PENDING_DELTA,
      MAXIMUM_PENDING_DELTA,
    ),
  };
}

export function consumeLookDelta(
  pending: LookDelta,
  deltaSeconds: number,
) {
  const response = 1 - Math.exp(
    -LOOK_RESPONSE_PER_SECOND * Math.max(0, deltaSeconds),
  );
  const applied = {
    x: pending.x * response,
    y: pending.y * response,
  };
  const remaining = {
    x: settle(pending.x - applied.x),
    y: settle(pending.y - applied.y),
  };

  return { applied, remaining };
}

function settle(value: number) {
  return Math.abs(value) < SETTLED_DELTA ? 0 : value;
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(maximum, value));
}
