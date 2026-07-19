import {
  AbstractMesh,
  Mesh,
  MeshBuilder,
  Ray,
  Scene,
  TransformNode,
  Vector3,
} from "@babylonjs/core";
import { Weapon } from "../combat/Weapon";
import {
  GAME_CONFIG,
  type WaveConfig,
} from "../game/gameConfig";
import { BotVisual } from "./BotVisual";

export type BotState =
  | "searching"
  | "pressuring"
  | "flanking"
  | "retreating"
  | "dead";
export type BotRole = "pressure" | "hold" | "flank";

export interface BotUpdateContext {
  now: number;
  dt: number;
  playerPosition: Vector3;
  playerTarget: Mesh;
  cover: AbstractMesh[];
  patrolPoints: Vector3[];
  teammates: BotController[];
  lastGunshot?: { position: Vector3; time: number };
  onShot: (bot: BotController) => void;
  onHitPlayer: (damageMultiplier: number) => void;
}

export class BotController {
  readonly mesh: Mesh;
  readonly weapon = new Weapon();
  private readonly visual: BotVisual;
  readonly role: BotRole;
  readonly reactionDelay: number;
  readonly accuracy: number;
  readonly preferredDistance: number;
  readonly burstSeconds: number;
  health: number = GAME_CONFIG.player.health;
  state: BotState = "searching";
  isAlive = true;
  private lastDamagedAt = -Infinity;
  private lastSeen?: Vector3;
  private lastHeard?: Vector3;
  private nextPerceptionAt: number;
  private nextDecisionAt: number;
  private reactionReadyAt = Infinity;
  private burstUntil = 0;
  private nextBurstAt = 0;
  private canSeePlayer = false;
  private facingYaw = 0;
  private navigationTarget?: Vector3;
  private avoidanceTarget?: Vector3;
  private blockedMoves = 0;
  private movedThisFrame = false;
  private sightStatus = "not checked";

  constructor(
    scene: Scene,
    spawn: Vector3,
    readonly id: number,
    private readonly difficulty: WaveConfig,
    model: TransformNode,
  ) {
    this.mesh = MeshBuilder.CreateCapsule(
      `bot ${id} collision`,
      { height: 2.6, radius: 0.42 },
      scene,
    );
    this.mesh.position.copyFrom(spawn);
    this.mesh.visibility = 0.001;
    this.mesh.isPickable = true;
    this.mesh.checkCollisions = true;
    this.mesh.ellipsoid = new Vector3(0.38, 1.2, 0.38);
    this.mesh.ellipsoidOffset = Vector3.Zero();
    this.mesh.metadata = { enemy: true, botId: id };
    this.visual = new BotVisual(scene, id, model, this.mesh);
    this.role = id % 3 === 0 ? "flank" : id % 3 === 1 ? "pressure" : "hold";
    this.reactionDelay = (
      GAME_CONFIG.bot.reactionSeconds
      + (id % 4) * 0.1
    ) * difficulty.reactionMultiplier;
    this.accuracy = Math.min(
      0.82,
      (GAME_CONFIG.bot.accuracy - 0.08 + (id % 5) * 0.035)
        * difficulty.accuracyMultiplier,
    );
    this.preferredDistance = (
      10
      + (id % 4) * 2.5
    ) / difficulty.aggressionMultiplier;
    this.burstSeconds = 0.26 + (id % 3) * 0.13;
    this.nextPerceptionAt = (id % 10) * 28;
    this.nextDecisionAt = (id % 10) * 67;
  }

  get isReady() {
    return this.isAlive && !this.mesh.isDisposed();
  }

  get debugSummary() {
    const position = this.mesh.position;
    return [
      `#${this.id}`,
      this.state,
      this.canSeePlayer ? "sees player" : this.sightStatus,
      this.movedThisFrame ? "moving" : "still",
      `(${position.x.toFixed(1)}, ${position.y.toFixed(1)}, ${position.z.toFixed(1)})`,
    ].join(" · ");
  }

