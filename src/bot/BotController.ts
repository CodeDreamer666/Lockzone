import {
  AbstractMesh,
  Mesh,
  MeshBuilder,
  Ray,
  Scene,
  Vector3,
} from "@babylonjs/core";
import { Weapon } from "../combat/Weapon";
import {
  GAME_CONFIG,
  createEnemyArchetype,
  enemyDamageAtDistance,
  type EnemyArchetype,
  type EnemyType,
  type WaveConfig,
} from "../game/gameConfig";
import {
  isInsideSafeZone,
  movementEntersSafeZone,
  segmentIntersectsSafeZone,
} from "../map/safeZones";
import type { NavigationNodeDefinition } from "../map/mapLayout";
import { BotVisual } from "./BotVisual";
import { findNavigationPath } from "./navigationGraph";

export type BotState =
  | "search"
  | "detect"
  | "react"
  | "aim"
  | "attack"
  | "cooldown"
  | "reposition"
  | "reload"
  | "dead";
export type BotRole = "pressure" | "cover";

export interface BotUpdateContext {
  now: number;
  dt: number;
  playerPosition: Vector3;
  playerTarget: Mesh;
  playerSpeed: number;
  playerMaximumHealth: number;
  canShoot: boolean;
  cover: AbstractMesh[];
  ground: AbstractMesh[];
  patrolPoints: Vector3[];
  navigationNodes: readonly NavigationNodeDefinition[];
  teammates: BotController[];
  lastGunshot?: { position: Vector3; time: number };
  onShot: (
    bot: BotController,
    origin: Vector3,
    direction: Vector3,
  ) => void;
  onWarning: (bot: BotController) => void;
  onHitPlayer: (damage: number) => void;
  onFootstep: (position: Vector3) => void;
}

const BODY_TURN_SPEED = 3.2;
const ATTACK_TURN_SPEED = 5.4;
const FIRE_ALIGNMENT_RADIANS = 4 * Math.PI / 180;
const GROUND_PROBE_HEIGHT = 1.2;
const GROUND_PROBE_DISTANCE = 4.5;

export class BotController {
  readonly mesh: Mesh;
  readonly bodyHitbox: Mesh;
  readonly headHitbox: Mesh;
  readonly weapon = new Weapon();
  readonly role: BotRole;
  readonly reactionDelay: number;
  readonly accuracy: number;
  readonly preferredDistance: number;
  readonly maximumHealth: number;
  readonly enemyType: EnemyType;
  health: number;
  state: BotState = "search";
  isAlive = true;
  private readonly visual: BotVisual;
  private readonly archetype: EnemyArchetype;
  private lastSeen?: Vector3;
  private lastHeard?: Vector3;
  private searchUntil = 0;
  private nextFireAt = 0;
  private warningStartedAt?: number;
  private warningReadyAt = Infinity;
  private nextPerceptionAt: number;
  private reactionReadyAt = Infinity;
  private reactionStartedAt?: number;
  private firstShotAt?: number;
  private firstShotDistance?: number;
  private warningCount = 0;
  private canSeePlayer = false;
  private ownsAttackSlot = false;
  private lastPlayerDistance = Infinity;
  private fireBlockReason = "searching";
  private shotsAttempted = 0;
  private successfulHits = 0;
  private facingYaw = 0;
  private desiredFacingYaw = 0;
  private navigationTarget?: Vector3;
  private avoidanceTarget?: Vector3;
  private nextTacticalMoveAt = 0;
  private blockedMoves = 0;
  private movedThisFrame = false;
  private attackSlotMovementViolation = false;
  private facingErrorRadians = Math.PI;
  private firstShotFacingErrorRadians?: number;
  private grounded = false;
  private verticalVelocity = 0;
  private footstepDistance = 0;
  private sightStatus = "not checked";
  private navigationRoute: Vector3[] = [];
  private routeDestination?: Vector3;
  private nextRoutePlanAt = 0;
  private lastProgressAt = 0;
  private lastProgressPosition: Vector3;
  private readonly groundOffset: number;

