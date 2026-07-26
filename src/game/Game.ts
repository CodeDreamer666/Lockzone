import {
  AbstractMesh,
  Color3,
  DirectionalLight,
  Engine,
  FreeCamera,
  GlowLayer,
  HemisphericLight,
  Matrix,
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
import { CombatEffectManager } from "../combat/CombatEffectManager";
import {
  SNIPER_CONFIG,
  SniperWeapon,
} from "../combat/SniperWeapon";
import { Weapon } from "../combat/Weapon";
import {
  createMap,
  DISTRICT_DIMENSIONS,
  type BulletMaterial,
  type SurfaceType,
} from "../map/createMap";
import { createMovementTestMap } from "../map/createMovementTestMap";
import { isInsideSafeZone } from "../map/safeZones";
import {
  GameUI,
  type EnemyIndicator,
  type ShopMenuData,
} from "../ui/GameUI";
import {
  GAME_CONFIG,
  createWaveConfig,
  type EnemyType,
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
import {
  awardCoins,
  COIN_REWARDS,
  createInitialShopState,
  currentWeaponStats,
  getShopAtPosition,
  getBotKillCoinReward,
  getShopPrice,
  isShopPurchaseId,
  movementSpeedMultiplier,
  purchaseShopItem,
  RIFLE_DEFINITION,
  SHOP_NAMES,
  type RunShopState,
  type ShopKind,
  type ShopPurchaseId,
} from "./shopSystem";

type MatchPhase = "opening" | "active" | "transition" | "ended";
type PlayerWeaponKind = "rifle" | "sniper";

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
  private sniper = new SniperWeapon();
  private equippedWeapon: PlayerWeaponKind = "rifle";
  private cover: AbstractMesh[] = [];
  private walkableSurfaces: AbstractMesh[] = [];
  private playerHealth: number = GAME_CONFIG.player.health;
  private shopState: RunShopState = createInitialShopState();
  private nearbyShop?: ShopKind;
  private activeShop?: ShopKind;
  private shopMessage?: string;
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
  private rifleRig?: TransformNode;
  private sniperRig?: TransformNode;
  private rifleMuzzleFlash?: Mesh;
  private sniperMuzzleFlash?: Mesh;
  private weaponSwitchStartedAt = -Infinity;
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
  private combatEffectManager?: CombatEffectManager;
  private readonly movementTestMode = this.collisionDebugAvailable
    && new URLSearchParams(window.location.search).has("movementTest");
  private readonly gameplayTestMode = this.collisionDebugAvailable
    && new URLSearchParams(window.location.search).has("gameplayTest");
  private readonly gameplayTestScenario = new URLSearchParams(
    window.location.search,
  ).get("gameplayTest") ?? "victory";
  private readonly gameplayTestWave = this.gameplayTestMode
    ? parseGameplayTestWave(
        new URLSearchParams(window.location.search).get("testWave"),
      )
    : 1;
  private readonly shopTestScenario = this.collisionDebugAvailable
    ? new URLSearchParams(window.location.search).get("shopTest")
    : null;
  private gameplayTestNextActionAt = 0;
  private gameplayTestActionComplete = false;
  private gameplayTestStage = 0;
  private gameplayTestMaximumAlive: number[] = [];
  private gameplayTestElevatedSpawns: number[] = [];
  private gameplayTestMaximumShooters = 0;
  private gameplayTestMaximumActiveByType: Record<EnemyType, number> = {
    normal: 0,
    armoured: 0,
    smg: 0,
    shotgun: 0,
    sniper: 0,
    boss: 0,
  };
  private gameplayTestAttackRestrictionViolation = false;

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
    this.combatEffectManager?.dispose();
    this.combatEffectManager = undefined;
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
          : `Prepare for Wave ${this.waveIndex + 1}`;
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
    this.sniper = new SniperWeapon();
    this.equippedWeapon = "rifle";
    this.shopState = createInitialShopState();
    this.syncWeaponStats(true);
    this.playerHealth = this.shopState.maximumHealth;
    this.nearbyShop = undefined;
    this.activeShop = undefined;
    this.shopMessage = undefined;
    this.ui.hideShop();
    this.playerDamagedAt = -Infinity;
    this.regenerationActive = false;
    this.remaining = 0;
    this.phase = "opening";
    this.phaseRemaining = this.gameplayTestMode
      ? 0.15
      : OPENING_COUNTDOWN_SECONDS;
    this.waveIndex = this.gameplayTestMode
      ? this.gameplayTestWave - 1
      : 0;
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
    this.gameplayTestMaximumShooters = 0;
    this.gameplayTestMaximumActiveByType = {
      normal: 0,
      armoured: 0,
      smg: 0,
      shotgun: 0,
      sniper: 0,
      boss: 0,
    };
    this.gameplayTestAttackRestrictionViolation = false;
    this.playerController = undefined;
    this.pushablePropController = undefined;
    this.jumpQueued = false;
    this.footstepDistance = 0;
    this.currentSurface = "asphalt";
    this.keys.clear();
    this.feedback = `Prepare for Wave ${this.waveIndex + 1}`;
    this.mouseDown = false;
    this.recoil = 0;
    this.weaponSwitchStartedAt = -Infinity;
    this.clearLookInput();
    this.clearCombatEffects();
  }

  private createScene() {
    const map = this.createEnvironmentScene(this.movementTestMode);
    this.camera = this.createCamera(map.playerSpawn);
    if (this.shopTestScenario) {
      this.camera.position.set(-16, 1.7, -13.9);
      if (this.shopTestScenario === "funded") {
        this.shopState = awardCoins(this.shopState, 500);
      }
    }
    this.playerController = new PlayerController(
      this.scene,
      this.camera,
      this.cover,
      this.walkableSurfaces,
    );
    this.pushablePropController = new PushablePropController(map.pushableProps, this.cover);
    this.combatEffectManager = new CombatEffectManager(
      this.scene,
      this.walkableSurfaces,
    );
    this.createPlayerTarget();
    this.botManager = this.movementTestMode
      ? undefined
      : new BotManager(
        this.scene,
        this.cover,
        this.walkableSurfaces,
        map.botSpawns,
        map.resourcePoints,
        map.navigationNodes,
        () => {
          this.totalEnemiesDefeated += 1;
        },
      );
    this.createFirstPersonWeapons();
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
    this.combatEffectManager?.dispose();
    this.combatEffectManager = undefined;
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
    this.camera = this.createCamera(new Vector3(-23, 10, -24));
    this.camera.checkCollisions = false;
    this.camera.fov = 0.95;
    this.camera.setTarget(new Vector3(0, 3, 0));
    this.presentationTime = 0;
    this.scene.onBeforeRenderObservable.add(() => {
      this.presentationTime += Math.min(this.engine.getDeltaTime() / 1000, 0.04);
      const t = this.presentationTime;
      const views = [
        { position: new Vector3(-23, 10, -24), target: new Vector3(0, 3, 0) },
        { position: new Vector3(-22, 8, 4), target: new Vector3(-3, 3, 5) },
        { position: new Vector3(-4, 10, -23), target: new Vector3(2, 3, 2) },
        { position: new Vector3(23, 11, -16), target: new Vector3(9, 4, 7) },
        { position: new Vector3(22, 12, 23), target: new Vector3(2, 4, 12) },
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

  private createFirstPersonWeapons() {
    this.rifleRig = new TransformNode("rifle view model", this.scene);
    this.rifleRig.parent = this.camera;
    this.rifleRig.position.set(0.42, -0.38, 0.72);
    this.rifleRig.rotation.set(0.02, Math.PI, 0);
    const rifle = this.rifleRig;
    const metal = this.createRifleMaterial("rifle metal", new Color3(0.045, 0.055, 0.06), 0.9, 0.36);
    const grip = this.createRifleMaterial("rifle grip", new Color3(0.12, 0.1, 0.08), 0.1, 0.75);
    const addPart = (
      parent: TransformNode,
      name: string,
      position: Vector3,
      size: [number, number, number],
      material: PBRMaterial,
    ) => {
      const mesh = MeshBuilder.CreateBox(name, { width: size[0], height: size[1], depth: size[2] }, this.scene);
      mesh.parent = parent;
      mesh.position.copyFrom(position);
      mesh.material = material;
      mesh.isPickable = false;
      return mesh;
    };
    addPart(rifle, "rifle receiver", new Vector3(0, 0, 0), [0.22, 0.17, 0.72], metal);
    addPart(rifle, "rifle barrel", new Vector3(0, 0.02, 0.55), [0.07, 0.07, 0.58], metal);
    addPart(rifle, "rifle stock", new Vector3(0, 0.01, -0.52), [0.18, 0.16, 0.42], grip);
    addPart(rifle, "rifle magazine", new Vector3(0.02, -0.18, 0.04), [0.12, 0.32, 0.2], metal);
    this.rifleMuzzleFlash = MeshBuilder.CreateSphere(
      "rifle muzzle flash",
      { diameter: 0.16 },
      this.scene,
    );
    this.rifleMuzzleFlash.parent = rifle;
    this.rifleMuzzleFlash.position.set(0, 0.02, 0.88);
    const rifleFlashMaterial = new StandardMaterial(
      "rifle flash material",
      this.scene,
    );
    rifleFlashMaterial.emissiveColor = new Color3(1, 0.55, 0.08);
    this.rifleMuzzleFlash.material = rifleFlashMaterial;
    this.rifleMuzzleFlash.setEnabled(false);

    this.sniperRig = new TransformNode("sniper view model", this.scene);
    this.sniperRig.parent = this.camera;
    this.sniperRig.position.set(0.46, -0.43, 0.84);
    this.sniperRig.rotation.set(0.015, Math.PI, 0);
    const sniperMetal = this.createRifleMaterial(
      "sniper gunmetal",
      new Color3(0.035, 0.055, 0.065),
      0.92,
      0.3,
    );
    const sniperStock = this.createRifleMaterial(
      "sniper olive stock",
      new Color3(0.12, 0.15, 0.1),
      0.18,
      0.7,
    );
    addPart(
      this.sniperRig,
      "sniper receiver",
      new Vector3(0, 0, 0.04),
      [0.24, 0.18, 0.82],
      sniperMetal,
    );
    addPart(
      this.sniperRig,
      "sniper long barrel",
      new Vector3(0, 0.025, 0.86),
      [0.065, 0.065, 1.05],
      sniperMetal,
    );
    addPart(
      this.sniperRig,
      "sniper stock",
      new Vector3(0, 0, -0.61),
      [0.22, 0.2, 0.52],
      sniperStock,
    );
    addPart(
      this.sniperRig,
      "sniper six-shot housing",
      new Vector3(0, -0.15, 0.05),
      [0.14, 0.22, 0.25],
      sniperMetal,
    );
    const scope = MeshBuilder.CreateCylinder(
      "sniper scope",
      {
        diameter: 0.18,
        height: 0.62,
        tessellation: 16,
      },
      this.scene,
    );
    scope.parent = this.sniperRig;
    scope.position.set(0, 0.2, 0.08);
    scope.rotation.x = Math.PI / 2;
    scope.material = sniperMetal;
    scope.isPickable = false;
    this.sniperMuzzleFlash = MeshBuilder.CreateSphere(
      "sniper muzzle flash",
      { diameter: 0.29, segments: 8 },
      this.scene,
    );
    this.sniperMuzzleFlash.parent = this.sniperRig;
    this.sniperMuzzleFlash.position.set(0, 0.025, 1.4);
    const sniperFlashMaterial = new StandardMaterial(
      "sniper flash material",
      this.scene,
    );
    sniperFlashMaterial.emissiveColor = new Color3(0.72, 0.9, 1);
    this.sniperMuzzleFlash.material = sniperFlashMaterial;
    this.sniperMuzzleFlash.setEnabled(false);
    this.sniperRig.setEnabled(false);
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
      if ([
        "KeyW",
        "KeyA",
        "KeyS",
        "KeyD",
        "Space",
        "KeyR",
        "KeyE",
        "Digit1",
        "Digit2",
        "Escape",
        "F3",
        "F7",
      ].includes(event.code)) {
        event.preventDefault();
      }
      if (event.code === "F3" && this.collisionDebugAvailable) {
        this.toggleCollisionDebug();
        return;
      }
      if (event.code === "F7" && this.collisionDebugAvailable) {
        this.toggleActiveContactDebug();
        return;
      }
      if (event.code === "Escape" && this.matchActive) {
        if (this.activeShop) {
          this.closeShop();
          return;
        }
        this.pauseMatch();
        return;
      }
      if (!this.matchActive) return;
      if (event.code === "KeyE" && !event.repeat) {
        if (this.activeShop) {
          this.closeShop();
        } else {
          this.openNearbyShop();
        }
        return;
      }
      if (event.code === "Digit1" && !event.repeat) {
        this.switchWeapon("rifle");
        return;
      }
      if (event.code === "Digit2" && !event.repeat) {
        this.switchWeapon("sniper");
        return;
      }
      this.keys.add(event.code);
      if (event.code === "Space" && !event.repeat) this.jumpQueued = true;
      if (event.code === "KeyR" && !event.repeat) this.reload();
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
      if (
        !document.pointerLockElement
        && this.matchActive
        && !this.paused
        && !this.activeShop
      ) {
        this.pauseMatch();
      }
    };
    this.canvas.onclick = () => {
      if (
        this.matchActive
        && !this.paused
        && !this.activeShop
        && !document.pointerLockElement
      ) {
        this.lockPointer();
      }
    };
  }

  private update() {
    if (!this.matchActive || this.paused || !this.playerController) return;
    const deltaSeconds = clampDeltaSeconds(this.engine.getDeltaTime());
    if (deltaSeconds === 0) return;
    const now = performance.now();
    if (this.sniper.update(now)) {
      this.feedback = "Sniper recharged — 6 shots ready";
    }
    this.runElapsedSeconds += deltaSeconds;
    this.updateCameraLook(deltaSeconds);
    this.movePlayer(deltaSeconds);
    this.updateShopAvailability();
    this.updateAim(deltaSeconds);
    this.audio.setListener(this.camera.position);
    this.combatEffectManager?.update(now, deltaSeconds);

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
        this.shopState.maximumHealth,
        (bot) => this.audio.playEnemyAttack(
          bot.enemyType,
          bot.mesh.position,
        ),
        (bot) => this.audio.playEnemyWarning(
          bot.enemyType,
          bot.mesh.position,
        ),
        (damage) => {
          if (
            this.gameplayTestMode
            && [
              "observe",
              "sniperLongRange",
              "sniperNearMiss",
              "sniperScope",
              "attackSlots",
              "slotRelease",
              "sniperEnemy",
              "shotgunEnemy",
              "bossEnemy",
            ].includes(this.gameplayTestScenario)
          ) {
            return;
          }
          this.damagePlayer(damage, now);
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
    this.updateWeaponPresentation(now);
    this.updateHud();
    this.updateEnemyIndicators();
    this.updateCollisionDebugReadout(now);
    this.updateActiveContactDebug();
  }

  private startCurrentWave(now: number) {
    const wave = createWaveConfig(this.waveIndex + 1);
    if (
      this.gameplayTestMode
      && this.gameplayTestScenario === "observe"
    ) {
      this.camera.position.set(12, GAME_CONFIG.player.standingHeight, -8);
      this.camera.setTarget(new Vector3(4, 1.7, 3));
      this.playerController?.reset();
    }
    this.phase = "active";
    this.remaining = 0;
    this.feedback = `${wave.name} engaged · ${wave.totalEnemies} enemies`;
    this.botManager?.startWave(wave, now);
  }

  private completeWave() {
    if (this.phase !== "active") return;
    const cleanupBefore = this.gameplayTestMode
      ? {
          bloodDecals: this.combatEffectManager?.activeDecalCount ?? 0,
          bloodParticles: this.combatEffectManager?.activeParticleCount ?? 0,
          bulletEffects: this.combatEffects.size,
          deadBodies: this.botManager?.deadBodies ?? 0,
        }
      : undefined;
    this.gameplayTestElevatedSpawns[this.waveIndex] = 0;
    this.wavesCompleted += 1;
    this.shopState = awardCoins(this.shopState, COIN_REWARDS.waveComplete);
    this.botManager?.stopWave();
    this.clearCombatEffects();
    if (cleanupBefore) {
      document.documentElement.dataset.waveCleanupEvidence = JSON.stringify({
        before: cleanupBefore,
        after: {
          bloodDecals: this.combatEffectManager?.activeDecalCount ?? 0,
          bloodParticles: this.combatEffectManager?.activeParticleCount ?? 0,
          bulletEffects: this.combatEffects.size,
          deadBodies: this.botManager?.deadBodies ?? 0,
        },
      });
    }
    this.mouseDown = false;
    this.cancelAim();
    this.clearMovementInput();
    this.playerHealth = this.shopState.maximumHealth;
    this.weapon.refill();
    this.regenerationActive = false;
    this.playerDamagedAt = -Infinity;
    this.waveIndex += 1;
    this.phase = "transition";
    this.phaseRemaining = WAVE_TRANSITION_SECONDS;
    this.remaining = 0;
    this.feedback = (
      `Wave Complete · +${COIN_REWARDS.waveComplete} coins · `
      + "Health and magazine restored"
    );
  }

  private updateHud() {
    const wave = createWaveConfig(this.waveIndex + 1);
    const transitioning = (
      this.phase === "opening"
      || this.phase === "transition"
    );
    this.ui.update({
      wave: wave.number,
      health: this.playerHealth,
      maximumHealth: this.shopState.maximumHealth,
      coins: this.shopState.coins,
      magazine: this.weapon.magazine,
      magazineSize: currentWeaponStats(this.shopState).magazineSize,
      enemiesAlive: transitioning ? 0 : (this.botManager?.alive ?? 0),
      enemiesRemaining: transitioning
        ? wave.totalEnemies
        : (this.botManager?.remaining ?? 0),
      remaining: this.remaining,
      ammoText: this.getWeaponAmmoText(performance.now()),
      weaponName: this.equippedWeapon === "sniper"
        ? "Sniper"
        : RIFLE_DEFINITION.displayName,
      weaponHint: this.equippedWeapon === "sniper"
        ? "1 RIFLE · 2 SNIPER SELECTED"
        : "1 RIFLE SELECTED · 2 SNIPER",
      message: this.movementTestMode
        ? "Movement test area — F7 shows controller diagnostics"
        : this.equippedWeapon === "rifle" && this.weapon.isReloading
          ? "Reloading…"
          : this.feedback,
      announcement: this.phase === "opening"
        ? {
            title: `WAVE ${wave.number}`,
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

  private updateEnemyIndicators() {
    if (
      this.phase !== "active"
      || !this.botManager
      || this.botManager.remaining > 5
      || this.botManager.remaining === 0
    ) {
      this.ui.renderEnemyIndicators([]);
      return;
    }

    const width = this.engine.getRenderWidth();
    const height = this.engine.getRenderHeight();
    const viewport = this.camera.viewport.toGlobal(width, height);
    const transform = this.scene.getTransformMatrix();
    const cameraForward = this.camera
      .getDirection(Vector3.Forward())
      .normalize();
    const cameraRight = this.camera
      .getDirection(Vector3.Right())
      .normalize();
    const indicators: EnemyIndicator[] = this.botManager.bots
      .filter((bot) => bot.isAlive)
      .map((bot) => {
        const position = bot.bodyHitbox.getAbsolutePosition();
        const offset = position.subtract(this.camera.position);
        const behind = Vector3.Dot(cameraForward, offset) <= 0;
        const projected = Vector3.Project(
          position,
          Matrix.Identity(),
          transform,
          viewport,
        );
        const outsideViewport = (
          projected.x < 0
          || projected.x > width
          || projected.y < 0
          || projected.y > height
          || projected.z < 0
          || projected.z > 1
        );
        const edge = behind || outsideViewport;
        const xPercent = behind
          ? Vector3.Dot(cameraRight, offset) >= 0
            ? 94
            : 6
          : Math.max(5, Math.min(95, projected.x / width * 100));
        const yPercent = behind
          ? 50
          : Math.max(7, Math.min(86, projected.y / height * 100));
        return {
          id: bot.id,
          xPercent,
          yPercent,
          distance: offset.length(),
          edge,
        };
      });
    this.ui.renderEnemyIndicators(indicators);
  }

  private runGameplayTest(now: number) {
    const currentAlive = this.botManager?.alive ?? 0;
    const wave = createWaveConfig(this.waveIndex + 1);
    const combatBots = this.botManager?.combatDebugBots ?? [];
    const activeAttackers = combatBots.filter(
      (bot) => bot.ownsAttackSlot,
    );
    this.gameplayTestMaximumShooters = Math.max(
      this.gameplayTestMaximumShooters,
      activeAttackers.length,
    );
    const livingTypeCounts = (
      this.botManager?.livingEnemyTypes ?? []
    ).reduce<Record<EnemyType, number>>(
      (counts, enemyType) => {
        counts[enemyType] += 1;
        return counts;
      },
      {
        normal: 0,
        armoured: 0,
        smg: 0,
        shotgun: 0,
        sniper: 0,
        boss: 0,
      },
    );
    for (const enemyType of Object.keys(
      livingTypeCounts,
    ) as EnemyType[]) {
      this.gameplayTestMaximumActiveByType[enemyType] = Math.max(
        this.gameplayTestMaximumActiveByType[enemyType],
        livingTypeCounts[enemyType],
      );
      if (
        livingTypeCounts[enemyType]
        > wave.maximumActiveByType[enemyType]
      ) {
        this.gameplayTestAttackRestrictionViolation = true;
      }
    }
    const activeAttackerTypes = activeAttackers.map(
      (bot) => bot.enemyType,
    );
    if (
      activeAttackers.length > wave.maximumShooters
      || (
        activeAttackerTypes.includes("boss")
        && activeAttackerTypes.includes("sniper")
      )
    ) {
      this.gameplayTestAttackRestrictionViolation = true;
    }
    document.documentElement.dataset.attackRestrictionEvidence = JSON.stringify({
      maximumShootersObserved: this.gameplayTestMaximumShooters,
      shooterLimit: wave.maximumShooters,
      maximumActiveByType: this.gameplayTestMaximumActiveByType,
      violation: this.gameplayTestAttackRestrictionViolation,
    });
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
      } else if (this.gameplayTestScenario === "safeZone") {
        this.camera.position.set(-16, GAME_CONFIG.player.standingHeight, -16);
        const magazineBefore = this.weapon.magazine;
        this.shoot(now);
        document.documentElement.dataset.safeZoneEvidence = JSON.stringify({
          insideSafeZone: isInsideSafeZone(this.camera.position),
          magazineBefore,
          magazineAfter: this.weapon.magazine,
        });
        this.gameplayTestActionComplete = true;
      } else if (
        this.gameplayTestScenario === "enemyAttack"
        && currentAlive > 0
      ) {
        const target = this.botManager?.bots.find((bot) => bot.isAlive);
        if (target) {
          target.mesh.position.set(18, 1.3, 8);
          target.mesh.computeWorldMatrix(true);
          target.bodyHitbox.computeWorldMatrix(true);
          this.camera.position.set(18, 1.7, -6);
          this.camera.setTarget(target.bodyHitbox.getAbsolutePosition());
          document.documentElement.dataset.enemyAttackTargetId = String(
            target.id,
          );
          this.gameplayTestActionComplete = true;
        }
      } else if (
        [
          "sniperEnemy",
          "shotgunEnemy",
          "bossEnemy",
        ].includes(this.gameplayTestScenario)
        && currentAlive > 0
      ) {
        const enemyType = this.gameplayTestScenario === "sniperEnemy"
          ? "sniper"
          : this.gameplayTestScenario === "shotgunEnemy"
            ? "shotgun"
            : "boss";
        const target = this.botManager?.bots.find(
          (bot) => bot.isAlive && bot.enemyType === enemyType,
        );
        if (target) {
          this.arrangeEnemyTypeCombatTest(target, enemyType);
          this.gameplayTestActionComplete = true;
        }
      } else if (
        this.gameplayTestScenario === "botBlocked"
        && currentAlive > 0
      ) {
        const target = this.botManager?.bots.find((bot) => bot.isAlive);
        if (target) {
          target.mesh.position.set(-11, 1.3, -7);
          target.mesh.computeWorldMatrix(true);
          target.bodyHitbox.computeWorldMatrix(true);
          this.camera.position.set(-11, 1.7, 1);
          this.camera.setTarget(target.bodyHitbox.getAbsolutePosition());
          document.documentElement.dataset.blockedBotEvidence = JSON.stringify({
            id: target.id,
            start: {
              x: target.mesh.position.x,
              z: target.mesh.position.z,
            },
          });
          this.gameplayTestActionComplete = true;
        }
      } else if (
        this.gameplayTestScenario === "attackSlots"
        && currentAlive >= 4
      ) {
        this.arrangeOpenCombatTest();
        this.gameplayTestActionComplete = true;
      } else if (
        this.gameplayTestScenario === "slotRelease"
        && currentAlive >= 3
      ) {
        this.runAttackSlotReleaseTest(now);
      } else if (
        this.gameplayTestScenario === "headshotKill"
        && currentAlive > 0
      ) {
        const target = this.botManager?.bots.find((bot) => bot.isAlive);
        if (target) {
          const weaponStats = currentWeaponStats(this.shopState);
          target.mesh.position.set(0, 1.3, -3);
          target.health = weaponStats.headshotDamage;
          target.mesh.computeWorldMatrix(true);
          target.headHitbox.computeWorldMatrix(true);
          const headPosition = target.headHitbox.getAbsolutePosition();
          this.camera.position.set(0, headPosition.y, -8);
          this.camera.setTarget(headPosition);
          this.camera.computeWorldMatrix();
          this.shoot(now);
          this.gameplayTestActionComplete = true;
        }
      } else if (
        this.gameplayTestScenario === "sniperRecharge"
        && currentAlive > 0
      ) {
        if (this.equippedWeapon !== "sniper") {
          this.switchWeapon("sniper");
          this.gameplayTestNextActionAt = now + 350;
        } else if (!this.sniper.isRecharging) {
          const target = this.botManager?.bots.find((bot) => bot.isAlive);
          if (target) {
            target.mesh.position.set(0, 1.3, -3);
            target.mesh.computeWorldMatrix(true);
            target.bodyHitbox.computeWorldMatrix(true);
            const targetPosition = target.bodyHitbox.getAbsolutePosition();
            this.camera.position.set(0, targetPosition.y, -8);
            this.camera.setTarget(targetPosition);
            this.camera.computeWorldMatrix();
            this.shoot(now);
            this.gameplayTestNextActionAt = now + 900;
          }
        } else {
          this.switchWeapon("rifle");
          document.documentElement.dataset.sniperRechargeEvidence = JSON.stringify({
            shotsRemaining: this.sniper.shotsRemaining,
            rechargeRemainingMs: this.sniper.getRechargeRemainingMs(now),
          });
          this.gameplayTestActionComplete = true;
        }
      } else if (
        this.gameplayTestScenario === "sniperScope"
        && currentAlive > 0
      ) {
        if (this.equippedWeapon !== "sniper") {
          this.switchWeapon("sniper");
          this.gameplayTestNextActionAt = now + 350;
        } else if (this.aimBlend < 0.95) {
          this.aimDown = true;
          this.gameplayTestNextActionAt = now + 50;
        } else {
          this.aimDown = true;
          this.gameplayTestActionComplete = true;
        }
      } else if (
        this.gameplayTestScenario === "sniperLongRange"
        && currentAlive > 0
      ) {
        if (this.equippedWeapon !== "sniper") {
          this.switchWeapon("sniper");
          this.gameplayTestNextActionAt = now + 350;
        } else if (this.aimBlend < 0.95) {
          this.aimDown = true;
          this.gameplayTestNextActionAt = now + 50;
        } else {
          const target = this.botManager?.bots.find((bot) => bot.isAlive);
          if (target) {
            this.botManager?.bots
              .filter((bot) => bot.isAlive && bot !== target)
              .forEach((bot, index) => {
                bot.mesh.position.set(-18, 1.3, -4 + index * 4);
                bot.mesh.computeWorldMatrix(true);
                bot.bodyHitbox.computeWorldMatrix(true);
                bot.headHitbox.computeWorldMatrix(true);
              });
            target.mesh.position.set(18, 1.3, 16);
            target.mesh.computeWorldMatrix(true);
            target.bodyHitbox.computeWorldMatrix(true);
            target.headHitbox.computeWorldMatrix(true);
            const targetPosition = target.bodyHitbox.getAbsolutePosition();
            this.camera.position.set(18, targetPosition.y, -16);
            this.camera.setTarget(targetPosition);
            this.camera.computeWorldMatrix();
            this.shoot(now);
            this.gameplayTestActionComplete = true;
          }
        }
      } else if (
        this.gameplayTestScenario === "sniperNearMiss"
        && currentAlive > 0
      ) {
        if (this.equippedWeapon !== "sniper") {
          this.switchWeapon("sniper");
          this.gameplayTestNextActionAt = now + 350;
        } else {
          const target = this.botManager?.bots.find((bot) => bot.isAlive);
          if (target) {
            this.botManager?.bots
              .filter((bot) => bot.isAlive && bot !== target)
              .forEach((bot, index) => {
                bot.mesh.position.set(-18, 1.3, -4 + index * 4);
                bot.mesh.computeWorldMatrix(true);
                bot.bodyHitbox.computeWorldMatrix(true);
                bot.headHitbox.computeWorldMatrix(true);
              });
            target.mesh.position.set(18, 1.3, 16);
            target.mesh.computeWorldMatrix(true);
            target.bodyHitbox.computeWorldMatrix(true);
            target.headHitbox.computeWorldMatrix(true);
            const targetPosition = target.bodyHitbox.getAbsolutePosition();
            const remainingBefore = this.botManager?.remaining ?? 0;
            this.camera.position.set(17, targetPosition.y, -16);
            this.camera.setTarget(
              new Vector3(17, targetPosition.y, targetPosition.z),
            );
            this.camera.computeWorldMatrix();
            this.shoot(now);
            document.documentElement.dataset.sniperNearMissEvidence = JSON.stringify({
              targetId: target.id,
              offsetFromTargetCenter: 1,
              remainingBefore,
              remainingAfter: this.botManager?.remaining ?? 0,
              targetHealth: target.health,
            });
            this.gameplayTestActionComplete = true;
          }
        }
      } else if (this.gameplayTestScenario === "finalFive") {
        if (
          (this.botManager?.remaining ?? 0) > 5
          && currentAlive > 0
        ) {
          this.botManager?.eliminateActiveBots(now, 1);
          this.gameplayTestNextActionAt = now + 100;
        } else if ((this.botManager?.remaining ?? 0) <= 5) {
          this.gameplayTestActionComplete = true;
        }
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

  private arrangeOpenCombatTest() {
    const positions = [
      new Vector3(18, 1.3, 8),
      new Vector3(18, 1.3, 5),
      new Vector3(18, 1.3, 2),
      new Vector3(18, 1.3, -1),
    ];
    const bots = this.botManager?.bots
      .filter((bot) => bot.isAlive)
      .slice(0, positions.length) ?? [];
    bots.forEach((bot, index) => {
      bot.mesh.position.copyFrom(positions[index]);
      bot.mesh.computeWorldMatrix(true);
      bot.bodyHitbox.computeWorldMatrix(true);
      bot.headHitbox.computeWorldMatrix(true);
    });
    this.camera.position.set(18, 1.7, -16);
    this.camera.setTarget(new Vector3(18, 1.3, 4));
    this.camera.computeWorldMatrix();
    document.documentElement.dataset.attackSlotStartPositions = JSON.stringify(
      bots.map((bot) => ({
        id: bot.id,
        x: bot.mesh.position.x,
        z: bot.mesh.position.z,
      })),
    );
  }

  private arrangeEnemyTypeCombatTest(
    target: NonNullable<BotManager["bots"][number]>,
    enemyType: EnemyType,
  ) {
    this.botManager?.bots
      .filter((bot) => bot.isAlive && bot !== target)
      .forEach((bot, index) => {
        bot.mesh.position.x = -18;
        bot.mesh.position.z = -10 + index * 3;
        bot.mesh.computeWorldMatrix(true);
        bot.bodyHitbox.computeWorldMatrix(true);
        bot.headHitbox.computeWorldMatrix(true);
      });
    target.mesh.position.x = 18;
    target.mesh.position.z = 16;
    target.mesh.computeWorldMatrix(true);
    target.bodyHitbox.computeWorldMatrix(true);
    target.headHitbox.computeWorldMatrix(true);
    this.camera.position.set(
      18,
      GAME_CONFIG.player.standingHeight,
      enemyType === "sniper"
        ? -16
        : enemyType === "shotgun"
          ? 8
          : 12,
    );
    this.camera.setTarget(target.bodyHitbox.getAbsolutePosition());
    this.camera.computeWorldMatrix();
    this.playerController?.reset();
    document.documentElement.dataset.enemyTypeTestTarget = JSON.stringify({
      id: target.id,
      enemyType,
      initialDistance: horizontalDistance(
        target.mesh.position,
        this.camera.position,
      ),
    });
  }

  private runAttackSlotReleaseTest(now: number) {
    if (this.gameplayTestStage === 0) {
      this.arrangeOpenCombatTest();
      this.gameplayTestStage = 1;
      this.gameplayTestNextActionAt = now + 1_600;
      return;
    }
    if (this.gameplayTestStage === 1) {
      const before = this.botManager?.shooterIds ?? [];
      const shootingBot = this.botManager?.bots.find(
        (bot) => bot.isAlive && before.includes(bot.id),
      );
      if (!shootingBot) {
        this.gameplayTestNextActionAt = now + 100;
        return;
      }
      this.botManager?.damageBot(
        shootingBot,
        shootingBot.health,
        now,
      );
      document.documentElement.dataset.slotReleaseEvidence = JSON.stringify({
        before,
        killed: shootingBot.id,
        after: [],
      });
      this.gameplayTestStage = 2;
      this.gameplayTestNextActionAt = now + 150;
      return;
    }
    const evidence = JSON.parse(
      document.documentElement.dataset.slotReleaseEvidence ?? "{}",
    ) as {
      before?: number[];
      killed?: number;
      after?: number[];
    };
    evidence.after = this.botManager?.shooterIds ?? [];
    document.documentElement.dataset.slotReleaseEvidence = JSON.stringify(
      evidence,
    );
    this.gameplayTestActionComplete = true;
  }

  private showGameplayTestReport() {
    document.documentElement.dataset.botCombatEvidence = JSON.stringify(
      this.botManager?.combatDebugBots ?? [],
    );
    document.documentElement.dataset.scopeEvidence = JSON.stringify({
      equippedWeapon: this.equippedWeapon,
      aiming: this.aimDown,
      aimBlend: this.aimBlend,
      cameraFovDegrees: this.camera.fov * 180 / Math.PI,
      sniperModelVisible: this.sniperRig?.isEnabled() ?? false,
    });
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
      framesPerSecond: this.engine.getFps(),
      activeShooters: this.botManager?.activeShooters ?? 0,
      shooterLimit: createWaveConfig(
        this.waveIndex + 1,
      ).maximumShooters,
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
    }, deltaSeconds, movementSpeedMultiplier(this.shopState));
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

  private updateShopAvailability() {
    const shop = getShopAtPosition(this.camera.position);
    this.nearbyShop = shop;

    if (this.activeShop && shop !== this.activeShop) {
      this.closeShop();
      this.feedback = "Shop closed — you left the safe zone";
    }

    this.ui.setShopPrompt(
      !this.activeShop && shop
        ? `Press E to open ${SHOP_NAMES[shop]}`
        : undefined,
    );
  }

  private openNearbyShop() {
    if (!this.nearbyShop || this.paused) return;
    this.activeShop = this.nearbyShop;
    this.shopMessage = undefined;
    this.mouseDown = false;
    this.cancelAim();
    this.clearLookInput();
    document.exitPointerLock();
    this.renderActiveShop();
  }

  private closeShop() {
    this.activeShop = undefined;
    this.shopMessage = undefined;
    this.ui.hideShop();
    this.updateShopAvailability();
  }

  private renderActiveShop() {
    if (!this.activeShop) return;
    this.ui.showShop(
      this.createShopMenu(this.activeShop),
      {
        onPurchase: (id) => this.purchaseShopUpgrade(id),
        onClose: () => this.closeShop(),
      },
    );
  }

  private purchaseShopUpgrade(id: string) {
    if (
      !this.activeShop
      || getShopAtPosition(this.camera.position) !== this.activeShop
      || !isShopPurchaseId(id)
    ) {
      return;
    }

    const previousMaximumHealth = this.shopState.maximumHealth;
    const result = purchaseShopItem(this.shopState, id);
    if (result.status === "insufficient-funds") {
      this.shopMessage = "Not enough coins";
      this.feedback = "Not enough coins";
      this.renderActiveShop();
      this.updateHud();
      return;
    }

    this.shopState = result.state;
    const healthIncrease = (
      this.shopState.maximumHealth - previousMaximumHealth
    );
    if (healthIncrease > 0) {
      this.playerHealth = Math.min(
        this.shopState.maximumHealth,
        this.playerHealth + healthIncrease,
      );
    }
    this.syncWeaponStats(id === "magazine-10");
    this.shopMessage = `${result.price} coins spent`;
    this.feedback = this.shopMessage;
    this.renderActiveShop();
    this.updateHud();
  }

  private syncWeaponStats(refill: boolean) {
    const stats = currentWeaponStats(this.shopState);
    this.weapon.configure(stats.magazineSize, stats.reloadMs, refill);
  }

  private createShopMenu(shop: ShopKind): ShopMenuData {
    const weaponStats = currentWeaponStats(this.shopState);
    const movementMultiplier = movementSpeedMultiplier(this.shopState);
    const currentSpeed = (
      GAME_CONFIG.player.forwardSpeed * movementMultiplier
    ).toFixed(2);
    return {
      title: SHOP_NAMES[shop],
      summary: "Four repeatable upgrades for the current run.",
      coins: this.shopState.coins,
      message: this.shopMessage,
      rows: [
        {
          id: "movement-10",
          label: "Movement speed",
          current: (
            `${currentSpeed} m/s · `
            + `+${this.shopState.movementBonusPercent}%`
          ),
          addition: "+10%",
          price: getShopPrice(this.shopState, "movement-10"),
        },
        {
          id: "health-10",
          label: "Maximum health",
          current: (
            `${Math.round(this.playerHealth)} current / `
            + `${Math.round(this.shopState.maximumHealth)} maximum`
          ),
          addition: "+10%",
          price: getShopPrice(this.shopState, "health-10"),
        },
        {
          id: "rifle-damage-10",
          label: "Rifle damage",
          current: (
            `${weaponStats.bodyDamage.toFixed(1)} body · `
            + `+${this.shopState.rifleDamageBonusPercent}%`
          ),
          addition: "+10%",
          price: getShopPrice(this.shopState, "rifle-damage-10"),
        },
        {
          id: "magazine-10",
          label: "Magazine size",
          current: (
            `${weaponStats.magazineSize} rounds · `
            + `+${this.shopState.magazineBonusPercent}%`
          ),
          addition: "+10%",
          price: getShopPrice(this.shopState, "magazine-10"),
        },
      ],
    };
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

  private switchWeapon(weapon: PlayerWeaponKind) {
    if (
      !this.matchActive
      || this.activeShop
      || this.equippedWeapon === weapon
    ) {
      return;
    }
    this.equippedWeapon = weapon;
    this.weaponSwitchStartedAt = performance.now();
    this.mouseDown = false;
    this.recoil = 0;
    this.audio.playWeaponSwitch();
    this.rifleRig?.setEnabled(weapon === "rifle");
    this.sniperRig?.setEnabled(weapon === "sniper");
    if (weapon === "sniper") {
      const rechargeSeconds = Math.ceil(
        this.sniper.getRechargeRemainingMs(performance.now()) / 1000,
      );
      this.feedback = this.sniper.isRecharging
        ? `Sniper recharging · ${rechargeSeconds}s`
        : `Sniper equipped · ${this.sniper.shotsRemaining} shots`;
    } else {
      this.feedback = "Assault Rifle equipped";
    }
  }

  private getWeaponAmmoText(now: number) {
    if (this.equippedWeapon === "rifle") {
      return (
        `${this.weapon.magazine} / `
        + `${currentWeaponStats(this.shopState).magazineSize}`
      );
    }
    if (this.sniper.isRecharging) {
      const seconds = Math.ceil(
        this.sniper.getRechargeRemainingMs(now) / 1000,
      );
      return `RECHARGE ${seconds}s`;
    }
    return `${this.sniper.shotsRemaining} / ${SNIPER_CONFIG.maximumShots} SHOTS`;
  }

  private updateAim(deltaSeconds: number) {
    const target = (
      this.aimDown
      && this.phase === "active"
    ) ? 1 : 0;
    this.aimBlend += (target - this.aimBlend) * Math.min(1, deltaSeconds * 8);
    const normalFov = GAME_CONFIG.player.cameraFovDegrees * Math.PI / 180;
    const aimedFov = (
      this.equippedWeapon === "sniper"
        ? 22
        : 42
    ) * Math.PI / 180;
    this.camera.fov = normalFov + (aimedFov - normalFov) * this.aimBlend;
    this.ui.setAiming(
      this.aimBlend > 0.08,
      this.equippedWeapon === "sniper",
    );
  }

  private cancelAim() {
    this.aimDown = false;
    this.aimBlend = 0;
    this.ui.setAiming(false);
    if (this.camera) {
      this.camera.fov = GAME_CONFIG.player.cameraFovDegrees * Math.PI / 180;
    }
  }

  private updateWeaponPresentation(now: number) {
    const switchProgress = Math.min(
      1,
      Math.max(0, (now - this.weaponSwitchStartedAt) / 320),
    );
    const switchDrop = Math.sin(switchProgress * Math.PI) * 0.42;
    const rifleActive = this.equippedWeapon === "rifle";
    const sniperScopeClear = !rifleActive && this.aimBlend >= 0.82;
    this.rifleRig?.setEnabled(rifleActive);
    this.sniperRig?.setEnabled(!rifleActive && !sniperScopeClear);

    if (this.rifleRig) {
      this.rifleRig.position.set(
        0.42 * (1 - this.aimBlend),
        -0.38 + this.aimBlend * 0.22 - this.recoil * 1.8 - switchDrop,
        0.72 - this.aimBlend * 0.12,
      );
      this.rifleRig.rotation.z = (1 - switchProgress) * 0.16;
    }
    if (this.sniperRig) {
      this.sniperRig.position.set(
        0.46 * (1 - this.aimBlend),
        -0.43 + this.aimBlend * 0.26 - this.recoil * 1.4 - switchDrop,
        0.84 - this.aimBlend * 0.18,
      );
      this.sniperRig.rotation.z = (1 - switchProgress) * -0.18;
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
      { name: "safe-zone exit", x: -16, y: 2, z: -13.9 },
      { name: "cargo west lane", x: -16, y: 2, z: 0 },
      { name: "cargo south lane", x: -8, y: 2, z: -7 },
      { name: "cargo north lane", x: -8, y: 2, z: 15 },
      { name: "central combat lane", x: 1, y: 2, z: -7 },
      { name: "platform south approach", x: 8, y: 2, z: -4 },
      { name: "platform east approach", x: 15, y: 2, z: 5 },
      { name: "central north lane", x: 1, y: 2, z: 8 },
      { name: "north entry lane", x: 0, y: 2, z: 16 },
      { name: "east entry lane", x: 16, y: 2, z: 0 },
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
        "command platform south ramp",
        new Vector3(8, GAME_CONFIG.player.standingHeight, -3.7),
        0,
        [{ frames: 90, input: forward }],
      ),
      runElevationRoute(
        "command platform west ramp",
        new Vector3(0.2, GAME_CONFIG.player.standingHeight, 5),
        Math.PI / 2,
        [{ frames: 125, input: forward }],
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
        new Vector3(-16, GAME_CONFIG.player.standingHeight, -13.9),
        0.9,
      ),
      runSurfaceJump(
        "command platform",
        new Vector3(8, 4.925, 5),
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

    this.camera.position.set(
      -16,
      GAME_CONFIG.player.standingHeight,
      -13.9,
    );
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
    this.ui.renderEnemyIndicators([]);
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
    if (this.activeShop) return;
    if (now - this.weaponSwitchStartedAt < 260) return;
    if (isInsideSafeZone(this.camera.position)) {
      this.feedback = "SAFE ZONE — weapons disabled";
      return;
    }
    if (this.equippedWeapon === "sniper") {
      this.shootSniper(now);
      return;
    }
    this.shootRifle(now);
  }

  private shootRifle(now: number) {
    if (this.weapon.magazine === 0) {
      this.audio.play("empty");
      this.reload();
      return;
    }
    const weaponStats = currentWeaponStats(this.shopState);
    if (!this.weapon.canFire(now, weaponStats.roundsPerMinute)) return;
    this.camera.getViewMatrix(true);
    const forwardRay = this.camera.getForwardRay(weaponStats.range);
    const direction = forwardRay.direction.clone();
    const spread = weaponStats.spread + this.recoil * 0.18;
    direction.x += (Math.random() - 0.5) * spread;
    direction.y += (Math.random() - 0.5) * spread;
    direction.normalize();
    this.weapon.fire(now);
    this.shotsFired += 1;
    this.botManager?.reportPlayerGunshot(this.camera.position, now);
    this.audio.playGunshot(this.currentSurface === "indoor");
    this.recoil = Math.min(0.12, this.recoil + GAME_CONFIG.weapon.recoilPerShot);
    this.camera.rotation.x -= GAME_CONFIG.weapon.recoilPerShot;
    this.flashMuzzle();
    const ray = new Ray(
      forwardRay.origin,
      direction,
      weaponStats.range,
    );
    const hit = this.scene.pickWithRay(ray, (mesh) => (
      this.botManager?.getBotByMesh(mesh) !== undefined
      || this.cover.some((wall) => wall === mesh)
      || this.walkableSurfaces.includes(mesh)
      || this.pushablePropController?.hasMesh(mesh) === true
    ));
    const bot = hit?.pickedMesh ? this.botManager?.getBotByMesh(hit.pickedMesh) : undefined;
    if (bot) {
      this.shotsHit += 1;
      const headshot = hit?.pickedMesh?.metadata?.hitZone === "head";
      const configuredDamage = headshot
        ? weaponStats.headshotDamage
        : weaponStats.bodyDamage;
      const damage = bot.adjustIncomingPlayerDamage(configuredDamage);
      const defeated = this.botManager?.damageBot(
        bot,
        damage,
        now,
        direction,
        false,
      ) ?? false;
      this.audio.play("hit", bot.mesh.position);
      this.combatEffectManager?.spawnBlood(
        hit!.pickedPoint!,
        direction,
        now,
        defeated,
      );
      if (defeated) {
        const coinReward = getBotKillCoinReward(
          bot.enemyType,
          headshot,
        );
        this.shopState = awardCoins(this.shopState, coinReward);
        this.feedback = (
          `${headshot ? "HEADSHOT — " : ""}Enemy eliminated · `
          + `+${coinReward} coins · ${this.botManager?.remaining ?? 0} remaining`
        );
      } else {
        this.feedback = headshot ? "HEADSHOT" : "Hit confirmed";
      }
      this.impact(hit!.pickedPoint!, true, "concrete");
    } else if (hit?.pickedPoint) {
      const bulletMaterial = bulletMaterialOf(hit.pickedMesh ?? undefined);
      if (hit.pickedMesh && this.pushablePropController?.hasMesh(hit.pickedMesh)) {
        this.pushablePropController.applyBulletImpulse(hit.pickedMesh, direction);
      }
      this.impact(hit.pickedPoint, false, bulletMaterial);
    }
  }

  private shootSniper(now: number) {
    if (this.sniper.isRecharging) {
      const seconds = Math.ceil(
        this.sniper.getRechargeRemainingMs(now) / 1000,
      );
      this.feedback = `Sniper recharging · ${seconds}s · Rifle available on 1`;
      this.audio.play("empty");
      return;
    }
    if (!this.sniper.fire(now)) return;

    this.camera.getViewMatrix(true);
    const forwardRay = this.camera.getForwardRay(SNIPER_CONFIG.range);
    const direction = forwardRay.direction.clone().normalize();
    const ray = new Ray(
      forwardRay.origin,
      direction,
      SNIPER_CONFIG.range,
    );
    this.shotsFired += 1;
    this.botManager?.reportPlayerGunshot(this.camera.position, now);
    this.audio.playSniperShot(this.currentSurface === "indoor");
    this.recoil = Math.min(0.2, this.recoil + SNIPER_CONFIG.recoil);
    this.camera.rotation.x -= SNIPER_CONFIG.recoil;
    this.flashMuzzle("sniper");
    const hit = this.scene.pickWithRay(ray, (mesh) => (
      this.botManager?.getBotByMesh(mesh) !== undefined
      || this.cover.includes(mesh)
      || this.walkableSurfaces.includes(mesh)
      || this.pushablePropController?.hasMesh(mesh) === true
    ));
    if (this.gameplayTestMode) {
      document.documentElement.dataset.sniperShotEvidence = JSON.stringify({
        origin: {
          x: ray.origin.x,
          y: ray.origin.y,
          z: ray.origin.z,
        },
        direction: {
          x: ray.direction.x,
          y: ray.direction.y,
          z: ray.direction.z,
        },
        rayLength: ray.length,
        hitMesh: hit?.pickedMesh?.name ?? null,
        hitDistance: hit?.distance ?? null,
        hitBotId: hit?.pickedMesh
          ? this.botManager?.getBotByMesh(hit.pickedMesh)?.id ?? null
          : null,
      });
    }
    const bot = hit?.pickedMesh
      ? this.botManager?.getBotByMesh(hit.pickedMesh)
      : undefined;
    if (bot && hit?.pickedPoint) {
      this.shotsHit += 1;
      const headshot = hit.pickedMesh?.metadata?.hitZone === "head";
      const defeated = this.botManager?.damageBot(
        bot,
        SNIPER_CONFIG.damage,
        now,
        direction,
        true,
      ) ?? false;
      this.audio.playSniperImpact(hit.pickedPoint);
      this.combatEffectManager?.spawnBlood(
        hit.pickedPoint,
        direction,
        now,
        defeated,
      );
      if (defeated) {
        const coinReward = getBotKillCoinReward(
          bot.enemyType,
          headshot,
        );
        this.shopState = awardCoins(this.shopState, coinReward);
        this.feedback = (
          `SNIPER ELIMINATION · +${coinReward} coins · `
          + `${this.botManager?.remaining ?? 0} remaining`
        );
      } else {
        this.feedback = "Sniper hit · 200 damage";
      }
      this.impact(hit.pickedPoint, true, "concrete");
    } else if (hit?.pickedPoint) {
      const bulletMaterial = bulletMaterialOf(hit.pickedMesh ?? undefined);
      if (hit.pickedMesh && this.pushablePropController?.hasMesh(hit.pickedMesh)) {
        this.pushablePropController.applyBulletImpulse(
          hit.pickedMesh,
          direction.scale(1.8),
        );
      }
      this.audio.playSniperImpact(hit.pickedPoint);
      this.impact(hit.pickedPoint, false, bulletMaterial);
    }

    if (this.sniper.isRecharging) {
      this.feedback = "Sniper depleted · 60s recharge started · Rifle available on 1";
    }
  }

  private flashMuzzle(weapon: PlayerWeaponKind = "rifle") {
    const flash = weapon === "sniper"
      ? this.sniperMuzzleFlash
      : this.rifleMuzzleFlash;
    flash?.setEnabled(true);
    window.setTimeout(
      () => flash?.setEnabled(false),
      weapon === "sniper" ? 80 : 45,
    );
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
    if (
      this.activeShop
      || isInsideSafeZone(this.camera.position)
    ) return;
    if (this.equippedWeapon === "sniper") {
      this.feedback = this.sniper.isRecharging
        ? "Sniper recharges automatically · Rifle available on 1"
        : "Sniper has no manual reload";
      return;
    }
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
      || this.playerHealth >= this.shopState.maximumHealth
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
    this.playerHealth = Math.min(
      this.shopState.maximumHealth,
      this.playerHealth + GAME_CONFIG.regeneration.healthPerSecond * dt,
    );
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
    this.combatEffectManager?.clear();
    this.rifleMuzzleFlash?.setEnabled(false);
    this.sniperMuzzleFlash?.setEnabled(false);
    this.ui.renderEnemyIndicators([]);
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

function parseGameplayTestWave(value: string | null) {
  const wave = Number(value);
  return Number.isFinite(wave)
    ? Math.max(1, Math.min(500, Math.floor(wave)))
    : 1;
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
