import type {AdvancedRow,AdvancedResult,AdvancedChartOptions} from './advancedTypes';
import type {PublicationSettings} from './publication';
export type ChartType = 'bar-swarm' | 'bar' | 'swarm' | 'box' | 'violin' | 'raincloud' | 'paired' | 'line' | 'scatter' | 'histogram' | 'density' | 'ecdf' | 'heatmap' | 'grouped' | 'regression' | 'dose-response' | 'kaplan-meier' | 'forest' | 'bland-altman' | 'volcano';
export type Shape = 'circle' | 'square' | 'diamond' | 'triangle';
export interface Observation { id: string; value: number; x?: number; subject?: string; excluded?: boolean }
export interface Group { id: string; name: string; observations: Observation[] }
export interface PointStyle { color?: string; size?: number; shape?: Shape; stroke?: string; strokeWidth?: number; opacity?: number }
export interface ChartStyle { palette: string[]; fontFamily: string; fontSize: number; titleSize: number; pointSize: number; pointShape: Shape; pointOpacity: number; barOpacity: number; barWidth: number; lineWidth: number; error: 'sd' | 'sem' | 'ci95' | 'none'; grid: boolean; legend: boolean; background: string; axisColor: string; yMin: number | null; yMax: number | null; yScale: 'linear' | 'log'; width: number; height: number }
export interface Comparison { id: string; groupA: string; groupB: string; p: number; adjustedP: number; label: string; statistic?: number; effect?: number; ci?: [number, number] }
export interface AnnotationPosition { dx: number; dy: number }
export interface AnalysisConfig { test: string; design: 'independent' | 'paired'; comparisons: 'control' | 'all'; correction: 'holm' | 'bonferroni' | 'bh' | 'none'; control: string; alpha: number }
export interface AnalysisResult { test: string; testLabel: string; engine: string; statistic: number | null; p: number | null; comparisons: Comparison[]; summaries: {group: string; n: number; mean: number; sd: number; sem: number; ci95?: [number,number]}[]; warnings: string[]; fingerprint: string; config: AnalysisConfig; createdAt: string }
export interface Suggestion { id: string; label: string; reason: string; recommended: boolean; compatible: boolean }
export interface Chart { advancedResultId?:string; advancedOptions?:AdvancedChartOptions; datasetId?:string; id: string; name: string; type: ChartType; title: string; xLabel: string; yLabel: string; style: ChartStyle; pointStyles: Record<string, PointStyle>; annotationPositions: Record<string, AnnotationPosition>; showSignificance: boolean; showNs: boolean; significanceDisplay: 'stars' | 'p'; analysis?: AnalysisResult }
export interface StylePreset { id: string; name: string; style: ChartStyle }
export interface Project { publication?:PublicationSettings; datasets?:Dataset[];activeDatasetId?:string;analysisRuns?:AnalysisRun[];workspaceLayout?:WorkspaceLayout;schemaVersion: 1; outlierAnalysis?: OutlierResult; id: string; name: string; groups: Group[]; charts: Chart[]; activeChartId: string; presets: StylePreset[]; analysisConfig: AnalysisConfig; updatedAt: string }
export type Selection = {kind:'point'; id:string; groupId:string} | {kind:'group'; id:string} | {kind:'annotation'; id:string} | {kind:'title' | 'xaxis' | 'yaxis' | 'chart'};
export interface OutlierResult {method:'rout'|'grubbs';methodLabel:string;engine:string;fingerprint:string;createdAt:string;parameters:{alpha:number;q:number};groups:{groupId:string;n:number;flaggedIds:string[];[key:string]:unknown}[];warnings:string[];reference:string}
export interface Dataset {advancedRows?:AdvancedRow[];advancedAnalyses?:{id:string;result:AdvancedResult}[];id:string;name:string;groups:Group[];analysisConfig:AnalysisConfig;outlierAnalysis?:OutlierResult}
export interface AnalysisRun {id:string;datasetId:string;name:string;result:AnalysisResult}
export interface WorkspaceLayout {advancedAnalysisIds?:string[];chartIds:string[];analysisIds:string[]}
