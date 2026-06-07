import { describe, expect, it } from 'vitest'
import { SharedFind } from '../types'
import { displayCoords, locationPrecisionLabel } from './precision'

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

describe('displayCoords', () => {
  it('renders a visible approximate marker for 100m rows without public coordinates', () => {
    const coords = displayCoords({
      ...baseFind,
      location_precision: '100m',
      precision_locked: true,
    })

    expect(coords).toEqual({
      lat: 50.725,
      lon: -2.935,
      label: '~100m area',
      isPrecise: false,
    })
  })

  it('renders locality rows as coarse area markers instead of hiding them', () => {
    const coords = displayCoords({
      ...baseFind,
      public_latitude: 0,
      public_longitude: 0,
      location_precision: 'locality',
      precision_locked: true,
    })

    expect(coords).toEqual({
      lat: 50.73,
      lon: -2.93,
      label: 'Locality area',
      isPrecise: false,
    })
    expect(locationPrecisionLabel('locality')).toBe('Locality area')
  })
})
