import { useEffect, useMemo, useRef, useState } from 'react';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import { SEGMENTS, PLACES, CENTER } from '../data/elmina';
import { route, along, split, bearing, type Mode } from '../utils/walkRouting';

maplibregl.setWorkerUrl(workerUrl);

const MODES = {
  shade: { label: 'Shade', icon: 'park', color: '#0b6b3a', note: 'Shade is estimated from park proximity and path type' },
  night: { label: 'Night', icon: 'dark_mode', color: '#e09a00', note: 'Lighting is estimated from path type and nearby venues' },
  access: { label: 'Accessible', icon: 'accessible', color: '#2f6fed', note: 'Wheelchair-tagged paths from OpenStreetMap' },
} as const;
const KIND: Record<string, string> = { mall: 'storefront', park: 'park', garden: 'local_florist', water: 'water', sport: 'sports_soccer', rest: 'local_cafe', view: 'visibility', bridge: 'water_lux', school: 'school', worship: 'mosque', health: 'medical_services', community: 'groups', shop: 'store', food: 'restaurant', bank: 'account_balance', fuel: 'local_gas_station', transit: 'directions_bus', rec: 'fitness_center' };
const LABEL: Record<string, string> = { mall: 'Malls', park: 'Parks', garden: 'Gardens & roundabouts', water: 'Water', sport: 'Sports', rest: 'Rest stops', view: 'Viewpoints', bridge: 'Bridges', school: 'Schools & childcare', worship: 'Places of worship', health: 'Health & pharmacy', community: 'Community halls', shop: 'Shops', food: 'Food & drink', bank: 'Banks', fuel: 'Fuel', transit: 'Bus stops', rec: 'Fitness & recreation' };
const Options = () => (
  <>{Object.keys(LABEL).filter((k) => PLACES.some((p) => p.kind === k)).map((k) => (
    <optgroup key={k} label={LABEL[k]}>
      {PLACES.filter((p) => p.kind === k).sort((a, b) => a.name.localeCompare(b.name)).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
    </optgroup>
  ))}</>
);
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
const fc = (c: number[][]): any => ({ type: 'FeatureCollection', features: c.length > 1 ? [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: c } }] : [] });
const glass = 'bg-white/80 backdrop-blur-xl border border-white/60 shadow-lg';

