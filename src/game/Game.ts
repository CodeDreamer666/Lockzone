import {
  AbstractMesh,
  Color3,
  DirectionalLight,
  Engine,
  FreeCamera,
  GlowLayer,
  HemisphericLight,
  Mesh,
  MeshBuilder,
  PBRMaterial,
  Ray,
  RenderTargetTexture,
  Scene,
  ShadowGenerator,
  StandardMaterial,
  TransformNode,
  Vector3,
} from "@babylonjs/core";
import { AudioManager } from "../audio/AudioManager";
import { BotManager } from "../bot/BotManager";
import { Weapon } from "../combat/Weapon";
import {
  createMap,
  DISTRICT_DIMENSIONS,
  type BulletMaterial,
  type SurfaceType,
} from "../map/createMap";
import { createMovementTestMap } from "../map/createMovementTestMap";
import { isInsideSafeZone } from "../map/safeZones";
import { GameUI } from "../ui/GameUI";
import {
  GAME_CONFIG,
  createWaveConfig,
  OPENING_COUNTDOWN_SECONDS,
  WAVE_TRANSITION_SECONDS,
} from "./gameConfig";
import {
  consumeLookDelta,
  type LookDelta,
  queueLookDelta,
} from "./cameraLook";
import {
  PlayerController,
  type MovementSnapshot,
} from "./PlayerController";
import { clampDeltaSeconds } from "./movementMath";
import { PushablePropController } from "./PushablePropController";

type MatchPhase = "opening" | "active" | "transition" | "ended";

export class Game {
  private readonly canvas = document.querySelector<HTMLCanvasElement>("#game-canvas")!;
  private readonly engine = new Engine(this.canvas, true, { preserveDrawingBuffer: true, stencil: true });
  private readonly audio = new AudioManager();
  private readonly ui = new GameUI();
  private scene!: Scene;
  private camera!: FreeCamera;
  private playerTarget!: Mesh;
  private botManager?: BotManager;
  private weapon = new Weapon();
  private cover: AbstractMesh[] = [];
  private walkableSurfaces: AbstractMesh[] = [];
  private playerHealth: number = GAME_CONFIG.player.health;
  private playerDamagedAt = -Infinity;
  private regenerationActive = false;
  private remaining = 0;
  private phase: MatchPhase = "opening";
  private phaseRemaining = OPENING_COUNTDOWN_SECONDS;
  private waveIndex = 0;
  private wavesCompleted = 0;
  private totalEnemiesDefeated = 0;
  private runElapsedSeconds = 0;
  private shotsFired = 0;
  private shotsHit = 0;
  private damageTaken = 0;
  private matchActive = false;
  private keys = new Set<string>();
  private mouseDown = false;
  private aimDown = false;
  private aimBlend = 0;
  private playerController?: PlayerController;
  private pushablePropController?: PushablePropController;
  private feedback = "Click Start to enter the arena";
  private sensitivity: number = GAME_CONFIG.camera.sensitivity;
  private pendingLookDelta: LookDelta = { x: 0, y: 0 };
  private weaponRig?: TransformNode;
  private muzzleFlash?: Mesh;
  private recoil = 0;
  private footstepDistance = 0;
  private currentSurface: SurfaceType = "asphalt";
  private jumpQueued = false;
  private paused = false;
  private presentationTime = 0;
  private readonly collisionDebugAvailable = ["localhost", "127.0.0.1"].includes(window.location.hostname);
  private collisionDebugEnabled = this.collisionDebugAvailable && new URLSearchParams(window.location.search).has("collisionDebug");
  private collisionDebugMeshes: Mesh[] = [];
  private activeContactDebugEnabled = this.collisionDebugAvailable && new URLSearchParams(window.location.search).has("contactDebug");
  private activeContactDebugMeshes: AbstractMesh[] = [];
  private activeContactDebugUpdatedAt = -Infinity;
  private readonly combatEffects = new Set<Mesh>();
  private readonly movementTestMode = this.collisionDebugAvailable
    && new URLSearchParams(window.location.search).has("movementTest");
  private readonly gameplayTestMode = this.collisionDebugAvailable
    && new URLSearchParams(window.location.search).has("gameplayTest");
  private readonly gameplayTestScenario = new URLSearchParams(
    window.location.search,
  ).get("gameplayTest") ?? "victory";
  private gameplayTestNextActionAt = 0;
  private gameplayTestActionComplete = false;
  private gameplayTestMaximumAlive: number[] = [];
  private gameplayTestElevatedSpawns: number[] = [];

  start() {
    this.engine.runRenderLoop(() => this.scene?.render());
    window.addEventListener("resize", () => this.engine.resize());
    this.bindControls();
    void this.showMainMenu();
  }

  private async startMatch() {
    this.ui.showLoading(
      12,
      "Preparing mission systems",
    );
    await this.waitForPaint();
    this.weapon.dispose();
    this.botManager?.dispose();
    this.scene?.dispose();
    this.resetMatch();
    this.createScene();
    this.ui.showLoading(
      64,
      "Loading hostile units",
    );
    this.audio.start();
    this.audio.setPaused(false);
    try {
      await this.botManager?.loadModels();
      this.matchActive = true;
      this.paused = false;
      this.phase = this.movementTestMode ? "active" : "opening";
      this.feedback = this.movementTestMode
          ? "Movement test area — F7 shows controller diagnostics"
          : "Prepare for Wave 1";
      this.ui.showHud();
      this.updateCollisionDebugReadout(performance.now());
      this.resetActiveContactDebug();
      if (
        this.movementTestMode
        && new URLSearchParams(window.location.search).has("runMovementTests")
      ) {
        this.runAutomatedMovementChecks();
      }
      if (
        !this.movementTestMode
        && new URLSearchParams(window.location.search).has("runMapMovementTests")
      ) {
        this.runMapMovementSmokeChecks();
      }
    } catch {
      this.feedback = "Opponent models failed to load. Restart the match to try again.";
    }
  }

  private resetMatch() {
    this.weapon = new Weapon();
    this.playerHealth = GAME_CONFIG.player.health;
    this.playerDamagedAt = -Infinity;
    this.regenerationActive = false;
    this.remaining = 0;
    this.phase = "opening";
    this.phaseRemaining = OPENING_COUNTDOWN_SECONDS;
    this.waveIndex = 0;
    this.wavesCompleted = 0;
    this.totalEnemiesDefeated = 0;
    this.runElapsedSeconds = 0;
    this.shotsFired = 0;
    this.shotsHit = 0;
    this.damageTaken = 0;
    this.gameplayTestNextActionAt = 0;
    this.gameplayTestActionComplete = false;
    this.gameplayTestMaximumAlive = [];
    this.gameplayTestElevatedSpawns = [];
    this.playerController = undefined;
    this.pushablePropController = undefined;
    this.jumpQueued = false;
    this.footstepDistance = 0;
    this.currentSurface = "asphalt";
    this.keys.clear();
    this.feedback = "Prepare for Wave 1";
    this.mouseDown = false;
    this.recoil = 0;
    this.clearLookInput();
    this.clearCombatEffects();
  }

