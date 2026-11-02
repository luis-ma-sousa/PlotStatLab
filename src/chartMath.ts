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
/** Deterministic exact beeswarm, using forbidden-interval unions instead of repeated all-pairs searches. */
export function swarmLayout(observations: Observation[], center: number, yScale: (v: number) => number, radius: (id: string) => number, maxWidth = 120): SwarmPoint[] {
  const placed: SwarmPoint[] = [];
  const radii = new Map(observations.map(observation => [observation.id, Math.max(1, radius(observation.id))]));
  const largestRadius = [...radii.values()].reduce((largest, value) => Math.max(largest, value), 1), cellSize = largestRadius*2+1.4;
  const verticalBuckets = new Map<number, SwarmPoint[]>();
  for (const observation of [...observations].sort((a,b) => a.value-b.value || a.id.localeCompare(b.id))) {
    const y = yScale(observation.value), r = radii.get(observation.id)!, bucketIndex = Math.floor(y/cellSize);
    const intervals: {left:number;right:number}[] = [];
    // More distant vertical cells cannot collide, even with the largest point override.
    for (let bucket = bucketIndex-1; bucket <= bucketIndex+1; bucket++) for (const point of verticalBuckets.get(bucket) ?? []) {
      const gap = r+point.radius+1.4, dy = y-point.y;
      if (Math.abs(dy) >= gap) continue;
      const dx = Math.sqrt(Math.max(0,gap*gap-dy*dy));
      intervals.push({left:point.x-dx,right:point.x+dx});
    }
    intervals.sort((a,b) => a.left-b.left);
    let x = center, low = -Infinity, high = -Infinity;
    for (const interval of [...intervals, {left:Infinity,right:Infinity}]) {
      if (interval.left < high) {high = Math.max(high,interval.right); continue;}
      if (center > low && center < high) {x = center-low <= high-center ? low : high; break;}
      low = interval.left; high = interval.right;
    }
    const point = {id:observation.id,x,y,radius:r,crowded:Math.abs(x-center)+r>maxWidth/2};
    placed.push(point);
    // Ordered cells make the interval sort linear for dense, similarly sized swarms.
    const bucket = verticalBuckets.get(bucketIndex) ?? [];
    let lo = 0, hi = bucket.length;
    while (lo < hi) {const middle = (lo+hi)>>>1; if (bucket[middle].x < x) lo = middle+1; else hi = middle;}
    bucket.splice(lo,0,point); verticalBuckets.set(bucketIndex,bucket);
  }
  return placed;
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
    if (!index.has(id)) {index.set(id, rows.length); rows.push({id, label: hasSubjects ? (o.subject ? (duplicateSubjects.has(o.subject) ? `${o.subject} · ${o.id}` : o.subject) : `Unpaired · ${o.id}`) : `${i + 1}`});}
    byObservation[o.id] = index.get(id)!;
  }));
  return {rows, byObservation};
}
export function positiveLogDomain(values: number[]): [number, number] {
  const positive = values.filter(v => Number.isFinite(v) && v > 0);
  if (!positive.length) return [1, 10];
  const min = Math.max(Number.MIN_VALUE, positive.reduce((a,b)=>Math.min(a,b),Infinity) / 1.35), dataMax = positive.reduce((a,b)=>Math.max(a,b),-Infinity);
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
