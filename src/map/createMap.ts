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
  width: 240,
  depth: 220,
} as const;

export interface MapData {
  cover: Mesh[];
  walkableSurfaces: Mesh[];
  playerSpawn: Vector3;
  botSpawns: Vector3[];
  resourcePoints: Vector3[];
  decorativeMeshes: Mesh[];
}

/**
 * The compound is deliberately made from a small modular kit. It keeps collision
 * simple while allowing the visual construction to remain much richer than the
 * collision volumes that define the playable routes.
 */
export function createMap(scene: Scene): MapData {
  const cover: Mesh[] = [];
  const decorativeMeshes: Mesh[] = [];
  const walkableSurfaces: Mesh[] = [];
  const materials = createDistrictMaterials(scene);

  const solid = (
    name: string,
    position: Vector3,
    size: [number, number, number],
    material: PBRMaterial,
  ) => {
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
      collisionCategory: "solid-cover",
      collisionShape: "box",
      debugDescription: "Visible structural collision",
    };
    cover.push(mesh);
    return mesh;
  };

  const decoration = (
    name: string,
    position: Vector3,
    size: [number, number, number],
    material: PBRMaterial | StandardMaterial,
  ) => {
    const mesh = MeshBuilder.CreateBox(name, {
      width: size[0],
      height: size[1],
      depth: size[2],
    }, scene);
    mesh.position.copyFrom(position);
    mesh.material = material;
    mesh.isPickable = false;
    mesh.receiveShadows = true;
    decorativeMeshes.push(mesh);
    return mesh;
  };

  const ground = MeshBuilder.CreateGround("district wet asphalt", {
    width: DISTRICT_DIMENSIONS.width,
    height: DISTRICT_DIMENSIONS.depth,
    subdivisions: 4,
  }, scene);
  ground.material = materials.asphalt;
  ground.checkCollisions = true;
  ground.isPickable = true;
  ground.receiveShadows = true;
  walkableSurfaces.push(ground);

  createSky(scene, decorativeMeshes);
  createPerimeter(solid, decoration, materials);
  createServiceRoads(decoration, materials);
  createWarehouseComplex(solid, decoration, walkableSurfaces, materials);
  createContainerYard(solid, decoration, materials);
  createAdministrationBuilding(solid, decoration, walkableSurfaces, materials);
  createMaintenanceZone(solid, decoration, materials);
  createCommandFacility(solid, decoration, walkableSurfaces, materials);
  createLandmarks(solid, decoration, materials);
  createAtmosphericLights(scene, decoration, materials);

  return {
    cover,
    walkableSurfaces,
    decorativeMeshes,
    playerSpawn: new Vector3(-110, 1.7, -68),
    botSpawns: [
      new Vector3(-76, 1.7, 18),
      new Vector3(-44, 1.7, -78),
      new Vector3(-17, 1.7, 69),
      new Vector3(14, 1.7, -22),
      new Vector3(35, 1.7, 65),
      new Vector3(55, 1.7, -74),
      new Vector3(76, 1.7, 42),
      new Vector3(91, 1.7, -22),
      new Vector3(101, 1.7, 75),
      new Vector3(-18, 1.7, 100),
    ],
    resourcePoints: [
      new Vector3(-68, 1, -55),
      new Vector3(-72, 1, 15),
      new Vector3(-8, 1, 15),
      new Vector3(52, 1, -50),
      new Vector3(70, 1, 64),
      new Vector3(10, 1, 78),
    ],
  };
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

function createPerimeter(solid: SolidBuilder, decoration: DecorationBuilder, materials: DistrictMaterials) {
  solid("north blast wall", new Vector3(0, 3.2, 109), [240, 6.4, 2], materials.darkConcrete);
  solid("south blast wall", new Vector3(0, 3.2, -109), [240, 6.4, 2], materials.darkConcrete);
  solid("west blast wall", new Vector3(-119, 3.2, 0), [2, 6.4, 220], materials.darkConcrete);
  solid("east blast wall", new Vector3(119, 3.2, 0), [2, 6.4, 220], materials.darkConcrete);

  for (let x = -105; x <= 105; x += 30) {
    createFencePost(decoration, materials, x, -106);
    createFencePost(decoration, materials, x, 106);
  }
  for (let z = -90; z <= 90; z += 30) {
    createFencePost(decoration, materials, -116, z);
    createFencePost(decoration, materials, 116, z);
  }
}

