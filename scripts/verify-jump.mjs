import assert from "node:assert/strict";
import { integrateVerticalMotion } from "../src/game/movementMath.ts";

const initialVelocity = 5.6;
const gravity = -24;
const airDeceleration = 10;

function simulate(frameRate) {
  const deltaSeconds = 1 / frameRate;
  let height = 0;
  let peakHeight = 0;
  let seconds = 0;
  let velocity = initialVelocity;

  while (seconds < 2) {
    const motion = integrateVerticalMotion(velocity, gravity, deltaSeconds);
    velocity = motion.velocity;
    height += motion.displacement;
    seconds += deltaSeconds;
    peakHeight = Math.max(peakHeight, height);
    if (height <= 0 && velocity < 0) {
      break;
    }
  }

  return { frameRate, peakHeight, duration: seconds };
}

const results = [30, 60, 120].map(simulate);
for (const result of results) {
  assert.ok(result.peakHeight >= 0.62 && result.peakHeight <= 0.68);
  assert.ok(result.duration >= 0.44 && result.duration <= 0.5);
}

assert.ok(Math.max(...results.map((result) => result.peakHeight)) - Math.min(...results.map((result) => result.peakHeight)) < 0.01);

function simulateReleaseDuringJump(frameRate) {
  const deltaSeconds = 1 / frameRate;
  let height = 0;
  let velocityY = initialVelocity;
  let velocityZ = 7.2;
  let releasedAtHeight = 0;
  let peakAfterRelease = 0;
  let frame = 0;

  while (frame < frameRate * 2) {
    if (frame === Math.round(frameRate * 0.1)) {
      releasedAtHeight = height;
    }
    if (frame >= Math.round(frameRate * 0.1)) {
      velocityZ = Math.max(0, velocityZ - airDeceleration * deltaSeconds);
    }

    const motion = integrateVerticalMotion(velocityY, gravity, deltaSeconds);
    velocityY = motion.velocity;
    height += motion.displacement;
    if (frame >= Math.round(frameRate * 0.1)) {
      peakAfterRelease = Math.max(peakAfterRelease, height);
    }
    frame += 1;
    if (height <= 0 && velocityY < 0) break;
  }

  return {
    landed: height <= 0,
    peakAfterRelease,
    releasedAtHeight,
    remainingForwardSpeed: velocityZ,
  };
}

for (const frameRate of [30, 60, 120]) {
  const released = simulateReleaseDuringJump(frameRate);
  assert.equal(released.landed, true);
  assert.ok(released.peakAfterRelease > released.releasedAtHeight);
  assert.ok(released.remainingForwardSpeed < 7.2);
  assert.ok(released.remainingForwardSpeed > 1);
}

console.table(results.map((result) => ({
  "Target FPS": result.frameRate,
  "Peak jump height (m)": result.peakHeight.toFixed(3),
  "Air time (s)": result.duration.toFixed(3),
})));
