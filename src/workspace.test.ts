import {describe,expect,it} from 'vitest';
import {createChart,createProject,dataFingerprint,parseCsv,parseProject,serializeProject} from './project';
import {activateChart,activateDataset,activeDataset,appendDatasets,datasetDeletionImpact,deleteDataset,normalizeWorkspace,syncWorkspace} from './workspace';
import type {AnalysisResult,Project} from './types';
import type {AdvancedResult} from './advancedTypes';
import {defaultPublication} from './publication';
function add(p:Project){return appendDatasets(p,[{name:'Study B',groups:parseCsv('Subject,Control,Treatment\ns1,1,5\ns2,2,6\ns3,3,8')},{name:'Study C',groups:parseCsv('Subject,Control,Treatment\ns1,10,12\ns2,11,15\ns3,12,16')}],()=>createChart())}
function result(p:Project,test:string):AnalysisResult{return {test,testLabel:test,engine:'fixture',statistic:3,p:.01,comparisons:[],summaries:[],warnings:[],fingerprint:dataFingerprint(p.groups,{...p.analysisConfig,test}),config:{...p.analysisConfig,test},createdAt:new Date().toISOString()+test}}
describe('multi-dataset workspaces',()=>{
 it('converts a legacy project to one dataset without changing measurement identities or per-point formatting',()=>{const old=createProject();old.charts[0].pointStyles['point-1-1']={color:'#123456'};const p=normalizeWorkspace(old);expect(p.datasets).toHaveLength(1);expect(p.groups).toBe(old.groups);expect(p.charts[0].pointStyles).toEqual(old.charts[0].pointStyles);expect(p.charts.every(c=>c.datasetId===p.activeDatasetId)).toBe(true);expect(parseProject(serializeProject(p))).toEqual(p)});
 it('adds multiple CSV datasets without replacing existing work or colliding observation identities',()=>{const original=normalizeWorkspace(createProject()),p=add(original);expect(p.datasets).toHaveLength(3);expect(p.datasets![0]).toEqual(original.datasets![0]);expect(p.charts).toHaveLength(4);const ids=p.datasets!.flatMap(d=>d.groups.flatMap(g=>g.observations.map(o=>o.id)));expect(new Set(ids).size).toBe(ids.length);expect(p.groups).toBe(p.datasets![1].groups);expect(p.groups[0].observations[0].subject).toBe('s1')});
 it('edits only the active dataset and restores the correct data when selecting a figure from another dataset',()=>{let p=add(normalizeWorkspace(createProject()));const firstId=p.datasets![0].id,secondId=p.datasets![1].id;const edited={...p,groups:p.groups.map((g,i)=>i===0?{...g,observations:g.observations.map((o,j)=>j===0?{...o,value:99}:o)}:g)};p=syncWorkspace(p,edited);expect(p.datasets![1].groups[0].observations[0].value).toBe(99);expect(p.datasets![0].groups[0].observations[0].value).toBe(28);p=activateChart(p,p.charts[0].id);expect(activeDataset(p).id).toBe(firstId);expect(p.groups[0].observations[0].value).toBe(28);p=activateDataset(p,secondId);expect(p.groups[0].observations[0].value).toBe(99)});
 it('keeps different tests from multiple datasets, visible panels and every figure style through a workspace roundtrip',()=>{let p=add(normalizeWorkspace(createProject()));for(const index of [1,2,1]){p=activateDataset(p,p.datasets![index].id);const chart=p.charts.find(c=>c.id===p.activeChartId)!;const r=result(p,index===2?'mann-whitney':p.analysisRuns?.length?'student':'welch');p=syncWorkspace(p,{...p,charts:p.charts.map(c=>c.id===chart.id?{...c,analysis:r,pointStyles:{[p.groups[0].observations[0].id]:{color:'#aabbcc',size:8}}}:c)})}expect(p.analysisRuns).toHaveLength(3);p.workspaceLayout={chartIds:[p.charts[0].id,p.charts[3].id],analysisIds:p.analysisRuns!.map(r=>r.id)};const reopened=normalizeWorkspace(parseProject(serializeProject(p)));expect(reopened).toEqual(p);expect(reopened.analysisRuns!.map(r=>r.result.test)).toEqual(['welch','mann-whitney','student']);expect(Object.keys(reopened.charts[3].pointStyles)).toHaveLength(1)});
 it('rejects broken dataset links instead of silently attaching a figure to different measurements',()=>{const p=add(normalizeWorkspace(createProject()));p.charts[0].datasetId='missing';expect(()=>parseProject(serializeProject(p))).toThrow('chart dataset');const q=add(normalizeWorkspace(createProject()));q.datasets![2].groups[0].observations[0].id=q.datasets![1].groups[0].observations[0].id;expect(()=>parseProject(serializeProject(q))).toThrow('unique across datasets')});
});

