import {
  Color3,
  Mesh,
  MeshBuilder,
  Quaternion,
  Scene,
  StandardMaterial,
  TransformNode,
  Vector3,
} from "@babylonjs/core";
import {
  createEnemyArchetype,
  type EnemyType,
} from "../game/gameConfig";

export const BOT_WEAPON_POSTURE = {
  chestDepth: 0.18,
  receiverDepth: 0.68,
  supportHandDepth: 0.94,
  triggerHandDepth: 0.54,
} as const;

interface BotVisualUpdate {
  aiming: boolean;
  moving: boolean;
  target?: Vector3;
}

interface BotVisualProfile {
  uniform: Color3;
  armor: Color3;
  fabric: Color3;
  visor: Color3;
  pouch: Color3;
  weapon: Color3;
  scale: Vector3;
  torsoRadius: number;
  plateSize: [number, number, number];
  weaponLabel: string;
  receiverDepth: number;
  receiverWidth: number;
  receiverHeight: number;
  receiverLength: number;
  stockLength: number;
  barrelLength: number;
  barrelWidth: number;
  muzzleDepth: number;
  triggerHandDepth: number;
  supportHandDepth: number;
}

export class BotVisual {
  private readonly fallPivot: TransformNode;
  private readonly modelRoot: TransformNode;
  private readonly weaponRig: TransformNode;
  private readonly modelStandingHeight: number;
  private readonly materials: StandardMaterial[] = [];
  private readonly reactiveMaterials: StandardMaterial[] = [];
  private readonly legs: Mesh[] = [];
  private readonly muzzleFlash: Mesh;
  private warningGlow?: Mesh;
  private muzzleFlashUntil = 0;
  private warningUntil = 0;
  private reloadUntil = 0;
  private reloadStartedAt = 0;
  private meleeAttackStartedAt = -Infinity;
  private recoilKick = 0;
  private hitReactionUntil = 0;
  private hitLeanDirection = 1;
  private deathStartedAt = Infinity;
  private deathLeanDirection = 1;

