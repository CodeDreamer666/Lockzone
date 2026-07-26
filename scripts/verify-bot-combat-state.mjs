import assert from "node:assert/strict";
import {
  MeshBuilder,
  NullEngine,
  Scene,
  Vector3,
} from "@babylonjs/core";
import { createServer } from "vite";

const moduleLoader = await createServer({
  appType: "custom",
  server: {
    middlewareMode: true,
  },
});
const { BotController } = await moduleLoader.ssrLoadModule(
  "/src/bot/BotController.ts",
);
const { createWaveConfig } = await moduleLoader.ssrLoadModule(
  "/src/game/gameConfig.ts",
);

const FRAME_SECONDS = 1 / 60;
const FRAME_MS = FRAME_SECONDS * 1_000;

function createTestWorld(playerPosition) {
  const engine = new NullEngine({
    renderWidth: 64,
    renderHeight: 64,
  });
  const scene = new Scene(engine);
  scene.collisionsEnabled = true;

  const ground = MeshBuilder.CreateGround(
    "combat test ground",
    {
      width: 100,
      height: 100,
    },
    scene,
  );
  ground.checkCollisions = true;
  ground.isPickable = true;
  ground.metadata = {
    physicsCategory: "walkable-surface",
    supportsGrounding: true,
  };
  ground.computeWorldMatrix(true);

  const playerTarget = MeshBuilder.CreateBox(
    "combat test player",
    {
      width: 0.8,
      height: 1.8,
      depth: 0.8,
    },
    scene,
  );
  playerTarget.position.copyFrom(playerPosition);
  playerTarget.isPickable = true;
  playerTarget.computeWorldMatrix(true);

  return {
    engine,
    scene,
    ground,
    playerTarget,
  };
}

function createContext({
  now,
  dt,
  bot,
  playerTarget,
  ground,
  cover = [],
  canShoot,
  onShot = () => undefined,
  onHitPlayer = () => undefined,
}) {
  return {
    now,
    dt,
    playerPosition: playerTarget.position,
    playerTarget,
    playerSpeed: 0,
    playerMaximumHealth: 100,
    canShoot,
    cover,
    ground,
    patrolPoints: [bot.mesh.position.clone()],
    navigationNodes: [],
    teammates: [bot],
    onShot,
    onWarning: () => undefined,
    onHitPlayer,
    onFootstep: () => undefined,
  };
}

function updateBot({
  bot,
  now,
  dt,
  playerTarget,
  ground,
  cover,
  onShot,
  onHitPlayer,
}) {
  const preparationContext = createContext({
    now,
    dt,
    bot,
    playerTarget,
    ground,
    cover,
    canShoot: false,
    onShot,
    onHitPlayer,
  });
  bot.prepareCombat(preparationContext);
  const canShoot = bot.wantsAttackSlot(now);
  const positionBeforeUpdate = bot.mesh.position.clone();
  bot.update({
    ...preparationContext,
    canShoot,
  });
  return {
    canShoot,
    positionBeforeUpdate,
    positionAfterUpdate: bot.mesh.position.clone(),
  };
}

{
  const world = createTestWorld(new Vector3(0, 1.3, 12));
  const wall = MeshBuilder.CreateBox(
    "solid wall between bot and player",
    {
      width: 30,
      height: 5,
      depth: 1,
    },
    world.scene,
  );
  wall.position.set(0, 2.5, 6);
  wall.checkCollisions = true;
  wall.isPickable = true;
  wall.metadata = {
    physicsCategory: "solid",
    supportsGrounding: true,
  };
  wall.computeWorldMatrix(true);

  const bot = new BotController(
    world.scene,
    Vector3.Zero(),
    0,
    createWaveConfig(1),
    "normal",
  );
  bot.mesh.computeWorldMatrix(true);
  let shotCount = 0;
  let hitCount = 0;

  for (let frame = 0; frame < 180; frame += 1) {
    updateBot({
      bot,
      now: frame * FRAME_MS,
      dt: FRAME_SECONDS,
      playerTarget: world.playerTarget,
      ground: [world.ground, wall],
      cover: [],
      onShot: () => {
        shotCount += 1;
      },
      onHitPlayer: () => {
        hitCount += 1;
      },
    });
  }

  assert.equal(
    shotCount,
    0,
    "a solid wall blocks every bot shot attempt",
  );
  assert.equal(
    hitCount,
    0,
    "a player behind a solid wall never receives bot damage",
  );
  assert.match(
    bot.debugSummary,
    /blocked by solid wall between bot and player/,
    "the bot reports the wall as the line-of-sight obstruction",
  );

  bot.dispose();
  world.scene.dispose();
  world.engine.dispose();
}

{
  const world = createTestWorld(new Vector3(12, 1.3, 0));
  const bot = new BotController(
    world.scene,
    Vector3.Zero(),
    0,
    createWaveConfig(1),
    "normal",
  );
  bot.mesh.computeWorldMatrix(true);
  let shotCount = 0;
  let heldSlotFrames = 0;

  updateBot({
    bot,
    now: 0,
    dt: 0,
    playerTarget: world.playerTarget,
    ground: [world.ground],
    cover: [],
    onShot: () => {
      shotCount += 1;
    },
  });
  updateBot({
    bot,
    now: 900,
    dt: 0,
    playerTarget: world.playerTarget,
    ground: [world.ground],
    cover: [],
    onShot: () => {
      shotCount += 1;
    },
  });

  assert.equal(
    shotCount,
    0,
    "the bot cannot shoot before turning its front and gun toward the player",
  );
  assert.equal(
    bot.combatDebugSnapshot.cannotFireBecause,
    "aligning body and weapon",
    "the alignment gate explains why the bot is holding fire",
  );

  for (let frame = 1; frame <= 120 && shotCount === 0; frame += 1) {
    const result = updateBot({
      bot,
      now: 900 + frame * FRAME_MS,
      dt: FRAME_SECONDS,
      playerTarget: world.playerTarget,
      ground: [world.ground],
      cover: [],
      onShot: () => {
        shotCount += 1;
      },
    });
    if (!result.canShoot) continue;
    heldSlotFrames += 1;
    assert.equal(
      result.positionAfterUpdate.x,
      result.positionBeforeUpdate.x,
      "an attack-slot owner does not move horizontally on x",
    );
    assert.equal(
      result.positionAfterUpdate.z,
      result.positionBeforeUpdate.z,
      "an attack-slot owner does not move horizontally on z",
    );
  }

  const debug = bot.combatDebugSnapshot;
  assert.ok(heldSlotFrames > 1, "the bot held still while aligning");
  assert.equal(shotCount, 1, "the aligned bot fires once");
  assert.equal(
    debug.attackSlotMovementViolation,
    false,
    "no movement occurred while the bot owned an attack slot",
  );
  assert.ok(
    debug.firstShotFacingErrorDegrees !== null
      && debug.firstShotFacingErrorDegrees <= 4,
    `first shot facing error is at most four degrees, received ${
      debug.firstShotFacingErrorDegrees
    }`,
  );

  bot.dispose();
  world.scene.dispose();
  world.engine.dispose();
}

console.log(
  "Bot wall blocking, stationary firing, and facing alignment verification passed.",
);
await moduleLoader.close();