export function ElminaMap({ onOpenReportModal, onWalkComplete }: { onOpenReportModal: () => void; onWalkComplete: (km: number) => void }) {
  const el = useRef<HTMLDivElement>(null), map = useRef<maplibregl.Map>(null as any), styleUrl = useRef(STYLE('shade'));
  const pills = useRef<Record<string, HTMLDivElement>>({});
  const [err, setErr] = useState(''), [mode, setMode] = useState<Mode>('shade'), [from, setFrom] = useState('lakeside-mall'), [to, setTo] = useState('rainbow-bridge');
  const [nav, setNav] = useState<{ d: number; paused: boolean; done: boolean } | null>(null);
  const youRef = useRef<maplibregl.Marker | null>(null), rewarded = useRef(false);
  const r = useMemo(() => route(mode, from, to), [mode, from, to]);
  const live = useRef({ mode, r, from, to, nav }); live.current = { mode, r, from, to, nav };
  const m0 = MODES[mode];

  const apply = () => {
    const m = map.current, { mode: md, r: rt } = live.current;
    if (!m || !m.getLayer('net')) return;
    m.setPaintProperty('net', 'line-color', COLOR[md]);
    m.setFilter('net', md === 'access' ? ['!=', ['get', 't'], 'r'] : null);
    m.setPaintProperty('route', 'line-color', MODES[md].color);
    if (!live.current.nav) (m.getSource('route-done') as maplibregl.GeoJSONSource)?.setData(fc([]));
    (m.getSource('route') as maplibregl.GeoJSONSource).setData({ type: 'FeatureCollection', features: rt ? [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: rt.path.map((p) => [p.lng, p.lat]) } }] : [] } as any);
  };
  const vis = () => {
    const m = map.current; if (!m) return;
    const z = m.getZoom(), { from: f0, to: t0, nav: nv } = live.current;
    PLACES.forEach((p) => { const e = pills.current[p.id]; if (e) (e.parentElement as HTMLElement).style.display = p.id === f0 || p.id === t0 || (!nv && z >= (p.z ?? 0)) ? '' : 'none'; });
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
    m.addSource('route-done', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    m.addLayer({ id: 'route-done', type: 'line', source: 'route-done', layout, paint: { 'line-color': '#9aa0a6', 'line-width': 12 } });
    apply();
  };
  const isOpen = (id: string) => id === from || id === to;
  const pill = (id: string) => isOpen(id)
    ? 'flex items-center gap-1.5 px-2.5 py-1.5 rounded-full shadow-lg text-xs font-bold border-2 border-white cursor-pointer transition-all text-white ' + (id === from ? 'bg-[#1f9d55]' : 'bg-[#fc4c02]')
    : 'flex items-center justify-center w-[22px] h-[22px] rounded-full shadow border border-black/15 bg-white/95 text-slate-600 cursor-pointer transition-all hover:scale-125';

  useEffect(() => {
    const m = new maplibregl.Map({ container: el.current!, style: styleUrl.current, center: [CENTER.lng, CENTER.lat], zoom: 14.7, attributionControl: { compact: true } });
    map.current = m;
    m.once('load', () => fit());
    m.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');
    m.on('style.load', setup);
    m.on('zoom', vis);
    m.on('error', (e: any) => { if (/fetch|network|ajax|load/i.test(String(e?.error?.message ?? ''))) setErr('Map tiles could not load. Check your connection or turn off ad blockers for this site.'); });
    PLACES.forEach((p) => {
      const outer = document.createElement('div'), inner = document.createElement('div');
      inner.innerHTML = `<span class="material-symbols-outlined" style="font-size:14px">${p.icon ?? KIND[p.kind] ?? 'location_on'}</span><span class="name whitespace-nowrap" style="display:none">${p.name}</span>`;
      inner.title = p.name; outer.style.zIndex = '1';
      outer.append(inner); pills.current[p.id] = inner;
      outer.onclick = () => { if (p.id !== live.current.from) setTo(p.id); };
      new maplibregl.Marker({ element: outer }).setLngLat([p.lng, p.lat]).addTo(m);
    });
    vis();
    return () => m.remove();
  }, []);
  useEffect(() => {
    PLACES.forEach((p) => {
      const el2 = pills.current[p.id], open = isOpen(p.id);
      el2.className = pill(p.id);
      (el2.querySelector('.name') as HTMLElement).style.display = open ? '' : 'none';
      (el2.parentElement as HTMLElement).style.zIndex = open ? '5' : '1';
    });
    vis();
  }, [from, to]);
  useEffect(() => {
    const s = STYLE(mode);
    if (styleUrl.current !== s) { styleUrl.current = s; map.current.setStyle(s); } else apply();
  }, [mode, r]);
  const fit = () => {
    const m = map.current, rt = live.current.r;
    if (!m || !rt || live.current.nav) return;
    const c = m.getContainer(), w = c.clientWidth, h = c.clientHeight;
    if (w < 80 || h < 120) return;
    m.resize();
    const b = new maplibregl.LngLatBounds();
    rt.path.forEach((p) => b.extend([p.lng, p.lat]));
    const side = Math.min(30, w * 0.08);
    m.fitBounds(b, { padding: { top: Math.min(90, h * 0.12), bottom: Math.min(280, h * 0.42), left: side, right: side }, maxZoom: 17, duration: 800 });
  };
  useEffect(() => { fit(); }, [r]);

  const startNav = () => {
    if (!r) return;
    const mk = document.createElement('div');
    mk.style.zIndex = '10';
    mk.innerHTML = '<div style="width:22px;height:22px;border-radius:50%;background:#2f6fed;border:4px solid #fff;box-shadow:0 0 0 7px rgba(47,111,237,.25),0 2px 8px rgba(0,0,0,.4)"></div>';
    youRef.current = new maplibregl.Marker({ element: mk }).setLngLat([r.path[0].lng, r.path[0].lat]).addTo(map.current);
    setNav({ d: 0, paused: false, done: false });
  };
  const endNav = () => {
    youRef.current?.remove(); youRef.current = null; setNav(null);
    map.current.easeTo({ pitch: 0, bearing: 0, duration: 600 });
    setTimeout(() => { apply(); fit(); }, 700);
  };
  useEffect(() => {
    if (!nav || nav.paused || nav.done || !r) return;
    const step = r.total / (Math.min(70, Math.max(25, r.total / 30)) * 10);
    const id = setInterval(() => setNav((n) => (n && !n.paused && !n.done ? (n.d + step >= r.total ? { ...n, d: r.total, done: true } : { ...n, d: n.d + step }) : n)), 100);
    return () => clearInterval(id);
  }, [!!nav, nav?.paused, nav?.done, r]);
  useEffect(() => {
    const m = map.current;
    if (!nav || !r || !m?.getSource('route-done')) return;
    const p = along(r, nav.d), q = along(r, Math.min(r.total, nav.d + 30)), { done, rest } = split(r, nav.d);
    youRef.current?.setLngLat([p.lng, p.lat]);
    (m.getSource('route-done') as maplibregl.GeoJSONSource).setData(fc(done));
    (m.getSource('route') as maplibregl.GeoJSONSource).setData(fc(rest));
    m.easeTo({ center: [p.lng, p.lat], bearing: nav.d < r.total - 1 ? bearing(p, q) : m.getBearing(), pitch: 55, zoom: 17.6, duration: 250, essential: true });
  }, [nav?.d]);
  useEffect(() => {
    const m = map.current, on = !!nav;
    vis();
    if (!m || !m.getLayer('net')) return;
    m.setPaintProperty('net', 'line-opacity', on ? 0.15 : 0.92);
    m.setPaintProperty('route', 'line-width', on ? 12 : 9);
    m.setPaintProperty('route-casing', 'line-width', on ? 19 : 15);
  }, [!!nav]);
  useEffect(() => {
    if (nav?.done && r && !rewarded.current) { rewarded.current = true; onWalkComplete(r.km); }
    if (!nav) rewarded.current = false;
  }, [nav?.done, !!nav]);
  useEffect(() => () => { youRef.current?.remove(); }, []);

  const navUi = () => {
    const rt = r!, n = nav!, st = rt.steps, dest = PLACES.find((p) => p.id === to)?.name ?? '';
    let u = 1; while (u < st.length - 1 && st[u].at <= n.d + 1) u++;
    const head = n.d < 3, main = head ? st[0] : st[u], then = head ? st[u] : st[u + 1], dm = Math.max(0, st[u].at - n.d);
    const fmt = dm >= 1000 ? (dm / 1000).toFixed(1) + ' km' : Math.max(5, Math.round(dm / 5) * 5) + ' m';
    const rem = rt.total - n.d, mins = Math.max(1, Math.ceil(rem / (mode === 'access' ? 67 : 83)));
    const eta = new Date(Date.now() + mins * 60000).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    return (
      <>
        <div className="absolute top-3 left-3 right-3 mx-auto max-w-lg rounded-3xl bg-[#0b4f3a] text-white shadow-2xl p-4">
          <div className="flex items-center gap-3">
            <span className="material-symbols-outlined shrink-0" style={{ fontSize: 44 }}>{n.done ? 'flag' : main.icon}</span>
            <div className="min-w-0">
              <div className="text-3xl font-extrabold leading-none">{n.done ? 'Arrived' : fmt}</div>
              <div className="text-sm opacity-90 mt-1">{n.done ? `You're at ${dest}` : main.text}</div>
            </div>
          </div>
          {!n.done && then && st.indexOf(then) !== st.indexOf(main) && (
            <div className="mt-3 pt-2 border-t border-white/20 text-xs opacity-85 flex items-center gap-1.5"><span className="material-symbols-outlined text-[16px]">{then.icon}</span>Then: {then.text}</div>
          )}
        </div>
        <div className={`absolute bottom-3 left-3 right-3 mx-auto max-w-lg rounded-[28px] p-4 text-[#1c1c1e] shadow-2xl ${glass}`}>
          <div className="h-1.5 rounded-full bg-black/10 overflow-hidden mb-3"><div className="h-full rounded-full" style={{ width: `${(n.d / rt.total) * 100}%`, background: m0.color }} /></div>
          {n.done ? (
            <div className="flex items-center justify-between gap-3">
              <div><div className="font-extrabold text-lg">+{Math.round(rt.km * 80)} Eco-Steps</div><div className="text-xs text-slate-500">{rt.km.toFixed(1)} km walked on the {m0.label.toLowerCase()} route</div></div>
              <button onClick={endNav} className="px-6 py-3 rounded-full text-white text-sm font-bold" style={{ background: m0.color }}>Done</button>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-3">
              <div><div className="text-2xl font-extrabold leading-none" style={{ color: m0.color }}>{mins} min</div><div className="text-xs text-slate-500 mt-1">{(rem / 1000).toFixed(1)} km · arrive {eta}</div></div>
              <div className="flex items-center gap-2">
                <button aria-label={n.paused ? 'Resume' : 'Pause'} onClick={() => setNav((x) => x && { ...x, paused: !x.paused })} className="w-11 h-11 rounded-full bg-black/5 flex items-center justify-center"><span className="material-symbols-outlined">{n.paused ? 'play_arrow' : 'pause'}</span></button>
                <button onClick={endNav} className="px-5 py-3 rounded-full bg-[#d93025] text-white text-sm font-bold">End</button>
              </div>
            </div>
          )}
        </div>
      </>
    );
  };

  const pct = r ? (mode === 'shade' ? r.shade : mode === 'night' ? r.lit : r.access) : 0;
  const lbl = mode === 'shade' ? 'Shaded (est.)' : mode === 'night' ? 'Lit (est.)' : 'Accessible';
  const sel = 'flex-1 min-w-0 rounded-2xl bg-black/5 px-3 py-2.5 text-sm font-semibold text-[#1c1c1e] outline-none';
  return (
    <div className="relative w-full h-[calc(100dvh-8.5rem)] lg:h-[calc(100dvh-4rem)] overflow-hidden">
      <div ref={el} style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 }} />
      {err && <div className="absolute top-20 left-3 right-3 mx-auto max-w-md rounded-2xl bg-amber-50 text-amber-900 text-xs font-semibold p-3 shadow">{err}</div>}
      {nav && r && navUi()}
      {!nav && (<>
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
          <select aria-label="From" value={from} onChange={(e) => setFrom(e.target.value)} className={sel}><Options /></select>
          <button aria-label="Swap" onClick={() => { setFrom(to); setTo(from); }} className="text-slate-500"><span className="material-symbols-outlined">swap_horiz</span></button>
          <select aria-label="To" value={to} onChange={(e) => setTo(e.target.value)} className={sel}><Options /></select>
        </div>
        {r ? (
          <>
            <div className="grid grid-cols-3 text-center">
              {([[r.km.toFixed(1), 'km', 'Distance'], [r.mins, 'min', 'Walk'], [pct, '%', lbl]] as const).map(([v, u, l]) => (
                <div key={l}><div className="text-2xl font-extrabold leading-none">{v}<span className="text-sm font-bold text-slate-500 ml-0.5">{u}</span></div><div className="text-[11px] text-slate-500 mt-1">{l}</div></div>
              ))}
            </div>
            <button onClick={startNav} className="w-full py-3 rounded-full text-white text-sm font-bold shadow" style={{ background: m0.color }}>Start walk</button>
          </>
        ) : <div className="text-sm font-semibold text-center py-2">{from === to ? 'Pick two different places' : 'No connected path found'}</div>}
        <div className="text-[11px] text-center text-slate-500">{m0.note}</div>
      </div>
      </>)}
    </div>
  );
}
