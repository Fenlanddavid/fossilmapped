import { SharedFind } from "../types";
import { displayCoords } from "./precision";

export function exportToCSV(finds: SharedFind[]) {
  const headers = [
    "HRID", "Taxon", "Element", "Period", "Stage", "Formation", 
    "Latitude", "Longitude", "Location Precision", "Precise Location",
    "Date Collected", "Collector", "Repository", "Quality Score", "Notes"
  ].map(csvCell).join(",");

  const rows = finds.map(f => {
    const coords = displayCoords(f);
    return [
      f.id,
      f.taxon,
      f.element || "",
      f.period,
      f.stage || "",
      f.formation || "",
      coords.lat ?? "",
      coords.lon ?? "",
      coords.label,
      coords.isPrecise ? "yes" : "no",
      f.dateCollected,
      f.collectorName,
      f.repository || "Private",
      f.quality_score ?? 0,
      f.notes || ""
    ].map(csvCell).join(",");
  });

  const csv = [headers, ...rows].join("\n");
  downloadFile(csv, "fossilmapped_dataset.csv", "text/csv");
}

export function exportToJSON(finds: SharedFind[]) {
  const json = JSON.stringify(finds.map(publicExportFind), null, 2);
  downloadFile(json, "fossilmapped_dataset.json", "application/json");
}

function publicExportFind(find: SharedFind) {
  const coords = displayCoords(find);
  return {
    ...find,
    latitude: coords.lat,
    longitude: coords.lon,
    public_latitude: coords.lat,
    public_longitude: coords.lon,
    location_label: coords.label,
    precise_location: coords.isPrecise,
  };
}

function downloadFile(content: string, filename: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function csvCell(value: unknown): string {
  let text = value == null ? "" : String(value);
  text = text.replace(/\r?\n|\r/g, " ");
  if (/^[=+\-@]/.test(text.trimStart())) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}