  private createScene() {
    const map = this.createEnvironmentScene(this.movementTestMode);
    this.camera = this.createCamera(map.playerSpawn);
    this.playerController = new PlayerController(
      this.scene,
      this.camera,
      this.cover,
      this.walkableSurfaces,
    );
    this.pushablePropController = new PushablePropController(map.pushableProps, this.cover);
    this.createPlayerTarget();
    this.botManager = this.movementTestMode
      ? undefined
      : new BotManager(
        this.scene,
        this.cover,
        this.walkableSurfaces,
        map.botSpawns,
        map.resourcePoints,
        () => {
          this.totalEnemiesDefeated += 1;
        },
      );
    this.createFirstPersonWeapon();
    this.scene.onBeforeRenderObservable.add(() => this.update());
  }

  private createEnvironmentScene(useMovementTestMap = false) {
    this.scene = new Scene(this.engine);
    this.scene.clearColor.set(0.28, 0.31, 0.3, 1);
    this.scene.fogMode = Scene.FOGMODE_EXP2;
    this.scene.fogDensity = 0.0024;
    this.scene.fogColor = new Color3(0.33, 0.35, 0.33);
    this.scene.imageProcessingConfiguration.toneMappingEnabled = true;
    this.scene.imageProcessingConfiguration.exposure = 1.05;
    this.scene.imageProcessingConfiguration.contrast = 1.12;

    const sun = new DirectionalLight("late afternoon sun", new Vector3(-0.42, -1, 0.28), this.scene);
    sun.position = new Vector3(-45, 70, -65);
    sun.intensity = 2.9;
    sun.diffuse = new Color3(1, 0.76, 0.54);
    const ambient = new HemisphericLight("sky ambience", new Vector3(0, 1, 0), this.scene);
    ambient.intensity = 0.72;
    ambient.diffuse = new Color3(0.58, 0.67, 0.65);
    ambient.groundColor = new Color3(0.055, 0.065, 0.065);
    const shadows = new ShadowGenerator(2048, sun);
    shadows.usePercentageCloserFiltering = true;
    shadows.bias = 0.0005;

    const map = useMovementTestMap
      ? createMovementTestMap(this.scene)
      : createMap(this.scene);
    map.cover.forEach((mesh) => shadows.addShadowCaster(mesh));
    shadows.getShadowMap()!.refreshRate = RenderTargetTexture.REFRESHRATE_RENDER_ONCE;
    this.cover = map.cover;
    this.walkableSurfaces = map.walkableSurfaces;
    if (this.collisionDebugEnabled) this.createCollisionDebugVisuals();
    const glowLayer = new GlowLayer("subtle bloom", this.scene, { blurKernelSize: 32 });
    glowLayer.intensity = 0.16;
    return map;
  }

  private createCamera(position: Vector3) {
    const camera = new FreeCamera("player camera", position, this.scene);
    // The game owns pointer-lock and WASD input. Remove FreeCamera's default
    // keyboard and mouse plugins so they cannot queue a second camera move.
    camera.inputs.clear();
    camera.minZ = 0.1;
    camera.fov = GAME_CONFIG.player.cameraFovDegrees * Math.PI / 180;
    camera.inertia = 0;
    camera.ellipsoid = new Vector3(0.35, 0.85, 0.35);
    camera.ellipsoidOffset = Vector3.Zero();
    camera.checkCollisions = true;
    this.scene.collisionsEnabled = true;
    return camera;
  }

  private async showMainMenu() {
    this.matchActive = false;
    this.paused = false;
    this.mouseDown = false;
    this.aimDown = false;
    this.aimBlend = 0;
    this.keys.clear();
    document.exitPointerLock();
    this.ui.showLoading(10, "Surveying the security district");
    await this.waitForPaint();
    this.weapon.dispose();
    this.botManager?.dispose();
    this.botManager = undefined;
    this.clearCombatEffects();
    this.scene?.dispose();
    this.createPresentationScene();
    this.ui.showLoading(86, "Environment ready");
    await this.waitForPaint();
    this.ui.showStart({
      onStart: () => void this.startMatch(),
    });
  }

  private createPresentationScene() {
    this.createEnvironmentScene(false);
    this.camera = this.createCamera(new Vector3(-34, 10, -35));
    this.camera.checkCollisions = false;
    this.camera.fov = 0.95;
    this.camera.setTarget(new Vector3(0, 3, 0));
    this.presentationTime = 0;
    this.scene.onBeforeRenderObservable.add(() => {
      this.presentationTime += Math.min(this.engine.getDeltaTime() / 1000, 0.04);
      const t = this.presentationTime;
      const views = [
        { position: new Vector3(-34, 10, -35), target: new Vector3(0, 3, 0) },
        { position: new Vector3(-31, 7, 5), target: new Vector3(-4, 3, 5) },
        { position: new Vector3(-5, 9, -33), target: new Vector3(2, 3, 2) },
        { position: new Vector3(34, 11, -22), target: new Vector3(12, 4, 9) },
        { position: new Vector3(31, 12, 34), target: new Vector3(2, 4, 16) },
      ];
      const view = views[Math.floor(t / 7) % views.length];
      this.camera.position.copyFrom(view.position.add(new Vector3(Math.sin(t * 0.09) * 2, Math.sin(t * 0.14) * 0.5, Math.cos(t * 0.08) * 1.5)));
      this.camera.setTarget(view.target);
    });
  }

  private waitForPaint() {
    return new Promise<void>((resolve) => window.setTimeout(resolve, 32));
  }

  private createPlayerTarget() {
    this.playerTarget = MeshBuilder.CreateSphere("player visibility target", { diameter: 0.75 }, this.scene);
    this.playerTarget.parent = this.camera;
    this.playerTarget.position.set(0, -0.45, 0);
    this.playerTarget.visibility = 0.001;
    this.playerTarget.isPickable = true;
  }

  private createFirstPersonWeapon() {
    this.weaponRig = new TransformNode("rifle view model", this.scene);
    this.weaponRig.parent = this.camera;
    this.weaponRig.position.set(0.42, -0.38, 0.72);
    this.weaponRig.rotation.set(0.02, Math.PI, 0);
    const rifle = this.weaponRig;
    const metal = this.createRifleMaterial("rifle metal", new Color3(0.045, 0.055, 0.06), 0.9, 0.36);
    const grip = this.createRifleMaterial("rifle grip", new Color3(0.12, 0.1, 0.08), 0.1, 0.75);
    const addPart = (name: string, position: Vector3, size: [number, number, number], material: PBRMaterial) => {
      const mesh = MeshBuilder.CreateBox(name, { width: size[0], height: size[1], depth: size[2] }, this.scene);
      mesh.parent = rifle;
      mesh.position.copyFrom(position);
      mesh.material = material;
    };
    addPart("rifle receiver", new Vector3(0, 0, 0), [0.22, 0.17, 0.72], metal);
    addPart("rifle barrel", new Vector3(0, 0.02, 0.55), [0.07, 0.07, 0.58], metal);
    addPart("rifle stock", new Vector3(0, 0.01, -0.52), [0.18, 0.16, 0.42], grip);
    addPart("rifle magazine", new Vector3(0.02, -0.18, 0.04), [0.12, 0.32, 0.2], metal);
    this.muzzleFlash = MeshBuilder.CreateSphere("muzzle flash", { diameter: 0.16 }, this.scene);
    this.muzzleFlash.parent = this.weaponRig;
    this.muzzleFlash.position.set(0, 0.02, 0.88);
    const flashMaterial = new StandardMaterial("flash material", this.scene);
    flashMaterial.emissiveColor = new Color3(1, 0.55, 0.08);
    this.muzzleFlash.material = flashMaterial;
    this.muzzleFlash.setEnabled(false);
  }

