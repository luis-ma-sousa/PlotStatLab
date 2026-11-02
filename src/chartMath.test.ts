import {describe, expect, it} from 'vitest';
import {bracketLevels, densityEstimate, errorSize, placeBrackets, significanceLabel, swarmLayout, tCritical95} from './chartMath';
import type {Comparison, Observation} from './types';

describe('scientific summaries', () => {
  it('uses Student t confidence intervals for small samples', () => {
    expect(tCritical95(1)).toBeCloseTo(12.706204736, 7);
    expect(tCritical95(9)).toBeCloseTo(2.262157163, 7);
    expect(errorSize([1, 2, 3], 'ci95')).toBeCloseTo(2.484137712, 7);
    expect(errorSize([1], 'ci95')).toBe(0);
  });
  it('maps exact p thresholds consistently', () => {
    expect(significanceLabel(.05)).toBe('ns'); expect(significanceLabel(.01)).toBe('*');
    expect(significanceLabel(.001)).toBe('**'); expect(significanceLabel(.0001)).toBe('***'); expect(significanceLabel(.000099)).toBe('****');
  });
});
describe('beeswarm', () => {
  const observations: Observation[] = Array.from({length: 18}, (_, i) => ({id: `observation-${i}`, value: Math.floor(i / 3)}));
  it('keeps differently sized markers separate without changing values', () => {
    const original = structuredClone(observations), radius = (id: string) => id.endsWith('2') ? 8 : 4;
    const result = swarmLayout(observations, 80, value => value * 8, radius, 110);
    for (const p of result) {
      expect(p.y).toBe(observations.find(o => o.id === p.id)!.value * 8);
      for (const other of result.filter(q => q.id !== p.id)) expect(Math.hypot(p.x - other.x, p.y - other.y)).toBeGreaterThanOrEqual(p.radius + other.radius + 1.38);
    }
    expect(observations).toEqual(original);
    expect(swarmLayout([...observations].reverse(), 80, value => value * 8, radius, 110)).toEqual(result);
  });
  it('preserves all observations even in a dense group', () => {
    const result = swarmLayout(Array.from({length: 30}, (_, i) => ({id: `${i}`, value: 1})), 0, v => v, () => 5, 40);
    expect(result).toHaveLength(30); expect(result.some(p => p.crowded)).toBe(true);
    const sorted = result.map(p => p.x).sort((a, b) => a - b); for (let i = 1; i < sorted.length; i++) expect(sorted[i] - sorted[i - 1]).toBeGreaterThan(11.3);
  });
});
describe('statistical annotations', () => {
  const compare = (id: string, groupA: string, groupB: string): Comparison => ({id, groupA, groupB, p: .001, adjustedP: .002, label: '**'});
  const xFor = (id: string) => ({a: 100, b: 200, c: 300, d: 400})[id];
  it('stacks crossing comparisons and keeps brackets above every data point', () => {
    const comparisons = [compare('ab', 'a', 'b'), compare('cd', 'c', 'd'), compare('ac', 'a', 'c'), compare('ad', 'a', 'd')];
    const b = placeBrackets(comparisons, xFor, 190);
    expect(b.find(q => q.comparison.id === 'ab')!.level).toBe(0);
    expect(b.find(q => q.comparison.id === 'cd')!.level).toBe(0);
    expect(b.find(q => q.comparison.id === 'ad')!.level).toBe(2);
    for (const p of b) expect(p.y + 6).toBeLessThan(190);
    expect(bracketLevels([compare('missing', 'a', 'z')], xFor)).toEqual([]);
  });
  it('preserves group anchors during manual label movement', () => {
    const c = [compare('ab', 'a', 'b')], auto = placeBrackets(c, xFor, 190)[0], manual = placeBrackets(c, xFor, 190, {ab: {dx: 37, dy: -12}})[0];
    expect(manual.x1).toBe(auto.x1); expect(manual.x2).toBe(auto.x2);
    expect(manual.labelX - auto.labelX).toBe(37); expect(manual.y - auto.y).toBe(-12);
  });
});
it('produces a finite normalized kernel density for constant data', () => {
  const data = densityEstimate([2, 2, 2], [0, 4], 200);
  expect(data.every(d => Number.isFinite(d.density) && d.density >= 0)).toBe(true);
  const area = data.slice(1).reduce((sum, d, i) => sum + (d.density + data[i].density) / 2 * (d.x - data[i].x), 0);
  expect(area).toBeCloseTo(1, 3);
});

describe('automatic upper limits', () => {
  it('reserves enough pixels for eight bracket layers and a large marker', async () => {
    const {annotationMetrics, expandUpperDomain} = await import('./chartMath');
    const height = 450, markerRadius = 22, layout = annotationMetrics(8, height, markerRadius, 18);
    const maxY = expandUpperDomain(0, 110, 100, height, layout.clearance, false);
    const pointTop = height - 100 / maxY * height - markerRadius;
    const topLabel = pointTop - 23 - 7 * layout.spacing - layout.fontSize;
    expect(topLabel).toBeGreaterThanOrEqual(12.9);
    expect(layout.spacing).toBeGreaterThan(layout.fontSize + 6);
  });
  it('keeps an empty or all-negative logarithmic domain finite and positive', async () => {
    const {positiveLogDomain} = await import('./chartMath');
    expect(positiveLogDomain([])).toEqual([1, 10]);
    expect(positiveLogDomain([-5, 0, -1])).toEqual([1, 10]);
    expect(positiveLogDomain([2, 8])).toEqual([2 / 1.35, 10.4]);
  });
});
describe('heatmap subject alignment', () => {
  it('keeps missing subject rows empty instead of shifting the next value', async () => {
    const {heatmapRows} = await import('./chartMath');
    const layout = heatmapRows([{id: 'a', name: 'A', observations: [{id: 'a1', subject: 'S1', value: 1}, {id: 'a2', subject: 'S2', value: 2}, {id: 'a3', subject: 'S3', value: 3}]}, {id: 'b', name: 'B', observations: [{id: 'b3', subject: 'S3', value: 30}, {id: 'b1', subject: 'S1', value: 10}]}]);
    expect(layout.rows.map(r => r.label)).toEqual(['S1', 'S2', 'S3']);
    expect(layout.byObservation.b3).toBe(layout.byObservation.a3); expect(layout.byObservation.b1).toBe(layout.byObservation.a1);
  });
  it('never overlays or arbitrarily pairs duplicated subject observations', async () => {
    const {heatmapRows} = await import('./chartMath');
    const layout = heatmapRows([{id: 'a', name: 'A', observations: [{id: 'a1', subject: 'S1', value: 1}, {id: 'a2', subject: 'S1', value: 2}]}, {id: 'b', name: 'B', observations: [{id: 'b1', subject: 'S1', value: 10}]}]);
    expect(new Set(Object.values(layout.byObservation)).size).toBe(3); expect(layout.rows).toHaveLength(3);
  });
});
