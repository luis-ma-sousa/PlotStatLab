// @vitest-environment jsdom
import {renderToStaticMarkup} from 'react-dom/server';
import {describe, expect, it} from 'vitest';
import AdvancedChartView from './AdvancedChartView';
import {createChart} from './project';
import {serializeFigureSvg} from './export';
import type {AdvancedResult, AdvancedRow} from './advancedTypes';
import type {Chart, Group} from './types';

const rows: AdvancedRow[] = [
  {id:'a1',factorA:'Control',factorB:'Vehicle',x:1,y:2,event:true,lower:1,upper:3,label:'First'},
  {id:'a2',factorA:'Control',factorB:'Vehicle',x:2,y:3,event:false,lower:2,upper:4,label:'Second'},
  {id:'b1',factorA:'Treatment',factorB:'Active',x:3,y:5,event:true,lower:4,upper:6,label:'Third'},
  {id:'b2',factorA:'Treatment',factorB:'Active',x:4,y:6,event:false,lower:5,upper:7,label:'Fourth'},
];
const groups: Group[] = [{id:'control',name:'Control',observations:rows.slice(0,2).map(row=>({id:row.id,value:row.y}))},{id:'treatment',name:'Treatment',observations:rows.slice(2).map(row=>({id:row.id,value:row.y}))}];
function render(type: Chart['type'], data = rows, result?: AdvancedResult, analysisStale = false, extra: Partial<Chart> = {}) {
  const chart = {...createChart(type),title:'X^{2} and H_{2}O',xLabel:'',yLabel:'',pointStyles:{a1:{color:'#aa1177',size:9,opacity:.4,stroke:'#112233',strokeWidth:2,shape:'diamond' as const}},...extra};
  const output = renderToStaticMarkup(<AdvancedChartView chart={chart} rows={data} groups={groups} result={result} selection={{kind:'point',id:'a1',groupId:'control'}} onSelect={()=>{}} analysisStale={analysisStale}/>);
  document.body.innerHTML = output;
  return {chart,svg:document.querySelector<SVGSVGElement>('svg')!,output};
}
const fit: AdvancedResult = {method:'linear-regression',methodLabel:'Linear regression',engine:'fixture',fingerprint:'fixture',createdAt:'2026-11-02',parameters:{},tables:[],estimates:{},warnings:[],reference:'fixture',series:[{name:'Fit',kind:'fit',points:[{x:1,y:2,lower:1,upper:3},{x:4,y:6,lower:5,upper:7}]}]};

describe('advanced chart catalog and editable export', () => {
  it.each(['grouped','regression','dose-response','kaplan-meier','forest','bland-altman'] as const)('keeps point IDs and individual styles in %s', type => {
    const {svg,chart,output} = render(type);
    expect(output).not.toMatch(/NaN|Infinity/);
    expect(svg.querySelectorAll('[data-point-id]')).toHaveLength(4);
    const point = svg.querySelector('[data-point-id="a1"]')!;
    expect(point.getAttribute('data-group-id')).toBe('control');
    const symbol = point.querySelector('path')!;
    expect(symbol.getAttribute('fill')).toBe('#aa1177'); expect(symbol.getAttribute('opacity')).toBe('0.4'); expect(symbol.getAttribute('stroke-width')).toBe('2');
    const xml = new DOMParser().parseFromString(serializeFigureSvg(chart,svg),'image/svg+xml');
    expect(xml.querySelector('parsererror')).toBeNull();
    expect(xml.querySelector('#PSL-point-a1 path')?.getAttribute('fill')).toBe('#aa1177');
    expect(xml.querySelector('image,foreignObject,use')).toBeNull();
    expect(xml.querySelector('[data-editor-only]')).toBeNull();
    expect(xml.querySelector('tspan[baseline-shift="super"]')?.textContent).toBe('2');
    expect(xml.querySelector('tspan[baseline-shift="sub"]')?.textContent).toBe('2');
  });
  it('does not plot invalid p-values or invent a log value for an underflowed zero', () => {
    const {svg,output} = render('volcano',[{id:'a1',x:2,y:.001},{id:'a2',x:-2,y:.01},{id:'b1',x:0,y:.5},{id:'zero',x:5,y:0}]);
    expect(svg.querySelectorAll('[data-point-id]')).toHaveLength(3); expect(output).not.toMatch(/NaN|Infinity/); expect(output).toContain('Zero p-values need a documented lower bound.');
  });
  it('shows fitted confidence bands only for a compatible and current analysis', () => {
    expect(render('regression',rows,fit).svg.querySelector('[data-series-name="Fit"]')).not.toBeNull();
    expect(render('regression',rows,fit,true).svg.querySelector('[data-series-name="Fit"]')).toBeNull();
    expect(render('dose-response',rows,fit).svg.querySelector('[data-series-name="Fit"]')).toBeNull();
    const dose = {...fit,method:'dose-response'};
    expect(render('dose-response',rows,dose).svg.querySelector('[data-series-name="Fit"]')).not.toBeNull();
  });
  it('does not emit invalid geometry for nonpositive data or confidence bounds on logarithmic axes', () => {
    const style = {...createChart().style,yScale:'log' as const};
    const crossing = {...fit,series:[{...fit.series![0],points:[{x:1,y:2,lower:-1,upper:3},{x:4,y:6,lower:5,upper:7}]}]};
    expect(render('regression',rows,crossing,false,{style}).output).not.toMatch(/NaN|Infinity|undefined/);
    expect(render('grouped',[{id:'a1',factorA:'A',factorB:'B',y:-10},{id:'a2',factorA:'A',factorB:'B',y:-5}],undefined,false,{style}).output).not.toMatch(/NaN|Infinity|undefined/);
    expect(render('kaplan-meier',rows,undefined,false,{advancedOptions:{xScale:'log'}}).output).not.toMatch(/NaN|Infinity|undefined/);
  });
  it.each(['grouped','regression','dose-response','kaplan-meier','forest','bland-altman','volcano'] as const)('renders %s with an empty table without invalid vector geometry', type => {
    const {output} = render(type,[]); expect(output).not.toMatch(/NaN|Infinity/); expect(output).toContain('Advanced data');
  });
});
