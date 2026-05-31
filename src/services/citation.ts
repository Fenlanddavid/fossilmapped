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
  keywords = {${find.period}, ${find.stage ? find.stage + ', ' : ''}${find.taxon}}
}`;
}
