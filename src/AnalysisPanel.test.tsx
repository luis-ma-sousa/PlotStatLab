// @vitest-environment jsdom
import {act,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import AnalysisPanel,{analysisCsv} from './AnalysisPanel';
import {createProject,dataFingerprint} from './project';
import {normalizeWorkspace} from './workspace';
import type {AnalysisConfig,AnalysisResult,AnalysisRun,Project} from './types';

let host:HTMLDivElement,root:ReturnType<typeof createRoot>;
const fixture=()=>{
 const p=normalizeWorkspace(createProject()),d=p.datasets![0];
 d.analysisConfig={...d.analysisConfig,test:'welch',groupIds:d.groups.slice(0,2).map(g=>g.id)};
 p.analysisConfig=d.analysisConfig;
 return p;
};
function result(p:Project,config:AnalysisConfig,test='welch'):AnalysisResult{
 const d=p.datasets![0],selected=d.groups.filter(g=>(config.groupIds??d.groups.map(g=>g.id)).includes(g.id));
 return {test,testLabel:test==='student'?'Student t-test':'Welch t-test',engine:'SciPy',p:.001,statistic:4,config,fingerprint:dataFingerprint(d.groups,config),createdAt:new Date().toISOString(),comparisons:[{id:'comparison',groupA:selected[0].id,groupB:selected[1].id,p:.001,adjustedP:.001,label:'**',effect:4,ci:[2,6]}],summaries:selected.map(g=>({group:g.name,n:g.observations.length,mean:1,sd:2,sem:.5})),warnings:[]};
}
const callbacks=()=>({onConfigChange:vi.fn(),onResult:vi.fn(),onAttach:vi.fn(),onRenameRun:vi.fn(),onDeleteRun:vi.fn(),onFigure:vi.fn()});
beforeEach(()=>{
 vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);
 vi.stubGlobal('fetch',vi.fn(async()=>({ok:true,json:async()=>({suggestions:[{id:'welch',label:'Welch t-test',reason:'Independent means',recommended:true,compatible:true},{id:'student',label:'Student t-test',reason:'Equal variances',recommended:false,compatible:true}],warnings:[]})})));
 host=document.createElement('div');document.body.append(host);root=createRoot(host);
});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();vi.restoreAllMocks();vi.unstubAllGlobals()});
async function change(selector:string,value:string){const input=host.querySelector<HTMLSelectElement>(selector)!;await act(async()=>{input.value=value;input.dispatchEvent(new Event('change',{bubbles:true}))})}
async function button(text:string){const b=[...host.querySelectorAll('button')].find(el=>el.textContent===text)!;expect(b).toBeTruthy();await act(async()=>b.click())}

it('keeps multiple saved analyses and configuration when revisiting the statistics view',async()=>{
 const p=fixture(),d=p.datasets![0];
 p.analysisRuns=[{id:'run1',datasetId:d.id,name:'Welch first',result:result(p,d.analysisConfig)},{id:'run2',datasetId:d.id,name:'Student second',result:result(p,{...d.analysisConfig,test:'student'},'student')}];
 const props={project:p,dataset:d,chart:p.charts[0],...callbacks()};
 await act(async()=>root.render(<AnalysisPanel {...props}/>));
 expect(host.querySelectorAll('select[aria-label="Open saved result"] option')).toHaveLength(2);
 await change('select[aria-label="Open saved result"]','run1');
 await act(async()=>root.render(<div hidden><AnalysisPanel {...props}/></div>));
 await act(async()=>root.render(<AnalysisPanel {...props}/>));
 expect(host.querySelectorAll('select[aria-label="Open saved result"] option')).toHaveLength(2);
 expect(host.querySelector<HTMLInputElement>('input[type=radio][value=welch]')?.checked).toBe(true);
 expect(host.textContent).toContain('Results CSV');expect(host.textContent).toContain('Results JSON');
});

it('runs a chosen pair from a larger dataset and keeps results independent from chart attachment',async()=>{
 const initial=fixture(),onAttach=vi.fn();let saved:Project=initial;
 vi.mocked(fetch).mockImplementation(async(_url,options)=>{
  const body=JSON.parse(options!.body as string);
  if(String(_url)==='/api/analyze')return {ok:true,json:async()=>result(initial,body.config)} as Response;
  return {ok:true,json:async()=>({suggestions:[{id:'welch',label:'Welch t-test',reason:'Independent',compatible:true,recommended:true}],warnings:[]})} as Response;
 });
 function Harness(){
  const [p,setP]=useState(initial);saved=p;
  return <AnalysisPanel project={p} dataset={p.datasets![0]} chart={p.charts[0]} {...callbacks()} onAttach={onAttach} onResult={r=>setP(v=>({...v,analysisRuns:[...(v.analysisRuns??[]),{id:`run-${v.analysisRuns?.length??0}`,datasetId:v.datasets![0].id,name:'Saved comparison',result:r}]}))}/>;
 }
 await act(async()=>root.render(<Harness/>));await button('Run and save new analysis');
 const request=vi.mocked(fetch).mock.calls.find(([url])=>url==='/api/analyze')!;
 const body=JSON.parse(request[1]!.body as string);
 expect(body.config.groupIds).toHaveLength(2);expect(body.groups).toHaveLength(2);expect(body.groups.map((g:{id:string})=>g.id)).toEqual(body.config.groupIds);
 expect(saved.analysisRuns).toHaveLength(1);expect(saved.charts[0].analysis).toBeUndefined();expect(onAttach).not.toHaveBeenCalled();
 await button('Run and save new analysis');expect(saved.analysisRuns).toHaveLength(2);
 await button('Add stars / ns to figure');expect(onAttach).toHaveBeenCalledWith('run-1',saved.charts[0].id);
});

it('retains stale results but blocks applying them and never lists another dataset’s figures',async()=>{
 const p=fixture(),d=p.datasets![0],r=result(p,d.analysisConfig);
 p.analysisRuns=[{id:'run1',datasetId:d.id,name:'Before editing',result:r}];
 d.groups[0].observations[0].value+=100;
 p.charts.push({...p.charts[0],id:'foreign-chart',datasetId:'other',name:'Other dataset figure'});
 await act(async()=>root.render(<AnalysisPanel project={p} dataset={d} chart={p.charts[0]} {...callbacks()}/>));
 expect(host.textContent).toContain('Data changed after this result was calculated');
 expect([...host.querySelectorAll('button')].find(b=>b.textContent==='Add stars / ns to figure')?.disabled).toBe(true);
 expect([...host.querySelectorAll('select[aria-label="Target figure"] option')].map(o=>o.textContent)).not.toContain('Other dataset figure');
});

it('exports full results with numeric precision and safe labels',()=>{
 const p=fixture(),d=p.datasets![0];d.name='=untrusted';
 const r:AnalysisRun={id:'run1',datasetId:d.id,name:'Welch',result:result(p,d.analysisConfig)};
 const csv=analysisCsv(r,d);expect(csv).toContain("'=untrusted");expect(csv).toContain('"Adjusted p"');expect(csv).toContain('"0.001"');expect(csv).toContain('"**"');expect(csv).toContain('"Included n"');
});
