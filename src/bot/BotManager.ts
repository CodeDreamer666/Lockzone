import {
  AbstractMesh,
  Mesh,
  Ray,
  Scene,
  Vector3,
} from "@babylonjs/core";
import {
  getEnemyTypeForSpawn,
  selectAttackerIds,
  type WaveConfig,
} from "../game/gameConfig";
import { isInsideSafeZone } from "../map/safeZones";
import { BotController } from "./BotController";

const MINIMUM_SPAWN_DISTANCE = 12;
const VIEW_CONE_COSINE = Math.cos(50 * Math.PI / 180);
const INITIAL_SPAWN_DELAY_MS = 240;
const CORPSE_LIFETIME_MS = 900;

/** Coordinates wave population, safe spawning, shared perception, and model reuse. */
export class BotManager {
  readonly bots: BotController[] = [];
  private readonly spawnPoints: Vector3[];
  private readonly patrolPoints: Vector3[];
  private readonly recentlyUsedSpawns: number[] = [];
  private readonly defeatedAt = new Map<BotController, number>();
  private wave?: WaveConfig;
  private lastGunshot?: { position: Vector3; time: number };
  private nextSpawnAt = Infinity;
  private spawnedCount = 0;
  private defeatedCount = 0;
  private elevatedSpawnedCount = 0;
  private nextBotId = 0;
  private waveActive = false;
  private activeShooterCount = 0;

  constructor(
    private readonly scene: Scene,
    private readonly cover: AbstractMesh[],
    private readonly ground: AbstractMesh[],
    spawns: Vector3[],
    resourcePoints: Vector3[],
    private readonly onBotDefeated: (bot: BotController) => void,
  ) {
    this.spawnPoints = spawns.map(
      (point) => point.clone(),
    ).filter((point) => !isInsideSafeZone(point));
    this.patrolPoints = this.createPatrolPoints(
      spawns,
      resourcePoints,
    );
  }

  get alive() {
    return this.bots.filter((bot) => bot.isAlive).length;
  }

  get defeated() {
    return this.defeatedCount;
  }

  get elevatedSpawned() {
    return this.elevatedSpawnedCount;
  }

  get activeShooters() {
    return this.activeShooterCount;
  }

  get waitingToSpawn() {
    return Math.max(
      0,
      (this.wave?.totalEnemies ?? 0) - this.spawnedCount,
    );
  }

  get remaining() {
    return Math.max(
      0,
      (this.wave?.totalEnemies ?? 0) - this.defeatedCount,
    );
  }

  get isWaveComplete() {
    return (
      !!this.wave
      && this.defeatedCount === this.wave.totalEnemies
    );
  }

  get debugBots() {
    return this.bots
      .filter((bot) => bot.isAlive)
      .map((bot) => bot.debugSummary);
  }

  get remainingEnemyLocations() {
    if (
      !this.waveActive
      || this.remaining === 0
      || this.remaining > 5
    ) {
      return [];
    }
    return this.bots
      .filter((bot) => bot.isAlive)
      .map((bot) => ({
        id: bot.id,
        label: bot.locationLabel,
        position: bot.mesh.position.clone(),
      }));
  }

  async loadModels() {
    // Tactical opponents are assembled from local Babylon primitives.
    // Keep this async boundary so a rigged model can be restored later.
    await Promise.resolve();
  }

  startWave(config: WaveConfig, now: number) {
    this.clearBots();
    this.wave = config;
    this.spawnedCount = 0;
    this.defeatedCount = 0;
    this.elevatedSpawnedCount = 0;
    this.nextBotId = (config.number - 1) * 1000;
    this.nextSpawnAt = now;
    this.waveActive = true;
    this.activeShooterCount = 0;
    this.lastGunshot = undefined;
    this.activeShooterCount = 0;
    this.recentlyUsedSpawns.length = 0;
  }

  stopWave() {
    this.waveActive = false;
    this.nextSpawnAt = Infinity;
    this.lastGunshot = undefined;
    this.clearBots();
  }

