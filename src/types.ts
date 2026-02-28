export interface SharedFind {
  id: string;
  collectorName: string;
  taxon: string;
  element?: string;
  period?: string;
  locationName: string;
  latitude: number;
  longitude: number;
  dateCollected: string;
  photos: string[]; // Base64 or Cloud URLs
  measurements?: {
    length?: number;
    width?: number;
    thickness?: number;
    weight?: number;
  };
  notes?: string;
  isPublic: boolean;
  sharedAt: string;
}
