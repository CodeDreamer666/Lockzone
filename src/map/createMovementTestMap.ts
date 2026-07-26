import {
  Color3,
  MeshBuilder,
  StandardMaterial,
  type Scene,
  Vector3,
} from "@babylonjs/core";
import type { MapData } from "./createMap";

export function createMovementTestMap(scene: Scene): MapData {
  const floorMaterial = new StandardMaterial("movement test floor material", scene);
  floorMaterial.diffuseColor = new Color3(0.16, 0.18, 0.19);
  const obstacleMaterial = new StandardMaterial("movement test obstacle material", scene);
  obstacleMaterial.diffuseColor = new Color3(0.78, 0.2, 0.12);

  const floor = MeshBuilder.CreateGround(
    "movement test floor",
    { width: 120, height: 120 },
    scene,
  );
  floor.material = floorMaterial;
  floor.checkCollisions = true;
  floor.isPickable = true;
  floor.metadata = {
    physicsCategory: "walkable-surface",
    surfaceType: "concrete",
  };

  const wall = MeshBuilder.CreateBox(
    "movement test visible wall",
    { width: 28, height: 5, depth: 0.8 },
    scene,
  );
  wall.position.set(0, 2.5, 18);
  wall.material = obstacleMaterial;
  wall.checkCollisions = true;
  wall.isPickable = true;

  const box = MeshBuilder.CreateBox(
    "movement test visible box",
    { width: 4, height: 4, depth: 4 },
    scene,
  );
  box.position.set(14, 2, 3);
  box.material = obstacleMaterial;
  box.checkCollisions = true;
  box.isPickable = true;

  for (const mesh of [wall, box]) {
    mesh.metadata = {
      bulletMaterial: "concrete",
      collisionCategory: "solid-cover",
      collisionShape: "box",
      debugDescription: "Visible movement-test collision",
    };
  }

  const step = MeshBuilder.CreateBox(
    "movement test small step",
    { width: 5, height: 0.4, depth: 2 },
    scene,
  );
  step.position.set(-18, 0.2, -7);
  step.material = obstacleMaterial;
  step.checkCollisions = true;
  step.isPickable = true;
  step.metadata = { bulletMaterial: "concrete", collisionCategory: "solid-cover", surfaceType: "concrete" };

  const lowObstacle = MeshBuilder.CreateBox(
    "movement test jumpable obstacle",
    { width: 5, height: 1.05, depth: 0.8 },
    scene,
  );
  lowObstacle.position.set(18, 0.525, -7);
  lowObstacle.material = obstacleMaterial;
  lowObstacle.checkCollisions = true;
  lowObstacle.isPickable = true;
  lowObstacle.metadata = { bulletMaterial: "concrete", collisionCategory: "solid-cover" };

  const ramp = MeshBuilder.CreateBox(
    "movement test ramp",
    { width: 4, height: 0.22, depth: 10 },
    scene,
  );
  ramp.position.set(-18, 1.1, 8);
  ramp.rotation.x = Math.atan2(2.2, 10);
  ramp.material = obstacleMaterial;
  ramp.checkCollisions = true;
  ramp.isPickable = true;
  ramp.metadata = { bulletMaterial: "metal", collisionCategory: "solid-cover", surfaceType: "metal" };

  const platform = MeshBuilder.CreateBox(
    "movement test elevated platform",
    { width: 10, height: 0.3, depth: 8 },
    scene,
  );
  platform.position.set(-18, 2.2, 16);
  platform.material = obstacleMaterial;
  platform.checkCollisions = true;
  platform.isPickable = true;
  platform.metadata = { bulletMaterial: "metal", collisionCategory: "solid-cover", surfaceType: "metal" };

  const stairs = Array.from({ length: 6 }, (_, index) => {
    const height = (index + 1) * 0.35;
    const stair = MeshBuilder.CreateBox(
      `movement test stair ${index}`,
      { width: 3.5, height, depth: 0.75 },
      scene,
    );
    stair.position.set(18, height / 2, 5 + index * 0.75);
    stair.material = obstacleMaterial;
    stair.checkCollisions = true;
    stair.isPickable = true;
    stair.metadata = { bulletMaterial: "metal", collisionCategory: "solid-cover", surfaceType: "metal" };
    return stair;
  });

  const lowCeiling = MeshBuilder.CreateBox(
    "movement test low ceiling",
    { width: 8, height: 0.4, depth: 8 },
    scene,
  );
  lowCeiling.position.set(0, 2.5, -7);
  lowCeiling.material = obstacleMaterial;
  lowCeiling.checkCollisions = true;
  lowCeiling.isPickable = true;
  lowCeiling.metadata = { bulletMaterial: "concrete", collisionCategory: "solid-cover" };

  const walkableSurfaces = [floor, step, ramp, platform, ...stairs];
  const cover = [wall, box, step, lowObstacle, ramp, platform, ...stairs, lowCeiling];

  return {
    cover,
    walkableSurfaces,
    decorativeMeshes: [],
    pushableProps: [],
    playerSpawn: new Vector3(0, 1.7, -20),
    botSpawns: [],
    resourcePoints: [],
    navigationNodes: [],
  };
}