function createServiceRoads(decoration: DecorationBuilder, materials: DistrictMaterials) {
  const roadMark = (name: string, x: number, z: number, width: number, depth: number) => {
    const mark = decoration(name, new Vector3(x, 0.025, z), [width, 0.02, depth], materials.safety);
    mark.scaling.y = 0.1;
  };
  for (let z = -90; z < 100; z += 16) roadMark(`west service dash ${z}`, -18, z, 0.34, 7);
  for (let x = -100; x < 105; x += 16) roadMark(`south service dash ${x}`, x, -25, 7, 0.34);
  for (let x = -95; x < 105; x += 20) roadMark(`north service dash ${x}`, x, 56, 8, 0.28);

  [[-28, -63], [-22, 38], [28, 60], [72, -5], [102, 46]].forEach(([x, z], index) => {
    const puddle = decoration(`rain puddle ${index}`, new Vector3(x, 0.028, z), [6 + index, 0.02, 2.2], materials.glass);
    puddle.rotation.y = index * 0.42;
  });
}

function createWarehouseComplex(
  solid: SolidBuilder,
  decoration: DecorationBuilder,
  walkableSurfaces: Mesh[],
  materials: DistrictMaterials,
) {
  // Western warehouse: the original central warehouse and loading bays become a full close-range district.
  const left = -106;
  const right = -42;
  const north = 39;
  const south = -13;
  solid("warehouse north wall", new Vector3(-74, 4.2, north), [64, 8.4, 1.2], materials.paintedSteel);
  solid("warehouse west wall", new Vector3(left, 4.2, 13), [1.2, 8.4, 52], materials.paintedSteel);
  solid("warehouse east wall north", new Vector3(right, 4.2, 25), [1.2, 8.4, 27], materials.paintedSteel);
  solid("warehouse east wall south", new Vector3(right, 4.2, -4), [1.2, 8.4, 15], materials.paintedSteel);
  solid("warehouse south wall west", new Vector3(-94, 4.2, south), [23, 8.4, 1.2], materials.paintedSteel);
  solid("warehouse south wall east", new Vector3(-56, 4.2, south), [16, 8.4, 1.2], materials.paintedSteel);
  decoration("warehouse roof truss", new Vector3(-74, 8.3, 13), [63, 0.3, 1.1], materials.rustedSteel);
  decoration("warehouse collapsed roof panel", new Vector3(-83, 8.4, 12), [18, 0.15, 25], materials.darkConcrete);
  for (let x = -101; x <= -47; x += 6) {
    decoration(`warehouse facade seam ${x}`, new Vector3(x, 4.3, south - 0.66), [0.18, 7.3, 0.08], materials.rustedSteel);
  }
  for (let z = -6; z <= 33; z += 8) {
    decoration(`warehouse west loading panel ${z}`, new Vector3(left - 0.66, 4.1, z), [0.08, 6.7, 0.22], materials.rustedSteel);
  }

  for (let x = -96; x <= -52; x += 11) {
    const pillar = solid(`warehouse concrete pillar ${x}`, new Vector3(x, 3.7, 7), [1.25, 7.4, 1.25], materials.concrete);
    createSafetyStripe(decoration, pillar.position.add(new Vector3(0, -0.4, -0.66)), [1.3, 0.35, 0.03], materials.safety, `pillar stripe ${x}`);
  }
  [[-94, 26], [-78, 26], [-61, 26], [-94, 6], [-77, 6], [-60, 6]].forEach(([x, z], index) => {
    createWarehouseRack(solid, decoration, materials, x, z, index);
  });

  solid("warehouse loading office base", new Vector3(-53, 2.1, 30), [14, 4.2, 10], materials.darkConcrete);
  addWindowBand(decoration, materials, -53, 4.1, 24.95, 10, 0, "warehouse office glass");
  const warehouseDeck = solid("warehouse observation deck", new Vector3(-52, 3.7, 19), [17, 0.35, 9], materials.steel);
  walkableSurfaces.push(warehouseDeck);
  createRamp(solid, walkableSurfaces, materials.steel, "warehouse observation ramp", new Vector3(-70, 1.95, 19), 5, 19, 3.9, Math.PI / 2);
  createRailings(solid, materials, -52, 4.4, 19, 17, 9, "warehouse deck railing", "west");
  createSign(decoration, materials, "W-04  //  LOADING", new Vector3(-74, 6.3, south - 0.64), 8, 1.1, "warehouse sign");
  createForklift(solid, decoration, materials, new Vector3(-47, 0.9, -2), 0.2, "warehouse forklift");
}

