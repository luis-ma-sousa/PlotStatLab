import {validPublication} from './publication';
import {validAdvancedRows,validAdvancedResult,validAdvancedOptions} from './validateAdvanced';
import Papa from 'papaparse';
import type { AnalysisConfig, AnalysisResult, Chart, ChartStyle, ChartType, Group, PointStyle, Project } from './types';

export const defaultStyle: ChartStyle = {
  palette: ['#769e96', '#bac9c5', '#ce9c70', '#596f9b', '#bb8292', '#a4a56b'],
  fontFamily: 'Arial', fontSize: 15, titleSize: 22, pointSize: 5,
  pointShape: 'circle', pointOpacity: .9, barOpacity: .55, barWidth: .58,
  lineWidth: 1.5, error: 'sem', grid: false, legend: false, background: '#ffffff',
  axisColor: '#293e3a', yMin: null, yMax: null, yScale: 'linear', width: 800, height: 560,
};
const clone = <T,>(value:T):T => structuredClone(value);
const id = () => crypto.randomUUID();

export function createChart(type: ChartType = 'bar-swarm'): Chart {
  return { id: id(), name: 'Treatment response', type, title: 'Treatment response',
    xLabel: '', yLabel: ['grouped','regression','dose-response','kaplan-meier','forest','bland-altman','volcano'].includes(type)?'':'Relative expression (a.u.)', style: clone(defaultStyle),
    pointStyles: {}, annotationPositions: {}, showSignificance: true, showNs: false, significanceDisplay: 'stars' };
}

export function createProject(): Project {
  const data = [
    ['Control', [28, 34, 29, 31, 26, 35, 32, 30, 27, 33, 29, 31]],
    ['Vehicle', [31, 35, 29, 33, 28, 36, 34, 31, 30, 34, 32, 33]],
    ['Low dose', [43, 51, 46, 48, 41, 54, 50, 47, 44, 52, 49, 45]],
    ['High dose', [61, 69, 63, 67, 58, 72, 66, 64, 60, 70, 65, 62]],
  ] as const;
  const groups: Group[] = data.map(([name, values], i) => ({ id: `group-${i+1}`, name,
    observations: values.map((value,j) => ({ id: `point-${i+1}-${j+1}`, value, subject: `S${String(j+1).padStart(2,'0')}`, x:j+1 })) }));
  const chart = createChart(); const second = createChart('box'); second.name = 'Distribution'; second.title = 'Response distribution';
  return {schemaVersion:1, id:id(), name:'Treatment study', groups, charts:[chart, second], activeChartId:chart.id,
    presets:[], analysisConfig:{test:'welch-anova',design:'independent',comparisons:'control',correction:'holm',control:groups[0].id,alpha:.05}, updatedAt:new Date().toISOString()};
}

const storageKey = 'plotstatlab.project.v1';
const legacyStorageKey = 'prismatica.project.v1';
let loadWarning = '';
export function getLoadWarning(): string { return loadWarning; }

/** Remove visual overrides whose data objects were deleted, retaining historical results. */
export function reconcileProject(project: Project): Project {
  return { ...project, publication:project.publication?{...project.publication,chartIds:project.publication.chartIds.filter(id=>project.charts.some(c=>c.id===id))}:undefined, charts: project.charts.map(chart => {
    const dataset=project.datasets?.find(d=>d.id===chart.datasetId);
    const groups=dataset?.groups??project.groups;
    const pointIds=new Set(groups.flatMap(group=>group.observations.map(point=>point.id)));
    const groupIds=new Set(groups.map(group=>group.id));
    const selected=chart.groupIds?[...new Set(chart.groupIds)].filter(id=>groupIds.has(id)):undefined;
    const run=chart.analysisRunId?project.analysisRuns?.find(run=>run.id===chart.analysisRunId&&run.datasetId===chart.datasetId):undefined;
    const comparisonIds = new Set((chart.analysis?.comparisons ?? [])
      .filter(comparison => groupIds.has(comparison.groupA) && groupIds.has(comparison.groupB))
      .map(comparison => comparison.id));
    return { ...chart,
      ...(chart.groupIds?{groupIds:selected?.length?selected:undefined}:{}),
      ...(chart.analysisRunId?{analysisRunId:run&&chart.analysis&&sameValue(run.result,chart.analysis)?run.id:undefined}:{}),
      pointStyles: Object.fromEntries(Object.entries(chart.pointStyles).filter(([pointId]) => pointIds.has(pointId))),
      annotationPositions: Object.fromEntries(Object.entries(chart.annotationPositions).filter(([comparisonId]) => comparisonIds.has(comparisonId))),
    };
  }) };
}