  constructor(
    scene: Scene,
    spawn: Vector3,
    readonly id: number,
    private readonly difficulty: WaveConfig,
    enemyType: EnemyType,
  ) {
    this.archetype = createEnemyArchetype(enemyType);
    this.enemyType = enemyType;
    this.maximumHealth = this.archetype.health;
    this.health = this.maximumHealth;
    this.groundOffset = this.archetype.collision.height / 2;
    this.mesh = MeshBuilder.CreateCapsule(
      `bot ${id} collision`,
      {
        height: this.archetype.collision.height,
        radius: this.archetype.collision.radius,
      },
      scene,
    );
    this.mesh.position.copyFrom(spawn);
    this.mesh.position.y += this.groundOffset;
    this.mesh.visibility = 0.001;
    this.mesh.isPickable = false;
    this.mesh.checkCollisions = true;
    this.mesh.ellipsoid = new Vector3(0.38, 1.2, 0.38);
    this.mesh.ellipsoidOffset = Vector3.Zero();
    this.mesh.metadata = {
      enemy: true,
      botId: id,
      enemyType: this.enemyType,
    };
    this.bodyHitbox = MeshBuilder.CreateCapsule(
      `bot ${id} body hitbox`,
      {
        height: this.archetype.collision.height * 0.72,
        radius: this.archetype.collision.radius,
      },
      scene,
    );
    this.bodyHitbox.parent = this.mesh;
    this.bodyHitbox.position.set(
      0,
      -this.archetype.collision.height * 0.12,
      0,
    );
    this.bodyHitbox.visibility = 0.001;
    this.bodyHitbox.isPickable = true;
    this.bodyHitbox.metadata = {
      enemy: true,
      botId: id,
      enemyType: this.enemyType,
      hitZone: "body",
    };
    this.headHitbox = MeshBuilder.CreateSphere(
      `bot ${id} head hitbox`,
      {
        diameter: this.archetype.collision.radius * 1.4,
        segments: 12,
      },
      scene,
    );
    this.headHitbox.parent = this.mesh;
    this.headHitbox.position.set(
      0,
      this.archetype.collision.height * 0.32,
      0,
    );
    this.headHitbox.visibility = 0.001;
    this.headHitbox.isPickable = true;
    this.headHitbox.metadata = {
      enemy: true,
      botId: id,
      enemyType: this.enemyType,
      hitZone: "head",
    };
    this.visual = new BotVisual(
      scene,
      id,
      this.mesh,
      this.enemyType,
    );
    this.role = (
      this.enemyType === "boss"
      || this.enemyType === "shotgun"
      || id % 2 === 0
    )
      ? "pressure"
      : "cover";
    this.reactionDelay = this.archetype.reactionSeconds;
    this.accuracy = this.archetype.accuracy;
    this.preferredDistance = this.archetype.preferredDistance;
    this.nextPerceptionAt = (id % 10) * 28;
    this.facingYaw = (id % 8) * Math.PI / 4;
    this.desiredFacingYaw = this.facingYaw;
    this.weapon.configure(
      this.archetype.weapon.magazineSize,
      this.archetype.weapon.reloadMs,
    );
    this.lastProgressPosition = this.mesh.position.clone();
  }

  get isReady() {
    return this.isAlive && !this.mesh.isDisposed();
  }

  get locationLabel() {
    return this.archetype.displayName;
  }

  get debugSummary() {
    const position = this.mesh.position;
    return [
      `#${this.id}`,
      this.archetype.displayName.toUpperCase(),
      this.state.toUpperCase(),
      this.canSeePlayer ? "sees player" : this.sightStatus,
      this.ownsAttackSlot ? "attack slot" : "no slot",
      this.fireBlockReason,
      `${this.shotsAttempted} shots / ${this.successfulHits} hits`,
      this.grounded ? "grounded" : "airborne",
      this.movedThisFrame ? "moving" : "still",
      `${Math.ceil(this.health)}/${this.maximumHealth} HP`,
      `(${position.x.toFixed(1)}, ${position.y.toFixed(1)}, ${position.z.toFixed(1)})`,
    ].join(" · ");
  }

  get combatDebugSnapshot() {
    return {
      id: this.id,
      enemyType: this.enemyType,
      state: this.state,
      seesPlayer: this.canSeePlayer,
      ownsAttackSlot: this.ownsAttackSlot,
      cannotFireBecause: this.fireBlockReason,
      distance: this.lastPlayerDistance,
      reactionStartedAt: this.reactionStartedAt ?? null,
      reactionReadyAt: Number.isFinite(this.reactionReadyAt)
        ? this.reactionReadyAt
        : null,
      firstShotAt: this.firstShotAt ?? null,
      firstShotDistance: this.firstShotDistance ?? null,
      firstShotFacingErrorDegrees: (
        this.firstShotFacingErrorRadians === undefined
          ? null
          : this.firstShotFacingErrorRadians * 180 / Math.PI
      ),
      facingErrorDegrees: this.facingErrorRadians * 180 / Math.PI,
      moving: this.movedThisFrame,
      attackSlotMovementViolation: this.attackSlotMovementViolation,
      warningCount: this.warningCount,
      shotsAttempted: this.shotsAttempted,
      successfulHits: this.successfulHits,
      position: {
        x: this.mesh.position.x,
        y: this.mesh.position.y,
        z: this.mesh.position.z,
      },
    };
  }

  wantsAttackSlot(now: number) {
    const weapon = this.archetype.weapon;
    return (
      this.isReady
      && (
        this.state === "aim"
        || this.state === "attack"
        || this.state === "reposition"
      )
      && this.canSeePlayer
      && now >= this.reactionReadyAt
      && now >= this.nextFireAt
      && this.lastPlayerDistance >= weapon.minimumRange
      && this.lastPlayerDistance <= weapon.range
      && !this.weapon.isReloading
      && (
        weapon.kind === "melee"
        || this.weapon.magazine > 0
      )
    );
  }

  adjustIncomingPlayerDamage(damage: number) {
    return damage;
  }

