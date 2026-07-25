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
  ENDLESS_WAVE_CONFIG,
  GAME_CONFIG,
  createEnemyArchetype,
  getEliteSniperDamage,
  getNormalEnemyDamageMultiplier,
  type EnemyArchetype,
  type EnemyType,
  type WaveConfig,
} from "../game/gameConfig";
import {
  isInsideSafeZone,
  movementEntersSafeZone,
  segmentIntersectsSafeZone,
} from "../map/safeZones";
import { BotVisual } from "./BotVisual";

export type BotState =
  | "idle"
  | "alert"
  | "chase"
  | "attack"
  | "search"
  | "dead";
export type BotRole = "pressure" | "hold" | "flank";

export interface BotUpdateContext {
  now: number;
  dt: number;
  playerPosition: Vector3;
  playerTarget: Mesh;
  playerSpeed: number;
  maximumPlayerHealth: number;
  canShoot: boolean;
  cover: AbstractMesh[];
  ground: AbstractMesh[];
  patrolPoints: Vector3[];
  teammates: BotController[];
  lastGunshot?: { position: Vector3; time: number };
  onShot: (
    bot: BotController,
    origin: Vector3,
    direction: Vector3,
  ) => void;
  onHitPlayer: (damage: number) => void;
  onFootstep: (position: Vector3) => void;
}

