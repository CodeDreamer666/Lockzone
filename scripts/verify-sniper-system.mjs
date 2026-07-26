import assert from "node:assert/strict";
import {
  SNIPER_CONFIG,
  SniperWeapon,
} from "../src/combat/SniperWeapon.ts";

assert.equal(SNIPER_CONFIG.damage, 200, "sniper damage is exactly 200");
assert.equal(SNIPER_CONFIG.maximumShots, 6, "sniper has exactly six shots");
assert.equal(SNIPER_CONFIG.rechargeMs, 60_000, "recharge is exactly 60 seconds");
assert.ok(
  SNIPER_CONFIG.range > Math.hypot(40, 40),
  "sniper ray crosses the full diagonal of the 40 by 40 map",
);

const sniper = new SniperWeapon();
const shotInterval = Math.ceil(
  60_000 / SNIPER_CONFIG.roundsPerMinute,
);
for (let shot = 0; shot < SNIPER_CONFIG.maximumShots; shot += 1) {
  const fired = sniper.fire(shot * shotInterval);
  assert.equal(fired, true, `shot ${shot + 1} fires`);
  assert.equal(
    sniper.shotsRemaining,
    SNIPER_CONFIG.maximumShots - shot - 1,
    `shot ${shot + 1} decrements the reserve`,
  );
}

const sixthShotAt = (SNIPER_CONFIG.maximumShots - 1) * shotInterval;
assert.equal(sniper.isRecharging, true, "sixth shot begins recharge");
assert.equal(
  sniper.fire(sixthShotAt + shotInterval),
  false,
  "sniper cannot fire during recharge",
);
assert.equal(
  sniper.update(sixthShotAt + SNIPER_CONFIG.rechargeMs - 1),
  false,
  "recharge does not finish early",
);
assert.equal(
  sniper.update(sixthShotAt + SNIPER_CONFIG.rechargeMs),
  true,
  "recharge completes at 60 seconds",
);
assert.equal(
  sniper.shotsRemaining,
  SNIPER_CONFIG.maximumShots,
  "all six shots return after recharge",
);

console.log("Sniper capacity, damage, cadence, and recharge verification passed.");
