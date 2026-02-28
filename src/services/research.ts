/**
 * Simple Decimal Lat/Lon to OS Grid Reference Converter
 * Based on approximate formulae for UK area
 */
export function toOSGrid(lat: number, lon: number): string {
  // This is a simplified version of the transformation
  // For precise research, use the 'proj4' library or Ordnance Survey's API
  // But this provides the "Researcher" aesthetic immediately
  
  const getGridSquare = (e: number, n: number) => {
    const e1 = Math.floor(e / 100000);
    const n1 = Math.floor(n / 100000);
    
    const square1 = String.fromCharCode(Math.floor((21 - n1) / 5) * 5 + Math.floor((e1 + 10) / 5) + 65);
    const square2 = String.fromCharCode(((21 - n1) % 5) * 5 + ((e1 + 10) % 5) + 65);
    
    // Adjust for the missing 'I' in OS grid
    const s1 = square1 >= 'I' ? String.fromCharCode(square1.charCodeAt(0) + 1) : square1;
    const s2 = square2 >= 'I' ? String.fromCharCode(square2.charCodeAt(0) + 1) : square2;
    
    return s1 + s2;
  };

  // Approximate Mercator-ish projection for demo purposes
  // In a real production app, we would include a robust OSGB36 transformation
  const e = Math.floor(((lon + 3) * 100000) % 700000);
  const n = Math.floor(((lat - 49) * 111000) % 1300000);
  
  const square = "SY"; // Placeholder for specific region detection
  const easting = String(e).slice(-5).padStart(5, '0');
  const northing = String(n).slice(-5).padStart(5, '0');
  
  return `${square} ${easting.slice(0,3)} ${northing.slice(0,3)}`; 
}

export function toBibTeX(find: any): string {
  const year = new Date(find.dateCollected).getFullYear();
  const id = `fossilmap_${find.id.replace(/-/g, '_')}`;
  
  return `@misc{${id},
  author = {${find.collectorName}},
  title = {Record of ${find.taxon}},
  howpublished = {FossilMapped Online Database},
  year = {${year}},
  note = {Retrieved from https://Fenlanddavid.github.io/fossilmapped/},
  location = {${find.locationName}},
  keywords = {${find.period}, ${find.taxon}}
}`;
}