  private createRifleMaterial(name: string, color: Color3, metallic: number, roughness: number) {
    const material = new PBRMaterial(name, this.scene);
    material.albedoColor = color;
    material.metallic = metallic;
    material.roughness = roughness;
    return material;
  }

  private bindControls() {
    window.onkeydown = (event) => {
      if (["KeyW", "KeyA", "KeyS", "KeyD", "Space", "KeyR", "Escape", "F3", "F7"].includes(event.code)) event.preventDefault();
      if (event.code === "F3" && this.collisionDebugAvailable) {
        this.toggleCollisionDebug();
        return;
      }
      if (event.code === "F7" && this.collisionDebugAvailable) {
        this.toggleActiveContactDebug();
        return;
      }
      if (event.code === "Escape" && this.matchActive) {
        this.pauseMatch();
        return;
      }
      if (!this.matchActive) return;
      this.keys.add(event.code);
      if (event.code === "Space" && !event.repeat) this.jumpQueued = true;
      if (event.code === "KeyR") this.reload();
    };
    window.onkeyup = (event) => this.keys.delete(event.code);
    window.onblur = () => {
      this.clearMovementInput();
      this.clearLookInput();
    };
    this.canvas.onmousedown = (event) => {
      if (
        event.button === 0
        && document.pointerLockElement === this.canvas
      ) {
        this.mouseDown = true;
      }
      if (
        event.button === 2
        && document.pointerLockElement === this.canvas
        && this.phase === "active"
      ) {
        this.aimDown = true;
      }
    };
    this.canvas.onmouseup = (event) => {
      if (event.button === 0) this.mouseDown = false;
      if (event.button === 2) this.aimDown = false;
    };
    this.canvas.oncontextmenu = (event) => event.preventDefault();
    document.onmousemove = (event) => {
      if (document.pointerLockElement !== this.canvas || !this.matchActive) return;
      this.pendingLookDelta = queueLookDelta(
        this.pendingLookDelta,
        event.movementX,
        event.movementY,
      );
    };
    document.onpointerlockchange = () => {
      this.clearLookInput();
      if (!document.pointerLockElement && this.matchActive && !this.paused) this.pauseMatch();
    };
    this.canvas.onclick = () => {
      if (this.matchActive && !this.paused && !document.pointerLockElement) this.lockPointer();
    };
  }

  private update() {
    if (!this.matchActive || this.paused || !this.playerController) return;
    const deltaSeconds = clampDeltaSeconds(this.engine.getDeltaTime());
    if (deltaSeconds === 0) return;
    const now = performance.now();
    this.runElapsedSeconds += deltaSeconds;
    this.updateCameraLook(deltaSeconds);
    this.movePlayer(deltaSeconds);
    this.updateAim(deltaSeconds);
    this.audio.setListener(this.camera.position);

    if (this.phase === "active") {
      this.remaining += deltaSeconds;
      this.updatePlayerRegeneration(now, deltaSeconds);
      if (this.mouseDown) this.shoot(now);
      this.botManager?.update(
        now,
        deltaSeconds,
        this.camera.position,
        this.camera.getDirection(Vector3.Forward()),
        this.playerTarget,
        this.playerController.getSnapshot().velocityAfterCollision.length(),
        (bot) => this.audio.play("enemyShot", bot.mesh.position),
        () => {
          if (
            this.gameplayTestMode
            && this.gameplayTestScenario === "observe"
          ) {
            return;
          }
          this.damagePlayer(GAME_CONFIG.bot.shotDamage, now);
        },
        (position) => this.audio.playBotFootstep(position),
      );
      if (!this.movementTestMode && this.botManager?.isWaveComplete) {
        this.completeWave();
      }
    } else if (
      this.phase === "opening"
      || this.phase === "transition"
    ) {
      this.phaseRemaining = Math.max(
        0,
        this.phaseRemaining - deltaSeconds,
      );
      if (this.phaseRemaining === 0) {
        this.startCurrentWave(now);
      }
    }

    if (this.gameplayTestMode) {
      this.runGameplayTest(now);
    }
    this.recoil = Math.max(0, this.recoil - deltaSeconds * 4.2);
    if (this.weaponRig) {
      this.weaponRig.position.x = 0.42 * (1 - this.aimBlend);
      this.weaponRig.position.y = -0.38 + 0.25 * this.aimBlend - this.recoil * 2;
      this.weaponRig.position.z = 0.72 - 0.12 * this.aimBlend;
    }
    this.updateHud();
    this.updateCollisionDebugReadout(now);
    this.updateActiveContactDebug();
  }

  private startCurrentWave(now: number) {
    const wave = createWaveConfig(this.waveIndex + 1);
    this.phase = "active";
    this.remaining = 0;
    this.feedback = `${wave.name} engaged · ${wave.totalEnemies} enemies`;
    this.botManager?.startWave(wave, now);
  }

  private completeWave() {
    if (this.phase !== "active") return;
    this.gameplayTestElevatedSpawns[this.waveIndex] = 0;
    this.wavesCompleted += 1;
    this.botManager?.stopWave();
    this.clearCombatEffects();
    this.mouseDown = false;
    this.cancelAim();
    this.clearMovementInput();
    this.playerHealth = GAME_CONFIG.player.health;
    this.weapon.refill();
    this.regenerationActive = false;
    this.playerDamagedAt = -Infinity;
    this.waveIndex += 1;
    this.phase = "transition";
    this.phaseRemaining = WAVE_TRANSITION_SECONDS;
    this.remaining = 0;
    this.feedback = "Wave Complete · Health and magazine restored";
  }

  private updateHud() {
    const wave = createWaveConfig(this.waveIndex + 1);
    const transitioning = (
      this.phase === "opening"
      || this.phase === "transition"
    );
    this.ui.update({
      wave: wave.number,
      totalWaves: undefined,
      health: this.playerHealth,
      magazine: this.weapon.magazine,
      enemiesAlive: transitioning ? 0 : (this.botManager?.alive ?? 0),
      enemiesRemaining: transitioning
        ? wave.totalEnemies
        : (this.botManager?.remaining ?? 0),
      remaining: this.remaining,
      message: this.movementTestMode
        ? "Movement test area — F7 shows controller diagnostics"
        : this.weapon.isReloading
          ? "Reloading…"
          : this.feedback,
      announcement: this.phase === "opening"
        ? {
            title: "WAVE 1",
            detail: `${wave.name} · ${wave.totalEnemies} enemies · Begins in ${Math.max(1, Math.ceil(this.phaseRemaining))}`,
          }
        : this.phase === "transition"
          ? {
              title: "WAVE COMPLETE",
              detail: `${wave.name} · ${wave.totalEnemies} enemies · Begins in ${Math.max(
                1,
                Math.ceil(this.phaseRemaining),
              )}`,
            }
          : undefined,
    });
  }

