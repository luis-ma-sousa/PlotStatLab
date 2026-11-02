import type { AnnotationPosition, Comparison, Observation } from './types';

export function mean(values: number[]) { return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0; }
export function deviation(values: number[]) { const m = mean(values); return values.length > 1 ? Math.sqrt(values.reduce((s, v) => s + (v - m) ** 2, 0) / (values.length - 1)) : 0; }
export function quantile(values: number[], p: number) { const a = [...values].sort((x, y) => x - y); if (!a.length) return 0; const j = (a.length - 1) * p, lo = Math.floor(j); return a[lo] + (a[Math.min(lo + 1, a.length - 1)] - a[lo]) * (j - lo); }

function logGamma(z: number): number {
  const c = [676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.984369578019572e-6, 1.5056327351493116e-7];
  if (z < .5) return Math.log(Math.PI) - Math.log(Math.sin(Math.PI * z)) - logGamma(1 - z);
  z--; let x = .99999999999980993; c.forEach((v, i) => x += v / (z + i + 1)); const t = z + 7.5; return .5 * Math.log(2 * Math.PI) + (z + .5) * Math.log(t) - t + Math.log(x);
}
function betaFraction(a: number, b: number, x: number) {
  const tiny = 1e-30; let c = 1, d = 1 - (a + b) * x / (a + 1); if (Math.abs(d) < tiny) d = tiny; d = 1 / d; let h = d;
  for (let m = 1; m < 250; m++) { const m2 = 2 * m; let aa = m * (b - m) * x / ((a + m2 - 1) * (a + m2)); d = 1 + aa * d; if (Math.abs(d) < tiny) d = tiny; c = 1 + aa / c; if (Math.abs(c) < tiny) c = tiny; d = 1 / d; h *= d * c; aa = -(a + m) * (a + b + m) * x / ((a + m2) * (a + m2 + 1)); d = 1 + aa * d; if (Math.abs(d) < tiny) d = tiny; c = 1 + aa / c; if (Math.abs(c) < tiny) c = tiny; d = 1 / d; const delta = d * c; h *= delta; if (Math.abs(delta - 1) < 1e-13) break; } return h;
}
function regularBeta(x: number, a: number, b: number): number { if (x <= 0) return 0; if (x >= 1) return 1; const bt = Math.exp(logGamma(a + b) - logGamma(a) - logGamma(b) + a * Math.log(x) + b * Math.log1p(-x)); return x < (a + 1) / (a + b + 2) ? bt * betaFraction(a, b, x) / a : 1 - bt * betaFraction(b, a, 1 - x) / b; }
export function tCritical95(df: number) { if (df < 1) return 0; let lo = 0, hi = 1000; for (let i = 0; i < 80; i++) { const mid = (lo + hi) / 2, p = 1 - .5 * regularBeta(df / (df + mid * mid), df / 2, .5); if (p < .975) lo = mid; else hi = mid; } return (lo + hi) / 2; }
export function errorSize(values: number[], kind: 'sd' | 'sem' | 'ci95' | 'none') { if (kind === 'none' || values.length < 2) return 0; const sd = deviation(values); return kind === 'sd' ? sd : sd / Math.sqrt(values.length) * (kind === 'ci95' ? tCritical95(values.length - 1) : 1); }

