// @vitest-environment jsdom
import {act} from 'react';
import {createRoot} from 'react-dom/client';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import App from './App';

let host:HTMLDivElement,root:ReturnType<typeof createRoot>,calculations:number;
const project=()=>JSON.parse(localStorage.getItem('plotstatlab.project.v1')!);
const field=(name:string)=>host.querySelector<HTMLInputElement|HTMLTextAreaElement|HTMLSelectElement>(`[aria-label="${name}"]`)!;
const byText=(text:string,scope:ParentNode=host)=>[...scope.querySelectorAll<HTMLButtonElement>('button')].find(b=>b.textContent===text)!;
async function click(element:HTMLElement){expect(element).toBeTruthy();await act(async()=>element.click())}
async function tab(name:string){await click(byText(name,host.querySelector('.tab-switch')!))}
async function text(name:string,value:string){const input=field(name);expect(input).toBeTruthy();await act(async()=>{const prototype=input instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(prototype,'value')!.set!.call(input,value);input.dispatchEvent(new Event('input',{bubbles:true}))})}
async function choose(name:string,value:string){await act(async()=>{field(name).value=value;field(name).dispatchEvent(new Event('change',{bubbles:true}))})}
async function pastedDataset(){
 await click(host.querySelector<HTMLElement>('button[aria-label="New dataset"]')!);await click(byText('Paste a table'));
 await text('Table to import','Subject\tNotes\tControl\tTreated\ns1\thealthy\t1\t8\ns2\tstressed\t2\t10\ns3\thealthy\t3\t9\ns4\thealthy\t2\t11');await click(byText('Import table'));
}
beforeEach(()=>{
 localStorage.clear();calculations=0;vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);
 vi.stubGlobal('URL',Object.assign(URL,{createObjectURL:vi.fn(()=> 'blob:fixture'),revokeObjectURL:vi.fn()}));vi.spyOn(HTMLAnchorElement.prototype,'click').mockImplementation(()=>{});
 vi.stubGlobal('fetch',vi.fn(async(url,options)=>{
  const request=JSON.parse(options.body);
  if(url==='/api/analyze'){
   calculations++;const {config,fingerprint}=request,groups=request.groups.filter((g:any)=>!config.groupIds||config.groupIds.includes(g.id));
   return {ok:true,json:async()=>({test:config.test,testLabel:config.test==='student'?'Student t-test':'Welch t-test',engine:'SciPy fixture',statistic:-6,p:.0001,comparisons:[{id:'comparison-'+calculations,groupA:groups[0].id,groupB:groups[1].id,p:.0001,adjustedP:.0001,label:'***',effect:-7,ci:[-9,-5]}],summaries:groups.map((g:any)=>({group:g.name,n:g.observations.filter((o:any)=>!o.excluded).length,mean:2,sd:1,sem:.5})),warnings:[],fingerprint,config,createdAt:new Date(Date.UTC(2026,0,1,0,0,calculations)).toISOString()})};
  }
  return {ok:true,json:async()=>({suggestions:[{id:'welch',label:'Welch t-test',reason:'Independent groups',recommended:true,compatible:request.groups.length===2},{id:'student',label:'Student t-test',reason:'Equal variances',recommended:false,compatible:request.groups.length===2}],warnings:[]})};
 }));
 host=document.createElement('div');document.body.append(host);root=createRoot(host);
});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();vi.restoreAllMocks();vi.unstubAllGlobals()});

it('creates a blank dataset, pastes a cell range and creates a figure from its explicit dataset and selected columns',async()=>{
 await act(async()=>root.render(<App/>));await click(host.querySelector<HTMLElement>('button[aria-label="New dataset"]')!);await text('New dataset name','Direct entry');await click(byText('Create blank table'));
 const paste=new Event('paste',{bubbles:true,cancelable:true});Object.defineProperty(paste,'clipboardData',{value:{getData:()=> '1\t4\n2\t6\n3\t5'}});
 await act(async()=>field('Group A, row 1').dispatchEvent(paste));
 expect(field('Group B, row 3').value).toBe('5');let p=project(),d=p.datasets.find((v:any)=>v.name==='Direct entry');expect(d.groups.map((g:any)=>g.observations.length)).toEqual([3,3]);
 await click(byText('Create figure from this data'));expect(field('New figure dataset').value).toBe(d.id);
 const choice=[...host.querySelectorAll<HTMLInputElement>('.gallery-data-source input[type=checkbox]')][1];await click(choice);
 await click([...host.querySelectorAll<HTMLElement>('.gallery-card')].find(b=>b.querySelector('strong')?.textContent==='Bar + swarm')!);
 p=project();const chart=p.charts.find((c:any)=>c.id===p.activeChartId);expect(chart.datasetId).toBe(d.id);expect(chart.groupIds).toEqual([d.groups[0].id]);expect(host.querySelectorAll('#chart-svg [data-point-id]')).toHaveLength(3);
});

