import {
  Color3,
  Mesh,
  MeshBuilder,
  Scene,
  StandardMaterial,
  TransformNode,
  Vector3,
} from "@babylonjs/core";
import type { EnemyArchetype } from "../game/gameConfig";

export class BotVisual {
  private readonly root: TransformNode;
  private readonly materials: StandardMaterial[] = [];
  private readonly muzzleFlash: Mesh;
  private muzzleFlashUntil = 0;

  constructor(
    scene: Scene,
    id: number,
    collisionMesh: Mesh,
    archetype: EnemyArchetype,
  ) {
    this.root = new TransformNode(`bot ${id} visual`, scene);
    this.root.parent = collisionMesh;
    if (archetype.boss) {
      this.root.scaling.setAll(1.12);
    }

    const uniformColor = archetype.type === "elite-sniper"
      ? new Color3(0.08, 0.13, 0.18)
      : archetype.type === "boss"
        ? new Color3(0.2, 0.075, 0.06)
        : archetype.type === "smg"
          ? new Color3(0.105, 0.16, 0.13)
          : new Color3(0.12, 0.135, 0.14);
    const armorColor = archetype.type === "armoured"
      ? new Color3(0.16, 0.17, 0.175)
      : archetype.type === "boss"
        ? new Color3(0.12, 0.035, 0.03)
        : new Color3(0.055, 0.065, 0.07);

    const uniform = this.createMaterial(
      scene,
      `bot ${id} uniform material`,
      uniformColor,
    );
    const armor = this.createMaterial(
      scene,
      `bot ${id} armor material`,
      armorColor,
    );
    const fabric = this.createMaterial(
      scene,
      `bot ${id} face covering material`,
      new Color3(0.075, 0.085, 0.09),
    );
    const visor = this.createMaterial(
      scene,
      `bot ${id} visor material`,
      new Color3(0.035, 0.075, 0.09),
      new Color3(0.015, 0.035, 0.045),
    );
    const pouch = this.createMaterial(
      scene,
      `bot ${id} pouch material`,
      new Color3(0.16, 0.17, 0.16),
    );
    const weaponMaterial = this.createMaterial(
      scene,
      `bot ${id} weapon material`,
      new Color3(0.025, 0.03, 0.035),
    );
    this.addCapsule(
      scene,
      `bot ${id} torso`,
      new Vector3(0, 0.05, 0),
      1.12,
      0.31,
      uniform,
    );
    this.addBox(
      scene,
      `bot ${id} plate carrier`,
      new Vector3(0, 0.18, 0.18),
      [0.62, 0.72, 0.24],
      armor,
    );
    this.addBox(
      scene,
      `bot ${id} rear armor`,
      new Vector3(0, 0.18, -0.15),
      [0.58, 0.66, 0.16],
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
    [-0.47, 0.47].forEach((x, index) => {
      this.addCapsule(
        scene,
        `bot ${id} arm ${index}`,
        new Vector3(x, 0.02, 0),
        1.02,
        0.13,
        uniform,
        0.12,
      );
      this.addBox(
        scene,
        `bot ${id} glove ${index}`,
        new Vector3(x, -0.5, 0.04),
        [0.22, 0.24, 0.18],
        armor,
      );
    });
    [-0.2, 0.2].forEach((x, index) => {
      this.addCapsule(
        scene,
        `bot ${id} leg ${index}`,
        new Vector3(x, -0.78, 0),
        1.08,
        0.16,
        uniform,
      );
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
      0.62,
      armor,
      new Vector3(1.08, 0.72, 1.08),
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
    this.addBox(
      scene,
      `bot ${id} helmet rail`,
      new Vector3(0.31, 0.94, 0),
      [0.08, 0.14, 0.3],
      pouch,
    );
    const flashMaterial = this.createMaterial(
      scene,
      `bot ${id} muzzle flash material`,
      new Color3(1, 0.42, 0.03),
      new Color3(1, 0.34, 0.015),
    );
    const isSmg = archetype.weapon.type === "smg";
    const isShotgun = archetype.weapon.type === "shotgun";
    const isSniper = archetype.weapon.type === "sniper";
    const receiverLength = isSmg ? 0.56 : isShotgun ? 0.92 : 0.82;
    const barrelLength = isSmg ? 0.24 : isShotgun ? 0.58 : isSniper ? 0.72 : 0.45;
    const muzzleZ = isSmg ? 1 : isShotgun ? 1.32 : isSniper ? 1.46 : 1.18;
    this.addBox(
      scene,
      `bot ${id} ${archetype.weapon.type} body`,
      new Vector3(0.22, 0.25, 0.45),
      [isShotgun ? 0.13 : 0.16, 0.17, receiverLength],
      weaponMaterial,
    );
    this.addBox(
      scene,
      `bot ${id} ${archetype.weapon.type} stock`,
      new Vector3(0.22, 0.25, 0.02),
      [0.23, 0.22, 0.28],
      weaponMaterial,
    );
    this.addBox(
      scene,
      `bot ${id} ${archetype.weapon.type} barrel`,
      new Vector3(0.22, 0.27, muzzleZ - barrelLength / 2),
      [isShotgun ? 0.1 : 0.07, isShotgun ? 0.1 : 0.07, barrelLength],
      weaponMaterial,
    );
    this.muzzleFlash = MeshBuilder.CreateSphere(
      `bot ${id} muzzle flash`,
      { diameter: 0.2, segments: 8 },
      scene,
    );
    this.muzzleFlash.parent = this.root;
    this.muzzleFlash.position.set(0.22, 0.27, muzzleZ);
    this.muzzleFlash.material = flashMaterial;
    this.muzzleFlash.isPickable = false;
    this.muzzleFlash.setEnabled(false);
  }

  update(now: number) {
    this.muzzleFlash.setEnabled(now < this.muzzleFlashUntil);
  }

  getMuzzlePosition() {
    return this.muzzleFlash.getAbsolutePosition().clone();
  }

  showMuzzleFlash(now: number) {
    this.muzzleFlashUntil = now + 55;
    this.muzzleFlash.setEnabled(true);
  }

  hideMuzzleFlash() {
    this.muzzleFlash.setEnabled(false);
  }

  dispose() {
    this.root.dispose();
    this.materials.forEach((material) => material.dispose());
  }

  private addBox(
    scene: Scene,
    name: string,
    position: Vector3,
    size: [number, number, number],
    material: StandardMaterial,
  ) {
    const part = MeshBuilder.CreateBox(
      name,
      { width: size[0], height: size[1], depth: size[2] },
      scene,
    );
    part.parent = this.root;
    part.position.copyFrom(position);
    part.material = material;
    part.isPickable = false;
  }

  private addCapsule(
    scene: Scene,
    name: string,
    position: Vector3,
    height: number,
    radius: number,
    material: StandardMaterial,
    rotationZ = 0,
  ) {
    const part = MeshBuilder.CreateCapsule(
      name,
      { height, radius },
      scene,
    );
    part.parent = this.root;
    part.position.copyFrom(position);
    part.rotation.z = rotationZ;
    part.material = material;
    part.isPickable = false;
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
    part.parent = this.root;
    part.position.copyFrom(position);
    part.scaling.copyFrom(scaling);
    part.material = material;
    part.isPickable = false;
  }

  private createMaterial(
    scene: Scene,
    name: string,
    diffuse: Color3,
    emissive = Color3.Black(),
  ) {
    const material = new StandardMaterial(name, scene);
    material.diffuseColor = diffuse;
    material.emissiveColor = emissive;
    material.specularColor = new Color3(0.08, 0.08, 0.08);
    this.materials.push(material);
    return material;
  }
}