/** Imported JSON key order is immaterial when a figure references a stored result. */
function sameValue(a:unknown,b:unknown):boolean {
  if(a===b)return true;
  if(Array.isArray(a)||Array.isArray(b))return Array.isArray(a)&&Array.isArray(b)&&a.length===b.length&&a.every((value,i)=>sameValue(value,b[i]));
  if(a&&b&&typeof a==='object'&&typeof b==='object'){
    const left=Object.entries(a).filter(([,value])=>value!==undefined),right=Object.entries(b).filter(([,value])=>value!==undefined);
    return left.length===right.length&&left.every(([key,value])=>Object.hasOwn(b,key)&&sameValue(value,(b as Record<string,unknown>)[key]));
  }
  return false;
}

export function loadProject(): Project {
  loadWarning = '';
  const saved = localStorage.getItem(storageKey) ?? localStorage.getItem(legacyStorageKey);
  if (!saved) return createProject();
  try { return parseProject(saved); }
  catch (error) {
    const backupKey = `${storageKey}.recovery.${Date.now()}.${id()}`;
    try { localStorage.setItem(backupKey, saved); }
    catch {
      // Do not permit autosave to overwrite the only remaining copy of the user's data.
      throw new Error('The saved project could not be opened or backed up. Original data were preserved. Free browser storage before continuing.');
    }
    loadWarning = `The saved project could not be opened. A complete recovery copy was preserved at “${backupKey}” in browser storage. A sample project was opened. ${error instanceof Error ? error.message : ''}`;
    return createProject();
  }
}
export function saveProject(project: Project): void { localStorage.setItem(storageKey, serializeProject(project)); }
export function serializeProject(project: Project): string { return JSON.stringify(reconcileProject(project), null, 2); }

