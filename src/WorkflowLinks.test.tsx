// @vitest-environment jsdom
import {act} from 'react';
import {createRoot} from 'react-dom/client';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import App from './App';
import {createChart,createProject,parseCsv,serializeProject} from './project';
import {appendDatasets,normalizeWorkspace} from './workspace';
import {groupsFromAdvanced,parseAdvancedCsv} from './advancedData';
import {listWorkspaces,readWorkspace} from './workspaceLibrary';
import type {Project} from './types';

const storageKey='plotstatlab.project.v1';
let host:HTMLDivElement,root:ReturnType<typeof createRoot>;
const saved=():Project=>JSON.parse(localStorage.getItem(storageKey)!);
const button=(text:string,scope:ParentNode=host)=>[...scope.querySelectorAll<HTMLButtonElement>('button')].find(element=>element.textContent===text)!;
const field=(label:string)=>host.querySelector<HTMLInputElement|HTMLSelectElement>(`[aria-label="${label}"]`)!;
async function click(element:HTMLElement){expect(element).toBeTruthy();await act(async()=>element.click())}
async function tab(name:string){await click(button(name,host.querySelector('.tab-switch')!))}
async function open(project:Project){localStorage.setItem(storageKey,serializeProject(project));await act(async()=>root.render(<App/>))}
beforeEach(()=>{
 localStorage.clear();vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);
 vi.stubGlobal('fetch',vi.fn(async()=>({ok:true,json:async()=>({suggestions:[],warnings:[]})})));
 vi.stubGlobal('URL',Object.assign(URL,{createObjectURL:vi.fn(()=> 'blob:fixture'),revokeObjectURL:vi.fn()}));
 vi.spyOn(HTMLAnchorElement.prototype,'click').mockImplementation(()=>{});
 host=document.createElement('div');document.body.append(host);root=createRoot(host);
});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();vi.restoreAllMocks();vi.unstubAllGlobals()});

it('retains advanced column identities and the plotted selection when editing values or exclusions',async()=>{
 const rows=parseAdvancedCsv('factorA,factorB,subject,y\nControl,Before,S1,1\nControl,After,S1,3\nTreated,Before,S2,4\nTreated,After,S2,8');
 const project=appendDatasets(normalizeWorkspace(createProject()),[{name:'Advanced identity check',groups:groupsFromAdvanced(rows),advancedRows:rows}],dataset=>({...createChart('grouped'),groupIds:dataset.groups.map(group=>group.id)}));
 const datasetId=project.activeDatasetId!,chartId=project.activeChartId;
 const ids=project.datasets!.find(dataset=>dataset.id===datasetId)!.groups.map(group=>group.id);
 const pointId=project.groups[0].observations[0].id;
 await open(project);await tab('Data');
 const y=field('y, observation 1');expect(y).toBeTruthy();
 await act(async()=>{y.value='12.5';y.dispatchEvent(new FocusEvent('focusout',{bubbles:true}))});
 let current=saved(),dataset=current.datasets!.find(value=>value.id===datasetId)!;
 expect(dataset.groups.map(group=>group.id)).toEqual(ids);
 expect(current.charts.find(chart=>chart.id===chartId)!.groupIds).toEqual(ids);
 expect(dataset.groups[0].observations[0].id).toBe(pointId);
 expect(dataset.groups[0].observations[0].value).toBe(12.5);
 await click(field('Exclude observation 1'));
 current=saved();dataset=current.datasets!.find(value=>value.id===datasetId)!;
 expect(dataset.groups.map(group=>group.id)).toEqual(ids);
 expect(dataset.groups[0].observations[0].excluded).toBe(true);
 await tab('Editor');
 expect(host.querySelectorAll('#chart-svg [data-point-id]')).toHaveLength(4);
 expect(host.querySelector(`#chart-svg [data-point-id="${pointId}"]`)?.getAttribute('data-excluded')).toBe('true');
});

it('opens the active figure with its own dataset after visiting a dataset without any figures',async()=>{
 let project=appendDatasets(normalizeWorkspace(createProject()),[{name:'Table without a figure',groups:parseCsv('A,B\n1000,4000\n2000,5000')}],()=>createChart());
 const noFigureId=project.activeDatasetId!,figure=project.charts[0],sourceId=figure.datasetId!;
 const foreignIds=project.groups.flatMap(group=>group.observations.map(point=>point.id));
 const remaining=project.charts.filter(chart=>chart.datasetId!==noFigureId);
 project={...project,charts:remaining,activeChartId:figure.id,workspaceLayout:{...project.workspaceLayout!,chartIds:remaining.map(chart=>chart.id)}};
 await open(project);
 await click([...host.querySelectorAll<HTMLElement>('.dataset-navigation>button')].find(element=>element.textContent?.includes('Table without a figure'))!);
 expect(field('Active dataset').value).toBe(noFigureId);
 await tab('Editor');
 expect(field('Figure dataset').value).toBe(sourceId);
 expect(saved().activeDatasetId).toBe(sourceId);
 expect(host.querySelectorAll('#chart-svg [data-point-id]')).toHaveLength(48);
 expect(host.querySelector('#chart-svg [data-point-id="point-1-1"]')).not.toBeNull();
 for(const id of foreignIds)expect(host.querySelector(`#chart-svg [data-point-id="${id}"]`)).toBeNull();
});

it('preserves the current workspace revision before opening an older file with the same workspace ID',async()=>{
 const older=normalizeWorkspace(createProject()),latest=structuredClone(older);
 latest.groups[0].observations[0].value=999;
 latest.charts[0].pointStyles['point-1-1']={color:'#ff00ff',size:9};
 await open(latest);
 expect(saved().groups[0].observations[0].value).toBe(999);
 const text=serializeProject(older),file=new File([text],'earlier-revision.psl',{type:'application/json'});
 Object.defineProperty(file,'text',{value:async()=>text});
 const input=host.querySelector<HTMLInputElement>('input[type=file]')!;
 await act(async()=>{Object.defineProperty(input,'files',{value:[file],configurable:true});input.dispatchEvent(new Event('change',{bubbles:true}))});
 expect(saved().id).toBe(older.id);
 expect(saved().groups[0].observations[0].value).toBe(28);
 const backup=listWorkspaces().find(entry=>entry.id!==older.id);
 expect(backup).toBeTruthy();
 const preserved=readWorkspace(backup!.id);
 expect(preserved.name).toContain('before opening file');
 expect(preserved.groups[0].observations[0].value).toBe(999);
 expect(preserved.charts[0].pointStyles['point-1-1']).toEqual({color:'#ff00ff',size:9});
 expect(readWorkspace(older.id).groups[0].observations[0].value).toBe(28);
});
