import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle,
  Archive,
  Award,
  BarChart3,
  Calendar,
  CheckCircle2,
  ChevronRight,
  Copy,
  Database,
  Download,
  Eye,
  Filter,
  Globe,
  Grid,
  Hash,
  Image,
  Info,
  Layers,
  Link,
  List,
  Lock,
  Mail,
  Map as MapIcon,
  MapPin,
  RefreshCw,
  Ruler,
  Search,
  ShieldCheck,
  Trash2,
  User,
  X,
} from 'lucide-react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { SharedFind } from './types'
import { canModerateSharedFinds, deleteSharedFind, getSharedFinds, promoteVerification } from './services/supabase'
import { exportToCSV, exportToJSON } from './services/export'
import { displayCoords } from './services/precision'
import { toBibTeX } from './services/citation'
import { buildMapFindCollections, emptyMapFindCollection } from './services/mapData'
import { formatOsGridRef } from './services/osGrid'

const ADMIN_PIN = (import.meta.env.VITE_ADMIN_PIN as string | undefined)?.trim()
const FINDS_PINS_SOURCE = 'finds-pins'
const FINDS_CLUSTERS_SOURCE = 'finds-clusters'

type ActiveTab = 'map' | 'database' | 'gallery' | 'stats'
type SourceStatus = 'loading' | 'live' | 'demo' | 'empty'

type RawSharedFind = Record<string, unknown>

const TABS: Array<{ id: ActiveTab; label: string; shortLabel: string; icon: React.ComponentType<{ className?: string }> }> = [
  { id: 'map', label: 'Spatial Map', shortLabel: 'Map', icon: MapIcon },
  { id: 'database', label: 'Record List', shortLabel: 'Records', icon: List },
  { id: 'gallery', label: 'Visual Gallery', shortLabel: 'Gallery', icon: Grid },
  { id: 'stats', label: 'Analytics', shortLabel: 'Stats', icon: BarChart3 },
]

const MOCK_FINDS: SharedFind[] = [
  {
    id: 'FMP-2026-001',
    collectorName: 'D. Johnston',
    collectorEmail: 'research@example.org',
    taxon: 'Hildoceras bifrons',
    element: 'Complete phragmocone',
    period: 'Jurassic',
    stage: 'Toarcian',
    formation: 'Whitby Mudstone',
    member: 'Alum Shale',
    locationName: 'Whitby, North Yorkshire',
    latitude: 54.4858,
    longitude: -0.6206,
    public_latitude: 54.486,
    public_longitude: -0.621,
    location_precision: '100m',
    precision_locked: true,
    coordinates_released: false,
    dateCollected: '2026-02-15',
    photos: [],
    sharedAt: '2026-02-16',
    isPublic: true,
    repository: 'Private collection',
    accession_id: 'FM-DJ-2026-001',
    quality_score: 86,
    measurements: { length: 45, width: 38, thickness: 12, weight: 85 },
    notes: 'Found in situ within the Alum Shale Member. Excellent suturing preserved.',
  },
  {
    id: 'FMP-2026-002',
    collectorName: 'S. Miller',
    taxon: 'Gryphaea arcuata',
    element: 'Left valve',
    period: 'Jurassic',
    stage: 'Sinemurian',
    formation: 'Blue Lias',
    locationName: 'Lyme Regis, Dorset',
    latitude: 50.7252,
    longitude: -2.9345,
    public_latitude: 50.7252,
    public_longitude: -2.9345,
    location_precision: 'exact',
    precision_locked: false,
    coordinates_released: false,
    dateCollected: '2026-02-20',
    photos: [],
    sharedAt: '2026-02-21',
    isPublic: true,
    repository: 'Private',
    quality_score: 68,
    measurements: { length: 55, width: 42, thickness: 25, weight: 120 },
  },
]