  takeDamage(
    amount: number,
    now: number,
    impactDirection = Vector3.Zero(),
    oneShotNormal = false,
  ) {
    if (!this.isAlive) return false;
    this.health = oneShotNormal && this.enemyType === "normal"
      ? 0
      : Math.max(0, this.health - Math.max(0, amount));
    this.visual.reactToHit(now, impactDirection);
    if (this.health > 0) return false;
    this.isAlive = false;
    this.state = "dead";
    this.ownsAttackSlot = false;
    this.fireBlockReason = "dead";
    this.weapon.dispose();
    this.visual.hideMuzzleFlash();
    this.visual.hideWarning();
    this.bodyHitbox.setEnabled(false);
    this.headHitbox.setEnabled(false);
    this.mesh.checkCollisions = false;
    this.visual.beginDeath(now, impactDirection);
    return true;
  }

  prepareCombat(context: BotUpdateContext) {
    if (!this.isReady) return;
    this.lastPlayerDistance = Vector3.Distance(
      this.mesh.position,
      context.playerPosition,
    );
    if (context.now >= this.nextPerceptionAt) {
      this.updatePerception(context);
    }
    this.chooseState(context);
  }

  update(context: BotUpdateContext) {
    if (this.mesh.isDisposed()) return;
    if (!this.isAlive) {
      this.visual.update(context.now, {
        aiming: false,
        moving: false,
        target: undefined,
      });
      return;
    }
    this.ownsAttackSlot = context.canShoot;
    this.updateCombatState(context);
    this.move(context);
    if (this.ownsAttackSlot && this.movedThisFrame) {
      this.attackSlotMovementViolation = true;
    }
    if (
      this.state === "detect"
      || this.state === "react"
      || this.state === "aim"
      || this.state === "attack"
    ) {
      this.facePosition(context.playerPosition);
    }
    this.turn(context.dt);
    this.facingErrorRadians = this.getFacingError(
      context.playerPosition,
    );
    this.syncVisual(context.now, context.playerPosition);
    this.tryShoot(context);
  }

  dispose() {
    this.weapon.dispose();
    this.visual.dispose();
    this.mesh.dispose();
  }

  private updatePerception(context: BotUpdateContext) {
    this.nextPerceptionAt = (
      context.now
      + GAME_CONFIG.bot.perceptionSeconds
        * this.difficulty.perceptionMultiplier
        * 1000
      + (this.id % 7) * 5
    );
    const visible = (
      !isInsideSafeZone(context.playerPosition)
      && !segmentIntersectsSafeZone(
        this.mesh.position,
        context.playerPosition,
      )
      && this.hasVisualContact(context.playerTarget, context)
    );
    if (visible) {
      if (!Number.isFinite(this.reactionReadyAt)) {
        this.reactionStartedAt = context.now;
        this.reactionReadyAt = (
          context.now + this.reactionDelay * 1000
        );
      }
      this.lastSeen = context.playerPosition.clone();
      this.searchUntil = (
        context.now
        + this.difficulty.searchSeconds * 1000
      );
    }
    this.canSeePlayer = visible;
    if (
      !visible
      && context.lastGunshot
      && context.now - context.lastGunshot.time < 1_400
      && Vector3.Distance(
        this.mesh.position,
        context.lastGunshot.position,
      ) < 28
    ) {
      this.lastHeard = context.lastGunshot.position.clone();
      this.searchUntil = Math.max(
        this.searchUntil,
        context.now + 3_200,
      );
    }
  }

  private chooseState(context: BotUpdateContext) {
    const previousState = this.state;
    if (this.canSeePlayer) {
      this.state = this.reactionStartedAt === context.now
        ? "detect"
        : context.now < this.reactionReadyAt
          ? "react"
          : "aim";
      return;
    }
    if (this.lastSeen && context.now < this.searchUntil) {
      this.state = Vector3.DistanceSquared(
        this.mesh.position,
        this.lastSeen,
      ) > 4
        ? "reposition"
        : "search";
      if (this.state === "search" && previousState !== "search") {
        this.navigationTarget = undefined;
      }
      return;
    }
    if (this.lastHeard && context.now < this.searchUntil) {
      this.state = "reposition";
      return;
    }
    this.lastSeen = undefined;
    this.lastHeard = undefined;
    this.reactionStartedAt = undefined;
    this.firstShotAt = undefined;
    this.firstShotDistance = undefined;
    this.reactionReadyAt = Infinity;
    this.cancelAttackWarning();
    this.state = "search";
  }

  private updateCombatState(context: BotUpdateContext) {
    if (!this.canSeePlayer || context.now < this.reactionReadyAt) {
      this.ownsAttackSlot = false;
      return;
    }
    if (this.weapon.isReloading) {
      this.state = "reload";
      this.ownsAttackSlot = false;
      return;
    }
    if (context.now < this.nextFireAt) {
      this.state = "cooldown";
      this.ownsAttackSlot = false;
      return;
    }
    const weapon = this.archetype.weapon;
    const inWeaponRange = (
      this.lastPlayerDistance >= weapon.minimumRange
      && this.lastPlayerDistance <= weapon.range
    );
    if (!inWeaponRange || !context.canShoot) {
      this.state = "reposition";
      this.ownsAttackSlot = false;
      this.cancelAttackWarning();
      return;
    }
    this.state = this.warningStartedAt === undefined
      ? "aim"
      : "attack";
  }

