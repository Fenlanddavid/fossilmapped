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
  User,
  X,
} from 'lucide-react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { SharedFind } from './types'
import { getSharedFinds, promoteVerification } from './services/supabase'
import { exportToCSV, exportToJSON } from './services/export'

const ADMIN_PIN = import.meta.env.VITE_ADMIN_PIN as string | undefined

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
  const [sourceStatus, setSourceStatus] = useState<SourceStatus>('loading')
  const [sourceMessage, setSourceMessage] = useState('')
  const [showFilters, setShowFilters] = useState(false)
  const [selectedPeriod, setSelectedPeriod] = useState('All')
  const [contactableOnly, setContactableOnly] = useState(false)
  const [withPhotosOnly, setWithPhotosOnly] = useState(false)
  const [highQualityOnly, setHighQualityOnly] = useState(false)
  const [mapHudDismissed, setMapHudDismissed] = useState(false)
  const [verificationFilter, setVerificationFilter] = useState<'All' | 'community' | 'verified' | 'research_grade'>('All')
  const [notice, setNotice] = useState<string | null>(null)
  const [autoOpenId, setAutoOpenId] = useState<string | null>(() => new URLSearchParams(window.location.search).get('find'))
  const [isAdmin, setIsAdmin] = useState(false)
  const [showAdminLogin, setShowAdminLogin] = useState(false)
  const [adminPinInput, setAdminPinInput] = useState('')
  const [adminPinError, setAdminPinError] = useState(false)
  const mapContainer = useRef<HTMLDivElement>(null)
  const map = useRef<maplibregl.Map | null>(null)

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
  }, [])

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
    try {
      await promoteVerification(find.id, status)
      const updated: SharedFind = { ...find, verification_status: status }
      setFinds(prev => prev.map(f => f.id === find.id ? updated : f))
      setSelectedFind(updated)
    } catch (e: any) {
      setNotice(`Promote failed: ${e?.message ?? 'Unknown error'}`)
    }
  }

  function handleAdminLogin(e: React.FormEvent) {
    e.preventDefault()
    if (adminPinInput === ADMIN_PIN) {
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
      style: 'https://tiles.openfreemap.org/styles/dark',
      center: [-2.0, 54.0],
      zoom: 5.5,
      clickTolerance: 40,
    })

    map.current.on('load', () => {
      map.current?.addSource('finds', {
        type: 'geojson',
        cluster: true,
        clusterMaxZoom: 12,
        clusterRadius: 50,
        data: { type: 'FeatureCollection', features: [] },
      })

      // Cluster circle
      map.current?.addLayer({
        id: 'finds-cluster',
        type: 'circle',
        source: 'finds',
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
        source: 'finds',
        filter: ['has', 'point_count'],
        layout: {
          'text-field': '{point_count_abbreviated}',
          'text-size': 11,
          'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
        },
        paint: { 'text-color': '#000000' },
      })

      // Individual pins
      map.current?.addLayer({
        id: 'finds-layer',
        type: 'circle',
        source: 'finds',
        filter: ['!', ['has', 'point_count']],
        paint: {
          'circle-color': ['match', ['get', 'verification_status'], 'research_grade', '#3b82f6', 'verified', '#22c55e', '#f59e0b'],
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
        const source = map.current!.getSource('finds') as maplibregl.GeoJSONSource
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
      if (!map.current?.isStyleLoaded()) return
      const source = map.current.getSource('finds') as maplibregl.GeoJSONSource | undefined
      if (!source) return
      source.setData({
        type: 'FeatureCollection',
        features: filteredFinds.map((find) => ({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [find.longitude, find.latitude] },
          properties: { id: find.id, verification_status: find.verification_status ?? 'community' },
        })),
      })
    }

    if (map.current.loaded()) updateData()
    else map.current.once('load', updateData)
  }, [filteredFinds, loading])

  useEffect(() => {
    const mapInstance = map.current
    if (!mapInstance) return

    const onClick = (event: maplibregl.MapMouseEvent) => {
      if (!mapInstance.getLayer('finds-layer')) return
      const bbox: [[number, number], [number, number]] = [
        [event.point.x - 22, event.point.y - 22],
        [event.point.x + 22, event.point.y + 22],
      ]
      const features = mapInstance.queryRenderedFeatures(bbox, { layers: ['finds-layer'] })
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
      {loading && <LoadingOverlay />}

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
              onClick={() => window.location.reload()}
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
        />
      )}

      {showAdminLogin && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
          <button className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => { setShowAdminLogin(false); setAdminPinInput(''); setAdminPinError(false); }} aria-label="Close" />
          <form onSubmit={handleAdminLogin} className="relative w-full max-w-xs rounded-xl border border-amber-500/25 bg-[#0d1117] p-6 shadow-2xl">
            <div className="mb-4 flex items-center gap-2">
              <Lock className="h-4 w-4 text-amber-400" />
              <span className="text-sm font-black uppercase tracking-widest text-amber-400">Admin login</span>
            </div>
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

function DatabaseView({ finds, allCount, setSelectedFind, clearFilters }: {
  finds: SharedFind[]
  allCount: number
  setSelectedFind: (find: SharedFind) => void
  clearFilters: () => void
}) {
  return (
    <div className="absolute inset-0 overflow-auto bg-[#07090d]">
      <div className="sticky top-0 z-20 flex flex-col gap-3 border-b border-white/10 bg-[#0d1117]/95 p-4 backdrop-blur sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-white/40">Research dataset</p>
          <h2 className="mt-1 text-lg font-black">{finds.length} visible records</h2>
        </div>
        <div className="flex gap-2">
          <button onClick={() => exportToCSV(finds)} className="inline-flex items-center justify-center gap-2 rounded-lg border border-accent/25 bg-accent/10 px-3 py-2 text-[10px] font-black uppercase tracking-wider text-accent transition-colors hover:bg-accent hover:text-black">
            <Download className="h-3.5 w-3.5" />
            CSV
          </button>
          <button onClick={() => exportToJSON(finds)} className="inline-flex items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-[10px] font-black uppercase tracking-wider text-white/65 transition-colors hover:bg-white/10 hover:text-white">
            <Download className="h-3.5 w-3.5" />
            JSON
          </button>
        </div>
      </div>

      {finds.length === 0 ? (
        <EmptyState title="No matching records" detail={`${allCount} records are available before filters.`} action="Clear filters" onAction={clearFilters} />
      ) : (
        <>
          <div className="grid gap-3 p-4 sm:hidden">
            {finds.map((find) => (
              <button
                key={find.id}
                onClick={() => setSelectedFind(find)}
                className="rounded-lg border border-white/10 bg-surface p-4 text-left transition-colors hover:border-accent/40"
              >
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
            ))}
          </div>

          <table className="hidden w-full min-w-[980px] border-collapse text-left sm:table">
          <thead className="sticky top-[89px] z-10 border-b border-white/10 bg-[#0d1117] text-[10px] font-black uppercase tracking-widest text-white/40 sm:top-[73px]">
            <tr>
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
            {finds.map((find) => (
              <tr key={find.id} onClick={() => setSelectedFind(find)} className="group cursor-pointer transition-colors hover:bg-white/[0.03]">
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
            ))}
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

function FindDetailModal({ find, close, downloadBibTeX, requestAccess, isAdmin, onPromote }: {
  find: SharedFind
  close: () => void
  downloadBibTeX: (find: SharedFind) => void
  requestAccess: (find: SharedFind) => void
  isAdmin: boolean
  onPromote: (find: SharedFind, status: 'community' | 'verified' | 'research_grade') => Promise<void>
}) {
  function copyPermalink() {
    const url = `${window.location.origin}${window.location.pathname}?find=${encodeURIComponent(find.id)}`
    navigator.clipboard.writeText(url).catch(() => {})
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-8">
      <button className="absolute inset-0 bg-black/88 backdrop-blur-sm" onClick={close} aria-label="Close detail" />
      <div className="relative flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-xl border border-white/10 bg-surface shadow-2xl md:flex-row">
        <div className="flex h-72 w-full flex-col bg-black md:h-auto md:w-[46%]">
          <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-[#050505]">
            {find.photos && find.photos.length > 0 ? (
              <img src={find.photos[0]} alt={find.taxon} className="h-full w-full object-contain" />
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
              <div key={photo} className="h-full w-16 overflow-hidden rounded-lg border border-white/10 bg-black/40">
                <img src={photo} alt={`${find.taxon} ${index + 1}`} className="h-full w-full object-cover" />
              </div>
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
            <InfoTile icon={MapPin} label="Provenance" primary={find.locationName} secondary={`${find.latitude.toFixed(4)}, ${find.longitude.toFixed(4)}`} />
            <InfoTile icon={User} label="Collector" primary={find.collectorName} secondary={find.collectorEmail ? 'Contact available' : 'No public contact'} />
            <InfoTile icon={Calendar} label="Date found" primary={formatDate(find.dateCollected)} secondary={`Shared ${formatDate(find.sharedAt)}`} />
            <InfoTile icon={Eye} label="Quality score" primary={`${getQuality(find)}%`} secondary="Completeness estimate" accent />
            <InfoTile icon={Archive} label="Repository" primary={find.repository || 'Private'} secondary={find.accession_id || 'No accession ID'} />
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
              <div className="grid grid-cols-3 gap-2">
                {(['community', 'verified', 'research_grade'] as const).map((status) => {
                  const current = find.verification_status === status || (!find.verification_status && status === 'community')
                  return (
                    <button
                      key={status}
                      onClick={() => onPromote(find, status)}
                      disabled={current}
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
            </div>
          )}
        </div>
      </div>
    </div>
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
  const label = tier === 'research_grade' ? 'Research Grade' : tier === 'community' ? 'Community' : 'Basic'
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
  const withRepository = finds.filter((find) => !!find.repository && find.repository.toLowerCase() !== 'private').length
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
    !!find.repository && find.repository.toLowerCase() !== 'private',
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

function measurementEntries(find: SharedFind) {
  const entries = Object.entries(find.measurements || {})
    .filter(([, value]) => value != null)
    .map(([key, value]) => [key.replace(/([A-Z])/g, ' $1'), String(value)] as [string, string])
  return entries
}

function toBibTeX(find: SharedFind) {
  const date = find.sharedAt ? new Date(find.sharedAt) : new Date()
  const year = Number.isFinite(date.getTime()) ? date.getFullYear() : new Date().getFullYear()
  const month = Number.isFinite(date.getTime()) ? date.toLocaleString('en-GB', { month: 'long' }) : ''
  const strat = [find.period, find.stage, find.formation, find.member, find.bed].filter(Boolean).join('; ')
  const dims = measurementEntries(find).map(([key, value]) => `${key}: ${value}`).join(', ')

  return `@misc{${find.id.replace(/[^a-zA-Z0-9_]/g, '_')},
  author = {${bibEscape(find.collectorName)}},
  title = {FossilMapped record: {${bibEscape(find.taxon)}}},
  howpublished = {\\url{https://Fenlanddavid.github.io/fossilmapped/}},
  year = {${year}},
  month = {${month}},
  note = {FossilMapped ID: ${bibEscape(find.id)}. Stratigraphy: ${bibEscape(strat || 'Unknown')}. Provenance: ${bibEscape(find.locationName)} (${find.latitude.toFixed(4)}, ${find.longitude.toFixed(4)}). Repository: ${bibEscape(find.repository || 'Private')}.${dims ? ` Measurements: ${bibEscape(dims)}.` : ''}${find.notes ? ` Notes: ${bibEscape(find.notes)}.` : ''}}
}`
}

function normalise(value: unknown) {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : ''
}

function numberValue(value: unknown) {
  const next = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN
  return Number.isFinite(next) ? next : null
}

function percent(value: number, total: number) {
  return total > 0 ? Math.round((value / total) * 100) : 0
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function formatDate(value: string) {
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return 'Unknown'
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

function bibEscape(value: string): string {
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

export default App