function createContainerYard(solid: SolidBuilder, decoration: DecorationBuilder, materials: DistrictMaterials) {
  // South-west container yard: deliberately offset stacks make lanes instead of a grid.
  const containers: Array<[number, number, number, number, PBRMaterial]> = [
    [-97, -79, 0, 0, materials.containerBlue],
    [-82, -79, 0, 0.05, materials.containerRed],
    [-67, -79, 0, -0.06, materials.containerSand],
    [-88, -62, 0, Math.PI / 2, materials.containerBlue],
    [-72, -59, 0, Math.PI / 2, materials.containerRed],
    [-51, -72, 0, -0.1, materials.containerBlue],
    [-50, -50, 0, Math.PI / 2, materials.containerSand],
    [-96, -45, 0, -0.04, materials.containerRed],
    [-78, -43, 0, 0, materials.containerBlue],
    [-57, -38, 0, Math.PI / 2, materials.containerRed],
    [-103, -94, 2.6, 0, materials.containerSand],
    [-68, -90, 2.6, -0.06, materials.containerBlue],
  ];
  containers.forEach(([x, z, y, rotation, material], index) => {
    const container = solid(`container yard stack ${index}`, new Vector3(x, 1.35 + y, z), [12.2, 2.7, 2.65], material);
    container.rotation.y = rotation;
    createContainerDoors(decoration, materials, container, index);
    createContainerCorrugation(decoration, materials, container, index);
  });

  [[-108, -55], [-101, -31], [-43, -84], [-31, -53], [-37, -35]].forEach(([x, z], index) => {
    createConcreteBarrier(solid, decoration, materials, x, z, index * 0.38, `yard barrier ${index}`);
  });
  createCrane(solid, decoration, materials, new Vector3(-31, 6.5, -70));
  createGuardBooth(solid, decoration, materials, new Vector3(-32, 1.6, -96));
  createDamagedTruck(solid, decoration, materials, new Vector3(-39, 1.15, -36), -0.4, "yard cargo truck");
  createSign(decoration, materials, "YARD C  //  CHECKPOINT", new Vector3(-94, 4, -105.5), 10, 1.1, "yard sign");
}

function createAdministrationBuilding(
  solid: SolidBuilder,
  decoration: DecorationBuilder,
  walkableSurfaces: Mesh[],
  materials: DistrictMaterials,
) {
  // Eastern admin building has two levels visually and an accessible exterior balcony via a ramp.
  const x = 76;
  const z = -53;
  solid("admin north wall", new Vector3(x, 4.2, -29), [48, 8.4, 1.2], materials.concrete);
  solid("admin south wall west", new Vector3(61, 4.2, -77), [18, 8.4, 1.2], materials.concrete);
  solid("admin south wall east", new Vector3(91, 4.2, -77), [18, 8.4, 1.2], materials.concrete);
  solid("admin east wall", new Vector3(100, 4.2, z), [1.2, 8.4, 48], materials.concrete);
  solid("admin west wall north", new Vector3(52, 4.2, -39), [1.2, 8.4, 18], materials.concrete);
  solid("admin west wall south", new Vector3(52, 4.2, -67), [1.2, 8.4, 14], materials.concrete);
  solid("admin reception divider", new Vector3(76, 1.5, -61), [20, 3, 0.8], materials.darkConcrete);
  solid("admin security desk", new Vector3(62, 1.1, -44), [5.8, 2.2, 1.6], materials.darkConcrete);
  solid("admin corridor cabinet", new Vector3(88, 1.35, -42), [1.4, 2.7, 9], materials.steel);
  solid("admin rear service generator", new Vector3(95, 1.35, -68), [5, 2.7, 3.2], materials.rustedSteel);

  decoration("admin upper facade", new Vector3(x, 6.3, -28.45), [47, 2.2, 0.25], materials.concrete);
  addWindowBand(decoration, materials, x, 5.3, -28.95, 41, 0, "admin front windows");
  addWindowBand(decoration, materials, 100.4, 5.3, z, 39, Math.PI / 2, "admin east windows");
  const balcony = solid("admin observation balcony", new Vector3(76, 3.62, -24), [30, 0.35, 8], materials.steel);
  walkableSurfaces.push(balcony);
  createRamp(solid, walkableSurfaces, materials.steel, "admin balcony ramp", new Vector3(52, 1.85, -24), 5, 20, 3.7, Math.PI / 2);
  createRailings(solid, materials, 76, 4.32, -24, 30, 8, "admin balcony railing", "west");
  createOfficeFurniture(decoration, materials, new Vector3(81, 0.9, -39), "admin workstations");
  createSign(decoration, materials, "ADMINISTRATION  //  A-02", new Vector3(76, 7, -28.7), 13, 1.2, "admin sign");
}