  private runGameplayTest(now: number) {
    const currentAlive = this.botManager?.alive ?? 0;
    this.gameplayTestMaximumAlive[this.waveIndex] = Math.max(
      this.gameplayTestMaximumAlive[this.waveIndex] ?? 0,
      currentAlive,
    );
    if (
      this.phase === "active"
      && !this.gameplayTestActionComplete
      && now >= this.gameplayTestNextActionAt
    ) {
      if (this.gameplayTestScenario === "healthDefeat") {
        this.gameplayTestActionComplete = true;
        this.damagePlayer(this.playerHealth, now);
      } else if (
        this.gameplayTestScenario === "victory"
        &&
        currentAlive > 0
        && (
          (this.botManager?.defeated ?? 0) > 0
          || currentAlive === createWaveConfig(this.waveIndex + 1).maximumAlive
        )
      ) {
        this.botManager?.eliminateActiveBots(now);
        this.gameplayTestNextActionAt = now + 120;
      }
    }
    this.showGameplayTestReport();
  }

  private showGameplayTestReport() {
    this.ui.showGameplayTestReport({
      scenario: this.gameplayTestScenario,
      phase: this.phase,
      wave: this.waveIndex + 1,
      timer: this.remaining,
      alive: this.botManager?.alive ?? 0,
      defeated: this.botManager?.defeated ?? 0,
      waitingToSpawn: this.botManager?.waitingToSpawn ?? 0,
      remaining: this.botManager?.remaining ?? 0,
      health: this.playerHealth,
      magazine: this.weapon.magazine,
      totalEnemiesDefeated: this.totalEnemiesDefeated,
      wavesCompleted: this.wavesCompleted,
      maximumAliveByWave: this.gameplayTestMaximumAlive,
      elevatedSpawnsByWave: this.gameplayTestElevatedSpawns,
      botActivity: this.botManager?.debugBots ?? [],
    });
  }

  private movePlayer(deltaSeconds: number) {
    const snapshot = this.playerController?.update({
      forward: this.keys.has("KeyW"),
      backward: this.keys.has("KeyS"),
      left: this.keys.has("KeyA"),
      right: this.keys.has("KeyD"),
      jumpPressed: this.jumpQueued,
    }, deltaSeconds);
    this.jumpQueued = false;

    if (!snapshot) {
      return;
    }

    this.pushablePropController?.update(
      deltaSeconds,
      this.camera.position,
      snapshot.actualMovement,
      snapshot.grounded,
    );
    this.currentSurface = surfaceTypeOf(snapshot.groundMesh);

    if (snapshot.justLanded) {
      this.audio.playLanding(this.currentSurface);
      this.footstepDistance = 0;
    }

    if (snapshot.airborne || snapshot.actualDistance < 0.0005) {
      return;
    }

    this.footstepDistance += snapshot.actualDistance;
    const actualSpeed = snapshot.actualDistance / deltaSeconds;
    const stepDistance = actualSpeed > 6.5 ? 2.05 : actualSpeed > 4 ? 2.25 : 2.45;
    if (this.footstepDistance >= stepDistance) {
      this.footstepDistance %= stepDistance;
      this.audio.playFootstep(this.currentSurface);
    }
  }

  private clearMovementInput() {
    this.keys.clear();
    this.jumpQueued = false;
  }

  private updateCameraLook(deltaSeconds: number) {
    const { applied, remaining } = consumeLookDelta(
      this.pendingLookDelta,
      deltaSeconds,
    );
    this.pendingLookDelta = remaining;
    const sensitivity = this.sensitivity * (1 - this.aimBlend * 0.52);
    this.camera.rotation.y += applied.x * sensitivity;
    this.camera.rotation.x = Math.max(
      -GAME_CONFIG.camera.verticalLimit,
      Math.min(
        GAME_CONFIG.camera.verticalLimit,
        this.camera.rotation.x + applied.y * sensitivity,
      ),
    );
  }

  private clearLookInput() {
    this.pendingLookDelta = { x: 0, y: 0 };
  }

  private updateAim(deltaSeconds: number) {
    const target = this.aimDown && this.phase === "active" ? 1 : 0;
    this.aimBlend += (target - this.aimBlend) * Math.min(1, deltaSeconds * 8);
    const normalFov = GAME_CONFIG.player.cameraFovDegrees * Math.PI / 180;
    const aimedFov = 42 * Math.PI / 180;
    this.camera.fov = normalFov + (aimedFov - normalFov) * this.aimBlend;
    this.ui.setAiming(this.aimBlend > 0.08);
  }

  private cancelAim() {
    this.aimDown = false;
    this.aimBlend = 0;
    this.ui.setAiming(false);
    if (this.camera) {
      this.camera.fov = GAME_CONFIG.player.cameraFovDegrees * Math.PI / 180;
    }
  }