  private move(context: BotUpdateContext) {
    if (
      this.ownsAttackSlot
      && (
        this.state === "aim"
        || this.state === "attack"
      )
    ) {
      this.movedThisFrame = false;
      this.navigationTarget = undefined;
      this.facePosition(context.playerPosition);
      this.applyGravityAndGround(context);
      return;
    }
    const strategicTarget = this.getTarget(context);
    const target = this.getNavigationTarget(
      strategicTarget,
      context,
    );
    const direction = target.subtract(this.mesh.position);
    direction.y = 0;
    this.movedThisFrame = false;
    const horizontalPlayerDistance = Math.hypot(
      context.playerPosition.x - this.mesh.position.x,
      context.playerPosition.z - this.mesh.position.z,
    );
    if (direction.length() < 0.8) {
      this.navigationTarget = undefined;
      this.applyGravityAndGround(context);
      if (this.state === "search") {
        this.chooseSearchFacing(context.now);
      } else if (this.canSeePlayer) {
        this.facePosition(context.playerPosition);
        this.nextTacticalMoveAt = 0;
      }
      return;
    }
    direction.normalize();
    this.applySpacing(direction, context.teammates);
    if (direction.lengthSquared() < 0.0001) {
      this.applyGravityAndGround(context);
      return;
    }
    direction.normalize();
    const targetYaw = Math.atan2(direction.x, direction.z);
    this.desiredFacingYaw = targetYaw;
    const turnDifference = Math.abs(
      shortestAngle(this.facingYaw, targetYaw),
    );
    const turnSpeedScale = Math.max(
      0.35,
      1 - turnDifference / Math.PI,
    );
    const baseSpeed = (
      GAME_CONFIG.player.forwardSpeed
      * 0.82
      * this.archetype.movementMultiplier
    );
    const requestedMovement = direction.scale(
      baseSpeed * turnSpeedScale * context.dt,
    );
    const previous = this.mesh.position.clone();
    const requestedPosition = previous.add(requestedMovement);
    if (movementEntersSafeZone(previous, requestedPosition)) {
      const side = (this.id + this.blockedMoves) % 2 === 0 ? 1 : -1;
      this.avoidanceTarget = this.mesh.position.add(
        new Vector3(
          -direction.z * side,
          0,
          direction.x * side,
        ).scale(6),
      );
      this.blockedMoves += 1;
      this.applyGravityAndGround(context);
      return;
    }
    this.mesh.moveWithCollisions(
      new Vector3(requestedMovement.x, 0, requestedMovement.z),
    );
    const actualHorizontal = Math.hypot(
      this.mesh.position.x - previous.x,
      this.mesh.position.z - previous.z,
    );
    if (actualHorizontal < requestedMovement.length() * 0.08) {
      this.blockedMoves += 1;
      if (this.blockedMoves >= 3) {
        const side = (
          (this.id + this.blockedMoves) % 2 === 0
            ? 1
            : -1
        );
        this.avoidanceTarget = this.mesh.position.add(
          new Vector3(
            -direction.z * side,
            0,
            direction.x * side,
          ).scale(6),
        );
        this.navigationRoute = [];
        this.nextRoutePlanAt = 0;
        this.blockedMoves = 0;
      }
    } else {
      this.blockedMoves = 0;
      this.movedThisFrame = actualHorizontal > 0.0005;
      if (
        Vector3.DistanceSquared(
          this.mesh.position,
          this.lastProgressPosition,
        ) > 0.64
      ) {
        this.lastProgressPosition.copyFrom(this.mesh.position);
        this.lastProgressAt = context.now;
      } else if (
        this.lastProgressAt > 0
        && context.now - this.lastProgressAt > 1_500
      ) {
        this.navigationRoute = [];
        this.nextRoutePlanAt = 0;
        const side = this.id % 2 === 0 ? 1 : -1;
        this.avoidanceTarget = this.mesh.position.add(
          new Vector3(-direction.z * side, 0, direction.x * side)
            .scale(4.5),
        );
        this.lastProgressAt = context.now;
      }
      this.footstepDistance += actualHorizontal;
      if (this.grounded && this.footstepDistance >= 2.35) {
        this.footstepDistance %= 2.35;
        context.onFootstep(this.mesh.position);
      }
    }
    this.applyGravityAndGround(context);
  }