function createMaintenanceZone(solid: SolidBuilder, decoration: DecorationBuilder, materials: DistrictMaterials) {
  // North-east utility zone provides the close range route between command and the outer road.
  solid("utility generator hall west", new Vector3(50, 3.2, 82), [1.2, 6.4, 42], materials.darkConcrete);
  solid("utility generator hall east", new Vector3(81, 3.2, 82), [1.2, 6.4, 42], materials.darkConcrete);
  solid("utility generator hall north", new Vector3(65.5, 3.2, 103), [32, 6.4, 1.2], materials.darkConcrete);
  solid("utility generator hall south left", new Vector3(56, 3.2, 61), [13, 6.4, 1.2], materials.darkConcrete);
  solid("utility generator hall south right", new Vector3(75, 3.2, 61), [13, 6.4, 1.2], materials.darkConcrete);
  solid("utility tunnel north wall", new Vector3(13, 2.4, 90), [40, 4.8, 1], materials.concrete);
  solid("utility tunnel south wall", new Vector3(13, 2.4, 76), [40, 4.8, 1], materials.concrete);
  decoration("utility tunnel ceiling", new Vector3(13, 4.8, 83), [40, 0.35, 14], materials.steel);

  [[58, 72], [72, 74], [58, 93], [72, 92]].forEach(([x, z], index) => createGenerator(solid, decoration, materials, x, z, index));
  createPipeRun(decoration, materials, new Vector3(39, 3.1, 82), 23, "utility pipe run west");
  createPipeRun(decoration, materials, new Vector3(65, 5.4, 84), 28, "utility pipe run ceiling");
  [[25, 83], [43, 83], [64, 63], [64, 101]].forEach(([x, z], index) => createUtilityLamp(decoration, materials, x, z, index));
  createSign(decoration, materials, "UTILITY  //  AUTHORIZED STAFF", new Vector3(13, 4, 75.4), 9, 1, "utility sign");
}

function createCommandFacility(
  solid: SolidBuilder,
  decoration: DecorationBuilder,
  walkableSurfaces: Mesh[],
  materials: DistrictMaterials,
) {
  // The original central combat landmark is retained and expanded into the command facility.
  solid("command north facade", new Vector3(0, 4.4, 48), [54, 8.8, 1.2], materials.darkConcrete);
  solid("command west facade", new Vector3(-27, 4.4, 22), [1.2, 8.8, 52], materials.darkConcrete);
  solid("command east facade", new Vector3(27, 4.4, 22), [1.2, 8.8, 52], materials.darkConcrete);
  solid("command south facade west", new Vector3(-16, 4.4, -4), [21, 8.8, 1.2], materials.darkConcrete);
  solid("command south facade east", new Vector3(16, 4.4, -4), [21, 8.8, 1.2], materials.darkConcrete);
  solid("command central console", new Vector3(0, 1.4, 22), [9, 2.8, 4], materials.steel);
  solid("command west divider", new Vector3(-15, 1.7, 13), [9, 3.4, 0.8], materials.concrete);
  solid("command east divider", new Vector3(15, 1.7, 31), [9, 3.4, 0.8], materials.concrete);
  solid("command records barrier", new Vector3(0, 1.5, 39), [13, 3, 1.2], materials.rustedSteel);
  [[-20, 4], [20, 4], [-20, 42], [20, 42]].forEach(([x, z], index) => {
    solid(`command support column ${index}`, new Vector3(x, 4, z), [1.6, 8, 1.6], materials.concrete);
  });

  const commandDeck = solid("command observation platform", new Vector3(0, 4.1, 22), [19, 0.35, 11], materials.steel);
  walkableSurfaces.push(commandDeck);
  createRamp(solid, walkableSurfaces, materials.steel, "command west access ramp", new Vector3(-20, 2.1, 22), 5.5, 20, 4.2, Math.PI / 2);
  createRamp(solid, walkableSurfaces, materials.steel, "command east access ramp", new Vector3(20, 2.1, 22), 5.5, 20, 4.2, -Math.PI / 2);
  createRailings(solid, materials, 0, 4.8, 22, 19, 11, "command deck railing", "both");
  createControlBank(decoration, materials, new Vector3(0, 4.65, 24), "command control bank");
  createCommunicationsTower(decoration, materials, new Vector3(0, 14, 22));
  createSign(decoration, materials, "CENTRAL COMMAND  //  C-01", new Vector3(0, 7.1, -4.7), 15, 1.2, "command sign");
}

