// @vitest-environment jsdom
import {act} from 'react';
import {createRoot} from 'react-dom/client';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import App from './App';
import OutlierPanel from './OutlierPanel';
import {createProject,outlierFingerprint} from './project';
import type {OutlierResult} from './types';
let host:HTMLDivElement,root:ReturnType<typeof createRoot>;
beforeEach(()=>{localStorage.clear();vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);vi.stubGlobal('fetch',vi.fn(async()=>({ok:true,json:async()=>({suggestions:[],warnings:[]})})));vi.stubGlobal('URL',Object.assign(URL,{createObjectURL:vi.fn(()=> 'blob:fixture'),revokeObjectURL:vi.fn()}));vi.spyOn(HTMLAnchorElement.prototype,'click').mockImplementation(()=>{});host=document.createElement('div');document.body.append(host);root=createRoot(host)});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();vi.restoreAllMocks();vi.unstubAllGlobals()});
async function click(selector:string){const element=host.querySelector<HTMLElement>(selector);expect(element).not.toBeNull();await act(async()=>element!.click())}
it('autosave OFF preserves the last saved project; ON checkpoints edits; manual saving works while OFF',async()=>{
 await act(async()=>root.render(<App/>));const open=[...host.querySelectorAll('button')].find(b=>b.textContent?.includes('Treatment response')&&b.className.includes('figure-item'))!;await act(async()=>open.click());
 const key='plotstatlab.project.v1',original=localStorage.getItem(key);
 await click('input[role=switch]');expect(localStorage.getItem('plotstatlab.settings.autosave')).toBe('false');
 await click('button[aria-label="Palette 1"]');expect(localStorage.getItem(key)).toBe(original);expect(host.textContent).toContain('Unsaved changes');
 const leave=new Event('beforeunload',{cancelable:true});window.dispatchEvent(leave);expect(leave.defaultPrevented).toBe(true);
 await click('input[role=switch]');expect(localStorage.getItem(key)).not.toBe(original);
 await click('input[role=switch]');await click('button[aria-label="Palette 2"]');const beforeManual=localStorage.getItem(key);
 const save=[...host.querySelectorAll('button')].find(b=>b.textContent==='Save workspace')!;await act(async()=>save.click());
 expect(localStorage.getItem(key)).not.toBe(beforeManual);expect(host.textContent).not.toContain('Unsaved changes');
});
it('data input accepts negative decimals without replacing intermediate typing with numbers',async()=>{
 await act(async()=>root.render(<App/>));const open=[...host.querySelectorAll('button')].find(b=>b.textContent?.includes('Treatment response')&&b.className.includes('figure-item'))!;await act(async()=>open.click());const dataButton=[...host.querySelectorAll('button')].find(b=>b.textContent==='Data')!;await act(async()=>dataButton.click());
 const cell=host.querySelector<HTMLInputElement>('input[aria-label="Control, row 1"]')!;expect(cell).not.toBeNull();
 await act(async()=>{cell.value='-28.5';cell.dispatchEvent(new FocusEvent('focusout',{bubbles:true}))});
 const saved=JSON.parse(localStorage.getItem('plotstatlab.project.v1')!);expect(saved.groups[0].observations[0].value).toBe(-28.5);
});
it('outlier results show their actual parameters and become stale after method or Q changes',async()=>{
 const groups=createProject().groups;
 const result:OutlierResult={method:'rout',methodLabel:'ROUT',engine:'SciPy',fingerprint:outlierFingerprint(groups),createdAt:new Date().toISOString(),parameters:{q:.01,alpha:.05},groups:[],warnings:[],reference:'fixture'};
 await act(async()=>root.render(<OutlierPanel groups={groups} result={result} onResult={()=>{}} onSelectPoint={()=>{}} onExcludedChange={()=>{}}/>));
 expect(host.textContent).toContain('Q = 1%');expect(host.textContent).not.toContain('rerun detection');
 const select=host.querySelector<HTMLSelectElement>('select[aria-label="Outlier Q"]')!;await act(async()=>{select.value='.05';select.dispatchEvent(new Event('change',{bubbles:true}))});
 expect(host.textContent).toContain('settings changed — rerun detection');expect(host.textContent).toContain('Q = 1%');
});