  private getTarget(context: BotUpdateContext) {
    if (
      this.avoidanceTarget
      && Vector3.DistanceSquared(
        this.mesh.position,
        this.avoidanceTarget,
      ) > 1
    ) {
      return this.avoidanceTarget;
    }
    this.avoidanceTarget = undefined;
    if (this.canSeePlayer) {
      const playerDistance = horizontalDistance(
        this.mesh.position,
        context.playerPosition,
      );
      if (
        this.enemyType === "boss"
        || this.enemyType === "shotgun"
      ) {
        if (playerDistance > this.preferredDistance) {
          return context.playerPosition;
        }
        if (!context.canShoot) {
          const side = this.id % 2 === 0 ? 1 : -1;
          const fromPlayer = this.mesh.position.subtract(
            context.playerPosition,
          );
          fromPlayer.y = 0;
          if (fromPlayer.lengthSquared() < 0.001) {
            fromPlayer.set(1, 0, 0);
          }
          fromPlayer.normalize();
          return this.mesh.position.add(
            new Vector3(
              -fromPlayer.z * side,
              0,
              fromPlayer.x * side,
            ).scale(2.8),
          );
        }
        return this.mesh.position;
      }
      if (this.enemyType === "sniper") {
        if (playerDistance < this.preferredDistance * 0.72) {
          return this.createDistancePosition(context.playerPosition);
        }
        if (playerDistance > this.preferredDistance * 1.15) {
          return context.playerPosition;
        }
      }
      if (playerDistance < this.preferredDistance * 0.55) {
        return this.createDistancePosition(context.playerPosition);
      }
      if (context.now >= this.nextTacticalMoveAt) {
        this.navigationTarget = this.createTacticalPosition(
          context,
        );
        this.nextTacticalMoveAt = context.now + 1_200 + (this.id % 4) * 150;
      }
      return this.navigationTarget ?? context.playerPosition;
    }
    if (this.lastSeen && this.state === "search") {
      if (
        !this.navigationTarget
        || Vector3.DistanceSquared(
          this.mesh.position,
          this.navigationTarget,
        ) < 1
      ) {
        const angle = this.id * 2.17 + context.now / 1_400;
        this.navigationTarget = this.lastSeen.add(
          new Vector3(
            Math.cos(angle) * this.difficulty.searchRadius,
            0,
            Math.sin(angle) * this.difficulty.searchRadius,
          ),
        );
      }
      return this.navigationTarget;
    }
    if (this.lastSeen) return this.lastSeen;
    if (this.lastHeard) return this.lastHeard;
    if (
      !this.navigationTarget
      || Vector3.DistanceSquared(
        this.mesh.position,
        this.navigationTarget,
      ) < 1.5
    ) {
      this.navigationTarget = this.choosePatrolPoint(
        context.patrolPoints,
        context.now,
      );
    }
    return this.navigationTarget;
  }

  private createTacticalPosition(context: BotUpdateContext) {
    const playerPosition = context.playerPosition;
    if (this.role === "cover" || !context.canShoot) {
      const coverPosition = this.findNearbyCoverPosition(context);
      if (coverPosition) return coverPosition;
    }
    const angle = (
      Math.atan2(
        this.mesh.position.z - playerPosition.z,
        this.mesh.position.x - playerPosition.x,
      )
      + Math.PI * 0.24 * (this.id % 2 === 0 ? 1 : -1)
    );
    const radius = this.preferredDistance;
    const candidate = playerPosition.add(
      new Vector3(
        Math.cos(angle) * radius,
        0,
        Math.sin(angle) * radius,
      ),
    );
    return isInsideSafeZone(candidate)
      ? this.mesh.position.add(
          new Vector3(
            Math.cos(angle + Math.PI / 2) * 5,
            0,
            Math.sin(angle + Math.PI / 2) * 5,
          ),
        )
      : candidate;
  }

  private createDistancePosition(playerPosition: Vector3) {
    const away = this.mesh.position.subtract(playerPosition);
    away.y = 0;
    if (away.lengthSquared() < 0.001) {
      away.set(this.id % 2 === 0 ? 1 : -1, 0, 0);
    }
    away.normalize();
    const candidate = this.mesh.position.add(
      away.scale(Math.max(4, this.preferredDistance * 0.45)),
    );
    return isInsideSafeZone(candidate)
      ? this.mesh.position.add(
          new Vector3(-away.z, 0, away.x).scale(5),
        )
      : candidate;
  }

  private findNearbyCoverPosition(context: BotUpdateContext) {
    const candidates = context.cover
      .filter((mesh) => {
        if (!mesh.isEnabled()) return false;
        const shape = mesh.metadata?.collisionShape;
        if (shape !== "box") return false;
        const bounds = mesh.getBoundingInfo().boundingBox;
        const size = bounds.maximumWorld.subtract(bounds.minimumWorld);
        return size.y >= 1.1 && size.y <= 4.8;
      })
      .map((mesh) => {
        const bounds = mesh.getBoundingInfo().boundingBox;
        const center = bounds.centerWorld;
        const fromPlayer = center.subtract(context.playerPosition);
        fromPlayer.y = 0;
        if (fromPlayer.lengthSquared() < 0.001) return undefined;
        fromPlayer.normalize();
        const extent = Math.max(
          bounds.extendSizeWorld.x,
          bounds.extendSizeWorld.z,
        );
        const position = center.add(
          fromPlayer.scale(extent + 0.9),
        );
        position.y = this.mesh.position.y;
        if (
          isInsideSafeZone(position)
          || horizontalDistance(position, this.mesh.position) > 13
        ) {
          return undefined;
        }
        return {
          distance: horizontalDistance(position, this.mesh.position),
          position,
        };
      })
      .filter(
        (
          candidate,
        ): candidate is { distance: number; position: Vector3 } => (
          candidate !== undefined
        ),
      )
      .sort((left, right) => left.distance - right.distance);
    return candidates[0]?.position;
  }

