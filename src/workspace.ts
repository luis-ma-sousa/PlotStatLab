import type {AdvancedRow} from './advancedTypes';
import type {AnalysisRun,Chart,Dataset,Group,Project} from './types';
import {createChart} from './project';
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
 p.workspaceLayout={advancedAnalysisIds:p.workspaceLayout?.advancedAnalysisIds,chartIds:[...new Set([...(p.workspaceLayout?.chartIds??[]),...p.charts.filter(c=>!oldCharts.has(c.id)).map(c=>c.id)])].filter(id=>chartIds.has(id)),analysisIds:[...new Set([...(p.workspaceLayout?.analysisIds??[]),...runs.filter(r=>!oldRuns.has(r.id)).map(r=>r.id)])].filter(id=>runIds.has(id))};
 // A dataset selection is independent of the previously selected figure.
 // Only an explicit figure selection should change the active dataset.
 return p.activeChartId!==previous.activeChartId?activateChart(p,p.activeChartId):p;
}
export function appendDatasets(project:Project,imports:{name:string;groups:Group[];advancedRows?:AdvancedRow[]}[],makeChart:(dataset:Dataset)=>Chart):Project {
 const p=normalizeWorkspace(project);
 const added=imports.map(item=>{const datasetId=uuid();const groups=item.groups.map(g=>({...g,id:`${datasetId}-${g.id}`,observations:g.observations.map(o=>({...o,id:`${datasetId}-${o.id}`}))}));const advancedRows=item.advancedRows?.map(row=>({...row,id:`${datasetId}-${row.id}`,groupId:groups.find(g=>g.name===(row.factorA??row.group??'Series 1'))?.id}));return {advancedRows,id:datasetId,name:item.name.trim()||'Imported dataset',groups,analysisConfig:{...p.analysisConfig,groupIds:undefined,test:groups.length>2?'welch-anova':'welch',design:'independent' as const,control:groups[0].id}}});
 const charts=added.map(d=>({...makeChart(d),datasetId:d.id}));
 const next={...p,datasets:[...p.datasets!,...added],charts:[...p.charts,...charts]};
 return added.length?activateDataset({...next,workspaceLayout:{advancedAnalysisIds:p.workspaceLayout?.advancedAnalysisIds,chartIds:[...p.workspaceLayout!.chartIds,...charts.map(c=>c.id)],analysisIds:p.workspaceLayout!.analysisIds}},added[0].id):next;
}

export interface DatasetDeletionImpact {
 datasetName:string;
 observationCount:number;
 chartCount:number;
 analysisCount:number;
 publicationPanelCount:number;
}

/** Explain the full effect before the user removes a dataset and its dependent work. */
export function datasetDeletionImpact(project:Project,datasetId:string):DatasetDeletionImpact|undefined {
 const p=normalizeWorkspace(project),dataset=p.datasets!.find(d=>d.id===datasetId);
 if(!dataset)return undefined;
 const chartIds=new Set(p.charts.filter(chart=>chart.datasetId===datasetId).map(chart=>chart.id));
 return {
  datasetName:dataset.name,
  observationCount:dataset.groups.reduce((count,group)=>count+group.observations.length,0),
  chartCount:chartIds.size,
  analysisCount:(p.analysisRuns??[]).filter(run=>run.datasetId===datasetId).length+(dataset.advancedAnalyses?.length??0)+(dataset.outlierAnalysis?1:0),
  publicationPanelCount:p.publication?.chartIds.filter(id=>chartIds.has(id)).length??0,
 };
}

function emptyDataset():Dataset {
 const groups:Group[]=[{id:uuid(),name:'Group A',observations:[]},{id:uuid(),name:'Group B',observations:[]}];
 return {id:uuid(),name:'Dataset 1',groups,analysisConfig:{test:'welch',design:'independent',comparisons:'control',correction:'holm',control:groups[0].id,alpha:.05}};
}

/** One immutable operation, so the caller's ordinary Undo restores the entire dataset. */
export function deleteDataset(project:Project,datasetId:string):Project {
 const p=normalizeWorkspace(project),deletedIndex=p.datasets!.findIndex(dataset=>dataset.id===datasetId);
 if(deletedIndex<0)return project;
 const datasets=p.datasets!.filter(dataset=>dataset.id!==datasetId);
 if(!datasets.length)datasets.push(emptyDataset());
 const dataset=datasets.find(candidate=>candidate.id===p.activeDatasetId)??datasets[Math.min(deletedIndex,datasets.length-1)];
 const charts=p.charts.filter(chart=>chart.datasetId!==datasetId);
 let selected=charts.find(chart=>chart.id===p.activeChartId&&chart.datasetId===dataset.id)??charts.find(chart=>chart.datasetId===dataset.id);
 let addedChartId:string|undefined;
 if(!selected){
  selected={...createChart(),datasetId:dataset.id,name:'Figure 1',title:'',yLabel:'Value'};
  charts.push(selected);addedChartId=selected.id;
 }
 const analysisRuns=(p.analysisRuns??[]).filter(run=>run.datasetId!==datasetId);
 const chartIds=new Set(charts.map(chart=>chart.id)),analysisIds=new Set(analysisRuns.map(run=>run.id));
 const advancedIds=new Set(datasets.flatMap(item=>(item.advancedAnalyses??[]).map(run=>run.id)));
 return {
  ...p,datasets,charts,analysisRuns,
  activeDatasetId:dataset.id,activeChartId:selected.id,
  groups:dataset.groups,analysisConfig:dataset.analysisConfig,outlierAnalysis:dataset.outlierAnalysis,
  workspaceLayout:{
   chartIds:[...(p.workspaceLayout?.chartIds??[]).filter(id=>chartIds.has(id)),...(addedChartId?[addedChartId]:[])],
   analysisIds:(p.workspaceLayout?.analysisIds??[]).filter(id=>analysisIds.has(id)),
   ...(p.workspaceLayout?.advancedAnalysisIds?{advancedAnalysisIds:p.workspaceLayout.advancedAnalysisIds.filter(id=>advancedIds.has(id))}:{}),
  },
  publication:p.publication?{...p.publication,chartIds:p.publication.chartIds.filter(id=>chartIds.has(id))}:undefined,
 };
}
