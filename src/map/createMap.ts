import {
  Color3,
  DynamicTexture,
  Mesh,
  MeshBuilder,
  PBRMaterial,
  Scene,
  StandardMaterial,
  Texture,
  Vector3,
} from "@babylonjs/core";
import { COMPACT_MAP_LAYOUT } from "./mapLayout";
import {
  DISTRICT_SIZE,
  SAFE_ZONES,
} from "./safeZones";

export const DISTRICT_DIMENSIONS = {
  width: DISTRICT_SIZE,
  depth: DISTRICT_SIZE,
} as const;

export type SurfaceType = "asphalt" | "concrete" | "indoor" | "metal";
export type BulletMaterial = "concrete" | "metal" | "wood";

export interface PushablePropDefinition {
  halfHeight: number;
  mass: number;
  mesh: Mesh;
  radius: number;
}

export interface MapData {
  cover: Mesh[];
  walkableSurfaces: Mesh[];
  playerSpawn: Vector3;
  botSpawns: Vector3[];
  resourcePoints: Vector3[];
  decorativeMeshes: Mesh[];
  pushableProps: PushablePropDefinition[];
}

interface PhysicalOptions {
  bulletMaterial?: BulletMaterial;
  surfaceType?: SurfaceType;
}

type SolidBuilder = (
  name: string,
  position: Vector3,
  size: [number, number, number],
  material: PBRMaterial,
  options?: PhysicalOptions,
) => Mesh;

type DecorationBuilder = (
  name: string,
  position: Vector3,
  size: [number, number, number],
  material: PBRMaterial | StandardMaterial,
) => Mesh;

type ArenaMaterials = ReturnType<typeof createArenaMaterials>;

export function createMap(scene: Scene): MapData {
  const cover: Mesh[] = [];
  const walkableSurfaces: Mesh[] = [];
  const decorativeMeshes: Mesh[] = [];
  const materials = createArenaMaterials(scene);

  const solid: SolidBuilder = (
    name,
    position,
    size,
    material,
    options = {},
  ) => {
    const mesh = MeshBuilder.CreateBox(
      name,
      {
        width: size[0],
        height: size[1],
        depth: size[2],
      },
      scene,
    );
    mesh.position.copyFrom(position);
    mesh.material = material;
    mesh.checkCollisions = true;
    mesh.isPickable = true;
    mesh.receiveShadows = true;
    mesh.metadata = {
      bulletMaterial: options.bulletMaterial ?? "concrete",
      collisionCategory: "solid-cover",
      collisionShape: "box",
      physicsCategory: "solid",
      supportsGrounding: true,
      surfaceType: options.surfaceType,
    };
    cover.push(mesh);
    return mesh;
  };

  const decoration: DecorationBuilder = (
    name,
    position,
    size,
    material,
  ) => {
    const mesh = MeshBuilder.CreateBox(
      name,
      {
        width: size[0],
        height: size[1],
        depth: size[2],
      },
      scene,
    );
    mesh.position.copyFrom(position);
    mesh.material = material;
    mesh.isPickable = false;
    mesh.receiveShadows = true;
    mesh.metadata = {
      physicsCategory: "decoration",
    };
    decorativeMeshes.push(mesh);
    return mesh;
  };

  const ground = MeshBuilder.CreateGround(
    "compact lockdown yard",
    {
      width: DISTRICT_DIMENSIONS.width,
      height: DISTRICT_DIMENSIONS.depth,
      subdivisions: 4,
    },
    scene,
  );
  ground.material = materials.asphalt;
  ground.checkCollisions = true;
  ground.isPickable = true;
  ground.receiveShadows = true;
  ground.metadata = {
    physicsCategory: "walkable-surface",
    surfaceType: "asphalt" satisfies SurfaceType,
  };
  walkableSurfaces.push(ground);

  createSky(scene, decorativeMeshes);
  createPerimeter(solid, materials);
  createCargoCombatArea(solid, decoration, materials);
  createElevatedCombatArea(
    scene,
    solid,
    cover,
    walkableSurfaces,
    materials,
  );
  createSafeZone(scene, solid, decoration, materials);
  freezeStaticEnvironment(scene);

  return {
    cover,
    walkableSurfaces,
    decorativeMeshes,
    pushableProps: [],
    playerSpawn: pointToVector(COMPACT_MAP_LAYOUT.playerSpawn),
    botSpawns: COMPACT_MAP_LAYOUT.botSpawns.map(pointToVector),
    resourcePoints: [
      new Vector3(-13, 1, 0),
      new Vector3(-6, 1, 6),
      new Vector3(1, 1, -8),
      new Vector3(8, 3.7, 5),
      new Vector3(8, 3.7, 13),
      new Vector3(14, 1, 0),
    ],
  };
}