  private getNavigationTarget(
    destination: Vector3,
    context: BotUpdateContext,
  ) {
    while (
      this.navigationRoute.length > 0
      && horizontalDistance(
        this.mesh.position,
        this.navigationRoute[0],
      ) < 1
      && Math.abs(
        this.mesh.position.y - this.navigationRoute[0].y,
      ) < 1.35
    ) {
      this.navigationRoute.shift();
    }

    const destinationMoved = (
      !this.routeDestination
      || horizontalDistance(this.routeDestination, destination) > 3.5
      || Math.abs(this.routeDestination.y - destination.y) > 1.5
    );
    if (
      context.now >= this.nextRoutePlanAt
      && (
        destinationMoved
        || this.navigationRoute.length === 0
      )
    ) {
      this.routeDestination = destination.clone();
      this.nextRoutePlanAt = context.now + 850 + (this.id % 4) * 90;
      const needsGraph = (
        Math.abs(destination.y - this.mesh.position.y) > 1.5
        || !this.hasClearTravelLine(destination, context.cover)
      );
      this.navigationRoute = needsGraph
        ? findNavigationPath(
            context.navigationNodes,
            vectorToPoint(this.mesh.position),
            vectorToPoint(destination),
          )
          .map((node) => pointToVector(node.position))
          .filter((point) => (
            horizontalDistance(this.mesh.position, point) > 1.1
            || Math.abs(this.mesh.position.y - point.y) > 1
          ))
        : [];
    }

    return this.navigationRoute[0] ?? destination;
  }

  private hasClearTravelLine(
    destination: Vector3,
    cover: AbstractMesh[],
  ) {
    const origin = this.mesh.position.add(new Vector3(0, 0.2, 0));
    const target = destination.clone();
    target.y = origin.y;
    const direction = target.subtract(origin);
    const distance = direction.length();
    if (distance < 1.5) return true;
    const hit = this.mesh.getScene().pickWithRay(
      new Ray(origin, direction.normalize(), distance),
      (mesh) => cover.includes(mesh),
    );
    return hit?.hit !== true;
  }

  private choosePatrolPoint(points: Vector3[], now: number) {
    return points[
      (this.id + Math.floor(now / 3_500)) % points.length
    ].clone();
  }

  private applySpacing(
    direction: Vector3,
    teammates: BotController[],
  ) {
    for (const teammate of teammates) {
      if (teammate === this || !teammate.isAlive) continue;
      const offset = this.mesh.position.subtract(
        teammate.mesh.position,
      );
      const distance = offset.length();
      if (
        distance > 0.01
        && distance < GAME_CONFIG.bot.personalSpace
      ) {
        direction.addInPlace(
          offset.normalize().scale(
            (GAME_CONFIG.bot.personalSpace - distance) * 0.9,
          ),
        );
      }
    }
  }

  private applyGravityAndGround(context: BotUpdateContext) {
    const origin = this.mesh.position.add(
      new Vector3(0, GROUND_PROBE_HEIGHT, 0),
    );
    const hit = this.mesh.getScene().pickWithRay(
      new Ray(origin, Vector3.Down(), GROUND_PROBE_DISTANCE),
      (mesh) => (
        context.ground.includes(mesh)
        || mesh.metadata?.supportsGrounding === true
      ),
    );
    const groundY = hit?.pickedPoint?.y;
    const targetY = groundY === undefined
      ? undefined
      : groundY + this.groundOffset;
    if (
      targetY !== undefined
      && this.mesh.position.y <= targetY + 0.35
      && this.verticalVelocity <= 0
    ) {
      this.mesh.position.y = targetY;
      this.verticalVelocity = 0;
      this.grounded = true;
      return;
    }
    this.grounded = false;
    this.verticalVelocity += GAME_CONFIG.bot.gravity * context.dt;
    this.mesh.moveWithCollisions(
      new Vector3(0, this.verticalVelocity * context.dt, 0),
    );
    if (!hit && this.mesh.position.y < -8) {
      this.mesh.position.copyFrom(
        this.navigationTarget ?? context.patrolPoints[0],
      );
      this.verticalVelocity = 0;
    }
  }

  private turn(dt: number) {
    const speed = (
      this.state === "attack"
      || this.state === "aim"
      || this.state === "react"
    )
      ? ATTACK_TURN_SPEED
      : BODY_TURN_SPEED;
    const difference = shortestAngle(
      this.facingYaw,
      this.desiredFacingYaw,
    );
    this.facingYaw += (
      Math.sign(difference)
      * Math.min(Math.abs(difference), speed * dt)
    );
  }