it('keeps separate tests on one dataset, preserves result selection across tabs and saves links with the workspace',async()=>{
 await act(async()=>root.render(<App/>));await pastedDataset();expect(field('Notes, row 2').value).toBe('stressed');await tab('Statistics');await click(byText('Run and save new analysis'));
 let p=project();expect(p.analysisRuns).toHaveLength(1);const firstRun=p.analysisRuns[0];expect(p.charts.find((c:any)=>c.id===p.activeChartId).analysis).toBeUndefined();
 await click(host.querySelector<HTMLInputElement>('input[type=radio][value=student]')!);await click(byText('Run and save new analysis'));
 expect(project().analysisRuns).toHaveLength(2);await choose('Open saved result',firstRun.id);await tab('Data');await tab('Statistics');expect(field('Open saved result').value).toBe(firstRun.id);
 await click(byText('Add stars / ns to figure'));await click(byText('Open figure'));
 expect(host.querySelectorAll('#chart-svg [data-annotation-id]')).toHaveLength(1);p=project();const chart=p.charts.find((c:any)=>c.id===p.activeChartId);expect(chart.analysisRunId).toBe(firstRun.id);expect(chart.showSignificance).toBe(true);expect(chart.showNs).toBe(true);
 const file=new File([JSON.stringify(p)],'workflow.psl',{type:'application/json'});Object.defineProperty(file,'text',{value:async()=>JSON.stringify(p)});const input=host.querySelector<HTMLInputElement>('input[type=file]')!;
 await act(async()=>{Object.defineProperty(input,'files',{value:[file],configurable:true});input.dispatchEvent(new Event('change',{bubbles:true}))});
 expect(project().analysisRuns).toHaveLength(2);expect(project().charts.find((c:any)=>c.id===chart.id).analysisRunId).toBe(firstRun.id);
});

it('right-click formats a single swarm point and excludes it visibly without deleting measurements or saved results',async()=>{
 await act(async()=>root.render(<App/>));await pastedDataset();await tab('Statistics');await click(byText('Run and save new analysis'));await click(byText('Add stars / ns to figure'));await click(byText('Open figure'));
 const point=host.querySelector<HTMLElement>('#chart-svg [data-point-id]')!,pointId=point.getAttribute('data-point-id')!;
 await act(async()=>point.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,clientX:200,clientY:200})));await click(byText('Format this point'));await text('Point color hex','#dd1177');
 let p=project(),chart=p.charts.find((c:any)=>c.id===p.activeChartId);expect(chart.pointStyles[pointId].color).toBe('#dd1177');expect(Object.keys(chart.pointStyles)).toEqual([pointId]);
 await act(async()=>point.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,clientX:200,clientY:200})));await click(byText('Exclude from analysis'));
 p=project();const d=p.datasets.find((v:any)=>v.id===p.activeDatasetId);expect(d.groups.flatMap((g:any)=>g.observations)).toHaveLength(8);expect(d.groups.flatMap((g:any)=>g.observations).find((o:any)=>o.id===pointId).excluded).toBe(true);expect(p.analysisRuns).toHaveLength(1);expect(host.querySelectorAll('#chart-svg [data-point-id]')).toHaveLength(8);expect(host.querySelectorAll('#chart-svg [data-annotation-id]')).toHaveLength(0);
 await tab('Data');expect(host.querySelectorAll('.data-grid-cell-excluded')).toHaveLength(1);await tab('Statistics');expect(host.textContent).toContain('Data changed after this result was calculated');await click(byText('Run and save new analysis'));expect(project().analysisRuns).toHaveLength(2);expect(project().analysisRuns[1].result.summaries[0].n).toBe(3);
});

it('switches to a new workspace and restores the previous workspace including its datasets',async()=>{
 await act(async()=>root.render(<App/>));await pastedDataset();const first=project();await click(host.querySelector<HTMLElement>('button[aria-label="Switch workspace"]')!);await text('New workspace name','Second workspace');await click(byText('Create blank workspace'));
 expect(project().name).toBe('Second workspace');expect(project().id).not.toBe(first.id);
 await click(host.querySelector<HTMLElement>('button[aria-label="Switch workspace"]')!);await click([...host.querySelectorAll<HTMLElement>('.workspace-entry')].find(b=>b.querySelector('strong')?.textContent===first.name)!);
 expect(project().id).toBe(first.id);expect(project().datasets).toHaveLength(first.datasets.length);
});
