// @vitest-environment jsdom
import {act} from 'react';
import {createRoot} from 'react-dom/client';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import App from './App';
import {createChart,createProject,dataFingerprint,parseCsv,serializeProject} from './project';
import {appendDatasets,normalizeWorkspace,syncWorkspace} from './workspace';
import {defaultPublication} from './publication';
import {groupsFromAdvanced,parseAdvancedCsv} from './advancedData';
import {scientificPlainText,scientificTokens} from './ScientificText';
import {serializeFigureSvg} from './export';
import type {AnalysisResult,Project} from './types';

let host:HTMLDivElement,root:ReturnType<typeof createRoot>;
const storageKey='plotstatlab.project.v1';
const saved=():Project=>JSON.parse(localStorage.getItem(storageKey)!);
const button=(text:string,scope:ParentNode=host)=>[...scope.querySelectorAll<HTMLButtonElement>('button')].find(element=>element.textContent===text)!;
async function click(element:Element){expect(element).toBeTruthy();await act(async()=>{if(element instanceof HTMLElement)element.click();else element.dispatchEvent(new MouseEvent('click',{bubbles:true}))})}
async function tab(name:string){await click(button(name,host.querySelector('.tab-switch')!))}
async function open(project:Project){localStorage.setItem(storageKey,serializeProject(project));await act(async()=>root.render(<App/>))}
beforeEach(()=>{
 localStorage.clear();vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);
 vi.stubGlobal('fetch',vi.fn(async()=>({ok:true,json:async()=>({suggestions:[],warnings:[]})})));
 vi.stubGlobal('URL',Object.assign(URL,{createObjectURL:vi.fn(()=> 'blob:editing-fixture'),revokeObjectURL:vi.fn()}));
 vi.spyOn(HTMLAnchorElement.prototype,'click').mockImplementation(()=>{});
 host=document.createElement('div');document.body.append(host);root=createRoot(host);
});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();window.getSelection()?.removeAllRanges();vi.restoreAllMocks();vi.unstubAllGlobals()});

it('offers a visible dataset deletion review, supports cancellation and restores all dependent work with one Undo',async()=>{
 let project=appendDatasets(normalizeWorkspace(createProject()),[{name:'Diana review',groups:parseCsv('A,B\n1,8\n2,9\n3,10')}],()=>createChart());
 const deletedId=project.activeDatasetId!,chartId=project.activeChartId;
 const analysis:AnalysisResult={test:'welch',testLabel:'Welch t-test',engine:'fixture',statistic:-8,p:.001,comparisons:[],summaries:[],warnings:[],fingerprint:dataFingerprint(project.groups,project.analysisConfig),config:project.analysisConfig,createdAt:'2026-11-08T12:00:00Z'};
 project=syncWorkspace(project,{...project,charts:project.charts.map(chart=>chart.id===chartId?{...chart,analysis,pointStyles:{[project.groups[0].observations[0].id]:{color:'#bb22dd',shape:'diamond'}}}:chart)});
 project.publication=defaultPublication(project.charts.map(chart=>chart.id));
 await open(project);expect(host.querySelector(`[aria-label="Delete dataset Diana review"]`)).not.toBeNull();await tab('Data');
 const before=saved();await click(button('Delete dataset'));
 let dialog=host.querySelector<HTMLElement>('[role=dialog]')!;expect(dialog.querySelector('h2')?.textContent).toBe('Delete dataset?');expect(dialog.textContent).toContain('Diana review');
 expect([...dialog.querySelectorAll('.dataset-delete-impact strong')].map(element=>element.textContent)).toEqual(['6','1','1','1']);
 await click(button('Cancel',dialog));expect(saved().datasets).toEqual(before.datasets);expect(saved().analysisRuns).toEqual(before.analysisRuns);
 await click(button('Delete dataset'));dialog=host.querySelector<HTMLElement>('[role=dialog]')!;await click(button('Delete dataset',dialog));
 expect(saved().datasets!.some(dataset=>dataset.id===deletedId)).toBe(false);expect(saved().charts.some(chart=>chart.id===chartId)).toBe(false);expect(saved().analysisRuns).toHaveLength(0);expect(saved().publication!.chartIds).not.toContain(chartId);
 await click(button('Undo',host.querySelector('.toast')!));
 expect(saved().datasets).toEqual(before.datasets);expect(saved().charts).toEqual(before.charts);expect(saved().analysisRuns).toEqual(before.analysisRuns);expect(saved().publication).toEqual(before.publication);expect(saved().activeDatasetId).toBe(deletedId);
});