  private facePosition(position: Vector3) {
    const direction = position.subtract(this.mesh.position);
    direction.y = 0;
    if (direction.lengthSquared() > 0.0001) {
      this.desiredFacingYaw = Math.atan2(direction.x, direction.z);
    }
  }

  private getFacingError(position: Vector3) {
    const direction = position.subtract(this.mesh.position);
    direction.y = 0;
    if (direction.lengthSquared() < 0.0001) return 0;
    const targetYaw = Math.atan2(direction.x, direction.z);
    return Math.abs(shortestAngle(this.facingYaw, targetYaw));
  }

  private chooseSearchFacing(now: number) {
    const phase = Math.floor((now + this.id * 173) / 900) % 4;
    this.desiredFacingYaw = (
      this.facingYaw
      + (phase % 2 === 0 ? 0.8 : -0.8)
    );
  }

  private tryShoot(context: BotUpdateContext) {
    if (
      this.state !== "attack"
      && this.state !== "aim"
    ) {
      this.fireBlockReason = (
        this.state === "detect"
        || this.state === "react"
      )
        ? "reacting"
        : `state ${this.state}`;
      return;
    }
    if (!this.canSeePlayer) {
      this.ownsAttackSlot = false;
      this.cancelAttackWarning();
      this.fireBlockReason = this.sightStatus;
      return;
    }
    if (
      isInsideSafeZone(context.playerPosition)
      || segmentIntersectsSafeZone(
        this.mesh.position,
        context.playerPosition,
      )
    ) {
      this.ownsAttackSlot = false;
      this.cancelAttackWarning();
      this.fireBlockReason = "player in safe zone";
      return;
    }
    if (context.now < this.reactionReadyAt) {
      this.fireBlockReason = "reacting";
      return;
    }
    if (!context.canShoot) {
      this.ownsAttackSlot = false;
      this.cancelAttackWarning();
      this.fireBlockReason = "waiting for attack slot";
      return;
    }
    this.facePosition(context.playerPosition);
    const weaponConfig = this.archetype.weapon;
    const muzzle = weaponConfig.kind === "melee"
      ? this.mesh.position.add(new Vector3(0, 0.15, 0))
      : this.visual.getMuzzlePosition();
    const torso = context.playerTarget.getAbsolutePosition();
    const aimDirection = torso.subtract(muzzle);
    const distance = aimDirection.length();
    if (!this.hasVisualContact(context.playerTarget, context, muzzle)) {
      this.canSeePlayer = false;
      this.ownsAttackSlot = false;
      this.cancelAttackWarning();
      this.fireBlockReason = this.sightStatus;
      return;
    }
    this.facingErrorRadians = this.getFacingError(
      context.playerPosition,
    );
    if (this.facingErrorRadians > FIRE_ALIGNMENT_RADIANS) {
      this.state = "aim";
      this.fireBlockReason = "aligning body and weapon";
      return;
    }
    if (
      distance < weaponConfig.minimumRange
      || distance > weaponConfig.range
    ) {
      this.ownsAttackSlot = false;
      this.cancelAttackWarning();
      this.fireBlockReason = (
        distance < weaponConfig.minimumRange
          ? `inside ${weaponConfig.kind} minimum range`
          : `out of ${weaponConfig.kind} range ${distance.toFixed(1)}`
      );
      return;
    }
    if (
      weaponConfig.kind !== "melee"
      && this.weapon.magazine === 0
    ) {
      if (this.weapon.reload(() => undefined)) {
        this.visual.beginReload(context.now, weaponConfig.reloadMs);
      }
      this.ownsAttackSlot = false;
      this.cancelAttackWarning();
      this.fireBlockReason = "reloading";
      return;
    }
    if (this.weapon.isReloading) {
      this.ownsAttackSlot = false;
      this.cancelAttackWarning();
      this.fireBlockReason = "reloading";
      return;
    }
    if (
      context.now < this.nextFireAt
      || (
        weaponConfig.cooldownMs === undefined
        && !this.weapon.canFire(
          context.now,
          this.archetype.roundsPerMinute,
        )
      )
    ) {
      this.ownsAttackSlot = false;
      this.fireBlockReason = "fire cooldown";
      return;
    }

    const warningMs = weaponConfig.warningMs ?? 0;
    if (warningMs > 0 && this.warningStartedAt === undefined) {
      this.warningStartedAt = context.now;
      this.warningReadyAt = context.now + warningMs;
      this.warningCount += 1;
      this.visual.showWarning(context.now, warningMs);
      context.onWarning(this);
      this.state = "aim";
      this.fireBlockReason = "warning";
      return;
    }
    if (
      this.warningStartedAt !== undefined
      && context.now < this.warningReadyAt
    ) {
      this.state = "aim";
      this.fireBlockReason = "warning";
      return;
    }

    this.fireBlockReason = "shot attempted";
    if (weaponConfig.kind === "melee") {
      this.weapon.refill();
      this.visual.showMeleeAttack(context.now);
    } else {
      this.weapon.fire(context.now);
      this.visual.showMuzzleFlash(context.now);
    }
    this.firstShotAt ??= context.now;
    this.firstShotDistance ??= distance;
    this.firstShotFacingErrorRadians ??= this.facingErrorRadians;
    this.shotsAttempted += 1;
    this.nextFireAt = context.now + this.getAttackCooldownMs();
    this.warningStartedAt = undefined;
    this.warningReadyAt = Infinity;
    this.visual.hideWarning();
    const baseDirection = aimDirection.normalize();
    context.onShot(this, muzzle, baseDirection);
    const totalDamage = this.fireProjectile(
      context,
      muzzle,
      baseDirection,
      distance,
    );
    if (totalDamage > 0) {
      this.successfulHits += 1;
      context.onHitPlayer(totalDamage);
    }
    this.state = "cooldown";
    this.ownsAttackSlot = false;
  }

