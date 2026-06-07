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
  if (level === "locality") return "Locality area";
  return "Approximate area";
}

function roundedCoords(
  lat: number | null,
  lon: number | null,
  precision: SharedFind["location_precision"],
): { lat: number; lon: number } | null {
  if (lat == null || lon == null) return null;
  if (precision === "100m") {
    return {
      lat: Math.round(lat * 1000) / 1000,
      lon: Math.round(lon * 1000) / 1000,
    };
  }
  if (precision === "1km" || precision === "locality") {
    return {
      lat: Math.round(lat * 100) / 100,
      lon: Math.round(lon * 100) / 100,
    };
  }
  return { lat, lon };
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

  const hasPublicPin =
    publicLat != null &&
    publicLon != null &&
    !(publicLat === 0 && publicLon === 0);

  if (precision !== "exact") {
    const approximate = hasPublicPin
      ? roundedCoords(publicLat, publicLon, precision)
      : roundedCoords(exactLat, exactLon, precision);
    if (approximate) {
      return {
        lat: approximate.lat,
        lon: approximate.lon,
        label: locationPrecisionLabel(precision),
        isPrecise: false,
      };
    }

    return {
      lat: null,
      lon: null,
      label: "Location unavailable",
      isPrecise: false,
    };
  }

  if (find.precision_locked === true) {
    return {
      lat: hasPublicPin ? publicLat : null,
      lon: hasPublicPin ? publicLon : null,
      label: hasPublicPin ? locationPrecisionLabel(precision) : "Location unavailable",
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
