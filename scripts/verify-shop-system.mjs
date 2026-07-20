import assert from "node:assert/strict";
import {
  applyShopPurchase,
  createInitialShopState,
  currentWeaponStats,
  getShopAtPosition,
  movementSpeedMultiplier,
} from "../src/game/shopSystem.ts";

assert.equal(
  getShopAtPosition({ x: -34, z: -34 }),
  "movement",
  "southwest safe zone hosts the movement shop",
);
assert.equal(
  getShopAtPosition({ x: 34, z: -34 }),
  "health",
  "southeast safe zone hosts the health shop",
);
assert.equal(
  getShopAtPosition({ x: -34, z: 34 }),
  "weapon",
  "northwest safe zone hosts the weapon shop",
);
assert.equal(
  getShopAtPosition({ x: 34, z: 34 }),
  "utility",
  "northeast safe zone hosts the utility shop",
);
assert.equal(getShopAtPosition({ x: 0, z: 0 }), undefined);

let state = createInitialShopState();
state = applyShopPurchase(state, "movement-20");
state = applyShopPurchase(state, "health-50");
state = applyShopPurchase(state, "weapon-dmr");
state = applyShopPurchase(state, "utility-damage");
state = applyShopPurchase(state, "utility-magazine");
state = applyShopPurchase(state, "utility-knife");

assert.equal(movementSpeedMultiplier(state), 1.2);
assert.equal(state.maximumHealth, 150);
assert.equal(state.selectedWeapon, "dmr");
assert.equal(state.knifeDamage, 45);
assert.equal(currentWeaponStats(state).bodyDamage, 53);
assert.equal(currentWeaponStats(state).magazineSize, 17);

for (let purchase = 0; purchase < 100_000; purchase += 1) {
  state = applyShopPurchase(state, "utility-reload");
  state = applyShopPurchase(state, "utility-damage");
  state = applyShopPurchase(state, "utility-magazine");
}

const repeatedStats = currentWeaponStats(state);
assert.ok(Number.isFinite(repeatedStats.bodyDamage));
assert.ok(Number.isFinite(repeatedStats.magazineSize));
assert.ok(Number.isFinite(repeatedStats.reloadMs));
assert.ok(repeatedStats.reloadMs > 0);

console.log("Shop-system verification passed.");
