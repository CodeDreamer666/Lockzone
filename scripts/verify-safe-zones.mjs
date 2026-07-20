import assert from "node:assert/strict";
import {
  DISTRICT_SIZE,
  QUADRANT_SIZE,
  SAFE_ZONES,
  SAFE_ZONE_SIZE,
  isInsideSafeZone,
  movementEntersSafeZone,
} from "../src/map/safeZones.ts";

assert.equal(DISTRICT_SIZE, 80, "district is 80 by 80");
assert.equal(QUADRANT_SIZE, 40, "district has four 40 by 40 quadrants");
assert.equal(SAFE_ZONES.length, 4, "there is one safe zone per quadrant");

const quadrants = new Set(
  SAFE_ZONES.map((zone) => `${Math.sign(zone.center.x)},${Math.sign(zone.center.z)}`),
);
assert.deepEqual(
  quadrants,
  new Set(["-1,-1", "1,-1", "-1,1", "1,1"]),
  "safe zones occupy all four quadrants",
);

for (const zone of SAFE_ZONES) {
  assert.equal(zone.size, SAFE_ZONE_SIZE, `${zone.id} is 5 by 5`);
  assert.equal(isInsideSafeZone(zone.center), true, `${zone.id} center is protected`);
  assert.equal(
    movementEntersSafeZone(
      { x: zone.center.x - 4, z: zone.center.z },
      { x: zone.center.x + 4, z: zone.center.z },
    ),
    true,
    `${zone.id} cannot be crossed by a bot`,
  );
}

assert.equal(
  isInsideSafeZone({ x: 0, z: 0 }),
  false,
  "the quadrant intersection remains a combat area",
);
assert.equal(
  movementEntersSafeZone({ x: -10, z: -10 }, { x: 10, z: 10 }),
  false,
  "ordinary central movement remains available",
);

console.log("Safe-zone verification passed.");
