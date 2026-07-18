import {
  Color3,
  DynamicTexture,
  Mesh,
  MeshBuilder,
  PBRMaterial,
  PointLight,
  Scene,
  StandardMaterial,
  Texture,
  Vector3,
} from "@babylonjs/core";

export const DISTRICT_DIMENSIONS = {
  width: 60,
  depth: 60,
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
  const decorativeMeshes: Mesh[] = [];
  const walkableSurfaces: Mesh[] = [];
  const pushableProps: PushablePropDefinition[] = [];
  const materials = createArenaMaterials(scene);

  const solid: SolidBuilder = (name, position, size, material, options = {}) => {
    const mesh = MeshBuilder.CreateBox(name, {
      width: size[0],
      height: size[1],
      depth: size[2],
    }, scene);
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

  const decoration: DecorationBuilder = (name, position, size, material) => {
    const mesh = MeshBuilder.CreateBox(name, {
      width: size[0],
      height: size[1],
      depth: size[2],
    }, scene);
    mesh.position.copyFrom(position);
    mesh.material = material;
    mesh.isPickable = false;
    mesh.receiveShadows = true;
    mesh.metadata = { physicsCategory: "decoration" };
    decorativeMeshes.push(mesh);
    return mesh;
  };

  const ground = MeshBuilder.CreateGround("single industrial yard wet asphalt", {
    width: DISTRICT_DIMENSIONS.width,
    height: DISTRICT_DIMENSIONS.depth,
    subdivisions: 4,
  }, scene);
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
  createPerimeter(solid, decoration, materials);
  createArrivalLoadingArea(solid, decoration, pushableProps, materials);
  createContainerLanes(solid, decoration, materials);
  createWarehouse(
    scene,
    solid,
    decoration,
    walkableSurfaces,
    materials,
  );
  createGuardTower(solid, decoration, walkableSurfaces, materials);
  createCentralCatwalk(solid, decoration, walkableSurfaces, materials);
  createMaintenanceArea(
    scene,
    solid,
    decoration,
    cover,
    pushableProps,
    materials,
  );
  createLighting(scene, decoration, materials);
  freezeStaticEnvironment(scene);

  return {
    cover,
    walkableSurfaces,
    decorativeMeshes,
    pushableProps,
    playerSpawn: new Vector3(-24, 1.7, -24),
    botSpawns: [
      new Vector3(-18, 1.7, -15),
      new Vector3(-22, 1.7, 2),
      new Vector3(-14, 1.7, 11),
      new Vector3(-8, 1.7, -8),
      new Vector3(2, 1.7, -20),
      new Vector3(10, 1.7, -8),
      new Vector3(17, 1.7, -20),
      new Vector3(21, 1.7, 0),
      new Vector3(-7, 1.7, 20),
      new Vector3(20, 8.9, 20),
    ],
    resourcePoints: [
      new Vector3(-23, 1, -13),
      new Vector3(-15, 1, 7),
      new Vector3(1, 1, -18),
      new Vector3(9, 1, 8),
      new Vector3(-7, 6.4, 20),
      new Vector3(20, 8.1, 20),
    ],
  };
}

function createPerimeter(
  solid: SolidBuilder,
  decoration: DecorationBuilder,
  materials: ArenaMaterials,
) {
  const halfWidth = DISTRICT_DIMENSIONS.width / 2;
  const halfDepth = DISTRICT_DIMENSIONS.depth / 2;
  solid(
    "north visible concrete perimeter",
    new Vector3(0, 2.25, halfDepth - 0.6),
    [60, 4.5, 1.2],
    materials.darkConcrete,
  );
  solid(
    "south visible concrete perimeter",
    new Vector3(0, 2.25, -halfDepth + 0.6),
    [60, 4.5, 1.2],
    materials.darkConcrete,
  );
  solid(
    "west visible concrete perimeter",
    new Vector3(-halfWidth + 0.6, 2.25, 0),
    [1.2, 4.5, 60],
    materials.darkConcrete,
  );
  solid(
    "east visible concrete perimeter",
    new Vector3(halfWidth - 0.6, 2.25, 0),
    [1.2, 4.5, 60],
    materials.darkConcrete,
  );

  for (let x = -25; x <= 25; x += 5) {
    decoration(
      `north fence post ${x}`,
      new Vector3(x, 5.2, 28.9),
      [0.14, 2.1, 0.14],
      materials.steel,
    );
  }
  for (let z = -24; z <= 24; z += 6) {
    decoration(
      `east fence post ${z}`,
      new Vector3(28.9, 5.2, z),
      [0.14, 2.1, 0.14],
      materials.steel,
    );
  }
  createWarningSign(
    decoration,
    materials,
    "RAINLINE // RESTRICTED YARD",
    new Vector3(0, 3.1, -28.75),
    12,
    "south perimeter identity sign",
  );
}

function createArrivalLoadingArea(
  solid: SolidBuilder,
  decoration: DecorationBuilder,
  pushableProps: PushablePropDefinition[],
  materials: ArenaMaterials,
) {
  createSecurityBooth(
    solid,
    decoration,
    materials,
    new Vector3(-20.5, 1.5, -25.2),
  );
  createDamagedTruck(
    solid,
    decoration,
    materials,
    new Vector3(16, 1.25, -22),
  );
  createForklift(
    solid,
    decoration,
    materials,
    new Vector3(7, 0.75, -19),
    -0.18,
  );
  createPalletLoad(
    solid,
    decoration,
    materials,
    new Vector3(11, 0, -12),
    "loading palletized machinery",
  );
  createPalletLoad(
    solid,
    decoration,
    materials,
    new Vector3(20, 0, -10),
    "loading export crates",
  );
  createConcreteBarrier(
    solid,
    materials,
    new Vector3(-11, 0.65, -24),
    -0.08,
    "arrival concrete barrier west",
  );
  createConcreteBarrier(
    solid,
    materials,
    new Vector3(-3.5, 0.65, -24),
    0.08,
    "arrival concrete barrier east",
  );
  createHazardMarking(
    decoration,
    materials,
    new Vector3(6, 0.025, -24),
    [10, 0.04, 0.22],
    "loading bay yellow line",
  );

  [
    new Vector3(-17, 0.5, -22),
    new Vector3(-14.5, 0.5, -20.5),
    new Vector3(4, 0.5, -23),
    new Vector3(8, 0.5, -23),
  ].forEach((position, index) => {
    createPushableCone(
      sceneOf(materials),
      pushableProps,
      materials,
      position,
      `arrival traffic cone ${index}`,
    );
  });
}

function createContainerLanes(
  solid: SolidBuilder,
  decoration: DecorationBuilder,
  materials: ArenaMaterials,
) {
  const layouts: Array<{
    position: Vector3;
    rotation: number;
    material: PBRMaterial;
    stacked?: boolean;
    name: string;
  }> = [
    {
      position: new Vector3(-23, 1.3, -14),
      rotation: 0,
      material: materials.containerBlue,
      stacked: true,
      name: "west blue container stack",
    },
    {
      position: new Vector3(-21, 1.3, -4),
      rotation: Math.PI / 2,
      material: materials.containerRed,
      name: "west red cross container",
    },
    {
      position: new Vector3(-23, 1.3, 7),
      rotation: 0.05,
      material: materials.containerOlive,
      name: "northwest olive container",
    },
    {
      position: new Vector3(-12, 1.3, 8),
      rotation: Math.PI / 2,
      material: materials.containerBlue,
      name: "central blue cross container",
    },
    {
      position: new Vector3(-10, 1.3, -14),
      rotation: -0.04,
      material: materials.containerRed,
      name: "southwest red container",
    },
    {
      position: new Vector3(1, 1.3, -18),
      rotation: Math.PI / 2,
      material: materials.containerOlive,
      name: "south central olive container",
    },
    {
      position: new Vector3(8, 1.3, -10),
      rotation: 0,
      material: materials.containerBlue,
      stacked: true,
      name: "central blue container stack",
    },
    {
      position: new Vector3(17, 1.3, -4),
      rotation: Math.PI / 2,
      material: materials.containerRed,
      name: "east red cross container",
    },
  ];

  layouts.forEach((layout, index) => {
    createContainer(
      solid,
      decoration,
      materials,
      layout.position,
      layout.rotation,
      layout.material,
      layout.name,
      index,
    );
    if (layout.stacked) {
      createContainer(
        solid,
        decoration,
        materials,
        layout.position.add(new Vector3(0, 2.6, 0)),
        layout.rotation,
        layout.material,
        `${layout.name} upper`,
        index + layouts.length,
      );
    }
  });

  createConcreteBarrier(
    solid,
    materials,
    new Vector3(-15, 0.65, 12),
    Math.PI / 2,
    "container lane concrete corner",
  );
  createCrateCluster(
    solid,
    decoration,
    materials,
    new Vector3(-3, 0, -7),
    "central route crates",
  );
}

function createWarehouse(
  scene: Scene,
  solid: SolidBuilder,
  decoration: DecorationBuilder,
  walkableSurfaces: Mesh[],
  materials: ArenaMaterials,
) {
  const center = new Vector3(-6, 0, 20);
  const floor = MeshBuilder.CreateGround(
    "warehouse walkable floor",
    { width: 21.5, height: 13.5, subdivisions: 2 },
    scene,
  );
  floor.position.set(center.x, 0.02, center.z);
  floor.material = materials.concrete;
  floor.checkCollisions = true;
  floor.isPickable = true;
  floor.receiveShadows = true;
  floor.metadata = {
    physicsCategory: "walkable-surface",
    surfaceType: "indoor" satisfies SurfaceType,
  };
  walkableSurfaces.push(floor);

  solid(
    "warehouse west wall",
    new Vector3(-16.8, 2.3, 20),
    [0.55, 4.6, 14],
    materials.concrete,
  );
  solid(
    "warehouse east wall",
    new Vector3(4.8, 2.3, 20),
    [0.55, 4.6, 14],
    materials.concrete,
  );
  solid(
    "warehouse north wall",
    new Vector3(-6, 2.3, 26.8),
    [22, 4.6, 0.55],
    materials.concrete,
  );
  solid(
    "warehouse south wall west",
    new Vector3(-12.2, 2.3, 13.2),
    [9.2, 4.6, 0.55],
    materials.concrete,
  );
  solid(
    "warehouse south wall east",
    new Vector3(1.4, 2.3, 13.2),
    [6.8, 4.6, 0.55],
    materials.concrete,
  );

  const roof = solid(
    "accessible warehouse rooftop",
    new Vector3(-6, 4.8, 20),
    [22, 0.4, 14],
    materials.rustedSteel,
    { bulletMaterial: "metal", surfaceType: "metal" },
  );
  walkableSurfaces.push(roof);

  createStairFlight(
    solid,
    walkableSurfaces,
    materials,
    new Vector3(8, 0, 6.8),
    new Vector3(0, 0, 1),
    13,
    0.38,
    0.74,
    2.3,
    "warehouse rooftop stairs",
    5,
  );
  const roofBridge = solid(
    "warehouse rooftop stair landing",
    new Vector3(7.075, 4.82, 17.94),
    [4.15, 0.36, 3],
    materials.steel,
    { bulletMaterial: "metal", surfaceType: "metal" },
  );
  walkableSurfaces.push(roofBridge);
  createRailing(
    solid,
    materials,
    new Vector3(-16.5, 5.5, 20),
    [0.14, 1.25, 12.8],
    "warehouse roof west railing",
  );
  createRailing(
    solid,
    materials,
    new Vector3(-6, 5.5, 26.5),
    [20.8, 1.25, 0.14],
    "warehouse roof north railing",
  );

  createCrateCluster(
    solid,
    decoration,
    materials,
    new Vector3(-12.5, 0, 20),
    "warehouse stored crates",
  );
  createUtilityBox(
    solid,
    decoration,
    materials,
    new Vector3(1.8, 0, 23.4),
    "warehouse electrical cabinet",
  );
  createPalletLoad(
    solid,
    decoration,
    materials,
    new Vector3(-1.5, 0, 17),
    "warehouse receiving pallet",
  );
  createWarningSign(
    decoration,
    materials,
    "WAREHOUSE 04 // ROOF ACCESS",
    new Vector3(-6, 3.35, 12.88),
    8.5,
    "warehouse access sign",
  );
  createHazardMarking(
    decoration,
    materials,
    new Vector3(-5, 0.05, 14.1),
    [5.2, 0.04, 0.22],
    "warehouse threshold marking",
  );
}

function createGuardTower(
  solid: SolidBuilder,
  decoration: DecorationBuilder,
  walkableSurfaces: Mesh[],
  materials: ArenaMaterials,
) {
  const platformCenter = new Vector3(20, 7.05, 20);
  [
    new Vector3(18, 3.5, 18),
    new Vector3(22, 3.5, 18),
    new Vector3(18, 3.5, 22),
    new Vector3(22, 3.5, 22),
  ].forEach((position, index) => {
    solid(
      `guard tower support ${index}`,
      position,
      [0.55, 7, 0.55],
      materials.steel,
      { bulletMaterial: "metal" },
    );
  });

  const platform = solid(
    "accessible guard tower top platform",
    platformCenter,
    [6, 0.35, 6],
    materials.steel,
    { bulletMaterial: "metal", surfaceType: "metal" },
  );
  walkableSurfaces.push(platform);

  createStairFlight(
    solid,
    walkableSurfaces,
    materials,
    new Vector3(20, 0, 5.1),
    new Vector3(0, 0, 1),
    18,
    0.38,
    0.72,
    2.1,
    "guard tower metal stairs",
  );

  createRailing(
    solid,
    materials,
    new Vector3(17.2, 7.8, 20),
    [0.14, 1.35, 5.7],
    "guard tower west railing",
  );
  createRailing(
    solid,
    materials,
    new Vector3(22.8, 7.8, 20),
    [0.14, 1.35, 5.7],
    "guard tower east railing",
  );
  createRailing(
    solid,
    materials,
    new Vector3(20, 7.8, 22.8),
    [5.7, 1.35, 0.14],
    "guard tower north railing",
  );
  createRailing(
    solid,
    materials,
    new Vector3(18.3, 7.8, 17.2),
    [2.2, 1.35, 0.14],
    "guard tower south railing west",
  );
  createRailing(
    solid,
    materials,
    new Vector3(21.8, 7.8, 17.2),
    [2, 1.35, 0.14],
    "guard tower south railing east",
  );
  solid(
    "guard tower lookout roof",
    new Vector3(20, 10.3, 20),
    [6.6, 0.3, 6.6],
    materials.rustedSteel,
    { bulletMaterial: "metal", surfaceType: "metal" },
  );
  [
    new Vector3(17.5, 8.8, 17.5),
    new Vector3(22.5, 8.8, 17.5),
    new Vector3(17.5, 8.8, 22.5),
    new Vector3(22.5, 8.8, 22.5),
  ].forEach((position, index) => {
    solid(
      `guard tower canopy post ${index}`,
      position,
      [0.15, 3, 0.15],
      materials.steel,
      { bulletMaterial: "metal" },
    );
  });
  createWarningSign(
    decoration,
    materials,
    "TOWER // OVERWATCH",
    new Vector3(20, 9.1, 17.35),
    4.8,
    "guard tower sign",
  );
}

function createCentralCatwalk(
  solid: SolidBuilder,
  decoration: DecorationBuilder,
  walkableSurfaces: Mesh[],
  materials: ArenaMaterials,
) {
  const catwalk = solid(
    "central raised catwalk",
    new Vector3(0, 3.03, 1),
    [19, 0.34, 3],
    materials.steel,
    { bulletMaterial: "metal", surfaceType: "metal" },
  );
  walkableSurfaces.push(catwalk);

  [-7.5, 0, 7.5].forEach((x, index) => {
    solid(
      `central catwalk support ${index}`,
      new Vector3(x, 1.5, 1),
      [0.55, 3, 0.55],
      materials.darkConcrete,
    );
  });
  createStairFlight(
    solid,
    walkableSurfaces,
    materials,
    new Vector3(-16.4, 0, 1),
    new Vector3(1, 0, 0),
    9,
    0.355,
    0.74,
    2.2,
    "central catwalk west stairs",
  );
  createStairFlight(
    solid,
    walkableSurfaces,
    materials,
    new Vector3(16.4, 0, 1),
    new Vector3(-1, 0, 0),
    9,
    0.355,
    0.74,
    2.2,
    "central catwalk east stairs",
  );
  createRailing(
    solid,
    materials,
    new Vector3(0.7, 3.76, -0.42),
    [17.4, 1.2, 0.14],
    "central catwalk south railing",
  );
  createRailing(
    solid,
    materials,
    new Vector3(0.7, 3.76, 2.42),
    [17.4, 1.2, 0.14],
    "central catwalk north railing",
  );
}

function createMaintenanceArea(
  scene: Scene,
  solid: SolidBuilder,
  decoration: DecorationBuilder,
  cover: Mesh[],
  pushableProps: PushablePropDefinition[],
  materials: ArenaMaterials,
) {
  createGenerator(
    solid,
    decoration,
    materials,
    new Vector3(23, 0, 7),
    "east backup generator",
  );
  createDumpster(
    solid,
    decoration,
    materials,
    new Vector3(23, 0, -13),
    "east service dumpster",
  );
  createUtilityBox(
    solid,
    decoration,
    materials,
    new Vector3(13, 0, 8),
    "east transformer cabinet",
  );
  createCableReel(
    scene,
    solid,
    decoration,
    materials,
    new Vector3(14, 0, 15),
  );
  createBarrelGroup(scene, cover, materials, new Vector3(21, 0, -17));
  createSandbagWall(
    solid,
    materials,
    new Vector3(10, 0, 23),
    "north sandbag position",
  );
  createPipeRack(solid, decoration, materials, new Vector3(25, 0, 0));

  [
    new Vector3(16, 0.5, 10),
    new Vector3(18, 0.5, 11.2),
  ].forEach((position, index) => {
    createPushableCone(
      scene,
      pushableProps,
      materials,
      position,
      `maintenance traffic cone ${index}`,
    );
  });
}

function createContainer(
  solid: SolidBuilder,
  decoration: DecorationBuilder,
  materials: ArenaMaterials,
  position: Vector3,
  rotation: number,
  containerMaterial: PBRMaterial,
  name: string,
  index: number,
) {
  const placeDetail = (
    detailName: string,
    localPosition: Vector3,
    size: [number, number, number],
    material: PBRMaterial | StandardMaterial,
  ) => {
    const detail = decoration(
      detailName,
      position.add(rotateHorizontalOffset(localPosition, rotation)),
      size,
      material,
    );
    detail.rotation.y = rotation;
    return detail;
  };
  const container = solid(
    name,
    position,
    [8.2, 2.6, 2.5],
    containerMaterial,
    { bulletMaterial: "metal" },
  );
  container.rotation.y = rotation;

  [-1.29, 1.29].forEach((side, sideIndex) => {
    [-1.22, 1.22].forEach((height, railIndex) => {
      placeDetail(
        `${name} side frame ${index}-${sideIndex}-${railIndex}`,
        new Vector3(0, height, side),
        [8.28, 0.11, 0.11],
        materials.containerFrame,
      );
    });
  });

  [-4.08, 4.08].forEach((end, endIndex) => {
    [-1.28, 1.28].forEach((side, sideIndex) => {
      placeDetail(
        `${name} corner post ${index}-${endIndex}-${sideIndex}`,
        new Vector3(end, 0, side),
        [0.13, 2.52, 0.13],
        materials.containerFrame,
      );
    });

    [-1.22, 1.22].forEach((height, railIndex) => {
      placeDetail(
        `${name} end frame ${index}-${endIndex}-${railIndex}`,
        new Vector3(end, height, 0),
        [0.11, 0.11, 2.5],
        materials.containerFrame,
      );
    });
  });

  [-0.72, 0, 0.72].forEach((doorOffset, barIndex) => {
    placeDetail(
      `${name} locking bar ${index}-${barIndex}`,
      new Vector3(4.13, 0, doorOffset),
      [0.08, 2.05, 0.08],
      materials.containerFrame,
    );
  });
  placeDetail(
    `${name} door center seam ${index}`,
    new Vector3(4.135, 0, 0),
    [0.07, 0.08, 2.3],
    materials.containerFrame,
  );
  [-0.68, 0.68].forEach((doorOffset, plateIndex) => {
    placeDetail(
      `${name} identification plate ${index}-${plateIndex}`,
      new Vector3(4.175, -0.36, doorOffset),
      [0.04, 0.32, 0.42],
      materials.identificationPlate,
    );
  });
}

function createStairFlight(
  solid: SolidBuilder,
  walkableSurfaces: Mesh[],
  materials: ArenaMaterials,
  origin: Vector3,
  direction: Vector3,
  stepCount: number,
  stepHeight: number,
  stepDepth: number,
  width: number,
  name: string,
  finalStepTop?: number,
) {
  const normalizedDirection = direction.clone().normalize();
  const rotation = Math.atan2(normalizedDirection.x, normalizedDirection.z);
  for (let index = 0; index < stepCount; index += 1) {
    const height =
      index === stepCount - 1 && finalStepTop !== undefined
        ? finalStepTop
        : (index + 1) * stepHeight;
    const stepPosition = origin
      .add(normalizedDirection.scale((index + 0.5) * stepDepth))
      .add(new Vector3(0, height / 2, 0));
    const step = solid(
      `${name} ${index}`,
      stepPosition,
      [width, height, stepDepth + 0.04],
      materials.steel,
      { bulletMaterial: "metal", surfaceType: "metal" },
    );
    step.rotation.y = rotation;
    walkableSurfaces.push(step);
  }

  const sideOffset = new Vector3(
    normalizedDirection.z,
    0,
    -normalizedDirection.x,
  ).scale(width / 2 + 0.05);
  for (let stepIndex = 0; stepIndex < stepCount; stepIndex += 3) {
    const stepTop = (stepIndex + 1) * stepHeight;
    const postBase = origin
      .add(normalizedDirection.scale((stepIndex + 0.5) * stepDepth))
      .add(new Vector3(0, stepTop + 0.62, 0));
    [sideOffset, sideOffset.scale(-1)].forEach((offset, sideIndex) => {
      if (
        name === "guard tower metal stairs" &&
        stepIndex === 15 &&
        sideIndex === 1
      ) {
        return;
      }

      solid(
        `${name} railing post ${stepIndex}-${sideIndex}`,
        postBase.add(offset),
        [0.12, 1.24, 0.12],
        materials.steel,
        { bulletMaterial: "metal" },
      );
    });
  }

}

function createRailing(
  solid: SolidBuilder,
  materials: ArenaMaterials,
  position: Vector3,
  size: [number, number, number],
  name: string,
) {
  solid(name, position, size, materials.steel, { bulletMaterial: "metal" });
}

function createConcreteBarrier(
  solid: SolidBuilder,
  materials: ArenaMaterials,
  position: Vector3,
  rotation: number,
  name: string,
) {
  const barrier = solid(
    name,
    position,
    [4.4, 1.3, 0.75],
    materials.concrete,
  );
  barrier.rotation.y = rotation;
}

function createSecurityBooth(
  solid: SolidBuilder,
  decoration: DecorationBuilder,
  materials: ArenaMaterials,
  position: Vector3,
) {
  solid(
    "arrival security booth body",
    position,
    [4.3, 3, 4],
    materials.containerOlive,
    { bulletMaterial: "metal" },
  );
  solid(
    "arrival security booth roof",
    position.add(new Vector3(0, 1.7, 0)),
    [4.8, 0.28, 4.5],
    materials.rustedSteel,
    { bulletMaterial: "metal", surfaceType: "metal" },
  );
  decoration(
    "arrival security booth front window",
    position.add(new Vector3(0, 0.55, 2.03)),
    [2.8, 1.05, 0.06],
    materials.glass,
  );
  createWarningSign(
    decoration,
    materials,
    "SECURITY",
    position.add(new Vector3(0, 1.25, 2.08)),
    2.7,
    "arrival booth security sign",
  );
}

function createDamagedTruck(
  solid: SolidBuilder,
  decoration: DecorationBuilder,
  materials: ArenaMaterials,
  position: Vector3,
) {
  const cab = solid(
    "damaged loading truck cab",
    position,
    [3.2, 2.5, 3.8],
    materials.containerOlive,
    { bulletMaterial: "metal" },
  );
  cab.rotation.y = Math.PI / 2;
  const bed = solid(
    "damaged loading truck cargo bed",
    position.add(new Vector3(-4.1, -0.15, 0)),
    [4.8, 1.8, 3.4],
    materials.rustedSteel,
    { bulletMaterial: "metal" },
  );
  bed.rotation.y = Math.PI / 2;
  decoration(
    "damaged loading truck windshield",
    position.add(new Vector3(1.93, 0.55, 0)),
    [0.06, 0.9, 2.3],
    materials.glass,
  );
}

function createForklift(
  solid: SolidBuilder,
  decoration: DecorationBuilder,
  materials: ArenaMaterials,
  position: Vector3,
  rotation: number,
) {
  const positionedFromBody = (offset: Vector3) => (
    position.add(rotateHorizontalOffset(offset, rotation))
  );
  const body = solid(
    "loading forklift solid body",
    position,
    [2.4, 1.5, 3.2],
    materials.safety,
    { bulletMaterial: "metal" },
  );
  const mast = solid(
    "loading forklift solid mast",
    positionedFromBody(new Vector3(0, 1.55, 1.25)),
    [1.7, 3.1, 0.3],
    materials.steel,
    { bulletMaterial: "metal" },
  );
  const forks = solid(
    "loading forklift solid forks",
    positionedFromBody(new Vector3(0, -0.58, 2.15)),
    [1.7, 0.16, 1.7],
    materials.steel,
    { bulletMaterial: "metal" },
  );
  body.rotation.y = rotation;
  mast.rotation.y = rotation;
  forks.rotation.y = rotation;
  decoration(
    "loading forklift beacon mount",
    positionedFromBody(new Vector3(-0.78, 0.84, -0.72)),
    [0.18, 0.22, 0.18],
    materials.steel,
  ).rotation.y = rotation;
  decoration(
    "loading forklift mounted warning beacon",
    positionedFromBody(new Vector3(-0.78, 1.01, -0.72)),
    [0.24, 0.12, 0.24],
    materials.glow,
  ).rotation.y = rotation;
}

function createPalletLoad(
  solid: SolidBuilder,
  decoration: DecorationBuilder,
  materials: ArenaMaterials,
  position: Vector3,
  name: string,
) {
  decoration(
    `${name} grounded pallet`,
    position.add(new Vector3(0, 0.1, 0)),
    [3.3, 0.2, 2.5],
    materials.wood,
  );
  solid(
    `${name} solid cargo`,
    position.add(new Vector3(0, 1, 0)),
    [3, 1.8, 2.2],
    materials.wood,
    { bulletMaterial: "wood" },
  );
  decoration(
    `${name} yellow strap`,
    position.add(new Vector3(0, 1, -1.12)),
    [0.22, 1.6, 0.04],
    materials.safety,
  );
}

function createCrateCluster(
  solid: SolidBuilder,
  decoration: DecorationBuilder,
  materials: ArenaMaterials,
  position: Vector3,
  name: string,
) {
  const crates: Array<[Vector3, [number, number, number]]> = [
    [new Vector3(0, 0.75, 0), [2.2, 1.5, 2]],
    [new Vector3(2.1, 0.6, 0.4), [1.7, 1.2, 1.7]],
    [new Vector3(0.3, 2, 0.1), [1.6, 1, 1.5]],
  ];
  crates.forEach(([offset, size], index) => {
    solid(
      `${name} ${index}`,
      position.add(offset),
      size,
      materials.wood,
      { bulletMaterial: "wood" },
    );
    decoration(
      `${name} label ${index}`,
      position.add(offset).add(new Vector3(0, 0, size[2] / 2 + 0.025)),
      [size[0] * 0.55, size[1] * 0.35, 0.04],
      materials.identificationPlate,
    );
  });
}

function createUtilityBox(
  solid: SolidBuilder,
  decoration: DecorationBuilder,
  materials: ArenaMaterials,
  position: Vector3,
  name: string,
) {
  solid(
    `${name} solid housing`,
    position.add(new Vector3(0, 1.2, 0)),
    [2.2, 2.4, 1.2],
    materials.containerOlive,
    { bulletMaterial: "metal" },
  );
  decoration(
    `${name} warning plate`,
    position.add(new Vector3(0, 1.35, 0.63)),
    [0.8, 0.65, 0.04],
    materials.safety,
  );
}

function createGenerator(
  solid: SolidBuilder,
  decoration: DecorationBuilder,
  materials: ArenaMaterials,
  position: Vector3,
  name: string,
) {
  solid(
    `${name} solid body`,
    position.add(new Vector3(0, 0.8, 0)),
    [4, 1.6, 2.2],
    materials.containerOlive,
    { bulletMaterial: "metal" },
  );
  decoration(
    `${name} top grille`,
    position.add(new Vector3(0, 1.63, 0)),
    [2.7, 0.05, 1.3],
    materials.steel,
  );
  decoration(
    `${name} control panel housing`,
    position.add(new Vector3(2.03, 0.9, 0)),
    [0.05, 0.8, 1.1],
    materials.steel,
  );
  decoration(
    `${name} mounted indicator lens`,
    position.add(new Vector3(2.065, 1.05, 0)),
    [0.035, 0.14, 0.34],
    materials.glow,
  );
}

function createDumpster(
  solid: SolidBuilder,
  decoration: DecorationBuilder,
  materials: ArenaMaterials,
  position: Vector3,
  name: string,
) {
  solid(
    `${name} solid body`,
    position.add(new Vector3(0, 0.8, 0)),
    [4, 1.6, 2.4],
    materials.containerBlue,
    { bulletMaterial: "metal" },
  );
  const lid = solid(
    `${name} lid`,
    position.add(new Vector3(0, 1.72, 0)),
    [4.1, 0.16, 2.5],
    materials.rustedSteel,
    { bulletMaterial: "metal", surfaceType: "metal" },
  );
  lid.rotation.z = -0.08;
}

function createCableReel(
  scene: Scene,
  solid: SolidBuilder,
  decoration: DecorationBuilder,
  materials: ArenaMaterials,
  position: Vector3,
) {
  solid(
    "maintenance cable reel solid core",
    position.add(new Vector3(0, 0.9, 0)),
    [1.1, 1.8, 1.1],
    materials.wood,
    { bulletMaterial: "wood" },
  );
  [-0.72, 0.72].forEach((x, index) => {
    const side = MeshBuilder.CreateCylinder(
      `maintenance cable reel side ${index}`,
      { height: 0.16, diameter: 2.4, tessellation: 16 },
      scene,
    );
    side.position.copyFrom(position.add(new Vector3(x, 0.9, 0)));
    side.rotation.z = Math.PI / 2;
    side.material = materials.wood;
    side.isPickable = false;
    side.metadata = { physicsCategory: "decoration" };
    decoration(
      `maintenance cable reel brace ${index}`,
      position.add(new Vector3(x, 0.35, 0)),
      [0.2, 0.7, 1.8],
      materials.wood,
    );
  });
}

function createBarrelGroup(
  scene: Scene,
  cover: Mesh[],
  materials: ArenaMaterials,
  origin: Vector3,
) {
  [
    new Vector3(0, 0, 0),
    new Vector3(1.3, 0, 0.2),
    new Vector3(0.6, 0, 1.2),
  ].forEach((offset, index) => {
    const position = origin.add(offset);
    const barrel = MeshBuilder.CreateCylinder(
      `solid maintenance barrel ${index}`,
      { height: 1.5, diameter: 0.9, tessellation: 16 },
      scene,
    );
    barrel.position.copyFrom(position.add(new Vector3(0, 0.75, 0)));
    barrel.material = index === 1
      ? materials.containerRed
      : materials.containerOlive;
    barrel.checkCollisions = true;
    barrel.isPickable = true;
    barrel.receiveShadows = true;
    barrel.metadata = {
      bulletMaterial: "metal" satisfies BulletMaterial,
      collisionCategory: "solid-cover",
      collisionShape: "cylinder",
      physicsCategory: "solid",
      supportsGrounding: true,
    };
    cover.push(barrel);
  });
}

function createSandbagWall(
  solid: SolidBuilder,
  materials: ArenaMaterials,
  origin: Vector3,
  name: string,
) {
  for (let row = 0; row < 2; row += 1) {
    for (let column = 0; column < 4 - row; column += 1) {
      solid(
        `${name} ${row}-${column}`,
        origin.add(new Vector3(
          column * 1.3 + row * 0.65,
          0.32 + row * 0.58,
          0,
        )),
        [1.2, 0.58, 0.72],
        materials.sandbag,
        { bulletMaterial: "concrete" },
      );
    }
  }
}

function createPipeRack(
  solid: SolidBuilder,
  decoration: DecorationBuilder,
  materials: ArenaMaterials,
  origin: Vector3,
) {
  solid(
    "east pipe rack support south",
    origin.add(new Vector3(0, 1.8, -3)),
    [0.5, 3.6, 0.5],
    materials.steel,
    { bulletMaterial: "metal" },
  );
  solid(
    "east pipe rack support north",
    origin.add(new Vector3(0, 1.8, 3)),
    [0.5, 3.6, 0.5],
    materials.steel,
    { bulletMaterial: "metal" },
  );
  [-0.45, 0.45].forEach((x, index) => {
    decoration(
      `east elevated service pipe ${index}`,
      origin.add(new Vector3(x, 3.1, 0)),
      [0.32, 0.32, 6.5],
      index === 0 ? materials.containerRed : materials.steel,
    );
  });
}

function createHazardMarking(
  decoration: DecorationBuilder,
  materials: ArenaMaterials,
  position: Vector3,
  size: [number, number, number],
  name: string,
) {
  decoration(name, position, size, materials.safety);
}

function createPushableCone(
  scene: Scene,
  pushableProps: PushablePropDefinition[],
  materials: ArenaMaterials,
  position: Vector3,
  name: string,
) {
  const cone = MeshBuilder.CreateCylinder(name, {
    height: 1,
    diameterTop: 0.08,
    diameterBottom: 0.62,
    tessellation: 12,
  }, scene);
  cone.position.copyFrom(position);
  cone.material = materials.safety;
  cone.isPickable = true;
  cone.receiveShadows = true;
  cone.metadata = {
    bulletMaterial: "metal" satisfies BulletMaterial,
    physicsCategory: "pushable",
    propKind: "cone",
  };
  pushableProps.push({
    mesh: cone,
    radius: 0.42,
    halfHeight: 0.5,
    mass: 0.65,
  });
}

function createWarningSign(
  decoration: DecorationBuilder,
  materials: ArenaMaterials,
  text: string,
  position: Vector3,
  width: number,
  name: string,
) {
  const texture = new DynamicTexture(
    `${name} texture`,
    { width: 1024, height: 128 },
    sceneOf(materials),
    false,
  );
  const context = texture.getContext();
  context.fillStyle = "#111719";
  context.fillRect(0, 0, 1024, 128);
  context.fillStyle = "#e6b74f";
  context.font = "bold 44px Arial";
  context.fillText(text, 64, 82);
  texture.update();
  const signMaterial = new StandardMaterial(`${name} material`, sceneOf(materials));
  signMaterial.diffuseTexture = texture;
  signMaterial.emissiveColor = new Color3(0.13, 0.09, 0.02);
  decoration(name, position, [width, 0.9, 0.08], signMaterial);
}

function createLighting(
  scene: Scene,
  decoration: DecorationBuilder,
  materials: ArenaMaterials,
) {
  const fixtures: Array<{
    color: Color3;
    intensity: number;
    mountBottom: number;
    position: Vector3;
  }> = [
    {
      color: new Color3(1, 0.46, 0.16),
      intensity: 0.8,
      mountBottom: 3.4,
      position: new Vector3(-18, 4.35, -28.65),
    },
    {
      color: new Color3(0.4, 0.62, 0.74),
      intensity: 0.72,
      mountBottom: 0,
      position: new Vector3(-15, 5.4, 8),
    },
    {
      color: new Color3(1, 0.42, 0.12),
      intensity: 0.82,
      mountBottom: 4.6,
      position: new Vector3(-6, 6.2, 13.05),
    },
    {
      color: new Color3(0.42, 0.65, 0.78),
      intensity: 0.72,
      mountBottom: 7.2,
      position: new Vector3(21, 9.95, 20),
    },
    {
      color: new Color3(1, 0.45, 0.14),
      intensity: 0.76,
      mountBottom: 0,
      position: new Vector3(23, 5.1, -9),
    },
  ];

  fixtures.forEach((fixture, index) => {
    const mountHeight = fixture.position.y - fixture.mountBottom;
    decoration(
      `industrial light support ${index}`,
      new Vector3(
        fixture.position.x,
        fixture.mountBottom + mountHeight / 2,
        fixture.position.z,
      ),
      [0.14, mountHeight, 0.14],
      materials.steel,
    );
    decoration(
      `industrial light housing ${index}`,
      fixture.position,
      [0.78, 0.18, 0.58],
      materials.steel,
    );
    decoration(
      `industrial light lens ${index}`,
      fixture.position.add(new Vector3(0, -0.11, 0)),
      [0.5, 0.04, 0.34],
      materials.glow,
    );
    const light = new PointLight(
      `industrial light ${index}`,
      fixture.position.add(new Vector3(0, -0.2, 0)),
      scene,
    );
    light.diffuse = fixture.color;
    light.intensity = fixture.intensity;
    light.range = 14;
  });
}

function rotateHorizontalOffset(offset: Vector3, rotation: number) {
  return new Vector3(
    offset.x * Math.cos(rotation) + offset.z * Math.sin(rotation),
    offset.y,
    offset.z * Math.cos(rotation) - offset.x * Math.sin(rotation),
  );
}

function createSky(scene: Scene, decorativeMeshes: Mesh[]) {
  const sky = MeshBuilder.CreateSphere(
    "overcast industrial yard sky",
    { diameter: 260, segments: 20 },
    scene,
  );
  const material = new StandardMaterial("overcast sky material", scene);
  material.backFaceCulling = false;
  material.emissiveColor = new Color3(0.13, 0.19, 0.21);
  material.diffuseColor = new Color3(0.08, 0.12, 0.14);
  sky.material = material;
  sky.isPickable = false;
  sky.metadata = { physicsCategory: "decoration" };
  decorativeMeshes.push(sky);
}

function freezeStaticEnvironment(scene: Scene) {
  scene.meshes
    .filter((mesh) => mesh.metadata?.physicsCategory !== "pushable")
    .forEach((mesh) => mesh.freezeWorldMatrix());
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
  const identificationPlate = material(
    scene,
    "weathered container identification plate",
    new Color3(0.48, 0.47, 0.42),
    "steel",
  );
  const wood = material(
    scene,
    "aged pallet timber",
    new Color3(0.34, 0.21, 0.1),
    "wood",
  );
  const sandbag = material(
    scene,
    "weathered sandbags",
    new Color3(0.43, 0.39, 0.27),
    "concrete",
  );
  const safety = material(
    scene,
    "controlled safety orange",
    new Color3(0.9, 0.4, 0.035),
    "paint",
  );
  const glass = material(
    scene,
    "smoky security glass",
    new Color3(0.07, 0.17, 0.2),
    "glass",
  );
  const glow = new StandardMaterial("warm industrial fixture", scene);
  glow.emissiveColor = new Color3(1, 0.42, 0.1);
  glow.diffuseColor = new Color3(0.1, 0.04, 0.01);

  return {
    asphalt,
    concrete,
    darkConcrete,
    steel,
    rustedSteel,
    containerBlue,
    containerFrame,
    identificationPlate,
    containerRed,
    containerOlive,
    wood,
    sandbag,
    safety,
    glass,
    glow,
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
  surface: "asphalt" | "concrete" | "steel" | "paint" | "wood" | "glass",
) {
  const result = new PBRMaterial(name, scene);
  result.albedoColor = color;
  result.metallic = surface === "steel"
    ? 0.68
    : surface === "glass"
      ? 0.34
      : 0.04;
  result.roughness = surface === "steel"
    ? 0.46
    : surface === "glass"
      ? 0.18
      : surface === "asphalt"
        ? 0.82
        : 0.74;
  result.environmentIntensity = surface === "glass" ? 0.7 : 0.38;

  if (surface === "glass") {
    result.alpha = 0.72;
    result.transparencyMode = PBRMaterial.PBRMATERIAL_ALPHABLEND;
  }

  if (surface === "asphalt" || surface === "concrete") {
    const groundTexture = new Texture(
      "/assets/industrial-ground-generated.png",
      scene,
      true,
      false,
    );
    groundTexture.uScale = surface === "asphalt" ? 7 : 3;
    groundTexture.vScale = surface === "asphalt" ? 7 : 3;
    result.albedoTexture = groundTexture;
    return result;
  }

  const texture = new DynamicTexture(
    `${name} weathering`,
    { width: 256, height: 256 },
    scene,
    false,
  );
  const context = texture.getContext();
  context.fillStyle = `rgb(${Math.round(color.r * 255)}, ${Math.round(color.g * 255)}, ${Math.round(color.b * 255)})`;
  context.fillRect(0, 0, 256, 256);
  context.fillStyle = "rgba(220, 186, 118, 0.12)";
  for (let index = 0; index < 28; index += 1) {
    const x = (index * 43 + 19) % 256;
    const y = (index * 71 + 7) % 256;
    context.fillRect(x, y, 2 + (index % 4), 15 + ((index * 13) % 30));
  }
  texture.wrapU = Texture.WRAP_ADDRESSMODE;
  texture.wrapV = Texture.WRAP_ADDRESSMODE;
  texture.uScale = 2;
  texture.vScale = 2;
  texture.update();
  result.albedoTexture = texture;
  return result;
}

function sceneOf(materials: ArenaMaterials) {
  return materials.asphalt.getScene();
}