  update(
    now: number,
    dt: number,
    playerPosition: Vector3,
    playerViewDirection: Vector3,
    playerTarget: Mesh,
    playerSpeed: number,
    maximumPlayerHealth: number,
    onBotShot: (bot: BotController, origin: Vector3, direction: Vector3) => void,
    onPlayerHit: (damage: number) => void,
    onBotFootstep: (position: Vector3) => void,
  ) {
    if (!this.waveActive || !this.wave) return;
    this.removeExpiredCorpses(now);
    this.trySpawn(now, playerPosition, playerViewDirection);
    const shooterIds = new Set(
      selectAttackerIds(
        this.bots.map((bot) => ({
          id: bot.id,
          ready: bot.wantsAttackSlot(now),
          distanceSquared: Vector3.DistanceSquared(
            bot.mesh.position,
            playerPosition,
          ),
        })),
        this.wave.maximumShooters,
      ),
    );
    this.activeShooterCount = shooterIds.size;
    for (const bot of this.bots) {
      bot.update({
        now,
        dt,
        playerPosition,
        playerTarget,
        playerSpeed,
        maximumPlayerHealth,
        canShoot: shooterIds.has(bot.id),
        cover: this.cover,
        ground: this.ground,
        patrolPoints: this.patrolPoints,
        teammates: this.bots,
        lastGunshot: this.lastGunshot,
        onShot: onBotShot,
        onHitPlayer: onPlayerHit,
        onFootstep: onBotFootstep,
      });
    }
  }

  damageBot(bot: BotController, amount: number, now: number) {
    if (!this.waveActive || !this.bots.includes(bot)) return false;
    const defeated = bot.takeDamage(amount, now);
    if (!defeated) return false;
    this.defeatedCount += 1;
    this.defeatedAt.set(bot, now);
    this.onBotDefeated(bot);
    if (
      this.wave
      && this.spawnedCount < this.wave.totalEnemies
      && !Number.isFinite(this.nextSpawnAt)
    ) {
      this.nextSpawnAt = now + this.wave.replacementDelayMs;
    }
    return true;
  }

  eliminateActiveBots(now: number, maximum = Infinity) {
    const activeBots = this.bots
      .filter((bot) => bot.isAlive)
      .slice(0, Math.max(0, maximum));
    activeBots.forEach((bot) => {
      this.damageBot(bot, bot.health, now);
    });
    return activeBots.length;
  }

  prepareFinalEnemiesForTest(now: number, remainingEnemies = 5) {
    if (!this.waveActive || !this.wave) return;
    const remaining = Math.max(
      0,
      Math.min(this.wave.totalEnemies, Math.floor(remainingEnemies)),
    );
    this.clearBots();
    this.defeatedCount = this.wave.totalEnemies - remaining;
    this.spawnedCount = this.defeatedCount;
    this.nextSpawnAt = now;
  }

  reportPlayerGunshot(position: Vector3, time: number) {
    if (!this.waveActive) return;
    this.lastGunshot = { position: position.clone(), time };
  }

  getBotByMesh(mesh: AbstractMesh) {
    return this.bots.find(
      (bot) => (
        bot.isAlive
        && (bot.bodyHitbox === mesh || bot.headHitbox === mesh)
      ),
    );
  }

  dispose() {
    this.stopWave();
  }

  private trySpawn(
    now: number,
    playerPosition: Vector3,
    playerViewDirection: Vector3,
  ) {
    if (
      !this.wave
      || now < this.nextSpawnAt
      || this.alive >= this.wave.maximumAlive
      || this.spawnedCount >= this.wave.totalEnemies
    ) {
      return;
    }
    const spawn = this.chooseSpawn(
      playerPosition,
      playerViewDirection,
    );
    if (!spawn) {
      this.nextSpawnAt = now + 300;
      return;
    }
    this.spawnBot(spawn);
    const needsAnother = (
      this.alive < this.wave.maximumAlive
      && this.spawnedCount < this.wave.totalEnemies
    );
    if (!needsAnother) {
      this.nextSpawnAt = Infinity;
      return;
    }
    const fillingInitialTeam = this.defeatedCount === 0;
    this.nextSpawnAt = now + (
      fillingInitialTeam
        ? INITIAL_SPAWN_DELAY_MS
        : this.wave.replacementDelayMs
    );
  }

  private chooseSpawn(
    playerPosition: Vector3,
    playerViewDirection: Vector3,
  ) {
    if (!this.wave) return undefined;
    const candidates = this.spawnPoints
      .map((position, index) => ({ position, index }))
      .filter(({ position }) => this.isSpawnSafe(
        position,
        playerPosition,
        playerViewDirection,
      ))
      .filter(({ position }) => this.isSpawnClear(position))
      .filter(({ index }) => !this.recentlyUsedSpawns.includes(index));
    const safePool = candidates.length > 0
      ? candidates
      : this.spawnPoints
        .map((position, index) => ({ position, index }))
        .filter(({ position }) => this.isSpawnSafe(
          position,
          playerPosition,
          playerViewDirection,
        ))
        .filter(({ position }) => this.isSpawnClear(position));
    if (safePool.length === 0) return undefined;
    safePool.sort(
      (left, right) => (
        Vector3.DistanceSquared(right.position, playerPosition)
        - Vector3.DistanceSquared(left.position, playerPosition)
      ),
    );
    const selectionWindow = Math.min(3, safePool.length);
    const selected = safePool[
      (this.spawnedCount + this.wave.number) % selectionWindow
    ];
    this.recentlyUsedSpawns.push(selected.index);
    if (this.recentlyUsedSpawns.length > 3) {
      this.recentlyUsedSpawns.shift();
    }
    return selected.position;
  }

