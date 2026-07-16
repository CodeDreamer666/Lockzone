import assert from "node:assert/strict";
import {
  calculateDesiredHorizontalVelocity,
  moveHorizontalVelocityToward,
} from "../src/game/movementMath.ts";

const config = {
  speeds: { forward: 7.2, strafe: 6.8, backward: 6.2 },
  acceleration: 40,
  deceleration: 48,
};

function simulate(frameRate, input, seconds = 5) {
  const deltaSeconds = 1 / frameRate;
  const frameCount = Math.round(seconds * frameRate);
  let velocity = { x: 0, z: 0 };
  let position = { x: 0, z: 0 };
  let steadyDistance = 0;
  let steadySeconds = 0;

  for (let frame = 0; frame < frameCount; frame += 1) {
    const desired = calculateDesiredHorizontalVelocity(input, 0, config.speeds);
    const hasInput = desired.x !== 0 || desired.z !== 0;
    velocity = moveHorizontalVelocityToward(
      velocity,
      desired,
      (hasInput ? config.acceleration : config.deceleration) * deltaSeconds,
    );
    const displacement = {
      x: velocity.x * deltaSeconds,
      z: velocity.z * deltaSeconds,
    };
    position.x += displacement.x;
    position.z += displacement.z;

    if (frame * deltaSeconds >= 1) {
      steadyDistance += Math.hypot(displacement.x, displacement.z);
      steadySeconds += deltaSeconds;
    }

    assert.ok(
      Math.hypot(displacement.x, displacement.z) < 0.3,
      `Displacement became frame-sized at ${frameRate} FPS`,
    );
  }

  return {
    distance: Math.hypot(position.x, position.z),
    steadySpeed: steadyDistance / steadySeconds,
  };
}

const forward = { forward: true, backward: false, left: false, right: false };
const results = [30, 60, 120].map((frameRate) => ({
  frameRate,
  ...simulate(frameRate, forward),
}));

for (const result of results) {
  assert.ok(Math.abs(result.steadySpeed - 7.2) < 0.01);
  assert.ok(result.distance > 35 && result.distance < 36.1);
}

const diagonal = calculateDesiredHorizontalVelocity(
  { forward: true, backward: false, left: false, right: true },
  0,
  config.speeds,
);
assert.ok(Math.hypot(diagonal.x, diagonal.z) < 7.21);

const strafe = simulate(
  60,
  { forward: false, backward: false, left: false, right: true },
);
assert.ok(Math.abs(strafe.steadySpeed - 6.8) < 0.01);

const backward = simulate(
  60,
  { forward: false, backward: true, left: false, right: false },
);
assert.ok(Math.abs(backward.steadySpeed - 6.2) < 0.01);

console.table(results.map((result) => ({
  "Target FPS": result.frameRate,
  "5 second distance (m)": result.distance.toFixed(3),
  "Measured steady speed (m/s)": result.steadySpeed.toFixed(3),
})));