function createPerimeter(
  solid: SolidBuilder,
  materials: ArenaMaterials,
) {
  const halfSize = DISTRICT_SIZE / 2;
  const wallOffset = halfSize - 0.55;
  const wallThickness = 1.1;
  const wallHeight = 4.2;

  solid(
    "north concrete perimeter",
    new Vector3(0, wallHeight / 2, wallOffset),
    [DISTRICT_SIZE, wallHeight, wallThickness],
    materials.darkConcrete,
  );
  solid(
    "south concrete perimeter",
    new Vector3(0, wallHeight / 2, -wallOffset),
    [DISTRICT_SIZE, wallHeight, wallThickness],
    materials.darkConcrete,
  );
  solid(
    "west concrete perimeter",
    new Vector3(-wallOffset, wallHeight / 2, 0),
    [wallThickness, wallHeight, DISTRICT_SIZE],
    materials.darkConcrete,
  );
  solid(
    "east concrete perimeter",
    new Vector3(wallOffset, wallHeight / 2, 0),
    [wallThickness, wallHeight, DISTRICT_SIZE],
    materials.darkConcrete,
  );
}

function createCargoCombatArea(
  solid: SolidBuilder,
  decoration: DecorationBuilder,
  materials: ArenaMaterials,
) {
  const containerMaterials = [
    materials.containerBlue,
    materials.containerRed,
    materials.containerOlive,
  ];

  COMPACT_MAP_LAYOUT.cargoContainers.forEach((container, index) => {
    createContainer(
      solid,
      decoration,
      materials,
      `${container.id} shipping container`,
      new Vector3(container.x, 1.3, container.z),
      container.rotation,
      containerMaterials[index % containerMaterials.length],
    );

    if (container.stacked) {
      createContainer(
        solid,
        decoration,
        materials,
        `${container.id} upper shipping container`,
        new Vector3(container.x, 3.9, container.z),
        container.rotation,
        containerMaterials[(index + 1) % containerMaterials.length],
      );
    }
  });

  [
    {
      name: "cargo south waist cover",
      position: new Vector3(-10.5, 0.65, -10.5),
      rotation: Math.PI / 2,
    },
    {
      name: "cargo central waist cover",
      position: new Vector3(-7.5, 0.65, 3.5),
      rotation: 0,
    },
    {
      name: "cargo north waist cover",
      position: new Vector3(-14, 0.65, 13),
      rotation: Math.PI / 2,
    },
  ].forEach((barrier) => {
    const mesh = solid(
      barrier.name,
      barrier.position,
      [3.2, 1.3, 0.65],
      materials.concrete,
    );
    mesh.rotation.y = barrier.rotation;
  });
}

function createContainer(
  solid: SolidBuilder,
  decoration: DecorationBuilder,
  materials: ArenaMaterials,
  name: string,
  position: Vector3,
  rotation: number,
  containerMaterial: PBRMaterial,
) {
  const width = 6.2;
  const height = 2.6;
  const depth = 2.5;
  const container = solid(
    name,
    position,
    [width, height, depth],
    containerMaterial,
    {
      bulletMaterial: "metal",
      surfaceType: "metal",
    },
  );
  container.rotation.y = rotation;

  const placeFrame = (
    suffix: string,
    offset: Vector3,
    size: [number, number, number],
  ) => {
    const frame = decoration(
      `${name} ${suffix}`,
      position.add(rotateHorizontalOffset(offset, rotation)),
      size,
      materials.containerFrame,
    );
    frame.rotation.y = rotation;
  };
  const edge = 0.13;

  for (const x of [-width / 2, width / 2]) {
    for (const z of [-depth / 2, depth / 2]) {
      placeFrame(
        `corner frame ${x}-${z}`,
        new Vector3(x, 0, z),
        [edge, height + edge, edge],
      );
    }
  }

  for (const y of [-height / 2, height / 2]) {
    for (const z of [-depth / 2, depth / 2]) {
      placeFrame(
        `long border ${y}-${z}`,
        new Vector3(0, y, z),
        [width + edge, edge, edge],
      );
    }
    for (const x of [-width / 2, width / 2]) {
      placeFrame(
        `end border ${y}-${x}`,
        new Vector3(x, y, 0),
        [edge, edge, depth + edge],
      );
    }
  }

  for (const x of [-width / 2 + 0.35, width / 2 - 0.35]) {
    placeFrame(
      `door upright ${x}`,
      new Vector3(x, 0, depth / 2 + 0.02),
      [0.08, height - 0.2, 0.08],
    );
  }
}

