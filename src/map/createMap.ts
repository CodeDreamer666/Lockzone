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
  width: 168,
  depth: 136,
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
  area?: "container-yard" | "warehouse" | "command-facility";
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

type DistrictMaterials = ReturnType<typeof createDistrictMaterials>;

export function createMap(scene: Scene): MapData {
  const cover: Mesh[] = [];
  const decorativeMeshes: Mesh[] = [];
  const walkableSurfaces: Mesh[] = [];
  const pushableProps: PushablePropDefinition[] = [];
  const materials = createDistrictMaterials(scene);

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
      area: options.area,
      bulletMaterial: options.bulletMaterial ?? "concrete",
      collisionCategory: "solid-cover",
      collisionShape: "box",
      physicsCategory: "solid",
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

  const ground = MeshBuilder.CreateGround("compact district wet asphalt", {
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
  createVisibleBoundary(solid, decoration, materials);
  createContainerLoadingYard(solid, decoration, walkableSurfaces, pushableProps, materials);
  createWarehouseComplex(solid, decoration, walkableSurfaces, pushableProps, materials);
  createCommandSecurityFacility(solid, decoration, walkableSurfaces, pushableProps, materials);
  createAreaConnections(solid, decoration, materials);
  createBackgroundScenery(decoration, materials);
  createAtmosphericLights(scene, decoration, materials);
  freezeStaticEnvironment(scene);

  return {
    cover,
    walkableSurfaces,
    decorativeMeshes,
    pushableProps,
    playerSpawn: new Vector3(-74, 1.7, -56),
    botSpawns: [
      new Vector3(-62, 1.7, -30),
      new Vector3(-46, 1.7, 5),
      new Vector3(-66, 1.7, 42),
      new Vector3(-18, 1.7, -37),
      new Vector3(5, 1.7, -12),
      new Vector3(-8, 1.7, 28),
      new Vector3(36, 1.7, -28),
      new Vector3(57, 1.7, -3),
      new Vector3(42, 1.7, 31),
      new Vector3(68, 1.7, 47),
    ],
    resourcePoints: [
      new Vector3(-62, 1, -45),
      new Vector3(-47, 1, 28),
      new Vector3(-14, 1, -17),
      new Vector3(11, 1, 22),
      new Vector3(37, 1, -13),
      new Vector3(61, 1, 27),
    ],
  };
}

function createVisibleBoundary(
  solid: SolidBuilder,
  decoration: DecorationBuilder,
  materials: DistrictMaterials,
) {
  const halfWidth = DISTRICT_DIMENSIONS.width / 2;
  const halfDepth = DISTRICT_DIMENSIONS.depth / 2;
  solid("north perimeter flood wall", new Vector3(0, 2.4, halfDepth - 0.8), [168, 4.8, 1.6], materials.darkConcrete);
  solid("south perimeter flood wall", new Vector3(0, 2.4, -halfDepth + 0.8), [168, 4.8, 1.6], materials.darkConcrete);
  solid("west perimeter warehouse wall", new Vector3(-halfWidth + 0.8, 2.4, 0), [1.6, 4.8, 136], materials.darkConcrete);
  solid("east perimeter security wall", new Vector3(halfWidth - 0.8, 2.4, 0), [1.6, 4.8, 136], materials.darkConcrete);

  for (let x = -76; x <= 76; x += 8) {
    decoration(`north boundary fence post ${x}`, new Vector3(x, 5.2, 66.5), [0.18, 5.6, 0.18], materials.steel);
  }
  for (let z = -58; z <= 58; z += 8) {
    decoration(`east boundary fence post ${z}`, new Vector3(82.5, 5.2, z), [0.18, 5.6, 0.18], materials.steel);
  }
}

function createContainerLoadingYard(
  solid: SolidBuilder,
  decoration: DecorationBuilder,
  walkableSurfaces: Mesh[],
  pushableProps: PushablePropDefinition[],
  materials: DistrictMaterials,
) {
  const area = "container-yard" as const;
  createSign(decoration, materials, "AREA 1  //  CONTAINER & LOADING", new Vector3(-54, 5.4, -59.5), 17, 1.1, "yard identity sign");
  createOpenGate(solid, decoration, materials, new Vector3(-73, 0, -57), 10, 0, "yard arrival checkpoint", area);
  createGuardBooth(solid, decoration, materials, new Vector3(-64, 1.6, -57), "yard arrival booth", area);

  const containerLayout: Array<[number, number, number, number]> = [
    [-72, -42, 0, 0], [-57, -44, 1, 0], [-41, -40, 2, 0.08],
    [-70, -26, 2, 0], [-52, -27, 0, -0.06], [-36, -22, 1, Math.PI / 2],
    [-73, -7, 1, 0.05], [-56, -9, 2, 0], [-38, -3, 0, -0.08],
    [-68, 12, 0, Math.PI / 2], [-50, 11, 1, 0], [-34, 16, 2, Math.PI / 2],
  ];
  containerLayout.forEach(([x, z, materialIndex, rotation], index) => {
    const material = [materials.containerBlue, materials.containerRed, materials.containerSand][materialIndex];
    const container = solid(`solid shipping container ${index}`, new Vector3(x, 1.45, z), [12.4, 2.9, 2.7], material, {
      area,
      bulletMaterial: "metal",
    });
    container.rotation.y = rotation;
    createContainerDetails(decoration, materials, container, index);
    if ([1, 4, 8].includes(index)) {
      const upper = solid(`solid stacked shipping container ${index}`, new Vector3(x, 4.35, z), [12.4, 2.9, 2.7], material, {
        area,
        bulletMaterial: "metal",
      });
      upper.rotation.y = rotation;
    }
  });

  createTruck(solid, decoration, materials, new Vector3(-42, 1.3, -52), Math.PI / 2, "yard loading truck", area);
  createForklift(solid, decoration, materials, new Vector3(-57, 0.8, 25), -0.18, "yard loading forklift", area);
  createPalletStack(solid, decoration, materials, new Vector3(-43, 0.65, 27), "yard palletized cargo", area);
  createPalletStack(solid, decoration, materials, new Vector3(-71, 0.65, 29), "yard export cargo", area);

  [[-76, -34, 0.18], [-47, -34, -0.12], [-62, 2, 0.08], [-42, 8, -0.18]].forEach(([x, z, rotation], index) => {
    createConcreteBarrier(solid, materials, new Vector3(x, 0.65, z), rotation, `yard route barrier ${index}`, area);
  });

  const walkway = solid("yard elevated loading walkway", new Vector3(-55, 3.35, 40), [39, 0.35, 3.4], materials.steel, {
    area,
    bulletMaterial: "metal",
    surfaceType: "metal",
  });
  walkableSurfaces.push(walkway);
  createRamp(solid, walkableSurfaces, materials.steel, "yard walkway access ramp", new Vector3(-78, 1.7, 40), 3.4, 14, 3.4, Math.PI / 2, area);
  solid("yard walkway north railing", new Vector3(-55, 4.05, 41.65), [39, 1.05, 0.12], materials.steel, { area, bulletMaterial: "metal" });
  solid("yard walkway south railing", new Vector3(-55, 4.05, 38.35), [39, 1.05, 0.12], materials.steel, { area, bulletMaterial: "metal" });

  solid("yard jumpable low barrier", new Vector3(-31, 0.55, 34), [6, 1.1, 0.8], materials.concrete, { area });
  createPushableCone(sceneOf(materials), pushableProps, materials, new Vector3(-66, 0.5, -51), "yard cone 0");
  createPushableCone(sceneOf(materials), pushableProps, materials, new Vector3(-61, 0.5, -48), "yard cone 1");
  createPushableBox(sceneOf(materials), pushableProps, materials, new Vector3(-48, 0.45, 22), "yard loose crate 0");
  createPushableBox(sceneOf(materials), pushableProps, materials, new Vector3(-46.8, 0.45, 21), "yard loose crate 1");
}

function createWarehouseComplex(
  solid: SolidBuilder,
  decoration: DecorationBuilder,
  walkableSurfaces: Mesh[],
  pushableProps: PushablePropDefinition[],
  materials: DistrictMaterials,
) {
  const area = "warehouse" as const;
  createIndoorFloor(sceneOf(materials), walkableSurfaces, materials, "warehouse hard floor", new Vector3(-2, 0.025, -7), 54, 82, area);
  createSign(decoration, materials, "AREA 2  //  WAREHOUSE W-04", new Vector3(-2, 7.4, -48.8), 18, 1.15, "warehouse identity sign");

  solid("warehouse west wall south", new Vector3(-29, 4, -34), [1.2, 8, 28], materials.darkConcrete, { area });
  solid("warehouse west wall north", new Vector3(-29, 4, 18), [1.2, 8, 28], materials.darkConcrete, { area });
  solid("warehouse east wall south", new Vector3(25, 4, -38), [1.2, 8, 20], materials.darkConcrete, { area });
  solid("warehouse east wall center", new Vector3(25, 4, -5), [1.2, 8, 28], materials.darkConcrete, { area });
  solid("warehouse east wall north", new Vector3(25, 4, 34), [1.2, 8, 18], materials.darkConcrete, { area });
  solid("warehouse south wall west", new Vector3(-20, 4, -48), [17, 8, 1.2], materials.darkConcrete, { area });
  solid("warehouse south wall center", new Vector3(-2, 4, -48), [9, 8, 1.2], materials.darkConcrete, { area });
  solid("warehouse south wall east", new Vector3(17, 4, -48), [15, 8, 1.2], materials.darkConcrete, { area });
  solid("warehouse north wall west", new Vector3(-19, 4, 34), [19, 8, 1.2], materials.darkConcrete, { area });
  solid("warehouse north wall east", new Vector3(15, 4, 34), [19, 8, 1.2], materials.darkConcrete, { area });
  solid("warehouse roof west", new Vector3(-19, 8.25, -7), [20, 0.45, 82], materials.rustedSteel, { area, bulletMaterial: "metal" });
  solid("warehouse roof east", new Vector3(15, 8.25, -7), [20, 0.45, 82], materials.rustedSteel, { area, bulletMaterial: "metal" });

  [-20, -8, 4, 16].forEach((x, index) => {
    solid(`warehouse structural pillar south ${index}`, new Vector3(x, 3.8, -30), [1.1, 7.6, 1.1], materials.concrete, { area });
    solid(`warehouse structural pillar north ${index}`, new Vector3(x, 3.8, 17), [1.1, 7.6, 1.1], materials.concrete, { area });
  });

  [[-18, -22], [-5, -22], [9, -22], [-16, 4], [-2, 5], [13, 4], [-17, 23], [8, 22]].forEach(([x, z], index) => {
    createWarehouseRack(solid, decoration, materials, new Vector3(x, 1.8, z), index, area);
  });

  solid("warehouse loading room divider", new Vector3(-15, 2.1, -12), [16, 4.2, 0.5], materials.darkConcrete, { area });
  solid("warehouse office divider west", new Vector3(11, 2.1, 17), [0.5, 4.2, 15], materials.darkConcrete, { area });
  solid("warehouse office divider north", new Vector3(18, 2.1, 24.5), [14, 4.2, 0.5], materials.darkConcrete, { area });
  createDoorFrame(decoration, materials, new Vector3(11, 1.8, 12), Math.PI / 2, "warehouse office doorway");
  createOfficeFurniture(decoration, materials, new Vector3(18, 0.75, 19), "warehouse dispatch office");

  const officeWalkway = solid("warehouse observation platform", new Vector3(16, 3.25, 28.5), [15, 0.35, 6], materials.steel, {
    area,
    bulletMaterial: "metal",
    surfaceType: "metal",
  });
  walkableSurfaces.push(officeWalkway);
  createStaircase(solid, walkableSurfaces, materials, new Vector3(5.5, 0, 28.5), 8, 0, "warehouse observation stairs", area);
  createRamp(solid, walkableSurfaces, materials.steel, "warehouse north service ramp", new Vector3(20, 1.65, 39), 3.2, 13, 3.3, 0, area);
  solid("warehouse platform railing", new Vector3(16, 4, 25.55), [15, 1, 0.12], materials.steel, { area, bulletMaterial: "metal" });

  createForklift(solid, decoration, materials, new Vector3(-20, 0.8, -40), 0.25, "warehouse aisle forklift", area);
  createPalletStack(solid, decoration, materials, new Vector3(12, 0.65, -35), "warehouse receiving pallets", area);
  createPushableBox(sceneOf(materials), pushableProps, materials, new Vector3(-10, 0.45, -38), "warehouse loose box 0");
  createPushableBox(sceneOf(materials), pushableProps, materials, new Vector3(-8.8, 0.45, -37.5), "warehouse loose box 1");
  createPushableCone(sceneOf(materials), pushableProps, materials, new Vector3(21, 0.5, -43), "warehouse safety cone");
}

function createCommandSecurityFacility(
  solid: SolidBuilder,
  decoration: DecorationBuilder,
  walkableSurfaces: Mesh[],
  pushableProps: PushablePropDefinition[],
  materials: DistrictMaterials,
) {
  const area = "command-facility" as const;
  createIndoorFloor(sceneOf(materials), walkableSurfaces, materials, "command facility hard floor", new Vector3(55, 0.025, 9), 52, 76, area);
  createSign(decoration, materials, "AREA 3  //  COMMAND & SECURITY", new Vector3(54, 7.6, -34.7), 19, 1.2, "command identity sign");
  createOpenGate(solid, decoration, materials, new Vector3(39, 0, -41), 12, 0, "command exposed checkpoint", area);
  createGuardBooth(solid, decoration, materials, new Vector3(51, 1.6, -41), "command checkpoint booth", area);

  solid("command west wall south", new Vector3(29, 4.2, -25), [1.2, 8.4, 19], materials.darkConcrete, { area });
  solid("command west wall center", new Vector3(29, 4.2, 3), [1.2, 8.4, 20], materials.darkConcrete, { area });
  solid("command west wall north", new Vector3(29, 4.2, 36), [1.2, 8.4, 20], materials.darkConcrete, { area });
  solid("command east wall", new Vector3(81, 4.2, 9), [1.2, 8.4, 76], materials.darkConcrete, { area });
  solid("command south wall west", new Vector3(35, 4.2, -29), [11, 8.4, 1.2], materials.darkConcrete, { area });
  solid("command south wall center", new Vector3(55, 4.2, -29), [15, 8.4, 1.2], materials.darkConcrete, { area });
  solid("command south wall east", new Vector3(75, 4.2, -29), [11, 8.4, 1.2], materials.darkConcrete, { area });
  solid("command north wall west", new Vector3(40, 4.2, 47), [22, 8.4, 1.2], materials.darkConcrete, { area });
  solid("command north wall east", new Vector3(72, 4.2, 47), [18, 8.4, 1.2], materials.darkConcrete, { area });
  solid("command roof west", new Vector3(40, 8.65, 9), [20, 0.45, 76], materials.rustedSteel, { area, bulletMaterial: "metal" });
  solid("command roof east", new Vector3(70, 8.65, 9), [20, 0.45, 76], materials.rustedSteel, { area, bulletMaterial: "metal" });

  solid("security office divider", new Vector3(44, 2.05, -12), [0.5, 4.1, 22], materials.darkConcrete, { area });
  solid("records corridor divider west", new Vector3(55, 2.05, 0), [22, 4.1, 0.5], materials.darkConcrete, { area });
  solid("records corridor divider east", new Vector3(73, 2.05, 0), [8, 4.1, 0.5], materials.darkConcrete, { area });
  solid("control room west wall", new Vector3(50, 2.05, 25), [0.5, 4.1, 20], materials.darkConcrete, { area });
  solid("control room south wall west", new Vector3(57, 2.05, 15), [14, 4.1, 0.5], materials.darkConcrete, { area });
  solid("control room south wall east", new Vector3(75, 2.05, 15), [8, 4.1, 0.5], materials.darkConcrete, { area });
  createDoorFrame(decoration, materials, new Vector3(44, 1.8, -2), Math.PI / 2, "command security office door");
  createDoorFrame(decoration, materials, new Vector3(66, 1.8, 0), 0, "command records corridor door");
  createDoorFrame(decoration, materials, new Vector3(66, 1.8, 15), 0, "central command room door");

  solid("central command table", new Vector3(65, 1.15, 28), [8, 2.3, 4], materials.steel, { area, bulletMaterial: "metal" });
  createControlBank(decoration, materials, new Vector3(65, 1.15, 35), "central command control bank");
  createOfficeFurniture(decoration, materials, new Vector3(36, 0.75, -10), "security office workstation");
  createOfficeFurniture(decoration, materials, new Vector3(70, 0.75, 7), "command records station");
  solid("command server rack north", new Vector3(77, 1.8, 31), [3, 3.6, 6], materials.steel, { area, bulletMaterial: "metal" });
  solid("command server rack south", new Vector3(77, 1.8, 21), [3, 3.6, 6], materials.steel, { area, bulletMaterial: "metal" });

  const catwalk = solid("command security catwalk", new Vector3(37, 3.4, 24), [12, 0.35, 28], materials.steel, {
    area,
    bulletMaterial: "metal",
    surfaceType: "metal",
  });
  walkableSurfaces.push(catwalk);
  createStaircase(solid, walkableSurfaces, materials, new Vector3(37, 0, 6.5), 8, 0, "command catwalk stairs", area);
  createRamp(solid, walkableSurfaces, materials.steel, "command catwalk maintenance ramp", new Vector3(37, 1.7, 44), 3.4, 14, 3.4, 0, area);
  solid("command catwalk east railing", new Vector3(43, 4.1, 24), [0.12, 1, 28], materials.steel, { area, bulletMaterial: "metal" });

  createCommunicationsTower(sceneOf(materials), decoration, materials, new Vector3(65, 19, 28));
  createPushableCone(sceneOf(materials), pushableProps, materials, new Vector3(36, 0.5, -37), "command checkpoint cone 0");
  createPushableCone(sceneOf(materials), pushableProps, materials, new Vector3(43, 0.5, -37), "command checkpoint cone 1");
  createPushableBox(sceneOf(materials), pushableProps, materials, new Vector3(72, 0.45, -8), "command loose equipment case");
}

function createAreaConnections(
  solid: SolidBuilder,
  decoration: DecorationBuilder,
  materials: DistrictMaterials,
) {
  createOpenGate(solid, decoration, materials, new Vector3(-29, 0, -28), 9, Math.PI / 2, "yard warehouse exposed loading gate", "warehouse");
  createOpenGate(solid, decoration, materials, new Vector3(-29, 0, 24), 8, Math.PI / 2, "yard warehouse sheltered service gate", "warehouse");
  decoration("yard warehouse sheltered pipe bridge", new Vector3(-29, 5.6, 24), [0.9, 0.7, 11], materials.rustedSteel);

  createOpenGate(solid, decoration, materials, new Vector3(27, 0, -16), 10, Math.PI / 2, "warehouse command exposed checkpoint", "command-facility");
  createOpenGate(solid, decoration, materials, new Vector3(27, 0, 27), 8, Math.PI / 2, "warehouse command concealed connector", "command-facility");
  decoration("warehouse command overhead services", new Vector3(27, 5.8, 27), [0.9, 0.8, 12], materials.rustedSteel);
}

function createBackgroundScenery(decoration: DecorationBuilder, materials: DistrictMaterials) {
  decoration("background water treatment silhouette", new Vector3(-58, 7, 77), [38, 14, 14], materials.darkConcrete);
  decoration("background water tank", new Vector3(-76, 11, 78), [12, 22, 12], materials.rustedSteel);
  decoration("background electrical substation", new Vector3(58, 6, 77), [42, 12, 13], materials.steel);
  decoration("background fleet depot", new Vector3(6, 8, -78), [48, 16, 15], materials.paintedSteel);
}

function createAtmosphericLights(scene: Scene, decoration: DecorationBuilder, materials: DistrictMaterials) {
  const fixtures: Array<[number, number, number, number, Color3]> = [
    [-63, 5.5, -24, 0.7, new Color3(1, 0.44, 0.16)],
    [-49, 5.5, 28, 0.65, new Color3(0.34, 0.56, 0.68)],
    [-12, 6.4, -24, 0.75, new Color3(1, 0.45, 0.16)],
    [10, 6.4, 18, 0.7, new Color3(1, 0.45, 0.16)],
    [39, 6.3, -15, 0.85, new Color3(0.35, 0.58, 0.72)],
    [65, 6.3, 28, 0.95, new Color3(1, 0.34, 0.1)],
  ];
  fixtures.forEach(([x, y, z, intensity, color], index) => {
    decoration(`compact district light fixture ${index}`, new Vector3(x, y, z), [0.7, 0.2, 0.7], materials.glow);
    const light = new PointLight(`compact district light ${index}`, new Vector3(x, y - 0.2, z), scene);
    light.diffuse = color;
    light.intensity = intensity;
    light.range = 17;
  });
}

function createIndoorFloor(
  scene: Scene,
  walkableSurfaces: Mesh[],
  materials: DistrictMaterials,
  name: string,
  position: Vector3,
  width: number,
  depth: number,
  area: string,
) {
  const floor = MeshBuilder.CreateGround(name, { width, height: depth, subdivisions: 2 }, scene);
  floor.position.copyFrom(position);
  floor.material = materials.darkConcrete;
  floor.checkCollisions = true;
  floor.isPickable = true;
  floor.receiveShadows = true;
  floor.metadata = {
    area,
    physicsCategory: "walkable-surface",
    surfaceType: "indoor" satisfies SurfaceType,
  };
  walkableSurfaces.push(floor);
}

function createRamp(
  solid: SolidBuilder,
  walkableSurfaces: Mesh[],
  material: PBRMaterial,
  name: string,
  position: Vector3,
  width: number,
  run: number,
  rise: number,
  rotation: number,
  area: PhysicalOptions["area"],
) {
  const ramp = solid(name, position, [width, 0.25, run], material, {
    area,
    bulletMaterial: "metal",
    surfaceType: "metal",
  });
  ramp.rotation.x = Math.atan2(rise, run);
  ramp.rotation.y = rotation;
  walkableSurfaces.push(ramp);
}

function createStaircase(
  solid: SolidBuilder,
  walkableSurfaces: Mesh[],
  materials: DistrictMaterials,
  origin: Vector3,
  stepCount: number,
  rotation: number,
  name: string,
  area: PhysicalOptions["area"],
) {
  const stepHeight = 0.4;
  const stepDepth = 0.72;
  for (let index = 0; index < stepCount; index += 1) {
    const height = (index + 1) * stepHeight;
    const local = new Vector3(0, height / 2, index * stepDepth);
    const rotated = new Vector3(
      local.x * Math.cos(rotation) + local.z * Math.sin(rotation),
      local.y,
      local.z * Math.cos(rotation) - local.x * Math.sin(rotation),
    );
    const step = solid(`${name} ${index}`, origin.add(rotated), [3.2, height, stepDepth + 0.04], materials.steel, {
      area,
      bulletMaterial: "metal",
      surfaceType: "metal",
    });
    step.rotation.y = rotation;
    walkableSurfaces.push(step);
  }
}

function createOpenGate(
  solid: SolidBuilder,
  decoration: DecorationBuilder,
  materials: DistrictMaterials,
  position: Vector3,
  width: number,
  rotation: number,
  name: string,
  area: PhysicalOptions["area"],
) {
  const across = new Vector3(Math.cos(rotation), 0, -Math.sin(rotation));
  const left = solid(`${name} left post`, position.add(across.scale(-width / 2)).add(new Vector3(0, 2.7, 0)), [0.75, 5.4, 0.75], materials.darkConcrete, { area });
  const right = solid(`${name} right post`, position.add(across.scale(width / 2)).add(new Vector3(0, 2.7, 0)), [0.75, 5.4, 0.75], materials.darkConcrete, { area });
  const beam = decoration(`${name} overhead beam`, position.add(new Vector3(0, 5.1, 0)), [width + 1, 0.65, 0.75], materials.rustedSteel);
  left.rotation.y = rotation;
  right.rotation.y = rotation;
  beam.rotation.y = rotation;
}

function createGuardBooth(
  solid: SolidBuilder,
  decoration: DecorationBuilder,
  materials: DistrictMaterials,
  position: Vector3,
  name: string,
  area: PhysicalOptions["area"],
) {
  solid(`${name} body`, position, [4.5, 3.2, 4.5], materials.darkConcrete, { area });
  decoration(`${name} window`, position.add(new Vector3(0, 0.65, -2.3)), [3.3, 1.15, 0.08], materials.glass);
  decoration(`${name} roof`, position.add(new Vector3(0, 1.8, 0)), [5, 0.3, 5], materials.rustedSteel);
}

function createContainerDetails(
  decoration: DecorationBuilder,
  materials: DistrictMaterials,
  container: Mesh,
  index: number,
) {
  for (let offset = -5; offset <= 5; offset += 1) {
    const rib = decoration(`container ${index} corrugation ${offset}`, container.position.add(new Vector3(offset, 0, -1.37)), [0.08, 2.5, 0.08], materials.rustedSteel);
    rib.rotation.y = container.rotation.y;
  }
}

function createWarehouseRack(
  solid: SolidBuilder,
  decoration: DecorationBuilder,
  materials: DistrictMaterials,
  position: Vector3,
  index: number,
  area: PhysicalOptions["area"],
) {
  solid(`warehouse solid storage rack ${index}`, position, [8.2, 3.6, 1.2], materials.rustedSteel, { area, bulletMaterial: "metal" });
  [-2.6, 0, 2.6].forEach((offset, crateIndex) => {
    solid(`warehouse thick stored crate ${index}-${crateIndex}`, position.add(new Vector3(offset, -0.35, 1)), [2.1, 1.8, 1.6], materials.wood, { area, bulletMaterial: "wood" });
    decoration(`warehouse crate label ${index}-${crateIndex}`, position.add(new Vector3(offset, -0.35, 1.83)), [1.3, 0.55, 0.04], materials.safety);
  });
}

function createForklift(
  solid: SolidBuilder,
  decoration: DecorationBuilder,
  materials: DistrictMaterials,
  position: Vector3,
  rotation: number,
  name: string,
  area: PhysicalOptions["area"],
) {
  const body = solid(`${name} solid body`, position, [2.7, 1.55, 3.8], materials.safety, { area, bulletMaterial: "metal" });
  const mast = solid(`${name} solid mast`, position.add(new Vector3(0, 1.65, 1.5)), [2, 3.3, 0.35], materials.steel, { area, bulletMaterial: "metal" });
  const forks = solid(`${name} solid forks`, position.add(new Vector3(0, 0.3, 2.6)), [2, 0.18, 1.8], materials.steel, { area, bulletMaterial: "metal" });
  body.rotation.y = rotation;
  mast.rotation.y = rotation;
  forks.rotation.y = rotation;
  decoration(`${name} warning light`, position.add(new Vector3(0, 2.7, 0)), [0.35, 0.2, 0.35], materials.glow);
}

function createTruck(
  solid: SolidBuilder,
  decoration: DecorationBuilder,
  materials: DistrictMaterials,
  position: Vector3,
  rotation: number,
  name: string,
  area: PhysicalOptions["area"],
) {
  const cab = solid(`${name} solid cab`, position, [3.2, 2.8, 4.2], materials.paintedSteel, { area, bulletMaterial: "metal" });
  const cargo = solid(`${name} solid cargo bed`, position.add(new Vector3(0, 0.25, -4.3)), [3.5, 2.3, 5.2], materials.rustedSteel, { area, bulletMaterial: "metal" });
  cab.rotation.y = rotation;
  cargo.rotation.y = rotation;
  decoration(`${name} windshield`, position.add(new Vector3(0, 0.65, 2.12)), [2.4, 1.1, 0.06], materials.glass).rotation.y = rotation;
}

function createPalletStack(
  solid: SolidBuilder,
  decoration: DecorationBuilder,
  materials: DistrictMaterials,
  position: Vector3,
  name: string,
  area: PhysicalOptions["area"],
) {
  solid(`${name} solid load`, position.add(new Vector3(0, 0.65, 0)), [4.2, 2.5, 2.8], materials.wood, { area, bulletMaterial: "wood" });
  decoration(`${name} lower pallet`, position, [4.5, 0.2, 3.1], materials.wood);
  decoration(`${name} strap`, position.add(new Vector3(0, 0.7, -1.43)), [0.25, 2.4, 0.05], materials.safety);
}

function createConcreteBarrier(
  solid: SolidBuilder,
  materials: DistrictMaterials,
  position: Vector3,
  rotation: number,
  name: string,
  area: PhysicalOptions["area"],
) {
  const barrier = solid(name, position, [5.5, 1.3, 0.75], materials.concrete, { area, bulletMaterial: "concrete" });
  barrier.rotation.y = rotation;
}

function createPushableCone(
  scene: Scene,
  pushableProps: PushablePropDefinition[],
  materials: DistrictMaterials,
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
  pushableProps.push({ mesh: cone, radius: 0.42, halfHeight: 0.5, mass: 0.65 });
}

function createPushableBox(
  scene: Scene,
  pushableProps: PushablePropDefinition[],
  materials: DistrictMaterials,
  position: Vector3,
  name: string,
) {
  const box = MeshBuilder.CreateBox(name, { size: 0.9 }, scene);
  box.position.copyFrom(position);
  box.material = materials.wood;
  box.isPickable = true;
  box.receiveShadows = true;
  box.metadata = {
    bulletMaterial: "wood" satisfies BulletMaterial,
    physicsCategory: "pushable",
    propKind: "box",
  };
  pushableProps.push({ mesh: box, radius: 0.6, halfHeight: 0.45, mass: 1.2 });
}

function createDoorFrame(
  decoration: DecorationBuilder,
  materials: DistrictMaterials,
  position: Vector3,
  rotation: number,
  name: string,
) {
  const across = new Vector3(Math.cos(rotation), 0, -Math.sin(rotation));
  const left = decoration(`${name} left frame`, position.add(across.scale(-1.55)), [0.24, 3.6, 0.3], materials.rustedSteel);
  const right = decoration(`${name} right frame`, position.add(across.scale(1.55)), [0.24, 3.6, 0.3], materials.rustedSteel);
  const header = decoration(`${name} header`, position.add(new Vector3(0, 1.7, 0)), [3.35, 0.25, 0.3], materials.rustedSteel);
  left.rotation.y = rotation;
  right.rotation.y = rotation;
  header.rotation.y = rotation;
}

function createOfficeFurniture(
  decoration: DecorationBuilder,
  materials: DistrictMaterials,
  position: Vector3,
  name: string,
) {
  decoration(`${name} desk`, position, [5.4, 1.3, 1.4], materials.wood);
  decoration(`${name} monitor left`, position.add(new Vector3(-1.4, 1.05, -0.55)), [1.1, 0.8, 0.12], materials.glass);
  decoration(`${name} monitor right`, position.add(new Vector3(1.4, 1.05, -0.55)), [1.1, 0.8, 0.12], materials.glass);
}

function createControlBank(
  decoration: DecorationBuilder,
  materials: DistrictMaterials,
  position: Vector3,
  name: string,
) {
  const bank = decoration(name, position, [7.2, 0.9, 1.3], materials.darkConcrete);
  bank.rotation.x = -0.18;
  decoration(`${name} amber display`, position.add(new Vector3(-2, 0.55, -0.68)), [1.7, 0.42, 0.05], materials.glow);
  decoration(`${name} blue display`, position.add(new Vector3(2, 0.55, -0.68)), [1.7, 0.42, 0.05], materials.glass);
}

function createCommunicationsTower(
  scene: Scene,
  decoration: DecorationBuilder,
  materials: DistrictMaterials,
  position: Vector3,
) {
  const mast = MeshBuilder.CreateCylinder("command communications landmark", {
    height: 21,
    diameterTop: 0.4,
    diameterBottom: 1.8,
    tessellation: 10,
  }, scene);
  mast.position.copyFrom(position);
  mast.material = materials.steel;
  mast.isPickable = false;
  mast.metadata = { physicsCategory: "decoration" };
  [4, 9, 14].forEach((offset, index) => {
    decoration(`command mast beacon ${index}`, position.add(new Vector3(0, offset - 10.5, 0)), [0.7, 0.24, 0.7], materials.glow);
  });
}

function createSign(
  decoration: DecorationBuilder,
  materials: DistrictMaterials,
  text: string,
  position: Vector3,
  width: number,
  height: number,
  name: string,
) {
  const texture = new DynamicTexture(`${name} texture`, { width: 1024, height: 128 }, materials.darkConcrete.getScene(), false);
  const context = texture.getContext();
  context.fillStyle = "#101516";
  context.fillRect(0, 0, 1024, 128);
  context.fillStyle = "#e4b65f";
  context.font = "bold 42px Arial";
  context.fillText(text, 90, 78);
  texture.update();
  const signMaterial = new StandardMaterial(`${name} material`, materials.darkConcrete.getScene());
  signMaterial.diffuseTexture = texture;
  signMaterial.emissiveColor = new Color3(0.14, 0.1, 0.03);
  const sign = decoration(name, position, [width, height, 0.08], signMaterial);
  sign.rotation.y = Math.PI;
}

function createSky(scene: Scene, decorativeMeshes: Mesh[]) {
  const sky = MeshBuilder.CreateSphere("storm-clear late afternoon sky", { diameter: 700, segments: 24 }, scene);
  const material = new StandardMaterial("storm-clear sky material", scene);
  material.backFaceCulling = false;
  material.emissiveColor = new Color3(0.12, 0.17, 0.2);
  material.diffuseColor = new Color3(0.08, 0.12, 0.16);
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

function createDistrictMaterials(scene: Scene) {
  const asphalt = material(scene, "rain-dark asphalt", new Color3(0.16, 0.17, 0.17), "asphalt");
  const concrete = material(scene, "weathered structural concrete", new Color3(0.58, 0.57, 0.52), "concrete");
  const darkConcrete = material(scene, "damp dark concrete", new Color3(0.34, 0.36, 0.34), "concrete");
  const steel = material(scene, "worn blue steel", new Color3(0.22, 0.3, 0.32), "steel");
  const rustedSteel = material(scene, "rusted steel", new Color3(0.34, 0.21, 0.13), "steel");
  const paintedSteel = material(scene, "faded military green", new Color3(0.28, 0.36, 0.29), "paint");
  const containerBlue = material(scene, "faded container blue", new Color3(0.12, 0.29, 0.4), "paint");
  const containerRed = material(scene, "oxide container red", new Color3(0.42, 0.14, 0.1), "paint");
  const containerSand = material(scene, "dusty container sand", new Color3(0.48, 0.38, 0.23), "paint");
  const wood = material(scene, "aged warehouse timber", new Color3(0.28, 0.18, 0.1), "wood");
  const safety = material(scene, "warning yellow paint", new Color3(0.82, 0.47, 0.08), "paint");
  const glass = material(scene, "smoky office glass", new Color3(0.08, 0.17, 0.2), "glass");
  const glow = new StandardMaterial("warm sodium fixture", scene);
  glow.emissiveColor = new Color3(1, 0.42, 0.12);
  glow.diffuseColor = new Color3(0.1, 0.04, 0.01);
  return {
    asphalt,
    concrete,
    darkConcrete,
    steel,
    rustedSteel,
    paintedSteel,
    containerBlue,
    containerRed,
    containerSand,
    wood,
    safety,
    glass,
    glow,
  };
}

function material(
  scene: Scene,
  name: string,
  color: Color3,
  surface: "asphalt" | "concrete" | "steel" | "paint" | "wood" | "glass",
) {
  const result = new PBRMaterial(name, scene);
  result.albedoColor = color;
  result.metallic = surface === "steel" ? 0.68 : surface === "glass" ? 0.34 : 0.04;
  result.roughness = surface === "steel" ? 0.48 : surface === "glass" ? 0.18 : surface === "asphalt" ? 0.82 : 0.76;
  result.environmentIntensity = surface === "glass" ? 0.7 : 0.35;
  if (surface === "glass") {
    result.alpha = 0.76;
    result.transparencyMode = PBRMaterial.PBRMATERIAL_ALPHABLEND;
  }
  if (surface === "asphalt" || surface === "concrete") {
    const groundTexture = new Texture("/assets/industrial-ground-generated.png", scene, true, false);
    groundTexture.uScale = surface === "asphalt" ? 12 : 5;
    groundTexture.vScale = surface === "asphalt" ? 10 : 5;
    result.albedoTexture = groundTexture;
    return result;
  }
  const texture = new DynamicTexture(`${name} weathering`, { width: 256, height: 256 }, scene, false);
  const context = texture.getContext();
  context.fillStyle = `rgb(${Math.round(color.r * 255)}, ${Math.round(color.g * 255)}, ${Math.round(color.b * 255)})`;
  context.fillRect(0, 0, 256, 256);
  context.fillStyle = "rgba(220, 186, 118, 0.11)";
  for (let index = 0; index < 30; index += 1) {
    const x = (index * 43 + 19) % 256;
    const y = (index * 71 + 7) % 256;
    context.fillRect(x, y, 2 + (index % 4), 18 + ((index * 13) % 28));
  }
  texture.wrapU = Texture.WRAP_ADDRESSMODE;
  texture.wrapV = Texture.WRAP_ADDRESSMODE;
  texture.uScale = 2;
  texture.vScale = 2;
  texture.update();
  result.albedoTexture = texture;
  return result;
}

function sceneOf(materials: DistrictMaterials) {
  return materials.asphalt.getScene();
}
