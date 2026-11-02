import type {AnalysisRun,Chart,Dataset,Group,Project} from './types';
const uuid=()=>crypto.randomUUID();
const labels:Record<string,string>={welch:'Welch t-test',student:'Student t-test','paired-t':'Paired t-test','mann-whitney':'Mann–Whitney U',wilcoxon:'Paired Wilcoxon',anova:'One-way ANOVA + Student t-tests','anova-tukey':'One-way ANOVA + Tukey HSD','welch-anova':'Welch ANOVA + Welch t-tests',kruskal:'Kruskal–Wallis + Mann–Whitney',friedman:'Friedman + paired Wilcoxon'};
function presentResult(result:NonNullable<Chart['analysis']>){if(!/Teste|emparelhado|de Welch|de um fator/.test(result.testLabel))return result;return {...result,testLabel:labels[result.test]??result.testLabel,warnings:result.warnings.map(w=>w==='Os intervalos das diferenças são individuais; os p-values ajustados aplicam a correção à família de comparações selecionada.'?'Difference intervals are individual; adjusted p-values apply the correction to the selected comparison family.':w)}}
export function activeDataset(project:Project):Dataset {
 return project.datasets?.find(d=>d.id===project.activeDatasetId)??{id:`${project.id}-dataset-1`,name:'Dataset 1',groups:project.groups,analysisConfig:project.analysisConfig,outlierAnalysis:project.outlierAnalysis};
}
/** Legacy projects become one dataset; measurements, analyses and object identities are retained. */
export function normalizeWorkspace(project:Project):Project {
 const dataset=activeDataset(project),datasets=project.datasets?.length?project.datasets:[dataset];
 const charts=project.charts.map(chart=>({...chart,datasetId:chart.datasetId??dataset.id,analysis:chart.analysis?presentResult(chart.analysis):undefined}));
 const analysisRuns=project.analysisRuns?.map(r=>{const result=presentResult(r.result);return {...r,name:r.name.replace(r.result.testLabel,result.testLabel),result}})??charts.filter(c=>c.analysis).map(c=>({id:`analysis-${c.id}`,datasetId:c.datasetId!,name:`${datasets.find(d=>d.id===c.datasetId)?.name??dataset.name} · ${c.analysis!.testLabel}`,result:c.analysis!}));
 return {...project,datasets,activeDatasetId:dataset.id,groups:dataset.groups,analysisConfig:dataset.analysisConfig,outlierAnalysis:dataset.outlierAnalysis,charts,analysisRuns,workspaceLayout:project.workspaceLayout??{chartIds:charts.map(c=>c.id),analysisIds:analysisRuns.map(r=>r.id)}};
}
export function datasetForChart(project:Project,chart:Chart):Dataset {
 return project.datasets?.find(d=>d.id===chart.datasetId)??activeDataset(project);
}
export function activateDataset(project:Project,datasetId:string):Project {
 const p=normalizeWorkspace(project),dataset=p.datasets!.find(d=>d.id===datasetId);
 if(!dataset)return p;
 const chart=p.charts.find(c=>c.datasetId===datasetId);
 return {...p,activeDatasetId:dataset.id,groups:dataset.groups,analysisConfig:dataset.analysisConfig,outlierAnalysis:dataset.outlierAnalysis,activeChartId:chart?.id??p.activeChartId};
}
export function activateChart(project:Project,chartId:string):Project {
 const chart=project.charts.find(c=>c.id===chartId);if(!chart)return project;
 return {...activateDataset(project,chart.datasetId??activeDataset(project).id),activeChartId:chart.id};
}
/** Synchronize edits only with the active dataset; preserve results from every other dataset. */
export function syncWorkspace(previous:Project,next:Project):Project {
 const p=normalizeWorkspace(next),activeId=p.activeDatasetId;
 const sameDataset=(previous.activeDatasetId??activeDataset(previous).id)===activeId;
 if(sameDataset){p.datasets=p.datasets!.map(d=>d.id===activeId?{...d,groups:next.groups,analysisConfig:next.analysisConfig,outlierAnalysis:next.outlierAnalysis}:d);p.groups=next.groups;p.analysisConfig=next.analysisConfig;p.outlierAnalysis=next.outlierAnalysis;}
 p.charts=p.charts.map(c=>({...c,datasetId:c.datasetId??activeId}));
 const runs=[...(p.analysisRuns??[])];
 for(const chart of p.charts){const before=previous.charts.find(c=>c.id===chart.id);if(chart.analysis&&chart.analysis!==before?.analysis&&!runs.some(r=>r.result.createdAt===chart.analysis!.createdAt&&r.datasetId===chart.datasetId&&r.result.fingerprint===chart.analysis!.fingerprint)){const dataset=p.datasets!.find(d=>d.id===chart.datasetId)!;runs.push({id:uuid(),datasetId:dataset.id,name:`${dataset.name} · ${chart.analysis.testLabel}`,result:chart.analysis});}}
 const oldCharts=new Set(previous.charts.map(c=>c.id)),oldRuns=new Set((previous.analysisRuns??[]).map(r=>r.id));
 p.analysisRuns=runs;
 const chartIds=new Set(p.charts.map(c=>c.id)),runIds=new Set(runs.map(r=>r.id));
 p.workspaceLayout={chartIds:[...new Set([...(p.workspaceLayout?.chartIds??[]),...p.charts.filter(c=>!oldCharts.has(c.id)).map(c=>c.id)])].filter(id=>chartIds.has(id)),analysisIds:[...new Set([...(p.workspaceLayout?.analysisIds??[]),...runs.filter(r=>!oldRuns.has(r.id)).map(r=>r.id)])].filter(id=>runIds.has(id))};
 const selected=p.charts.find(c=>c.id===p.activeChartId);return selected?.datasetId!==p.activeDatasetId?activateChart(p,p.activeChartId):p;
}
export function appendDatasets(project:Project,imports:{name:string;groups:Group[]}[],makeChart:(dataset:Dataset)=>Chart):Project {
 const p=normalizeWorkspace(project);
 const added=imports.map(item=>{const datasetId=uuid();const groups=item.groups.map(g=>({...g,id:`${datasetId}-${g.id}`,observations:g.observations.map(o=>({...o,id:`${datasetId}-${o.id}`}))}));return {id:datasetId,name:item.name.trim()||'Imported dataset',groups,analysisConfig:{...p.analysisConfig,test:groups.length>2?'welch-anova':'welch',design:'independent' as const,control:groups[0].id}}});
 const charts=added.map(d=>({...makeChart(d),datasetId:d.id}));
 const next={...p,datasets:[...p.datasets!,...added],charts:[...p.charts,...charts]};
 return added.length?activateDataset({...next,workspaceLayout:{chartIds:[...p.workspaceLayout!.chartIds,...charts.map(c=>c.id)],analysisIds:p.workspaceLayout!.analysisIds}},added[0].id):next;
}