  takeDamage(amount: number, now: number) {
    if (!this.isAlive) return false;
    this.health = Math.max(0, this.health - amount);
    this.lastDamagedAt = now;
    if (this.health > 0) return false;
    this.isAlive = false;
    this.state = "dead";
    this.weapon.dispose();
    this.visual.hideMuzzleFlash();
    this.mesh.rotation.z = Math.PI / 2;
    return true;
  }

  update(context: BotUpdateContext) {
    if (!this.isReady) return;
    this.regenerate(context.now, context.dt);
    if (context.now >= this.nextPerceptionAt) this.updatePerception(context);
    if (context.now >= this.nextDecisionAt) this.chooseState(context);
    this.move(context);
    this.tryShoot(context);
    this.syncVisual(context.now);
  }

  dispose() {
    this.weapon.dispose();
    this.visual.dispose();
    this.mesh.dispose();
  }

  private updatePerception(context: BotUpdateContext) {
    this.nextPerceptionAt = context.now
      + GAME_CONFIG.bot.perceptionSeconds
        * this.difficulty.perceptionMultiplier
        * 1000
      + (this.id % 7) * 5;
    const visible = this.hasLineOfSight(
      context.playerPosition,
      context.playerTarget,
      context.cover,
    );
    if (visible && !this.canSeePlayer) {
      this.reactionReadyAt = context.now + this.reactionDelay * 1000;
    }
    this.canSeePlayer = visible;
    if (visible) {
      this.lastSeen = context.playerPosition.clone();
      const toPlayer = context.playerPosition.subtract(this.mesh.position);
      toPlayer.y = 0;
      if (toPlayer.lengthSquared() > 0.0001) {
        this.facingYaw = Math.atan2(toPlayer.x, toPlayer.z);
      }
    }
    if (
      !visible
      && context.lastGunshot
      && context.now - context.lastGunshot.time < 1400
      && Vector3.Distance(
        this.mesh.position,
        context.lastGunshot.position,
      ) < 28
    ) {
      this.lastHeard = context.lastGunshot.position.clone();
    }
  }

  private chooseState(context: BotUpdateContext) {
    this.nextDecisionAt = context.now
      + GAME_CONFIG.bot.decisionSeconds
        * this.difficulty.decisionMultiplier
        * 1000
      + (this.id % 7) * 11;
    if (this.health <= 35) {
      this.state = "retreating";
      return;
    }
    if (this.canSeePlayer) {
      this.state = this.role === "flank" ? "flanking" : "pressuring";
      return;
    }
    this.state = "searching";
  }