const advancedResult:AdvancedResult={method:'linear-regression',methodLabel:'Linear regression',engine:'fixture',fingerprint:'saved-reference',createdAt:'2026-11-08T12:00:00Z',parameters:{alpha:.05},tables:[],estimates:{slope:2},warnings:[],reference:'fixture'};
function analyzedWorkspace(){
 let p=add(normalizeWorkspace(createProject()));
 for(const index of [1,2]){
  p=activateDataset(p,p.datasets![index].id);
  const analysis=result(p,'welch'),chartId=p.activeChartId;
  p=syncWorkspace(p,{...p,charts:p.charts.map(chart=>chart.id===chartId?{...chart,analysis,pointStyles:{[p.groups[0].observations[0].id]:{color:'#cd3366',size:9}}}:chart)});
 }
 p.datasets![1]={...p.datasets![1],advancedAnalyses:[{id:'advanced-B',result:advancedResult}]};
 p.datasets![2]={...p.datasets![2],advancedAnalyses:[{id:'advanced-C',result:advancedResult}]};
 p.workspaceLayout!.advancedAnalysisIds=['advanced-B','advanced-C'];
 p.publication=defaultPublication(p.charts.map(chart=>chart.id));
 return p;
}
describe('dataset deletion',()=>{
 it('reports dependent observations, figures, saved tests and publication panels before deletion',()=>{
  const p=analyzedWorkspace(),dataset=p.datasets![1];
  expect(datasetDeletionImpact(p,dataset.id)).toEqual({datasetName:'Study B',observationCount:6,chartCount:1,analysisCount:2,publicationPanelCount:1});
  expect(datasetDeletionImpact(p,'missing')).toBeUndefined();expect(deleteDataset(p,'missing')).toBe(p);
 });
 it('removes only the selected dataset and its dependent results/layout references, retaining other measurements and formatting',()=>{
  const p=analyzedWorkspace(),before=serializeProject(p),deleted=p.datasets![1],retained=p.datasets![2],retainedChart=p.charts.find(chart=>chart.datasetId===retained.id)!,removedChart=p.charts.find(chart=>chart.datasetId===deleted.id)!;
  const removedRun=p.analysisRuns!.find(run=>run.datasetId===deleted.id)!,retainedRun=p.analysisRuns!.find(run=>run.datasetId===retained.id)!;
  const next=syncWorkspace(p,deleteDataset(p,deleted.id));
  expect(next.datasets).toHaveLength(2);expect(next.datasets!.find(dataset=>dataset.id===retained.id)).toEqual(retained);
  expect(next.charts.find(chart=>chart.id===retainedChart.id)).toEqual(retainedChart);expect(next.charts.some(chart=>chart.id===removedChart.id)).toBe(false);
  expect(next.analysisRuns).toEqual([retainedRun]);expect(next.workspaceLayout!.analysisIds).not.toContain(removedRun.id);expect(next.workspaceLayout!.analysisIds).toContain(retainedRun.id);
  expect(next.workspaceLayout!.advancedAnalysisIds).toEqual(['advanced-C']);expect(next.workspaceLayout!.chartIds).not.toContain(removedChart.id);expect(next.publication!.chartIds).not.toContain(removedChart.id);
  expect(activeDataset(next).id).toBe(retained.id);expect(next.activeChartId).toBe(retainedChart.id);
  expect(normalizeWorkspace(parseProject(serializeProject(next)))).toEqual(next);
  // The caller can restore its prior snapshot with ordinary Undo; the deletion never mutates it.
  expect(serializeProject(p)).toBe(before);
 });
 it('selects a surviving dataset and its own figure when the active dataset is removed',()=>{
  const p=analyzedWorkspace(),active=p.datasets![2],next=syncWorkspace(p,deleteDataset(p,active.id));
  expect(next.activeDatasetId).toBe(p.datasets![1].id);expect(next.charts.find(chart=>chart.id===next.activeChartId)?.datasetId).toBe(next.activeDatasetId);
  expect(next.groups).toEqual(p.datasets![1].groups);expect(next.analysisConfig).toEqual(p.datasets![1].analysisConfig);
  expect(next.datasets!.some(dataset=>dataset.id===active.id)).toBe(false);expect(next.analysisRuns!.every(run=>run.datasetId!==active.id)).toBe(true);
 });
 it('provides a blank table after deleting the final dataset without reintroducing demonstration values',()=>{
  const p=normalizeWorkspace(createProject());p.publication=defaultPublication(p.charts.map(chart=>chart.id));
  const next=syncWorkspace(p,deleteDataset(p,p.datasets![0].id));
  expect(next.datasets).toHaveLength(1);expect(next.charts).toHaveLength(1);expect(next.groups.map(group=>group.observations.length)).toEqual([0,0]);
  expect(next.activeDatasetId).not.toBe(p.activeDatasetId);expect(next.charts[0].datasetId).toBe(next.activeDatasetId);expect(next.activeChartId).toBe(next.charts[0].id);
  expect(next.analysisRuns).toEqual([]);expect(next.publication!.chartIds).toEqual([]);expect(next.workspaceLayout!.chartIds).toEqual([next.activeChartId]);expect(next.workspaceLayout!.analysisIds).toEqual([]);
  expect(parseProject(serializeProject(next))).toEqual(next);
 });
 it('creates a figure for a surviving chartless dataset while preserving that dataset’s existing data',()=>{
  const original=add(normalizeWorkspace(createProject())),first=original.datasets![0],second=original.datasets![1];
  let p:Project={...original,datasets:original.datasets!.slice(0,2),charts:original.charts.filter(chart=>chart.datasetId===second.id),analysisRuns:[]};
  p={...activateDataset(p,first.id),workspaceLayout:{chartIds:p.charts.map(chart=>chart.id),analysisIds:[]}};
  const next=syncWorkspace(p,deleteDataset(p,second.id));
  expect(next.activeDatasetId).toBe(first.id);expect(next.groups).toEqual(first.groups);expect(next.charts).toHaveLength(1);expect(next.charts[0].datasetId).toBe(first.id);
  expect(next.charts[0].id).not.toBe(p.activeChartId);expect(next.groups.reduce((count,group)=>count+group.observations.length,0)).toBe(48);
  expect(parseProject(serializeProject(next))).toEqual(next);
 });
});
