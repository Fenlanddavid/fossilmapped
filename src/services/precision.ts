import { SharedFind } from "../types";

export type DisplayCoords = {
  lat: number | null;
  lon: number | null;
  label: string;
  isPrecise: boolean;
};

function numberOrNull(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function locationPrecisionLabel(level: SharedFind["location_precision"]): string {
  if (level === "exact") return "Exact GPS";
  if (level === "100m") return "~100m area";
  if (level === "1km") return "~1km area";
  if (level === "locality") return "Locality name only";
  return "Approximate area";
}

export function displayCoords(find: SharedFind): DisplayCoords {
  const exactLat = numberOrNull(find.latitude);
  const exactLon = numberOrNull(find.longitude);
  const publicLat = numberOrNull(find.public_latitude);
  const publicLon = numberOrNull(find.public_longitude);
  const precision = find.location_precision ?? "exact";
  const isVerifiedPlus =
    find.verification_status === "verified" ||
    find.verification_status === "research_grade";

  if (isVerifiedPlus && exactLat != null && exactLon != null) {
    return {
      lat: exactLat,
      lon: exactLon,
      label: `${exactLat.toFixed(6)}, ${exactLon.toFixed(6)}`,
      isPrecise: true,
    };
  }

  if (precision === "locality") {
    return {
      lat: null,
      lon: null,
      label: "Locality name only",
      isPrecise: false,
    };
  }

  const hasPublicPin =
    publicLat != null &&
    publicLon != null &&
    !(publicLat === 0 && publicLon === 0);

  if (find.precision_locked === true) {
    return {
      lat: hasPublicPin ? publicLat : null,
      lon: hasPublicPin ? publicLon : null,
      label: hasPublicPin ? locationPrecisionLabel(precision) : "Locality name only",
      isPrecise: false,
    };
  }

  const lat = publicLat ?? exactLat;
  const lon = publicLon ?? exactLon;
  if (lat == null || lon == null) {
    return {
      lat: null,
      lon: null,
      label: "Location unavailable",
      isPrecise: false,
    };
  }

  return {
    lat,
    lon,
    label: `${lat.toFixed(4)}, ${lon.toFixed(4)}`,
    isPrecise: true,
  };
}
