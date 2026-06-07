import { SharedFind } from '../types';
import { displayCoords } from './precision';

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

    return [{
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [coords.lon, coords.lat] },
      properties: {
        id: find.id,
        verification_status: find.verification_status ?? 'community',
        is_precise: coords.isPrecise,
        location_precision: find.location_precision ?? 'exact',
      },
    }];
  });

  return {
    pins: { type: 'FeatureCollection', features },
    clusters: {
      type: 'FeatureCollection',
      features: features.filter((feature) => feature.properties.is_precise),
    },
  };
}