  private fireProjectile(
    context: BotUpdateContext,
    muzzle: Vector3,
    baseDirection: Vector3,
    distance: number,
  ) {
    const accurateShot = Math.random() <= this.effectiveHitChance(
      distance,
      context.playerSpeed,
    );
    const direction = baseDirection.clone();
    const spread = accurateShot
      ? 0
      : this.archetype.weapon.kind === "shotgun"
        ? 0.14
        : 0.1;
    direction.x += (Math.random() - 0.5) * spread;
    direction.y += (Math.random() - 0.5) * spread;
    direction.z += (Math.random() - 0.5) * spread;
    direction.normalize();
    const hit = this.mesh.getScene().pickWithRay(
      new Ray(
        muzzle,
        direction,
        this.archetype.weapon.range,
      ),
      (mesh) => (
        !this.isOwnMesh(mesh)
        && (
          mesh === context.playerTarget
          || this.isCombatObstacle(mesh, context)
        )
      ),
    );
    if (hit?.pickedMesh !== context.playerTarget) return 0;
    return enemyDamageAtDistance(
      this.archetype,
      context.playerMaximumHealth,
      distance,
    );
  }

  private effectiveHitChance(_distance: number, _playerSpeed: number) {
    return this.accuracy;
  }

  private getAttackCooldownMs() {
    const cooldown = this.archetype.weapon.cooldownMs;
    if (!cooldown) {
      return 60_000 / this.archetype.roundsPerMinute;
    }
    const [minimum, maximum] = cooldown;
    return minimum + Math.random() * (maximum - minimum);
  }

  private cancelAttackWarning() {
    this.warningStartedAt = undefined;
    this.warningReadyAt = Infinity;
    this.visual.hideWarning();
  }

  private hasVisualContact(
    playerTarget: Mesh,
    context: BotUpdateContext,
    origin = this.headHitbox.getAbsolutePosition(),
  ) {
    const target = playerTarget.getAbsolutePosition();
    const direction = target.subtract(origin);
    const distance = direction.length();
    const detectionRange = Math.max(
      GAME_CONFIG.bot.detectionRange,
      this.archetype.weapon.range,
    );
    if (distance > detectionRange) {
      this.sightStatus = `out of range ${distance.toFixed(1)}`;
      return false;
    }
    if (segmentIntersectsSafeZone(origin, target)) {
      this.sightStatus = "safe zone blocks fire";
      return false;
    }
    const hit = this.mesh.getScene().pickWithRay(
      new Ray(origin, direction.normalize(), distance),
      (mesh) => (
        !this.isOwnMesh(mesh)
        && (
          mesh === playerTarget
          || this.isCombatObstacle(mesh, context)
        )
      ),
    );
    const seesPlayer = hit?.pickedMesh === playerTarget;
    this.sightStatus = seesPlayer
      ? "sees player"
      : `blocked by ${hit?.pickedMesh?.name ?? "nothing"}`;
    return seesPlayer;
  }

  private isCombatObstacle(
    mesh: AbstractMesh,
    context: BotUpdateContext,
  ) {
    return (
      context.cover.includes(mesh)
      || context.ground.includes(mesh)
      || (
        mesh.checkCollisions
        && mesh.metadata?.physicsCategory === "solid"
      )
    );
  }

  private isOwnMesh(mesh: AbstractMesh) {
    return (
      mesh === this.mesh
      || mesh === this.bodyHitbox
      || mesh === this.headHitbox
      || mesh.isDescendantOf(this.mesh)
      || mesh.metadata?.botId === this.id
    );
  }

  private syncVisual(now: number, target: Vector3) {
    this.mesh.rotation.y = this.facingYaw;
    this.visual.update(now, {
      aiming: (
        this.state === "attack"
        || this.state === "aim"
        || this.state === "react"
      ),
      moving: this.movedThisFrame,
      target,
    });
  }
}

function pointToVector(point: { x: number; y: number; z: number }) {
  return new Vector3(point.x, point.y, point.z);
}

function vectorToPoint(vector: Vector3) {
  return {
    x: vector.x,
    y: vector.y,
    z: vector.z,
  };
}

function horizontalDistance(left: Vector3, right: Vector3) {
  return Math.hypot(right.x - left.x, right.z - left.z);
}

function shortestAngle(from: number, to: number) {
  return Math.atan2(Math.sin(to - from), Math.cos(to - from));
}
