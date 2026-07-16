import {
  type AbstractMesh,
  FreeCamera,
  Ray,
  Scene,
  Vector3,
} from "@babylonjs/core";
import { GAME_CONFIG } from "./gameConfig";
import {
  calculateDesiredHorizontalVelocity,
  moveHorizontalVelocityToward,
  type MovementInput,
} from "./movementMath";

const WALL_COLLISION_GROUP = 0x1;
const WALKABLE_COLLISION_GROUP = 0x2;
const MINIMUM_WALKABLE_NORMAL_Y = 0.55;
const MAXIMUM_STEP_UP = 0.45;
const MAXIMUM_GROUND_DROP = 6;
const DIRECT_GROUND_SNAP_DISTANCE = 0.35;
const GROUND_DESCENT_SPEED = 14;
const COLLISION_DISTANCE_TOLERANCE = 0.98;
const HARD_BLOCK_RATIO = 0.1;
const SLIDE_ANGLE_DEGREES = 12;
const SPEED_SAMPLE_SECONDS = 2;

export type MovementResult =
  | "CLEAR"
  | "VISIBLE WALL COLLISION"
  | "SLIDING ALONG WALL"
  | "GROUND CONTACT"
  | "GROUND DETECTION FAILURE"
  | "MOVEMENT CODE CANCELLATION"
  | "BOUNDARY CLAMP"
  | "UNKNOWN HARD BLOCK";

export interface MovementSnapshot {
  actualDistance: number;
  actualHeading: number;
  actualMovement: Vector3;
  actualSpeed?: number;
  blockingMesh?: AbstractMesh;
  cancellationMessage?: string;
  collisionNormal?: Vector3;
  collisionPoint?: Vector3;
  deflectionDegrees: number;
  groundMesh?: AbstractMesh;
  groundNormal?: Vector3;
  grounded: boolean;
  playerPosition: Vector3;
  positionBeforeMove: Vector3;
  requestedDistance: number;
  requestedHeading: number;
  requestedMovement: Vector3;
  requestedSpeed: number;
  result: MovementResult;
  speedSampleSeconds: number;
  velocityAfterCollision: Vector3;
  velocityBeforeCollision: Vector3;
}

interface SpeedSample {
  distance: number;
  seconds: number;
}

export class PlayerController {
  private horizontalVelocity = Vector3.Zero();
  private collidedMesh?: AbstractMesh;
  private speedSamples: SpeedSample[] = [];
  private sampledDistance = 0;
  private sampledSeconds = 0;
  private snapshot: MovementSnapshot;

  constructor(
    private readonly scene: Scene,
    private readonly camera: FreeCamera,
    private readonly wallColliders: AbstractMesh[],
    private readonly walkableSurfaces: AbstractMesh[],
  ) {
    const walkableSet = new Set(walkableSurfaces);

    wallColliders.forEach((mesh) => {
      mesh.collisionGroup = walkableSet.has(mesh)
        ? WALKABLE_COLLISION_GROUP
        : WALL_COLLISION_GROUP;
    });
    walkableSurfaces.forEach((mesh) => {
      mesh.collisionGroup = WALKABLE_COLLISION_GROUP;
    });

    camera.collisionMask = WALL_COLLISION_GROUP;
    camera.onCollide = (mesh) => {
      if (mesh.collisionGroup === WALL_COLLISION_GROUP) {
        this.collidedMesh = mesh;
      }
    };

    this.snapshot = this.createIdleSnapshot();
    this.snapToGround(0);
  }

