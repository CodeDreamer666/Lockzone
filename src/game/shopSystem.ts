import {
  ENEMY_ARCHETYPES,
  GAME_CONFIG,
  PLAYER_WEAPON_DAMAGE,
  type EnemyType,
} from "./gameConfig";
import {
  type HorizontalPosition,
  getSafeZoneAt,
} from "../map/safeZones";

export type ShopKind = "field";

export type ShopPurchaseId =
  | "movement-10"
  | "health-10"
  | "rifle-damage-10"
  | "magazine-10";

export const SHOP_PURCHASE_IDS: readonly ShopPurchaseId[] = [
  "movement-10",
  "health-10",
  "rifle-damage-10",
  "magazine-10",
];

export interface RunShopState {
  coins: number;
  movementBonusPercent: number;
  healthBonusPercent: number;
  maximumHealth: number;
  rifleDamageBonusPercent: number;
  magazineBonusPercent: number;
  purchaseCounts: Record<ShopPurchaseId, number>;
}

const MAXIMUM_SAFE_RUNTIME_VALUE = Number.MAX_SAFE_INTEGER;
const REPEATED_PRICE_MULTIPLIER = 1.25;

export const COIN_REWARDS = {
  headshotBonus: 2,
  waveComplete: 25,
} as const;

export const SHOP_BASE_PRICES: Record<ShopPurchaseId, number> = {
  "movement-10": 140,
  "health-10": 75,
  "rifle-damage-10": 125,
  "magazine-10": 75,
};

export const SHOP_NAMES: Record<ShopKind, string> = {
  field: "Field Upgrade Shop",
};

export const RIFLE_DEFINITION = {
  displayName: "Assault Rifle",
  bodyDamage: PLAYER_WEAPON_DAMAGE["assault-rifle"].body,
  headshotDamage: PLAYER_WEAPON_DAMAGE["assault-rifle"].head,
  magazineSize: GAME_CONFIG.weapon.magazineSize,
  reloadMs: GAME_CONFIG.weapon.reloadMs,
  roundsPerMinute: GAME_CONFIG.weapon.roundsPerMinute,
  range: GAME_CONFIG.weapon.range,
  spread: GAME_CONFIG.weapon.hipSpread,
} as const;

export function createInitialShopState(): RunShopState {
  return {
    coins: 0,
    movementBonusPercent: 0,
    healthBonusPercent: 0,
    maximumHealth: GAME_CONFIG.player.health,
    rifleDamageBonusPercent: 0,
    magazineBonusPercent: 0,
    purchaseCounts: {
      "movement-10": 0,
      "health-10": 0,
      "rifle-damage-10": 0,
      "magazine-10": 0,
    },
  };
}

export function getShopAtPosition(position: HorizontalPosition) {
  return getSafeZoneAt(position) ? "field" as const : undefined;
}

export function getShopPrice(
  state: RunShopState,
  purchaseId: ShopPurchaseId,
) {
  const multiplier = REPEATED_PRICE_MULTIPLIER
    ** state.purchaseCounts[purchaseId];
  return Math.min(
    MAXIMUM_SAFE_RUNTIME_VALUE,
    Math.ceil(SHOP_BASE_PRICES[purchaseId] * finite(multiplier)),
  );
}

export function awardCoins(state: RunShopState, amount: number) {
  return {
    ...state,
    coins: safeAdd(state.coins, Math.max(0, Math.floor(amount))),
  };
}

export function getBotKillCoinReward(
  enemyType: EnemyType,
  headshot: boolean,
) {
  return ENEMY_ARCHETYPES[enemyType].coinReward + (
    headshot ? COIN_REWARDS.headshotBonus : 0
  );
}

export function purchaseShopItem(
  state: RunShopState,
  purchaseId: ShopPurchaseId,
) {
  const price = getShopPrice(state, purchaseId);
  if (state.coins < price) {
    return {
      state,
      price,
      status: "insufficient-funds" as const,
    };
  }

  const purchaseCounts = {
    ...state.purchaseCounts,
    [purchaseId]: state.purchaseCounts[purchaseId] + 1,
  };
  const next: RunShopState = {
    ...state,
    coins: state.coins - price,
    purchaseCounts,
  };

  switch (purchaseId) {
    case "movement-10":
      next.movementBonusPercent = safeAdd(
        next.movementBonusPercent,
        10,
      );
      break;
    case "health-10":
      next.healthBonusPercent = safeAdd(next.healthBonusPercent, 10);
      next.maximumHealth = scaledInteger(
        GAME_CONFIG.player.health,
        next.healthBonusPercent,
      );
      break;
    case "rifle-damage-10":
      next.rifleDamageBonusPercent = safeAdd(
        next.rifleDamageBonusPercent,
        10,
      );
      break;
    case "magazine-10":
      next.magazineBonusPercent = safeAdd(
        next.magazineBonusPercent,
        10,
      );
      break;
  }

  return {
    state: next,
    price,
    status: "purchased" as const,
  };
}

export function isShopPurchaseId(value: string): value is ShopPurchaseId {
  return SHOP_PURCHASE_IDS.some((purchaseId) => purchaseId === value);
}

export function movementSpeedMultiplier(state: RunShopState) {
  return finite(1 + state.movementBonusPercent / 100);
}

export function currentWeaponStats(state: RunShopState) {
  return {
    ...RIFLE_DEFINITION,
    bodyDamage: scaledNumber(
      RIFLE_DEFINITION.bodyDamage,
      state.rifleDamageBonusPercent,
    ),
    headshotDamage: scaledNumber(
      RIFLE_DEFINITION.headshotDamage,
      state.rifleDamageBonusPercent,
    ),
    magazineSize: scaledInteger(
      RIFLE_DEFINITION.magazineSize,
      state.magazineBonusPercent,
    ),
  };
}

function scaledNumber(base: number, bonusPercent: number) {
  return Math.min(
    MAXIMUM_SAFE_RUNTIME_VALUE,
    base * finite(1 + bonusPercent / 100),
  );
}

function scaledInteger(base: number, bonusPercent: number) {
  return Math.max(1, Math.floor(scaledNumber(base, bonusPercent)));
}

function safeAdd(value: number, amount: number) {
  return Math.min(MAXIMUM_SAFE_RUNTIME_VALUE, finite(value) + amount);
}

function finite(value: number) {
  return Number.isFinite(value)
    ? Math.max(0, value)
    : MAXIMUM_SAFE_RUNTIME_VALUE;
}
