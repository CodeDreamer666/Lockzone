export const DISTRICT_SIZE = 80;
export const QUADRANT_SIZE = DISTRICT_SIZE / 2;
export const SAFE_ZONE_SIZE = 5;

export interface HorizontalPosition {
  x: number;
  z: number;
}

export interface SafeZoneDefinition {
  id: string;
  center: HorizontalPosition;
  size: number;
}

const SAFE_ZONE_OFFSET = 34;

export const SAFE_ZONES: readonly SafeZoneDefinition[] = [
  {
    id: "southwest",
    center: { x: -SAFE_ZONE_OFFSET, z: -SAFE_ZONE_OFFSET },
    size: SAFE_ZONE_SIZE,
  },
  {
    id: "southeast",
    center: { x: SAFE_ZONE_OFFSET, z: -SAFE_ZONE_OFFSET },
    size: SAFE_ZONE_SIZE,
  },
  {
    id: "northwest",
    center: { x: -SAFE_ZONE_OFFSET, z: SAFE_ZONE_OFFSET },
    size: SAFE_ZONE_SIZE,
  },
  {
    id: "northeast",
    center: { x: SAFE_ZONE_OFFSET, z: SAFE_ZONE_OFFSET },
    size: SAFE_ZONE_SIZE,
  },
] as const;

export function isInsideSafeZone(position: HorizontalPosition) {
  return SAFE_ZONES.some((zone) => {
    const halfSize = zone.size / 2;
    return (
      Math.abs(position.x - zone.center.x) <= halfSize
      && Math.abs(position.z - zone.center.z) <= halfSize
    );
  });
}

export function movementEntersSafeZone(
  start: HorizontalPosition,
  end: HorizontalPosition,
) {
  return SAFE_ZONES.some((zone) => {
    const halfSize = zone.size / 2;
    const minimumX = zone.center.x - halfSize;
    const maximumX = zone.center.x + halfSize;
    const minimumZ = zone.center.z - halfSize;
    const maximumZ = zone.center.z + halfSize;
    const deltaX = end.x - start.x;
    const deltaZ = end.z - start.z;
    let entry = 0;
    let exit = 1;

    for (const [startValue, delta, minimum, maximum] of [
      [start.x, deltaX, minimumX, maximumX],
      [start.z, deltaZ, minimumZ, maximumZ],
    ]) {
      if (delta === 0) {
        if (startValue < minimum || startValue > maximum) return false;
        continue;
      }

      const first = (minimum - startValue) / delta;
      const second = (maximum - startValue) / delta;
      entry = Math.max(entry, Math.min(first, second));
      exit = Math.min(exit, Math.max(first, second));
      if (entry > exit) return false;
    }

    return exit >= 0 && entry <= 1;
  });
}