  private move(context: BotUpdateContext) {
    const target = this.getTarget(context);
    const direction = target.subtract(this.mesh.position);
    this.movedThisFrame = false;
    const playerDistance = Vector3.Distance(
      this.mesh.position,
      context.playerPosition,
    );
    const minimumCombatDistance = Math.max(
      6,
      this.preferredDistance * 0.75,
    );
    if (playerDistance < minimumCombatDistance) {
      direction.copyFrom(this.mesh.position.subtract(context.playerPosition));
      direction.y = 0;
      if (direction.lengthSquared() < 0.0001) {
        direction.set(1, 0, 0);
      }
    }
    const verticalDifference = direction.y;
    direction.y = 0;
    if (direction.length() < 0.8) {
      if (
        this.avoidanceTarget
        && Vector3.DistanceSquared(
          this.mesh.position,
          this.avoidanceTarget,
        ) < 1
      ) {
        this.avoidanceTarget = undefined;
      }
      this.navigationTarget = undefined;
      return;
    }
    direction.normalize();
    this.applySpacing(direction, context.teammates);
    direction.normalize();
    const baseSpeed = this.state === "retreating"
      ? 4.1
      : GAME_CONFIG.player.forwardSpeed;
    const moveSpeed = baseSpeed * this.difficulty.movementMultiplier;
    const next = this.mesh.position.add(direction.scale(moveSpeed * context.dt));
    if (Math.abs(verticalDifference) < 2.5) {
      next.y += Math.sign(verticalDifference)
        * Math.min(Math.abs(verticalDifference), moveSpeed * context.dt * 0.5);
    }
    const previous = this.mesh.position.clone();
    const requestedMovement = next.subtract(previous);
    this.mesh.moveWithCollisions(requestedMovement);
    const actualMovementSquared = Vector3.DistanceSquared(
      previous,
      this.mesh.position,
    );
    const substantiallyBlocked = (
      actualMovementSquared
      < requestedMovement.lengthSquared() * 0.04
    );
    if (substantiallyBlocked) {
      this.blockedMoves += 1;
      if (this.blockedMoves >= 3) {
        const side = (this.id + this.blockedMoves) % 2 === 0 ? 1 : -1;
        this.avoidanceTarget = this.mesh.position.add(
          new Vector3(-direction.z * side, 0, direction.x * side).scale(8),
        );
        this.blockedMoves = 0;
      }
    } else {
      this.blockedMoves = 0;
      this.movedThisFrame = actualMovementSquared > 0.000001;
    }
    const lookDirection = (
      playerDistance <= GAME_CONFIG.bot.detectionRange
        ? context.playerPosition.subtract(this.mesh.position)
        : direction
    );
    lookDirection.y = 0;
    if (lookDirection.lengthSquared() > 0.0001) {
      this.facingYaw = Math.atan2(lookDirection.x, lookDirection.z);
    }
  }

  private getTarget(context: BotUpdateContext) {
    if (this.avoidanceTarget) {
      if (
        Vector3.DistanceSquared(
          this.mesh.position,
          this.avoidanceTarget,
        ) > 1
      ) {
        return this.avoidanceTarget;
      }
      this.avoidanceTarget = undefined;
    }
    if (this.state === "retreating") {
      return this.mesh.position
        .subtract(context.playerPosition)
        .normalize()
        .scale(this.preferredDistance)
        .add(this.mesh.position);
    }
    if (this.canSeePlayer && this.state === "pressuring") {
      const distance = Vector3.Distance(
        this.mesh.position,
        context.playerPosition,
      );
      if (distance > this.preferredDistance) return context.playerPosition;
      return this.mesh.position
        .subtract(context.playerPosition)
        .normalize()
        .scale(3)
        .add(this.mesh.position);
    }
    if (this.state === "flanking") {
      if (!this.navigationTarget) {
        this.navigationTarget = this.choosePatrolPoint(
          context.patrolPoints,
          context.now,
        );
      }
      return this.navigationTarget;
    }
    if (!this.navigationTarget) {
      this.navigationTarget = this.choosePatrolPoint(
        context.patrolPoints,
        context.now,
      );
    }
    if (this.lastSeen || this.lastHeard || this.role !== "hold") {
      return this.lastSeen ?? this.lastHeard ?? context.playerPosition;
    }
    return this.navigationTarget;
  }

  private choosePatrolPoint(points: Vector3[], now: number) {
    const elevated = this.mesh.position.y > 4;
    const sameLevelPoints = points.filter((point) => {
      if (Math.abs(point.y - this.mesh.position.y) >= 2.5) return false;
      if (!elevated) return true;
      const horizontalOffset = point.subtract(this.mesh.position);
      horizontalOffset.y = 0;
      return horizontalOffset.length() <= 10;
    });
    const candidates = sameLevelPoints.length > 0 ? sameLevelPoints : points;
    return candidates[
      (this.id + Math.floor(now / 3500)) % candidates.length
    ].clone();
  }

