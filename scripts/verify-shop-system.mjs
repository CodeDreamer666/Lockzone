import assert from "node:assert/strict";
import { rm, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";

const temporaryDirectory = await mkdtemp(join(tmpdir(), "neon-duel-shop-"));
const bundledModule = join(temporaryDirectory, "shop-system.mjs");

try {
  await build({
    bundle: true,
    entryPoints: ["src/game/shopSystem.ts"],
    format: "esm",
    logLevel: "silent",
    outfile: bundledModule,
    platform: "node",
  });

  const {
    awardCoins,
    COIN_REWARDS,
    createInitialShopState,
    currentWeaponStats,
    getShopAtPosition,
    getBotKillCoinReward,
    getShopPrice,
    movementSpeedMultiplier,
    purchaseShopItem,
    SHOP_PURCHASE_IDS,
  } = await import(pathToFileURL(bundledModule).href);

  assert.equal(getShopAtPosition({ x: -16, z: -16 }), "field");
  assert.equal(getShopAtPosition({ x: 0, z: 0 }), undefined);
  assert.deepEqual(SHOP_PURCHASE_IDS, [
    "movement-10",
    "health-10",
    "rifle-damage-10",
    "magazine-10",
  ]);

  let state = createInitialShopState();
  assert.equal(state.coins, 0, "a new run starts with no coins");
  assert.deepEqual(COIN_REWARDS, {
    headshotBonus: 2,
    waveComplete: 25,
  });
  assert.equal(getBotKillCoinReward("normal", false), 10);
  assert.equal(getBotKillCoinReward("normal", true), 12);
  assert.equal(getBotKillCoinReward("smg", false), 12);
  assert.equal(getBotKillCoinReward("armoured", false), 20);
  assert.equal(getBotKillCoinReward("shotgun", false), 20);
  assert.equal(getBotKillCoinReward("sniper", false), 25);
  assert.equal(getBotKillCoinReward("boss", false), 100);
  assert.equal(getShopPrice(state, "movement-10"), 140);
  assert.equal(getShopPrice(state, "health-10"), 75);
  assert.equal(getShopPrice(state, "rifle-damage-10"), 125);
  assert.equal(getShopPrice(state, "magazine-10"), 75);

  const rejectedPurchase = purchaseShopItem(state, "movement-10");
  assert.equal(rejectedPurchase.status, "insufficient-funds");
  assert.equal(
    rejectedPurchase.state,
    state,
    "failed purchases do not mutate state",
  );

  state = awardCoins(state, 2_000);

  let purchase = purchaseShopItem(state, "movement-10");
  assert.equal(purchase.status, "purchased");
  assert.equal(purchase.price, 140);
  state = purchase.state;
  assert.equal(movementSpeedMultiplier(state), 1.1);
  assert.equal(getShopPrice(state, "movement-10"), 175);

  purchase = purchaseShopItem(state, "movement-10");
  assert.equal(purchase.price, 175);
  state = purchase.state;
  assert.equal(movementSpeedMultiplier(state), 1.2);

  state = purchaseShopItem(state, "health-10").state;
  assert.equal(state.healthBonusPercent, 10);
  assert.equal(state.maximumHealth, 110);

  state = purchaseShopItem(state, "rifle-damage-10").state;
  assert.equal(state.rifleDamageBonusPercent, 10);
  assert.equal(currentWeaponStats(state).bodyDamage, 22);
  assertClose(currentWeaponStats(state).headshotDamage, 66);

  state = purchaseShopItem(state, "magazine-10").state;
  assert.equal(state.magazineBonusPercent, 10);
  assert.equal(currentWeaponStats(state).magazineSize, 44);

  state = purchaseShopItem(state, "health-10").state;
  state = purchaseShopItem(state, "rifle-damage-10").state;
  state = purchaseShopItem(state, "magazine-10").state;
  assert.equal(state.maximumHealth, 120);
  assert.equal(currentWeaponStats(state).bodyDamage, 24);
  assertClose(currentWeaponStats(state).headshotDamage, 72);
  assert.equal(currentWeaponStats(state).magazineSize, 48);

  const resetState = createInitialShopState();
  assert.equal(resetState.coins, 0);
  assert.equal(resetState.maximumHealth, 100);
  assert.equal(currentWeaponStats(resetState).bodyDamage, 20);
  assert.equal(currentWeaponStats(resetState).magazineSize, 40);

  console.log("Simplified shop-system verification passed.");
} finally {
  await rm(temporaryDirectory, {
    force: true,
    recursive: true,
  });
}

function assertClose(actual, expected) {
  assert.ok(Math.abs(actual - expected) < 1e-9);
}
