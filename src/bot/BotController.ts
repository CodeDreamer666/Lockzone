import {
  AbstractMesh,
  AnimationGroup,
  Mesh,
  MeshBuilder,
  Ray,
  Scene,
  TransformNode,
  Vector3,
} from "@babylonjs/core";
import { Weapon } from "../combat/Weapon";
import { GAME_CONFIG } from "../game/gameConfig";

export type BotState = "searching" | "pressuring" | "flanking" | "retreating" | "dead";
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
  onHitPlayer: () => void;
}

export class BotController {
  readonly mesh: Mesh;
  readonly weapon = new Weapon();
  readonly role: BotRole;
  readonly reactionDelay: number;
  readonly accuracy: number;
  readonly preferredDistance: number;
  readonly burstSeconds: number;
  health: number = GAME_CONFIG.player.health;
  state: BotState = "searching";
  isAlive = true;
  private visual?: TransformNode;
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

  constructor(scene: Scene, spawn: Vector3, readonly id: number) {
    this.mesh = MeshBuilder.CreateCapsule(`bot ${id} collision`, { height: 2.6, radius: 0.42 }, scene);
    this.mesh.position.copyFrom(spawn);
    this.mesh.visibility = 0.001;
    this.mesh.metadata = { enemy: true, botId: id };
    this.role = id % 3 === 0 ? "flank" : id % 3 === 1 ? "pressure" : "hold";
    this.reactionDelay = GAME_CONFIG.bot.reactionSeconds + (id % 4) * 0.1;
    this.accuracy = GAME_CONFIG.bot.accuracy - 0.08 + (id % 5) * 0.035;
    this.preferredDistance = 10 + (id % 4) * 2.5;
    this.burstSeconds = 0.26 + (id % 3) * 0.13;
    this.nextPerceptionAt = id * 28;
    this.nextDecisionAt = id * 67;
  }

  get isReady() {
    return this.isAlive && !!this.visual && this.visual.isEnabled() && !this.visual.isDisposed();
  }

  setVisual(visual: TransformNode, animation?: AnimationGroup) {
    this.visual = visual;
    visual.parent = null;
    visual.scaling.scaleInPlace(1.25);
    visual.setEnabled(true);
    this.syncVisual();
    animation?.start(true, 1);
  }

  takeDamage(amount: number, now: number) {
    if (!this.isAlive) return;
    this.health = Math.max(0, this.health - amount);
    this.lastDamagedAt = now;
    if (this.health > 0) return;
    this.isAlive = false;
    this.state = "dead";
    this.weapon.dispose();
    if (this.visual) this.visual.rotation.z = Math.PI / 2;
  }

  update(context: BotUpdateContext) {
    if (!this.isReady) return;
    this.regenerate(context.now, context.dt);
    if (context.now >= this.nextPerceptionAt) this.updatePerception(context);
    if (context.now >= this.nextDecisionAt) this.chooseState(context);
    this.move(context);
    this.syncVisual();
    this.tryShoot(context);
  }

  dispose() { this.weapon.dispose(); this.visual?.dispose(); this.mesh.dispose(); }

  private updatePerception(context: BotUpdateContext) {
    this.nextPerceptionAt = context.now + GAME_CONFIG.bot.perceptionSeconds * 1000 + this.id * 5;
    const visible = this.hasLineOfSight(context.playerPosition, context.playerTarget, context.cover, context.teammates);
    if (visible && !this.canSeePlayer) this.reactionReadyAt = context.now + this.reactionDelay * 1000;
    this.canSeePlayer = visible;
    if (visible) this.lastSeen = context.playerPosition.clone();
    if (!visible && context.lastGunshot && context.now - context.lastGunshot.time < 1400 && Vector3.Distance(this.mesh.position, context.lastGunshot.position) < 28) this.lastHeard = context.lastGunshot.position.clone();
  }

  private chooseState(context: BotUpdateContext) {
    this.nextDecisionAt = context.now + GAME_CONFIG.bot.decisionSeconds * 1000 + this.id * 11;
    if (this.health <= 35) { this.state = "retreating"; return; }
    if (this.canSeePlayer) { this.state = this.role === "flank" ? "flanking" : "pressuring"; return; }
    this.state = "searching";
  }