function createElevatedCombatArea(
  scene: Scene,
  solid: SolidBuilder,
  cover: Mesh[],
  walkableSurfaces: Mesh[],
  materials: ArenaMaterials,
) {
  const [southTower, northTower] = COMPACT_MAP_LAYOUT.elevatedPlatforms;

  for (const tower of COMPACT_MAP_LAYOUT.elevatedPlatforms) {
    const deck = solid(
      `${tower.id} raised deck`,
      new Vector3(tower.center.x, tower.center.y, tower.center.z),
      [tower.width, 0.45, tower.depth],
      materials.steel,
      {
        bulletMaterial: "metal",
        surfaceType: "metal",
      },
    );
    walkableSurfaces.push(deck);

    for (const x of [-1, 1]) {
      for (const z of [-1, 1]) {
        solid(
          `${tower.id} support ${x}-${z}`,
          new Vector3(
            tower.center.x + x * (tower.width / 2 - 0.45),
            tower.center.y / 2,
            tower.center.z + z * (tower.depth / 2 - 0.45),
          ),
          [0.42, tower.center.y, 0.42],
          materials.rustedSteel,
          { bulletMaterial: "metal" },
        );
      }
    }
  }

  createRamp(
    scene,
    cover,
    walkableSurfaces,
    materials,
    "south tower broad ramp",
    new Vector3(8, 0.2, -2.5),
    new Vector3(
      southTower.center.x,
      southTower.center.y,
      southTower.center.z - southTower.depth / 2,
    ),
  );
  createRamp(
    scene,
    cover,
    walkableSurfaces,
    materials,
    "north tower east ramp",
    new Vector3(16.5, 0.2, 13),
    new Vector3(
      northTower.center.x + northTower.width / 2,
      northTower.center.y,
      northTower.center.z,
    ),
  );
  createBridge(
    scene,
    cover,
    walkableSurfaces,
    materials,
    "connected tower bridge",
    new Vector3(
      southTower.center.x,
      southTower.center.y,
      southTower.center.z + southTower.depth / 2,
    ),
    new Vector3(
      northTower.center.x,
      northTower.center.y,
      northTower.center.z - northTower.depth / 2,
    ),
  );

  createTowerRailings(solid, materials);

  [
    {
      name: "tower approach cover south",
      position: new Vector3(14, 0.8, -4),
      size: [2.4, 1.6, 1.2] as [number, number, number],
    },
    {
      name: "tower approach cover east",
      position: new Vector3(15, 0.8, 5),
      size: [1.2, 1.6, 2.8] as [number, number, number],
    },
  ].forEach((coverDefinition) => {
    solid(
      coverDefinition.name,
      coverDefinition.position,
      coverDefinition.size,
      materials.darkConcrete,
    );
  });
}

function createRamp(
  scene: Scene,
  cover: Mesh[],
  walkableSurfaces: Mesh[],
  materials: ArenaMaterials,
  name: string,
  lower: Vector3,
  upper: Vector3,
) {
  const difference = upper.subtract(lower);
  const horizontalLength = Math.hypot(difference.x, difference.z);
  const length = Math.hypot(horizontalLength, difference.y);
  const ramp = MeshBuilder.CreateBox(
    name,
    {
      width: 3,
      height: 0.36,
      depth: length,
    },
    scene,
  );
  ramp.position.copyFrom(lower.add(upper).scale(0.5));
  ramp.rotation.set(
    -Math.atan2(difference.y, horizontalLength),
    Math.atan2(difference.x, difference.z),
    0,
  );
  configureWalkableMetal(ramp, materials.steel);
  cover.push(ramp);
  walkableSurfaces.push(ramp);
}

function createBridge(
  scene: Scene,
  cover: Mesh[],
  walkableSurfaces: Mesh[],
  materials: ArenaMaterials,
  name: string,
  start: Vector3,
  end: Vector3,
) {
  const difference = end.subtract(start);
  const bridge = MeshBuilder.CreateBox(
    name,
    {
      width: 3,
      height: 0.36,
      depth: Math.hypot(difference.x, difference.z),
    },
    scene,
  );
  bridge.position.copyFrom(start.add(end).scale(0.5));
  bridge.rotation.y = Math.atan2(difference.x, difference.z);
  configureWalkableMetal(bridge, materials.steel);
  cover.push(bridge);
  walkableSurfaces.push(bridge);
}