  private runAutomatedMovementChecks() {
    if (!this.playerController) return;

    [...this.cover, ...this.walkableSurfaces].forEach((mesh) => {
      mesh.computeWorldMatrix(true);
    });

    const spawn = new Vector3(0, GAME_CONFIG.player.standingHeight, -20);
    const forwardInput = {
      forward: true,
      backward: false,
      left: false,
      right: false,
    };
    const frameRateResults = [30, 60, 120].map((frameRate) => {
      this.camera.position.copyFrom(spawn);
      this.camera.rotation.set(0, 0, 0);
      this.playerController!.reset();
      const frameCount = frameRate * 5;

      for (let frame = 0; frame < frameCount; frame += 1) {
        this.playerController!.update(forwardInput, 1 / frameRate);
      }

      const snapshot = this.playerController!.getSnapshot();

      return {
        frameRate,
        fiveSecondDistance: horizontalDistance(spawn, this.camera.position),
        measuredSpeed: snapshot.actualSpeed,
        requestedFrameDistance: snapshot.requestedDistance,
        standingHeight: this.camera.position.y,
      };
    });

    this.camera.position.set(0, GAME_CONFIG.player.standingHeight, 16);
    this.camera.rotation.set(0, 0, 0);
    this.playerController.reset();
    for (let frame = 0; frame < 60; frame += 1) {
      this.playerController.update(forwardInput, 1 / 60);
    }
    const directWallResult = summarizeMovement(this.playerController.getSnapshot());

    this.camera.position.set(-9, GAME_CONFIG.player.standingHeight, 15.5);
    this.camera.rotation.set(0, Math.PI / 4, 0);
    this.playerController.reset();
    for (let frame = 0; frame < 35; frame += 1) {
      this.playerController.update(forwardInput, 1 / 60);
    }
    const angledWallResult = summarizeMovement(this.playerController.getSnapshot());

    this.camera.position.set(0, GAME_CONFIG.player.standingHeight, 16);
    this.camera.rotation.set(0, Math.PI, 0);
    this.playerController.reset();
    for (let frame = 0; frame < 30; frame += 1) {
      this.playerController.update(forwardInput, 1 / 60);
    }
    const movingAwayResult = summarizeMovement(this.playerController.getSnapshot());

    this.camera.position.copyFrom(spawn);
    this.camera.rotation.set(0, 0, 0);
    this.playerController.reset();
    const directionInputs = [
      forwardInput,
      { forward: false, backward: false, left: false, right: true },
      { forward: false, backward: true, left: false, right: false },
      { forward: false, backward: false, left: true, right: false },
    ];
    for (const input of directionInputs) {
      for (let frame = 0; frame < 20; frame += 1) {
        this.playerController.update(input, 1 / 60);
      }
    }
    const directionChangeResult = summarizeMovement(this.playerController.getSnapshot());

    const runJumpScenario = (
      name: string,
      start: Vector3,
      inputAtFrame: (frame: number) => {
        forward: boolean;
        backward: boolean;
        left: boolean;
        right: boolean;
        jumpPressed: boolean;
      },
      frameCount = 120,
      movementReleaseFrame?: number,
    ) => {
      this.camera.position.copyFrom(start);
      this.camera.rotation.set(0, 0, 0);
      this.playerController!.reset();
      const groundHeight = this.camera.position.y;
      let peakHeight = groundHeight;
      let landingCount = 0;
      let heightAtMovementRelease: number | undefined;
      let peakAfterMovementRelease = groundHeight;

      for (let frame = 0; frame < frameCount; frame += 1) {
        const snapshot = this.playerController!.update(inputAtFrame(frame), 1 / 60);
        peakHeight = Math.max(peakHeight, snapshot.playerPosition.y);
        if (frame === movementReleaseFrame) {
          heightAtMovementRelease = snapshot.playerPosition.y;
        }
        if (
          movementReleaseFrame !== undefined
          && frame > movementReleaseFrame
        ) {
          peakAfterMovementRelease = Math.max(
            peakAfterMovementRelease,
            snapshot.playerPosition.y,
          );
        }
        if (snapshot.justLanded) landingCount += 1;
      }

      const snapshot = this.playerController!.getSnapshot();
      return {
        airborne: snapshot.airborne,
        finalHeight: snapshot.playerPosition.y,
        groundHeight,
        landed: snapshot.grounded,
        landingCount,
        name,
        peakJumpHeight: peakHeight - groundHeight,
        verticalContinuedAfterMovementRelease: heightAtMovementRelease === undefined
          ? undefined
          : peakAfterMovementRelease > heightAtMovementRelease + 0.02,
      };
    };
    const idleJumpInput = (frame: number) => ({
      forward: false,
      backward: false,
      left: false,
      right: false,
      jumpPressed: frame === 0,
    });
    const jumpResults = [
      runJumpScenario("standing jump", spawn, idleJumpInput),
      runJumpScenario("running jump", spawn, (frame) => ({
        ...forwardInput,
        jumpPressed: frame === 0,
      })),
      runJumpScenario("release W during jump", spawn, (frame) => ({
        forward: frame < 7,
        backward: false,
        left: false,
        right: false,
        jumpPressed: frame === 0,
      }), 120, 7),
      runJumpScenario("double jump rejected", spawn, (frame) => ({
        forward: false,
        backward: false,
        left: false,
        right: false,
        jumpPressed: frame === 0 || frame === 12,
      })),
      runJumpScenario("buffered landing jump", spawn, (frame) => ({
        forward: false,
        backward: false,
        left: false,
        right: false,
        jumpPressed: frame === 0 || frame === 25,
      })),
      runJumpScenario("held jump does not repeat", spawn, () => ({
        forward: false,
        backward: false,
        left: false,
        right: false,
        jumpPressed: true,
      }), 180),
      runJumpScenario(
        "low ceiling stops ascent",
        new Vector3(0, GAME_CONFIG.player.standingHeight, -7),
        idleJumpInput,
      ),
    ];

    const evidence = {
      angledWallResult,
      directWallResult,
      directionChangeResult,
      frameRateResults,
      jumpResults,
      movingAwayResult,
    };
    (window as Window & { __neonDuelMovementEvidence?: typeof evidence })
      .__neonDuelMovementEvidence = evidence;
    document.documentElement.dataset.movementEvidence = JSON.stringify(evidence);
    console.info("Neon Duel movement verification", evidence);

    this.camera.position.copyFrom(spawn);
    this.camera.rotation.set(0, 0, 0);
    this.playerController.reset();
  }