  constructor(
    scene: Scene,
    id: number,
    collisionMesh: Mesh,
    enemyType: EnemyType,
  ) {
    const archetype = createEnemyArchetype(enemyType);
    const profile = getVisualProfile(enemyType);
    this.fallPivot = new TransformNode(`bot ${id} fall pivot`, scene);
    this.fallPivot.parent = collisionMesh;
    this.fallPivot.position.y = -archetype.collision.height / 2;

    this.modelRoot = new TransformNode(`bot ${id} visual`, scene);
    this.modelRoot.parent = this.fallPivot;
    this.modelStandingHeight = archetype.collision.height / 2;
    this.modelRoot.position.y = this.modelStandingHeight;
    this.modelRoot.scaling.copyFrom(profile.scale);

    this.weaponRig = new TransformNode(`bot ${id} weapon rig`, scene);
    this.weaponRig.parent = this.modelRoot;

    const uniformColor = profile.uniform;
    const armorColor = profile.armor;

    const uniform = this.createMaterial(
      scene,
      `bot ${id} uniform material`,
      uniformColor,
      undefined,
      true,
    );
    const armor = this.createMaterial(
      scene,
      `bot ${id} armor material`,
      armorColor,
      undefined,
      true,
    );
    const fabric = this.createMaterial(
      scene,
      `bot ${id} face covering material`,
      profile.fabric,
    );
    const visor = this.createMaterial(
      scene,
      `bot ${id} visor material`,
      profile.visor,
      profile.visor.scale(0.35),
    );
    const pouch = this.createMaterial(
      scene,
      `bot ${id} pouch material`,
      profile.pouch,
    );
    const weaponMaterial = this.createMaterial(
      scene,
      `bot ${id} weapon material`,
      profile.weapon,
    );

    this.addCapsule(
      scene,
      `bot ${id} torso`,
      new Vector3(0, 0.05, 0),
      1.12,
      profile.torsoRadius,
      uniform,
    );
    this.addBox(
      scene,
      `bot ${id} plate carrier`,
      new Vector3(0, 0.18, BOT_WEAPON_POSTURE.chestDepth),
      profile.plateSize,
      armor,
    );
    this.addBox(
      scene,
      `bot ${id} rear armor`,
      new Vector3(0, 0.18, -0.15),
      [
        profile.plateSize[0] * 0.94,
        profile.plateSize[1] * 0.92,
        profile.plateSize[2] * 0.7,
      ],
      armor,
    );
    [-0.22, 0, 0.22].forEach((x, index) => {
      this.addBox(
        scene,
        `bot ${id} ammunition pouch ${index}`,
        new Vector3(x, -0.05, 0.34),
        [0.16, 0.3, 0.13],
        pouch,
      );
    });
    if (
      enemyType === "armoured"
      || enemyType === "shotgun"
      || enemyType === "boss"
    ) {
      [-0.48, 0.48].forEach((x, index) => {
        this.addBox(
          scene,
          `bot ${id} heavy shoulder armour ${index}`,
          new Vector3(x, 0.38, 0),
          enemyType === "boss"
            ? [0.34, 0.34, 0.5]
            : [0.27, 0.25, 0.38],
          armor,
        );
      });
    }
    if (enemyType === "boss") {
      this.addBox(
        scene,
        `bot ${id} boss chest crest`,
        new Vector3(0, 0.28, 0.36),
        [0.34, 0.52, 0.11],
        visor,
      );
    }

    const rightShoulder = new Vector3(0.42, 0.35, 0);
    const rightElbow = new Vector3(0.34, 0.05, 0.25);
    const rightHand = new Vector3(
      0.16,
      0.08,
      profile.triggerHandDepth,
    );
    const leftShoulder = new Vector3(-0.42, 0.35, 0);
    const leftElbow = new Vector3(-0.35, 0.15, 0.45);
    const leftHand = new Vector3(
      -0.13,
      0.17,
      profile.supportHandDepth,
    );
    [
      [rightShoulder, rightElbow],
      [rightElbow, rightHand],
      [leftShoulder, leftElbow],
      [leftElbow, leftHand],
    ].forEach(([start, end], index) => {
      this.addLimbBetween(
        scene,
        `bot ${id} arm segment ${index}`,
        start,
        end,
        0.13,
        uniform,
      );
    });
    [rightHand, leftHand].forEach((position, index) => {
      this.addSphere(
        scene,
        `bot ${id} glove ${index}`,
        position,
        0.22,
        armor,
      );
    });

    [-0.2, 0.2].forEach((x, index) => {
      const leg = this.addCapsule(
        scene,
        `bot ${id} leg ${index}`,
        new Vector3(x, -0.78, 0),
        1.08,
        0.16,
        uniform,
      );
      this.legs.push(leg);
      this.addBox(
        scene,
        `bot ${id} boot ${index}`,
        new Vector3(x, -1.25, 0.08),
        [0.3, 0.28, 0.5],
        armor,
      );
    });
    this.addSphere(
      scene,
      `bot ${id} head`,
      new Vector3(0, 0.79, 0),
      0.5,
      fabric,
    );
    this.addSphere(
      scene,
      `bot ${id} tactical helmet`,
      new Vector3(0, 0.92, -0.01),
      enemyType === "armoured"
        ? 0.78
        : enemyType === "boss"
          ? 0.84
          : 0.62,
      armor,
      enemyType === "armoured" || enemyType === "boss"
        ? new Vector3(1.15, 0.82, 1.15)
        : new Vector3(1.08, 0.72, 1.08),
    );
    this.addBox(
      scene,
      `bot ${id} dark visor`,
      new Vector3(0, 0.87, 0.27),
      [0.48, 0.17, 0.08],
      visor,
    );
    this.addBox(
      scene,
      `bot ${id} face covering`,
      new Vector3(0, 0.67, 0.24),
      [0.38, 0.23, 0.1],
      fabric,
    );

    const muzzleZ = profile.muzzleDepth;
    if (enemyType === "boss") {
      [-0.22, 0.22].forEach((x, index) => {
        this.addBox(
          scene,
          `bot ${id} boss striking gauntlet ${index}`,
          new Vector3(x, 0.12, 0.86),
          [0.3, 0.3, 0.5],
          armor,
          this.weaponRig,
        );
      });
    } else {
      this.addBox(
        scene,
        `bot ${id} ${profile.weaponLabel} receiver`,
        new Vector3(0.04, 0.18, profile.receiverDepth),
        [
          profile.receiverWidth,
          profile.receiverHeight,
          profile.receiverLength,
        ],
        weaponMaterial,
        this.weaponRig,
      );
      this.addBox(
        scene,
        `bot ${id} ${profile.weaponLabel} stock`,
        new Vector3(0.04, 0.2, 0.17),
        [0.23, 0.22, profile.stockLength],
        weaponMaterial,
        this.weaponRig,
      );
      this.addBox(
        scene,
        `bot ${id} ${profile.weaponLabel} barrel`,
        new Vector3(
          0.04,
          0.2,
          muzzleZ - profile.barrelLength / 2,
        ),
        [
          profile.barrelWidth,
          profile.barrelWidth,
          profile.barrelLength,
        ],
        weaponMaterial,
        this.weaponRig,
      );
      if (enemyType === "shotgun") {
        this.addBox(
          scene,
          `bot ${id} shotgun pump`,
          new Vector3(0.04, 0.12, 1.03),
          [0.24, 0.22, 0.38],
          pouch,
          this.weaponRig,
        );
      }
      if (enemyType === "sniper") {
        this.addCylinderScope(
          scene,
          `bot ${id} sniper scope`,
          new Vector3(0.04, 0.34, 0.68),
          weaponMaterial,
        );
      }
    }

    const flashMaterial = this.createMaterial(
      scene,
      `bot ${id} muzzle flash material`,
      new Color3(1, 0.42, 0.03),
      new Color3(1, 0.34, 0.015),
    );
    this.muzzleFlash = MeshBuilder.CreateSphere(
      `bot ${id} muzzle flash`,
      { diameter: 0.2, segments: 8 },
      scene,
    );
    this.muzzleFlash.parent = this.weaponRig;
    this.muzzleFlash.position.set(0.04, 0.2, muzzleZ);
    this.muzzleFlash.material = flashMaterial;
    this.muzzleFlash.isPickable = false;
    this.muzzleFlash.setEnabled(false);
    if (enemyType === "sniper") {
      const warningMaterial = this.createMaterial(
        scene,
        `bot ${id} scope warning material`,
        new Color3(0.65, 0.85, 1),
        new Color3(0.5, 0.8, 1),
      );
      this.warningGlow = MeshBuilder.CreateSphere(
        `bot ${id} scope warning glint`,
        { diameter: 0.17, segments: 10 },
        scene,
      );
      this.warningGlow.parent = this.weaponRig;
      this.warningGlow.position.set(0.04, 0.34, 0.87);
      this.warningGlow.material = warningMaterial;
      this.warningGlow.isPickable = false;
      this.warningGlow.setEnabled(false);
    }
  }