  private isSpawnSafe(
    spawn: Vector3,
    playerPosition: Vector3,
    playerViewDirection: Vector3,
  ) {
    const direction = spawn.subtract(playerPosition);
    const distance = direction.length();
    if (distance < MINIMUM_SPAWN_DISTANCE) return false;
    const viewDirection = playerViewDirection.clone().normalize();
    const withinView = Vector3.Dot(
      viewDirection,
      direction.clone().normalize(),
    ) > VIEW_CONE_COSINE;
    if (!withinView) return true;
    const eye = playerPosition.clone();
    const target = spawn.add(new Vector3(0, 0.5, 0));
    const rayDirection = target.subtract(eye);
    const rayDistance = rayDirection.length();
    const obstruction = this.scene.pickWithRay(
      new Ray(eye, rayDirection.normalize(), rayDistance),
      (mesh) => this.cover.includes(mesh),
    );
    return obstruction?.hit === true;
  }

  private isSpawnClear(spawn: Vector3) {
    const groundProbe = this.scene.pickWithRay(
      new Ray(spawn.add(new Vector3(0, 2, 0)), Vector3.Down(), 5),
      (mesh) => this.ground.includes(mesh),
    );
    if (!groundProbe?.hit || !groundProbe.pickedPoint) return false;
    if (Math.abs(groundProbe.pickedPoint.y - (spawn.y - 1.3)) > 0.6) {
      return false;
    }
    if (this.bots.some((bot) => (
      bot.isAlive
      && Vector3.DistanceSquared(bot.mesh.position, spawn) < 4.84
    ))) {
      return false;
    }

    return !this.cover.some((mesh) => {
      if (this.ground.includes(mesh) || !mesh.isEnabled()) return false;
      const bounds = mesh.getBoundingInfo().boundingBox;
      const minimum = bounds.minimumWorld;
      const maximum = bounds.maximumWorld;
      const overlapsHorizontally = (
        spawn.x >= minimum.x - 0.55
        && spawn.x <= maximum.x + 0.55
        && spawn.z >= minimum.z - 0.55
        && spawn.z <= maximum.z + 0.55
      );
      const overlapsVertically = (
        spawn.y + 1.2 >= minimum.y
        && spawn.y - 1.2 <= maximum.y
      );
      return overlapsHorizontally && overlapsVertically;
    });
  }

  private spawnBot(spawn: Vector3) {
    if (!this.wave) return;
    const groundedSpawn = spawn.clone();
    const groundProbe = this.scene.pickWithRay(
      new Ray(spawn.add(new Vector3(0, 2, 0)), Vector3.Down(), 5),
      (mesh) => this.ground.includes(mesh),
    );
    if (groundProbe?.pickedPoint) {
      groundedSpawn.y = groundProbe.pickedPoint.y + 1.3;
    }
    const bot = new BotController(
      this.scene,
      groundedSpawn,
      this.nextBotId,
      this.wave,
      getEnemyTypeForSpawn(
        this.wave.number,
        this.spawnedCount,
      ),
    );
    this.bots.push(bot);
    this.nextBotId += 1;
    this.spawnedCount += 1;
    if (spawn.y > 4) this.elevatedSpawnedCount += 1;
  }

  private removeExpiredCorpses(now: number) {
    for (const [bot, defeatedAt] of this.defeatedAt) {
      if (now - defeatedAt < CORPSE_LIFETIME_MS) continue;
      this.defeatedAt.delete(bot);
      const index = this.bots.indexOf(bot);
      if (index >= 0) this.bots.splice(index, 1);
      bot.dispose();
    }
  }

  private clearBots() {
    this.bots.forEach((bot) => bot.dispose());
    this.bots.length = 0;
    this.defeatedAt.clear();
  }

  private createPatrolPoints(
    spawns: Vector3[],
    resourcePoints: Vector3[],
  ) {
    const elevatedOffsets = this.spawnPoints
      .filter((point) => point.y > 4)
      .flatMap((point) => [
        point.add(new Vector3(1.6, 0, 0)),
        point.add(new Vector3(-1.6, 0, 0)),
        point.add(new Vector3(0, 0, 1.6)),
        point.add(new Vector3(0, 0, -1.6)),
      ]);
    return [
      ...spawns,
      ...resourcePoints,
      ...elevatedOffsets,
    ]
      .filter((point) => !isInsideSafeZone(point))
      .map((point) => point.clone());
  }
}
