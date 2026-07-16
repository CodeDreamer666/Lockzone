import { GAME_CONFIG } from "../game/gameConfig";

export class Weapon {
  magazine: number = GAME_CONFIG.weapon.magazineSize;
  isReloading = false;
  private lastShotAt = -Infinity;
  private reloadTimer?: number;

  canFire(now: number) {
    const shotIntervalMs = 60_000 / GAME_CONFIG.weapon.roundsPerMinute;
    return !this.isReloading && this.magazine > 0 && now - this.lastShotAt >= shotIntervalMs;
  }
  fire(now: number) {
    // Anchor to the real shot timestamp. Advancing from an old timestamp after a
    // reload would create a backlog of immediately eligible shots.
    this.lastShotAt = now;
    this.magazine--;
  }
  reload(onDone: () => void) {
    if (this.isReloading || this.magazine === GAME_CONFIG.weapon.magazineSize) return false;
    this.isReloading = true;
    this.reloadTimer = window.setTimeout(() => {
      this.magazine = GAME_CONFIG.weapon.magazineSize;
      this.isReloading = false;
      this.reloadTimer = undefined;
      onDone();
    }, GAME_CONFIG.weapon.reloadMs);
    return true;
  }
  dispose() { if (this.reloadTimer !== undefined) window.clearTimeout(this.reloadTimer); }
}