function configureWalkableMetal(mesh: Mesh, material: PBRMaterial) {
  mesh.material = material;
  mesh.checkCollisions = true;
  mesh.isPickable = true;
  mesh.receiveShadows = true;
  mesh.metadata = {
    bulletMaterial: "metal" satisfies BulletMaterial,
    collisionCategory: "solid-cover",
    collisionShape: "ramp-or-bridge",
    physicsCategory: "solid",
    supportsGrounding: true,
    surfaceType: "metal" satisfies SurfaceType,
  };
}

function createTowerRailings(
  solid: SolidBuilder,
  materials: ArenaMaterials,
) {
  const railings = [
    ["south tower west rail", 4.6, 5, 0.16, 5.8],
    ["south tower east rail", 11.4, 5, 0.16, 5.8],
    ["south tower south left rail", 5.5, 1.6, 2.2, 0.16],
    ["south tower south right rail", 10.5, 1.6, 2.2, 0.16],
    ["north tower west rail", 4.6, 13, 0.16, 4.2],
    ["north tower north rail", 8, 15.4, 6.8, 0.16],
    ["north tower south left rail", 5.5, 10.6, 2.2, 0.16],
    ["north tower south right rail", 10.5, 10.6, 2.2, 0.16],
  ] as const;

  railings.forEach(([name, x, z, width, depth]) => {
    solid(
      name,
      new Vector3(x, 3.75, z),
      [width, 1.05, depth],
      materials.rustedSteel,
      { bulletMaterial: "metal" },
    );
  });
}

function createSafeZone(
  scene: Scene,
  solid: SolidBuilder,
  decoration: DecorationBuilder,
  materials: ArenaMaterials,
) {
  const zone = SAFE_ZONES[0];
  const floorMaterial = new StandardMaterial("safe zone floor", scene);
  floorMaterial.diffuseColor = new Color3(0.03, 0.35, 0.29);
  floorMaterial.emissiveColor = new Color3(0.01, 0.16, 0.13);
  floorMaterial.alpha = 0.72;

  decoration(
    `${zone.id} safe zone floor`,
    new Vector3(zone.center.x, 0.035, zone.center.z),
    [zone.size, 0.04, zone.size],
    floorMaterial,
  );

  const borderMaterial = new StandardMaterial("safe zone border", scene);
  borderMaterial.diffuseColor = new Color3(0.2, 0.95, 0.72);
  borderMaterial.emissiveColor = new Color3(0.08, 0.5, 0.36);
  const halfSize = zone.size / 2;
  [
    [0, -halfSize, zone.size, 0.08],
    [0, halfSize, zone.size, 0.08],
    [-halfSize, 0, 0.08, zone.size],
    [halfSize, 0, 0.08, zone.size],
  ].forEach(([offsetX, offsetZ, width, depth], index) => {
    decoration(
      `safe zone border ${index}`,
      new Vector3(
        zone.center.x + offsetX,
        0.06,
        zone.center.z + offsetZ,
      ),
      [width, 0.05, depth],
      borderMaterial,
    );
  });

  const shop = solid(
    "field upgrade shop",
    new Vector3(zone.center.x, 0.75, zone.center.z - 0.3),
    [2.3, 1.5, 1.8],
    materials.darkConcrete,
    { bulletMaterial: "metal" },
  );
  shop.metadata = {
    ...shop.metadata,
    safeZoneId: zone.id,
    shopPlaceholder: true,
  };

  const sign = createShopSign(
    scene,
    decoration,
    new Vector3(zone.center.x, 1.05, zone.center.z + 0.62),
  );
  sign.rotation.y = Math.PI;
}

function createShopSign(
  scene: Scene,
  decoration: DecorationBuilder,
  position: Vector3,
) {
  const texture = new DynamicTexture(
    "field shop sign texture",
    { width: 512, height: 192 },
    scene,
    false,
  );
  const context = texture.getContext();
  context.fillStyle = "#071715";
  context.fillRect(0, 0, 512, 192);
  context.strokeStyle = "#48f5c5";
  context.lineWidth = 12;
  context.strokeRect(8, 8, 496, 176);
  context.fillStyle = "#b8ffe9";
  context.font = "bold 88px Arial";
  context.fillText("SHOP", 112, 126);
  texture.update();

  const material = new StandardMaterial("field shop sign material", scene);
  material.diffuseTexture = texture;
  material.emissiveColor = new Color3(0.08, 0.55, 0.42);
  return decoration(
    "field SHOP label",
    position,
    [2.05, 0.76, 0.05],
    material,
  );
}

