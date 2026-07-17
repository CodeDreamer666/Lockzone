import {
  MeshBuilder,
  NullEngine,
  Scene,
  Vector3,
} from "@babylonjs/core";
import { PushablePropController } from "../src/game/PushablePropController.ts";

const engine = new NullEngine({ renderWidth: 64, renderHeight: 64 });
const scene = new Scene(engine);
const prop = MeshBuilder.CreateBox(
  "test pushable box",
  { width: 0.9, height: 0.9, depth: 0.9 },
  scene,
);
prop.position.set(0, 0.45, 0);
const wall = MeshBuilder.CreateBox(
  "test solid wall",
  { width: 4, height: 3, depth: 0.5 },
  scene,
);
wall.position.set(0, 1.5, 2.1);
wall.computeWorldMatrix(true);

const controller = new PushablePropController(
  [{ mesh: prop, radius: 0.6, halfHeight: 0.45, mass: 1.2 }],
  [wall],
);
const deltaSeconds = 1 / 120;

for (let frame = 0; frame < 24; frame += 1) {
  controller.update(
    deltaSeconds,
    new Vector3(0, 1.7, -0.7),
    new Vector3(0, 0, 7.2 * deltaSeconds),
    true,
  );
}

const pushedDistance = prop.position.z;
if (pushedDistance <= 0.05) {
  throw new Error(`Player push did not move the prop: ${pushedDistance.toFixed(3)} m`);
}

controller.applyBulletImpulse(prop, new Vector3(0, 0, 1));
let furthestPosition = prop.position.z;
for (let frame = 0; frame < 240; frame += 1) {
  controller.update(deltaSeconds, Vector3.Zero(), Vector3.Zero(), false);
  furthestPosition = Math.max(furthestPosition, prop.position.z);
}

const wallFront = wall.position.z - 0.25;
const propFront = prop.position.z + 0.45;
if (propFront > wallFront + 0.02) {
  throw new Error(
    `Prop penetrated the wall: prop front ${propFront.toFixed(3)}, wall front ${wallFront.toFixed(3)}`,
  );
}

const restingPosition = prop.position.clone();
controller.reset();
for (let frame = 0; frame < 60; frame += 1) {
  controller.update(deltaSeconds, Vector3.Zero(), Vector3.Zero(), false);
}
if (Vector3.Distance(restingPosition, prop.position) > 0.0001) {
  throw new Error("Reset did not clear pushable-prop velocity");
}

console.log(
  JSON.stringify(
    {
      bulletAndDragSettled: true,
      collisionPreventedWallPenetration: true,
      furthestPosition,
      playerPushDistance: pushedDistance,
      restingPosition: prop.position.z,
    },
    null,
    2,
  ),
);

scene.dispose();
engine.dispose();