function App() {
  const [searchQuery, setSearchQuery] = useState('')
  const [activeTab, setActiveTab] = useState<ActiveTab>('map')
  const [selectedFind, setSelectedFind] = useState<SharedFind | null>(null)
  const [finds, setFinds] = useState<SharedFind[]>([])
  const [loading, setLoading] = useState(true)
  const [loadTick, setLoadTick] = useState(0)
  const [sourceStatus, setSourceStatus] = useState<SourceStatus>('loading')
  const [sourceMessage, setSourceMessage] = useState('')
  const [showFilters, setShowFilters] = useState(false)
  const [selectedPeriod, setSelectedPeriod] = useState('All')
  const [contactableOnly, setContactableOnly] = useState(false)
  const [withPhotosOnly, setWithPhotosOnly] = useState(false)
  const [highQualityOnly, setHighQualityOnly] = useState(false)
  const [mapHudDismissed, setMapHudDismissed] = useState(false)
  const [showRecentFinds, setShowRecentFinds] = useState(false)
  const [verificationFilter, setVerificationFilter] = useState<'All' | 'community' | 'verified' | 'research_grade'>('All')
  const [notice, setNotice] = useState<string | null>(null)
  const [autoOpenId, setAutoOpenId] = useState<string | null>(() => new URLSearchParams(window.location.search).get('find'))
  const [showAbout, setShowAbout] = useState(false)
  const [isAdmin, setIsAdmin] = useState(false)
  const [showAdminLogin, setShowAdminLogin] = useState(false)
  const [adminPinInput, setAdminPinInput] = useState('')
  const [adminPinError, setAdminPinError] = useState(false)
  const [mapSourceVersion, setMapSourceVersion] = useState(0)
  const [showBlockingLoad, setShowBlockingLoad] = useState(true)
  const mapContainer = useRef<HTMLDivElement>(null)
  const map = useRef<maplibregl.Map | null>(null)

  useEffect(() => {
    const timer = window.setTimeout(() => setShowBlockingLoad(false), 1500)
    return () => window.clearTimeout(timer)
  }, [])

  useEffect(() => {
    if (selectedFind) {
      window.history.pushState({}, '', `?find=${encodeURIComponent(selectedFind.id)}`)
    } else {
      window.history.pushState({}, '', window.location.pathname)
    }
  }, [selectedFind])

  useEffect(() => {
    async function loadData() {
      setLoading(true)
      setSourceStatus('loading')
      try {
        const rawData = await getSharedFinds()
        const data = dedupeRawFinds(rawData).map(mapRawFind).filter((find): find is SharedFind => !!find)
        setFinds(data)
        setSourceStatus(data.length > 0 ? 'live' : 'empty')
        setSourceMessage(data.length > 0 ? 'Live shared registry' : 'The shared registry is reachable but has no public records yet.')
        if (autoOpenId) {
          const target = data.find((f) => f.id === autoOpenId)
          if (target) setSelectedFind(target)
          setAutoOpenId(null)
        }
      } catch (error) {
        console.error('Failed to fetch finds:', error)
        setFinds(MOCK_FINDS)
        setSourceStatus('demo')
        setSourceMessage(error instanceof Error ? error.message : 'Live registry unavailable. Showing demo records.')
      } finally {
        setLoading(false)
      }
    }
    loadData()
  }, [loadTick])

  const filteredFinds = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    return finds.filter((find) => {
      if (selectedPeriod !== 'All' && normalise(find.period) !== selectedPeriod) return false
      if (contactableOnly && !find.collectorEmail) return false
      if (withPhotosOnly && (!find.photos || find.photos.length === 0)) return false
      if (highQualityOnly && getQuality(find) < 70) return false
      if (verificationFilter !== 'All' && (find.verification_status || 'community') !== verificationFilter) return false
      if (!q) return true
      return [
        find.id,
        find.taxon,
        find.element,
        find.period,
        find.stage,
        find.formation,
        find.member,
        find.bed,
        find.locationName,
        find.collectorName,
        find.repository,
        find.accession_id,
      ].some((value) => normalise(value).toLowerCase().includes(q))
    })
  }, [contactableOnly, finds, highQualityOnly, searchQuery, selectedPeriod, verificationFilter, withPhotosOnly])

  const periods = useMemo(() => {
    const values = Array.from(new Set(finds.map((find) => normalise(find.period)).filter(Boolean)))
    return ['All', ...values.sort((a, b) => a.localeCompare(b))]
  }, [finds])

  const analytics = useMemo(() => buildAnalytics(finds), [finds])
  const filteredAnalytics = useMemo(() => buildAnalytics(filteredFinds), [filteredFinds])
  const activeFilterCount = [selectedPeriod !== 'All', contactableOnly, withPhotosOnly, highQualityOnly, verificationFilter !== 'All'].filter(Boolean).length

  function clearFilters() {
    setSearchQuery('')
    setSelectedPeriod('All')
    setContactableOnly(false)
    setWithPhotosOnly(false)
    setHighQualityOnly(false)
    setVerificationFilter('All')
  }

  function requestAccess(find: SharedFind) {
    if (!find.collectorEmail) return
    const subject = encodeURIComponent(`Access request: ${find.taxon} (${find.id})`)
    const body = encodeURIComponent(
      `Hello ${find.collectorName},\n\nI saw your find of ${find.taxon} on FossilMapped and would like to request more information or access for research purposes.\n\nRecord: ${find.id}\nLocation: ${find.locationName}`
    )
    window.location.href = `mailto:${find.collectorEmail}?subject=${subject}&body=${body}`
  }

  async function promoteFind(find: SharedFind, status: 'community' | 'verified' | 'research_grade') {
    if (!isAdmin) {
      setNotice('Admin mode is locked.')
      return
    }
    if (!canModerateSharedFinds()) {
      setNotice('Moderation writes need a configured trusted server function.')
      return
    }
    const label = status === 'research_grade' ? 'Research Grade' : status.charAt(0).toUpperCase() + status.slice(1)
    const confirmed = window.confirm(`Promote ${find.id} to ${label}? This will be visible on FossilMapped.`)
    if (!confirmed) return
    try {
      await promoteVerification(find.id, status, { coordinatesReleased: false })
      const updated: SharedFind = { ...find, verification_status: status, coordinates_released: false }
      setFinds(prev => prev.map(f => f.id === find.id ? updated : f))
      setSelectedFind(updated)
    } catch (e: any) {
      setNotice(`Promote failed: ${e?.message ?? 'Unknown error'}`)
    }
  }

  async function deleteFind(find: SharedFind) {
    if (!isAdmin) {
      setNotice('Admin mode is locked.')
      return
    }
    if (!canModerateSharedFinds()) {
      setNotice('Delete needs a configured trusted server function.')
      return
    }
    const confirmed = window.confirm(`Delete ${find.id} from FossilMapped? This hides the record from the public map and database.`)
    if (!confirmed) return
    try {
      await deleteSharedFind(find.id)
      setFinds(prev => prev.filter(f => f.id !== find.id))
      setSelectedFind(null)
      setNotice(`Deleted ${find.id} from FossilMapped.`)
    } catch (e: any) {
      setNotice(`Delete failed: ${e?.message ?? 'Unknown error'}`)
    }
  }

  function handleAdminLogin(e: React.FormEvent) {
    e.preventDefault()
    if (ADMIN_PIN && adminPinInput.trim() === ADMIN_PIN) {
      setIsAdmin(true)
      setShowAdminLogin(false)
      setAdminPinInput('')
      setAdminPinError(false)
    } else {
      setAdminPinError(true)
      setAdminPinInput('')
    }
  }

  function downloadBibTeX(find: SharedFind) {
    const bibtex = toBibTeX(find)
    const blob = new Blob([bibtex], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${find.id.replace(/[-\s]+/g, '_')}.bib`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    setNotice(`Citation downloaded for ${find.taxon}`)
  }

  useEffect(() => {
    if (!notice) return
    const timer = window.setTimeout(() => setNotice(null), 3200)
    return () => window.clearTimeout(timer)
  }, [notice])

  useEffect(() => {
    if (activeTab !== 'map' || !mapContainer.current || map.current) return

    map.current = new maplibregl.Map({
      container: mapContainer.current,
      style: 'https://tiles.openfreemap.org/styles/bright',
      center: [-2.0, 54.0],
      zoom: 5.5,
      clickTolerance: 40,
    })

    map.current.on('error', (e) => {
      console.warn('MapLibre error:', e.error?.message ?? e)
      // Show a notice if the map style fails to load (e.g. OpenFreemap unavailable).
      if (e.error?.message?.includes('style') || e.error?.message?.includes('fetch')) {
        setNotice('Map tiles unavailable — check your connection.')
      }
    })

    map.current.on('load', () => {
      const emptyData = emptyMapFindCollection()
      map.current?.addSource(FINDS_CLUSTERS_SOURCE, {
        type: 'geojson',
        cluster: true,
        clusterMaxZoom: 10,
        clusterRadius: 36,
        data: emptyData,
      })

      map.current?.addSource(FINDS_PINS_SOURCE, {
        type: 'geojson',
        data: emptyData,
      })

      // Cluster circle
      map.current?.addLayer({
        id: 'finds-cluster',
        type: 'circle',
        source: FINDS_CLUSTERS_SOURCE,
        filter: ['has', 'point_count'],
        paint: {
          'circle-color': '#f59e0b',
          'circle-radius': ['step', ['get', 'point_count'], 18, 10, 24, 50, 30],
          'circle-opacity': 0.82,
          'circle-stroke-width': 2,
          'circle-stroke-color': '#ffffff',
        },
      })

      // Cluster count label
      map.current?.addLayer({
        id: 'finds-cluster-count',
        type: 'symbol',
        source: FINDS_CLUSTERS_SOURCE,
        filter: ['has', 'point_count'],
        layout: {
          'text-field': '{point_count_abbreviated}',
          'text-size': 11,
          'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
        },
        paint: { 'text-color': '#000000' },
      })

      // Soft halo for non-exact public locations.
      map.current?.addLayer({
        id: 'finds-approx-area',
        type: 'circle',
        source: FINDS_PINS_SOURCE,
        filter: ['==', ['get', 'is_precise'], false],
        paint: {
          'circle-color': '#f59e0b',
          'circle-radius': ['match', ['get', 'location_precision'], '100m', 18, '1km', 26, 'locality', 34, 20],
          'circle-opacity': 0.16,
          'circle-stroke-width': 1,
          'circle-stroke-color': '#fbbf24',
          'circle-stroke-opacity': 0.38,
        },
      })

      // Individual pins — precise finds only; approximate finds show as halo only
      map.current?.addLayer({
        id: 'finds-layer',
        type: 'circle',
        source: FINDS_PINS_SOURCE,
        filter: ['==', ['get', 'is_precise'], true],
        paint: {
          'circle-color': ['match', ['get', 'verification_status'], 'research_grade', '#10b981', 'verified', '#38bdf8', '#f59e0b'],
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 5, 8, 10, 12, 15, 18],
          'circle-stroke-width': 2,
          'circle-stroke-color': '#ffffff',
          'circle-opacity': 0.86,
        },
      })

      // Cluster click — zoom to bounds
      map.current?.on('click', 'finds-cluster', (e) => {
        const features = map.current!.queryRenderedFeatures(e.point, { layers: ['finds-cluster'] })
        const clusterId = features[0]?.properties?.cluster_id
        if (!clusterId) return
        const source = map.current!.getSource(FINDS_CLUSTERS_SOURCE) as maplibregl.GeoJSONSource
        source.getClusterExpansionZoom(clusterId).then((zoom) => {
          const coords = (features[0].geometry as GeoJSON.Point).coordinates as [number, number]
          map.current!.easeTo({ center: coords, zoom })
        }).catch(() => {})
      })

      map.current?.on('mouseenter', 'finds-cluster', () => {
        map.current!.getCanvas().style.cursor = 'pointer'
      })
      map.current?.on('mouseleave', 'finds-cluster', () => {
        map.current!.getCanvas().style.cursor = ''
      })

      map.current?.on('mouseenter', 'finds-layer', () => {
        map.current!.getCanvas().style.cursor = 'pointer'
      })
      map.current?.on('mouseleave', 'finds-layer', () => {
        map.current!.getCanvas().style.cursor = ''
      })

      setMapSourceVersion((version) => version + 1)
    })

    window.setTimeout(() => map.current?.resize(), 100)

    return () => {
      map.current?.remove()
      map.current = null
    }
  }, [activeTab])

  useEffect(() => {
    if (!map.current || loading) return

    const updateData = () => {
      if (!map.current?.isStyleLoaded()) {
        map.current?.once('idle', updateData)
        return
      }
      const pinSource = map.current.getSource(FINDS_PINS_SOURCE) as maplibregl.GeoJSONSource | undefined
      const clusterSource = map.current.getSource(FINDS_CLUSTERS_SOURCE) as maplibregl.GeoJSONSource | undefined
      if (!pinSource || !clusterSource) {
        map.current?.once('idle', updateData)
        return
      }
      const collections = buildMapFindCollections(filteredFinds)
      pinSource.setData(collections.pins)
      clusterSource.setData(collections.clusters)
      map.current?.triggerRepaint()
    }

    if (map.current.isStyleLoaded()) updateData()
    else map.current.once('idle', updateData)
  }, [filteredFinds, loading, mapSourceVersion])

  useEffect(() => {
    const mapInstance = map.current
    if (!mapInstance) return

    const onClick = (event: maplibregl.MapMouseEvent) => {
      if (!mapInstance.getLayer('finds-layer')) return
      const bbox: [[number, number], [number, number]] = [
        [event.point.x - 32, event.point.y - 32],
        [event.point.x + 32, event.point.y + 32],
      ]
      const features = mapInstance.queryRenderedFeatures(bbox, { layers: ['finds-layer', 'finds-approx-area'] })
      const findId = features[0]?.properties?.id
      const found = filteredFinds.find((find) => find.id === findId)
      if (found) setSelectedFind(found)
    }

    mapInstance.on('click', onClick)
    return () => {
      mapInstance.off('click', onClick)
    }
  }, [filteredFinds, activeTab])

  return (
    <div className="fixed inset-0 flex flex-col overflow-hidden bg-[#05070b] text-white font-sans">
      {loading && showBlockingLoad && <LoadingOverlay />}

      {notice && (
        <div className="fixed right-4 top-4 z-[120] flex items-center gap-2 rounded-lg border border-emerald-400/25 bg-emerald-500/15 px-4 py-3 text-xs font-bold text-emerald-100 shadow-2xl backdrop-blur">
          <CheckCircle2 className="h-4 w-4 text-emerald-300" />
          {notice}
        </div>
      )}

      <header className="shrink-0 border-b border-white/10 bg-[#0d1117]/95 shadow-2xl backdrop-blur">
        <div className="flex min-w-0 items-center justify-between gap-3 px-3 py-3 sm:px-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-accent text-black shadow-lg shadow-accent/10">
              <Database className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-base font-black uppercase tracking-tight sm:text-lg">FossilMapped</h1>
              <p className="text-[9px] font-black uppercase tracking-[0.16em] text-accent sm:text-[10px]">
                <span className="sm:hidden">Research portal</span>
                <span className="hidden sm:inline">Shared palaeo research portal</span>
              </p>
            </div>
          </div>

          <div className="hidden items-center gap-1 rounded-lg border border-white/10 bg-black/30 p-1 lg:flex">
            <button onClick={clearFilters} className="rounded-md bg-white/5 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-white">
              Public Records
            </button>
            <button
              onClick={() => {
                setContactableOnly(true)
                setShowFilters(true)
                setActiveTab('database')
              }}
              className="rounded-md px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-white/45 transition-colors hover:text-white"
            >
              Research Requests
            </button>
          </div>

          <div className="flex min-w-0 items-center gap-2">
            <div className="relative hidden sm:block">
              <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/35" />
              <input
                placeholder="Search taxon, ID, region..."
                className="h-9 w-56 rounded-lg border border-white/10 bg-black/35 pl-9 pr-3 text-xs outline-none transition-all focus:border-accent/60 xl:w-72"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
              />
            </div>

            <a
              href="https://fenlanddavid.github.io/fossilmap/"
              target="_blank"
              rel="noopener noreferrer"
              className="hidden h-9 items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 text-[10px] font-black uppercase tracking-wide text-white/60 transition-colors hover:bg-white/10 hover:text-white sm:inline-flex"
            >
              Record with FossilMap →
            </a>

            <DataStatusPill status={sourceStatus} />

            <button
              onClick={() => setShowAbout(true)}
              className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-white/10 bg-white/5 text-white/60 transition-colors hover:bg-white/10 hover:text-white"
              title="About this dataset"
              aria-label="About this dataset"
            >
              <Info className="h-4 w-4" />
            </button>

            <button
              onClick={() => setLoadTick((n) => n + 1)}
              className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-white/10 bg-white/5 text-white/60 transition-colors hover:bg-white/10 hover:text-white"
              title="Refresh registry"
              aria-label="Refresh registry"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
            <button
              onClick={() => setShowFilters((value) => !value)}
              className={`relative grid h-9 w-9 shrink-0 place-items-center rounded-lg border transition-colors ${
                showFilters || activeFilterCount
                  ? 'border-accent/40 bg-accent/15 text-accent'
                  : 'border-white/10 bg-white/5 text-white/60 hover:bg-white/10 hover:text-white'
              }`}
              title="Filter records"
              aria-label="Filter records"
              aria-pressed={showFilters}
            >
              <Filter className="h-4 w-4" />
              {activeFilterCount > 0 && <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-accent px-1 text-[9px] font-black text-black">{activeFilterCount}</span>}
            </button>
            {ADMIN_PIN && (
              <button
                onClick={() => isAdmin ? setIsAdmin(false) : setShowAdminLogin(true)}
                className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg border transition-colors ${
                  isAdmin
                    ? 'border-amber-500/40 bg-amber-500/15 text-amber-400'
                    : 'border-white/10 bg-white/5 text-white/30 hover:bg-white/10 hover:text-white/60'
                }`}
                title={isAdmin ? 'Admin mode active — click to lock' : 'Admin login'}
                aria-label={isAdmin ? 'Lock admin mode' : 'Admin login'}
              >
                {isAdmin ? <ShieldCheck className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
              </button>
            )}
          </div>
        </div>
      </header>

      <nav className="flex h-12 shrink-0 items-stretch gap-1 overflow-x-auto border-b border-white/10 bg-[#090c10] px-2 scrollbar-hide sm:px-4">
        {TABS.map((tab) => {
          const Icon = tab.icon
          const active = activeTab === tab.id
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex min-w-[4.9rem] shrink-0 items-center justify-center gap-1.5 border-b-2 px-2 text-[10px] font-black uppercase tracking-wide transition-all sm:min-w-0 sm:px-4 ${
                active ? 'border-accent text-accent' : 'border-transparent text-white/40 hover:text-white'
              }`}
            >
              <Icon className="h-3.5 w-3.5 shrink-0" />
              <span className="sm:hidden">{tab.shortLabel}</span>
              <span className="hidden sm:inline">{tab.label}</span>
            </button>
          )
        })}
      </nav>

      <div className="shrink-0 border-b border-white/10 bg-[#0d1117]/90">
        <div className="flex min-w-0 items-center gap-2 px-3 py-2 sm:hidden">
          <div className="relative min-w-0 flex-1">
            <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/35" />
            <input
              placeholder="Search records"
              className="h-9 w-full rounded-lg border border-white/10 bg-black/35 pl-9 pr-3 text-xs outline-none focus:border-accent/60"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
            />
          </div>
          <button onClick={clearFilters} className="h-9 rounded-lg border border-white/10 px-3 text-[10px] font-black uppercase text-white/55">
            Clear
          </button>
        </div>

        {showFilters && (
          <FilterPanel
            periods={periods}
            selectedPeriod={selectedPeriod}
            setSelectedPeriod={setSelectedPeriod}
            contactableOnly={contactableOnly}
            setContactableOnly={setContactableOnly}
            withPhotosOnly={withPhotosOnly}
            setWithPhotosOnly={setWithPhotosOnly}
            highQualityOnly={highQualityOnly}
            setHighQualityOnly={setHighQualityOnly}
            verificationFilter={verificationFilter}
            setVerificationFilter={setVerificationFilter}
            clearFilters={clearFilters}
          />
        )}
      </div>

      {sourceStatus === 'demo' && !loading && (
        <div className="shrink-0 border-b border-amber-500/20 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-100 sm:px-4">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-300" />
            <span className="min-w-0 truncate">{sourceMessage || 'Live registry unavailable. Showing demo records.'}</span>
          </div>
        </div>
      )}

      <div className="relative flex min-h-0 flex-1 overflow-hidden">
        <main className="relative flex min-w-0 flex-1 flex-col">
          <div className="relative min-h-0 flex-1">
            {activeTab === 'map' && (
              <>
                <div ref={mapContainer} className="absolute inset-0 h-full w-full" />
                <MapHUD
                  total={filteredFinds.length}
                  allTotal={finds.length}
                  sourceStatus={sourceStatus}
                  quality={filteredAnalytics.averageQuality}
                  activeFilterCount={activeFilterCount}
                  clearFilters={clearFilters}
                  dismissed={mapHudDismissed}
                  dismiss={() => setMapHudDismissed(true)}
                />
                <RecentFindsPanel
                  finds={filteredFinds}
                  setSelectedFind={setSelectedFind}
                  open={showRecentFinds}
                  setOpen={setShowRecentFinds}
                />
              </>
            )}

            {activeTab === 'database' && (
              <DatabaseView
                finds={filteredFinds}
                allCount={finds.length}
                setSelectedFind={setSelectedFind}
                clearFilters={clearFilters}
              />
            )}

            {activeTab === 'gallery' && (
              <GalleryView finds={filteredFinds} setSelectedFind={setSelectedFind} clearFilters={clearFilters} />
            )}

            {activeTab === 'stats' && (
              <AnalyticsView
                analytics={analytics}
                filteredAnalytics={filteredAnalytics}
                filteredFinds={filteredFinds}
                sourceMessage={sourceMessage}
                sourceStatus={sourceStatus}
              />
            )}
          </div>
        </main>

        <ResearchSidebar analytics={analytics} activity={analytics.activity} sourceStatus={sourceStatus} />
      </div>

      {selectedFind && (
        <FindDetailModal
          find={selectedFind}
          close={() => setSelectedFind(null)}
          downloadBibTeX={downloadBibTeX}
          requestAccess={requestAccess}
          isAdmin={isAdmin}
          onPromote={promoteFind}
          onDelete={deleteFind}
          moderationAvailable={canModerateSharedFinds()}
        />
      )}

      {showAbout && <AboutModal close={() => setShowAbout(false)} />}

      {showAdminLogin && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
          <button className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => { setShowAdminLogin(false); setAdminPinInput(''); setAdminPinError(false); }} aria-label="Close" />
          <form onSubmit={handleAdminLogin} className="relative w-full max-w-xs rounded-xl border border-amber-500/25 bg-[#0d1117] p-6 shadow-2xl">
            <div className="mb-4 flex items-center gap-2">
              <Lock className="h-4 w-4 text-amber-400" />
              <span className="text-sm font-black uppercase tracking-widest text-amber-400">Admin login</span>
            </div>
            <p className="mb-4 text-[11px] leading-relaxed text-white/45">This unlocks local review controls. Registry permissions still depend on Supabase policies.</p>
            <input
              type="password"
              placeholder="Enter PIN"
              autoFocus
              value={adminPinInput}
              onChange={e => { setAdminPinInput(e.target.value); setAdminPinError(false); }}
              className={`mb-3 h-10 w-full rounded-lg border bg-black/40 px-3 text-sm outline-none transition-colors focus:border-amber-500/60 ${adminPinError ? 'border-red-500/60 text-red-400' : 'border-white/15 text-white'}`}
            />
            {adminPinError && <p className="mb-3 text-[10px] font-bold text-red-400">Incorrect PIN</p>}
            <button type="submit" className="h-10 w-full rounded-lg bg-amber-500 text-xs font-black uppercase tracking-wider text-black transition-opacity hover:opacity-90">
              Unlock
            </button>
          </form>
        </div>
      )}
    </div>
  )
}

function LoadingOverlay() {
  return (
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-6 bg-[#05070b]">
      <div className="relative">
        <div className="absolute inset-0 h-24 w-24 animate-ping rounded-full border border-accent/25" />
        <div className="relative grid h-24 w-24 place-items-center rounded-full border border-white/10 bg-surface shadow-2xl shadow-accent/15">
          <Globe className="h-10 w-10 animate-pulse text-accent" />
        </div>
      </div>
      <div className="px-4 text-center">
        <h2 className="text-xl font-black uppercase tracking-[0.3em]">FossilMapped</h2>
        <div className="my-4 flex justify-center gap-3">
          <div className="h-2 w-2 animate-bounce rounded-full bg-accent [animation-delay:-0.3s]" />
          <div className="h-2 w-2 animate-bounce rounded-full bg-accent [animation-delay:-0.15s]" />
          <div className="h-2 w-2 animate-bounce rounded-full bg-accent" />
        </div>
        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/40">Synchronizing shared registry</p>
      </div>
    </div>
  )
}

function DataStatusPill({ status }: { status: SourceStatus }) {
  const label = status === 'live' ? 'Live' : status === 'demo' ? 'Demo' : status === 'empty' ? 'Empty' : 'Sync'
  const tone = status === 'live'
    ? 'border-emerald-400/25 bg-emerald-400/10 text-emerald-200'
    : status === 'demo'
    ? 'border-amber-400/25 bg-amber-400/10 text-amber-200'
    : 'border-white/10 bg-white/5 text-white/50'
  return (
    <span className={`hidden h-9 items-center rounded-lg border px-3 text-[10px] font-black uppercase tracking-wider sm:inline-flex ${tone}`}>
      {label}
    </span>
  )
}

function FilterPanel(props: {
  periods: string[]
  selectedPeriod: string
  setSelectedPeriod: (value: string) => void
  contactableOnly: boolean
  setContactableOnly: (value: boolean) => void
  withPhotosOnly: boolean
  setWithPhotosOnly: (value: boolean) => void
  highQualityOnly: boolean
  setHighQualityOnly: (value: boolean) => void
  verificationFilter: string
  setVerificationFilter: (value: any) => void
  clearFilters: () => void
}) {
  const verificationOptions: Array<{ id: string; label: string }> = [
    { id: 'All', label: 'All records' },
    { id: 'research_grade', label: 'Research Grade' },
    { id: 'verified', label: 'Verified' },
    { id: 'community', label: 'Community' },
  ]

  return (
    <div className="grid gap-3 px-3 py-3 sm:px-4">
      <div className="flex min-w-0 items-center gap-2 overflow-x-auto scrollbar-hide">
        <span className="shrink-0 text-[10px] font-black uppercase tracking-widest text-white/35">Period</span>
        {props.periods.map((period) => (
          <button
            key={period}
            onClick={() => props.setSelectedPeriod(period)}
            className={`shrink-0 rounded-lg border px-3 py-1.5 text-[10px] font-black uppercase transition-colors ${
              props.selectedPeriod === period ? 'border-accent bg-accent text-black' : 'border-white/10 bg-white/5 text-white/60 hover:text-white'
            }`}
          >
            {period}
          </button>
        ))}
      </div>

      <div className="flex min-w-0 flex-wrap gap-2">
        <span className="shrink-0 self-center text-[10px] font-black uppercase tracking-widest text-white/35">Status</span>
        {verificationOptions.map((opt) => (
          <button
            key={opt.id}
            onClick={() => props.setVerificationFilter(opt.id)}
            className={`shrink-0 rounded-lg border px-3 py-1.5 text-[10px] font-black uppercase transition-colors ${
              props.verificationFilter === opt.id
                ? opt.id === 'research_grade' ? 'border-emerald-400/70 bg-emerald-400/15 text-emerald-300'
                  : opt.id === 'verified' ? 'border-sky-400/70 bg-sky-400/15 text-sky-300'
                  : 'border-accent bg-accent text-black'
                : 'border-white/10 bg-white/5 text-white/60 hover:text-white'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <div className="flex min-w-0 gap-2 overflow-x-auto scrollbar-hide">
        <ToggleChip label="Contactable" active={props.contactableOnly} setActive={props.setContactableOnly} />
        <ToggleChip label="With photos" active={props.withPhotosOnly} setActive={props.setWithPhotosOnly} />
        <ToggleChip label="Quality 70+" active={props.highQualityOnly} setActive={props.setHighQualityOnly} />
        <button onClick={props.clearFilters} className="shrink-0 rounded-lg border border-white/10 px-3 py-1.5 text-[10px] font-black uppercase text-white/50 hover:text-white">
          Reset all
        </button>
      </div>
    </div>
  )
}

function ToggleChip({ label, active, setActive }: { label: string; active: boolean; setActive: (value: boolean) => void }) {
  return (
    <button
      onClick={() => setActive(!active)}
      className={`shrink-0 rounded-lg border px-3 py-1.5 text-[10px] font-black uppercase transition-colors ${
        active ? 'border-accent/70 bg-accent/15 text-accent' : 'border-white/10 bg-white/5 text-white/55 hover:text-white'
      }`}
    >
      {label}
    </button>
  )
}

function MapHUD({ total, allTotal, sourceStatus, quality, activeFilterCount, clearFilters, dismissed, dismiss }: {
  total: number
  allTotal: number
  sourceStatus: SourceStatus
  quality: number
  activeFilterCount: number
  clearFilters: () => void
  dismissed: boolean
  dismiss: () => void
}) {
  return (
    <div className={`pointer-events-none absolute left-3 right-3 top-3 z-10 flex-col gap-3 sm:left-4 sm:right-auto sm:flex sm:w-80 ${dismissed ? 'hidden' : 'flex'}`}>
      <div className="pointer-events-auto rounded-lg border border-white/10 bg-[#0d1117]/90 p-4 shadow-2xl backdrop-blur">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-accent">Registry map</p>
            <h2 className="mt-1 text-2xl font-black">{total} records</h2>
          </div>
          <div className="flex items-center gap-2">
            <Globe className="hidden h-5 w-5 text-white/35 sm:block" />
            <button
              type="button"
              onClick={dismiss}
              className="grid h-8 w-8 place-items-center rounded-lg border border-white/10 bg-white/5 text-white/55 transition-colors hover:bg-white/10 hover:text-white sm:hidden"
              aria-label="Hide map summary"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2 text-center">
          <MiniMetric label="Total" value={allTotal} />
          <MiniMetric label="Quality" value={`${quality}%`} />
          <MiniMetric label="Source" value={sourceStatus === 'live' ? 'Live' : sourceStatus === 'demo' ? 'Demo' : 'Open'} />
        </div>
        {activeFilterCount > 0 && (
          <button onClick={clearFilters} className="mt-3 w-full rounded-lg border border-accent/25 bg-accent/10 px-3 py-2 text-[10px] font-black uppercase text-accent">
            Clear map filters
          </button>
        )}
      </div>
    </div>
  )
}

function MiniMetric({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-white/10 bg-black/25 px-2 py-2">
      <div className="text-sm font-black text-white">{value}</div>
      <div className="mt-0.5 text-[8px] font-black uppercase tracking-wider text-white/35">{label}</div>
    </div>
  )
}

function MiniLabel({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0 rounded-lg border border-white/10 bg-black/20 p-3">
      <div className="text-[8px] font-black uppercase tracking-wider text-white/35">{label}</div>
      <div className="mt-1 truncate font-bold text-white/80">{value}</div>
    </div>
  )
}

function RecentFindsPanel({ finds, setSelectedFind, open, setOpen }: {
  finds: SharedFind[]
  setSelectedFind: (find: SharedFind) => void
  open: boolean
  setOpen: (value: boolean) => void
}) {
  const recent = useMemo(
    () => [...finds].sort((a, b) => new Date(b.sharedAt).getTime() - new Date(a.sharedAt).getTime()).slice(0, 10),
    [finds]
  )

  return (
    <section className="pointer-events-none absolute bottom-3 left-3 right-3 z-10 sm:bottom-4 sm:left-4 sm:right-auto sm:w-[28rem] xl:w-[30rem]">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="pointer-events-auto mb-2 inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-accent/35 bg-[#05070b] px-3 text-[10px] font-black uppercase tracking-wider text-accent shadow-2xl transition-colors hover:border-accent hover:bg-accent hover:text-black"
        aria-expanded={open}
      >
        <List className="h-3.5 w-3.5" />
        Latest finds
        <span className="rounded bg-white/10 px-1.5 py-0.5 text-[9px]">{recent.length}</span>
      </button>

      {open && (
        <div className="pointer-events-auto overflow-hidden rounded-lg border border-white/12 bg-[#05070b] shadow-2xl">
          <div className="flex items-center justify-between border-b border-white/10 px-3 py-2">
            <div>
              <p className="text-[9px] font-black uppercase tracking-[0.18em] text-accent">Latest finds</p>
              <h2 className="text-sm font-black text-white">Recent shared records</h2>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="grid h-8 w-8 place-items-center rounded-lg border border-white/10 bg-white/5 text-white/55 transition-colors hover:bg-white/10 hover:text-white"
              aria-label="Hide latest finds"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="max-h-72 overflow-y-auto p-2 custom-scrollbar">
            {recent.length === 0 ? (
              <div className="rounded-lg border border-white/10 bg-white/5 p-4 text-sm font-bold text-white/45">
                No visible records match the current filters.
              </div>
            ) : (
              <div className="grid gap-2">
                {recent.map((find) => (
                  <button
                    key={find.id}
                    type="button"
                    onClick={() => setSelectedFind(find)}
                    className="group grid min-w-0 grid-cols-[3.5rem_1fr] gap-3 rounded-lg border border-white/10 bg-white/[0.04] p-2 text-left transition-colors hover:border-accent/45 hover:bg-accent/8"
                  >
                    <div className="aspect-square overflow-hidden rounded-md bg-white/5">
                      {find.photos?.[0] ? (
                        <img src={find.photos[0]} alt={find.taxon} className="h-full w-full object-cover" />
                      ) : (
                        <div className="grid h-full place-items-center text-white/20">
                          <Image className="h-5 w-5" />
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 self-center">
                      <div className="flex min-w-0 items-start justify-between gap-2">
                        <p className="min-w-0 truncate text-sm font-black italic text-white group-hover:text-accent">{find.taxon}</p>
                        <span className="shrink-0 text-[9px] font-bold text-white/45">{relativeDate(find.sharedAt)}</span>
                      </div>
                      <p className="mt-0.5 truncate text-[11px] font-medium text-white/60">{find.locationName}</p>
                      <p className="mt-1 truncate text-[10px] font-bold uppercase tracking-wide text-white/40">
                        {[find.formation, find.member].filter(Boolean).join(' / ') || 'No formation recorded'}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  )
}

function DatabaseView({ finds, allCount, setSelectedFind, clearFilters }: {
  finds: SharedFind[]
  allCount: number
  setSelectedFind: (find: SharedFind) => void
  clearFilters: () => void
}) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  const allSelected = finds.length > 0 && finds.every((f) => selectedIds.has(f.id))
  const someSelected = !allSelected && finds.some((f) => selectedIds.has(f.id))

  function toggleAll(checked: boolean) {
    setSelectedIds(checked ? new Set(finds.map((f) => f.id)) : new Set())
  }

  function toggleOne(id: string) {
    const next = new Set(selectedIds)
    next.has(id) ? next.delete(id) : next.add(id)
    setSelectedIds(next)
  }

  function exportSelected(format: 'csv' | 'json') {
    const subset = finds.filter((f) => selectedIds.has(f.id))
    format === 'csv' ? exportToCSV(subset) : exportToJSON(subset)
  }

  const exportTarget = selectedIds.size > 0 ? selectedIds.size : finds.length
  const exportLabel = selectedIds.size > 0 ? `Export ${selectedIds.size} selected` : `Export all ${finds.length}`

  return (
    <div className="absolute inset-0 overflow-auto bg-[#07090d]">
      <div className="sticky top-0 z-20 flex flex-col gap-3 border-b border-white/10 bg-[#0d1117]/95 p-4 backdrop-blur sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-white/40">Research dataset</p>
          <h2 className="mt-1 text-lg font-black">{finds.length} visible records{selectedIds.size > 0 && <span className="ml-2 text-sm font-bold text-accent">· {selectedIds.size} selected</span>}</h2>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => selectedIds.size > 0 ? exportSelected('csv') : exportToCSV(finds)}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-accent/25 bg-accent/10 px-3 py-2 text-[10px] font-black uppercase tracking-wider text-accent transition-colors hover:bg-accent hover:text-black"
          >
            <Download className="h-3.5 w-3.5" />
            {exportLabel} CSV
          </button>
          <button
            onClick={() => selectedIds.size > 0 ? exportSelected('json') : exportToJSON(finds)}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-[10px] font-black uppercase tracking-wider text-white/65 transition-colors hover:bg-white/10 hover:text-white"
          >
            <Download className="h-3.5 w-3.5" />
            JSON
          </button>
          {selectedIds.size > 0 && (
            <button
              onClick={() => setSelectedIds(new Set())}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-[10px] font-black uppercase tracking-wider text-white/45 transition-colors hover:bg-white/10 hover:text-white"
            >
              <X className="h-3.5 w-3.5" />
              Clear
            </button>
          )}
        </div>
      </div>

      {finds.length === 0 ? (
        <EmptyState title="No matching records" detail={`${allCount} records are available before filters.`} action="Clear filters" onAction={clearFilters} />
      ) : (
        <>
          {/* Mobile cards */}
          <div className="grid gap-3 p-4 sm:hidden">
            {finds.map((find) => {
              const checked = selectedIds.has(find.id)
              return (
                <div
                  key={find.id}
                  className={`rounded-lg border bg-surface p-4 text-left transition-colors ${checked ? 'border-accent/40 bg-accent/5' : 'border-white/10'}`}
                >
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleOne(find.id)}
                      onClick={(e) => e.stopPropagation()}
                      className="mt-1 h-4 w-4 shrink-0 accent-[var(--accent)]"
                    />
                    <button className="min-w-0 flex-1 text-left" onClick={() => setSelectedFind(find)}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate text-[11px] font-mono text-accent">{find.id}</div>
                          <h3 className="mt-2 text-lg font-black italic leading-tight">{find.taxon}</h3>
                          <p className="mt-1 text-sm text-white/45">{find.element || 'Specimen'}</p>
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-1.5">
                          <QualityBadge value={getQuality(find)} />
                          <VerificationBadge status={find.verification_status} />
                        </div>
                      </div>
                      <div className="mt-4 grid grid-cols-2 gap-2 text-[11px]">
                        <MiniLabel label="Stratigraphy" value={[find.period, find.stage || find.formation].filter(Boolean).join(' / ') || 'Unknown'} />
                        <MiniLabel label="Location" value={find.locationName} />
                        <MiniLabel label="Collector" value={find.collectorName} />
                        <MiniLabel label="Repository" value={find.repository || 'Private'} />
                      </div>
                      {find.collectorEmail && <div className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-emerald-400/10 px-2 py-1 text-[9px] font-black uppercase text-emerald-200"><Mail className="h-3 w-3" /> Contactable</div>}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Desktop table */}
          <table className="hidden w-full min-w-[980px] border-collapse text-left sm:table">
          <thead className="sticky top-[89px] z-10 border-b border-white/10 bg-[#0d1117] text-[10px] font-black uppercase tracking-widest text-white/40 sm:top-[73px]">
            <tr>
              <th className="w-10 px-4 py-4">
                <input
                  type="checkbox"
                  checked={allSelected}
                  ref={(el) => { if (el) el.indeterminate = someSelected }}
                  onChange={(e) => toggleAll(e.target.checked)}
                  className="h-4 w-4 accent-[var(--accent)]"
                  aria-label="Select all"
                />
              </th>
              <th className="px-5 py-4">Ref ID</th>
              <th className="px-5 py-4">Taxon</th>
              <th className="px-5 py-4">Stratigraphy</th>
              <th className="px-5 py-4">Location</th>
              <th className="px-5 py-4">Collector</th>
              <th className="px-5 py-4">Quality</th>
              <th className="px-5 py-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {finds.map((find) => {
              const checked = selectedIds.has(find.id)
              return (
                <tr key={find.id} onClick={() => setSelectedFind(find)} className={`group cursor-pointer transition-colors ${checked ? 'bg-accent/5 hover:bg-accent/8' : 'hover:bg-white/[0.03]'}`}>
                  <td className="w-10 px-4 py-4" onClick={(e) => { e.stopPropagation(); toggleOne(find.id) }}>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleOne(find.id)}
                      className="h-4 w-4 accent-[var(--accent)]"
                      aria-label={`Select ${find.id}`}
                    />
                  </td>
                  <td className="px-5 py-4 text-xs font-mono text-accent">{find.id}</td>
                  <td className="px-5 py-4">
                    <div className="text-sm font-bold italic">{find.taxon}</div>
                    <div className="text-[10px] text-white/40">{find.element || 'Specimen'}</div>
                  </td>
                  <td className="px-5 py-4 text-xs text-white/60">
                    <div className="font-bold">{find.period || 'Unknown'}</div>
                    <div className="text-[10px] font-black uppercase tracking-tight text-accent/80">{find.stage || find.formation || 'No finer stratigraphy'}</div>
                  </td>
                  <td className="px-5 py-4 text-xs text-white/60">{find.locationName}</td>
                  <td className="px-5 py-4 text-xs text-white/60">
                    <div>{find.collectorName}</div>
                    {find.collectorEmail && <div className="mt-1 text-[9px] font-black uppercase text-emerald-300/70">Contactable</div>}
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex flex-col gap-1.5">
                      <QualityBadge value={getQuality(find)} />
                      <VerificationBadge status={find.verification_status} />
                    </div>
                  </td>
                  <td className="px-5 py-4 text-right">
                    <button className="rounded-lg p-2 transition-all hover:bg-accent/10 hover:text-accent" aria-label={`Open ${find.id}`}>
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
          </table>
        </>
      )}
    </div>
  )
}

function GalleryView({ finds, setSelectedFind, clearFilters }: {
  finds: SharedFind[]
  setSelectedFind: (find: SharedFind) => void
  clearFilters: () => void
}) {
  if (finds.length === 0) {
    return <div className="absolute inset-0 bg-[#07090d]"><EmptyState title="No gallery records" detail="No records match the current discovery filters." action="Clear filters" onAction={clearFilters} /></div>
  }

  return (
    <div className="absolute inset-0 grid auto-rows-max grid-cols-1 gap-4 overflow-y-auto bg-[#07090d] p-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
      {finds.map((find) => (
        <button key={find.id} onClick={() => setSelectedFind(find)} className="group overflow-hidden rounded-lg border border-white/10 bg-surface text-left shadow-lg transition-all hover:border-accent/45 hover:bg-white/[0.04]">
          <div className="relative aspect-[4/3] bg-black/40">
            {find.photos && find.photos.length > 0 ? (
              <img src={find.photos[0]} alt={find.taxon} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
            ) : (
              <div className="grid h-full place-items-center text-white/18">
                <div className="text-center">
                  <Image className="mx-auto h-8 w-8" />
                  <p className="mt-2 text-[10px] font-black uppercase tracking-widest">No public image</p>
                </div>
              </div>
            )}
            <div className="absolute left-2 top-2 flex flex-wrap gap-1">
              <span className="rounded bg-black/70 px-2 py-1 text-[8px] font-black uppercase tracking-wider text-accent backdrop-blur">{find.period || 'Unknown'}</span>
              {find.stage && <span className="rounded bg-accent px-2 py-1 text-[8px] font-black uppercase tracking-wider text-black">{find.stage}</span>}
            </div>
            <div className="absolute right-2 top-2 flex flex-col items-end gap-1">
              <QualityBadge value={getQuality(find)} />
              {find.verification_status && find.verification_status !== 'community' && (
                <VerificationBadge status={find.verification_status} />
              )}
            </div>
          </div>
          <div className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="truncate text-sm font-black italic">{find.taxon}</h3>
                <p className="mt-1 truncate text-[11px] text-white/45">{find.locationName}</p>
              </div>
              {find.collectorEmail && <Mail className="h-4 w-4 shrink-0 text-emerald-300/70" />}
            </div>
            <div className="mt-3 flex items-center justify-between text-[10px] font-bold text-white/35">
              <span className="truncate">{find.repository || 'Private'}</span>
              <span>{formatDate(find.sharedAt)}</span>
            </div>
          </div>
        </button>
      ))}
    </div>
  )
}

function AnalyticsView({ analytics, filteredAnalytics, filteredFinds, sourceMessage, sourceStatus }: {
  analytics: Analytics
  filteredAnalytics: Analytics
  filteredFinds: SharedFind[]
  sourceMessage: string
  sourceStatus: SourceStatus
}) {
  const readiness = [
    { label: 'Contactable records', value: analytics.contactable, total: analytics.total },
    { label: 'Photo backed', value: analytics.withPhotos, total: analytics.total },
    { label: 'Repository declared', value: analytics.withRepository, total: analytics.total },
    { label: 'Quality 70+', value: analytics.highQuality, total: analytics.total },
  ]

  return (
    <div className="absolute inset-0 overflow-y-auto bg-[#07090d] p-4 sm:p-6">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-accent">Portal analytics</p>
          <h2 className="mt-2 text-2xl font-black sm:text-3xl">Research readiness dashboard</h2>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-white/55">A quick view of whether shared finds are citable, contactable, photographically supported, and stratigraphically useful.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => exportToCSV(filteredFinds)} className="inline-flex items-center gap-2 rounded-lg bg-accent px-3 py-2 text-[10px] font-black uppercase text-black">
            <Download className="h-3.5 w-3.5" />
            Export visible
          </button>
          <button onClick={() => exportToJSON(filteredFinds)} className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-[10px] font-black uppercase text-white/65">
            <Download className="h-3.5 w-3.5" />
            JSON
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <MetricCard icon={Database} label="Records" value={analytics.total} detail={`${filteredAnalytics.total} visible`} />
        <MetricCard icon={User} label="Contributors" value={analytics.contributors} detail="Distinct collectors" />
        <MetricCard icon={ShieldCheck} label="Verified" value={analytics.verified} detail={`${percent(analytics.verified, analytics.total)}% of records`} />
        <MetricCard icon={Award} label="Research Grade" value={analytics.researchGrade} detail={`${percent(analytics.researchGrade, analytics.total)}% of records`} />
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3 xl:grid-cols-4">
        <MetricCard icon={Mail} label="Contactable" value={analytics.contactable} detail={`${percent(analytics.contactable, analytics.total)}% of records`} />
        <MetricCard icon={Eye} label="Avg quality" value={`${analytics.averageQuality}%`} detail="Completeness score" />
        <MetricCard icon={Image} label="With photos" value={analytics.withPhotos} detail={`${percent(analytics.withPhotos, analytics.total)}% of records`} />
        <MetricCard icon={Archive} label="In repository" value={analytics.withRepository} detail={`${percent(analytics.withRepository, analytics.total)}% declared`} />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <section className="rounded-lg border border-white/10 bg-surface p-5">
          <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-white/35">Distribution by period</h3>
          <div className="mt-5 space-y-4">
            {analytics.periods.length > 0 ? analytics.periods.map((item) => (
              <DistributionBar key={item.label} label={item.label} count={item.count} percent={item.percent} />
            )) : (
              <p className="text-sm text-white/45">No period data available.</p>
            )}
          </div>
        </section>

        <section className="rounded-lg border border-white/10 bg-surface p-5">
          <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-white/35">Research readiness</h3>
          <div className="mt-5 space-y-4">
            {readiness.map((item) => (
              <DistributionBar key={item.label} label={item.label} count={item.value} percent={percent(item.value, item.total)} />
            ))}
          </div>
        </section>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <section className="rounded-lg border border-white/10 bg-surface p-5">
          <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-white/35">Data source</h3>
          <div className={`mt-4 rounded-lg border p-4 text-sm leading-relaxed ${
            sourceStatus === 'live' ? 'border-emerald-400/20 bg-emerald-400/10 text-emerald-100' : sourceStatus === 'demo' ? 'border-amber-400/20 bg-amber-400/10 text-amber-100' : 'border-white/10 bg-white/5 text-white/55'
          }`}>
            {sourceMessage || 'Registry status unavailable.'}
          </div>
        </section>

        <section className="rounded-lg border border-white/10 bg-surface p-5">
          <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-white/35">Recent activity</h3>
          <div className="mt-5 grid gap-3">
            {analytics.activity.map((find) => (
              <ActivityItem key={find.id} find={find} />
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}

function ResearchSidebar({ analytics, activity, sourceStatus }: { analytics: Analytics; activity: SharedFind[]; sourceStatus: SourceStatus }) {
  return (
    <aside className="hidden w-80 shrink-0 flex-col overflow-y-auto border-l border-white/10 bg-[#0d1117] p-5 xl:flex">
      <div className="rounded-lg border border-white/10 bg-black/20 p-4">
        <div className="flex items-center justify-between">
          <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-white/35">Portal status</h3>
          <DataStatusPill status={sourceStatus} />
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <MiniMetric label="Records" value={analytics.total} />
          <MiniMetric label="Quality" value={`${analytics.averageQuality}%`} />
          <MiniMetric label="Contacts" value={analytics.contactable} />
          <MiniMetric label="Photos" value={analytics.withPhotos} />
        </div>
      </div>

      <div className="mt-7">
        <h3 className="mb-4 flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-white/35">
          <BarChart3 className="h-3 w-3" />
          Distribution by period
        </h3>
        <div className="space-y-3">
          {analytics.periods.slice(0, 6).map((item) => (
            <DistributionBar key={item.label} label={item.label} count={item.count} percent={item.percent} compact />
          ))}
        </div>
      </div>

      <div className="mt-8">
        <h3 className="mb-4 text-[10px] font-black uppercase tracking-[0.2em] text-white/35">Registry activity</h3>
        <div className="space-y-4">
          {activity.map((find) => (
            <ActivityItem key={find.id} find={find} compact />
          ))}
        </div>
      </div>
    </aside>
  )
}

function FindDetailModal({ find, close, downloadBibTeX, requestAccess, isAdmin, onPromote, onDelete, moderationAvailable }: {
  find: SharedFind
  close: () => void
  downloadBibTeX: (find: SharedFind) => void
  requestAccess: (find: SharedFind) => void
  isAdmin: boolean
  onPromote: (find: SharedFind, status: 'community' | 'verified' | 'research_grade') => Promise<void>
  onDelete: (find: SharedFind) => Promise<void>
  moderationAvailable: boolean
}) {
  const coords = displayCoords(find)
  const osGridRef = formatOsGridRef(coords.lat, coords.lon, 8)
  const [selectedPhoto, setSelectedPhoto] = useState<string | null>(find.photos?.[0] ?? null)
  const [lightboxOpen, setLightboxOpen] = useState(false)

  function copyPermalink() {
    const url = `${window.location.origin}${window.location.pathname}?find=${encodeURIComponent(find.id)}`
    navigator.clipboard.writeText(url).catch(() => {})
  }

  return (
    <>
    {lightboxOpen && selectedPhoto && (
      <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/95" onClick={() => setLightboxOpen(false)}>
        <button className="absolute right-4 top-4 grid h-10 w-10 place-items-center rounded-lg border border-white/10 bg-white/10 text-white transition-colors hover:bg-white/20" aria-label="Close lightbox">
          <X className="h-5 w-5" />
        </button>
        <img src={selectedPhoto} alt={find.taxon} className="max-h-[95vh] max-w-[95vw] object-contain" onClick={(e) => e.stopPropagation()} />
      </div>
    )}
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-8">
      <button className="absolute inset-0 bg-black/88 backdrop-blur-sm" onClick={close} aria-label="Close detail" />
      <div className="relative flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-xl border border-white/10 bg-surface shadow-2xl md:flex-row">
        <div className="flex h-72 w-full flex-col bg-black md:h-auto md:w-[46%]">
          <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-[#050505]">
            {selectedPhoto ? (
              <button className="group h-full w-full" onClick={() => setLightboxOpen(true)} aria-label="View full size">
                <img src={selectedPhoto} alt={find.taxon} className="h-full w-full object-contain transition-opacity group-hover:opacity-85" />
                <div className="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity group-hover:opacity-100">
                  <div className="rounded-lg border border-white/20 bg-black/60 px-3 py-1.5 text-[10px] font-black uppercase tracking-wider text-white backdrop-blur">View full size</div>
                </div>
              </button>
            ) : (
              <div className="text-center text-white/16">
                <Image className="mx-auto h-10 w-10" />
                <p className="mt-3 text-xs font-black uppercase tracking-widest">Scientific documentation required</p>
              </div>
            )}
            <div className="absolute left-4 top-4 flex items-center gap-2 rounded-lg border border-white/10 bg-black/65 px-3 py-1.5 backdrop-blur">
              <Eye className="h-3 w-3 text-accent" />
              <span className="text-[10px] font-black uppercase tracking-wider">Public metadata view</span>
            </div>
          </div>
          <div className="flex h-20 gap-2 border-t border-white/10 bg-[#0d1117] p-3">
            {find.photos && find.photos.length > 0 ? find.photos.map((photo, index) => (
              <button
                key={photo}
                onClick={() => setSelectedPhoto(photo)}
                className={`h-full w-16 shrink-0 overflow-hidden rounded-lg border transition-colors ${selectedPhoto === photo ? "border-accent" : "border-white/10 hover:border-white/30"} bg-black/40`}
                aria-label={`Photo ${index + 1}`}
              >
                <img src={photo} alt={`${find.taxon} ${index + 1}`} className="h-full w-full object-cover" />
              </button>
            )) : [1, 2, 3, 4].map((slot) => (
              <div key={slot} className="grid h-full w-16 place-items-center rounded-lg border border-white/10 bg-white/5 p-1 text-center text-[8px] font-bold uppercase text-white/20">Slot {slot}</div>
            ))}
          </div>
        </div>

        <div className="min-h-0 w-full overflow-y-auto p-5 custom-scrollbar sm:p-7 md:w-[54%]">
          <div className="mb-6 flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-1.5 text-accent">
                  <Hash className="h-4 w-4 shrink-0" />
                  <span className="truncate text-xs font-bold tracking-tight">{find.id}</span>
                </div>
                <VerificationBadge status={find.verification_status} />
              </div>
              <h2 className="text-2xl font-black leading-tight italic sm:text-3xl">{find.taxon}</h2>
              <p className="mt-1 text-sm font-medium text-white/60">{find.element || 'Specimen'}</p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <button
                onClick={copyPermalink}
                title="Copy permalink"
                className="grid h-9 w-9 place-items-center rounded-lg border border-white/10 bg-white/5 text-white/55 transition-colors hover:bg-white/10 hover:text-white"
                aria-label="Copy permalink"
              >
                <Link className="h-4 w-4" />
              </button>
              <button onClick={close} className="grid h-9 w-9 place-items-center rounded-lg border border-white/10 bg-white/5 transition-colors hover:bg-white/10" aria-label="Close detail">
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <InfoTile icon={Layers} label="Stratigraphy" primary={find.period || 'Unknown'} secondary={[find.stage, find.formation, find.member, find.bed].filter(Boolean).join(' / ')} />
            <InfoTile
              icon={MapPin}
              label="Provenance"
              primary={find.locationName}
              secondary={(
                <>
                  <span>{coords.label}</span>
                  {osGridRef && coords.isPrecise && <span className="mt-1 block">OS grid ref {osGridRef}</span>}
                </>
              )}
            />
            <InfoTile icon={User} label="Collector" primary={find.collectorName} secondary={find.collectorEmail ? 'Contact available' : 'No public contact'} />
            <InfoTile icon={Calendar} label="Date found" primary={formatDate(find.dateCollected)} secondary={`Shared ${formatDate(find.sharedAt)}`} />
            <InfoTile icon={Eye} label="Quality score" primary={`${getQuality(find)}%`} secondary="Completeness estimate" accent />
            <InfoTile icon={Archive} label="Repository" primary={find.repository || 'Private'} secondary={find.accession_id || 'No accession ID'} />
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            {!coords.isPrecise && (
              <div className="inline-flex items-center gap-2 rounded-lg border border-amber-400/20 bg-amber-400/10 px-3 py-2 text-[10px] font-black uppercase tracking-wider text-amber-200">
                <AlertTriangle className="h-3.5 w-3.5" />
                Approximate location
              </div>
            )}
            {find.verification_status === 'research_grade' && (
              <div className="inline-flex items-center gap-2 rounded-lg border border-blue-400/20 bg-blue-400/10 px-3 py-2 text-[10px] font-black uppercase tracking-wider text-blue-200">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Research grade record
              </div>
            )}
            {find.coordinates_released === true && coords.isPrecise && (
              <div className="inline-flex items-center gap-2 rounded-lg border border-emerald-400/20 bg-emerald-400/10 px-3 py-2 text-[10px] font-black uppercase tracking-wider text-emerald-200">
                <MapPin className="h-3.5 w-3.5" />
                Exact coordinates released
              </div>
            )}
          </div>

          <div className="mt-6">
            <div className="mb-3 flex items-center gap-2 text-white/35">
              <Ruler className="h-3.5 w-3.5" />
              <span className="text-[9px] font-black uppercase tracking-wider">Morphometrics</span>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {measurementEntries(find).length > 0 ? measurementEntries(find).map(([key, value]) => (
                <div key={key} className="rounded-lg border border-white/10 bg-black/20 px-3 py-3 text-center">
                  <div className="mb-1 text-[8px] font-black uppercase text-white/40">{key}</div>
                  <div className="text-xs font-bold text-accent">{value}</div>
                </div>
              )) : (
                <div className="col-span-full rounded-lg border border-white/10 bg-black/20 p-4 text-sm text-white/45">No measurements shared.</div>
              )}
            </div>
          </div>

          {find.notes && (
            <div className="mt-6">
              <div className="mb-3 text-[9px] font-black uppercase tracking-widest text-white/35">Researcher notes</div>
              <div className="rounded-lg border border-accent/10 bg-accent/5 p-4 text-sm italic leading-relaxed text-white/80">{find.notes}</div>
            </div>
          )}

          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            <button onClick={() => downloadBibTeX(find)} className="inline-flex items-center justify-center gap-2 rounded-lg bg-accent px-4 py-3 text-xs font-black uppercase tracking-wider text-black transition-transform active:scale-[0.98]">
              <Download className="h-4 w-4" />
              BibTeX
            </button>
            <button
              onClick={copyPermalink}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-accent/30 bg-accent/10 px-4 py-3 text-xs font-bold text-accent/90 transition-colors hover:bg-accent/15"
            >
              <Copy className="h-4 w-4" />
              Copy link
            </button>
            <button
              onClick={() => requestAccess(find)}
              disabled={!find.collectorEmail}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-xs font-bold text-white/65 transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Mail className="h-4 w-4" />
              Request access
            </button>
          </div>

          {isAdmin && (
            <div className="mt-4 rounded-lg border border-amber-500/20 bg-amber-500/5 p-4">
              <div className="mb-3 flex items-center gap-2">
                <ShieldCheck className="h-3 w-3 text-amber-400/70" />
                <span className="text-[9px] font-black uppercase tracking-widest text-amber-400/70">Admin — Verification</span>
              </div>
              {!moderationAvailable && (
                <p className="mb-3 rounded-lg border border-amber-400/20 bg-amber-500/10 p-3 text-[10px] font-medium leading-relaxed text-amber-100/80">
                  Moderation writes are disabled until a trusted Supabase Edge Function is configured.
                </p>
              )}
              <div className="grid grid-cols-3 gap-2">
                {(['community', 'verified', 'research_grade'] as const).map((status) => {
                  const current = find.verification_status === status || (!find.verification_status && status === 'community')
                  return (
                    <button
                      key={status}
                      onClick={() => onPromote(find, status)}
                      disabled={current || !moderationAvailable}
                      className={`rounded-lg border px-2 py-2 text-[10px] font-black uppercase tracking-wide transition-colors disabled:cursor-default ${
                        current
                          ? 'border-amber-400/40 bg-amber-500/20 text-amber-300'
                          : 'border-white/10 bg-white/5 text-white/50 hover:bg-white/10 hover:text-white'
                      }`}
                    >
                      {status === 'research_grade' ? 'Research' : status.charAt(0).toUpperCase() + status.slice(1)}
                    </button>
                  )
                })}
              </div>
              <div className="mt-3 border-t border-amber-500/15 pt-3">
                <button
                  type="button"
                  onClick={() => onDelete(find)}
                  disabled={!moderationAvailable}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-red-400/25 bg-red-500/10 px-3 py-2 text-[10px] font-black uppercase tracking-wide text-red-200 transition-colors hover:bg-red-500/20"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Delete find
                </button>
                <p className="mt-2 text-[10px] font-medium leading-relaxed text-white/40">
                  Hides this record from the public map and database. The row is soft-deleted for audit history.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
    </>
  )
}

function InfoTile({ icon: Icon, label, primary, secondary, accent }: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  primary: React.ReactNode
  secondary?: React.ReactNode
  accent?: boolean
}) {
  return (
    <div className={`rounded-lg border p-4 ${accent ? 'border-accent/20 bg-accent/5' : 'border-white/10 bg-black/20'}`}>
      <div className={`mb-2 flex items-center gap-2 ${accent ? 'text-accent/60' : 'text-white/35'}`}>
        <Icon className="h-3.5 w-3.5" />
        <span className="text-[9px] font-black uppercase tracking-wider">{label}</span>
      </div>
      <div className={`text-sm font-bold ${accent ? 'text-accent' : 'text-white'}`}>{primary}</div>
      {secondary && <div className="mt-1 text-[10px] font-medium text-white/45">{secondary}</div>}
    </div>
  )
}

function MetricCard({ icon: Icon, label, value, detail }: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: React.ReactNode
  detail: string
}) {
  return (
    <div className="rounded-lg border border-white/10 bg-surface p-4 sm:p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-white/35">{label}</p>
          <div className="mt-2 text-2xl font-black sm:text-3xl">{value}</div>
        </div>
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-accent/10 text-accent sm:h-10 sm:w-10">
          <Icon className="h-4 w-4 sm:h-5 sm:w-5" />
        </div>
      </div>
      <p className="mt-3 text-xs text-white/45">{detail}</p>
    </div>
  )
}

function DistributionBar({ label, count, percent: value, compact }: { label: string; count: number; percent: number; compact?: boolean }) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-3 text-xs">
        <span className={`truncate font-bold ${compact ? 'text-white/75' : 'text-white'}`}>{label}</span>
        <span className="shrink-0 font-mono text-white/40">{count} / {value}%</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-white/8">
        <div className="h-full rounded-full bg-accent" style={{ width: `${value}%` }} />
      </div>
    </div>
  )
}

function ActivityItem({ find, compact }: { find: SharedFind; compact?: boolean }) {
  return (
    <div className="flex gap-3 text-[11px]">
      <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-white/5">
        <Globe className="h-4 w-4 text-white/25" />
      </div>
      <div className="min-w-0">
        <p className="font-bold text-white">Record shared</p>
        <p className={`mt-0.5 text-white/45 ${compact ? 'line-clamp-2' : ''}`}>{find.taxon} from {find.locationName} by {find.collectorName}.</p>
        <p className="mt-1 text-accent">{formatDate(find.sharedAt)}</p>
      </div>
    </div>
  )
}

function QualityBadge({ value }: { value: number }) {
  const tier = getQualityTier(value)
  const tone = tier === 'research_grade'
    ? 'border-emerald-400/25 bg-emerald-400/10 text-emerald-200'
    : tier === 'community'
    ? 'border-amber-400/25 bg-amber-400/10 text-amber-200'
    : 'border-white/10 bg-white/5 text-white/45'
  const label = tier === 'research_grade' ? 'High Quality' : tier === 'community' ? 'Community Quality' : 'Basic'
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[9px] font-black uppercase ${tone}`}>
      <span>{value}%</span>
      <span className="opacity-60">·</span>
      <span>{label}</span>
    </span>
  )
}

function VerificationBadge({ status }: { status: SharedFind['verification_status'] }) {
  if (status === 'research_grade') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2.5 py-1 text-[9px] font-black uppercase tracking-wide text-emerald-300">
        <Award className="h-3 w-3" />
        Research Grade
      </span>
    )
  }
  if (status === 'verified') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-sky-400/30 bg-sky-400/10 px-2.5 py-1 text-[9px] font-black uppercase tracking-wide text-sky-300">
        <ShieldCheck className="h-3 w-3" />
        Verified
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[9px] font-black uppercase tracking-wide text-white/40">
      Community Record
    </span>
  )
}

function EmptyState({ title, detail, action, onAction }: { title: string; detail: string; action: string; onAction: () => void }) {
  return (
    <div className="grid min-h-full place-items-center p-6">
      <div className="max-w-sm text-center">
        <div className="mx-auto grid h-12 w-12 place-items-center rounded-lg border border-white/10 bg-white/5 text-white/35">
          <Database className="h-6 w-6" />
        </div>
        <h2 className="mt-4 text-xl font-black">{title}</h2>
        <p className="mt-2 text-sm leading-relaxed text-white/45">{detail}</p>
        <button onClick={onAction} className="mt-5 rounded-lg bg-accent px-4 py-2 text-xs font-black uppercase text-black">{action}</button>
      </div>
    </div>
  )
}

type Analytics = ReturnType<typeof buildAnalytics>

function buildAnalytics(finds: SharedFind[]) {
  const total = finds.length
  const contributors = new Set(finds.map((find) => find.collectorName).filter(Boolean)).size
  const contactable = finds.filter((find) => !!find.collectorEmail).length
  const withPhotos = finds.filter((find) => (find.photos?.length || 0) > 0).length
  const withRepository = finds.filter(hasPublicRepository).length
  const highQuality = finds.filter((find) => getQuality(find) >= 70).length
  const averageQuality = total ? Math.round(finds.reduce((sum, find) => sum + getQuality(find), 0) / total) : 0
  const researchGrade = finds.filter((find) => find.verification_status === 'research_grade').length
  const verified = finds.filter((find) => find.verification_status === 'verified' || find.verification_status === 'research_grade').length
  const periodCounts = finds.reduce<Record<string, number>>((acc, find) => {
    const label = normalise(find.period) || 'Unknown'
    acc[label] = (acc[label] || 0) + 1
    return acc
  }, {})
  const periods = Object.entries(periodCounts)
    .map(([label, count]) => ({ label, count, percent: percent(count, total) }))
    .sort((a, b) => b.count - a.count)
  const activity = [...finds].sort((a, b) => new Date(b.sharedAt).getTime() - new Date(a.sharedAt).getTime()).slice(0, 5)
  return { total, contributors, contactable, withPhotos, withRepository, highQuality, averageQuality, researchGrade, verified, periods, activity }
}

function dedupeRawFinds(rawData: RawSharedFind[] | null | undefined) {
  const sorted = [...(rawData || [])].sort((a, b) => {
    const aTime = new Date(String(a.shared_at || '')).getTime() || 0
    const bTime = new Date(String(b.shared_at || '')).getTime() || 0
    return bTime - aTime
  })
  const unique = new Map<string, RawSharedFind>()
  sorted.forEach((row) => {
    const key = String(row.fossilmap_id || row.hrid || row.id || '')
    if (key && !unique.has(key)) unique.set(key, row)
  })
  return Array.from(unique.values())
}

function mapRawFind(row: RawSharedFind): SharedFind | null {
  if (row.is_deleted === true) return null
  const latitude = numberValue(row.latitude)
  const longitude = numberValue(row.longitude)
  const taxon = normalise(row.taxon)
  const collectorName = normalise(row.collector_name) || normalise(row.collectorName) || 'Unknown collector'
  const id = normalise(row.hrid) || normalise(row.fossilmap_id) || normalise(row.id)
  if (!id || !taxon || latitude == null || longitude == null) return null

  const measurements = row.measurements && typeof row.measurements === 'object'
    ? row.measurements as SharedFind['measurements']
    : {
      length: numberValue(row.length_mm) ?? undefined,
      width: numberValue(row.width_mm) ?? undefined,
      thickness: numberValue(row.thickness_mm) ?? undefined,
      weight: numberValue(row.weight_g) ?? undefined,
    }

  return {
    id,
    collectorName,
    collectorEmail: normalise(row.collector_email) || undefined,
    taxon,
    element: normalise(row.element) || undefined,
    period: normalise(row.period) || 'Unknown',
    stage: normalise(row.stage) || undefined,
    locationName: normalise(row.location_name) || 'Unknown locality',
    latitude,
    longitude,
    public_latitude: numberValue(row.public_latitude),
    public_longitude: numberValue(row.public_longitude),
    location_precision: precisionValue(row.location_precision),
    precision_locked: booleanValue(row.precision_locked),
    coordinates_released: booleanValue(row.coordinates_released),
    dateCollected: normalise(row.date_collected) || normalise(row.observed_at) || '',
    photos: Array.isArray(row.photos) ? row.photos.filter((item): item is string => typeof item === 'string') : [],
    measurements,
    repository: normalise(row.repository) || 'Private',
    accession_id: normalise(row.accession_id) || undefined,
    quality_score: numberValue(row.quality_score) ?? undefined,
    formation: normalise(row.formation) || undefined,
    member: normalise(row.member) || undefined,
    bed: normalise(row.bed) || undefined,
    notes: normalise(row.notes) || undefined,
    sharedAt: normalise(row.shared_at) || new Date().toISOString(),
    isPublic: true,
    verification_status: (['community', 'verified', 'research_grade'].includes(String(row.verification_status))
      ? row.verification_status as SharedFind['verification_status']
      : 'community'),
  }
}

function getQuality(find: SharedFind) {
  if (typeof find.quality_score === 'number') return clamp(Math.round(find.quality_score), 0, 100)
  const checks = [
    !!find.taxon,
    !!find.locationName,
    Number.isFinite(find.latitude) && Number.isFinite(find.longitude),
    !!find.period,
    !!find.formation,
    !!find.stage,
    !!find.member,
    !!find.element,
    measurementEntries(find).length > 0,
    (find.photos?.length || 0) > 0,
    (find.photos?.length || 0) >= 2,
    hasPublicRepository(find),
    !!find.accession_id,
    !!find.collectorEmail,
  ]
  return Math.round((checks.filter(Boolean).length / checks.length) * 100)
}

function getQualityTier(score: number): 'research_grade' | 'community' | 'basic' {
  if (score >= 80) return 'research_grade'
  if (score >= 50) return 'community'
  return 'basic'
}

function hasPublicRepository(find: Pick<SharedFind, 'repository'>) {
  const repository = normalise(find.repository).toLowerCase()
  if (!repository) return false
  return !['private', 'private collection', 'personal collection', 'collector collection', 'none', 'n/a', 'unknown'].includes(repository)
}

function measurementEntries(find: SharedFind) {
  const entries = Object.entries(find.measurements || {})
    .filter(([, value]) => value != null)
    .map(([key, value]) => [key.replace(/([A-Z])/g, ' $1'), String(value)] as [string, string])
  return entries
}

function normalise(value: unknown) {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : ''
}

function numberValue(value: unknown) {
  const next = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN
  return Number.isFinite(next) ? next : null
}

function precisionValue(value: unknown): SharedFind['location_precision'] | undefined {
  return value === 'exact' || value === '100m' || value === '1km' || value === 'locality'
    ? value
    : undefined
}

function booleanValue(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') return value
  if (typeof value === 'string' && /^(true|false)$/i.test(value)) return value.toLowerCase() === 'true'
  return undefined
}

function percent(value: number, total: number) {
  return total > 0 ? Math.round((value / total) * 100) : 0
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function AboutModal({ close }: { close: () => void }) {
  const today = new Date().toISOString().slice(0, 10)
  const bibtex = `@misc{fossilmapped2026,
  title  = {FossilMapped community fossil occurrence dataset},
  year   = {2026},
  url    = {https://fenlanddavid.github.io/fossilmapped/},
  note   = {Accessed ${today}}
}`
  const plainCite = `FossilMapped (2026). Community fossil occurrence dataset. Available at: https://fenlanddavid.github.io/fossilmapped/ Accessed: ${today}.`

  function copyText(text: string) {
    navigator.clipboard.writeText(text).catch(() => {})
  }

  return (
    <div className="fixed inset-0 z-[110] flex items-end justify-center p-0 sm:items-center sm:p-6">
      <button className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={close} aria-label="Close" />
      <div className="relative flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl border border-white/10 bg-[#0d1117] shadow-2xl sm:rounded-2xl">
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-white/10 px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="grid h-8 w-8 place-items-center rounded-lg bg-accent/15 text-accent">
              <Info className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-sm font-black uppercase tracking-tight">About this dataset</h2>
              <p className="text-[10px] font-bold uppercase tracking-widest text-white/40">FossilMapped research portal</p>
            </div>
          </div>
          <button onClick={close} className="grid h-8 w-8 place-items-center rounded-lg text-white/40 transition-colors hover:bg-white/10 hover:text-white" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="min-h-0 overflow-y-auto">
          <div className="space-y-6 p-5">

            {/* What is FossilMapped */}
            <section>
              <h3 className="mb-2 text-xs font-black uppercase tracking-widest text-accent">What is FossilMapped?</h3>
              <p className="text-sm leading-relaxed text-white/70">
                FossilMapped is a community-submitted UK fossil occurrence portal. Records are shared voluntarily
                by collectors using{' '}
                <a
                  href="https://fenlanddavid.github.io/fossilmap/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-accent underline underline-offset-2 hover:text-white"
                >
                  FossilMap
                </a>
                {' '}— a field recording app that captures GPS coordinates, stratigraphic context, measurements,
                and photographs at the point of collection. Each public record represents a real find shared
                with the research community.
              </p>
            </section>

            {/* Verification tiers */}
            <section>
              <h3 className="mb-3 text-xs font-black uppercase tracking-widest text-accent">How records are verified</h3>
              <div className="space-y-2">
                {[
                  { label: 'Community Record', colour: 'bg-white/5 text-white/40 border-white/10', desc: 'Submitted by a collector. GPS and taxon provided but not independently reviewed.' },
                  { label: 'Verified', colour: 'bg-sky-400/10 text-sky-300 border-sky-400/30', desc: 'Reviewed for stratigraphic completeness and GPS plausibility.' },
                  { label: 'Research Grade', colour: 'bg-emerald-400/10 text-emerald-300 border-emerald-400/30', desc: 'Confirmed locality, formation, and element — suitable for citation in published work.' },
                ].map(({ label, colour, desc }) => (
                  <div key={label} className="flex gap-3 rounded-lg border border-white/6 bg-white/[0.03] p-3">
                    <span className={`shrink-0 self-start rounded-md border px-2 py-0.5 text-[10px] font-black uppercase tracking-wider ${colour}`}>{label}</span>
                    <p className="text-xs leading-relaxed text-white/60">{desc}</p>
                  </div>
                ))}
              </div>
            </section>

            {/* Quality score */}
            <section>
              <h3 className="mb-3 text-xs font-black uppercase tracking-widest text-accent">Quality score (0–100)</h3>
              <p className="mb-2 text-[11px] leading-relaxed text-white/50">
                FossilMap submits a weighted completeness score when available: GPS precision 30, stratigraphic detail 30,
                measurements 20, and visual documentation 20. If a submitted score is missing, FossilMapped estimates
                completeness from these public fields.
              </p>
              <div className="overflow-hidden rounded-lg border border-white/10">
                {[
                  'Taxon identified',
                  'Location name',
                  'GPS coordinates',
                  'Geological period',
                  'Formation',
                  'Stratigraphic stage',
                  'Member',
                  'Element / skeletal part',
                  'Measurements',
                  'At least one photograph',
                  'Two or more photographs',
                  'Repository (not private)',
                  'Accession ID',
                  'Collector email',
                ].map((criterion) => (
                  <div key={criterion} className="flex items-center border-b border-white/6 px-4 py-2 last:border-0">
                    <span className="text-xs text-white/70">{criterion}</span>
                  </div>
                ))}
              </div>
              <p className="mt-2 text-[11px] text-white/40">The "High quality" filter shows records scoring 70 or above.</p>
            </section>

            {/* Citation */}
            <section>
              <h3 className="mb-3 text-xs font-black uppercase tracking-widest text-accent">How to cite this dataset</h3>
              <div className="space-y-2">
                <div className="group relative rounded-lg border border-white/10 bg-black/30 p-3">
                  <p className="pr-8 font-mono text-[11px] leading-relaxed text-white/70">{plainCite}</p>
                  <button
                    onClick={() => copyText(plainCite)}
                    className="absolute right-2 top-2 grid h-7 w-7 place-items-center rounded-md text-white/30 transition-colors hover:bg-white/10 hover:text-white"
                    title="Copy citation"
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </button>
                </div>
                <div className="group relative rounded-lg border border-white/10 bg-black/30 p-3">
                  <pre className="pr-8 font-mono text-[11px] leading-relaxed text-white/70 whitespace-pre-wrap">{bibtex}</pre>
                  <button
                    onClick={() => copyText(bibtex)}
                    className="absolute right-2 top-2 grid h-7 w-7 place-items-center rounded-md text-white/30 transition-colors hover:bg-white/10 hover:text-white"
                    title="Copy BibTeX"
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </section>

            {/* Contact */}
            <section className="rounded-lg border border-white/8 bg-white/[0.02] p-4">
              <h3 className="mb-1.5 text-xs font-black uppercase tracking-widest text-accent">Contribute or report an issue</h3>
              <p className="text-xs leading-relaxed text-white/60">
                Records are added by collectors sharing from FossilMap. To contribute your own finds,{' '}
                <a
                  href="https://fenlanddavid.github.io/fossilmap/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-accent underline underline-offset-2 hover:text-white"
                >
                  install FossilMap
                </a>
                {' '}and use the Share to Community option on any specimen record.
                To report a data issue or inaccuracy, contact the collector directly using the request access button on the record.
              </p>
            </section>

          </div>
        </div>
      </div>
    </div>
  )
}

function formatDate(value: string) {
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return 'Unknown'
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

function relativeDate(value: string) {
  const time = new Date(value).getTime()
  if (!Number.isFinite(time)) return 'Unknown'
  const diffMs = Date.now() - time
  const minute = 60 * 1000
  const hour = 60 * minute
  const day = 24 * hour
  if (diffMs < minute) return 'Just now'
  if (diffMs < hour) return `${Math.max(1, Math.round(diffMs / minute))}m ago`
  if (diffMs < day) return `${Math.max(1, Math.round(diffMs / hour))}h ago`
  const days = Math.max(1, Math.round(diffMs / day))
  if (days < 30) return `${days}d ago`
  return formatDate(value)
}

export default App
