import { SharedFind } from '../types'
import { displayCoords } from './precision'

/** Returns the measurement entries for a find in a human-readable format. */
function measurementEntries(find: SharedFind): [string, string][] {
  const raw = find.measurements as Record<string, unknown> | null | undefined
  if (!raw) return []
  const entries = Object.entries(raw)
    .filter(([, value]) => value != null)
    .map(([key, value]) => [key.replace(/([A-Z])/g, ' $1'), String(value)] as [string, string])
  return entries
}

/**
 * Generates a BibTeX citation string for a shared find record.
 * This is the canonical bridge between FossilMapped domain objects and BibTeX output.
 */
export function toBibTeX(find: SharedFind): string {
  const date = find.sharedAt ? new Date(find.sharedAt) : new Date()
  const year = Number.isFinite(date.getTime()) ? date.getFullYear() : new Date().getFullYear()
  const month = Number.isFinite(date.getTime()) ? date.toLocaleString('en-GB', { month: 'long' }) : ''
  const strat = [find.period, find.stage, find.formation, find.member, find.bed].filter(Boolean).join('; ')
  const dims = measurementEntries(find).map(([key, value]) => `${key}: ${value}`).join(', ')
  const coords = displayCoords(find)

  return `@misc{${find.id.replace(/[^a-zA-Z0-9_]/g, '_')},
  author = {${bibEscape(find.collectorName)}},
  title = {FossilMapped record: {${bibEscape(find.taxon)}}},
  howpublished = {\\url{https://Fenlanddavid.github.io/fossilmapped/}},
  year = {${year}},
  month = {${month}},
  note = {FossilMapped ID: ${bibEscape(find.id)}. Stratigraphy: ${bibEscape(strat || 'Unknown')}. Provenance: ${bibEscape(find.locationName)} (${bibEscape(coords.label)}). Repository: ${bibEscape(find.repository || 'Private')}.${dims ? ` Measurements: ${bibEscape(dims)}.` : ''}${find.notes ? ` Notes: ${bibEscape(find.notes)}.` : ''}}
}`
}

export function bibEscape(value: string): string {
  if (typeof value !== 'string') return ''
  return value
    .replace(/\\/g, '\\\\')   // must be first — escapes the escape char
    .replace(/\$/g, '\\$')    // math mode delimiter
    .replace(/\{/g, '\\{')    // brace open
    .replace(/\}/g, '\\}')    // brace close
    .replace(/%/g, '\\%')     // BibTeX comment character
    .replace(/&/g, '\\&')     // alignment char in LaTeX tables
    .replace(/#/g, '\\#')     // parameter char
    .replace(/_/g, '\\_')     // subscript
    .replace(/\^/g, '\\^{}')  // superscript
    .replace(/~/g, '\\~{}')   // non-breaking space
}
