export interface LayoutPoint {
  x: number;
  y: number;
  z: number;
}

export interface CargoContainerLayout {
  id: string;
  x: number;
  z: number;
  rotation: number;
  stacked: boolean;
}

export interface NavigationNodeDefinition {
  id: string;
  position: LayoutPoint;
  neighbors: readonly string[];
}

export const COMPACT_MAP_LAYOUT = {
  size: 40,
  playerSpawn: {
    x: -16,
    y: 1.7,
    z: -13.9,
  },
  botSpawns: [
    { x: -8, y: 1.7, z: 17 },
    { x: 17, y: 1.7, z: 8 },
    { x: 8, y: 1.7, z: -17 },
    { x: -17, y: 1.7, z: 8 },
  ],
  cargoContainers: [
    {
      id: "west-long",
      x: -11,
      z: -3,
      rotation: 0,
      stacked: false,
    },
    {
      id: "south-cross",
      x: -5,
      z: -10,
      rotation: Math.PI / 2,
      stacked: false,
    },
    {
      id: "central-stack",
      x: -2.5,
      z: 0.5,
      rotation: 0,
      stacked: true,
    },
    {
      id: "northwest-cross",
      x: -11,
      z: 8,
      rotation: Math.PI / 2,
      stacked: false,
    },
    {
      id: "north-long",
      x: -4,
      z: 12,
      rotation: 0,
      stacked: false,
    },
    {
      id: "west-center",
      x: -15,
      z: 3,
      rotation: Math.PI / 2,
      stacked: false,
    },
    {
      id: "south-center",
      x: 1,
      z: -12,
      rotation: 0,
      stacked: false,
    },
    {
      id: "north-edge",
      x: 1,
      z: 16,
      rotation: 0,
      stacked: false,
    },
    {
      id: "northeast-long",
      x: 13,
      z: 15.5,
      rotation: 0,
      stacked: false,
    },
    {
      id: "southeast-cross",
      x: 14,
      z: -10,
      rotation: Math.PI / 2,
      stacked: false,
    },
  ] satisfies readonly CargoContainerLayout[],
  elevatedPlatforms: [
    {
      id: "command-platform",
      center: { x: 8, y: 3, z: 5 },
      width: 8,
      depth: 7,
    },
  ],
  elevatedAccessRoutes: {
    "command-platform": [
      "command platform south ramp",
      "command platform west ramp",
    ],
  },
  navigationNodes: [
    {
      id: "safe-exit",
      position: { x: -12, y: 1.3, z: -12 },
      neighbors: ["cargo-south", "south-lane"],
    },
    {
      id: "south-entry",
      position: { x: 8, y: 1.3, z: -16 },
      neighbors: ["south-lane", "southeast", "platform-south-lower"],
    },
    {
      id: "south-lane",
      position: { x: 3.5, y: 1.3, z: -7 },
      neighbors: [
        "safe-exit",
        "south-entry",
        "center",
        "platform-south-lower",
      ],
    },
    {
      id: "cargo-south",
      position: { x: -9, y: 1.3, z: -7 },
      neighbors: ["safe-exit", "west-lane", "center"],
    },
    {
      id: "west-entry",
      position: { x: -17, y: 1.3, z: 8 },
      neighbors: ["west-lane"],
    },
    {
      id: "west-lane",
      position: { x: -10, y: 1.3, z: 5 },
      neighbors: [
        "cargo-south",
        "west-entry",
        "cargo-north",
        "center",
        "platform-west-lower",
      ],
    },
    {
      id: "cargo-north",
      position: { x: -8, y: 1.3, z: 14.5 },
      neighbors: ["west-lane", "north-entry", "north-lane"],
    },
    {
      id: "north-entry",
      position: { x: -8, y: 1.3, z: 17 },
      neighbors: ["cargo-north", "north-lane"],
    },
    {
      id: "north-lane",
      position: { x: 6, y: 1.3, z: 17 },
      neighbors: ["cargo-north", "north-entry", "north-ground", "northeast"],
    },
    {
      id: "north-ground",
      position: { x: 7, y: 1.3, z: 11 },
      neighbors: ["north-lane", "northeast"],
    },
    {
      id: "northeast",
      position: { x: 16, y: 1.3, z: 12 },
      neighbors: ["north-lane", "north-ground", "east-entry"],
    },
    {
      id: "east-entry",
      position: { x: 17, y: 1.3, z: 8 },
      neighbors: ["northeast", "east-lane"],
    },
    {
      id: "east-lane",
      position: { x: 16, y: 1.3, z: 1 },
      neighbors: ["east-entry", "southeast", "center", "platform-south-lower"],
    },
    {
      id: "southeast",
      position: { x: 15, y: 1.3, z: -5 },
      neighbors: ["east-lane", "south-entry"],
    },
    {
      id: "center",
      position: { x: 1.5, y: 1.3, z: 3 },
      neighbors: [
        "south-lane",
        "cargo-south",
        "west-lane",
        "east-lane",
        "platform-west-lower",
      ],
    },
    {
      id: "platform-south-lower",
      position: { x: 8, y: 1.3, z: -3 },
      neighbors: [
        "south-entry",
        "south-lane",
        "east-lane",
        "platform-south-upper",
      ],
    },
    {
      id: "platform-south-upper",
      position: { x: 8, y: 4.525, z: 1.5 },
      neighbors: ["platform-south-lower", "platform-deck"],
    },
    {
      id: "platform-west-lower",
      position: { x: 0.5, y: 1.3, z: 5 },
      neighbors: ["center", "west-lane", "platform-west-upper"],
    },
    {
      id: "platform-west-upper",
      position: { x: 4, y: 4.525, z: 5 },
      neighbors: ["platform-west-lower", "platform-deck"],
    },
    {
      id: "platform-deck",
      position: { x: 8, y: 4.525, z: 5 },
      neighbors: ["platform-south-upper", "platform-west-upper"],
    },
  ] satisfies readonly NavigationNodeDefinition[],
  safeZone: {
    id: "southwest",
    center: { x: -16, z: -16 },
    size: 5,
  },
} as const;