  update(now: number, state: BotVisualUpdate) {
    this.muzzleFlash.setEnabled(now < this.muzzleFlashUntil);
    this.warningGlow?.setEnabled(now < this.warningUntil);
    this.recoilKick *= 0.72;

    if (Number.isFinite(this.deathStartedAt)) {
      const progress = Math.min(1, (now - this.deathStartedAt) / 520);
      const eased = 1 - (1 - progress) ** 3;
      this.fallPivot.rotation.x = -1.48 * eased;
      this.fallPivot.rotation.z = (
        this.deathLeanDirection * 0.16 * eased
      );
      this.modelRoot.position.y = this.modelStandingHeight;
      this.weaponRig.position.z = -this.recoilKick;
      return;
    }

    const movementPhase = now * 0.012;
    const stride = state.moving ? Math.sin(movementPhase) : 0;
    this.modelRoot.position.y = (
      this.modelStandingHeight
      + Math.abs(stride) * 0.025
    );
    this.legs[0].rotation.x = stride * 0.22;
    this.legs[1].rotation.x = -stride * 0.22;

    const hitActive = now < this.hitReactionUntil;
    this.modelRoot.rotation.z = hitActive
      ? this.hitLeanDirection
        * Math.sin((this.hitReactionUntil - now) / 180 * Math.PI)
        * 0.11
      : 0;
    for (const material of this.reactiveMaterials) {
      material.emissiveColor = hitActive
        ? new Color3(0.22, 0.015, 0.01)
        : Color3.Black();
    }

    if (state.target) {
      const muzzle = this.getMuzzlePosition();
      const difference = state.target.subtract(muzzle);
      const horizontal = Math.hypot(difference.x, difference.z);
      const pitch = Math.atan2(difference.y, horizontal);
      this.weaponRig.rotation.x = -Math.max(
        -0.45,
        Math.min(0.45, pitch),
      );
    }
    const reloadActive = now < this.reloadUntil;
    if (reloadActive) {
      const reloadDuration = Math.max(
        1,
        this.reloadUntil - this.reloadStartedAt,
      );
      const reloadProgress = (
        now - this.reloadStartedAt
      ) / reloadDuration;
      this.weaponRig.rotation.z = (
        -Math.sin(Math.min(1, reloadProgress) * Math.PI) * 0.55
      );
      this.weaponRig.position.y = -0.12;
    } else {
      this.weaponRig.rotation.z = 0;
      this.weaponRig.position.y = 0;
    }
    const meleeProgress = (now - this.meleeAttackStartedAt) / 420;
    let meleeOffsetZ = 0;
    if (meleeProgress >= 0 && meleeProgress <= 1) {
      this.weaponRig.rotation.x = (
        -0.2 + Math.sin(meleeProgress * Math.PI) * 1.15
      );
      meleeOffsetZ = Math.sin(
        meleeProgress * Math.PI,
      ) * 0.7;
    }
    this.weaponRig.position.z = (
      meleeOffsetZ
      + (state.aiming ? 0.06 : 0)
      - this.recoilKick
    );
  }

