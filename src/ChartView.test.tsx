// @vitest-environment jsdom
import {act} from 'react';
import {createRoot} from 'react-dom/client';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import ChartView from './ChartView';
import {createChart,dataFingerprint} from './project';
import type {AnalysisResult,Chart,Group} from './types';

const groups:Group[]=[
  {id:'control',name:'Control',observations:[{id:'a1',subject:'Sample 1',value:1},{id:'a2',subject:'Sample 2',value:3},{id:'a3',subject:'Sample 3',value:100,excluded:true}]},
  {id:'treated',name:'Treated',observations:[{id:'b1',value:20},{id:'b2',value:21},{id:'b3',value:22}]},
];
const analysis:AnalysisResult={test:'welch',testLabel:'Welch t-test',engine:'Fixture',statistic:5,p:.0008,comparisons:[{id:'control::treated',groupA:'control',groupB:'treated',p:.0008,adjustedP:.0008,label:'***'}],summaries:[],warnings:[],fingerprint:'fixture',config:{test:'welch',design:'independent',comparisons:'all',correction:'holm',control:'control',alpha:.05},createdAt:'2026-11-02T00:00:00Z'};
let host:HTMLDivElement,root:ReturnType<typeof createRoot>;
beforeEach(()=>{vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);host=document.createElement('div');document.body.append(host);root=createRoot(host)});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();vi.unstubAllGlobals()});
async function render(chart:Chart,onSelect=vi.fn(),onContextMenu=vi.fn(),onAnnotationMove=vi.fn()){
  await act(async()=>root.render(<ChartView chart={chart} groups={groups} selection={{kind:'chart'}} onSelect={onSelect} onContextMenu={onContextMenu} onAnnotationMove={onAnnotationMove}/>));
  return {onSelect,onContextMenu,onAnnotationMove};
}
it('selects just the clicked swarm point and opens its own context menu without selecting the chart',async()=>{
  const {onSelect,onContextMenu}=await render(createChart('bar-swarm'));
  const point=host.querySelector('[data-point-id="a2"]')!;
  await act(async()=>point.dispatchEvent(new MouseEvent('click',{bubbles:true})));
  expect(onSelect.mock.calls).toEqual([[{kind:'point',id:'a2',groupId:'control'}]]);
  onSelect.mockClear();
  const context=new MouseEvent('contextmenu',{bubbles:true,cancelable:true,button:2,clientX:120,clientY:140});
  await act(async()=>point.dispatchEvent(context));
  expect(context.defaultPrevented).toBe(true);
  expect(onContextMenu).toHaveBeenCalledTimes(1);
  expect(onContextMenu.mock.calls[0][1]).toEqual({kind:'point',id:'a2',groupId:'control'});
  expect(onSelect.mock.calls).toEqual([[{kind:'point',id:'a2',groupId:'control'}]]);
  const marker=point.querySelector('circle')!,hit=point.querySelector('[data-editor-only]')!;
  expect(Number(hit.getAttribute('r'))).toBeLessThan(Number(marker.getAttribute('r'))+1);
});
it('keeps excluded observations visible, named and selectable while summaries omit them',async()=>{
  const {onSelect}=await render(createChart('bar-swarm'));
  const point=host.querySelector('[data-point-id="a3"]')!;
  expect(point.getAttribute('data-excluded')).toBe('true');
  expect(point.getAttribute('aria-label')).toContain('excluded from analysis');
  expect(point.querySelector('circle')?.getAttribute('fill')).toBe('#ffffff');
  expect(point.querySelector('path')).not.toBeNull();
  await act(async()=>point.dispatchEvent(new KeyboardEvent('keydown',{bubbles:true,cancelable:true,key:'Enter'})));
  expect(onSelect).toHaveBeenLastCalledWith({kind:'point',id:'a3',groupId:'control'});
  const cy=(id:string)=>Number(host.querySelector(`[data-point-id="${id}"] circle`)!.getAttribute('cy'));
  const bar=host.querySelector('rect[data-group-id="control"]')!;
  expect(Number(bar.getAttribute('y'))).toBeCloseTo((cy('a1')+cy('a2'))/2,6);
});
it('renders a t-test comparison above all markers and preserves manual movement and context selection',async()=>{
  const chart={...createChart('bar-swarm'),analysis,annotationPositions:{'control::treated':{dx:12,dy:-7}}};
  const {onSelect,onAnnotationMove,onContextMenu}=await render(chart);
  const comparison=host.querySelector('[data-annotation-id="control::treated"]')!;
  expect(comparison.querySelector('text')?.textContent).toBe('***');
  const text=comparison.querySelector('text')!;
  const topPoint=Math.min(...[...host.querySelectorAll('[data-point-id] > circle:first-of-type')].map(point=>Number(point.getAttribute('cy'))-Number(point.getAttribute('r'))));
  expect(Number(text.getAttribute('y'))).toBeLessThan(topPoint-15);
  expect(Number(text.getAttribute('y'))).toBeGreaterThan(66);
  await act(async()=>comparison.dispatchEvent(new KeyboardEvent('keydown',{bubbles:true,cancelable:true,key:'ArrowUp'})));
  expect(onAnnotationMove).toHaveBeenCalledWith('control::treated',{dx:12,dy:-9});
  // A right click must not start a drag or ask jsdom/the SVG for pointer capture.
  await act(async()=>comparison.dispatchEvent(new MouseEvent('pointerdown',{bubbles:true,button:2})));
  await act(async()=>comparison.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,button:2})));
  expect(onContextMenu.mock.calls[0][1]).toEqual({kind:'annotation',id:'control::treated'});
  expect(onSelect).toHaveBeenLastCalledWith({kind:'annotation',id:'control::treated'});
});
it('does not retain a stale annotation after its linked data change',async()=>{
  await act(async()=>root.render(<ChartView chart={{...createChart(),analysis}} groups={groups} selection={{kind:'chart'}} onSelect={()=>{}} onAnnotationMove={()=>{}} analysisStale/>));
  expect(host.querySelector('[data-annotation-id]')).toBeNull();
});
it('keeps a current comparison finite on a logarithmic plot when an untested column is entirely excluded',async()=>{
  const data:Group[]=[...groups,{id:'untested',name:'Untested',observations:[{id:'c1',value:150,excluded:true},{id:'c2',value:180,excluded:true}]}];
  const config={...analysis.config,groupIds:['control','treated']};
  const current={...analysis,config,fingerprint:dataFingerprint(data,config)};
  const beforeExclusion=data.map(group=>group.id==='untested'?{...group,observations:group.observations.map(point=>({...point,excluded:false}))}:group);
  expect(dataFingerprint(beforeExclusion,config)).toBe(current.fingerprint);
  const chart={...createChart('bar-swarm'),analysis:current,style:{...createChart().style,yScale:'log' as const}};
  await act(async()=>root.render(<ChartView chart={chart} groups={data} selection={{kind:'chart'}} onSelect={()=>{}} onAnnotationMove={()=>{}} analysisStale={false}/>));
  expect(host.innerHTML).not.toMatch(/NaN|Infinity/);
  const bracket=host.querySelector('[data-annotation-id="control::treated"]')!;
  expect(bracket).not.toBeNull();
  const labelY=Number(bracket.querySelector('text')!.getAttribute('y'));
  const topPoint=Math.min(...[...host.querySelectorAll('[data-point-id] > circle:first-of-type')].map(point=>Number(point.getAttribute('cy'))-Number(point.getAttribute('r'))));
  expect(Number.isFinite(labelY)).toBe(true);
  expect(labelY).toBeLessThan(topPoint-15);
  expect(labelY).toBeGreaterThan(0);
  expect(host.querySelectorAll('[data-point-id][data-excluded="true"]')).toHaveLength(3);
});
it('filters columns for an individual chart without mutating or hiding source data elsewhere',async()=>{
  const chart={...createChart('bar-swarm'),groupIds:['treated']};
  const original=structuredClone(groups);
  await render(chart);
  expect(host.querySelectorAll('[data-point-id]')).toHaveLength(3);
  expect(host.querySelector('[data-point-id="a1"]')).toBeNull();
  expect(host.querySelector('[data-point-id="b1"] circle')?.getAttribute('fill')).toBe(chart.style.palette[1]);
  expect(groups).toEqual(original);
  await render({...chart,groupIds:undefined});
  expect(host.querySelectorAll('[data-point-id]')).toHaveLength(6);
  expect(host.querySelector('[data-point-id="b1"] circle')?.getAttribute('fill')).toBe(chart.style.palette[1]);
});
it('offers the same individual context actions for specialized chart points',async()=>{
  const chart={...createChart('grouped'),groupIds:['control']};
  const {onSelect,onContextMenu}=await render(chart);
  const point=host.querySelector('[data-point-id="a3"]')!;
  expect(point.getAttribute('data-excluded')).toBe('true');
  await act(async()=>point.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,button:2})));
  expect(onSelect).toHaveBeenLastCalledWith({kind:'point',id:'a3',groupId:'control'});
  expect(onContextMenu).toHaveBeenCalledTimes(1);
  expect(onContextMenu.mock.calls[0][1]).toEqual({kind:'point',id:'a3',groupId:'control'});
  expect(host.querySelectorAll('[data-point-id]')).toHaveLength(3);
});
it.each(['regression','dose-response','kaplan-meier','forest','bland-altman'] as const)('preserves dataset palette slots when hiding the first column of a %s figure',async type=>{
  const chart={...createChart(type),groupIds:['treated']};
  const rows=groups.flatMap(group=>group.observations.map((point,index)=>({id:point.id,y:point.value,x:index+1,lower:point.value-.5,upper:point.value+.5,event:true,factorA:group.name,groupId:group.id,excluded:point.excluded})));
  const view=(current:Chart)=><ChartView chart={current} groups={groups} advancedRows={rows} selection={{kind:'chart'}} onSelect={()=>{}} onAnnotationMove={()=>{}}/>;
  await act(async()=>root.render(view(chart)));
  expect(host.querySelector('[data-point-id="b1"] circle')?.getAttribute('fill')).toBe(chart.style.palette[1]);
  expect(host.querySelector('[data-point-id="a1"]')).toBeNull();
  await act(async()=>root.render(view({...chart,groupIds:undefined})));
  expect(host.querySelector('[data-point-id="b1"] circle')?.getAttribute('fill')).toBe(chart.style.palette[1]);
});
