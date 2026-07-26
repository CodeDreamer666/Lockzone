import assert from "node:assert/strict";
import {
  findNavigationPath,
  validateNavigationGraph,
} from "../src/bot/navigationGraph.ts";
import { COMPACT_MAP_LAYOUT } from "../src/map/mapLayout.ts";

const graph = COMPACT_MAP_LAYOUT.navigationNodes;
const validation = validateNavigationGraph(graph);

assert.deepEqual(validation.duplicateIds, [], "navigation node IDs are unique");
assert.deepEqual(
  validation.missingNeighbors,
  [],
  "all navigation neighbors exist",
);
assert.deepEqual(
  validation.asymmetricEdges,
  [],
  "all navigation edges are traversable in both directions",
);

const elevatedDestinations = ["platform-deck"];
for (const spawn of COMPACT_MAP_LAYOUT.botSpawns) {
  for (const destinationId of elevatedDestinations) {
    const destination = graph.find((node) => node.id === destinationId);
    assert.ok(destination, `${destinationId} exists`);
    const path = findNavigationPath(graph, spawn, destination.position);
    assert.ok(
      path.length >= 2,
      `spawn ${spawn.x},${spawn.z} can reach ${destinationId}`,
    );
    assert.equal(
      path.at(-1)?.id,
      destinationId,
      `path terminates on ${destinationId}`,
    );
  }
}

for (const [platformId, routes] of Object.entries(
  COMPACT_MAP_LAYOUT.elevatedAccessRoutes,
)) {
  assert.ok(routes.length >= 2, `${platformId} cannot be locked to one route`);
  assert.equal(
    new Set(routes).size,
    routes.length,
    `${platformId} access routes are distinct`,
  );
}

console.log("Navigation graph and elevated access verification passed.");
