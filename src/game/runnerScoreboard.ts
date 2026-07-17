import type { Difficulty, RunRecord } from "./runnerTypes";

const STORAGE_KEY = "neon-duel-runner-scores-v1";
const SETTINGS_KEY = "neon-duel-runner-settings-v1";

export interface RunnerSettings {
  playerName: string;
  music: number;
  effects: number;
  muted: boolean;
  reducedMotion: boolean;
  tutorialSeen: boolean;
}

export const DEFAULT_SETTINGS: RunnerSettings = {
  playerName: "RUNNER",
  music: 0.28,
  effects: 0.66,
  muted: false,
  reducedMotion: false,
  tutorialSeen: false,
};

export function loadSettings(): RunnerSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed: Partial<RunnerSettings> = JSON.parse(raw);
    return {
      ...DEFAULT_SETTINGS,
      ...parsed,
      playerName: typeof parsed.playerName === "string" && parsed.playerName.trim()
        ? parsed.playerName.trim().slice(0, 12).toUpperCase()
        : DEFAULT_SETTINGS.playerName,
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings: RunnerSettings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // Storage can be unavailable in private browsing; the run remains playable.
  }
}

function isRunRecord(value: unknown): value is RunRecord {
  if (!value || typeof value !== "object") return false;
  const record = value as Partial<RunRecord>;
  return typeof record.id === "string"
    && typeof record.name === "string"
    && (record.difficulty === "easy" || record.difficulty === "normal" || record.difficulty === "hard")
    && typeof record.score === "number"
    && typeof record.distance === "number"
    && typeof record.time === "number"
    && typeof record.multiplier === "number"
    && typeof record.avoided === "number"
    && typeof record.date === "string"
    && (record.result === "crashed" || record.result === "fell" || record.result === "quit");
}

export function loadRuns(): RunRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isRunRecord).sort((a, b) => b.score - a.score).slice(0, 50);
  } catch {
    return [];
  }
}

export function saveRun(run: RunRecord): RunRecord[] {
  const next = [run, ...loadRuns()].sort((a, b) => b.score - a.score).slice(0, 50);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // A run is still returned to the current session when persistence is blocked.
  }
  return next;
}

export function clearRuns() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore storage failures.
  }
}

export function getPersonalBest(runs = loadRuns()) {
  return runs[0];
}

export function getStats(runs = loadRuns()) {
  return {
    highestScore: runs[0]?.score ?? 0,
    longestDistance: Math.max(0, ...runs.map((run) => run.distance)),
    longestTime: Math.max(0, ...runs.map((run) => run.time)),
    bestMultiplier: Math.max(0, ...runs.map((run) => run.multiplier)),
    mostAvoided: Math.max(0, ...runs.map((run) => run.avoided)),
  };
}

export function createRunRecord(input: Omit<RunRecord, "id" | "date">): RunRecord {
  return {
    ...input,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    date: new Date().toISOString(),
  };
}

export const DIFFICULTIES: Record<Difficulty, { label: string; color: string; baseSpeed: number; speedRamp: number; warningTime: number; comboGrace: number; health: number; rewardScale: number; recoveryRate: number }> = {
  easy: {
    label: "EASY",
    color: "#65e6c8",
    baseSpeed: 13.5,
    speedRamp: 0.07,
    warningTime: 2.4,
    comboGrace: 4.2,
    health: 4,
    rewardScale: 0.8,
    recoveryRate: 0.26,
  },
  normal: {
    label: "NORMAL",
    color: "#5ac8ff",
    baseSpeed: 15,
    speedRamp: 0.1,
    warningTime: 1.8,
    comboGrace: 3.1,
    health: 3,
    rewardScale: 1,
    recoveryRate: 0.18,
  },
  hard: {
    label: "HARD",
    color: "#ff5c96",
    baseSpeed: 16.2,
    speedRamp: 0.14,
    warningTime: 1.35,
    comboGrace: 2.35,
    health: 2,
    rewardScale: 1.35,
    recoveryRate: 0.08,
  },
};