it('opens visual text controls from the figure, persists selected italics, multiline axes and spacing through SVG and workspace reopening',async()=>{
 await open(normalizeWorkspace(createProject()));await tab('Editor');
 const beforeGroups=structuredClone(saved().groups),yTitle=host.querySelector<HTMLElement>('#chart-svg [data-edit=yaxis]')!;
 await click(yTitle);
 const yEditor=host.querySelector<HTMLElement>('[role=textbox][aria-label="Y axis title"]')!;expect(document.activeElement).toBe(yEditor);
 await act(async()=>{yEditor.textContent='Relative expression\n(a.u.)';yEditor.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertText'}))});
 const range=document.createRange();range.setStart(yEditor.firstChild!,0);range.setEnd(yEditor.firstChild!,8);window.getSelection()!.removeAllRanges();window.getSelection()!.addRange(range);
 await act(async()=>yEditor.dispatchEvent(new MouseEvent('mouseup',{bubbles:true})));await click(host.querySelector<HTMLElement>('[aria-label="Italic Y axis title"]')!);
 let chart=saved().charts.find(item=>item.id===saved().activeChartId)!;
 expect(scientificPlainText(chart.yLabel)).toBe('Relative expression\n(a.u.)');expect(scientificTokens(chart.yLabel).some(token=>token.text==='Relative'&&token.italic)).toBe(true);
 expect(host.querySelector('#chart-svg [data-edit=yaxis] [font-style=italic]')?.textContent).toBe('Relative');
 await click(button('X axis title',host.querySelector('.figure-text-shortcuts')!));
 const xEditor=host.querySelector<HTMLElement>('[role=textbox][aria-label="X axis title"]')!;expect(document.activeElement).toBe(xEditor);
 const enter=new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true});await act(async()=>xEditor.dispatchEvent(enter));expect(enter.defaultPrevented).toBe(false);
 await act(async()=>{xEditor.innerHTML='After treatment<div>(days)</div>';xEditor.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertParagraph'}))});
 await click(button('Y axis title',host.querySelector('.figure-text-shortcuts')!));await click(button('Move farther'));
 chart=saved().charts.find(item=>item.id===saved().activeChartId)!;expect(chart.style.yLabelDistance).toBeGreaterThan(63);expect(scientificPlainText(chart.xLabel)).toBe('After treatment\n(days)');expect(saved().groups).toEqual(beforeGroups);
 const svg=serializeFigureSvg(chart,host.querySelector<SVGSVGElement>('#chart-svg')!);expect(svg).not.toMatch(/NaN|Infinity/);
 const doc=new DOMParser().parseFromString(svg,'image/svg+xml');expect(doc.querySelector('parsererror')).toBeNull();expect(doc.querySelector('#PSL-label-yaxis [font-style=italic]')?.textContent).toBe('Relative');expect(doc.querySelectorAll('#PSL-label-xaxis tspan[dy]')).toHaveLength(2);expect(doc.querySelectorAll('#PSL-label-yaxis tspan[dy]')).toHaveLength(2);
 await click(button('Save workspace'));const contents=serializeProject(saved()),file=new File([contents],'Diana editing.psl',{type:'application/json'});Object.defineProperty(file,'text',{value:async()=>contents});
 const input=host.querySelector<HTMLInputElement>('input[type=file]')!;await act(async()=>{Object.defineProperty(input,'files',{value:[file],configurable:true});input.dispatchEvent(new Event('change',{bubbles:true}))});
 const reopened=saved().charts.find(item=>item.id===chart.id)!;expect(reopened.xLabel).toBe(chart.xLabel);expect(reopened.yLabel).toBe(chart.yLabel);expect(reopened.style.yLabelDistance).toBe(chart.style.yLabelDistance);
 await click(host.querySelector<HTMLElement>('.figure-item')!);expect(host.querySelectorAll('#chart-svg [data-edit=xaxis] tspan[data-text-line]')).toHaveLength(2);expect(host.querySelector('#chart-svg [data-edit=yaxis] [font-style=italic]')?.textContent).toBe('Relative');
});

it('removes every advanced observation in one operation and restores the complete table with Undo',async()=>{
 const rows=parseAdvancedCsv('group,x,y\nControl,1,3\nControl,2,4\nTreated,1,9\nTreated,2,10');
 const project=appendDatasets(normalizeWorkspace(createProject()),[{name:'Advanced deletion',groups:groupsFromAdvanced(rows),advancedRows:rows}],()=>createChart('regression'));
 await open(project);await tab('Data');const before=saved(),datasetId=before.activeDatasetId!;
 await click(host.querySelector<HTMLElement>('[aria-label="Select all advanced observations"]')!);await click(button('Remove selected rows'));
 const emptied=saved().datasets!.find(dataset=>dataset.id===datasetId)!;expect(emptied.advancedRows).toEqual([]);expect(emptied.groups.flatMap(group=>group.observations)).toEqual([]);expect(host.querySelectorAll('.advanced-table tbody tr')).toHaveLength(0);
 await click(host.querySelector<HTMLElement>('button[aria-label=Undo]')!);
 const restored=saved().datasets!.find(dataset=>dataset.id===datasetId)!;expect(restored.advancedRows).toEqual(before.datasets!.find(dataset=>dataset.id===datasetId)!.advancedRows);expect(restored.groups).toEqual(before.datasets!.find(dataset=>dataset.id===datasetId)!.groups);expect(host.querySelectorAll('.advanced-table tbody tr')).toHaveLength(4);
});
