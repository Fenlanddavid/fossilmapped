import React, { useState, useEffect, useRef } from 'react'
import { 
  Map as MapIcon, Grid, List, Search, Globe, Info, Filter, 
  Eye, Database, BarChart3, ChevronRight, Hash, Calendar, 
  MapPin, User, Ruler, Layers 
} from 'lucide-react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { SharedFind } from './types'
import { getSharedFinds } from './services/supabase'

// Expanded Mock Data for "Researcher" feel
const MOCK_FINDS: SharedFind[] = [
  {
    id: 'FMP-2026-001',
    collectorName: 'D. Johnston',
    taxon: 'Hildoceras bifrons',
    element: 'Complete Phragmocone',
    period: 'Jurassic (Toarcian)',
    locationName: 'Whitby, North Yorkshire',
    latitude: 54.4858,
    longitude: -0.6206,
    dateCollected: '2026-02-15',
    photos: [],
    sharedAt: '2026-02-16',
    isPublic: true,
    measurements: { length: 45, width: 38, thickness: 12, weight: 85 },
    notes: "Found in situ within the Alum Shale Member. Excellent suturing preserved."
  },
  {
    id: 'FMP-2026-002',
    collectorName: 'S. Miller',
    taxon: 'Gryphaea arcuata',
    element: 'Left Valve',
    period: 'Jurassic (Sinemurian)',
    locationName: 'Lyme Regis, Dorset',
    latitude: 50.7252,
    longitude: -2.9345,
    dateCollected: '2026-02-20',
    photos: [],
    sharedAt: '2026-02-21',
    isPublic: true,
    measurements: { length: 55, width: 42, thickness: 25, weight: 120 }
  }
]

