import { SharedFind } from '../types';
import { displayCoords } from './precision';

// Deterministic jitter from a string — same find always lands at the same offset.
function idJitter(id: string, range: number): { dlat: number; dlon: number } {
  let h1 = 0, h2 = 0;
  for (let i = 0; i < id.length; i++) {
    const c = id.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x9e3779b9) >>> 0;
    h2 = Math.imul(h2 ^ c, 0x85ebca6b) >>> 0;
  }
  // Map 0–0xFFFFFFFF → -range..+range
  const dlat = ((h1 / 0xFFFFFFFF) * 2 - 1) * range;
  const dlon = ((h2 / 0xFFFFFFFF) * 2 - 1) * range;
  return { dlat, dlon };
}

const JITTER_BY_PRECISION: Record<string, number> = {
  '1km':      0.003,   // ~330m — well within the 1km area
  '100m':     0.0003,  // ~33m  — well within the 100m area
  'locality': 0.005,
};

export type MapFindProperties = {
  id: string;
  verification_status: string;
  is_precise: boolean;
  location_precision: NonNullable<SharedFind['location_precision']>;
};

export type MapFindFeature = GeoJSON.Feature<GeoJSON.Point, MapFindProperties>;
export type MapFindCollection = GeoJSON.FeatureCollection<GeoJSON.Point, MapFindProperties>;

export function emptyMapFindCollection(): MapFindCollection {
  return { type: 'FeatureCollection', features: [] };
}

export function buildMapFindCollections(finds: SharedFind[]): {
  pins: MapFindCollection;
  clusters: MapFindCollection;
} {
  const features = finds.flatMap((find): MapFindFeature[] => {
    const coords = displayCoords(find);
    if (coords.lat == null || coords.lon == null) return [];

    const precision = find.location_precision ?? 'exact';
    const jitterRange = JITTER_BY_PRECISION[precision] ?? 0;
    const { dlat, dlon } = jitterRange > 0 ? idJitter(find.id, jitterRange) : { dlat: 0, dlon: 0 };

    return [{
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [coords.lon + dlon, coords.lat + dlat] },
      properties: {
        id: find.id,
        verification_status: find.verification_status ?? 'community',
        is_precise: coords.isPrecise,
        location_precision: precision,
      },
    }];
  });

  return {
    pins: { type: 'FeatureCollection', features },
    clusters: { type: 'FeatureCollection', features: features.filter((feature) => feature.properties.is_precise) },
  };
}