  getMuzzlePosition() {
    return this.muzzleFlash.getAbsolutePosition().clone();
  }

  showMuzzleFlash(now: number) {
    this.muzzleFlashUntil = now + 55;
    this.recoilKick = Math.max(this.recoilKick, 0.12);
    this.muzzleFlash.setEnabled(true);
  }

  showWarning(now: number, durationMs: number) {
    this.warningUntil = now + durationMs;
    this.warningGlow?.setEnabled(true);
  }

  hideWarning() {
    this.warningUntil = 0;
    this.warningGlow?.setEnabled(false);
  }

  beginReload(now: number, durationMs: number) {
    this.reloadStartedAt = now;
    this.reloadUntil = now + durationMs;
  }

  showMeleeAttack(now: number) {
    this.meleeAttackStartedAt = now;
  }

  reactToHit(now: number, impactDirection: Vector3) {
    this.hitReactionUntil = now + 190;
    const lateral = impactDirection.x + impactDirection.z * 0.35;
    this.hitLeanDirection = Math.abs(lateral) > 0.01
      ? Math.sign(lateral)
      : 1;
  }

  beginDeath(now: number, impactDirection: Vector3) {
    this.deathStartedAt = now;
    const lateral = impactDirection.x + impactDirection.z * 0.25;
    this.deathLeanDirection = Math.abs(lateral) > 0.01
      ? Math.sign(lateral)
      : 1;
  }

  hideMuzzleFlash() {
    this.muzzleFlash.setEnabled(false);
  }

  dispose() {
    this.fallPivot.dispose();
    this.materials.forEach((material) => material.dispose());
  }

  private addBox(
    scene: Scene,
    name: string,
    position: Vector3,
    size: [number, number, number],
    material: StandardMaterial,
    parent: TransformNode = this.modelRoot,
  ) {
    const part = MeshBuilder.CreateBox(
      name,
      {
        width: size[0],
        height: size[1],
        depth: size[2],
      },
      scene,
    );
    part.parent = parent;
    part.position.copyFrom(position);
    part.material = material;
    part.isPickable = false;
    return part;
  }

  private addCapsule(
    scene: Scene,
    name: string,
    position: Vector3,
    height: number,
    radius: number,
    material: StandardMaterial,
  ) {
    const part = MeshBuilder.CreateCapsule(
      name,
      { height, radius },
      scene,
    );
    part.parent = this.modelRoot;
    part.position.copyFrom(position);
    part.material = material;
    part.isPickable = false;
    return part;
  }

