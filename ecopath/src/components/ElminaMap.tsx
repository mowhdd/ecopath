import { useEffect, useMemo, useRef, useState } from 'react';
import * as maplibregl from 'maplibre-gl';
import { setWorkerUrl } from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import 'maplibre-gl/dist/maplibre-gl.css';
setWorkerUrl(workerUrl);
import { SEGMENTS, PLACES, CENTER } from '../data/elmina';
import { route, type Mode } from '../utils/walkRouting';

const MODES = {
  shade: { label: 'Shade', icon: 'park', color: '#0b6b3a', note: 'Shade is estimated from park proximity and path type' },
  night: { label: 'Night', icon: 'dark_mode', color: '#e09a00', note: 'Lighting is estimated from path type and nearby venues' },
  access: { label: 'Accessible', icon: 'accessible', color: '#2f6fed', note: 'Wheelchair-tagged paths from OpenStreetMap' },
} as const;
const KIND: Record<string, string> = { mall: 'storefront', park: 'park', water: 'water', sport: 'sports_soccer', rest: 'local_cafe', view: 'visibility', bridge: 'water_lux' };
const STYLE = (m: Mode) => `https://tiles.openfreemap.org/styles/${m === 'night' ? 'dark' : 'positron'}`;
const isRoad = ['==', ['get', 't'], 'r'];
const COLOR: Record<Mode, any> = {
  shade: ['interpolate', ['linear'], ['get', 'sh'], 0, '#b9dba8', 100, '#0b6b3a'],
  night: ['interpolate', ['linear'], ['get', 'li'], 0, '#5b6fa0', 100, '#ffc233'],
  access: ['case', ['==', ['get', 't'], 'u'], '#d93025', ['==', ['get', 'w'], 1], '#2f6fed', '#aab0b8'],
};
const WIDTH: any = ['interpolate', ['linear'], ['zoom'], 13, ['case', isRoad, 1, 2.5], 18, ['case', isRoad, 4, 11]];
const NET: any = {
  type: 'FeatureCollection',
  features: SEGMENTS.map((g) => {
    const coordinates: number[][] = [];
    for (let i = 0; i < g.c.length; i += 2) coordinates.push([g.c[i + 1], g.c[i]]);
    return { type: 'Feature', properties: { t: g.t, w: g.w, sh: g.sh, li: g.li }, geometry: { type: 'LineString', coordinates } };
  }),
};
const glass = 'bg-white/80 backdrop-blur-xl border border-white/60 shadow-lg';

