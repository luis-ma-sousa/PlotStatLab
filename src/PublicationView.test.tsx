// @vitest-environment jsdom
import {act,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import PublicationView from './PublicationView';
import {createChart,createProject} from './project';
import {normalizeWorkspace} from './workspace';
import {defaultPublication} from './publication';
import type {Project} from './types';

let host:HTMLDivElement,root:ReturnType<typeof createRoot>,latest:Project,downloads:Blob[];
beforeEach(()=>{vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);downloads=[];vi.stubGlobal('URL',class extends URL {static createObjectURL(blob:Blob){downloads.push(blob);return 'blob:publication-test'}static revokeObjectURL(){}});vi.spyOn(HTMLAnchorElement.prototype,'click').mockImplementation(()=>{});host=document.createElement('div');document.body.append(host);root=createRoot(host)});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();vi.restoreAllMocks();vi.unstubAllGlobals()});
function initial(){const project=normalizeWorkspace(createProject()),other={...createChart(),datasetId:project.activeDatasetId,name:'Second figure'};return {...project,charts:[project.charts[0],other],publication:defaultPublication([project.charts[0].id,other.id])}}
function Harness({initialProject}:{initialProject:Project}){const [project,setProject]=useState(initialProject);latest=project;return <PublicationView project={project} onChange={publication=>setProject({...project,publication})}/>}
async function button(name:string){const element=[...host.querySelectorAll('button')].find(b=>b.textContent===name);expect(element).not.toBeUndefined();await act(async()=>element!.click())}
function text(blob:Blob):Promise<string>{return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=reject;reader.readAsText(blob)})}

it('persists panel reordering and exports the displayed composition as editable physical-size SVG',async()=>{
 const project=initial();await act(async()=>root.render(<Harness initialProject={project}/>));const move=host.querySelector<HTMLButtonElement>('button[aria-label="Move Second figure earlier"]')!;await act(async()=>move.click());expect(latest.publication!.chartIds[0]).toBe(project.charts[1].id);
 await button('Export SVG');expect(downloads).toHaveLength(1);const doc=new DOMParser().parseFromString(await text(downloads[0]),'image/svg+xml');expect(doc.querySelector('parsererror')).toBeNull();expect(doc.documentElement.getAttribute('width')).toBe('180mm');expect(doc.querySelector('#PSL-panel-A-PSL-figure title')?.textContent).toBe(project.charts[1].title);expect(doc.querySelectorAll('[id^="PSL-panel-label-"]')).toHaveLength(2);expect(doc.querySelectorAll('[data-editor-only]')).toHaveLength(0);expect(latest.charts).toEqual(project.charts);
});

it('applies publication presets without changing the underlying figure or losing selected panels',async()=>{
 const project=initial();await act(async()=>root.render(<Harness initialProject={project}/>));const preset=[...host.querySelectorAll('select')][0];await act(async()=>{preset.value='nature-single';preset.dispatchEvent(new Event('change',{bubbles:true}))});expect(latest.publication!.widthMm).toBe(90);expect(latest.publication!.chartIds).toEqual(project.publication!.chartIds);expect(latest.charts).toEqual(project.charts);
 const labels=[...host.querySelectorAll('label')].find(l=>l.textContent?.includes('A / B / C'))!.querySelector('input')!;await act(async()=>labels.click());expect(latest.publication!.labels).toBe(false);expect(host.querySelector('[aria-label$="aligned panels"]')?.querySelectorAll('g > text[font-weight="700"]')).toHaveLength(0);
});