  private addLimbBetween(
    scene: Scene,
    name: string,
    start: Vector3,
    end: Vector3,
    radius: number,
    material: StandardMaterial,
  ) {
    const direction = end.subtract(start);
    const length = direction.length();
    direction.normalize();
    const part = this.addCapsule(
      scene,
      name,
      start.add(end).scale(0.5),
      length,
      radius,
      material,
    );
    const up = Vector3.Up();
    const axis = Vector3.Cross(up, direction);
    const dot = Math.max(-1, Math.min(1, Vector3.Dot(up, direction)));
    part.rotationQuaternion = axis.lengthSquared() < 0.0001
      ? Quaternion.Identity()
      : Quaternion.RotationAxis(axis.normalize(), Math.acos(dot));
    return part;
  }

  private addSphere(
    scene: Scene,
    name: string,
    position: Vector3,
    diameter: number,
    material: StandardMaterial,
    scaling = Vector3.One(),
  ) {
    const part = MeshBuilder.CreateSphere(
      name,
      { diameter, segments: 16 },
      scene,
    );
    part.parent = this.modelRoot;
    part.position.copyFrom(position);
    part.scaling.copyFrom(scaling);
    part.material = material;
    part.isPickable = false;
    return part;
  }

  private addCylinderScope(
    scene: Scene,
    name: string,
    position: Vector3,
    material: StandardMaterial,
  ) {
    const scope = MeshBuilder.CreateCylinder(
      name,
      {
        height: 0.48,
        diameter: 0.13,
        tessellation: 12,
      },
      scene,
    );
    scope.parent = this.weaponRig;
    scope.position.copyFrom(position);
    scope.rotation.x = Math.PI / 2;
    scope.material = material;
    scope.isPickable = false;
    return scope;
  }

  private createMaterial(
    scene: Scene,
    name: string,
    diffuse: Color3,
    emissive = Color3.Black(),
    reactsToHit = false,
  ) {
    const material = new StandardMaterial(name, scene);
    material.diffuseColor = diffuse;
    material.emissiveColor = emissive;
    material.specularColor = new Color3(0.08, 0.08, 0.08);
    this.materials.push(material);
    if (reactsToHit) this.reactiveMaterials.push(material);
    return material;
  }
}