function fail(message: string): never { throw new Error(`Invalid project: ${message}`); }
function object(value: unknown, path: string): Record<string,unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${path} must be an object.`);
  return value as Record<string,unknown>;
}
function string(value: unknown, path: string, nonempty=false): string {
  if (typeof value !== 'string' || value.length > 100000 || (nonempty && !value.trim())) fail(`${path} must contain valid text.`);
  return value;
}
function number(value: unknown, path: string, min=-Infinity, max=Infinity): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) fail(`${path} must be a number between ${min} and ${max}.`);
  return value;
}
function boolean(value: unknown,path:string):boolean {if(typeof value!=='boolean') fail(`${path} must be a boolean.`);return value;}
function array(value:unknown,path:string):unknown[] {if(!Array.isArray(value))fail(`${path} must be an array.`);return value;}
function choice<T extends string>(value:unknown,choices:readonly T[],path:string):T {if(typeof value!=='string'||!choices.includes(value as T))fail(`${path} is not supported.`);return value as T;}
const shapes = ['circle','square','diamond','triangle'] as const;
const chartTypes = ['bar-swarm','bar','swarm','box','violin','raincloud','paired','line','scatter','histogram','density','ecdf','heatmap','grouped','regression','dose-response','kaplan-meier','forest','bland-altman','volcano'] as const;
function solidColor(value:unknown,path:string):void {const color=string(value,path,true);if(!/^(?:#[a-f0-9]{3}|#[a-f0-9]{4}|#[a-f0-9]{6}|#[a-f0-9]{8}|[a-z]+|(?:rgb|rgba|hsl|hsla)\([\d\s.,%+/-]+\))$/i.test(color))fail(`${path} must be a solid color, without external references.`);}
function validateStyle(value:unknown,path:string):void {
  const s=object(value,path);
  const palette=array(s.palette,`${path}.palette`); if(!palette.length)fail('the palette cannot be empty.'); palette.forEach((c,i)=>solidColor(c,`${path}.palette[${i}]`));
  string(s.fontFamily,`${path}.fontFamily`,true);['background','axisColor'].forEach(k=>solidColor(s[k],`${path}.${k}`));
  ['fontSize','titleSize','pointSize','lineWidth'].forEach(k=>number(s[k],`${path}.${k}`,.1,100));
  number(s.width,`${path}.width`,200,12000);number(s.height,`${path}.height`,200,12000);
  ['pointOpacity','barOpacity'].forEach(k=>number(s[k],`${path}.${k}`,0,1));number(s.barWidth,`${path}.barWidth`,.01,1);
  choice(s.pointShape,shapes,`${path}.pointShape`);choice(s.error,['sd','sem','ci95','none'],`${path}.error`);choice(s.yScale,['linear','log'],`${path}.yScale`);
  boolean(s.grid,`${path}.grid`);boolean(s.legend,`${path}.legend`);
  if(s.yMin!==null)number(s.yMin,`${path}.yMin`);if(s.yMax!==null)number(s.yMax,`${path}.yMax`);
  if(s.yMin!==null&&s.yMax!==null&&(s.yMin as number)>=(s.yMax as number))fail('the Y minimum must be lower than the maximum.');
  if(s.yScale==='log'&&((s.yMin!==null&&(s.yMin as number)<=0)||(s.yMax!==null&&(s.yMax as number)<=0)))fail('logarithmic axis limits must be positive.');
}
function validateConfig(value:unknown,path:string):void {
  const c=object(value,path);string(c.test,`${path}.test`,true);choice(c.design,['independent','paired'],`${path}.design`);
  choice(c.comparisons,['control','all'],`${path}.comparisons`);choice(c.correction,['holm','bonferroni','bh','none'],`${path}.correction`);
  string(c.control,`${path}.control`);number(c.alpha,`${path}.alpha`,.000001,.5);
  if(c.groupIds!==undefined){const ids=array(c.groupIds,`${path}.groupIds`);ids.forEach(value=>string(value,`${path}.groupIds`,true));if(new Set(ids).size!==ids.length)fail('duplicate selected columns.');}
}
function validateAnalysis(value:unknown,path:string):void {
  const a=object(value,path);['test','testLabel','engine','fingerprint','createdAt'].forEach(k=>string(a[k],`${path}.${k}`,true));
  if(a.statistic!==null)number(a.statistic,`${path}.statistic`);if(a.p!==null)number(a.p,`${path}.p`,0,1);
  validateConfig(a.config,`${path}.config`);array(a.warnings,`${path}.warnings`).forEach((w,i)=>string(w,`${path}.warnings[${i}]`));
  array(a.summaries,`${path}.summaries`).forEach((value,i)=>{const s=object(value,`${path}.summaries[${i}]`);string(s.group,'summary.group',true);number(s.n,'summary.n',0);number(s.mean,'summary.mean');number(s.sd,'summary.sd',0);number(s.sem,'summary.sem',0);if(s.ci95!==undefined)validateInterval(s.ci95,'summary.ci95');});
  const ids=new Set<string>();array(a.comparisons,`${path}.comparisons`).forEach((value,i)=>{const c=object(value,`${path}.comparisons[${i}]`);const cid=string(c.id,'comparison.id',true);if(ids.has(cid))fail('duplicate comparison.');ids.add(cid);['groupA','groupB','label'].forEach(k=>string(c[k],`comparison.${k}`));number(c.p,'comparison.p',0,1);number(c.adjustedP,'comparison.adjustedP',0,1);if(c.statistic!==undefined)number(c.statistic,'comparison.statistic');if(c.effect!==undefined)number(c.effect,'comparison.effect');if(c.ci!==undefined)validateInterval(c.ci,'comparison.ci');});
}
function validateInterval(value:unknown,path:string):void {const a=array(value,path);if(a.length!==2)fail(`${path} must contain two bounds.`);number(a[0],path);number(a[1],path);if((a[0] as number)>(a[1] as number))fail(`${path}: reversed bounds.`);}

export function parseProject(text: string): Project {
  let parsed:unknown;try {parsed=JSON.parse(text);}catch{fail('the file does not contain valid JSON.');}
  const p=object(parsed,'project');if(p.schemaVersion!==1)fail('this format version is not supported.');
  ['id','name','activeChartId','updatedAt'].forEach(k=>string(p[k],k,true));
  const groups=array(p.groups,'groups');if(!groups.length)fail('at least one group is required.');
  const groupIds=new Set<string>(), pointIds=new Set<string>();
  groups.forEach((value,i)=>{const g=object(value,`groups[${i}]`);const gid=string(g.id,'group.id',true);if(groupIds.has(gid))fail('duplicate group identifiers.');groupIds.add(gid);string(g.name,'group.name',true);array(g.observations,'group.observations').forEach((value,j)=>{const o=object(value,`observation[${j}]`);const oid=string(o.id,'observation.id',true);if(pointIds.has(oid))fail('duplicate point identifiers.');pointIds.add(oid);number(o.value,'observation.value');if(o.x!==undefined)number(o.x,'observation.x');if(o.subject!==undefined)string(o.subject,'observation.subject',true);if(o.excluded!==undefined)boolean(o.excluded,'observation.excluded');if(o.labels!==undefined)Object.entries(object(o.labels,'observation.labels')).forEach(([key,value])=>{string(key,'label name',true);string(value,'label value')});});});
  const charts=array(p.charts,'charts');if(!charts.length)fail('at least one chart is required.');const chartIds=new Set<string>();
  charts.forEach((value,i)=>{const c=object(value,`charts[${i}]`);const cid=string(c.id,'chart.id',true);if(chartIds.has(cid))fail('duplicate chart identifiers.');chartIds.add(cid);['name','title','xLabel','yLabel'].forEach(k=>string(c[k],`chart.${k}`));choice(c.type,chartTypes,'chart.type');validateStyle(c.style,'chart.style');
    if(c.groupIds!==undefined){const selected=array(c.groupIds,'chart.groupIds');if(!selected.length)fail('a chart must show at least one column.');selected.forEach(value=>string(value,'chart.groupIds',true));if(new Set(selected).size!==selected.length)fail('duplicate chart columns.');if(p.datasets===undefined&&selected.some(id=>!groupIds.has(id as string)))fail('chart refers to a missing column in its dataset.');}
    if(c.analysisRunId!==undefined)string(c.analysisRunId,'chart.analysisRunId',true);
    const styles=object(c.pointStyles,'chart.pointStyles');Object.entries(styles).forEach(([key,value])=>{if(!pointIds.has(key)&&!(Array.isArray(p.datasets)&&p.datasets.some(value=>{const d=object(value,'dataset');return Array.isArray(d.groups)&&d.groups.some(value=>{const g=object(value,'dataset.group');return Array.isArray(g.observations)&&g.observations.some(value=>object(value,'dataset.observation').id===key)})})))fail(`style refers to a missing point: ${key}.`);const s=object(value,'pointStyle');['color','stroke'].forEach(k=>{if(s[k]!==undefined)solidColor(s[k],`pointStyle.${k}`);});if(s.size!==undefined)number(s.size,'pointStyle.size',.1,100);if(s.strokeWidth!==undefined)number(s.strokeWidth,'pointStyle.strokeWidth',0,20);if(s.opacity!==undefined)number(s.opacity,'pointStyle.opacity',0,1);if(s.shape!==undefined)choice(s.shape,shapes,'pointStyle.shape');});
    Object.values(object(c.annotationPositions,'chart.annotationPositions')).forEach(value=>{const a=object(value,'annotationPosition');number(a.dx,'annotation.dx');number(a.dy,'annotation.dy');});
    boolean(c.showSignificance,'chart.showSignificance');boolean(c.showNs,'chart.showNs');choice(c.significanceDisplay,['stars','p'],'chart.significanceDisplay');if(c.analysis!==undefined)validateAnalysis(c.analysis,'chart.analysis');if(c.advancedOptions!==undefined&&!validAdvancedOptions(c.advancedOptions))fail('invalid advanced chart options.');if(c.advancedResultId!==undefined)string(c.advancedResultId,'chart.advancedResultId',true);
  });
  if(!chartIds.has(p.activeChartId as string))fail('the active chart does not exist.');validateConfig(p.analysisConfig,'analysisConfig');
  const presetIds=new Set<string>();array(p.presets,'presets').forEach((value,i)=>{const s=object(value,`presets[${i}]`);const sid=string(s.id,'preset.id',true);if(presetIds.has(sid))fail('duplicate presets.');presetIds.add(sid);string(s.name,'preset.name',true);validateStyle(s.style,'preset.style');});
  if(p.outlierAnalysis!==undefined){const result=object(p.outlierAnalysis,'outlierAnalysis');choice(result.method,['rout','grubbs'],'outlier.method');['methodLabel','engine','fingerprint','createdAt','reference'].forEach(k=>string(result[k],`outlier.${k}`));const parameters=object(result.parameters,'outlier.parameters');number(parameters.alpha,'outlier.alpha',0,1);number(parameters.q,'outlier.q',0,1);array(result.warnings,'outlier.warnings').forEach(w=>string(w,'outlier.warning'));array(result.groups,'outlier.groups').forEach(value=>{const g=object(value,'outlier.group');string(g.groupId,'outlier.groupId');number(g.n,'outlier.n',0);array(g.flaggedIds,'outlier.flaggedIds').forEach(v=>string(v,'outlier.pointId'))});}
  if(p.datasets!==undefined){const datasets=array(p.datasets,'datasets');if(!datasets.length)fail('a workspace needs at least one dataset.');const ids=new Set<string>();const allPoints=new Set<string>();datasets.forEach(value=>{const d=object(value,'dataset');const id=string(d.id,'dataset.id',true);if(ids.has(id))fail('duplicate dataset ID.');ids.add(id);string(d.name,'dataset.name',true);const datasetGroups=array(d.groups,'dataset.groups');for(const group of datasetGroups){const g=object(group,'dataset.group');for(const observation of array(g.observations,'dataset.observations')){const o=object(observation,'dataset.observation');const oid=string(o.id,'dataset.observation.id');if(allPoints.has(oid))fail('point IDs must be unique across datasets.');allPoints.add(oid);}}if(d.advancedRows!==undefined&&!validAdvancedRows(d.advancedRows,new Set(datasetGroups.flatMap(value=>array(object(value,'group').observations,'observations').map(value=>string(object(value,'observation').id,'point.id'))))))fail('invalid advanced observations or point references.');const advancedIds=new Set<string>();if(d.advancedAnalyses!==undefined)array(d.advancedAnalyses,'advancedAnalyses').forEach(value=>{const r=object(value,'advancedAnalysis');const rid=string(r.id,'advancedAnalysis.id',true);if(advancedIds.has(rid)||!validAdvancedResult(r.result))fail('invalid advanced analysis.');advancedIds.add(rid);});const datasetCharts=(p.charts as unknown[]).filter(value=>object(value,'chart').datasetId===id);const fallback:Record<string,unknown>={...(p.charts as Record<string,unknown>[])[0],pointStyles:{},annotationPositions:{},analysis:undefined,analysisRunId:undefined,groupIds:undefined};parseProject(JSON.stringify({...p,datasets:undefined,activeDatasetId:undefined,analysisRuns:undefined,workspaceLayout:undefined,publication:undefined,groups:datasetGroups,analysisConfig:d.analysisConfig,outlierAnalysis:d.outlierAnalysis,charts:datasetCharts.length?datasetCharts.map(value=>({...object(value,'chart'),analysisRunId:undefined})):[fallback],activeChartId:datasetCharts.length?object(datasetCharts[0],'chart').id:fallback.id}));});if(!ids.has(p.activeDatasetId as string))fail('the active dataset does not exist.');for(const value of p.charts as unknown[]){const c=object(value,'chart');if(!ids.has(c.datasetId as string))fail('the chart dataset does not exist.');}
    const runIds=new Set<string>();array(p.analysisRuns??[],'analysisRuns').forEach(value=>{const r=object(value,'analysisRun');const id=string(r.id,'analysisRun.id',true);if(runIds.has(id))fail('duplicate analysis ID.');runIds.add(id);if(!ids.has(r.datasetId as string))fail('the analysis dataset does not exist.');string(r.name,'analysisRun.name');validateAnalysis(r.result,'analysisRun.result');});if(p.workspaceLayout!==undefined){const layout=object(p.workspaceLayout,'workspaceLayout');for(const value of array(layout.chartIds,'layout.chartIds'))if(!chartIds.has(value as string))fail('layout refers to an unknown figure.');for(const value of array(layout.analysisIds,'layout.analysisIds'))if(!runIds.has(value as string))fail('layout refers to an unknown analysis.');}}
  if(p.publication!==undefined&&!validPublication(p.publication,[...chartIds]))fail('invalid publication layout.');
  if(Array.isArray(p.datasets)){const advancedRuns=p.datasets.flatMap(value=>{const d=object(value,'dataset');return Array.isArray(d.advancedAnalyses)?d.advancedAnalyses.map(value=>string(object(value,'advancedAnalysis').id,'analysis.id')):[]});if(new Set(advancedRuns).size!==advancedRuns.length)fail('advanced analysis IDs must be unique.');for(const value of p.charts as unknown[]){const c=object(value,'chart');if(c.advancedResultId!==undefined){const d=object(p.datasets.find(value=>object(value,'dataset').id===c.datasetId),'dataset');if(!Array.isArray(d.advancedAnalyses)||!d.advancedAnalyses.some(value=>object(value,'analysis').id===c.advancedResultId))fail('chart refers to a missing advanced result.');}}if(p.workspaceLayout!==undefined){const layout=object(p.workspaceLayout,'workspaceLayout');if(layout.advancedAnalysisIds!==undefined)array(layout.advancedAnalysisIds,'advancedAnalysisIds').forEach(value=>{if(!advancedRuns.includes(value as string))fail('layout refers to a missing advanced analysis.');});}}
  for(const value of charts){const chart=object(value,'chart');if(chart.analysisRunId===undefined)continue;
    const run=Array.isArray(p.analysisRuns)?p.analysisRuns.find(value=>object(value,'analysisRun').id===chart.analysisRunId):undefined;
    if(!run)fail('chart refers to a missing saved analysis.');const saved=object(run,'analysisRun');
    if(saved.datasetId!==chart.datasetId||!Array.isArray(p.datasets))fail('the saved analysis belongs to a different dataset than its chart.');
    if(chart.analysis===undefined||!sameValue(saved.result,chart.analysis))fail('chart analysis does not match its saved analysis result.');
  }
  return parsed as Project;
}

/** Labels such as “Mouse 12” are never coerced into measurements. */
export function tableNumber(raw:string):number|undefined {
  const value=raw.trim().replace(/[\u00a0\u202f ]/g,'');
  if(!/^[+-]?(?:\d+(?:[.,]\d*)?|[.,]\d+)(?:[eE][+-]?\d+)?$/.test(value))return undefined;
  const numeric=Number(value.replace(',','.'));return Number.isFinite(numeric)?numeric:undefined;
}
const missingCell=(raw:string)=>/^(?:|na|n\/a|nan|null|missing)$/i.test(raw.trim());
const subjectHeader=/^(?:subject(?:[ _]?id)?|id|sujeito|indivíduo|individuo|participante)$/i;
const labelHeader=/^(?:label|labels|name|(?:sample|mouse|animal|patient|donor)(?:[ _]?(?:id|name|code))?|row[ _]?(?:label|title)|description|notes?|sex|gender|replicate)$/i;

export function parseCsv(text:string):Group[] {
  const parsed=Papa.parse<string[]>(text.replace(/^\uFEFF/,''),{skipEmptyLines:false,delimiter:text.includes('\t')?'\t':text.split(/\r?\n/,1)[0].includes(';')?';':undefined});
  if(parsed.errors.some(e=>e.code!=='UndetectableDelimiter'))throw new Error(`Invalid CSV: ${parsed.errors[0].message}`);
  const rows=parsed.data;if(rows.length<2)throw new Error('Use a header row and at least one data row. To paste values without headers, paste directly into a data cell.');
  if(rows.length>100001||rows.some(row=>row.length>512)||rows.reduce((count,row)=>count+row.length,0)>1000000)throw new Error('Import a smaller table (up to 100,000 data rows, 512 columns and 1,000,000 cells).');
  const header=rows[0].map((h,i)=>h.trim()||(i===0?'Row label':`Column ${i+1}`));if(new Set(header.map(h=>h.toLowerCase())).size!==header.length)throw new Error('CSV column names must be unique.');
  for(const [index,row] of rows.slice(1).entries())if(row.length>header.length)throw new Error(`Row ${index+2} contains more columns than the header.`);
  const subjectIndex=header.findIndex(h=>subjectHeader.test(h));
  const xIndex=header.findIndex(h=>/^x$/i.test(h));
  const labels=header.map((_,i)=>i).filter(i=>i!==subjectIndex&&i!==xIndex&&(labelHeader.test(header[i])||rows.slice(1).some(row=>!missingCell(row[i]??''))&&rows.slice(1).every(row=>missingCell(row[i]??'')||tableNumber(row[i]??'')===undefined)));
  const indices=header.map((_,i)=>i).filter(i=>i!==subjectIndex&&i!==xIndex&&!labels.includes(i));
  if(!indices.length)throw new Error('No numeric measurement columns were found. Text columns become row labels; add at least one column containing numbers.');
  const groups=indices.map(i=>({id:`csv-group-${i}`,name:header[i],observations:[]} as Group));
  const toNumber=(raw:string,row:number,column:number)=>{const value=tableNumber(raw);if(value===undefined)throw new Error(`Invalid value on row ${row}, column “${header[column]}”: “${raw}”. This column mixes numbers and text. Move labels to a separate Label column, or leave missing measurements blank.`);return value;};
  const rowLabels=new Set<string>();
  rows.slice(1).forEach((row,i)=>{const rowNumber=i+2;if(row.every(c=>!c.trim()))return;if(row.length>header.length)throw new Error(`Row ${rowNumber} contains more columns than the header.`);
    const labelValues=Object.fromEntries(labels.map(column=>[header[column],(row[column]??'').trim()]));
    const label=Object.values(labelValues).filter(Boolean).join(' · ');
    let subject=subjectIndex>=0?(row[subjectIndex]??'').trim():label||`row-${i+1}`;
    if(subjectIndex<0&&rowLabels.has(subject)){subject=`${subject} [row ${i+1}]`;while(rowLabels.has(subject))subject+=' ·';}
    rowLabels.add(subject);
    const xRaw=xIndex>=0?(row[xIndex]??'').trim():'';const x=xRaw?toNumber(xRaw,rowNumber,xIndex):undefined;
    indices.forEach((column,j)=>{const raw=(row[column]??'').trim();if(missingCell(raw))return;if(subjectIndex>=0&&!subject)throw new Error(`Missing subject ID on row ${rowNumber}.`);if(xIndex>=0&&x===undefined)throw new Error(`Missing X value on row ${rowNumber}.`);groups[j].observations.push({id:`csv-point-${column}-${i+1}`,value:toNumber(raw,rowNumber,column),subject,...(labels.length?{labels:labelValues}:{}),...(x!==undefined?{x}:{})});});
  });
  if(groups.some(g=>!g.observations.length))throw new Error('Invalid value column: every measurement column needs at least one number. Blank, NA and N/A cells represent missing measurements.');
  if(subjectIndex>=0&&groups.some(g=>new Set(g.observations.map(o=>o.subject)).size!==g.observations.length))throw new Error('Duplicate subject IDs in the same column.');
  return groups;
}

/** JSON records, named column arrays, or {groups:[{name, observations|values}]}. */
export function parseDataTable(text:string):Group[] {
  if(!/^[\s\uFEFF]*[\[{]/.test(text))return parseCsv(text);
  let data:unknown;try{data=JSON.parse(text.replace(/^\uFEFF/,''))}catch{throw new Error('This JSON file is not valid. Use an array of records or named arrays of numbers.');}
  const makeGroups=(items:unknown[]):Group[]=>items.map((item,i)=>{
    if(!item||typeof item!=='object')throw new Error('Each JSON group needs a name and values or observations.');
    const group=item as Record<string,unknown>,values=group.observations??group.values;
    if(!Array.isArray(values))throw new Error('Each JSON group needs a values or observations array.');
    const observations=values.flatMap((entry,j)=>{
      if(entry===null||entry==='')return [];
      const object=entry!==null&&typeof entry==='object'?entry as Record<string,unknown>:undefined;
      const raw=object?.value??entry,value=typeof raw==='number'?raw:typeof raw==='string'?tableNumber(raw):undefined;
      if(value===undefined||!Number.isFinite(value))throw new Error(`Invalid numeric value in JSON group ${i+1}, row ${j+1}.`);
      const subject=object?.subject??object?.label??`row-${j+1}`;
      if(typeof subject!=='string'&&typeof subject!=='number')throw new Error('JSON row labels must be text or numbers.');
      const x=object?.x;if(x!==undefined&&(typeof x!=='number'||!Number.isFinite(x)))throw new Error('JSON X coordinates must be finite numbers.');
      return [{id:`json-point-${i}-${j}`,value,subject:String(subject),...(typeof x==='number'?{x}:{}),...(object?.excluded===true?{excluded:true}:{}),...(object?.labels&&typeof object.labels==='object'&&!Array.isArray(object.labels)?{labels:Object.fromEntries(Object.entries(object.labels).map(([key,value])=>[key,String(value)]))}:{})}];
    });
    return {id:`json-group-${i}`,name:typeof group.name==='string'&&group.name.trim()?group.name:`Group ${i+1}`,observations};
  });
  let groups:Group[];
  if(data&&typeof data==='object'&&!Array.isArray(data)&&Array.isArray((data as Record<string,unknown>).groups))groups=makeGroups((data as {groups:unknown[]}).groups);
  else if(Array.isArray(data)&&data.every(item=>item&&typeof item==='object'&&('values' in item||'observations' in item)))groups=makeGroups(data);
  else if(Array.isArray(data)&&data.every(item=>item&&typeof item==='object'&&!Array.isArray(item))){const header=[...new Set(data.flatMap(item=>Object.keys(item)))];groups=parseCsv(Papa.unparse([header,...data.map(item=>header.map(key=>(item as Record<string,unknown>)[key]??''))]));}
  else if(data&&typeof data==='object'&&!Array.isArray(data)&&Object.values(data).every(Array.isArray))groups=makeGroups(Object.entries(data).map(([name,values])=>({name,values})));
  else throw new Error('Use JSON records, named arrays of numbers, or an object with a groups array.');
  if(!groups.length||!groups.some(g=>g.observations.length))throw new Error('The JSON file contains no numeric observations.');
  return groups;
}

export function dataFingerprint(groups:Group[],config:AnalysisConfig):string {
  const selected=config.groupIds?new Set(config.groupIds):undefined;
  const canonical=JSON.stringify({groups:groups.filter(g=>!selected||selected.has(g.id)).map(g=>({id:g.id,observations:g.observations.map(o=>({id:o.id,value:o.value,subject:o.subject??null,x:o.x??null,...(o.excluded?{excluded:true}:{})}))})),config:{test:config.test,design:config.design,comparisons:config.comparisons,correction:config.correction,control:config.control,alpha:config.alpha,...(config.groupIds?{groupIds:[...config.groupIds].sort()}:{})}});
  let hash=14695981039346656037n;for(let i=0;i<canonical.length;i++){hash^=BigInt(canonical.charCodeAt(i));hash=BigInt.asUintN(64,hash*1099511628211n);}return hash.toString(16).padStart(16,'0');
}

export type StyleScope='all'|'colors'|'typography'|'axes'|'points';
export function applyStyle(targetChart:Chart,sourceChart:Chart,scope:StyleScope='all'):Chart {
  if(scope==='all')return {...targetChart,style:clone(sourceChart.style)};
  const keys:Record<Exclude<StyleScope,'all'>,(keyof ChartStyle)[]>={colors:['palette','background','axisColor','barOpacity'],typography:['fontFamily','fontSize','titleSize'],axes:['yMin','yMax','yScale','grid','lineWidth'],points:['pointSize','pointShape','pointOpacity']};
  const additions=Object.fromEntries(keys[scope].map(key=>[key,clone(sourceChart.style[key])]));return {...targetChart,style:{...targetChart.style,...additions}};
}

export function exportDownload(filename:string,content:string|Blob,mime='application/octet-stream'):void {
  const blob=content instanceof Blob?content:new Blob([content],{type:mime});const url=URL.createObjectURL(blob);const anchor=document.createElement('a');anchor.href=url;anchor.download=filename;document.body.append(anchor);anchor.click();anchor.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
}

export function outlierFingerprint(groups:Group[]):string {return dataFingerprint(groups,{test:'outliers',design:'independent',comparisons:'all',correction:'none',control:'',alpha:.05});}
