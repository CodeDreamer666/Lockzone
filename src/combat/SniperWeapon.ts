export const SNIPER_CONFIG = {
  damage: 200,
  maximumShots: 6,
  rechargeMs: 60_000,
  roundsPerMinute: 70,
  range: 160,
  recoil: 0.045,
} as const;

export class SniperWeapon {
  shotsRemaining = SNIPER_CONFIG.maximumShots;
  private lastShotAt = -Infinity;
  private rechargeEndsAt?: number;

  get isRecharging() {
    return this.rechargeEndsAt !== undefined;
  }

  update(now: number) {
    if (
      this.rechargeEndsAt !== undefined
      && now >= this.rechargeEndsAt
    ) {
      this.shotsRemaining = SNIPER_CONFIG.maximumShots;
      this.rechargeEndsAt = undefined;
      this.lastShotAt = -Infinity;
      return true;
    }
    return false;
  }

  canFire(now: number) {
    this.update(now);
    const shotInterval = 60_000 / SNIPER_CONFIG.roundsPerMinute;
    return (
      !this.isRecharging
      && this.shotsRemaining > 0
      && now - this.lastShotAt >= shotInterval
    );
  }

  fire(now: number) {
    if (!this.canFire(now)) return false;
    this.lastShotAt = now;
    this.shotsRemaining -= 1;
    if (this.shotsRemaining === 0) {
      this.rechargeEndsAt = now + SNIPER_CONFIG.rechargeMs;
    }
    return true;
  }

  getRechargeRemainingMs(now: number) {
    this.update(now);
    return this.rechargeEndsAt === undefined
      ? 0
      : Math.max(0, this.rechargeEndsAt - now);
  }

  reset() {
    this.shotsRemaining = SNIPER_CONFIG.maximumShots;
    this.lastShotAt = -Infinity;
    this.rechargeEndsAt = undefined;
  }
}
