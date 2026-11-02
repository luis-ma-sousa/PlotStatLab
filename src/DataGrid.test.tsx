// @vitest-environment jsdom
import {act} from 'react';
import {createRoot} from 'react-dom/client';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import DataGrid,{applyGridPaste,dataTableText,gridSubjects} from './DataGrid';
import {parseAdvancedCsv} from './advancedData';
import {parseCsv,parseProject,createProject,serializeProject,dataFingerprint} from './project';
import type {Group} from './types';
let host:HTMLDivElement,root:ReturnType<typeof createRoot>;
beforeEach(()=>{vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);host=document.createElement('div');document.body.append(host);root=createRoot(host)});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();vi.unstubAllGlobals()});

it('pastes a rectangular range with decimal commas while preserving existing IDs and exclusions',()=>{
 const groups=parseCsv('Subject;A;B\ns1;1;2\ns2;3;4');groups[0].observations[0].excluded=true;
 const next=applyGridPaste(groups,gridSubjects(groups),{row:0,column:1},'1,5\t2,5\n3,5\t4,5');
 expect(next[0].observations[0]).toMatchObject({id:groups[0].observations[0].id,value:1.5,excluded:true});
 expect(next[1].observations.map(o=>o.value)).toEqual([2.5,4.5]);expect(groups[0].observations[0].value).toBe(1);
});
it('treats typed or pasted decimal-comma cells as one number and keeps adjacent cells intact',()=>{
 const groups=parseCsv('A,B\n1,2\n3,4');
 const next=applyGridPaste(groups,gridSubjects(groups),{row:0,column:1},'1,25\n3,75');
 expect(next[0].observations.map(o=>o.value)).toEqual([1.25,3.75]);expect(next[1].observations.map(o=>o.value)).toEqual([2,4]);
});
it('adds measurement columns and labeled rows from a spreadsheet selection',()=>{
 const groups:Group[]=[{id:'a',name:'A',observations:[]}];
 const next=applyGridPaste(groups,[],{row:0,column:0},'Mouse 1\t2\t3\nMouse 2\t4\t5');
 expect(next).toHaveLength(2);expect(next[1].observations.map(o=>[o.subject,o.value])).toEqual([['Mouse 1',3],['Mouse 2',5]]);
});
it('rejects an invalid range atomically and never treats text as zero',()=>{
 const groups=parseCsv('A,B\n1,2\n3,4'),before=JSON.stringify(groups);
 expect(()=>applyGridPaste(groups,gridSubjects(groups),{row:0,column:1},'8\t9\n10\tbad')).toThrow('No cells were changed');expect(JSON.stringify(groups)).toBe(before);
});
it('exports wide clipboard tables and long CSV preserving explicit exclusions and label columns',()=>{
 const groups=parseCsv('Subject,Sex,A,B\ns1,female,1,2\ns2,male,3,4');groups[0].observations[0].excluded=true;
 expect(parseCsv(dataTableText(groups,'wide','\t'))[1].observations.map(o=>o.value)).toEqual([2,4]);
 const rows=parseAdvancedCsv(dataTableText(groups,'long'));expect(rows[0]).toMatchObject({group:'A',subject:'s1',y:1,excluded:true,labels:{Sex:'female'}});expect(rows[1].excluded).toBe(false);
 groups[0].observations[0].labels={Group:'descriptive label'};expect(()=>parseAdvancedCsv(dataTableText(groups,'long'))).not.toThrow();
});
it('preserves descriptive columns and excludes values visibly through the context menu',async()=>{
 let groups=parseCsv('Subject,Sex,A,B\ns1,female,1,2\ns2,male,3,4');
 const render=()=>root.render(<DataGrid groups={groups} onChange={next=>{groups=next;render()}}/>);
 await act(async()=>render());expect(host.querySelector('input[aria-label="Sex, row 1"]')).not.toBeNull();
 const cell=host.querySelector('input[aria-label="A, row 1"]')!;
 await act(async()=>cell.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,clientX:30,clientY:60})));
 const exclude=[...host.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')].find(button=>button.textContent==='Exclude value from analysis')!;
 await act(async()=>exclude.click());expect(groups[0].observations[0].excluded).toBe(true);expect(host.querySelector('.data-grid-cell-excluded input')?.getAttribute('aria-label')).toBe('A, row 1');expect(host.textContent).toContain('1 excluded value');
 const restore=host.querySelector<HTMLButtonElement>('button[aria-label="Restore A, row 1"]')!;await act(async()=>restore.click());expect(groups[0].observations[0].excluded).toBe(false);
 const project=createProject();project.groups=groups;expect(parseProject(serializeProject(project)).groups[0].observations[0].labels).toEqual({Sex:'female'});
});
it('lets a user name an empty row before typing numbers and paste a numeric block directly into a cell',async()=>{
 let groups:Group[]=[{id:'a',name:'A',observations:[]},{id:'b',name:'B',observations:[]}];
 const render=()=>root.render(<DataGrid groups={groups} onChange={next=>{groups=next;render()}}/>);
 await act(async()=>render());const label=host.querySelector<HTMLInputElement>('input[aria-label="Subject ID 1"]')!;
 await act(async()=>{label.value='Mouse one';label.dispatchEvent(new FocusEvent('focusout',{bubbles:true}))});
 const cell=host.querySelector<HTMLInputElement>('input[aria-label="A, row 1"]')!;
 const paste=new Event('paste',{bubbles:true,cancelable:true});Object.defineProperty(paste,'clipboardData',{value:{getData:()=> '2\t3\n4\t5'}});
 await act(async()=>cell.dispatchEvent(paste));expect(groups[0].observations[0].subject).toBe('Mouse one');expect(groups[1].observations.map(o=>o.value)).toEqual([3,5]);
});
it('fingerprints only selected groups and retains legacy fingerprints for absent selection',()=>{
 const p=createProject(),config={...p.analysisConfig,groupIds:p.groups.slice(0,2).map(g=>g.id)},fp=dataFingerprint(p.groups,config),changed=structuredClone(p.groups);changed[3].observations[0].value=999;
 expect(dataFingerprint(changed,config)).toBe(fp);changed[0].observations[0].value=888;expect(dataFingerprint(changed,config)).not.toBe(fp);
 expect(dataFingerprint(p.groups,{...config,groupIds:[...config.groupIds].reverse()})).toBe(fp);
});
