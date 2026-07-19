import {
  Color3,
  Mesh,
  MeshBuilder,
  Scene,
  StandardMaterial,
  TransformNode,
  Vector3,
} from "@babylonjs/core";

export class BotVisual {
  private readonly root: TransformNode;
  private readonly materials: StandardMaterial[] = [];
  private readonly muzzleFlash: Mesh;
  private muzzleFlashUntil = 0;

  constructor(
    scene: Scene,
    id: number,
    model: TransformNode,
    collisionMesh: Mesh,
  ) {
    this.root = new TransformNode(`bot ${id} visual`, scene);
    this.root.parent = collisionMesh;

    model.parent = this.root;
    model.position.set(0, -1.3, 0);
    model.rotation.set(0, Math.PI, 0);
    model.scaling.setAll(1.25);
    model.setEnabled(true);
    model.getChildMeshes().forEach((mesh) => {
      mesh.isPickable = false;
      mesh.setEnabled(true);
    });

    const weaponMaterial = this.createMaterial(
      scene,
      `bot ${id} weapon material`,
      new Color3(0.025, 0.03, 0.035),
    );
    const flashMaterial = this.createMaterial(
      scene,
      `bot ${id} muzzle flash material`,
      new Color3(1, 0.42, 0.03),
      new Color3(1, 0.34, 0.015),
    );
    this.addBox(
      scene,
      `bot ${id} rifle body`,
      new Vector3(0.22, 0.25, 0.45),
      [0.16, 0.17, 0.82],
      weaponMaterial,
    );
    this.addBox(
      scene,
      `bot ${id} rifle stock`,
      new Vector3(0.22, 0.25, 0.02),
      [0.23, 0.22, 0.28],
      weaponMaterial,
    );
    this.addBox(
      scene,
      `bot ${id} rifle barrel`,
      new Vector3(0.22, 0.27, 0.92),
      [0.07, 0.07, 0.45],
      weaponMaterial,
    );
    this.muzzleFlash = MeshBuilder.CreateSphere(
      `bot ${id} muzzle flash`,
      { diameter: 0.2, segments: 8 },
      scene,
    );
    this.muzzleFlash.parent = this.root;
    this.muzzleFlash.position.set(0.22, 0.27, 1.18);
    this.muzzleFlash.material = flashMaterial;
    this.muzzleFlash.isPickable = false;
    this.muzzleFlash.setEnabled(false);
  }

  update(now: number) {
    this.muzzleFlash.setEnabled(now < this.muzzleFlashUntil);
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
