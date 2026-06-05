export interface SharedFind {
  id: string;
  collectorName: string;
  collectorEmail?: string;
  taxon: string;
  element?: string;
  period?: string;
  stage?: string;
  locationName: string;
  latitude: number;
  longitude: number;
  public_latitude?: number | null;
  public_longitude?: number | null;
  location_precision?: 'exact' | '100m' | '1km' | 'locality';
  precision_locked?: boolean;
  dateCollected: string;
  photos: string[]; // Base64 or Cloud URLs
  measurements?: {
    length?: number;
    width?: number;
    thickness?: number;
    weight?: number;
  };
  repository?: string;
  accession_id?: string;
  quality_score?: number;
  formation?: string;
  member?: string;
  bed?: string;
  notes?: string;
  isPublic: boolean;
  sharedAt: string;
  verification_status?: 'community' | 'verified' | 'research_grade';
}
