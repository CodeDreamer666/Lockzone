import { type AbstractMesh, Vector3 } from "@babylonjs/core";
import type { PushablePropDefinition } from "../map/createMap";

interface PropState extends PushablePropDefinition {
  velocity: Vector3;
}

const PLAYER_PUSH_RADIUS = 0.48;
const LINEAR_DRAG = 5.5;
const MINIMUM_ACTIVE_SPEED = 0.02;

/**
 * Bounded kinematic physics for the handful of lightweight props that need to
 * react to the player and bullets. Structural geometry remains static.
 */
export class PushablePropController {
  private readonly states: PropState[];
  private readonly solidCover: AbstractMesh[];

  constructor(
    definitions: PushablePropDefinition[],
    solidCover: AbstractMesh[],
  ) {
    this.solidCover = solidCover;
    this.states = definitions.map((definition) => ({
      ...definition,
      velocity: Vector3.Zero(),
    }));
  }

  update(
    deltaSeconds: number,
    playerPosition: Vector3,
    playerMovement: Vector3,
    grounded: boolean,
  ) {
    for (const state of this.states) {
      if (grounded) {
        this.applyPlayerPush(state, playerPosition, playerMovement, deltaSeconds);
      }
      this.integrate(state, deltaSeconds);
    }
  }

  hasMesh(mesh: AbstractMesh) {
    return this.states.some((state) => state.mesh === mesh);
  }

  applyBulletImpulse(mesh: AbstractMesh, direction: Vector3) {
    const state = this.states.find((candidate) => candidate.mesh === mesh);
    if (!state) {
      return;
    }

    const horizontalDirection = new Vector3(direction.x, 0, direction.z);
    if (horizontalDirection.lengthSquared() > 0.0001) {
      horizontalDirection.normalize();
      state.velocity.addInPlace(horizontalDirection.scale(3.6 / state.mass));
    }

    if (state.mesh.metadata?.propKind === "cone") {
      state.mesh.rotation.x += (Math.random() - 0.5) * 0.45;
      state.mesh.rotation.z += (Math.random() - 0.5) * 0.45;
    }
  }

  reset() {
    this.states.forEach((state) => state.velocity.setAll(0));
  }

  private applyPlayerPush(
    state: PropState,
    playerPosition: Vector3,
    playerMovement: Vector3,
    deltaSeconds: number,
  ) {
    if (deltaSeconds <= 0 || playerMovement.lengthSquared() < 0.000001) {
      return;
    }

    const offset = state.mesh.position.subtract(playerPosition);
    offset.y = 0;
    const contactDistance = state.radius + PLAYER_PUSH_RADIUS;
    if (offset.lengthSquared() > contactDistance * contactDistance) {
      return;
    }

    const movementDirection = playerMovement.clone();
    movementDirection.y = 0;
    const playerSpeed = movementDirection.length() / deltaSeconds;
    movementDirection.normalize();
    if (offset.lengthSquared() > 0.0001 && Vector3.Dot(movementDirection, offset.normalize()) <= 0) {
      return;
    }

    state.velocity.addInPlace(movementDirection.scale(playerSpeed * 0.42 / state.mass));
  }

  private integrate(state: PropState, deltaSeconds: number) {
    if (state.velocity.lengthSquared() < MINIMUM_ACTIVE_SPEED * MINIMUM_ACTIVE_SPEED) {
      state.velocity.setAll(0);
      return;
    }

    const previousPosition = state.mesh.position.clone();
    const displacement = state.velocity.scale(deltaSeconds);
    state.mesh.position.addInPlace(displacement);
    state.mesh.position.y = state.halfHeight;
    state.mesh.computeWorldMatrix(true);

    const blocked = this.solidCover.some((cover) => (
      cover !== state.mesh
      && cover.intersectsMesh(state.mesh, false)
    ));
    if (blocked) {
      state.mesh.position.copyFrom(previousPosition);
      state.velocity.scaleInPlace(-0.18);
    } else {
      state.mesh.rotation.z += displacement.x / Math.max(0.2, state.radius);
      state.mesh.rotation.x -= displacement.z / Math.max(0.2, state.radius);
    }

    state.velocity.scaleInPlace(Math.exp(-LINEAR_DRAG * deltaSeconds));
  }
}
