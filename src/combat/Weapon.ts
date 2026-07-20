import { GAME_CONFIG } from "../game/gameConfig";
import { canStartReload, consumeMagazineRound } from "./weaponRules";

export class Weapon {
  magazine: number = GAME_CONFIG.weapon.magazineSize;
  isReloading = false;
  private magazineSize: number = GAME_CONFIG.weapon.magazineSize;
  private reloadMs: number = GAME_CONFIG.weapon.reloadMs;
  private lastShotAt = -Infinity;
  private reloadTimer?: number;
  private reloadStageTimer?: number;

  canFire(
    now: number,
    roundsPerMinute: number = GAME_CONFIG.weapon.roundsPerMinute,
  ) {
    const shotIntervalMs = 60_000 / roundsPerMinute;
    return !this.isReloading && this.magazine > 0 && now - this.lastShotAt >= shotIntervalMs;
  }
  fire(now: number) {
    // Anchor to the real shot timestamp. Advancing from an old timestamp after a
    // reload would create a backlog of immediately eligible shots.
    this.lastShotAt = now;
    this.magazine = consumeMagazineRound(this.magazine);
  }
  reload(onDone: () => void, onMagazineSeated?: () => void) {
    if (!canStartReload(
      this.magazine,
      this.magazineSize,
      this.isReloading,
    )) {
      return false;
    }
    this.isReloading = true;
    this.reloadStageTimer = window.setTimeout(() => {
      this.reloadStageTimer = undefined;
      onMagazineSeated?.();
    }, this.reloadMs * 0.58);
    this.reloadTimer = window.setTimeout(() => {
      this.magazine = this.magazineSize;
      this.isReloading = false;
      this.reloadTimer = undefined;
      onDone();
    }, this.reloadMs);
    return true;
  }
  refill() {
    this.cancelReload();
    this.magazine = this.magazineSize;
    this.isReloading = false;
  }
  configure(magazineSize: number, reloadMs: number, refill = true) {
    const previousMagazineSize = this.magazineSize;
    this.cancelReload();
    this.magazineSize = Math.max(1, Math.floor(finite(magazineSize)));
    this.reloadMs = Math.max(Number.MIN_VALUE, finite(reloadMs));
    this.isReloading = false;
    this.magazine = refill
      ? this.magazineSize
      : Math.min(
          this.magazineSize,
          this.magazine + Math.max(0, this.magazineSize - previousMagazineSize),
        );
  }
  dispose() {
    this.cancelReload();
  }

  private cancelReload() {
    if (this.reloadTimer !== undefined) window.clearTimeout(this.reloadTimer);
    if (this.reloadStageTimer !== undefined) window.clearTimeout(this.reloadStageTimer);
    this.reloadTimer = undefined;
    this.reloadStageTimer = undefined;
  }
}

function finite(value: number) {
  return Number.isFinite(value) ? value : Number.MAX_SAFE_INTEGER;
}