  private applySpacing(direction: Vector3, teammates: BotController[]) {
    for (const teammate of teammates) {
      if (teammate === this || !teammate.isAlive) continue;
      const offset = this.mesh.position.subtract(teammate.mesh.position);
      const distance = offset.length();
      if (distance > 0.01 && distance < GAME_CONFIG.bot.personalSpace) {
        direction.addInPlace(
          offset
            .normalize()
            .scale((GAME_CONFIG.bot.personalSpace - distance) * 0.9),
        );
      }
    }
  }

  private tryShoot(context: BotUpdateContext) {
    if (!this.canSeePlayer || context.now < this.reactionReadyAt) return;
    if (
      !this.hasLineOfSight(
        context.playerPosition,
        context.playerTarget,
        context.cover,
      )
    ) {
      this.canSeePlayer = false;
      return;
    }
    const distance = Vector3.Distance(
      this.mesh.position,
      context.playerPosition,
    );
    if (context.now >= this.nextBurstAt) {
      const duration = distance > 20
        ? this.burstSeconds * 0.55
        : this.burstSeconds;
      this.burstUntil = context.now + duration * 1000;
      const recovery = 260 + (this.id % 4) * 85;
      this.nextBurstAt = this.burstUntil
        + recovery / this.difficulty.aggressionMultiplier;
    }
    if (context.now > this.burstUntil) return;
    if (this.weapon.magazine === 0) {
      this.weapon.reload(() => undefined);
    }
    if (!this.weapon.canFire(context.now)) return;
    this.weapon.fire(context.now);
    context.onShot(this);
    this.visual.showMuzzleFlash(context.now);
    const movementPenalty = this.state === "pressuring" ? 0.82 : 1;
    const hitChance = this.accuracy
      * movementPenalty
      * Math.max(0.28, 1 - distance / 48);
    if (Math.random() < hitChance) {
      context.onHitPlayer(this.difficulty.damageMultiplier);
    }
  }

  private hasLineOfSight(
    player: Vector3,
    playerTarget: Mesh,
    cover: AbstractMesh[],
  ) {
    const eye = this.mesh.position.add(new Vector3(0, 1.35, 0));
    const targetPosition = playerTarget.getAbsolutePosition();
    const direction = targetPosition.subtract(eye);
    const distance = direction.length();
    const detectionRange = GAME_CONFIG.bot.detectionRange
      * Math.max(1, this.difficulty.aggressionMultiplier * 0.9);
    if (distance > detectionRange) {
      this.sightStatus = `out of range ${distance.toFixed(1)}`;
      return false;
    }
    const forward = new Vector3(
      Math.sin(this.facingYaw),
      0,
      Math.cos(this.facingYaw),
    );
    const viewAlignment = Vector3.Dot(forward, direction.normalize());
    if (viewAlignment < Math.cos(GAME_CONFIG.bot.fieldOfViewRadians / 2)) {
      this.sightStatus = `outside view ${viewAlignment.toFixed(2)}`;
      return false;
    }
    const ray = new Ray(eye, direction, distance);
    const hit = this.mesh.getScene().pickWithRay(
      ray,
      (mesh) => (
        mesh === playerTarget
        || cover.some((wall) => wall === mesh)
      ),
    );
    const seesPlayer = hit?.pickedMesh === playerTarget;
    this.sightStatus = seesPlayer
      ? "sees player"
      : `blocked by ${hit?.pickedMesh?.name ?? "nothing"}`;
    return seesPlayer;
  }

  private regenerate(now: number, dt: number) {
    if (
      now - this.lastDamagedAt < GAME_CONFIG.regeneration.delayMs
      || this.health >= GAME_CONFIG.player.health
    ) {
      return;
    }
    this.health = Math.min(
      GAME_CONFIG.player.health,
      this.health + GAME_CONFIG.regeneration.healthPerSecond * dt,
    );
  }

  private syncVisual(now: number) {
    this.mesh.rotation.y = this.facingYaw;
    this.visual.update(now);
  }
}