function createLandmarks(solid: SolidBuilder, decoration: DecorationBuilder, materials: DistrictMaterials) {
  const waterTower = MeshBuilder.CreateCylinder("north water tower", { height: 14, diameterTop: 6, diameterBottom: 8, tessellation: 16 }, materials.steel.getScene());
  waterTower.position.set(-83, 11, 83);
  waterTower.material = materials.steel;
  waterTower.isPickable = false;
  decoration("water tower cap", new Vector3(-83, 18.1, 83), [5.2, 0.5, 5.2], materials.rustedSteel);
  createPipeRun(decoration, materials, new Vector3(-83, 3.4, 83), 10, "water tower supply line");
  createDamagedTruck(solid, decoration, materials, new Vector3(101, 1.15, 12), Math.PI / 2, "east evacuation truck");
  createConcreteBarrierFromMaterials(decoration, materials, -10, -51, 0.2, "central barricade visual");
  createSign(decoration, materials, "SECTOR 7  //  EVACUATION ROUTE", new Vector3(-16, 3.6, -26), 11, 1.05, "evacuation sign");
}

function createAtmosphericLights(scene: Scene, decoration: DecorationBuilder, materials: DistrictMaterials) {
  const lights: Array<[number, number, number, number, Color3]> = [
    [-93, 5.7, 20, 0.75, new Color3(1, 0.44, 0.16)],
    [-65, 5.7, 4, 0.75, new Color3(1, 0.44, 0.16)],
    [-47, 4.8, -44, 0.6, new Color3(0.35, 0.55, 0.65)],
    [0, 6.8, 8, 0.95, new Color3(0.95, 0.24, 0.11)],
    [0, 6.8, 39, 0.7, new Color3(0.95, 0.24, 0.11)],
    [63, 4.7, 68, 0.7, new Color3(0.95, 0.48, 0.15)],
    [67, 4.7, 96, 0.7, new Color3(0.95, 0.48, 0.15)],
    [74, 6.2, -31, 0.7, new Color3(0.34, 0.6, 0.72)],
  ];
  lights.forEach(([x, y, z, intensity, color], index) => {
    const fixture = decoration(`industrial fixture ${index}`, new Vector3(x, y, z), [0.65, 0.18, 0.65], materials.glow);
    fixture.rotation.y = index * 0.5;
    const light = new PointLight(`industrial pool light ${index}`, new Vector3(x, y - 0.2, z), scene);
    light.diffuse = color;
    light.intensity = intensity;
    light.range = 16;
  });
}

function createSky(scene: Scene, decorativeMeshes: Mesh[]) {
  const sky = MeshBuilder.CreateSphere("storm-clear late afternoon sky", { diameter: 700, segments: 24 }, scene);
  sky.material = new StandardMaterial("storm-clear sky material", scene);
  const material = sky.material as StandardMaterial;
  material.backFaceCulling = false;
  material.emissiveColor = new Color3(0.12, 0.17, 0.2);
  material.diffuseColor = new Color3(0.08, 0.12, 0.16);
  sky.isPickable = false;
  decorativeMeshes.push(sky);
}

function createFencePost(decoration: DecorationBuilder, materials: DistrictMaterials, x: number, z: number) {
  const post = decoration(`perimeter fence post ${x}-${z}`, new Vector3(x, 3.8, z), [0.22, 7.6, 0.22], materials.steel);
  post.rotation.z = 0.02;
}

function createWarehouseRack(
  solid: SolidBuilder,
  decoration: DecorationBuilder,
  materials: DistrictMaterials,
  x: number,
  z: number,
  index: number,
) {
  solid(`warehouse shelf ${index}`, new Vector3(x, 1.8, z), [8, 3.6, 1.2], materials.rustedSteel);
  for (let level = 0; level < 3; level++) {
    decoration(`warehouse stored crate ${index}-${level}`, new Vector3(x - 1.8 + level * 1.8, 1.1 + level * 0.48, z - 0.72), [1.35, 1.15, 0.75], materials.wood);
  }
}