  update(input: MovementInput, deltaSeconds: number) {
    const desiredVelocity = calculateDesiredHorizontalVelocity(
      input,
      this.camera.rotation.y,
      {
        forward: GAME_CONFIG.player.forwardSpeed,
        strafe: GAME_CONFIG.player.strafeSpeed,
        backward: GAME_CONFIG.player.backwardSpeed,
      },
    );
    const hasInput = desiredVelocity.x !== 0 || desiredVelocity.z !== 0;
    const acceleration = hasInput
      ? GAME_CONFIG.player.groundAcceleration
      : GAME_CONFIG.player.groundDeceleration;
    const velocityBeforeCollision = this.horizontalVelocity.clone();
    const nextVelocity = moveHorizontalVelocityToward(
      this.horizontalVelocity,
      desiredVelocity,
      acceleration * deltaSeconds,
    );

    this.horizontalVelocity.set(nextVelocity.x, 0, nextVelocity.z);

    const requestedMovement = this.horizontalVelocity.scale(deltaSeconds);
    const positionBeforeMove = this.camera.position.clone();
    const collisionProbe = this.probeWall(positionBeforeMove, requestedMovement);

    this.collidedMesh = undefined;
    this.camera.cameraDirection.setAll(0);
    this.camera._collideWithWorld(requestedMovement);

    const positionAfterHorizontalCollision = this.camera.position.clone();
    const actualMovement = positionAfterHorizontalCollision.subtract(positionBeforeMove);
    actualMovement.y = 0;

    const blockingMesh = this.collidedMesh ?? collisionProbe?.pickedMesh ?? undefined;
    const requestedDistance = requestedMovement.length();
    const actualDistance = actualMovement.length();
    const collisionReducedMovement = requestedDistance > 0
      && actualDistance < requestedDistance * COLLISION_DISTANCE_TOLERANCE;

    if (blockingMesh && collisionReducedMovement && deltaSeconds > 0) {
      this.horizontalVelocity.set(
        actualMovement.x / deltaSeconds,
        0,
        actualMovement.z / deltaSeconds,
      );
    }

    const ground = this.snapToGround(deltaSeconds);
    const deflectionDegrees = angleBetweenHorizontal(requestedMovement, actualMovement);
    const result = classifyMovement({
      actualDistance,
      blockingMesh,
      deflectionDegrees,
      groundDetected: ground.detected,
      grounded: ground.grounded,
      requestedDistance,
    });

    this.recordSpeed(actualDistance, deltaSeconds);
    this.snapshot = {
      actualDistance,
      actualHeading: headingOf(actualMovement),
      actualMovement,
      actualSpeed: this.sampledSeconds >= SPEED_SAMPLE_SECONDS
        ? this.sampledDistance / this.sampledSeconds
        : undefined,
      blockingMesh,
      cancellationMessage: result === "MOVEMENT CODE CANCELLATION"
        ? "No collision mesh produced this stop."
        : undefined,
      collisionNormal: collisionProbe?.getNormal(true) ?? estimateCollisionNormal(
        this.camera,
        blockingMesh,
        collisionProbe?.pickedPoint ?? undefined,
      ),
      collisionPoint: collisionProbe?.pickedPoint ?? estimateCollisionPoint(this.camera, blockingMesh),
      deflectionDegrees,
      groundMesh: ground.mesh,
      groundNormal: ground.normal,
      grounded: ground.grounded,
      playerPosition: this.camera.position.clone(),
      positionBeforeMove,
      requestedDistance,
      requestedHeading: headingOf(requestedMovement),
      requestedMovement,
      requestedSpeed: deltaSeconds > 0 ? requestedDistance / deltaSeconds : 0,
      result,
      speedSampleSeconds: this.sampledSeconds,
      velocityAfterCollision: this.horizontalVelocity.clone(),
      velocityBeforeCollision,
    };

    return this.snapshot;
  }

  getSnapshot() {
    return this.snapshot;
  }

  reset() {
    this.horizontalVelocity.setAll(0);
    this.speedSamples = [];
    this.sampledDistance = 0;
    this.sampledSeconds = 0;
    this.collidedMesh = undefined;
    this.snapToGround(0);
    this.snapshot = this.createIdleSnapshot();
  }

  private snapToGround(deltaSeconds: number) {
    const rayOrigin = this.camera.position.add(new Vector3(0, MAXIMUM_STEP_UP, 0));
    const rayLength = GAME_CONFIG.player.standingHeight
      + MAXIMUM_STEP_UP
      + MAXIMUM_GROUND_DROP;
    const hits = this.scene.multiPickWithRay(
      new Ray(rayOrigin, Vector3.Down(), rayLength),
      (mesh) => this.walkableSurfaces.includes(mesh),
    ) ?? [];
    const candidates = hits
      .map((hit) => ({
        hit,
        normal: hit.getNormal(true),
      }))
      .filter(({ hit, normal }) => (
        hit.pickedMesh
        && hit.pickedPoint
        && normal
        && normal.y >= MINIMUM_WALKABLE_NORMAL_Y
        && hit.pickedPoint.y <= rayOrigin.y
      ))
      .sort((left, right) => right.hit.pickedPoint!.y - left.hit.pickedPoint!.y);
    const ground = candidates[0];

    if (!ground?.hit.pickedMesh || !ground.hit.pickedPoint || !ground.normal) {
      return {
        detected: false,
        grounded: false,
        mesh: undefined,
        normal: undefined,
      };
    }

    const targetCameraHeight = ground.hit.pickedPoint.y + GAME_CONFIG.player.standingHeight;
    const heightDifference = targetCameraHeight - this.camera.position.y;

    if (heightDifference > MAXIMUM_STEP_UP) {
      return {
        detected: false,
        grounded: false,
        mesh: undefined,
        normal: undefined,
      };
    }

    if (Math.abs(heightDifference) <= DIRECT_GROUND_SNAP_DISTANCE || deltaSeconds === 0) {
      this.camera.position.y = targetCameraHeight;
    } else if (heightDifference < 0) {
      this.camera.position.y = Math.max(
        targetCameraHeight,
        this.camera.position.y - GROUND_DESCENT_SPEED * deltaSeconds,
      );
    }

    return {
      detected: true,
      grounded: Math.abs(this.camera.position.y - targetCameraHeight) < 0.05,
      mesh: ground.hit.pickedMesh,
      normal: ground.normal,
    };
  }

