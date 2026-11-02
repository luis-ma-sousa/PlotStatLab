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
    xLabel: '', yLabel: 'Relative expression (a.u.)', style: clone(defaultStyle),
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

const storageKey = 'prismatica.project.v1';
let loadWarning = '';
export function getLoadWarning(): string { return loadWarning; }

/** Remove visual overrides whose data objects were deleted, retaining historical results. */
export function reconcileProject(project: Project): Project {
  const pointIds = new Set(project.groups.flatMap(group => group.observations.map(point => point.id)));
  const groupIds = new Set(project.groups.map(group => group.id));
  return { ...project, charts: project.charts.map(chart => {
    const comparisonIds = new Set((chart.analysis?.comparisons ?? [])
      .filter(comparison => groupIds.has(comparison.groupA) && groupIds.has(comparison.groupB))
      .map(comparison => comparison.id));
    return { ...chart,
      pointStyles: Object.fromEntries(Object.entries(chart.pointStyles).filter(([pointId]) => pointIds.has(pointId))),
      annotationPositions: Object.fromEntries(Object.entries(chart.annotationPositions).filter(([comparisonId]) => comparisonIds.has(comparisonId))),
    };
  }) };
}

export function loadProject(): Project {
  loadWarning = '';
  const saved = localStorage.getItem(storageKey);
  if (!saved) return createProject();
  try { return parseProject(saved); }
  catch (error) {
    const backupKey = `${storageKey}.recovery.${Date.now()}.${id()}`;
    try { localStorage.setItem(backupKey, saved); }
    catch {
      // Do not permit autosave to overwrite the only remaining copy of the user's data.
      throw new Error('Não foi possível abrir o projeto guardado nem criar uma cópia de recuperação. Os dados originais foram preservados. Liberta espaço no browser antes de continuar.');
    }
    loadWarning = `O projeto guardado não pôde ser aberto. Foi preservada uma cópia integral em «${backupKey}» no armazenamento local do browser. Foi aberto um projeto de exemplo. ${error instanceof Error ? error.message : ''}`;
    return createProject();
  }
}
export function saveProject(project: Project): void { localStorage.setItem(storageKey, serializeProject(project)); }
export function serializeProject(project: Project): string { return JSON.stringify(reconcileProject(project), null, 2); }

