import assert from "node:assert/strict";
import { integrateVerticalMotion } from "../src/game/movementMath.ts";

const initialVelocity = 6.4;
const gravity = -21.5;

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
  assert.ok(result.peakHeight >= 0.9 && result.peakHeight <= 1.0);
  assert.ok(result.duration >= 0.58 && result.duration <= 0.65);
}

assert.ok(Math.max(...results.map((result) => result.peakHeight)) - Math.min(...results.map((result) => result.peakHeight)) < 0.01);

console.table(results.map((result) => ({
  "Target FPS": result.frameRate,
  "Peak jump height (m)": result.peakHeight.toFixed(3),
  "Air time (s)": result.duration.toFixed(3),
})));