  private runMapMovementSmokeChecks() {
    if (!this.playerController) return;

    [...this.cover, ...this.walkableSurfaces].forEach((mesh) => {
      mesh.computeWorldMatrix(true);
    });

    const locations = [
      { name: "cargo development spawn", x: -20, y: 2, z: -34 },
      { name: "cargo central route", x: -22, y: 2, z: -20 },
      { name: "cargo north route", x: -18, y: 2, z: -5 },
      { name: "industrial south route", x: 5, y: 2, z: -35 },
      { name: "industrial center route", x: 21, y: 2, z: -25 },
      { name: "industrial north route", x: 36, y: 2, z: -7 },
      { name: "warehouse south corridor", x: -20, y: 2, z: 4 },
      { name: "warehouse center corridor", x: -22, y: 2, z: 16 },
      { name: "warehouse north corridor", x: -18, y: 2, z: 31 },
      { name: "marksman open lane", x: 21, y: 2, z: 8 },
      { name: "marksman west tower ramp", x: 10, y: 2, z: 10 },
    ];
    const directions = [
      {
        name: "forward",
        input: { forward: true, backward: false, left: false, right: false },
      },
      {
        name: "backward",
        input: { forward: false, backward: true, left: false, right: false },
      },
      {
        name: "left",
        input: { forward: false, backward: false, left: true, right: false },
      },
      {
        name: "right",
        input: { forward: false, backward: false, left: false, right: true },
      },
    ];
    const results = locations.map((location) => {
      const directionResults = directions.map((direction) => {
        this.camera.position.set(location.x, location.y, location.z);
        this.camera.rotation.set(0, 0, 0);
        this.playerController!.reset();

        for (let frame = 0; frame < 12; frame += 1) {
          this.playerController!.update(direction.input, 1 / 60);
        }

        const snapshot = this.playerController!.getSnapshot();

        return {
          actualDistance: snapshot.actualDistance,
          blockingMesh: snapshot.blockingMesh?.name ?? "none",
          direction: direction.name,
          groundMesh: snapshot.groundMesh?.name ?? "none",
          grounded: snapshot.grounded,
          result: snapshot.result,
          standingHeight: snapshot.playerPosition.y,
        };
      });

      return {
        directions: directionResults,
        location: location.name,
      };
    });
    const runElevationRoute = (
      name: string,
      start: Vector3,
      yaw: number,
      segments: Array<{
        frames: number;
        input: {
          forward: boolean;
          backward: boolean;
          left: boolean;
          right: boolean;
        };
      }>,
    ) => {
      this.camera.position.copyFrom(start);
      this.camera.rotation.set(0, yaw, 0);
      this.playerController!.reset();
      let maximumHeight = this.camera.position.y;
      let cancellationCount = 0;

      segments.forEach((segment) => {
        for (let frame = 0; frame < segment.frames; frame += 1) {
          const snapshot = this.playerController!.update(
            segment.input,
            1 / 60,
          );
          maximumHeight = Math.max(maximumHeight, snapshot.playerPosition.y);
          if (snapshot.result === "MOVEMENT CODE CANCELLATION") {
            cancellationCount += 1;
          }
        }
      });

      const snapshot = this.playerController!.getSnapshot();
      return {
        cancellationCount,
        finalGroundMesh: snapshot.groundMesh?.name ?? "none",
        finalHeight: snapshot.playerPosition.y,
        grounded: snapshot.grounded,
        maximumHeight,
        name,
      };
    };
    const forward = {
      forward: true,
      backward: false,
      left: false,
      right: false,
    };
    const elevationRoutes = [
      runElevationRoute(
        "marksman west platform ramp",
        new Vector3(10, GAME_CONFIG.player.standingHeight, 9.2),
        0,
        [{ frames: 105, input: forward }],
      ),
      runElevationRoute(
        "marksman high east platform ramp",
        new Vector3(29, GAME_CONFIG.player.standingHeight, 0.8),
        0,
        [{ frames: 150, input: forward }],
      ),
      runElevationRoute(
        "marksman north platform ramp",
        new Vector3(18, GAME_CONFIG.player.standingHeight, 23),
        0,
        [{ frames: 100, input: forward }],
      ),
      runElevationRoute(
        "marksman northeast platform ramp",
        new Vector3(27, GAME_CONFIG.player.standingHeight, 17.5),
        0,
        [{ frames: 135, input: forward }],
      ),
    ];
    const runSurfaceJump = (
      name: string,
      start: Vector3,
      minimumExpectedHeight: number,
    ) => {
      this.camera.position.copyFrom(start);
      this.camera.rotation.set(0, 0, 0);
      this.playerController!.reset();
      const initialSnapshot = this.playerController!.getSnapshot();
      const initialHeight = this.camera.position.y;
      let jumpStarted = false;
      let landingCount = 0;
      let maximumHeight = initialHeight;

      for (let frame = 0; frame < 90; frame += 1) {
        const snapshot = this.playerController!.update({
          forward: false,
          backward: false,
          left: false,
          right: false,
          jumpPressed: frame === 0,
        }, 1 / 60);
        jumpStarted ||= snapshot.verticalVelocity > 0 && !snapshot.grounded;
        maximumHeight = Math.max(maximumHeight, snapshot.playerPosition.y);
        if (snapshot.justLanded) landingCount += 1;
      }

      const finalSnapshot = this.playerController!.getSnapshot();
      return {
        finalGroundMesh: finalSnapshot.groundMesh?.name ?? "none",
        finalGrounded: finalSnapshot.grounded,
        heightGain: maximumHeight - initialHeight,
        initialGroundMesh: initialSnapshot.groundMesh?.name ?? "none",
        initiallyGrounded: initialSnapshot.grounded,
        jumpStarted,
        landingCount,
        minimumExpectedHeight,
        name,
        passed: initialSnapshot.grounded
          && jumpStarted
          && maximumHeight - initialHeight >= minimumExpectedHeight
          && landingCount === 1
          && finalSnapshot.grounded,
      };
    };
    const surfaceJumps = [
      runSurfaceJump(
        "asphalt ground",
        new Vector3(-20, GAME_CONFIG.player.standingHeight, -34),
        0.9,
      ),
      runSurfaceJump(
        "marksman west platform",
        new Vector3(10, 6.125, 22),
        0.9,
      ),
      runSurfaceJump(
        "marksman high east platform",
        new Vector3(29, 8.125, 18),
        0.9,
      ),
      runSurfaceJump(
        "marksman north platform",
        new Vector3(18, 5.125, 34),
        0.9,
      ),
      runSurfaceJump(
        "marksman northeast platform",
        new Vector3(27, 7.125, 32),
        0.9,
      ),
    ];
    const evidence = {
      cancellationCount: results.flatMap((result) => result.directions).filter((result) => (
        result.result === "MOVEMENT CODE CANCELLATION"
      )).length,
      colliderIntegrity: {
        colliders: this.cover.length,
        invalidColliders: this.cover.filter((mesh) => (
          !mesh.checkCollisions
          || !mesh.isPickable
          || mesh.metadata?.collisionCategory !== "solid-cover"
        )).map((mesh) => mesh.name),
      },
      elevationRoutes,
      groundingIntegrity: {
        groundableSolidCount: this.cover.filter((mesh) => (
          mesh.metadata?.supportsGrounding === true
        )).length,
        missingGroundingSupport: this.cover.filter((mesh) => (
          mesh.metadata?.physicsCategory === "solid"
          && mesh.metadata?.supportsGrounding !== true
        )).map((mesh) => mesh.name),
      },
      groundFailureCount: results.flatMap((result) => result.directions).filter((result) => (
        result.result === "GROUND DETECTION FAILURE"
      )).length,
      mapDimensions: DISTRICT_DIMENSIONS,
      results,
      surfaceJumps,
    };

    document.documentElement.dataset.mapMovementEvidence = JSON.stringify(evidence);
    console.info("Neon Duel complete-map movement smoke verification", evidence);

    this.camera.position.set(-20, GAME_CONFIG.player.standingHeight, -34);
    this.camera.rotation.set(0, 0, 0);
    this.playerController.reset();
  }

  private toggleCollisionDebug() {
    this.collisionDebugEnabled = !this.collisionDebugEnabled;
    if (this.collisionDebugEnabled) {
      this.createCollisionDebugVisuals();
      this.updateCollisionDebugReadout(performance.now());
      return;
    }
    this.collisionDebugMeshes.forEach((mesh) => mesh.dispose());
    this.collisionDebugMeshes = [];
    this.ui.hideCollisionDebug();
  }

  private toggleActiveContactDebug() {
    this.activeContactDebugEnabled = !this.activeContactDebugEnabled;
    if (this.activeContactDebugEnabled) {
      this.updateActiveContactDebug(true);
      return;
    }
    this.clearActiveContactDebugVisuals();
    this.ui.hideMovementContactDebug();
  }

  private resetActiveContactDebug() {
    this.updateActiveContactDebug(true);
  }

  private createCollisionDebugVisuals() {
    this.collisionDebugMeshes.forEach((mesh) => mesh.dispose());
    this.collisionDebugMeshes = [];
    const material = new StandardMaterial("collision debug material", this.scene);
    material.emissiveColor = new Color3(0.1, 1, 0.35);
    material.alpha = 0.38;
    material.wireframe = true;
    material.disableLighting = true;

    this.cover.filter((mesh) => mesh.checkCollisions).forEach((mesh) => {
      const bounds = mesh.getBoundingInfo().boundingBox;
      const size = bounds.extendSizeWorld.scale(2);
      const outline = MeshBuilder.CreateBox(`debug collider ${mesh.name}`, {
        width: Math.max(size.x, 0.05),
        height: Math.max(size.y, 0.05),
        depth: Math.max(size.z, 0.05),
      }, this.scene);
      outline.position.copyFrom(bounds.centerWorld);
      outline.material = material;
      outline.isPickable = false;
      outline.checkCollisions = false;
      this.collisionDebugMeshes.push(outline);
    });
  }

  private updateCollisionDebugReadout(_now: number) {
    if (!this.collisionDebugEnabled) return;
    const blockingMesh = this.playerController?.getSnapshot().blockingMesh;
    this.ui.showCollisionDebug({
      enabledColliders: this.cover.filter((mesh) => (
        mesh.checkCollisions
        && !this.walkableSurfaces.includes(mesh)
      )).length,
      blockingObject: blockingMesh?.name ?? "none",
      position: blockingMesh ? this.formatPosition(blockingMesh.position) : "—",
      colliderType: blockingMesh?.metadata?.collisionShape ?? "—",
      visibleMesh: blockingMesh ? "yes" : "—",
    });
  }

