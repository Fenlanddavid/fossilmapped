import { describe, expect, it } from 'vitest'
import { bibEscape, toBibTeX } from './citation'
import { SharedFind } from '../types'

describe('bibEscape', () => {
  it('escapes BibTeX and LaTeX special characters', () => {
    expect(bibEscape('Gryphaea & arcuata')).toBe('Gryphaea \\& arcuata')
    expect(bibEscape('Formation_Member')).toBe('Formation\\_Member')
    expect(bibEscape('Score: 80%')).toBe('Score: 80\\%')
    expect(bibEscape('A{B} #1 $x')).toBe('A\\{B\\} \\#1 \\$x')
  })
})

describe('toBibTeX', () => {
  it('uses escaped record fields in the generated citation', () => {
    const find: SharedFind = {
      id: 'FM-2026-TEST_1',
      collectorName: 'D. Smith & Co',
      taxon: 'Gryphaea_arcuata',
      element: 'Valve',
      period: 'Jurassic',
      stage: 'Sinemurian',
      formation: 'Blue_Lias',
      locationName: 'Lyme Regis',
      latitude: 50.7252,
      longitude: -2.9345,
      dateCollected: '2026-02-20',
      photos: [],
      isPublic: true,
      sharedAt: '2026-02-21T12:00:00.000Z',
      repository: 'Private',
      notes: 'Score: 80%',
      measurements: { length: 55 },
    }

    const bibtex = toBibTeX(find)

    expect(bibtex).toContain('@misc{FM_2026_TEST_1')
    expect(bibtex).toContain('author = {D. Smith \\& Co}')
    expect(bibtex).toContain('title = {FossilMapped record: {Gryphaea\\_arcuata}}')
    expect(bibtex).toContain('Blue\\_Lias')
    expect(bibtex).toContain('Score: 80\\%')
  })
})