function getVisualProfile(enemyType: EnemyType): BotVisualProfile {
  switch (enemyType) {
    case "armoured":
      return {
        uniform: new Color3(0.12, 0.14, 0.15),
        armor: new Color3(0.1, 0.12, 0.13),
        fabric: new Color3(0.065, 0.075, 0.08),
        visor: new Color3(0.12, 0.22, 0.25),
        pouch: new Color3(0.18, 0.18, 0.16),
        weapon: new Color3(0.025, 0.03, 0.035),
        scale: new Vector3(1.12, 1.05, 1.12),
        torsoRadius: 0.36,
        plateSize: [0.76, 0.84, 0.34],
        weaponLabel: "heavy rifle",
        receiverDepth: 0.68,
        receiverWidth: 0.18,
        receiverHeight: 0.19,
        receiverLength: 0.92,
        stockLength: 0.38,
        barrelLength: 0.58,
        barrelWidth: 0.08,
        muzzleDepth: 1.52,
        triggerHandDepth: 0.54,
        supportHandDepth: 0.94,
      };
    case "smg":
      return {
        uniform: new Color3(0.15, 0.17, 0.16),
        armor: new Color3(0.06, 0.08, 0.075),
        fabric: new Color3(0.08, 0.09, 0.085),
        visor: new Color3(0.04, 0.16, 0.13),
        pouch: new Color3(0.18, 0.2, 0.17),
        weapon: new Color3(0.035, 0.04, 0.04),
        scale: new Vector3(0.92, 0.96, 0.92),
        torsoRadius: 0.28,
        plateSize: [0.54, 0.58, 0.2],
        weaponLabel: "compact smg",
        receiverDepth: 0.58,
        receiverWidth: 0.19,
        receiverHeight: 0.2,
        receiverLength: 0.56,
        stockLength: 0.24,
        barrelLength: 0.28,
        barrelWidth: 0.08,
        muzzleDepth: 1.04,
        triggerHandDepth: 0.48,
        supportHandDepth: 0.72,
      };
    case "shotgun":
      return {
        uniform: new Color3(0.19, 0.15, 0.1),
        armor: new Color3(0.12, 0.085, 0.055),
        fabric: new Color3(0.1, 0.075, 0.055),
        visor: new Color3(0.28, 0.12, 0.035),
        pouch: new Color3(0.24, 0.16, 0.08),
        weapon: new Color3(0.055, 0.045, 0.035),
        scale: new Vector3(1.08, 1.02, 1.08),
        torsoRadius: 0.35,
        plateSize: [0.7, 0.78, 0.3],
        weaponLabel: "shotgun",
        receiverDepth: 0.7,
        receiverWidth: 0.22,
        receiverHeight: 0.2,
        receiverLength: 0.82,
        stockLength: 0.42,
        barrelLength: 0.76,
        barrelWidth: 0.11,
        muzzleDepth: 1.64,
        triggerHandDepth: 0.56,
        supportHandDepth: 1.08,
      };
    case "sniper":
      return {
        uniform: new Color3(0.13, 0.16, 0.12),
        armor: new Color3(0.055, 0.075, 0.05),
        fabric: new Color3(0.07, 0.085, 0.065),
        visor: new Color3(0.12, 0.24, 0.3),
        pouch: new Color3(0.16, 0.18, 0.13),
        weapon: new Color3(0.02, 0.03, 0.025),
        scale: new Vector3(0.88, 0.97, 0.88),
        torsoRadius: 0.27,
        plateSize: [0.52, 0.56, 0.18],
        weaponLabel: "sniper rifle",
        receiverDepth: 0.76,
        receiverWidth: 0.15,
        receiverHeight: 0.16,
        receiverLength: 1.08,
        stockLength: 0.5,
        barrelLength: 0.94,
        barrelWidth: 0.055,
        muzzleDepth: 2,
        triggerHandDepth: 0.58,
        supportHandDepth: 1.18,
      };
    case "boss":
      return {
        uniform: new Color3(0.18, 0.055, 0.045),
        armor: new Color3(0.16, 0.025, 0.02),
        fabric: new Color3(0.08, 0.025, 0.02),
        visor: new Color3(0.62, 0.05, 0.02),
        pouch: new Color3(0.2, 0.06, 0.035),
        weapon: new Color3(0.09, 0.02, 0.015),
        scale: new Vector3(1.3, 1.27, 1.3),
        torsoRadius: 0.4,
        plateSize: [0.82, 0.9, 0.38],
        weaponLabel: "gauntlet",
        receiverDepth: 0.68,
        receiverWidth: 0.2,
        receiverHeight: 0.2,
        receiverLength: 0.8,
        stockLength: 0.3,
        barrelLength: 0.4,
        barrelWidth: 0.1,
        muzzleDepth: 1.2,
        triggerHandDepth: 0.58,
        supportHandDepth: 0.9,
      };
    case "normal":
      return {
        uniform: new Color3(0.12, 0.135, 0.14),
        armor: new Color3(0.055, 0.065, 0.07),
        fabric: new Color3(0.075, 0.085, 0.09),
        visor: new Color3(0.035, 0.075, 0.09),
        pouch: new Color3(0.16, 0.17, 0.16),
        weapon: new Color3(0.025, 0.03, 0.035),
        scale: Vector3.One(),
        torsoRadius: 0.31,
        plateSize: [0.62, 0.72, 0.24],
        weaponLabel: "rifle",
        receiverDepth: BOT_WEAPON_POSTURE.receiverDepth,
        receiverWidth: 0.16,
        receiverHeight: 0.17,
        receiverLength: 0.88,
        stockLength: 0.34,
        barrelLength: 0.58,
        barrelWidth: 0.07,
        muzzleDepth: 1.5,
        triggerHandDepth: BOT_WEAPON_POSTURE.triggerHandDepth,
        supportHandDepth: BOT_WEAPON_POSTURE.supportHandDepth,
      };
  }
}
