import {mean, errorSize} from './chartMath';
import type {AdvancedRow, AdvancedSeriesPoint} from './advancedTypes';

export function paddedDomain(values: number[], includeZero = false, fraction = .08): [number, number] {
  const finite = values.filter(Number.isFinite);
  if (!finite.length) return [0, 1];
  let low = finite.reduce((a, b) => Math.min(a, b), Infinity), high = finite.reduce((a, b) => Math.max(a, b), -Infinity);
  if (includeZero) {low = Math.min(0, low); high = Math.max(0, high);}
  const span = high - low || Math.max(Math.abs(high), 1);
  return [low - span * fraction, high + span * fraction];
}
export function volcanoCoordinates(row: AdvancedRow): {x: number; y: number} | undefined {
  const p = row.p ?? row.y;
  if (!Number.isFinite(row.x) || !Number.isFinite(p) || p <= 0 || p > 1) return;
  return {x: row.x!, y: Math.max(0, -Math.log10(p))};
}
/** y - x is stated explicitly in the interface and exported axis label. */
export function agreementCoordinates(row: AdvancedRow): {x: number; y: number} | undefined {
  if (!Number.isFinite(row.x) || !Number.isFinite(row.y)) return;
  return {x: (row.x! + row.y) / 2, y: row.y - row.x!};
}
export function agreementSummary(rows: AdvancedRow[]): {bias: number; lower: number; upper: number} | undefined {
  const differences = rows.filter(row => !row.excluded).map(agreementCoordinates).filter((p): p is {x: number; y: number} => !!p).map(p => p.y);
  if (differences.length < 2) return;
  const bias = mean(differences), sd = errorSize(differences, 'sd');
  return {bias, lower: bias - 1.96 * sd, upper: bias + 1.96 * sd};
}
export interface SurvivalStep extends AdvancedSeriesPoint {nRisk: number; events: number; censors: string[]}
/** Product-limit estimate: event ties are processed before censoring at that time. */
export function kaplanMeier(rows: AdvancedRow[]): SurvivalStep[] {
  const eligible = rows.filter(row => !row.excluded && Number.isFinite(row.y) && row.y >= 0 && typeof row.event === 'boolean').sort((a,b) => a.y-b.y);
  let atRisk = eligible.length, survival = 1;
  const steps: SurvivalStep[] = [{x: 0, y: 1, nRisk: atRisk, events: 0, censors: []}];
  for (let index = 0; index < eligible.length;) {
    const time = eligible[index].y, tied: AdvancedRow[] = [];
    while (index < eligible.length && eligible[index].y === time) tied.push(eligible[index++]);
    const events = tied.filter(row => row.event).length;
    survival *= 1 - events / atRisk;
    steps.push({x: time, y: survival, nRisk: atRisk, events, censors: tied.filter(row => !row.event).map(row => row.id)});
    atRisk -= tied.length;
  }
  return steps;
}
export function survivalAt(steps: Pick<AdvancedSeriesPoint, 'x' | 'y'>[], time: number): number {
  let probability = 1;
  for (const step of steps) {if (step.x > time) break; probability = step.y;}
  return probability;
}
export function stepPath(points: Pick<AdvancedSeriesPoint, 'x' | 'y'>[], x: (n: number) => number, y: (n: number) => number): string {
  if (!points.length) return '';
  return `M${x(points[0].x)},${y(points[0].y)}` + points.slice(1).map(point => `H${x(point.x)}V${y(point.y)}`).join('');
}
export function forestInterval(row: AdvancedRow): {estimate: number; lower: number; upper: number} | undefined {
  if (!Number.isFinite(row.y) || !Number.isFinite(row.lower) || !Number.isFinite(row.upper) || row.lower! > row.y || row.upper! < row.y) return;
  return {estimate: row.y, lower: row.lower!, upper: row.upper!};
}