export interface SwarmPoint { id: string; x: number; y: number; radius: number; crowded: boolean }
/** Deterministic beeswarm: candidate tangent positions are accepted only without overlaps. */
export function swarmLayout(observations: Observation[], center: number, yScale: (v: number) => number, radius: (id: string) => number, maxWidth = 120): SwarmPoint[] {
  const placed: SwarmPoint[] = [];
  [...observations].sort((a, b) => a.value - b.value || a.id.localeCompare(b.id)).forEach(observation => {
    const y = yScale(observation.value), r = radius(observation.id), candidates = [center];
    placed.forEach(p => { const gap = r + p.radius + 1.4, dy = y - p.y; if (Math.abs(dy) < gap) { const dx = Math.sqrt(gap ** 2 - dy ** 2); candidates.push(p.x - dx, p.x + dx); } });
    candidates.sort((a, b) => Math.abs(a - center) - Math.abs(b - center) || a - b);
    const free = (x: number) => placed.every(p => Math.hypot(x - p.x, y - p.y) >= r + p.radius + 1.39);
    const inside = candidates.find(x => Math.abs(x - center) + r <= maxWidth / 2 && free(x));
    // When the allotted group width is exhausted, expand rather than hide observations.
    const x = inside ?? candidates.find(free) ?? center;
    placed.push({id: observation.id, x, y, radius: r, crowded: inside === undefined});
  }); return placed;
}
export interface BracketLayout { comparison: Comparison; x1: number; x2: number; level: number; y: number; labelX: number }
export function bracketLevels(comparisons: Comparison[], xFor: (id: string) => number | undefined) {
  const levels: {a: number; b: number}[][] = [];
  return comparisons.map(c => ({comparison: c, x1: xFor(c.groupA), x2: xFor(c.groupB)})).filter((b): b is {comparison: Comparison; x1: number; x2: number} => b.x1 !== undefined && b.x2 !== undefined).sort((a, b) => Math.abs(a.x2 - a.x1) - Math.abs(b.x2 - b.x1)).map(b => {
    const a = Math.min(b.x1, b.x2), end = Math.max(b.x1, b.x2); let level = 0;
    while (levels[level]?.some(used => a <= used.b + 12 && end >= used.a - 12)) level++;
    (levels[level] ??= []).push({a, b: end}); return {...b, x1: a, x2: end, level};
  });
}
export function placeBrackets(comparisons: Comparison[], xFor: (id: string) => number | undefined, dataTop: number, positions: Record<string, AnnotationPosition> = {}, spacing = 29): BracketLayout[] {
  return bracketLevels(comparisons, xFor).map(b => { const p = positions[b.comparison.id] ?? {dx: 0, dy: 0}; return {...b, y: dataTop - 23 - b.level * spacing + p.dy, labelX: (b.x1 + b.x2) / 2 + p.dx}; });
}
export function significanceLabel(p: number) { return p < .0001 ? '****' : p < .001 ? '***' : p < .01 ? '**' : p < .05 ? '*' : 'ns'; }
export function densityEstimate(values: number[], domain: [number, number], count = 70) {
  if (!values.length) return []; const sd = deviation(values), range = domain[1] - domain[0]; const bandwidth = Math.max(1.06 * (sd || range / 12 || 1) * values.length ** -.2, range / 200, 1e-8);
  return Array.from({length: count}, (_, i) => { const x = domain[0] + range * i / (count - 1); const density = values.reduce((sum, value) => sum + Math.exp(-.5 * ((x - value) / bandwidth) ** 2), 0) / (values.length * bandwidth * Math.sqrt(2 * Math.PI)); return {x, density}; });
}

/** Subject identities, rather than row indexes, align measurements when subjects exist. */
export function heatmapRows(groups: import('./types').Group[]) {
  const hasSubjects = groups.some(g => g.observations.some(o => !!o.subject));
  const duplicateSubjects = new Set<string>();
  groups.forEach(g => {const seen = new Set<string>(); g.observations.forEach(o => {if (o.subject) {if (seen.has(o.subject)) duplicateSubjects.add(o.subject); seen.add(o.subject);}});});
  const rows: {id: string; label: string}[] = [], byObservation: Record<string, number> = {};
  const index = new Map<string, number>();
  groups.forEach(g => g.observations.forEach((o, i) => {
    const id = hasSubjects ? (o.subject && !duplicateSubjects.has(o.subject) ? `subject:${o.subject}` : `unpaired:${g.id}:${o.id}`) : `row:${i}`;
    if (!index.has(id)) {index.set(id, rows.length); rows.push({id, label: hasSubjects ? (o.subject ? (duplicateSubjects.has(o.subject) ? `${o.subject} · ${o.id}` : o.subject) : `Sem par · ${o.id}`) : `${i + 1}`});}
    byObservation[o.id] = index.get(id)!;
  }));
  return {rows, byObservation};
}
export function positiveLogDomain(values: number[]): [number, number] {
  const positive = values.filter(v => Number.isFinite(v) && v > 0);
  if (!positive.length) return [1, 10];
  const min = Math.max(Number.MIN_VALUE, Math.min(...positive) / 1.35), dataMax = Math.max(...positive);
  const max = Math.min(Number.MAX_VALUE, Math.max(dataMax * 1.3, min * 1.35));
  return [min, max > min ? max : Math.min(Number.MAX_VALUE, min * 10)];
}
export function annotationMetrics(levels: number, plotHeight: number, markerRadius: number, baseFont: number) {
  const spacing = Math.min(29, Math.max(14, (plotHeight - Math.max(110, markerRadius * 2 + 65)) / Math.max(1, levels + 1)));
  const fontSize = Math.max(8, Math.min(baseFont, spacing - 7));
  const clearance = levels ? Math.min(plotHeight - 45, markerRadius + 23 + (levels - 1) * spacing + fontSize + 13) : markerRadius + 10;
  return {spacing, fontSize, clearance};
}
/** Expand only an automatic upper limit to reserve a known number of SVG pixels. */
export function expandUpperDomain(min: number, max: number, dataHigh: number, plotHeight: number, clearance: number, logarithmic: boolean) {
  const fraction = plotHeight / Math.max(30, plotHeight - clearance);
  const expanded = logarithmic ? Math.exp(Math.min(Math.log(Number.MAX_VALUE), Math.log(min) + (Math.log(Math.max(dataHigh, min)) - Math.log(min)) * fraction)) : min + (dataHigh - min) * fraction;
  return Number.isFinite(expanded) ? Math.max(max, expanded) : max;
}
