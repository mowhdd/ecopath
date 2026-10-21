import { SEGMENTS, PLACES, NAMES } from '../data/elmina';
export type Mode = 'shade' | 'night' | 'access';
type Edge = { to: number; len: number; s: number };
const ids = new Map<string, number>(), pts: number[][] = [], adj: Edge[][] = [];
const node = (la: number, ln: number) => { const k = la + ',' + ln; let i = ids.get(k); if (i === undefined) { i = pts.length; ids.set(k, i); pts.push([la, ln]); adj.push([]); } return i; };
const hav = (a: number[], b: number[]) => { const r = Math.PI / 180, x = Math.sin(((b[0] - a[0]) * r) / 2) ** 2 + Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.sin(((b[1] - a[1]) * r) / 2) ** 2; return 12742000 * Math.asin(Math.sqrt(x)); };
SEGMENTS.forEach((g, s) => { let pv = -1; for (let i = 0; i < g.c.length; i += 2) { const n = node(g.c[i], g.c[i + 1]); if (pv >= 0 && pv !== n) { const len = hav(pts[pv], pts[n]); adj[pv].push({ to: n, len, s }); adj[n].push({ to: pv, len, s }); } pv = n; } });
const comp = new Int32Array(pts.length).fill(-1); let best = 0, bestN = 0, cc = 0;
for (let i = 0; i < pts.length; i++) { if (comp[i] >= 0) continue; let n = 0; const st = [i]; comp[i] = cc; while (st.length) { const u = st.pop()!; n++; for (const e of adj[u]) if (comp[e.to] < 0) { comp[e.to] = cc; st.push(e.to); } } if (n > bestN) { bestN = n; best = cc; } cc++; }
const snap = (p: { lat: number; lng: number }) => { let b = -1, bd = 1e18; for (let i = 0; i < pts.length; i++) { if (comp[i] !== best) continue; const d = (pts[i][0] - p.lat) ** 2 + (pts[i][1] - p.lng) ** 2; if (d < bd) { bd = d; b = i; } } return b; };
const cost = (m: Mode, e: Edge) => { const g = SEGMENTS[e.s]; if (m === 'shade') return e.len * (1 + 2 * (1 - g.sh / 100)); if (m === 'night') return e.len * (1 + 2 * (1 - g.li / 100)); if (g.t === 'u' || g.t === 'g') return Infinity; return e.len * (g.w ? 1 : 2.5); };
export function route(m: Mode, fromId: string, toId: string) {
  const A = PLACES.find((p) => p.id === fromId), B = PLACES.find((p) => p.id === toId);
  if (!A || !B || fromId === toId) return null;
  const s = snap(A), t = snap(B), dist = new Float64Array(pts.length).fill(Infinity), pe: (Edge & { from: number } | undefined)[] = [];
  const h: [number, number][] = [[0, s]]; dist[s] = 0;
  const push = (x: [number, number]) => { h.push(x); let i = h.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (h[p][0] <= h[i][0]) break; [h[p], h[i]] = [h[i], h[p]]; i = p; } };
  const pop = () => { const top = h[0], last = h.pop()!; if (h.length) { h[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let k = i; if (l < h.length && h[l][0] < h[k][0]) k = l; if (r < h.length && h[r][0] < h[k][0]) k = r; if (k === i) break; [h[k], h[i]] = [h[i], h[k]]; i = k; } } return top; };
  while (h.length) { const [d, u] = pop(); if (d > dist[u]) continue; if (u === t) break; for (const e of adj[u]) { const nd = d + cost(m, e); if (nd < dist[e.to]) { dist[e.to] = nd; pe[e.to] = { ...e, from: u }; push([nd, e.to]); } } }
  if (dist[t] === Infinity) return null;
  const path: { lat: number; lng: number }[] = [{ lat: pts[t][0], lng: pts[t][1] }]; let len = 0, sh = 0, li = 0, ac = 0; const es: Edge[] = [];
  for (let u = t; u !== s;) { const e = pe[u]!, g = SEGMENTS[e.s]; es.push(e); len += e.len; sh += e.len * g.sh; li += e.len * g.li; if (g.w) ac += e.len; u = e.from; path.push({ lat: pts[u][0], lng: pts[u][1] }); }
  path.reverse(); es.reverse(); const cum = [0]; es.forEach((e) => cum.push(cum[cum.length - 1] + e.len)); const segs = es.map((e) => e.s);
  return { path, cum, segs, total: len, steps: buildSteps(path, cum, segs, B.name), km: len / 1000, mins: Math.max(1, Math.round(len / (m === 'access' ? 67 : 83))), shade: Math.round(sh / len), lit: Math.round(li / len), access: Math.round((ac / len) * 100) };
}

