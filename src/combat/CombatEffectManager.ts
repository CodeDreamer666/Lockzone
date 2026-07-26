import {
  type AbstractMesh,
  Color3,
  Mesh,
  MeshBuilder,
  Ray,
  Scene,
  StandardMaterial,
  Vector3,
} from "@babylonjs/core";

interface BloodParticle {
  mesh: Mesh;
  velocity: Vector3;
  expiresAt: number;
}

const MAXIMUM_BLOOD_PARTICLES = 48;
const MAXIMUM_BLOOD_DECALS = 18;

export class CombatEffectManager {
  private readonly scene: Scene;
  private readonly groundSurfaces: AbstractMesh[];
  private readonly bloodMaterial: StandardMaterial;
  private readonly decalMaterial: StandardMaterial;
  private readonly particles: BloodParticle[] = [];
  private readonly decals: Mesh[] = [];

  constructor(
    scene: Scene,
    groundSurfaces: AbstractMesh[],
  ) {
    this.scene = scene;
    this.groundSurfaces = groundSurfaces;
    this.bloodMaterial = new StandardMaterial(
      "restrained blood particle material",
      scene,
    );
    this.bloodMaterial.diffuseColor = new Color3(0.28, 0.012, 0.008);
    this.bloodMaterial.emissiveColor = new Color3(0.04, 0, 0);
    this.bloodMaterial.specularColor = Color3.Black();

    this.decalMaterial = new StandardMaterial(
      "restrained blood decal material",
      scene,
    );
    this.decalMaterial.diffuseColor = new Color3(0.16, 0.008, 0.006);
    this.decalMaterial.specularColor = Color3.Black();
    this.decalMaterial.alpha = 0.72;
  }

  get activeParticleCount() {
    return this.particles.filter(
      (particle) => particle.mesh.isEnabled(),
    ).length;
  }

  get activeDecalCount() {
    return this.decals.filter((decal) => decal.isEnabled()).length;
  }

  spawnBlood(
    position: Vector3,
    impactDirection: Vector3,
    now: number,
    lethal: boolean,
  ) {
    const count = lethal ? 8 : 5;
    const forward = impactDirection.clone();
    if (forward.lengthSquared() < 0.001) {
      forward.set(0, 0.15, 1);
    }
    forward.normalize();

    for (let index = 0; index < count; index += 1) {
      const particle = this.acquireParticle();
      if (!particle) break;
      particle.mesh.position.copyFrom(position);
      particle.mesh.scaling.setAll(
        lethal ? 0.9 + Math.random() * 0.45 : 0.7 + Math.random() * 0.35,
      );
      particle.velocity.copyFrom(
        forward.scale(1.1 + Math.random() * 1.4),
      );
      particle.velocity.addInPlace(
        new Vector3(
          (Math.random() - 0.5) * 1.8,
          0.6 + Math.random() * 1.4,
          (Math.random() - 0.5) * 1.8,
        ),
      );
      particle.expiresAt = now + 320 + Math.random() * 220;
      particle.mesh.setEnabled(true);
    }

    if (lethal || Math.random() < 0.3) {
      this.placeGroundDecal(position);
    }
  }

  update(now: number, deltaSeconds: number) {
    for (const particle of this.particles) {
      if (!particle.mesh.isEnabled()) continue;
      if (now >= particle.expiresAt) {
        particle.mesh.setEnabled(false);
        continue;
      }
      particle.velocity.y -= 9.8 * deltaSeconds;
      particle.mesh.position.addInPlace(
        particle.velocity.scale(deltaSeconds),
      );
      particle.mesh.scaling.scaleInPlace(
        Math.max(0.75, 1 - deltaSeconds * 1.8),
      );
    }
  }

  clear() {
    this.particles.forEach((particle) => {
      particle.mesh.setEnabled(false);
      particle.velocity.setAll(0);
      particle.expiresAt = 0;
    });
    this.decals.forEach((decal) => decal.setEnabled(false));
  }

  dispose() {
    this.particles.forEach((particle) => particle.mesh.dispose());
    this.decals.forEach((decal) => decal.dispose());
    this.bloodMaterial.dispose();
    this.decalMaterial.dispose();
  }

  private acquireParticle() {
    const available = this.particles.find(
      (particle) => !particle.mesh.isEnabled(),
    );
    if (available) return available;
    if (this.particles.length >= MAXIMUM_BLOOD_PARTICLES) return undefined;

    const mesh = MeshBuilder.CreateSphere(
      `blood particle ${this.particles.length}`,
      {
        diameter: 0.055,
        segments: 5,
      },
      this.scene,
    );
    mesh.material = this.bloodMaterial;
    mesh.isPickable = false;
    mesh.checkCollisions = false;
    mesh.setEnabled(false);
    const particle = {
      mesh,
      velocity: Vector3.Zero(),
      expiresAt: 0,
    };
    this.particles.push(particle);
    return particle;
  }

  private placeGroundDecal(position: Vector3) {
    const hit = this.scene.pickWithRay(
      new Ray(
        position.add(new Vector3(0, 1.2, 0)),
        Vector3.Down(),
        8,
      ),
      (mesh) => (
        this.groundSurfaces.includes(mesh)
        || mesh.metadata?.supportsGrounding === true
      ),
    );
    if (!hit?.pickedPoint) return;

    const decal = this.acquireDecal();
    if (!decal) return;
    decal.position.copyFrom(
      hit.pickedPoint.add(new Vector3(0, 0.018, 0)),
    );
    decal.rotation.set(-Math.PI / 2, Math.random() * Math.PI, 0);
    decal.scaling.setAll(0.7 + Math.random() * 0.45);
    decal.setEnabled(true);
  }

  private acquireDecal() {
    const available = this.decals.find((decal) => !decal.isEnabled());
    if (available) return available;
    if (this.decals.length >= MAXIMUM_BLOOD_DECALS) {
      const reused = this.decals.shift();
      if (reused) {
        this.decals.push(reused);
      }
      return reused;
    }

    const decal = MeshBuilder.CreateDisc(
      `blood decal ${this.decals.length}`,
      {
        radius: 0.22,
        tessellation: 14,
      },
      this.scene,
    );
    decal.material = this.decalMaterial;
    decal.isPickable = false;
    decal.checkCollisions = false;
    decal.setEnabled(false);
    this.decals.push(decal);
    return decal;
  }
}