  private probeWall(position: Vector3, requestedMovement: Vector3) {
    if (requestedMovement.lengthSquared() < 0.000001) {
      return undefined;
    }

    const direction = requestedMovement.clone().normalize();
    const colliderCenter = position.subtract(new Vector3(0, this.camera.ellipsoid.y, 0));
    const ray = new Ray(
      colliderCenter,
      direction,
      requestedMovement.length() + this.camera.ellipsoid.x,
    );

    return this.scene.pickWithRay(
      ray,
      (mesh) => mesh.collisionGroup === WALL_COLLISION_GROUP
        && this.wallColliders.includes(mesh),
    );
  }

  private recordSpeed(distance: number, seconds: number) {
    if (seconds <= 0) {
      return;
    }

    this.speedSamples.push({ distance, seconds });
    this.sampledDistance += distance;
    this.sampledSeconds += seconds;

    while (
      this.speedSamples.length > 1
      && this.sampledSeconds - this.speedSamples[0].seconds >= SPEED_SAMPLE_SECONDS
    ) {
      const removed = this.speedSamples.shift()!;
      this.sampledDistance -= removed.distance;
      this.sampledSeconds -= removed.seconds;
    }
  }

  private createIdleSnapshot(): MovementSnapshot {
    const ground = this.snapToGround(0);

    return {
      actualDistance: 0,
      actualHeading: 0,
      actualMovement: Vector3.Zero(),
      actualSpeed: undefined,
      deflectionDegrees: 0,
      groundMesh: ground.mesh,
      groundNormal: ground.normal,
      grounded: ground.grounded,
      playerPosition: this.camera.position.clone(),
      positionBeforeMove: this.camera.position.clone(),
      requestedDistance: 0,
      requestedHeading: 0,
      requestedMovement: Vector3.Zero(),
      requestedSpeed: 0,
      result: ground.detected ? "GROUND CONTACT" : "GROUND DETECTION FAILURE",
      speedSampleSeconds: 0,
      velocityAfterCollision: Vector3.Zero(),
      velocityBeforeCollision: Vector3.Zero(),
    };
  }
}

function classifyMovement(values: {
  actualDistance: number;
  blockingMesh?: AbstractMesh;
  deflectionDegrees: number;
  groundDetected: boolean;
  grounded: boolean;
  requestedDistance: number;
}): MovementResult {
  if (!values.groundDetected) {
    return "GROUND DETECTION FAILURE";
  }

  if (values.requestedDistance < 0.0001) {
    return values.grounded ? "GROUND CONTACT" : "CLEAR";
  }

  if (values.actualDistance < values.requestedDistance * HARD_BLOCK_RATIO) {
    return values.blockingMesh
      ? "VISIBLE WALL COLLISION"
      : "MOVEMENT CODE CANCELLATION";
  }

  if (values.blockingMesh && values.deflectionDegrees >= SLIDE_ANGLE_DEGREES) {
    return "SLIDING ALONG WALL";
  }

  if (values.blockingMesh && values.actualDistance < values.requestedDistance * COLLISION_DISTANCE_TOLERANCE) {
    return "VISIBLE WALL COLLISION";
  }

  return "CLEAR";
}

function angleBetweenHorizontal(left: Vector3, right: Vector3) {
  if (left.lengthSquared() < 0.000001 || right.lengthSquared() < 0.000001) {
    return 0;
  }

  const dot = Vector3.Dot(left.clone().normalize(), right.clone().normalize());
  return Math.acos(Math.max(-1, Math.min(1, dot))) * 180 / Math.PI;
}

function headingOf(vector: Vector3) {
  return vector.lengthSquared() < 0.000001
    ? 0
    : Math.atan2(vector.x, vector.z) * 180 / Math.PI;
}

function estimateCollisionPoint(camera: FreeCamera, mesh?: AbstractMesh) {
  if (!mesh) {
    return undefined;
  }

  const bounds = mesh.getBoundingInfo().boundingBox;
  const colliderCenter = camera.position.subtract(new Vector3(0, camera.ellipsoid.y, 0));
  return Vector3.Clamp(colliderCenter, bounds.minimumWorld, bounds.maximumWorld);
}

function estimateCollisionNormal(
  camera: FreeCamera,
  mesh?: AbstractMesh,
  contactPoint?: Vector3,
) {
  const point = contactPoint ?? estimateCollisionPoint(camera, mesh);

  if (!point) {
    return undefined;
  }

  const colliderCenter = camera.position.subtract(new Vector3(0, camera.ellipsoid.y, 0));
  const normal = colliderCenter.subtract(point);
  return normal.lengthSquared() > 0.00001 ? normal.normalize() : undefined;
}