type P = { lat: number; lng: number };
export type Route = NonNullable<ReturnType<typeof route>>;
export const bearing = (a: P, b: P) => { const r = Math.PI / 180, y = Math.sin((b.lng - a.lng) * r) * Math.cos(b.lat * r), x = Math.cos(a.lat * r) * Math.sin(b.lat * r) - Math.sin(a.lat * r) * Math.cos(b.lat * r) * Math.cos((b.lng - a.lng) * r); return (Math.atan2(y, x) / r + 360) % 360; };
const pos = (path: P[], cum: number[], d: number) => { d = Math.max(0, Math.min(d, cum[cum.length - 1])); let i = 0; while (i < cum.length - 2 && cum[i + 1] < d) i++; const k = cum[i + 1] > cum[i] ? (d - cum[i]) / (cum[i + 1] - cum[i]) : 0; return { lat: path[i].lat + (path[i + 1].lat - path[i].lat) * k, lng: path[i].lng + (path[i + 1].lng - path[i].lng) * k, i }; };
export const along = (r: { path: P[]; cum: number[] }, d: number) => pos(r.path, r.cum, d);
export const split = (r: { path: P[]; cum: number[] }, d: number) => { const p = pos(r.path, r.cum, d), c = (a: P) => [a.lng, a.lat]; return { done: [...r.path.slice(0, p.i + 1).map(c), c(p)], rest: [c(p), ...r.path.slice(p.i + 1).map(c)] }; };
const TYPE_NAME: Record<string, string> = { f: 'the footpath', s: 'the sidewalk', x: 'the crossing', r: 'the road', u: 'the steps', g: 'the trail' };
const nm = (s: number) => { const g = SEGMENTS[s]; return g.n != null ? NAMES[g.n] : TYPE_NAME[g.t] ?? 'the path'; };
const CARD = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];
function buildSteps(path: P[], cum: number[], segs: number[], dest: string) {
  const total = cum[cum.length - 1], at = (d: number) => pos(path, cum, d);
  const st: { at: number; text: string; icon: string }[] = [{ at: 0, text: `Head ${CARD[Math.round(bearing(at(0), at(Math.min(25, total))) / 45) % 8]} on ${nm(segs[0])}`, icon: 'straight' }];
  for (let k = 1; k < segs.length; k++) {
    const D = cum[k], a = ((bearing(path[k], at(Math.min(total, D + 15))) - bearing(at(Math.max(0, D - 15)), path[k]) + 540) % 360) - 180, abs = Math.abs(a);
    const s1 = segs[k - 1], s2 = segs[k], t1 = SEGMENTS[s1].t, t2 = SEGMENTS[s2].t;
    if ((s1 === s2 && abs < 50) || D - st[st.length - 1].at < 12) continue;
    let text: string, icon: string;
    if (t2 === 'x' && t1 !== 'x') { text = 'Cross the road'; icon = 'directions_walk'; }
    else if (t2 === 'u' && t1 !== 'u') { text = 'Take the steps'; icon = 'stairs'; }
    else if (abs < 22) { if (nm(s1) === nm(s2)) continue; text = `Continue onto ${nm(s2)}`; icon = 'straight'; }
    else { const same = nm(s1) === nm(s2); if (same && abs < 45) continue; const dir = a < 0 ? 'left' : 'right'; text = `${abs < 60 ? 'Bear' : abs > 135 ? 'Turn sharp' : 'Turn'} ${dir}${same ? '' : ' onto ' + nm(s2)}`; icon = `turn_${abs < 60 ? 'slight_' : abs > 135 ? 'sharp_' : ''}${dir}`; }
    st.push({ at: D, text, icon });
  }
  st.push({ at: total, text: `Arrive at ${dest}`, icon: 'flag' });
  return st;
}
