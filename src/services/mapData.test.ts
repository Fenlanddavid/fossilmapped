import { describe, expect, it } from 'vitest'
import { SharedFind } from '../types'
import { buildMapFindCollections } from './mapData'

const baseFind: SharedFind = {
  id: 'FM-2026-TEST',
  collectorName: 'D. Smith',
  taxon: 'Gryphaea',
  locationName: 'Lyme Regis',
  latitude: 50.725234,
  longitude: -2.934567,
  dateCollected: '2026-02-20',
  photos: [],
  isPublic: true,
  sharedAt: '2026-02-21T12:00:00.000Z',
}

describe('buildMapFindCollections', () => {
  it('keeps approximate public records visible as pins but out of the cluster source', () => {
    const approximate: SharedFind = {
      ...baseFind,
      id: 'FM-2026-APPROX',
      location_precision: '100m',
      precision_locked: true,
      public_latitude: 54.441,
      public_longitude: -0.523,
    }
    const exact: SharedFind = {
      ...baseFind,
      id: 'FM-2026-EXACT',
      latitude: 54.4291556249708,
      longitude: -0.532394159802436,
      location_precision: 'exact',
      precision_locked: false,
    }

    const collections = buildMapFindCollections([approximate, exact])

    expect(collections.pins.features.map((feature) => feature.properties.id)).toEqual([
      'FM-2026-APPROX',
      'FM-2026-EXACT',
    ])
    expect(collections.clusters.features.map((feature) => feature.properties.id)).toEqual([
      'FM-2026-EXACT',
    ])
  })

  it('drops records without displayable public coordinates', () => {
    const collections = buildMapFindCollections([{
      ...baseFind,
      latitude: Number.NaN,
      longitude: Number.NaN,
      public_latitude: null,
      public_longitude: null,
    }])

    expect(collections.pins.features).toHaveLength(0)
    expect(collections.clusters.features).toHaveLength(0)
  })
})
