import assert from "node:assert/strict";
import { COMPACT_MAP_LAYOUT } from "../src/map/mapLayout.ts";
import {
  DISTRICT_SIZE,
  SAFE_ZONES,
  SAFE_ZONE_SIZE,
  isInsideSafeZone,
  movementEntersSafeZone,
  segmentIntersectsSafeZone,
} from "../src/map/safeZones.ts";

assert.equal(DISTRICT_SIZE, 40, "district is 40 by 40");
assert.equal(SAFE_ZONES.length, 1, "there is exactly one safe zone");

const [zone] = SAFE_ZONES;
assert.deepEqual(
  COMPACT_MAP_LAYOUT.safeZone,
  zone,
  "rendered layout and safe-zone rules use the same protected area",
);
assert.equal(zone.size, SAFE_ZONE_SIZE, "safe zone is 5 by 5");
assert.equal(zone.size, 5, "safe-zone side length is exactly five metres");
assert.ok(
  Math.abs(zone.center.x) >= 12 && Math.abs(zone.center.z) >= 12,
  "safe zone sits near a corner rather than the map center",
);
assert.equal(isInsideSafeZone(zone.center), true);
assert.equal(
  movementEntersSafeZone(
    { x: zone.center.x - 4, z: zone.center.z },
    { x: zone.center.x + 4, z: zone.center.z },
  ),
  true,
  "bots cannot cross the protected area",
);
assert.equal(
  segmentIntersectsSafeZone(
    { x: zone.center.x - 4, z: zone.center.z },
    { x: zone.center.x + 4, z: zone.center.z },
  ),
  true,
  "enemy fire cannot cross the protected area",
);
assert.equal(isInsideSafeZone({ x: 0, z: 0 }), false);

assert.equal(
  COMPACT_MAP_LAYOUT.botSpawns.length,
  4,
  "the compact map uses four fixed bot spawns",
);
assert.equal(
  new Set(
    COMPACT_MAP_LAYOUT.botSpawns.map((spawn) => `${spawn.x},${spawn.z}`),
  ).size,
  4,
  "all fixed bot spawns are distinct",
);

for (const spawn of COMPACT_MAP_LAYOUT.botSpawns) {
  assert.ok(
    Math.max(Math.abs(spawn.x), Math.abs(spawn.z)) >= 17,
    "each bot spawn is positioned at an outer edge",
  );
  assert.equal(
    isInsideSafeZone(spawn),
    false,
    "bot spawns stay outside the safe zone",
  );
  assert.ok(
    horizontalDistance(spawn, COMPACT_MAP_LAYOUT.playerSpawn) >= 18,
    "bot spawns keep a fair opening distance from the player",
  );
}

assert.equal(
  COMPACT_MAP_LAYOUT.cargoContainers.length,
  5,
  "the cover half has five deliberate container placements",
);
assert.equal(
  COMPACT_MAP_LAYOUT.elevatedPlatforms.length,
  2,
  "the vertical half has two connected raised structures",
);
assert.equal(
  COMPACT_MAP_LAYOUT.cargoContainers.some((container) => container.stacked),
  true,
  "cargo cover includes a realistic stacked-container landmark",
);

console.log("Compact map and safe-zone verification passed.");

function horizontalDistance(left, right) {
  return Math.hypot(right.x - left.x, right.z - left.z);
}