function createContainerDoors(decoration: DecorationBuilder, materials: DistrictMaterials, container: Mesh, index: number) {
  const door = decoration(`container doors ${index}`, container.position.add(new Vector3(6.12, 0, 0)), [0.08, 2.35, 2.25], materials.darkConcrete);
  door.rotation.y = container.rotation.y;
  const lockingBar = decoration(`container lock ${index}`, door.position.add(new Vector3(0.07, 0, 0.35)), [0.06, 1.8, 0.08], materials.steel);
  lockingBar.rotation.y = container.rotation.y;
}

function createContainerCorrugation(
  decoration: DecorationBuilder,
  materials: DistrictMaterials,
  container: Mesh,
  index: number,
) {
  for (let offset = -5; offset <= 5; offset += 1) {
    const northRib = decoration(`container ${index} north rib ${offset}`, Vector3.Zero(), [0.11, 2.4, 0.09], materials.rustedSteel);
    northRib.parent = container;
    northRib.position.set(offset, 0, -1.37);
    const southRib = decoration(`container ${index} south rib ${offset}`, Vector3.Zero(), [0.11, 2.4, 0.09], materials.rustedSteel);
    southRib.parent = container;
    southRib.position.set(offset, 0, 1.37);
  }
  const roofEdge = decoration(`container ${index} roof edge`, Vector3.Zero(), [11.9, 0.08, 2.85], materials.steel);
  roofEdge.parent = container;
  roofEdge.position.set(0, 1.38, 0);
}

function createConcreteBarrier(
  solid: SolidBuilder,
  decoration: DecorationBuilder,
  materials: DistrictMaterials,
  x: number,
  z: number,
  rotation: number,
  name: string,
) {
  const barrier = solid(name, new Vector3(x, 0.75, z), [5.5, 1.5, 0.7], materials.concrete);
  barrier.rotation.y = rotation;
  createSafetyStripe(decoration, barrier.position.add(new Vector3(0, 0.1, -0.38)), [4.5, 0.18, 0.03], materials.safety, `${name} stripe`);
}

function createConcreteBarrierFromMaterials(
  decoration: DecorationBuilder,
  materials: DistrictMaterials,
  x: number,
  z: number,
  rotation: number,
  name: string,
) {
  const barrier = decoration(name, new Vector3(x, 0.75, z), [5.5, 1.5, 0.7], materials.concrete);
  barrier.rotation.y = rotation;
}

function createGuardBooth(solid: SolidBuilder, decoration: DecorationBuilder, materials: DistrictMaterials, position: Vector3) {
  solid("yard guard booth body", position, [4.2, 3.2, 4.2], materials.darkConcrete);
  addWindowBand(decoration, materials, position.x, position.y + 0.85, position.z - 2.15, 3.3, 0, "guard booth windows");
  decoration("yard guard booth roof", position.add(new Vector3(0, 1.8, 0)), [4.8, 0.35, 4.8], materials.rustedSteel);
}

function createForklift(solid: SolidBuilder, decoration: DecorationBuilder, materials: DistrictMaterials, position: Vector3, rotation: number, name: string) {
  const body = solid(name, position, [2.6, 1.45, 3.7], materials.safety);
  body.rotation.y = rotation;
  const mast = solid(`${name} mast`, position.add(new Vector3(0, 1.6, 1.6)), [0.16, 3.2, 0.16], materials.steel);
  mast.rotation.y = rotation;
  decoration(`${name} forks`, position.add(new Vector3(0, 0.4, 2.7)), [1.7, 0.14, 1.8], materials.steel).rotation.y = rotation;
}

function createDamagedTruck(solid: SolidBuilder, decoration: DecorationBuilder, materials: DistrictMaterials, position: Vector3, rotation: number, name: string) {
  const cab = solid(`${name} cab`, position, [2.8, 2.3, 4.1], materials.paintedSteel);
  cab.rotation.y = rotation;
  const bed = solid(`${name} bed`, position.add(new Vector3(0, 0.15, -3)), [3.2, 1.8, 3.6], materials.rustedSteel);
  bed.rotation.y = rotation;
  for (const side of [-1, 1]) {
    const wheel = MeshBuilder.CreateCylinder(`${name} wheel ${side}`, { height: 0.45, diameter: 1.05, tessellation: 12 }, materials.steel.getScene());
    wheel.position.copyFrom(position.add(new Vector3(side * 1.5, -0.5, 0.8)));
    wheel.rotation.z = Math.PI / 2;
    wheel.rotation.y = rotation;
    wheel.material = materials.darkConcrete;
    wheel.isPickable = false;
  }
}

