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
  ] satisfies readonly CargoContainerLayout[],
  elevatedPlatforms: [
    {
      id: "south-tower",
      center: { x: 8, y: 3, z: 5 },
      width: 7,
      depth: 7,
    },
    {
      id: "north-tower",
      center: { x: 8, y: 3, z: 13 },
      width: 7,
      depth: 5,
    },
  ],
  safeZone: {
    id: "southwest",
    center: { x: -16, z: -16 },
    size: 5,
  },
} as const;
