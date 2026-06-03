import { SharedFind } from "../types";

export function exportToCSV(finds: SharedFind[]) {
  const headers = [
    "HRID", "Taxon", "Element", "Period", "Stage", "Formation", 
    "Latitude", "Longitude", "Date Collected", "Collector", "Repository", 
    "Quality Score", "Notes"
  ].map(csvCell).join(",");

  const rows = finds.map(f => [
    f.id,
    f.taxon,
    f.element || "",
    f.period,
    f.stage || "",
    f.formation || "",
    f.latitude,
    f.longitude,
    f.dateCollected,
    f.collectorName,
    f.repository || "Private",
    f.quality_score ?? 0,
    f.notes || ""
  ].map(csvCell).join(","));

  const csv = [headers, ...rows].join("\n");
  downloadFile(csv, "fossilmapped_dataset.csv", "text/csv");
}

export function exportToJSON(finds: SharedFind[]) {
  const json = JSON.stringify(finds, null, 2);
  downloadFile(json, "fossilmapped_dataset.json", "application/json");
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
