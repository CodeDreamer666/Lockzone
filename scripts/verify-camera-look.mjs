import assert from "node:assert/strict";
import {
  consumeLookDelta,
  queueLookDelta,
} from "../src/game/cameraLook.ts";

const queued = queueLookDelta({ x: 0, y: 0 }, 80, -40);
const firstFrame = consumeLookDelta(queued, 1 / 60);

assert.ok(
  Math.abs(firstFrame.applied.x) < Math.abs(queued.x),
  "look input is smoothed instead of applied as a single-frame snap",
);
assert.ok(
  Math.abs(firstFrame.remaining.x) > 0,
  "unapplied look input carries into later frames",
);

const anomalous = queueLookDelta({ x: 0, y: 0 }, 10_000, -10_000);
assert.deepEqual(
  anomalous,
  { x: 160, y: -160 },
  "abnormal pointer-lock spikes are clamped",
);

function consumeForOneSecond(frameRate) {
  let pending = queueLookDelta({ x: 0, y: 0 }, 120, 60);
  let appliedX = 0;
  let appliedY = 0;

  for (let frame = 0; frame < frameRate; frame += 1) {
    const result = consumeLookDelta(pending, 1 / frameRate);
    appliedX += result.applied.x;
    appliedY += result.applied.y;
    pending = result.remaining;
  }

  return { x: appliedX, y: appliedY };
}

const at30 = consumeForOneSecond(30);
const at60 = consumeForOneSecond(60);
const at120 = consumeForOneSecond(120);

for (const result of [at30, at60, at120]) {
  assert.ok(Math.abs(result.x - 120) < 0.01);
  assert.ok(Math.abs(result.y - 60) < 0.01);
}

console.log("Camera-look verification passed.");