  private move(context: BotUpdateContext) {
    const target = this.getTarget(context);
    const direction = target.subtract(this.mesh.position);
    direction.y = 0;
    if (direction.length() < 1) return;
    direction.normalize();
    this.applySpacing(direction, context.teammates);
    direction.normalize();
    const moveSpeed = this.state === "retreating" ? 4.1 : GAME_CONFIG.player.forwardSpeed;
    const next = this.mesh.position.add(direction.scale(moveSpeed * context.dt));
    const previous = this.mesh.position.clone();
    this.mesh.position.copyFrom(next);
    if (context.cover.some((wall) => this.mesh.intersectsMesh(wall, false))) this.mesh.position.copyFrom(previous);
    this.facingYaw = Math.atan2(direction.x, direction.z);
  }

  private getTarget(context: BotUpdateContext) {
    if (this.state === "retreating") return this.mesh.position.subtract(context.playerPosition).normalize().scale(this.preferredDistance).add(this.mesh.position);
    if (this.canSeePlayer && this.state === "pressuring") {
      const distance = Vector3.Distance(this.mesh.position, context.playerPosition);
      if (distance > this.preferredDistance) return context.playerPosition;
      return this.mesh.position.subtract(context.playerPosition).normalize().scale(3).add(this.mesh.position);
    }
    if (this.state === "flanking") return context.patrolPoints[(this.id + Math.floor(context.now / 6000)) % context.patrolPoints.length];
    return this.lastSeen ?? this.lastHeard ?? context.patrolPoints[(this.id + Math.floor(context.now / 5000)) % context.patrolPoints.length];
  }

  private applySpacing(direction: Vector3, teammates: BotController[]) {
    for (const teammate of teammates) {
      if (teammate === this || !teammate.isAlive) continue;
      const offset = this.mesh.position.subtract(teammate.mesh.position);
      const distance = offset.length();
      if (distance > 0.01 && distance < GAME_CONFIG.bot.personalSpace) direction.addInPlace(offset.normalize().scale((GAME_CONFIG.bot.personalSpace - distance) * 0.9));
    }
  }

  private tryShoot(context: BotUpdateContext) {
    if (!this.canSeePlayer || context.now < this.reactionReadyAt) return;
    if (!this.hasLineOfSight(context.playerPosition, context.playerTarget, context.cover, context.teammates)) {
      this.canSeePlayer = false;
      return;
    }
    const distance = Vector3.Distance(this.mesh.position, context.playerPosition);
    if (context.now >= this.nextBurstAt) {
      const duration = distance > 20 ? this.burstSeconds * 0.55 : this.burstSeconds;
      this.burstUntil = context.now + duration * 1000;
      this.nextBurstAt = this.burstUntil + 260 + (this.id % 4) * 85;
    }
    if (context.now > this.burstUntil) return;
    if (this.weapon.magazine === 0) this.weapon.reload(() => undefined);
    if (!this.weapon.canFire(context.now)) return;
    this.weapon.fire(context.now);
    context.onShot(this);
    const movementPenalty = this.state === "pressuring" ? 0.82 : 1;
    const hitChance = this.accuracy * movementPenalty * Math.max(0.28, 1 - distance / 48);
    if (Math.random() < hitChance) context.onHitPlayer();
  }

  private hasLineOfSight(player: Vector3, playerTarget: Mesh, cover: AbstractMesh[], teammates: BotController[]) {
    const eye = this.mesh.position.add(new Vector3(0, 1.35, 0));
    const direction = player.subtract(eye);
    const distance = direction.length();
    if (distance > GAME_CONFIG.bot.detectionRange) return false;
    const forward = new Vector3(Math.sin(this.facingYaw), 0, Math.cos(this.facingYaw));
    if (Vector3.Dot(forward, direction.normalize()) < Math.cos(GAME_CONFIG.bot.fieldOfViewRadians / 2)) return false;
    const ray = new Ray(eye, direction, distance);
    const hit = this.mesh.getScene().pickWithRay(ray, (mesh) => mesh === playerTarget || cover.some((wall) => wall === mesh) || teammates.some((bot) => bot !== this && bot.isAlive && bot.mesh === mesh));
    return hit?.pickedMesh === playerTarget;
  }

  private regenerate(now: number, dt: number) {
    if (now - this.lastDamagedAt < GAME_CONFIG.regeneration.delayMs || this.health >= GAME_CONFIG.player.health) return;
    this.health = Math.min(GAME_CONFIG.player.health, this.health + GAME_CONFIG.regeneration.healthPerSecond * dt);
  }

  private syncVisual() {
    if (!this.visual) return;
    this.visual.position.copyFrom(this.mesh.position);
    this.visual.position.y -= 1.3;
    this.visual.rotation.y = this.facingYaw + Math.PI;
  }
}