export function ElminaMap({ onOpenReportModal, onWalkComplete }: { onOpenReportModal: () => void; onWalkComplete: (km: number) => void }) {
  const el = useRef<HTMLDivElement>(null), map = useRef<maplibregl.Map>(null as any), styleUrl = useRef(STYLE('shade'));
  const pills = useRef<Record<string, HTMLDivElement>>({});
  const [mode, setMode] = useState<Mode>('shade'), [from, setFrom] = useState('lakeside-mall'), [to, setTo] = useState('rainbow-bridge');
  const r = useMemo(() => route(mode, from, to), [mode, from, to]);
  const live = useRef({ mode, r, from }); live.current = { mode, r, from };
  const m0 = MODES[mode];

  const apply = () => {
    const m = map.current, { mode: md, r: rt } = live.current;
    if (!m || !m.getLayer('net')) return;
    m.setPaintProperty('net', 'line-color', COLOR[md]);
    m.setFilter('net', md === 'access' ? ['!=', ['get', 't'], 'r'] : null);
    m.setPaintProperty('route', 'line-color', MODES[md].color);
    (m.getSource('route') as maplibregl.GeoJSONSource).setData({ type: 'FeatureCollection', features: rt ? [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: rt.path.map((p) => [p.lng, p.lat]) } }] : [] } as any);
  };
  const setup = () => {
    const m = map.current;
    if (m.getSource('net')) return;
    const layout: any = { 'line-cap': 'round', 'line-join': 'round' };
    m.addSource('net', { type: 'geojson', data: NET });
    m.addLayer({ id: 'net', type: 'line', source: 'net', layout, paint: { 'line-color': COLOR[live.current.mode], 'line-width': WIDTH, 'line-opacity': 0.92 } });
    m.addSource('route', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    m.addLayer({ id: 'route-casing', type: 'line', source: 'route', layout, paint: { 'line-color': '#ffffff', 'line-width': 15 } });
    m.addLayer({ id: 'route', type: 'line', source: 'route', layout, paint: { 'line-color': MODES[live.current.mode].color, 'line-width': 9 } });
    apply();
  };
  const pill = (id: string) => 'flex items-center gap-1 px-2 py-1 rounded-full shadow-md text-[11px] font-bold border cursor-pointer ' +
    (id === from ? 'bg-[#1f9d55] text-white border-white' : id === to ? 'bg-[#fc4c02] text-white border-white' : 'bg-white/95 text-[#1c1c1e] border-black/10');

  useEffect(() => {
    const m = new maplibregl.Map({ container: el.current!, style: styleUrl.current, center: [CENTER.lng, CENTER.lat], zoom: 14.7, attributionControl: { compact: true } });
    map.current = m;
    m.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');
    m.on('style.load', setup);
    PLACES.forEach((p) => {
      const outer = document.createElement('div'), inner = document.createElement('div');
      inner.innerHTML = `<span class="material-symbols-outlined text-[15px]">${KIND[p.kind]}</span><span class="hidden sm:inline whitespace-nowrap">${p.name}</span>`;
      outer.append(inner); pills.current[p.id] = inner;
      outer.onclick = () => { if (p.id !== live.current.from) setTo(p.id); };
      new maplibregl.Marker({ element: outer }).setLngLat([p.lng, p.lat]).addTo(m);
    });
    return () => m.remove();
  }, []);
  useEffect(() => { PLACES.forEach((p) => { pills.current[p.id].className = pill(p.id); }); }, [from, to]);
  useEffect(() => {
    const s = STYLE(mode);
    if (styleUrl.current !== s) { styleUrl.current = s; map.current.setStyle(s); } else apply();
  }, [mode, r]);
  useEffect(() => {
    if (!r) return;
    const b = new maplibregl.LngLatBounds();
    r.path.forEach((p) => b.extend([p.lng, p.lat]));
    map.current.fitBounds(b, { padding: { top: 90, bottom: 280, left: 30, right: 30 }, maxZoom: 17, duration: 800 });
  }, [r]);

  const pct = r ? (mode === 'shade' ? r.shade : mode === 'night' ? r.lit : r.access) : 0;
  const lbl = mode === 'shade' ? 'Shaded (est.)' : mode === 'night' ? 'Lit (est.)' : 'Accessible';
  const sel = 'flex-1 min-w-0 rounded-2xl bg-black/5 px-3 py-2.5 text-sm font-semibold text-[#1c1c1e] outline-none';
  return (
    <div className="relative w-full h-[calc(100dvh-8.5rem)] lg:h-[calc(100dvh-4rem)] overflow-hidden">
      <div ref={el} className="absolute inset-0" />
      <div className="absolute top-3 left-3 right-3 flex items-start justify-between gap-2 pointer-events-none">
        <div className={`flex p-1 rounded-full pointer-events-auto ${glass}`}>
          {(Object.keys(MODES) as Mode[]).map((k) => (
            <button key={k} onClick={() => setMode(k)} className={`px-3 py-2 rounded-full text-xs font-bold flex items-center gap-1 ${mode === k ? 'text-white shadow' : 'text-slate-600'}`} style={mode === k ? { background: MODES[k].color } : undefined}>
              <span className="material-symbols-outlined text-[16px]">{MODES[k].icon}</span>{MODES[k].label}
            </button>
          ))}
        </div>
        <button onClick={onOpenReportModal} aria-label="Report an issue" className={`pointer-events-auto w-11 h-11 rounded-full flex items-center justify-center text-[#006948] ${glass}`}>
          <span className="material-symbols-outlined">flag</span>
        </button>
      </div>
      <div className={`absolute bottom-3 left-3 right-3 mx-auto max-w-lg rounded-[28px] p-4 text-[#1c1c1e] space-y-3 shadow-2xl ${glass}`}>
        <div className="mx-auto h-1 w-9 rounded-full bg-black/15 -mt-1" />
        <div className="flex items-center gap-2">
          <select aria-label="From" value={from} onChange={(e) => setFrom(e.target.value)} className={sel}>{PLACES.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
          <button aria-label="Swap" onClick={() => { setFrom(to); setTo(from); }} className="text-slate-500"><span className="material-symbols-outlined">swap_horiz</span></button>
          <select aria-label="To" value={to} onChange={(e) => setTo(e.target.value)} className={sel}>{PLACES.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
        </div>
        {r ? (
          <>
            <div className="grid grid-cols-3 text-center">
              {([[r.km.toFixed(1), 'km', 'Distance'], [r.mins, 'min', 'Walk'], [pct, '%', lbl]] as const).map(([v, u, l]) => (
                <div key={l}><div className="text-2xl font-extrabold leading-none">{v}<span className="text-sm font-bold text-slate-500 ml-0.5">{u}</span></div><div className="text-[11px] text-slate-500 mt-1">{l}</div></div>
              ))}
            </div>
            <button onClick={() => onWalkComplete(r.km)} className="w-full py-3 rounded-full text-white text-sm font-bold shadow" style={{ background: m0.color }}>Start walk</button>
          </>
        ) : <div className="text-sm font-semibold text-center py-2">{from === to ? 'Pick two different places' : 'No connected path found'}</div>}
        <div className="text-[11px] text-center text-slate-500">{m0.note}</div>
      </div>
    </div>
  );
}