function createCrane(solid: SolidBuilder, decoration: DecorationBuilder, materials: DistrictMaterials, position: Vector3) {
  const upright = solid("container crane upright", position, [1.2, 13, 1.2], materials.rustedSteel);
  const arm = decoration("container crane arm", position.add(new Vector3(10, 5.3, 0)), [21, 0.8, 1.1], materials.rustedSteel);
  const hook = decoration("container crane hook", position.add(new Vector3(18, 1.4, 0)), [0.18, 6.2, 0.18], materials.steel);
  upright.rotation.z = -0.05;
  arm.rotation.z = -0.08;
  hook.rotation.z = 0.08;
}

function createGenerator(
  solid: SolidBuilder,
  decoration: DecorationBuilder,
  materials: DistrictMaterials,
  x: number,
  z: number,
  index: number,
) {
  solid(`utility generator ${index}`, new Vector3(x, 1.3, z), [5.2, 2.6, 3.4], materials.rustedSteel);
  decoration(`utility generator grille ${index}`, new Vector3(x, 1.4, z - 1.73), [3.6, 1.4, 0.04], materials.steel);
}

function createPipeRun(decoration: DecorationBuilder, materials: DistrictMaterials, position: Vector3, length: number, name: string) {
  const pipe = MeshBuilder.CreateCylinder(name, { height: length, diameter: 0.65, tessellation: 14 }, materials.steel.getScene());
  pipe.position.copyFrom(position);
  pipe.rotation.z = Math.PI / 2;
  pipe.material = materials.steel;
  pipe.isPickable = false;
  for (let offset = -length / 2 + 2; offset < length / 2; offset += 5) {
    const ring = decoration(`${name} support ${offset}`, position.add(new Vector3(offset, -0.35, 0)), [0.18, 0.55, 0.8], materials.rustedSteel);
    ring.rotation.z = Math.PI / 2;
  }
}

function createUtilityLamp(decoration: DecorationBuilder, materials: DistrictMaterials, x: number, z: number, index: number) {
  decoration(`utility lamp housing ${index}`, new Vector3(x, 4.4, z), [0.75, 0.22, 0.75], materials.glow);
}

function createCommunicationsTower(decoration: DecorationBuilder, materials: DistrictMaterials, position: Vector3) {
  const tower = MeshBuilder.CreateCylinder("central communications mast", { height: 22, diameterTop: 0.4, diameterBottom: 1.8, tessellation: 10 }, materials.steel.getScene());
  tower.position.copyFrom(position);
  tower.material = materials.steel;
  tower.isPickable = false;
  for (let y = 6; y < 22; y += 5) {
    decoration(`communications mast beacon ${y}`, position.add(new Vector3(0, y - 10.5, 0)), [0.72, 0.3, 0.72], materials.glow);
  }
}

function createControlBank(decoration: DecorationBuilder, materials: DistrictMaterials, position: Vector3, name: string) {
  const bank = decoration(name, position, [7.4, 0.85, 1.2], materials.darkConcrete);
  bank.rotation.x = -0.18;
  decoration(`${name} screen amber`, position.add(new Vector3(-2.1, 0.52, -0.65)), [1.7, 0.42, 0.05], materials.glow);
  decoration(`${name} screen blue`, position.add(new Vector3(2.1, 0.52, -0.65)), [1.7, 0.42, 0.05], materials.glass);
}

function createOfficeFurniture(decoration: DecorationBuilder, materials: DistrictMaterials, position: Vector3, name: string) {
  decoration(`${name} desk`, position, [5.6, 1.3, 1.4], materials.wood);
  decoration(`${name} monitor left`, position.add(new Vector3(-1.5, 1.05, -0.55)), [1.1, 0.8, 0.12], materials.glass);
  decoration(`${name} monitor right`, position.add(new Vector3(1.5, 1.05, -0.55)), [1.1, 0.8, 0.12], materials.glass);
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
) {
  const ramp = solid(name, position, [width, 0.25, run], material);
  ramp.rotation.x = Math.atan2(rise, run);
  ramp.rotation.y = rotation;
  walkableSurfaces.push(ramp);
  return ramp;
}

