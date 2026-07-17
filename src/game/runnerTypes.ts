export type Difficulty = "easy" | "normal" | "hard";

export type RunnerMode = "menu" | "controls" | "settings" | "scoreboard" | "tutorial" | "playing" | "paused" | "gameover";

export type HazardKind =
  | "barrier"
  | "beam"
  | "laser"
  | "rotor"
  | "door"
  | "falling"
  | "moving"
  | "wallGate";

export type SectionTheme = "transit" | "rooftop" | "foundry" | "skyway";

export interface HazardDefinition {
  kind: HazardKind;
  lane: number;
  zOffset: number;
  width?: number;
  height?: number;
  depth?: number;
  phase?: number;
  warning: string;
  action: "jump" | "slide" | "dodge" | "dash" | "wallrun";
  severity: "minor" | "severe";
}

export interface CollectibleDefinition {
  lane: number;
  zOffset: number;
  y: number;
  value: number;
  risky?: boolean;
}

export interface CourseSectionDefinition {
  startZ: number;
  length: number;
  floorMask: number;
  theme: SectionTheme;
  hazards: HazardDefinition[];
  collectibles: CollectibleDefinition[];
  wallRunLanes: number[];
  safe: boolean;
  label: string;
}

export interface RunRecord {
  id: string;
  name: string;
  difficulty: Difficulty;
  score: number;
  distance: number;
  time: number;
  multiplier: number;
  avoided: number;
  date: string;
  result: "crashed" | "fell" | "quit";
}

export interface DifficultyConfig {
  label: string;
  color: string;
  baseSpeed: number;
  speedRamp: number;
  warningTime: number;
  comboGrace: number;
  health: number;
  rewardScale: number;
  recoveryRate: number;
}

export interface HudSnapshot {
  score: number;
  distance: number;
  time: number;
  multiplier: number;
  health: number;
  maxHealth: number;
  speed: number;
  avoided: number;
  actionLabel: string;
  warning: string;
  warningProgress: number;
  dashCooldown: number;
  dashReady: boolean;
  mode: "ground" | "air" | "slide" | "dash" | "wallrun";
}