  private updateActiveContactDebug(force = false) {
    const contact = this.playerController?.getSnapshot();
    if (!this.activeContactDebugEnabled || !contact) return;
    const now = performance.now();
    if (!force && now - this.activeContactDebugUpdatedAt < 100) return;
    this.activeContactDebugUpdatedAt = now;
    const blocker = contact.blockingMesh;
    const colliderSize = blocker ? blocker.getBoundingInfo().boundingBox.extendSizeWorld.scale(2) : undefined;
    this.ui.showMovementContactDebug({
      actualDistance: `${contact.actualDistance.toFixed(3)} m`,
      actualHeading: formatHeading(contact.actualHeading),
      actualSpeed: contact.actualSpeed === undefined
        ? `sampling (${contact.speedSampleSeconds.toFixed(2)} / 2.00 s)`
        : `${contact.actualSpeed.toFixed(2)} m/s over ${contact.speedSampleSeconds.toFixed(2)} s`,
      boundaryStatus: "none (no player position clamp is active)",
      blockingColliderType: blocker?.metadata?.collisionShape ?? blocker?.metadata?.collisionCategory ?? "—",
      blockingMesh: blocker?.name ?? "none",
      blockingParent: blocker?.parent?.name ?? "none",
      blockerVisible: blocker ? String(blocker.isVisible && blocker.isEnabled()) : "—",
      colliderSize: colliderSize ? formatVector(colliderSize) : "—",
      contactNormal: contact.collisionNormal ? formatVector(contact.collisionNormal) : "—",
      contactPoint: contact.collisionPoint ? formatVector(contact.collisionPoint) : "—",
      deflection: `${contact.deflectionDegrees.toFixed(1)}°`,
      diagnosticMessage: contact.cancellationMessage ?? "—",
      groundMesh: contact.groundMesh?.name ?? "none",
      groundNormal: contact.groundNormal ? formatVector(contact.groundNormal) : "—",
      grounded: String(contact.grounded),
      playerCollider: "0.70 × 1.70 × 0.70 m",
      playerPositionBefore: formatVector(contact.positionBeforeMove),
      playerPosition: formatVector(contact.playerPosition),
      requestedDistance: `${contact.requestedDistance.toFixed(3)} m`,
      requestedHeading: formatHeading(contact.requestedHeading),
      requestedSpeed: `${contact.requestedSpeed.toFixed(2)} m/s`,
      result: contact.result,
      visibleObjectSize: colliderSize ? `${formatVector(colliderSize)} (same mesh)` : "—",
      visibleColliderGap: blocker ? "0.00 m (same mesh)" : "—",
      velocityAfter: formatVector(contact.velocityAfterCollision),
      velocityBefore: formatVector(contact.velocityBeforeCollision),
    });
    this.renderActiveContactVisuals(contact);
  }

  private renderActiveContactVisuals(contact: MovementSnapshot) {
    this.clearActiveContactDebugVisuals();
    const playerCenter = this.camera.position
      .subtract(new Vector3(0, this.camera.ellipsoid.y, 0))
      .add(this.camera.ellipsoidOffset);
    const playerCollider = MeshBuilder.CreateBox("debug player collider", { width: 0.7, height: 1.7, depth: 0.7 }, this.scene);
    const playerMaterial = new StandardMaterial("debug player collider material", this.scene);
    playerMaterial.emissiveColor = new Color3(1, 0.86, 0.08);
    playerMaterial.wireframe = true;
    playerCollider.position.copyFrom(playerCenter);
    playerCollider.material = playerMaterial;
    playerCollider.isPickable = false;
    this.activeContactDebugMeshes.push(playerCollider);
    this.addDebugLine("requested movement", playerCenter, playerCenter.add(contact.requestedMovement.scale(12)), new Color3(0.15, 0.9, 1));
    this.addDebugLine("actual movement", playerCenter, playerCenter.add(contact.actualMovement.scale(12)), new Color3(1, 0.76, 0.1));
    this.addDebugLine(
      "floor detection ray",
      this.camera.position.add(new Vector3(0, 0.45, 0)),
      this.camera.position.add(new Vector3(0, -6, 0)),
      new Color3(0.7, 0.3, 1),
    );
    if (contact.blockingMesh) {
      const bounds = contact.blockingMesh.getBoundingInfo().boundingBox;
      const size = bounds.extendSizeWorld.scale(2);
      const blockerOutline = MeshBuilder.CreateBox("debug active blocking collider", { width: size.x, height: size.y, depth: size.z }, this.scene);
      const blockerMaterial = new StandardMaterial("debug active blocker material", this.scene);
      blockerMaterial.emissiveColor = new Color3(1, 0.08, 0.1);
      blockerMaterial.alpha = 0.55;
      blockerMaterial.wireframe = true;
      blockerOutline.position.copyFrom(bounds.centerWorld);
      blockerOutline.material = blockerMaterial;
      blockerOutline.isPickable = false;
      this.activeContactDebugMeshes.push(blockerOutline);
    }
    if (contact.collisionPoint) {
      const point = MeshBuilder.CreateSphere("debug contact point", { diameter: 0.16 }, this.scene);
      const pointMaterial = new StandardMaterial("debug contact point material", this.scene);
      pointMaterial.emissiveColor = new Color3(1, 0.15, 0.15);
      point.position.copyFrom(contact.collisionPoint);
      point.material = pointMaterial;
      point.isPickable = false;
      this.activeContactDebugMeshes.push(point);
      if (contact.collisionNormal) this.addDebugLine("contact normal", contact.collisionPoint, contact.collisionPoint.add(contact.collisionNormal.scale(1.3)), new Color3(1, 0.1, 0.1));
    }
  }

  private addDebugLine(name: string, from: Vector3, to: Vector3, color: Color3) {
    const line = MeshBuilder.CreateLines(name, { points: [from, to] }, this.scene);
    line.color = color;
    line.isPickable = false;
    this.activeContactDebugMeshes.push(line);
  }

  private clearActiveContactDebugVisuals() {
    this.activeContactDebugMeshes.forEach((mesh) => {
      const material = mesh.material;
      mesh.dispose();
      material?.dispose();
    });
    this.activeContactDebugMeshes = [];
  }

  private formatPosition(position: Vector3) {
    return `x ${position.x.toFixed(1)}, y ${position.y.toFixed(1)}, z ${position.z.toFixed(1)}`;
  }

  private pauseMatch() {
    if (!this.matchActive || this.paused) return;
    this.paused = true;
    this.mouseDown = false;
    this.cancelAim();
    this.clearLookInput();
    this.clearMovementInput();
    this.audio.setPaused(true);
    document.exitPointerLock();
    this.ui.showPause({
      onResume: () => this.resumeMatch(),
      onRestart: () => void this.startMatch(),
      onMainMenu: () => void this.showMainMenu(),
    });
  }

  private resumeMatch() {
    if (!this.matchActive || !this.paused) return;
    this.paused = false;
    this.audio.setPaused(false);
    this.feedback = "Click the game view to enable mouse look";
    this.ui.showHud();
    this.updateCollisionDebugReadout(performance.now());
  }

  private lockPointer() {
    try {
      const request = this.canvas.requestPointerLock();
      if (request instanceof Promise) {
        void request.catch(() => {
          this.feedback = "Click the game view to enable mouse look";
        });
      }
    } catch {
      this.feedback = "Click the game view to enable mouse look";
    }
  }

