import { GAME_CONFIG } from "./gameConfig";
import {
  type HorizontalPosition,
  getSafeZoneAt,
} from "../map/safeZones";

export type ShopKind = "movement" | "health" | "weapon" | "utility";
export type WeaponKind = "assault-rifle" | "smg" | "shotgun" | "dmr";

export type ShopPurchaseId =
  | "movement-5"
  | "movement-10"
  | "movement-20"
  | "health-10"
  | "health-25"
  | "health-50"
  | "weapon-assault-rifle"
  | "weapon-smg"
  | "weapon-shotgun"
  | "weapon-dmr"
  | "utility-damage"
  | "utility-reload"
  | "utility-magazine"
  | "utility-knife";

export const SHOP_PURCHASE_IDS: readonly ShopPurchaseId[] = [
  "movement-5",
  "movement-10",
  "movement-20",
  "health-10",
  "health-25",
  "health-50",
  "weapon-assault-rifle",
  "weapon-smg",
  "weapon-shotgun",
  "weapon-dmr",
  "utility-damage",
  "utility-reload",
  "utility-magazine",
  "utility-knife",
];

export interface RunShopState {
  movementBonusPercent: number;
  maximumHealth: number;
  selectedWeapon: WeaponKind;
  gunDamageBonus: number;
  reloadSpeedBonusPercent: number;
  magazineBonus: number;
  knifeDamage: number;
}

export interface WeaponDefinition {
  displayName: string;
  bodyDamage: number;
  headshotDamage: number;
  magazineSize: number;
  reloadMs: number;
  roundsPerMinute: number;
  range: number;
  spread: number;
}

const MAXIMUM_SAFE_RUNTIME_VALUE = Number.MAX_SAFE_INTEGER;

export const SHOP_NAMES: Record<ShopKind, string> = {
  movement: "Movement Shop",
  health: "Health Shop",
  weapon: "Weapon Shop",
  utility: "Utility Shop",
};

export const WEAPON_DEFINITIONS: Record<WeaponKind, WeaponDefinition> = {
  "assault-rifle": {
    displayName: "Assault Rifle",
    bodyDamage: GAME_CONFIG.weapon.bodyDamage,
    headshotDamage: GAME_CONFIG.weapon.headshotDamage,
    magazineSize: GAME_CONFIG.weapon.magazineSize,
    reloadMs: GAME_CONFIG.weapon.reloadMs,
    roundsPerMinute: GAME_CONFIG.weapon.roundsPerMinute,
    range: GAME_CONFIG.weapon.range,
    spread: GAME_CONFIG.weapon.hipSpread,
  },
  smg: {
    displayName: "SMG",
    bodyDamage: 14,
    headshotDamage: 34,
    magazineSize: 50,
    reloadMs: 1_550,
    roundsPerMinute: 850,
    range: 48,
    spread: 0.018,
  },
  shotgun: {
    displayName: "Shotgun",
    bodyDamage: 72,
    headshotDamage: 96,
    magazineSize: 8,
    reloadMs: 2_200,
    roundsPerMinute: 95,
    range: 22,
    spread: 0.042,
  },
  dmr: {
    displayName: "DMR / Sniper",
    bodyDamage: 48,
    headshotDamage: 110,
    magazineSize: 12,
    reloadMs: 2_350,
    roundsPerMinute: 180,
    range: 120,
    spread: 0.004,
  },
};

const SAFE_ZONE_SHOPS: Record<string, ShopKind> = {
  southwest: "movement",
  southeast: "health",
  northwest: "weapon",
  northeast: "utility",
};

export function createInitialShopState(): RunShopState {
  return {
    movementBonusPercent: 0,
    maximumHealth: GAME_CONFIG.player.health,
    selectedWeapon: "assault-rifle",
    gunDamageBonus: 0,
    reloadSpeedBonusPercent: 0,
    magazineBonus: 0,
    knifeDamage: 35,
  };
}

export function getShopAtPosition(position: HorizontalPosition) {
  const zone = getSafeZoneAt(position);
  return zone ? SAFE_ZONE_SHOPS[zone.id] : undefined;
}

export function applyShopPurchase(
  state: RunShopState,
  purchaseId: ShopPurchaseId,
) {
  const next = { ...state };

  switch (purchaseId) {
    case "movement-5":
      next.movementBonusPercent = safeAdd(next.movementBonusPercent, 5);
      break;
    case "movement-10":
      next.movementBonusPercent = safeAdd(next.movementBonusPercent, 10);
      break;
    case "movement-20":
      next.movementBonusPercent = safeAdd(next.movementBonusPercent, 20);
      break;
    case "health-10":
      next.maximumHealth = safeAdd(next.maximumHealth, 10);
      break;
    case "health-25":
      next.maximumHealth = safeAdd(next.maximumHealth, 25);
      break;
    case "health-50":
      next.maximumHealth = safeAdd(next.maximumHealth, 50);
      break;
    case "weapon-assault-rifle":
      next.selectedWeapon = "assault-rifle";
      break;
    case "weapon-smg":
      next.selectedWeapon = "smg";
      break;
    case "weapon-shotgun":
      next.selectedWeapon = "shotgun";
      break;
    case "weapon-dmr":
      next.selectedWeapon = "dmr";
      break;
    case "utility-damage":
      next.gunDamageBonus = safeAdd(next.gunDamageBonus, 5);
      break;
    case "utility-reload":
      next.reloadSpeedBonusPercent = safeAdd(
        next.reloadSpeedBonusPercent,
        10,
      );
      break;
    case "utility-magazine":
      next.magazineBonus = safeAdd(next.magazineBonus, 5);
      break;
    case "utility-knife":
      next.knifeDamage = safeAdd(next.knifeDamage, 10);
      break;
  }

  return next;
}

export function isShopPurchaseId(value: string): value is ShopPurchaseId {
  return SHOP_PURCHASE_IDS.some((purchaseId) => purchaseId === value);
}

export function movementSpeedMultiplier(state: RunShopState) {
  return finite(1 + state.movementBonusPercent / 100);
}

export function currentWeaponStats(state: RunShopState) {
  const base = WEAPON_DEFINITIONS[state.selectedWeapon];
  const reloadDivisor = finite(1 + state.reloadSpeedBonusPercent / 100);

  return {
    ...base,
    bodyDamage: safeAdd(base.bodyDamage, state.gunDamageBonus),
    headshotDamage: safeAdd(base.headshotDamage, state.gunDamageBonus),
    magazineSize: Math.max(
      1,
      Math.floor(safeAdd(base.magazineSize, state.magazineBonus)),
    ),
    reloadMs: Math.max(Number.MIN_VALUE, base.reloadMs / reloadDivisor),
  };
}

function safeAdd(value: number, amount: number) {
  return Math.min(MAXIMUM_SAFE_RUNTIME_VALUE, finite(value) + amount);
}

function finite(value: number) {
  return Number.isFinite(value)
    ? Math.max(0, value)
    : MAXIMUM_SAFE_RUNTIME_VALUE;
}
