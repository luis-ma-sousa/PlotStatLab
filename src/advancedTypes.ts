/** Explicit column meanings for the advanced data table; y is never inferred from a heading. */
export interface AdvancedRow {
  id: string;
  y: number;
  x?: number;
  groupId?: string;
  group?: string;
  factorA?: string;
  factorB?: string;
  subject?: string;
  event?: boolean;
  lower?: number;
  upper?: number;
  p?: number;
  label?: string;
  labels?: Record<string,string>;
  excluded?: boolean;
}
export type AdvancedChartType = 'grouped' | 'regression' | 'dose-response' | 'kaplan-meier' | 'forest' | 'bland-altman' | 'volcano';
export const advancedChartTypes = new Set<string>(['grouped', 'regression', 'dose-response', 'kaplan-meier', 'forest', 'bland-altman', 'volcano']);
export interface AdvancedChartOptions {
  xScale?: 'linear' | 'log';
  xMin?: number | null;
  xMax?: number | null;
  pThreshold?: number;
  foldChangeThreshold?: number;
  forestReference?: number;
  showConfidence?: boolean;
}
export interface AdvancedSeriesPoint {
  id?: string;
  x: number;
  y: number;
  lower?: number;
  upper?: number;
  nRisk?: number;
  events?: number;
}
export interface AdvancedSeries {
  name: string;
  group?: string;
  kind: 'fit' | 'residuals' | 'survival' | 'censors' | 'agreement';
  points: AdvancedSeriesPoint[];
}
export interface AdvancedResult {
  method: string;
  methodLabel: string;
  engine: string;
  fingerprint: string;
  createdAt: string;
  parameters: Record<string, unknown>;
  tables: {title: string; columns: string[]; rows: (string | number | null)[][]}[];
  estimates: Record<string, number | string | null>;
  series?: AdvancedSeries[];
  warnings: string[];
  reference: string;
}