function createRailings(
  solid: SolidBuilder,
  materials: DistrictMaterials,
  x: number,
  y: number,
  z: number,
  width: number,
  depth: number,
  name: string,
  rampAccess: "west" | "both",
) {
  solid(`${name} front`, new Vector3(x, y, z - depth / 2), [width, 0.85, 0.1], materials.steel);
  solid(`${name} back`, new Vector3(x, y, z + depth / 2), [width, 0.85, 0.1], materials.steel);
  if (rampAccess !== "west") solid(`${name} left`, new Vector3(x - width / 2, y, z), [0.1, 0.85, depth], materials.steel);
  if (rampAccess !== "both") solid(`${name} right`, new Vector3(x + width / 2, y, z), [0.1, 0.85, depth], materials.steel);
}

function createSafetyStripe(
  decoration: DecorationBuilder,
  position: Vector3,
  size: [number, number, number],
  material: PBRMaterial,
  name: string,
) {
  decoration(name, position, size, material);
}

function addWindowBand(
  decoration: DecorationBuilder,
  materials: DistrictMaterials,
  x: number,
  y: number,
  z: number,
  length: number,
  rotation: number,
  name: string,
) {
  const windowBand = decoration(name, new Vector3(x, y, z), [length, 1.5, 0.08], materials.glass);
  windowBand.rotation.y = rotation;
  for (let offset = -length / 2 + 2; offset < length / 2; offset += 4) {
    const frame = decoration(`${name} frame ${offset}`, new Vector3(x + offset * Math.cos(rotation), y, z - offset * Math.sin(rotation)), [0.18, 1.8, 0.13], materials.steel);
    frame.rotation.y = rotation;
  }
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
  const texture = new DynamicTexture(`${name} texture`, { width: 1024, height: 256 }, materials.darkConcrete.getScene(), true);
  const context = texture.getContext() as CanvasRenderingContext2D;
  context.fillStyle = "#101819";
  context.fillRect(0, 0, 1024, 256);
  context.fillStyle = "#d6b75c";
  context.font = "bold 76px Arial";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(text, 512, 130);
  texture.update();
  const signMaterial = new StandardMaterial(`${name} material`, materials.darkConcrete.getScene());
  signMaterial.diffuseTexture = texture;
  signMaterial.emissiveColor = new Color3(0.12, 0.1, 0.04);
  const sign = decoration(name, position, [width, height, 0.08], signMaterial);
  sign.rotation.y = Math.PI;
}

type SolidBuilder = (
  name: string,
  position: Vector3,
  size: [number, number, number],
  material: PBRMaterial,
) => Mesh;

type DecorationBuilder = (
  name: string,
  position: Vector3,
  size: [number, number, number],
  material: PBRMaterial | StandardMaterial,
) => Mesh;

type DistrictMaterials = ReturnType<typeof createDistrictMaterials>;

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
    groundTexture.uScale = surface === "asphalt" ? 17 : 5;
    groundTexture.vScale = surface === "asphalt" ? 16 : 5;
    result.albedoTexture = groundTexture;
    return result;
  }

  const texture = new DynamicTexture(`${name} weathering`, { width: 256, height: 256 }, scene, false);
  const context = texture.getContext();
  context.fillStyle = `rgb(${Math.round(color.r * 255)}, ${Math.round(color.g * 255)}, ${Math.round(color.b * 255)})`;
  context.fillRect(0, 0, 256, 256);
  context.fillStyle = "rgba(220, 186, 118, 0.11)";
  for (let index = 0; index < 30; index++) {
    const x = (index * 43 + 19) % 256;
    const y = (index * 71 + 7) % 256;
    context.fillRect(x, y, 2 + (index % 4), 18 + ((index * 13) % 28));
  }
  context.strokeStyle = surface === "steel" ? "rgba(15, 9, 4, 0.35)" : "rgba(190, 190, 170, 0.12)";
  context.lineWidth = surface === "steel" ? 3 : 1;
  for (let index = 0; index < 16; index++) {
    const x = (index * 53) % 256;
    const y = (index * 37) % 256;
    context.beginPath();
    context.moveTo(x, y);
    context.lineTo((x + 38) % 256, (y + 13) % 256);
    context.stroke();
  }
  texture.wrapU = Texture.WRAP_ADDRESSMODE;
  texture.wrapV = Texture.WRAP_ADDRESSMODE;
  texture.uScale = 2;
  texture.vScale = 2;
  texture.update();
  result.albedoTexture = texture;
  return result;
}
