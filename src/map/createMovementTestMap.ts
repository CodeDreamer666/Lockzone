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
      collisionCategory: "solid-cover",
      collisionShape: "box",
      debugDescription: "Visible movement-test collision",
    };
  }

  return {
    cover: [wall, box],
    walkableSurfaces: [floor],
    decorativeMeshes: [],
    playerSpawn: new Vector3(0, 1.7, -20),
    botSpawns: [],
    resourcePoints: [],
  };
}