function fail(message: string): never { throw new Error(`Projeto inválido: ${message}`); }
function object(value: unknown, path: string): Record<string,unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${path} deve ser um objeto.`);
  return value as Record<string,unknown>;
}
function string(value: unknown, path: string, nonempty=false): string {
  if (typeof value !== 'string' || value.length > 100000 || (nonempty && !value.trim())) fail(`${path} deve conter texto válido.`);
  return value;
}
function number(value: unknown, path: string, min=-Infinity, max=Infinity): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) fail(`${path} deve ser um número entre ${min} e ${max}.`);
  return value;
}
function boolean(value: unknown,path:string):boolean {if(typeof value!=='boolean') fail(`${path} deve ser booleano.`);return value;}
function array(value:unknown,path:string):unknown[] {if(!Array.isArray(value))fail(`${path} deve ser uma lista.`);return value;}
function choice<T extends string>(value:unknown,choices:readonly T[],path:string):T {if(typeof value!=='string'||!choices.includes(value as T))fail(`${path} não é suportado.`);return value as T;}
const shapes = ['circle','square','diamond','triangle'] as const;
const chartTypes = ['bar-swarm','bar','swarm','box','violin','raincloud','paired','line','scatter','histogram','density','ecdf','heatmap'] as const;
function validateStyle(value:unknown,path:string):void {
  const s=object(value,path);
  const palette=array(s.palette,`${path}.palette`); if(!palette.length)fail('a paleta não pode estar vazia.'); palette.forEach((c,i)=>string(c,`${path}.palette[${i}]`,true));
  ['fontFamily','background','axisColor'].forEach(k=>string(s[k],`${path}.${k}`,true));
  ['fontSize','titleSize','pointSize','lineWidth'].forEach(k=>number(s[k],`${path}.${k}`,.1,100));
  number(s.width,`${path}.width`,200,12000);number(s.height,`${path}.height`,200,12000);
  ['pointOpacity','barOpacity'].forEach(k=>number(s[k],`${path}.${k}`,0,1));number(s.barWidth,`${path}.barWidth`,.01,1);
  choice(s.pointShape,shapes,`${path}.pointShape`);choice(s.error,['sd','sem','ci95','none'],`${path}.error`);choice(s.yScale,['linear','log'],`${path}.yScale`);
  boolean(s.grid,`${path}.grid`);boolean(s.legend,`${path}.legend`);
  if(s.yMin!==null)number(s.yMin,`${path}.yMin`);if(s.yMax!==null)number(s.yMax,`${path}.yMax`);
  if(s.yMin!==null&&s.yMax!==null&&(s.yMin as number)>=(s.yMax as number))fail('o mínimo do eixo Y deve ser inferior ao máximo.');
  if(s.yScale==='log'&&((s.yMin!==null&&(s.yMin as number)<=0)||(s.yMax!==null&&(s.yMax as number)<=0)))fail('os limites de um eixo logarítmico devem ser positivos.');
}
function validateConfig(value:unknown,path:string):void {
  const c=object(value,path);string(c.test,`${path}.test`,true);choice(c.design,['independent','paired'],`${path}.design`);
  choice(c.comparisons,['control','all'],`${path}.comparisons`);choice(c.correction,['holm','bonferroni','bh','none'],`${path}.correction`);
  string(c.control,`${path}.control`);number(c.alpha,`${path}.alpha`,.000001,.5);
}
function validateAnalysis(value:unknown,path:string):void {
  const a=object(value,path);['test','testLabel','engine','fingerprint','createdAt'].forEach(k=>string(a[k],`${path}.${k}`,true));
  if(a.statistic!==null)number(a.statistic,`${path}.statistic`);if(a.p!==null)number(a.p,`${path}.p`,0,1);
  validateConfig(a.config,`${path}.config`);array(a.warnings,`${path}.warnings`).forEach((w,i)=>string(w,`${path}.warnings[${i}]`));
  array(a.summaries,`${path}.summaries`).forEach((value,i)=>{const s=object(value,`${path}.summaries[${i}]`);string(s.group,'summary.group',true);number(s.n,'summary.n',0);number(s.mean,'summary.mean');number(s.sd,'summary.sd',0);number(s.sem,'summary.sem',0);if(s.ci95!==undefined)validateInterval(s.ci95,'summary.ci95');});
  const ids=new Set<string>();array(a.comparisons,`${path}.comparisons`).forEach((value,i)=>{const c=object(value,`${path}.comparisons[${i}]`);const cid=string(c.id,'comparison.id',true);if(ids.has(cid))fail('comparação duplicada.');ids.add(cid);['groupA','groupB','label'].forEach(k=>string(c[k],`comparison.${k}`));number(c.p,'comparison.p',0,1);number(c.adjustedP,'comparison.adjustedP',0,1);if(c.statistic!==undefined)number(c.statistic,'comparison.statistic');if(c.effect!==undefined)number(c.effect,'comparison.effect');if(c.ci!==undefined)validateInterval(c.ci,'comparison.ci');});
}
function validateInterval(value:unknown,path:string):void {const a=array(value,path);if(a.length!==2)fail(`${path} deve conter dois limites.`);number(a[0],path);number(a[1],path);if((a[0] as number)>(a[1] as number))fail(`${path}: limites invertidos.`);}

export function parseProject(text: string): Project {
  let parsed:unknown;try {parsed=JSON.parse(text);}catch{fail('o ficheiro não contém JSON válido.');}
  const p=object(parsed,'projeto');if(p.schemaVersion!==1)fail('esta versão do formato não é suportada.');
  ['id','name','activeChartId','updatedAt'].forEach(k=>string(p[k],k,true));
  const groups=array(p.groups,'groups');if(!groups.length)fail('é necessário pelo menos um grupo.');
  const groupIds=new Set<string>(), pointIds=new Set<string>();
  groups.forEach((value,i)=>{const g=object(value,`groups[${i}]`);const gid=string(g.id,'group.id',true);if(groupIds.has(gid))fail('identificadores de grupo duplicados.');groupIds.add(gid);string(g.name,'group.name',true);array(g.observations,'group.observations').forEach((value,j)=>{const o=object(value,`observation[${j}]`);const oid=string(o.id,'observation.id',true);if(pointIds.has(oid))fail('identificadores de ponto duplicados.');pointIds.add(oid);number(o.value,'observation.value');if(o.x!==undefined)number(o.x,'observation.x');if(o.subject!==undefined)string(o.subject,'observation.subject',true);});});
  const charts=array(p.charts,'charts');if(!charts.length)fail('é necessário pelo menos um gráfico.');const chartIds=new Set<string>();
  charts.forEach((value,i)=>{const c=object(value,`charts[${i}]`);const cid=string(c.id,'chart.id',true);if(chartIds.has(cid))fail('identificadores de gráfico duplicados.');chartIds.add(cid);['name','title','xLabel','yLabel'].forEach(k=>string(c[k],`chart.${k}`));choice(c.type,chartTypes,'chart.type');validateStyle(c.style,'chart.style');
    const styles=object(c.pointStyles,'chart.pointStyles');Object.entries(styles).forEach(([key,value])=>{if(!pointIds.has(key))fail(`o estilo refere um ponto inexistente: ${key}.`);const s=object(value,'pointStyle');['color','stroke'].forEach(k=>{if(s[k]!==undefined)string(s[k],`pointStyle.${k}`,true);});if(s.size!==undefined)number(s.size,'pointStyle.size',.1,100);if(s.strokeWidth!==undefined)number(s.strokeWidth,'pointStyle.strokeWidth',0,20);if(s.opacity!==undefined)number(s.opacity,'pointStyle.opacity',0,1);if(s.shape!==undefined)choice(s.shape,shapes,'pointStyle.shape');});
    Object.values(object(c.annotationPositions,'chart.annotationPositions')).forEach(value=>{const a=object(value,'annotationPosition');number(a.dx,'annotation.dx');number(a.dy,'annotation.dy');});
    boolean(c.showSignificance,'chart.showSignificance');boolean(c.showNs,'chart.showNs');choice(c.significanceDisplay,['stars','p'],'chart.significanceDisplay');if(c.analysis!==undefined)validateAnalysis(c.analysis,'chart.analysis');
  });
  if(!chartIds.has(p.activeChartId as string))fail('o gráfico ativo não existe.');validateConfig(p.analysisConfig,'analysisConfig');
  const presetIds=new Set<string>();array(p.presets,'presets').forEach((value,i)=>{const s=object(value,`presets[${i}]`);const sid=string(s.id,'preset.id',true);if(presetIds.has(sid))fail('presets duplicados.');presetIds.add(sid);string(s.name,'preset.name',true);validateStyle(s.style,'preset.style');});
  return parsed as Project;
}

export function parseCsv(text:string):Group[] {
  const parsed=Papa.parse<string[]>(text.replace(/^\uFEFF/,''),{skipEmptyLines:false});
  if(parsed.errors.some(e=>e.code!=='UndetectableDelimiter'))throw new Error(`CSV inválido: ${parsed.errors[0].message}`);
  const rows=parsed.data;if(rows.length<2)throw new Error('O CSV precisa de um cabeçalho e de pelo menos uma linha de dados.');
  const header=rows[0].map(h=>h.trim());if(header.some(h=>!h))throw new Error('Todas as colunas do CSV precisam de um nome.');if(new Set(header.map(h=>h.toLowerCase())).size!==header.length)throw new Error('Os nomes das colunas do CSV devem ser únicos.');
  const subjectIndex=header.findIndex(h=>/^(subject|subject id|id|sujeito|indivíduo|individuo|participante)$/i.test(h));
  const xIndex=header.findIndex(h=>/^x$/i.test(h));
  const indices=header.map((_,i)=>i).filter(i=>i!==subjectIndex&&i!==xIndex);
  if(!indices.length)throw new Error('O CSV não contém colunas de valores.');
  const groups=indices.map(i=>({id:`csv-group-${i}`,name:header[i],observations:[]} as Group));
  const toNumber=(raw:string,row:number,column:number)=>{const cleaned=raw.trim().replace(/\s/g,'');if(!/^[+-]?(?:\d+(?:[.,]\d*)?|[.,]\d+)(?:[eE][+-]?\d+)?$/.test(cleaned))throw new Error(`Valor inválido na linha ${row}, coluna «${header[column]}»: ${raw}`);const value=Number(cleaned.replace(',','.'));if(!Number.isFinite(value))throw new Error(`Valor não finito na linha ${row}, coluna «${header[column]}».`);return value;};
  rows.slice(1).forEach((row,i)=>{const rowNumber=i+2;if(row.every(c=>!c.trim()))return;if(row.length>header.length)throw new Error(`A linha ${rowNumber} contém mais colunas do que o cabeçalho.`);
    const subject=subjectIndex>=0?(row[subjectIndex]??'').trim():`row-${i+1}`;
    const xRaw=xIndex>=0?(row[xIndex]??'').trim():'';const x=xRaw?toNumber(xRaw,rowNumber,xIndex):undefined;
    indices.forEach((column,j)=>{const raw=(row[column]??'').trim();if(!raw)return;if(subjectIndex>=0&&!subject)throw new Error(`Falta o identificador do sujeito na linha ${rowNumber}.`);if(xIndex>=0&&x===undefined)throw new Error(`Falta o valor X na linha ${rowNumber}.`);groups[j].observations.push({id:`csv-point-${column}-${i+1}`,value:toNumber(raw,rowNumber,column),subject,...(x!==undefined?{x}:{})});});
  });
  if(groups.some(g=>!g.observations.length))throw new Error('Cada coluna de valores deve conter pelo menos um número.');
  if(subjectIndex>=0&&groups.some(g=>new Set(g.observations.map(o=>o.subject)).size!==g.observations.length))throw new Error('Existem identificadores de sujeito duplicados na mesma coluna.');
  return groups;
}

export function dataFingerprint(groups:Group[],config:AnalysisConfig):string {
  const canonical=JSON.stringify({groups:groups.map(g=>({id:g.id,observations:g.observations.map(o=>({id:o.id,value:o.value,subject:o.subject??null,x:o.x??null}))})),config:{test:config.test,design:config.design,comparisons:config.comparisons,correction:config.correction,control:config.control,alpha:config.alpha}});
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
