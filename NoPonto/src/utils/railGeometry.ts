export type GeoJsonCoordinate = [number, number]; // [longitude, latitude]

export interface PreparedRailGeometry {
  coordinates: GeoJsonCoordinate[];
  segmentLengths: number[];
  cumulativeDistances: number[];
  totalLengthMetres: number;
}

export class PromiseCache<T> {
  private readonly values = new Map<string, Promise<T>>();

  get(key: string, factory: () => Promise<T>) {
    let value = this.values.get(key);
    if (!value) {
      value = factory();
      this.values.set(key, value);
    }
    return value;
  }

  clear() {
    this.values.clear();
  }
}

const EARTH_RADIUS_METRES = 6_371_008.8;
const radians = (degrees: number) => (degrees * Math.PI) / 180;

export function haversineMetres(a: GeoJsonCoordinate, b: GeoJsonCoordinate) {
  const lat1 = radians(a[1]);
  const lat2 = radians(b[1]);
  const dLat = lat2 - lat1;
  const dLng = radians(b[0] - a[0]);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_METRES * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function prepareRailGeometry(
  coordinates: GeoJsonCoordinate[],
): PreparedRailGeometry {
  const segmentLengths: number[] = [];
  const cumulativeDistances = [0];
  let totalLengthMetres = 0;
  for (let index = 1; index < coordinates.length; index += 1) {
    const length = haversineMetres(coordinates[index - 1], coordinates[index]);
    segmentLengths.push(length);
    totalLengthMetres += length;
    cumulativeDistances.push(totalLengthMetres);
  }
  return {
    coordinates,
    segmentLengths,
    cumulativeDistances,
    totalLengthMetres,
  };
}

export function coordinateAtDistance(
  geometry: PreparedRailGeometry,
  distanceMetres: number,
): GeoJsonCoordinate | null {
  const {
    coordinates,
    segmentLengths,
    cumulativeDistances,
    totalLengthMetres,
  } = geometry;
  if (coordinates.length === 0) return null;
  if (coordinates.length === 1 || distanceMetres <= 0) return coordinates[0];
  if (distanceMetres >= totalLengthMetres)
    return coordinates[coordinates.length - 1];
  let low = 0;
  let high = segmentLengths.length - 1;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (cumulativeDistances[middle + 1] < distanceMetres) low = middle + 1;
    else high = middle;
  }
  const start = coordinates[low];
  const end = coordinates[low + 1];
  const length = segmentLengths[low];
  const ratio =
    length > 0 ? (distanceMetres - cumulativeDistances[low]) / length : 0;
  return [
    start[0] + ratio * (end[0] - start[0]),
    start[1] + ratio * (end[1] - start[1]),
  ];
}

export function bearingAtDistance(
  geometry: PreparedRailGeometry,
  distanceMetres: number,
): number | null {
  if (geometry.totalLengthMetres <= 0) return null;
  const delta = Math.min(20, Math.max(3, geometry.totalLengthMetres * 0.001));
  const before = coordinateAtDistance(
    geometry,
    Math.max(0, distanceMetres - delta),
  );
  const after = coordinateAtDistance(
    geometry,
    Math.min(geometry.totalLengthMetres, distanceMetres + delta),
  );
  if (!before || !after) return null;
  const lat1 = radians(before[1]);
  const lat2 = radians(after[1]);
  const dLng = radians(after[0] - before[0]);
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  if (Math.abs(x) < 1e-12 && Math.abs(y) < 1e-12) return null;
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

export function railDistanceAtTime(
  state: string,
  distanceAtReferenceMetres: number,
  referenceTimeUtc: string,
  targetDistanceMetres: number,
  targetTimeUtc: string,
  freshUntilUtc: string,
  nowMs: number,
) {
  if (state !== "InSegment" || nowMs > Date.parse(freshUntilUtc))
    return distanceAtReferenceMetres;
  const reference = Date.parse(referenceTimeUtc);
  const target = Date.parse(targetTimeUtc);
  if (
    !Number.isFinite(reference) ||
    !Number.isFinite(target) ||
    target <= reference
  )
    return distanceAtReferenceMetres;
  const progress = Math.max(
    0,
    Math.min(1, (nowMs - reference) / (target - reference)),
  );
  return (
    distanceAtReferenceMetres +
    progress * (targetDistanceMetres - distanceAtReferenceMetres)
  );
}
