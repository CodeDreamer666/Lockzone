import "@babylonjs/loaders/glTF";
import { AbstractMesh, Mesh, Ray, Scene, SceneLoader, Vector3 } from "@babylonjs/core";
import { BotController } from "./BotController";
import { GAME_CONFIG } from "../game/gameConfig";

/** Coordinates shared perception, spawn safety, and asset reuse for the bot team. */
export class BotManager {
  readonly bots: BotController[] = [];
  private lastGunshot?: { position: Vector3; time: number };

  constructor(
    private scene: Scene,
    private cover: AbstractMesh[],
    spawns: Vector3[],
    private patrolPoints: Vector3[],
    private playerSpawn: Vector3,
  ) {
    const safeSpawns = spawns.filter((spawn) => this.isSpawnProtected(spawn));
    const spawnPool = safeSpawns.length >= GAME_CONFIG.bot.count ? safeSpawns : spawns;
    for (let index = 0; index < GAME_CONFIG.bot.count; index++) {
      const spawn = spawnPool[index % spawnPool.length];
      this.bots.push(new BotController(scene, spawn, index));
    }
  }

  get remaining() { return this.bots.filter((bot) => bot.isAlive).length; }

  async loadModels() {
    const loaded = await SceneLoader.ImportMeshAsync("", "/assets/", "CesiumMan.glb", this.scene);
    const source = loaded.meshes.find((mesh) => mesh.name === "__root__") ?? loaded.meshes[0];
    if (!source) throw new Error("Opponent model did not contain a root mesh");
    this.bots[0]?.setVisual(source, loaded.animationGroups[0]);
    for (let index = 1; index < this.bots.length; index++) {
      const clone = source.clone(`bot ${index} visual`, null, true);
      if (!clone) throw new Error(`Could not clone opponent model ${index}`);
      this.bots[index].setVisual(clone);
    }
  }

  update(now: number, dt: number, playerPosition: Vector3, playerTarget: Mesh, onBotShot: (bot: BotController) => void, onPlayerHit: () => void) {
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

  reportPlayerGunshot(position: Vector3, time: number) {
    this.lastGunshot = { position: position.clone(), time };
  }

  getBotByMesh(mesh: AbstractMesh) { return this.bots.find((bot) => bot.mesh === mesh); }
  dispose() { this.bots.forEach((bot) => bot.dispose()); }

  private isSpawnProtected(spawn: Vector3) {
    const direction = spawn.subtract(this.playerSpawn);
    const ray = new Ray(this.playerSpawn.add(new Vector3(0, 1, 0)), direction.normalize(), direction.length());
    const hit = this.scene.pickWithRay(ray, (mesh) => this.cover.some((wall) => wall === mesh));
    return hit?.hit === true;
  }
}
