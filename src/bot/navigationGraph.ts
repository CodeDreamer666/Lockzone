import type {
  LayoutPoint,
  NavigationNodeDefinition,
} from "../map/mapLayout";

export function findNavigationPath(
  nodes: readonly NavigationNodeDefinition[],
  start: LayoutPoint,
  destination: LayoutPoint,
) {
  if (nodes.length === 0) return [];

  const startNode = nearestNode(nodes, start);
  const destinationNode = nearestNode(nodes, destination);
  if (!startNode || !destinationNode) return [];

  const nodesById = new Map(nodes.map((node) => [node.id, node]));
  const open = new Set([startNode.id]);
  const previous = new Map<string, string>();
  const cost = new Map<string, number>([[startNode.id, 0]]);
  const estimated = new Map<string, number>([
    [
      startNode.id,
      navigationDistance(startNode.position, destinationNode.position),
    ],
  ]);

  while (open.size > 0) {
    const currentId = [...open].sort(
      (left, right) => (
        (estimated.get(left) ?? Infinity)
        - (estimated.get(right) ?? Infinity)
      ),
    )[0];
    if (currentId === destinationNode.id) {
      return rebuildPath(
        nodesById,
        previous,
        currentId,
      );
    }

    open.delete(currentId);
    const current = nodesById.get(currentId);
    if (!current) continue;

    for (const neighborId of current.neighbors) {
      const neighbor = nodesById.get(neighborId);
      if (!neighbor) continue;
      const candidateCost = (
        (cost.get(currentId) ?? Infinity)
        + navigationDistance(current.position, neighbor.position)
      );
      if (candidateCost >= (cost.get(neighborId) ?? Infinity)) continue;

      previous.set(neighborId, currentId);
      cost.set(neighborId, candidateCost);
      estimated.set(
        neighborId,
        candidateCost
          + navigationDistance(
            neighbor.position,
            destinationNode.position,
          ),
      );
      open.add(neighborId);
    }
  }

  return [];
}

export function validateNavigationGraph(
  nodes: readonly NavigationNodeDefinition[],
) {
  const ids = new Set(nodes.map((node) => node.id));
  const duplicateIds = nodes
    .map((node) => node.id)
    .filter((id, index, all) => all.indexOf(id) !== index);
  const missingNeighbors = nodes.flatMap((node) => (
    node.neighbors
      .filter((neighbor) => !ids.has(neighbor))
      .map((neighbor) => `${node.id}->${neighbor}`)
  ));
  const asymmetricEdges = nodes.flatMap((node) => (
    node.neighbors
      .filter((neighborId) => {
        const neighbor = nodes.find(
          (candidate) => candidate.id === neighborId,
        );
        return neighbor && !neighbor.neighbors.includes(node.id);
      })
      .map((neighbor) => `${node.id}->${neighbor}`)
  ));

  return {
    duplicateIds,
    missingNeighbors,
    asymmetricEdges,
  };
}

function nearestNode(
  nodes: readonly NavigationNodeDefinition[],
  point: LayoutPoint,
) {
  return [...nodes].sort(
    (left, right) => (
      navigationDistance(left.position, point)
      - navigationDistance(right.position, point)
    ),
  )[0];
}

function rebuildPath(
  nodesById: Map<string, NavigationNodeDefinition>,
  previous: Map<string, string>,
  destinationId: string,
) {
  const ids = [destinationId];
  let currentId = destinationId;

  while (previous.has(currentId)) {
    currentId = previous.get(currentId)!;
    ids.unshift(currentId);
  }

  return ids
    .map((id) => nodesById.get(id))
    .filter((node): node is NavigationNodeDefinition => node !== undefined);
}

function navigationDistance(left: LayoutPoint, right: LayoutPoint) {
  const vertical = (right.y - left.y) * 1.35;
  return Math.hypot(
    right.x - left.x,
    vertical,
    right.z - left.z,
  );
}