function rotateHorizontalOffset(offset: Vector3, rotation: number) {
  return new Vector3(
    offset.x * Math.cos(rotation) + offset.z * Math.sin(rotation),
    offset.y,
    offset.z * Math.cos(rotation) - offset.x * Math.sin(rotation),
  );
}

function pointToVector(point: { x: number; y: number; z: number }) {
  return new Vector3(point.x, point.y, point.z);
}

function createSky(scene: Scene, decorativeMeshes: Mesh[]) {
  const sky = MeshBuilder.CreateSphere(
    "overcast compact yard sky",
    {
      diameter: 180,
      segments: 20,
    },
    scene,
  );
  const material = new StandardMaterial("overcast sky material", scene);
  material.backFaceCulling = false;
  material.emissiveColor = new Color3(0.13, 0.19, 0.21);
  material.diffuseColor = new Color3(0.08, 0.12, 0.14);
  sky.material = material;
  sky.isPickable = false;
  sky.metadata = {
    physicsCategory: "decoration",
  };
  decorativeMeshes.push(sky);
}

function freezeStaticEnvironment(scene: Scene) {
  scene.meshes.forEach((mesh) => mesh.freezeWorldMatrix());
  scene.materials.forEach((material) => material.freeze());
}

function createArenaMaterials(scene: Scene) {
  const asphalt = material(
    scene,
    "rain dark asphalt",
    new Color3(0.15, 0.17, 0.17),
    "asphalt",
  );
  const concrete = material(
    scene,
    "weathered grey concrete",
    new Color3(0.52, 0.51, 0.47),
    "concrete",
  );
  const darkConcrete = material(
    scene,
    "damp dark concrete",
    new Color3(0.3, 0.33, 0.32),
    "concrete",
  );
  const steel = material(
    scene,
    "dark structural metal",
    new Color3(0.2, 0.28, 0.3),
    "steel",
  );
  const rustedSteel = material(
    scene,
    "warm rusted steel",
    new Color3(0.36, 0.2, 0.12),
    "steel",
  );
  const containerBlue = containerMaterial(
    scene,
    "faded blue container paint",
    new Color3(0.18, 0.39, 0.58),
  );
  const containerRed = containerMaterial(
    scene,
    "oxide red container paint",
    new Color3(0.58, 0.2, 0.14),
  );
  const containerOlive = containerMaterial(
    scene,
    "muted olive industrial paint",
    new Color3(0.38, 0.46, 0.28),
  );
  const containerFrame = material(
    scene,
    "worn container edge steel",
    new Color3(0.12, 0.14, 0.13),
    "steel",
  );

  return {
    asphalt,
    concrete,
    darkConcrete,
    steel,
    rustedSteel,
    containerBlue,
    containerRed,
    containerOlive,
    containerFrame,
  };
}

function containerMaterial(
  scene: Scene,
  name: string,
  color: Color3,
) {
  const result = new PBRMaterial(name, scene);
  const texture = new Texture(
    "/assets/container-corrugated-weathered.png",
    scene,
    true,
    false,
  );
  texture.wrapU = Texture.WRAP_ADDRESSMODE;
  texture.wrapV = Texture.WRAP_ADDRESSMODE;
  texture.uScale = 1.4;
  texture.vScale = 1;
  result.albedoColor = color;
  result.albedoTexture = texture;
  result.metallic = 0.32;
  result.roughness = 0.72;
  result.environmentIntensity = 0.42;
  return result;
}

function material(
  scene: Scene,
  name: string,
  color: Color3,
  surface: "asphalt" | "concrete" | "steel",
) {
  const result = new PBRMaterial(name, scene);
  result.albedoColor = color;
  result.metallic = surface === "steel" ? 0.68 : 0.04;
  result.roughness = surface === "steel"
    ? 0.46
    : surface === "asphalt"
      ? 0.82
      : 0.74;
  result.environmentIntensity = 0.38;

  if (surface === "asphalt" || surface === "concrete") {
    const texture = new Texture(
      "/assets/industrial-ground-generated.png",
      scene,
      true,
      false,
    );
    texture.uScale = surface === "asphalt" ? 7 : 3;
    texture.vScale = surface === "asphalt" ? 7 : 3;
    result.albedoTexture = texture;
  }

  return result;
}
