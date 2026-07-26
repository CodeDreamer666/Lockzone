import assert from "node:assert/strict";
import {
  MeshBuilder,
  NullEngine,
  Scene,
  Vector3,
} from "@babylonjs/core";
import { CombatEffectManager } from "../src/combat/CombatEffectManager.ts";

const engine = new NullEngine();
const scene = new Scene(engine);
const ground = MeshBuilder.CreateGround(
  "effect test ground",
  {
    width: 10,
    height: 10,
  },
  scene,
);
ground.metadata = {
  supportsGrounding: true,
};
ground.computeWorldMatrix(true);

const effects = new CombatEffectManager(scene, [ground]);
effects.spawnBlood(
  new Vector3(0, 1, 0),
  new Vector3(0, 0, -1),
  100,
  true,
);

assert.equal(
  effects.activeParticleCount,
  8,
  "lethal hits use a restrained eight-particle burst",
);
assert.equal(
  effects.activeDecalCount,
  1,
  "lethal hits place one small nearby decal",
);

effects.update(1_000, 1);
assert.equal(
  effects.activeParticleCount,
  0,
  "short-lived particles return to the pool",
);
effects.clear();
assert.equal(effects.activeParticleCount, 0, "wave cleanup clears particles");
assert.equal(effects.activeDecalCount, 0, "wave cleanup clears decals");

effects.dispose();
scene.dispose();
engine.dispose();

console.log("Pooled blood feedback and wave cleanup verification passed.");
