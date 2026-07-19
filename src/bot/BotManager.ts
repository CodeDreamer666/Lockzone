import "@babylonjs/loaders/glTF";
import {
  AbstractMesh,
  Mesh,
  Ray,
  Scene,
  SceneLoader,
  Vector3,
} from "@babylonjs/core";
import {
  type WaveConfig,
} from "../game/gameConfig";
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
  private modelSource?: AbstractMesh;
  private wave?: WaveConfig;
  private lastGunshot?: { position: Vector3; time: number };
  private nextSpawnAt = Infinity;
  private spawnedCount = 0;
  private defeatedCount = 0;
  private elevatedSpawnedCount = 0;
  private nextBotId = 0;
  private waveActive = false;

  constructor(
    private readonly scene: Scene,
    private readonly cover: AbstractMesh[],
    spawns: Vector3[],
    resourcePoints: Vector3[],
    private readonly onBotDefeated: (bot: BotController) => void,
  ) {
    const elevatedResourceSpawns = resourcePoints.filter(
      (point) => point.y > 4,
    );
    this.spawnPoints = [...spawns, ...elevatedResourceSpawns].map(
      (point) => point.clone(),
    );
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

  async loadModels() {
    const loaded = await SceneLoader.ImportMeshAsync(
      "",
      "/assets/",
      "CesiumMan.glb",
      this.scene,
    );
    const source = loaded.meshes.find(
      (mesh) => mesh.name === "__root__",
    ) ?? loaded.meshes[0];
    if (!source) {
      throw new Error("Opponent model did not contain a root mesh");
    }
    loaded.animationGroups.forEach((animation) => animation.start(true));
    source.setEnabled(false);
    this.modelSource = source;
  }

  startWave(config: WaveConfig, now: number) {
    this.clearBots();
    this.wave = config;
    this.spawnedCount = 0;
    this.defeatedCount = 0;
    this.elevatedSpawnedCount = 0;
    this.nextBotId = (config.number - 1) * 100;
    this.nextSpawnAt = now;
    this.waveActive = true;
    this.lastGunshot = undefined;
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
    onBotShot: (bot: BotController) => void,
    onPlayerHit: (damageMultiplier: number) => void,
  ) {
    if (!this.waveActive || !this.wave) return;
    this.removeExpiredCorpses(now);
    this.trySpawn(now, playerPosition, playerViewDirection);
    for (const bot of this.bots) {
      bot.update({
        now,
        dt,
        playerPosition,
        playerTarget,
        cover: this.cover,
        patrolPoints: this.patrolPoints,
        teammates: this.bots,
        lastGunshot: this.lastGunshot,
        onShot: onBotShot,
        onHitPlayer: onPlayerHit,
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

  eliminateActiveBots(now: number) {
    const activeBots = this.bots.filter((bot) => bot.isAlive);
    activeBots.forEach((bot) => {
      this.damageBot(bot, bot.health, now);
    });
    return activeBots.length;
  }

  reportPlayerGunshot(position: Vector3, time: number) {
    if (!this.waveActive) return;
    this.lastGunshot = { position: position.clone(), time };
  }

  getBotByMesh(mesh: AbstractMesh) {
    return this.bots.find(
      (bot) => bot.isAlive && bot.mesh === mesh,
    );
  }

  dispose() {
    this.stopWave();
    this.modelSource?.dispose();
    this.modelSource = undefined;
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
    const shouldUseElevation = (
      this.wave.number > 1
      && (this.spawnedCount + 1) % this.wave.elevatedSpawnFrequency === 0
    );
    const candidates = this.spawnPoints
      .map((position, index) => ({ position, index }))
      .filter(({ position }) => (
        shouldUseElevation ? position.y > 4 : position.y <= 4
      ))
      .filter(({ position }) => this.isSpawnSafe(
        position,
        playerPosition,
        playerViewDirection,
      ))
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
        .filter(({ index }) => !this.recentlyUsedSpawns.includes(index));
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

  private spawnBot(spawn: Vector3) {
    if (!this.modelSource || !this.wave) return;
    const visual = this.modelSource.clone(
      `bot ${this.nextBotId} visual`,
      null,
      false,
    );
    if (!visual) {
      throw new Error(`Could not clone opponent model ${this.nextBotId}`);
    }
    const bot = new BotController(
      this.scene,
      spawn,
      this.nextBotId,
      this.wave,
      visual,
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
    ].map((point) => point.clone());
  }
}