function App() {
  const [activeTab, setActiveTab] = useState<'map' | 'gallery' | 'database' | 'stats'>('map')
  const [selectedFind, setSelectedFind] = useState<SharedFind | null>(null)
  const [finds, setFinds] = useState<SharedFind[]>([])
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState<{label: string, count: number, color: string}[]>([])
  const [activity, setActivity] = useState<SharedFind[]>([])
  const mapContainer = useRef<HTMLDivElement>(null)
  const map = useRef<maplibregl.Map | null>(null)

  useEffect(() => {
    async function loadData() {
      try {
        const data = await getSharedFinds()
        // Map DB fields back to our UI type
        const mappedData: SharedFind[] = data.map((d: any) => ({
          id: d.fossilmap_id,
          collectorName: d.collector_name,
          collectorEmail: d.collector_email, // Map the email field
          taxon: d.taxon,
          element: d.element,
          period: d.period || "Unknown",
          locationName: d.location_name,
          latitude: d.latitude,
          longitude: d.longitude,
          dateCollected: d.date_collected,
          photos: d.photos || [],
          measurements: d.measurements,
          notes: d.notes,
          sharedAt: d.shared_at,
          isPublic: true
        }))
        setFinds(mappedData)

        // Calculate Stats
        const periods: Record<string, number> = {}
        mappedData.forEach(f => {
          const p = (f.period || "Unknown").split(' (')[0] // normalize "Jurassic (Toarcian)" to "Jurassic"
          periods[p] = (periods[p] || 0) + 1
        })
        const colors = ['bg-accent', 'bg-blue-500', 'bg-green-500', 'bg-purple-500', 'bg-amber-500']
        const sortedStats = Object.entries(periods)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5)
          .map(([label, count], i) => ({
            label,
            count: Math.round((count / mappedData.length) * 100),
            color: colors[i % colors.length]
          }))
        setStats(sortedStats.length > 0 ? sortedStats : [
          { label: 'Jurassic', count: 0, color: 'bg-accent' },
          { label: 'Cretaceous', count: 0, color: 'bg-blue-500' },
          { label: 'Devonian', count: 0, color: 'bg-green-500' }
        ])

        // Get recent activity (last 5)
        setActivity(mappedData.sort((a, b) => new Date(b.sharedAt).getTime() - new Date(a.sharedAt).getTime()).slice(0, 5))

      } catch (e) {
        console.error("Failed to fetch finds:", e)
        // Fallback to mock data if database fails or isn't set up yet
        setFinds(MOCK_FINDS)
      } finally {
        setLoading(false)
      }
    }
    loadData()
  }, [])

  useEffect(() => {
    if (activeTab === 'map' && mapContainer.current && !map.current && !loading) {
      map.current = new maplibregl.Map({
        container: mapContainer.current,
        style: 'https://tiles.basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
        center: [-2.0, 54.0],
        zoom: 5.5
      })

      map.current.on('load', () => {
        finds.forEach(find => {
          const el = document.createElement('div');
          el.className = 'w-4 h-4 bg-accent rounded-full border-2 border-white shadow-lg cursor-pointer hover:scale-125 transition-transform';
          
          new maplibregl.Marker(el)
            .setLngLat([find.longitude, find.latitude])
            .addTo(map.current!)
            .getElement().addEventListener('click', () => setSelectedFind(find));
        })
      })
    }
    
    return () => {
      if (map.current) {
        map.current.remove()
        map.current = null
      }
    }
  }, [activeTab, loading, finds])

  return (
    <div className="fixed inset-0 flex flex-col bg-[#050505] text-white overflow-hidden font-sans">
      {/* Top Professional Header */}
      <header className="h-14 px-4 bg-surface border-b border-white/5 flex items-center justify-between z-30 shadow-2xl">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-accent rounded flex items-center justify-center">
              <Database className="w-5 h-5 text-black" />
            </div>
            <div>
              <h1 className="text-sm font-black tracking-tighter uppercase leading-none">FossilMapped</h1>
              <p className="text-[9px] text-accent font-bold tracking-[0.2em] uppercase mt-0.5">National Palaeo Database</p>
            </div>
          </div>
          <div className="hidden md:flex items-center gap-1 bg-black/40 rounded-lg p-1 border border-white/5 ml-4">
             <button className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider rounded-md bg-white/5 text-white">Public Records</button>
             <button className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider rounded-md text-white/40 hover:text-white transition-colors">Research Requests</button>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
           <div className="relative hidden sm:block">
             <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/30" />
             <input 
                placeholder="Search Taxon, ID, Region..." 
                className="bg-black/40 border border-white/10 rounded-full py-1.5 pl-9 pr-4 text-xs w-64 focus:border-accent/50 outline-none transition-all"
             />
           </div>
           <button className="p-2 rounded-lg hover:bg-white/5">
             <Filter className="w-4 h-4 text-white/60" />
           </button>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden relative">
        {/* Main Content Area */}
        <main className="flex-1 relative flex flex-col">
          {/* Internal View Tabs */}
          <div className="flex items-center px-4 h-10 border-b border-white/5 bg-surface/50 gap-6 z-20">
             <button onClick={() => setActiveTab('map')} className={`text-[10px] font-black uppercase tracking-widest flex items-center gap-2 h-full border-b-2 transition-all ${activeTab === 'map' ? 'border-accent text-accent' : 'border-transparent text-white/40 hover:text-white'}`}>
               <MapIcon className="w-3 h-3" /> Spatial Map
             </button>
             <button onClick={() => setActiveTab('database')} className={`text-[10px] font-black uppercase tracking-widest flex items-center gap-2 h-full border-b-2 transition-all ${activeTab === 'database' ? 'border-accent text-accent' : 'border-transparent text-white/40 hover:text-white'}`}>
               <List className="w-3 h-3" /> Record List
             </button>
             <button onClick={() => setActiveTab('gallery')} className={`text-[10px] font-black uppercase tracking-widest flex items-center gap-2 h-full border-b-2 transition-all ${activeTab === 'gallery' ? 'border-accent text-accent' : 'border-transparent text-white/40 hover:text-white'}`}>
               <Grid className="w-3 h-3" /> Visual Gallery
             </button>
             <button onClick={() => setActiveTab('stats')} className={`text-[10px] font-black uppercase tracking-widest flex items-center gap-2 h-full border-b-2 transition-all ${activeTab === 'stats' ? 'border-accent text-accent' : 'border-transparent text-white/40 hover:text-white'}`}>
               <BarChart3 className="w-3 h-3" /> Analytics
             </button>
          </div>

          <div className="flex-1 relative">
            {activeTab === 'map' && <div ref={mapContainer} className="absolute inset-0 w-full h-full" />}
            
            {activeTab === 'database' && (
              <div className="absolute inset-0 overflow-auto bg-[#0a0a0a]">
                <table className="w-full text-left border-collapse min-w-[800px]">
                  <thead className="sticky top-0 bg-surface z-10 border-b border-white/10">
                    <tr className="text-[10px] font-black uppercase tracking-widest text-white/40">
                      <th className="px-6 py-4">Ref ID</th>
                      <th className="px-6 py-4">Taxon</th>
                      <th className="px-6 py-4">Period</th>
                      <th className="px-6 py-4">Location</th>
                      <th className="px-6 py-4">Collector</th>
                      <th className="px-6 py-4">Date</th>
                      <th className="px-6 py-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {finds.map(find => (
                      <tr key={find.id} className="hover:bg-white/[0.02] group transition-colors cursor-pointer" onClick={() => setSelectedFind(find)}>
                        <td className="px-6 py-4 text-xs font-mono text-accent">{find.id}</td>
                        <td className="px-6 py-4">
                           <div className="text-sm font-bold">{find.taxon}</div>
                           <div className="text-[10px] text-white/40">{find.element}</div>
                        </td>
                        <td className="px-6 py-4 text-xs text-white/60">{find.period}</td>
                        <td className="px-6 py-4 text-xs text-white/60">{find.locationName}</td>
                        <td className="px-6 py-4 text-xs text-white/60">{find.collectorName}</td>
                        <td className="px-6 py-4 text-xs font-mono text-white/40">{find.dateCollected}</td>
                        <td className="px-6 py-4 text-right">
                          <button className="p-2 rounded-lg hover:bg-accent/10 hover:text-accent transition-all">
                            <ChevronRight className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {activeTab === 'gallery' && (
              <div className="absolute inset-0 overflow-y-auto p-6 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
                {finds.map(find => (
                  <div key={find.id} onClick={() => setSelectedFind(find)} className="group bg-surface rounded-xl overflow-hidden border border-white/5 hover:border-accent/40 transition-all cursor-pointer shadow-lg">
                    <div className="aspect-square bg-black/40 flex items-center justify-center text-[10px] text-white/10 uppercase tracking-[0.2em] font-black italic">
                      {find.photos && find.photos.length > 0 ? (
                        <img src={find.photos[0]} alt={find.taxon} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" />
                      ) : (
                        "Restricted Access Image"
                      )}
                    </div>
                    <div className="p-4">
                      <div className="text-[9px] font-black text-accent uppercase tracking-wider mb-1">{find.period}</div>
                      <h3 className="text-sm font-bold leading-tight mb-1">{find.taxon}</h3>
                      <p className="text-[10px] text-white/40 truncate">{find.locationName}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </main>

        {/* Sidebar Statistics (Researcher Desktop only) */}
        <aside className="hidden xl:flex flex-col w-80 bg-surface border-l border-white/5 p-6 space-y-8 overflow-y-auto">
           <div>
             <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-white/30 mb-4 flex items-center gap-2">
               <BarChart3 className="w-3 h-3" /> Distribution by Period
             </h3>
             <div className="space-y-3">
               {stats.map(stat => (
                 <div key={stat.label} className="space-y-1">
                   <div className="flex justify-between text-[10px] font-bold">
                     <span>{stat.label}</span>
                     <span className="text-white/40">{stat.count}%</span>
                   </div>
                   <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                     <div className={`h-full ${stat.color}`} style={{ width: `${stat.count}%` }} />
                   </div>
                 </div>
               ))}
             </div>
           </div>

           <div>
             <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-white/30 mb-4">Registry Activity</h3>
             <div className="space-y-4">
               {activity.map(f => (
                 <div key={f.id} className="flex gap-3 text-[10px]">
                    <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center shrink-0">
                      <Globe className="w-4 h-4 text-white/20" />
                    </div>
                    <div>
                      <p className="font-bold">New Record Shared</p>
                      <p className="text-white/40">{f.taxon} from {f.locationName} added by {f.collectorName}.</p>
                      <p className="text-accent mt-1">{new Date(f.sharedAt).toLocaleDateString()}</p>
                    </div>
                 </div>
               ))}
             </div>
           </div>
        </aside>
      </div>

      {/* Detail Overlay (Modal) */}
      {selectedFind && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-12">
          <div className="absolute inset-0 bg-black/90 backdrop-blur-sm" onClick={() => setSelectedFind(null)} />
          <div className="relative w-full max-w-5xl bg-surface border border-white/10 rounded-3xl overflow-hidden shadow-2xl flex flex-col md:flex-row max-h-[90vh]">
             {/* Left: Visuals */}
             <div className="w-full md:w-1/2 bg-black flex flex-col h-[400px] md:h-auto">
                <div className="flex-1 flex items-center justify-center relative group overflow-hidden bg-[#050505]">
                  {selectedFind.photos && selectedFind.photos.length > 0 ? (
                    <img src={selectedFind.photos[0]} alt={selectedFind.taxon} className="w-full h-full object-contain" />
                  ) : (
                    <span className="text-white/10 text-xs italic font-black uppercase tracking-widest">Scientific Documentation Required</span>
                  )}
                  <div className="absolute top-4 left-4 bg-black/60 backdrop-blur-md px-3 py-1.5 rounded-lg border border-white/10 flex items-center gap-2">
                    <Eye className="w-3 h-3 text-accent" />
                    <span className="text-[10px] font-black uppercase tracking-wider">Authenticated View</span>
                  </div>
                </div>
                <div className="h-20 border-t border-white/5 p-3 flex gap-2 bg-surface">
                  {selectedFind.photos && selectedFind.photos.map((photo, i) => (
                    <div key={i} className="w-16 h-full bg-black/40 rounded-lg border border-white/10 overflow-hidden cursor-pointer hover:border-accent transition-all">
                       <img src={photo} alt={`${selectedFind.taxon} ${i+1}`} className="w-full h-full object-cover" />
                    </div>
                  ))}
                  {(!selectedFind.photos || selectedFind.photos.length === 0) && [1, 2, 3, 4].map(i => (
                    <div key={i} className="w-16 h-full bg-white/5 rounded-lg border border-white/10 flex items-center justify-center text-[8px] text-white/20 font-bold uppercase text-center p-1">Slot {i}</div>
                  ))}
                </div>
             </div>

             {/* Right: Technical Metadata */}
             <div className="w-full md:w-1/2 overflow-y-auto p-8 custom-scrollbar">
                <div className="flex justify-between items-start mb-6">
                  <div>
                    <div className="flex items-center gap-2 text-accent mb-2">
                      <Hash className="w-4 h-4" />
                      <span className="text-xs font-mono font-bold tracking-tighter">{selectedFind.id}</span>
                    </div>
                    <h2 className="text-3xl font-black leading-none mb-1 italic">{selectedFind.taxon}</h2>
                    <p className="text-sm text-white/60 font-medium">{selectedFind.element}</p>
                  </div>
                  <button onClick={() => setSelectedFind(null)} className="p-2 hover:bg-white/10 rounded-full transition-colors">
                    <Info className="w-6 h-6 rotate-45" />
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-4 mb-8">
                   <div className="bg-black/30 p-4 rounded-2xl border border-white/5">
                      <div className="flex items-center gap-2 text-white/30 mb-2">
                        <Layers className="w-3 h-3" />
                        <span className="text-[9px] font-black uppercase tracking-wider">Stratigraphy</span>
                      </div>
                      <div className="text-sm font-bold">{selectedFind.period}</div>
                   </div>
                   <div className="bg-black/30 p-4 rounded-2xl border border-white/5">
                      <div className="flex items-center gap-2 text-white/30 mb-2">
                        <MapPin className="w-3 h-3" />
                        <span className="text-[9px] font-black uppercase tracking-wider">Provenance</span>
                      </div>
                      <div className="text-sm font-bold">{selectedFind.locationName}</div>
                   </div>
                   <div className="bg-black/30 p-4 rounded-2xl border border-white/5">
                      <div className="flex items-center gap-2 text-white/30 mb-2">
                        <User className="w-3 h-3" />
                        <span className="text-[9px] font-black uppercase tracking-wider">Collector</span>
                      </div>
                      <div className="text-sm font-bold">{selectedFind.collectorName}</div>
                   </div>
                   <div className="bg-black/30 p-4 rounded-2xl border border-white/5">
                      <div className="flex items-center gap-2 text-white/30 mb-2">
                        <Calendar className="w-3 h-3" />
                        <span className="text-[9px] font-black uppercase tracking-wider">Date Found</span>
                      </div>
                      <div className="text-sm font-bold font-mono">{selectedFind.dateCollected}</div>
                   </div>
                </div>

                <div className="mb-8">
                  <div className="flex items-center gap-2 text-white/30 mb-4">
                    <Ruler className="w-3 h-3" />
                    <span className="text-[9px] font-black uppercase tracking-wider">Morphometrics (mm)</span>
                  </div>
                  <div className="grid grid-cols-4 gap-2 text-center">
                    {Object.entries(selectedFind.measurements || {}).map(([key, val]) => (
                      <div key={key} className="bg-black/20 py-3 rounded-xl border border-white/5">
                        <div className="text-[8px] font-black text-white/40 uppercase mb-1">{key}</div>
                        <div className="text-xs font-mono font-bold text-accent">{val}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {selectedFind.notes && (
                  <div className="mb-8">
                    <div className="text-[9px] font-black text-white/30 uppercase tracking-widest mb-3">Researcher Notes</div>
                    <div className="bg-accent/5 border border-accent/10 p-5 rounded-2xl text-xs leading-relaxed text-white/80 italic">
                      "{selectedFind.notes}"
                    </div>
                  </div>
                )}

                <div className="flex flex-col gap-3">
                   <button className="w-full py-4 bg-accent text-black rounded-2xl font-black uppercase tracking-widest text-xs hover:scale-[1.02] active:scale-[0.98] transition-all shadow-xl shadow-accent/10">
                     Download Full Citation (BibTeX)
                   </button>
                   <button 
                     onClick={() => {
                       if (selectedFind.collectorEmail) {
                         window.location.href = `mailto:${selectedFind.collectorEmail}?subject=Access Request: ${selectedFind.taxon} (${selectedFind.id})&body=Hello ${selectedFind.collectorName},%0D%0A%0D%0AI saw your find of ${selectedFind.taxon} on FossilMapped and would like to request more information or access for research purposes.`;
                       } else {
                         alert("This collector has not provided a contact email.");
                       }
                     }}
                     className="w-full py-4 bg-white/5 text-white/60 rounded-2xl font-bold text-xs hover:bg-white/10 transition-all border border-white/5"
                   >
                     Contact Collector for Access
                   </button>
                </div>
             </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default App