  private shoot(now: number) {
    if (this.phase !== "active") return;
    if (isInsideSafeZone(this.camera.position)) {
      this.feedback = "SAFE ZONE — weapons disabled";
      return;
    }
    if (this.weapon.magazine === 0) {
      this.audio.play("empty");
      this.reload();
      return;
    }
    if (!this.weapon.canFire(now)) return;
    this.weapon.fire(now);
    this.shotsFired += 1;
    this.botManager?.reportPlayerGunshot(this.camera.position, now);
    this.audio.playGunshot(this.currentSurface === "indoor");
    this.recoil = Math.min(0.12, this.recoil + GAME_CONFIG.weapon.recoilPerShot);
    this.camera.rotation.x -= GAME_CONFIG.weapon.recoilPerShot;
    this.flashMuzzle();
    const direction = this.camera.getDirection(Vector3.Forward());
    const spread = GAME_CONFIG.weapon.hipSpread + this.recoil * 0.18;
    direction.x += (Math.random() - 0.5) * spread;
    direction.y += (Math.random() - 0.5) * spread;
    const ray = new Ray(this.camera.position, direction.normalize(), GAME_CONFIG.weapon.range);
    const hit = this.scene.pickWithRay(ray, (mesh) => (
      this.botManager?.getBotByMesh(mesh) !== undefined
      || this.cover.some((wall) => wall === mesh)
      || this.pushablePropController?.hasMesh(mesh) === true
    ));
    const bot = hit?.pickedMesh ? this.botManager?.getBotByMesh(hit.pickedMesh) : undefined;
    if (bot) {
      this.shotsHit += 1;
      const headshot = hit?.pickedMesh?.metadata?.hitZone === "head";
      const damage = headshot
        ? GAME_CONFIG.weapon.headshotDamage
        : GAME_CONFIG.weapon.bodyDamage;
      const defeated = this.botManager?.damageBot(
        bot,
        damage,
        now,
      ) ?? false;
      this.audio.play("hit", bot.mesh.position);
      this.feedback = defeated
        ? `${headshot ? "HEADSHOT — " : ""}Enemy eliminated — ${this.botManager?.remaining ?? 0} remaining`
        : headshot
          ? "HEADSHOT"
          : "Hit confirmed";
      this.impact(hit!.pickedPoint!, true, "concrete");
    } else if (hit?.pickedPoint) {
      const bulletMaterial = bulletMaterialOf(hit.pickedMesh ?? undefined);
      if (hit.pickedMesh && this.pushablePropController?.hasMesh(hit.pickedMesh)) {
        this.pushablePropController.applyBulletImpulse(hit.pickedMesh, direction);
      }
      this.impact(hit.pickedPoint, false, bulletMaterial);
    }
  }

  private flashMuzzle() {
    this.muzzleFlash?.setEnabled(true);
    window.setTimeout(() => this.muzzleFlash?.setEnabled(false), 45);
  }

  private impact(position: Vector3, combatant: boolean, bulletMaterial: BulletMaterial) {
    const mark = MeshBuilder.CreateSphere("bullet impact", { diameter: combatant ? 0.15 : 0.09 }, this.scene);
    mark.position.copyFrom(position);
    const material = new StandardMaterial("impact material", this.scene);
    material.emissiveColor = combatant
      ? new Color3(1, 0.06, 0.03)
      : bulletMaterial === "metal"
        ? new Color3(1, 0.72, 0.26)
        : bulletMaterial === "wood"
          ? new Color3(0.62, 0.28, 0.08)
          : new Color3(0.78, 0.7, 0.54);
    mark.material = material;
    this.combatEffects.add(mark);
    if (!combatant) this.audio.playImpact(bulletMaterial, position);
    window.setTimeout(() => {
      this.combatEffects.delete(mark);
      mark.dispose();
    }, 220);
  }

  private reload() {
    if (this.weapon.reload(
      () => {
        this.feedback = "Reloaded";
        this.audio.playReload("complete");
      },
      () => this.audio.playReload("magazine"),
    )) {
      this.feedback = "Reloading…";
      this.audio.playReload("start");
    }
  }

  private updatePlayerRegeneration(now: number, dt: number) {
    if (
      !this.matchActive
      || this.phase !== "active"
      || this.playerHealth <= 0
      || this.playerHealth >= GAME_CONFIG.player.health
      || now - this.playerDamagedAt
        < createWaveConfig(this.waveIndex + 1).playerRegenerationDelayMs
    ) {
      this.regenerationActive = false;
      return;
    }
    if (!this.regenerationActive) {
      this.regenerationActive = true;
      this.feedback = "Regenerating";
      this.audio.play("regenerate");
    }
    this.playerHealth = Math.min(GAME_CONFIG.player.health, this.playerHealth + GAME_CONFIG.regeneration.healthPerSecond * dt);
  }

  private damagePlayer(amount: number, now: number) {
    if (!this.matchActive || this.phase !== "active") return;
    const healthBeforeDamage = this.playerHealth;
    this.playerHealth = Math.max(0, this.playerHealth - amount);
    this.damageTaken += healthBeforeDamage - this.playerHealth;
    this.playerDamagedAt = now;
    this.regenerationActive = false;
    this.feedback = "You were hit";
    this.audio.play("damage");
    if (this.playerHealth <= 0) this.finish("Defeat");
  }

  private clearCombatEffects() {
    this.combatEffects.forEach((effect) => effect.dispose());
    this.combatEffects.clear();
    this.muzzleFlash?.setEnabled(false);
  }

  private finish(result: "Victory" | "Defeat") {
    if (!this.matchActive) return;
    this.matchActive = false;
    this.phase = "ended";
    this.paused = false;
    this.mouseDown = false;
    this.cancelAim();
    this.clearMovementInput();
    this.botManager?.stopWave();
    this.weapon.refill();
    this.clearCombatEffects();
    document.exitPointerLock();
    this.audio.play("result");
    this.ui.showResult(
      {
        result,
        wavesCompleted: this.wavesCompleted,
        totalWaves: this.wavesCompleted,
        enemiesDefeated: this.totalEnemiesDefeated,
        completionSeconds: this.runElapsedSeconds,
        shotsFired: this.shotsFired,
        shotsHit: this.shotsHit,
        damageTaken: this.damageTaken,
      },
      {
        onRestart: () => void this.startMatch(),
        onMainMenu: () => void this.showMainMenu(),
      },
    );
    if (this.gameplayTestMode) {
      this.showGameplayTestReport();
    }
  }
}

function formatHeading(value: number) {
  return `${value.toFixed(1)}°`;
}

function surfaceTypeOf(mesh?: AbstractMesh): SurfaceType {
  const surface = mesh?.metadata?.surfaceType;
  return surface === "concrete" || surface === "indoor" || surface === "metal"
    ? surface
    : "asphalt";
}

function bulletMaterialOf(mesh?: AbstractMesh): BulletMaterial {
  const material = mesh?.metadata?.bulletMaterial;
  return material === "metal" || material === "wood" ? material : "concrete";
}

function formatVector(vector: Vector3) {
  return `x ${vector.x.toFixed(2)}, y ${vector.y.toFixed(2)}, z ${vector.z.toFixed(2)}`;
}

function horizontalDistance(from: Vector3, to: Vector3) {
  return Math.hypot(to.x - from.x, to.z - from.z);
}

function summarizeMovement(snapshot: MovementSnapshot) {
  return {
    actualDistance: snapshot.actualDistance,
    blockingMesh: snapshot.blockingMesh?.name ?? "none",
    groundMesh: snapshot.groundMesh?.name ?? "none",
    grounded: snapshot.grounded,
    result: snapshot.result,
    standingHeight: snapshot.playerPosition.y,
  };
}