const BODY_TURN_SPEED = 3.2;
const ATTACK_TURN_SPEED = 5.4;
const BOT_HEIGHT_FROM_GROUND = 1.3;
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
  readonly isBoss: boolean;
  health: number;
  state: BotState = "idle";
  isAlive = true;
  private readonly visual: BotVisual;
  private readonly archetype: EnemyArchetype;
  private lastDamagedAt = -Infinity;
  private lastSeen?: Vector3;
  private lastHeard?: Vector3;
  private alertUntil = 0;
  private searchUntil = 0;
  private nextFireAt = 0;
  private nextPerceptionAt: number;
  private reactionReadyAt = Infinity;
  private canSeePlayer = false;
  private facingYaw = 0;
  private desiredFacingYaw = 0;
  private navigationTarget?: Vector3;
  private avoidanceTarget?: Vector3;
  private nextTacticalMoveAt = 0;
  private blockedMoves = 0;
  private movedThisFrame = false;
  private grounded = false;
  private verticalVelocity = 0;
  private footstepDistance = 0;
  private sightStatus = "not checked";

  constructor(
    scene: Scene,
    spawn: Vector3,
    readonly id: number,
    private readonly difficulty: WaveConfig,
    enemyType: EnemyType,
  ) {
    this.archetype = createEnemyArchetype(enemyType, difficulty);
    this.enemyType = enemyType;
    this.maximumHealth = this.archetype.health;
    this.health = this.maximumHealth;
    this.isBoss = this.archetype.boss;
    this.mesh = MeshBuilder.CreateCapsule(
      `bot ${id} collision`,
      { height: 2.6, radius: 0.42 },
      scene,
    );
    this.mesh.position.copyFrom(spawn);
    this.mesh.visibility = 0.001;
    this.mesh.isPickable = false;
    this.mesh.checkCollisions = true;
    this.mesh.ellipsoid = new Vector3(0.38, 1.2, 0.38);
    this.mesh.ellipsoidOffset = Vector3.Zero();
    this.mesh.metadata = {
      enemy: true,
      botId: id,
      enemyType,
    };
    this.bodyHitbox = MeshBuilder.CreateCapsule(
      `bot ${id} body hitbox`,
      { height: 1.9, radius: 0.42 },
      scene,
    );
    this.bodyHitbox.parent = this.mesh;
    this.bodyHitbox.position.set(0, -0.3, 0);
    this.bodyHitbox.visibility = 0.001;
    this.bodyHitbox.isPickable = true;
    this.bodyHitbox.metadata = {
      enemy: true,
      botId: id,
      enemyType,
      hitZone: "body",
    };
    this.headHitbox = MeshBuilder.CreateSphere(
      `bot ${id} head hitbox`,
      { diameter: 0.58, segments: 12 },
      scene,
    );
    this.headHitbox.parent = this.mesh;
    this.headHitbox.position.set(0, 0.82, 0);
    this.headHitbox.visibility = 0.001;
    this.headHitbox.isPickable = true;
    this.headHitbox.metadata = {
      enemy: true,
      botId: id,
      enemyType,
      hitZone: "head",
    };
    this.visual = new BotVisual(
      scene,
      id,
      this.mesh,
      this.archetype,
    );
    this.role = difficulty.flankingEnabled && id % 3 === 0
      ? "flank"
      : id % 3 === 1
        ? "pressure"
        : "hold";
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
      this.grounded ? "grounded" : "airborne",
      this.movedThisFrame ? "moving" : "still",
      `${Math.ceil(this.health)}/${this.maximumHealth} HP`,
      `(${position.x.toFixed(1)}, ${position.y.toFixed(1)}, ${position.z.toFixed(1)})`,
    ].join(" · ");
  }

  wantsAttackSlot(now: number) {
    return (
      this.isReady
      && this.state === "attack"
      && this.canSeePlayer
      && now >= this.reactionReadyAt
    );
  }

  adjustIncomingPlayerDamage(damage: number) {
    if (this.isBoss) return damage;
    return (
      damage
      * getNormalEnemyDamageMultiplier(this.difficulty.durabilityTier)
    );
  }

  takeDamage(amount: number, now: number) {
    if (!this.isAlive) return false;
    this.health = Math.max(0, this.health - Math.max(0, amount));
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
    if (context.now >= this.nextPerceptionAt) {
      this.updatePerception(context);
    }
    this.chooseState(context);
    this.move(context);
    this.turn(context.dt);
    if (context.canShoot) {
      this.tryShoot(context);
    }
    this.syncVisual(context.now);
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
      && this.hasVisualContact(context.playerTarget, context.cover)
    );
    if (visible) {
      if (!this.canSeePlayer) {
        this.alertUntil = context.now + this.reactionDelay * 1000;
        this.reactionReadyAt = this.alertUntil;
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
      this.state = context.now < this.alertUntil ? "alert" : "attack";
      return;
    }
    if (this.lastSeen && context.now < this.searchUntil) {
      this.state = Vector3.DistanceSquared(
        this.mesh.position,
        this.lastSeen,
      ) > 4
        ? "chase"
        : "search";
      if (this.state === "search" && previousState !== "search") {
        this.navigationTarget = undefined;
      }
      return;
    }
    if (this.lastHeard && context.now < this.searchUntil) {
      this.state = "chase";
      return;
    }
    this.lastSeen = undefined;
    this.lastHeard = undefined;
    this.state = "idle";
  }

  private move(context: BotUpdateContext) {
    const target = this.getTarget(context);
    const direction = target.subtract(this.mesh.position);
    direction.y = 0;
    this.movedThisFrame = false;
    const horizontalPlayerDistance = Math.hypot(
      context.playerPosition.x - this.mesh.position.x,
      context.playerPosition.z - this.mesh.position.z,
    );
    const shouldHoldAttackPosition = (
      this.state === "attack"
      && context.canShoot
      && horizontalPlayerDistance <= this.preferredDistance
    );
    if (shouldHoldAttackPosition) {
      this.applyGravityAndGround(context);
      this.facePosition(context.playerPosition);
      return;
    }
    if (direction.length() < 0.8) {
      this.navigationTarget = undefined;
      this.applyGravityAndGround(context);
      if (this.state === "search") {
        this.chooseSearchFacing(context.now);
      } else if (this.state === "attack") {
        this.facePosition(context.playerPosition);
      }
      return;
    }
    direction.normalize();
    this.applySpacing(direction, context.teammates);
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
        this.blockedMoves = 0;
      }
    } else {
      this.blockedMoves = 0;
      this.movedThisFrame = actualHorizontal > 0.0005;
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
      if (
        (!context.canShoot || this.role === "flank")
        && context.now >= this.nextTacticalMoveAt
      ) {
        this.navigationTarget = this.createTacticalPosition(
          context.playerPosition,
        );
        this.nextTacticalMoveAt = context.now + 1_600 + (this.id % 4) * 180;
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

  private createTacticalPosition(playerPosition: Vector3) {
    const angle = (
      Math.atan2(
        this.mesh.position.z - playerPosition.z,
        this.mesh.position.x - playerPosition.x,
      )
      + (this.role === "flank" ? Math.PI * 0.52 : Math.PI * 0.22)
        * (this.id % 2 === 0 ? 1 : -1)
    );
    const radius = this.role === "flank"
      ? Math.max(7, this.preferredDistance * 0.78)
      : this.preferredDistance;
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

  private choosePatrolPoint(points: Vector3[], now: number) {
    const sameLevel = points.filter(
      (point) => Math.abs(point.y - this.mesh.position.y) < 1.8,
    );
    const candidates = sameLevel.length > 0 ? sameLevel : points;
    return candidates[
      (this.id + Math.floor(now / 3_500)) % candidates.length
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
      : groundY + BOT_HEIGHT_FROM_GROUND;
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
    const speed = this.state === "attack" || this.state === "alert"
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
      || !this.canSeePlayer
      || isInsideSafeZone(context.playerPosition)
      || segmentIntersectsSafeZone(
        this.mesh.position,
        context.playerPosition,
      )
      || context.now < this.reactionReadyAt
    ) {
      return;
    }
    if (this.nextFireAt === 0) {
      this.nextFireAt = context.now + (this.id % 7) * 65;
    }
    this.facePosition(context.playerPosition);
    const muzzle = this.visual.getMuzzlePosition();
    const torso = context.playerTarget.getAbsolutePosition();
    const aimDirection = torso.subtract(muzzle);
    const distance = aimDirection.length();
    const forward = new Vector3(
      Math.sin(this.facingYaw),
      0,
      Math.cos(this.facingYaw),
    );
    const horizontalAim = aimDirection.clone();
    horizontalAim.y = 0;
    if (horizontalAim.lengthSquared() < 0.0001) return;
    const alignment = Vector3.Dot(
      forward,
      horizontalAim.normalize(),
    );
    if (
      alignment
      < Math.cos(GAME_CONFIG.bot.firingAngleRadians)
    ) {
      return;
    }
    if (!this.hasVisualContact(context.playerTarget, context.cover)) {
      return;
    }
    if (distance > this.archetype.weapon.range) return;
    if (this.weapon.magazine === 0) {
      this.weapon.reload(() => undefined);
      return;
    }
    if (
      context.now < this.nextFireAt
      || !this.weapon.canFire(
        context.now,
        this.archetype.roundsPerMinute,
      )
    ) {
      return;
    }

    this.weapon.fire(context.now);
    const cadenceOffset = 35 + (this.id % 5) * 23;
    this.nextFireAt = (
      context.now
      + 60_000 / this.archetype.roundsPerMinute
      + cadenceOffset
    );
    this.visual.showMuzzleFlash(context.now);
    const baseDirection = aimDirection.normalize();
    context.onShot(this, muzzle, baseDirection);
    const totalDamage = this.fireProjectiles(
      context,
      muzzle,
      baseDirection,
      distance,
    );
    if (totalDamage > 0) {
      context.onHitPlayer(totalDamage);
    }
  }

  private fireProjectiles(
    context: BotUpdateContext,
    muzzle: Vector3,
    baseDirection: Vector3,
    distance: number,
  ) {
    const accurateShot = Math.random() <= this.effectiveHitChance(
      distance,
      context.playerSpeed,
    );
    const pellets = this.archetype.weapon.pellets;
    let hits = 0;
    for (let pellet = 0; pellet < pellets; pellet += 1) {
      const direction = baseDirection.clone();
      const spread = accurateShot
        ? this.archetype.weapon.type === "shotgun"
          ? 0.012
          : 0
        : this.archetype.weapon.type === "shotgun"
          ? 0.16
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
          mesh === context.playerTarget
          || context.cover.includes(mesh)
        ),
      );
      if (hit?.pickedMesh === context.playerTarget) {
        hits += 1;
      }
    }
    if (hits === 0) return 0;
    if (this.enemyType === "elite-sniper") {
      return getEliteSniperDamage(context.maximumPlayerHealth);
    }
    const falloff = this.archetype.weapon.type === "shotgun"
      ? shotgunDamageFalloff(distance)
      : 1;
    const damagePerHit = this.archetype.weapon.type === "sniper"
      ? this.archetype.weapon.damagePerHit
      : Math.min(
          ENDLESS_WAVE_CONFIG.safetyCaps.normalBulletDamage,
          this.archetype.weapon.damagePerHit,
        );
    return hits * damagePerHit * falloff;
  }

  private effectiveHitChance(distance: number, playerSpeed: number) {
    const rangeRatio = distance / this.archetype.weapon.range;
    const distanceFactor = rangeRatio <= 0.35
      ? 1
      : Math.max(0.55, 1 - (rangeRatio - 0.35) * 0.45);
    const movementFactor = playerSpeed > 1.5 ? 0.82 : 1;
    return Math.min(
      ENDLESS_WAVE_CONFIG.safetyCaps.accuracy,
      this.accuracy * distanceFactor * movementFactor,
    );
  }

  private hasVisualContact(
    playerTarget: Mesh,
    cover: AbstractMesh[],
  ) {
    const eye = this.mesh.position.add(new Vector3(0, 1.05, 0));
    const target = playerTarget.getAbsolutePosition();
    const direction = target.subtract(eye);
    const distance = direction.length();
    const detectionRange = Math.max(
      GAME_CONFIG.bot.detectionRange,
      this.archetype.weapon.range,
    );
    if (distance > detectionRange) {
      this.sightStatus = `out of range ${distance.toFixed(1)}`;
      return false;
    }
    if (segmentIntersectsSafeZone(eye, target)) {
      this.sightStatus = "safe zone blocks fire";
      return false;
    }
    const horizontal = direction.clone();
    horizontal.y = 0;
    const forward = new Vector3(
      Math.sin(this.facingYaw),
      0,
      Math.cos(this.facingYaw),
    );
    const alignment = horizontal.lengthSquared() > 0.0001
      ? Vector3.Dot(forward, horizontal.normalize())
      : 1;
    if (
      alignment
      < Math.cos(GAME_CONFIG.bot.fieldOfViewRadians / 2)
    ) {
      this.sightStatus = `outside view ${alignment.toFixed(2)}`;
      return false;
    }
    const hit = this.mesh.getScene().pickWithRay(
      new Ray(eye, direction.normalize(), distance),
      (mesh) => mesh === playerTarget || cover.includes(mesh),
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
      || this.health >= this.maximumHealth
    ) {
      return;
    }
    this.health = Math.min(
      this.maximumHealth,
      this.health + GAME_CONFIG.regeneration.healthPerSecond * dt,
    );
  }

  private syncVisual(now: number) {
    this.mesh.rotation.y = this.facingYaw;
    this.visual.update(now);
  }
}

function shotgunDamageFalloff(distance: number) {
  if (distance <= 6) return 1;
  if (distance >= 18) return 0.25;
  return 1 - (distance - 6) / 16;
}

function shortestAngle(from: number, to: number) {
  return Math.atan2(Math.sin(to - from), Math.cos(to - from));
}
