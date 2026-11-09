// @vitest-environment jsdom
import {act} from 'react';
import {createRoot} from 'react-dom/client';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import DataGrid,{applyGridPaste,applyGridPasteWithRows,dataTableText,gridSubjects} from './DataGrid';
import {clearSelectedValues,excludeSelectedValues,mergeTableRows} from './gridSelection';
import type {DataTableRow} from './gridSelection';
import {parseAdvancedCsv} from './advancedData';
import {parseCsv,parseProject,createProject,serializeProject,dataFingerprint} from './project';
import {normalizeWorkspace} from './workspace';
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
it('finds a selected point after row 100, opens its page, and does not steal focus on subsequent edits',async()=>{
 let groups:Group[]=[{id:'g',name:'A',observations:Array.from({length:250},(_,index)=>({id:`point-${index+1}`,subject:`sample-${index+1}`,value:index+1}))}];
 const render=()=>root.render(<DataGrid groups={groups} onChange={()=>{}} focusPointId="point-225"/>);
 await act(async()=>render());
 expect(host.textContent).toContain('Rows 201–255');
 const selected=host.querySelector<HTMLInputElement>('td[data-observation-id="point-225"] input')!;expect(selected).not.toBeNull();expect(document.activeElement).toBe(selected);expect(selected.getAttribute('aria-label')).toBe('A, row 225');
 const other=host.querySelector<HTMLInputElement>('td[data-observation-id="point-226"] input')!;await act(async()=>other.focus());
 groups=groups.map(group=>({...group,observations:group.observations.map((point,index)=>index===0?{...point,value:1000}:point)}));await act(async()=>render());expect(document.activeElement).toBe(other);
});
it('clears a reversed range atomically while keeping unselected IDs, labels and exclusion flags',()=>{
 const groups=parseCsv('Subject,Label,A,B,C\ns1,Mouse one,1,2,3\ns2,Mouse two,4,5,6\ns3,Mouse three,7,8,9');groups[2].observations[1].excluded=true;
 const before=structuredClone(groups),rows=mergeTableRows(groups),range={anchor:{row:1,column:1},focus:{row:0,column:0}};
 const next=clearSelectedValues(groups,rows,range);
 expect(next[0].observations.map(point=>point.value)).toEqual([7]);expect(next[1].observations.map(point=>point.value)).toEqual([8]);expect(next[2]).toBe(groups[2]);expect(next[2].observations[1].excluded).toBe(true);expect(groups).toEqual(before);
 expect(rows[0]).toEqual({subject:'s1',labels:{Label:'Mouse one'}});
 expect(()=>clearSelectedValues(groups,rows,{anchor:{row:0,column:0},focus:{row:3,column:0}})).toThrow('No values were changed');expect(groups).toEqual(before);
 const excluded=excludeSelectedValues(groups,rows,range,true);expect(excluded[0].observations.map(point=>[point.value,point.excluded??false])).toEqual([[1,true],[4,true],[7,false]]);expect(excluded[0].observations[0].id).toBe(groups[0].observations[0].id);
});
it('offers visible multi-cell clear and keeps the cleared rows and labels after reopening the table',async()=>{
 let groups=parseCsv('Subject,Label,A,B\ns1,Mouse one,1,2\ns2,Mouse two,3,4\ns3,Mouse three,5,6'),tableRows:DataTableRow[]|undefined;
 const changed=vi.fn((next:Group[],rows?:DataTableRow[])=>{groups=next;tableRows=rows;render()});
 const render=()=>root.render(<DataGrid groups={groups} tableRows={tableRows} onChange={changed}/>);await act(async()=>render());
 const cell=(name:string)=>host.querySelector<HTMLInputElement>('input[aria-label="'+name+'"]')!;
 await act(async()=>cell('A, row 1').dispatchEvent(new MouseEvent('mousedown',{bubbles:true,button:0})));
 await act(async()=>cell('B, row 2').dispatchEvent(new MouseEvent('mousedown',{bubbles:true,button:0,shiftKey:true})));
 expect(host.textContent).toContain('4 cells selected');expect(host.querySelectorAll('td[data-range-selected=true]')).toHaveLength(4);
 const clear=[...host.querySelectorAll<HTMLButtonElement>('button')].find(button=>button.textContent==='Clear selected values')!;expect(clear.disabled).toBe(false);
 await act(async()=>clear.click());expect(changed).toHaveBeenCalledTimes(1);expect(groups[0].observations.map(point=>point.value)).toEqual([5]);expect(tableRows?.map(row=>row.subject)).toEqual(['s1','s2','s3']);
 expect(cell('A, row 1').value).toBe('');expect(cell('Label, row 1').value).toBe('Mouse one');expect(cell('B, row 3').value).toBe('6');
 await act(async()=>root.render(<DataGrid key="reopened" groups={groups} tableRows={tableRows} onChange={changed}/>));
 expect(cell('Subject ID 1').value).toBe('s1');expect(cell('A, row 1').value).toBe('');expect(cell('Label, row 2').value).toBe('Mouse two');
});
it('supports drag selection, one keyboard clear and one workspace Undo restoring every affected value',async()=>{
 const original=parseCsv('Subject,A,B\ns1,1,2\ns2,3,4\ns3,5,6');original[0].observations[0].excluded=true;
 let groups=structuredClone(original),tableRows=mergeTableRows(groups),calls=0;
 const undo=vi.fn(()=>{groups=structuredClone(original);render()});
 const render=()=>root.render(<DataGrid groups={groups} tableRows={tableRows} onChange={(next,rows)=>{calls++;groups=next;tableRows=rows!;render()}} onUndo={undo}/>);
 await act(async()=>render());const first=host.querySelector<HTMLInputElement>('input[aria-label="A, row 1"]')!,last=host.querySelector<HTMLInputElement>('input[aria-label="B, row 2"]')!;
 await act(async()=>{first.dispatchEvent(new MouseEvent('mousedown',{bubbles:true,button:0}));last.dispatchEvent(new MouseEvent('mouseover',{bubbles:true,buttons:1}));window.dispatchEvent(new MouseEvent('mouseup',{bubbles:true}))});
 expect(host.textContent).toContain('4 cells selected');
 const remove=new KeyboardEvent('keydown',{bubbles:true,cancelable:true,key:'Delete'});await act(async()=>first.dispatchEvent(remove));expect(remove.defaultPrevented).toBe(true);expect(calls).toBe(1);expect(groups[0].observations).toHaveLength(1);expect(tableRows).toHaveLength(3);
 const region=host.querySelector<HTMLElement>('[aria-label="Data cells"]')!;await act(async()=>region.dispatchEvent(new KeyboardEvent('keydown',{bubbles:true,cancelable:true,key:'z',metaKey:true})));expect(undo).toHaveBeenCalledTimes(1);expect(groups).toEqual(original);expect(host.querySelectorAll('.data-grid-cell-excluded')).toHaveLength(1);
});
it('selects and clears a whole column across pages without shifting rows or touching other columns',async()=>{
 let groups:Group[]=['A','B'].map((name,column)=>({id:name,name,observations:Array.from({length:250},(_,index)=>({id:name+'-'+index,subject:'s'+(index+1),value:index+column+1,labels:{Sample:'Mouse '+(index+1)}}))})),tableRows:DataTableRow[]|undefined;
 const untouched=structuredClone(groups[1]),changed=vi.fn((next:Group[],rows?:DataTableRow[])=>{groups=next;tableRows=rows;render()});
 const render=()=>root.render(<DataGrid groups={groups} tableRows={tableRows} onChange={changed}/>);await act(async()=>render());
 await act(async()=>host.querySelector<HTMLButtonElement>('button[aria-label="Select column A"]')!.click());expect(host.textContent).toContain('250 cells selected');
 await act(async()=>[...host.querySelectorAll<HTMLButtonElement>('button')].find(button=>button.textContent==='Clear selected values')!.click());expect(changed).toHaveBeenCalledTimes(1);expect(groups[0].observations).toHaveLength(0);expect(groups[1]).toEqual(untouched);expect(tableRows).toHaveLength(250);
 const next=()=>[...host.querySelectorAll<HTMLButtonElement>('button')].find(button=>button.textContent==='Next rows')!;await act(async()=>next().click());await act(async()=>next().click());
 expect(host.querySelector<HTMLInputElement>('input[aria-label="A, row 225"]')!.value).toBe('');expect(host.querySelector<HTMLInputElement>('input[aria-label="B, row 225"]')!.value).toBe('226');expect(host.querySelector<HTMLInputElement>('input[aria-label="Sample, row 225"]')!.value).toBe('Mouse 225');
});
it('keeps ordinary text editing and native text shortcuts separate from range commands',async()=>{
 let groups=parseCsv('A,B\n12,34\n56,78');const changed=vi.fn((next:Group[])=>{groups=next;render()});const undo=vi.fn();
 const render=()=>root.render(<DataGrid groups={groups} onChange={changed} onUndo={undo}/>);await act(async()=>render());const input=host.querySelector<HTMLInputElement>('input[aria-label="A, row 1"]')!;
 await act(async()=>input.dispatchEvent(new MouseEvent('mousedown',{bubbles:true,button:0})));
 const extend=new KeyboardEvent('keydown',{bubbles:true,cancelable:true,key:'ArrowRight',shiftKey:true});await act(async()=>input.dispatchEvent(extend));expect(host.textContent).toContain('2 cells selected');
 await act(async()=>{input.dispatchEvent(new MouseEvent('mousedown',{bubbles:true,button:0}));input.dispatchEvent(new MouseEvent('dblclick',{bubbles:true}))});
 const backspace=new KeyboardEvent('keydown',{bubbles:true,cancelable:true,key:'Backspace'}),selectText=new KeyboardEvent('keydown',{bubbles:true,cancelable:true,key:'a',metaKey:true}),nativeUndo=new KeyboardEvent('keydown',{bubbles:true,cancelable:true,key:'z',metaKey:true});
 await act(async()=>{input.dispatchEvent(backspace);input.dispatchEvent(selectText);input.dispatchEvent(nativeUndo)});expect(backspace.defaultPrevented).toBe(false);expect(selectText.defaultPrevented).toBe(false);expect(nativeUndo.defaultPrevented).toBe(false);expect(undo).not.toHaveBeenCalled();expect(changed).not.toHaveBeenCalled();
 await act(async()=>{input.value='1';input.dispatchEvent(new FocusEvent('focusout',{bubbles:true}))});expect(groups[0].observations[0].value).toBe(1);expect(groups[1].observations[0].value).toBe(34);
});
it('pastes into preserved empty rows without losing their labels',()=>{
 const groups=parseCsv('Subject,Label,A,B\ns1,Mouse one,1,2\ns2,Mouse two,3,4'),rows=mergeTableRows(groups),cleared=clearSelectedValues(groups,rows,{anchor:{row:0,column:0},focus:{row:0,column:1}});
 const next=applyGridPasteWithRows(cleared,rows.map(row=>row.subject),{row:0,column:2},'9\t10',['Label'],rows);
 expect(next.tableRows[0]).toEqual({subject:'s1',labels:{Label:'Mouse one'}});expect(next.groups[0].observations.find(point=>point.subject==='s1')).toMatchObject({value:9,labels:{Label:'Mouse one'}});expect(dataTableText(next.groups,'wide',',',next.tableRows)).toContain('s1,Mouse one,9,10');
});
it('copies a rectangular numeric selection and cuts it as one reversible edit',async()=>{
 let groups=parseCsv('Subject,A,B\ns1,1,2\ns2,3,4'),tableRows:DataTableRow[]|undefined;const changed=vi.fn((next:Group[],rows?:DataTableRow[])=>{groups=next;tableRows=rows;render()});
 const render=()=>root.render(<DataGrid groups={groups} tableRows={tableRows} onChange={changed}/>);await act(async()=>render());
 const first=host.querySelector<HTMLInputElement>('input[aria-label="A, row 1"]')!,last=host.querySelector<HTMLInputElement>('input[aria-label="B, row 2"]')!;
 await act(async()=>{first.dispatchEvent(new MouseEvent('mousedown',{bubbles:true,button:0}));last.dispatchEvent(new MouseEvent('mousedown',{bubbles:true,button:0,shiftKey:true}))});
 const setData=vi.fn(),copy=new Event('copy',{bubbles:true,cancelable:true});Object.defineProperty(copy,'clipboardData',{value:{setData}});await act(async()=>first.dispatchEvent(copy));expect(setData).toHaveBeenCalledWith('text/plain','1\t2\n3\t4');expect(copy.defaultPrevented).toBe(true);expect(changed).not.toHaveBeenCalled();
 const cut=new Event('cut',{bubbles:true,cancelable:true});Object.defineProperty(cut,'clipboardData',{value:{setData}});await act(async()=>first.dispatchEvent(cut));expect(changed).toHaveBeenCalledTimes(1);expect(groups.every(group=>group.observations.length===0)).toBe(true);expect(tableRows?.map(row=>row.subject)).toEqual(['s1','s2']);
});
it('restores legacy row identities after workspace Undo and safely clears selections outside the restored table',async()=>{
 let groups=parseCsv('Subject,A\ns1,1\ns2,2'),tableRows:DataTableRow[]|undefined;
 const render=()=>root.render(<DataGrid groups={groups} tableRows={tableRows} onChange={(next,rows)=>{groups=next;tableRows=rows;render()}}/>);await act(async()=>render());
 const label=host.querySelector<HTMLInputElement>('input[aria-label="Subject ID 1"]')!;await act(async()=>{label.value='Renamed, sample';label.dispatchEvent(new FocusEvent('focusout',{bubbles:true}))});expect(tableRows?.[0].subject).toBe('Renamed, sample');
 groups=parseCsv('Subject,A\ns1,1\ns2,2');tableRows=undefined;await act(async()=>render());expect(host.querySelector<HTMLInputElement>('input[aria-label="Subject ID 1"]')!.value).toBe('s1');expect(host.querySelector<HTMLInputElement>('input[aria-label="A, row 1"]')!.value).toBe('1');
 groups=[{id:'a',name:'A',observations:Array.from({length:200},(_,index)=>({id:'p'+index,subject:'s'+index,value:index}))}];await act(async()=>render());await act(async()=>host.querySelector<HTMLButtonElement>('button[aria-label="Select column A"]')!.click());expect(host.textContent).toContain('200 cells selected');
 groups=[{id:'a',name:'A',observations:[]}];tableRows=undefined;await act(async()=>render());expect(host.textContent).toContain('Select values to edit together');expect(host.querySelector('input[aria-label="A, row 1"]')).not.toBeNull();
});
it('never overwrites an existing subject when adding values to a blank row with a similar generated label',async()=>{
 let groups:Group[]=[{id:'a',name:'A',observations:[{id:'existing',subject:'row-3',value:99}]}],tableRows:DataTableRow[]|undefined;
 const render=()=>root.render(<DataGrid groups={groups} tableRows={tableRows} onChange={(next,rows)=>{groups=next;tableRows=rows;render()}}/>);await act(async()=>render());
 const input=host.querySelector<HTMLInputElement>('input[aria-label="A, row 3"]')!;await act(async()=>{input.value='7';input.dispatchEvent(new FocusEvent('focusout',{bubbles:true}))});
 expect(groups[0].observations.find(point=>point.id==='existing')?.value).toBe(99);expect(groups[0].observations).toHaveLength(2);expect(new Set(tableRows?.map(row=>row.subject)).size).toBe(tableRows?.length);expect(host.querySelector<HTMLInputElement>('input[aria-label="A, row 1"]')!.value).toBe('99');
});
it('shares unique generated row IDs between observations and metadata when a paste extends beyond the displayed blanks',()=>{
 for(const originalSubject of ['row-9','9']){
  const groups:Group[]=[{id:'a',name:'A',observations:[{id:'existing',subject:originalSubject,value:99}]}],stored=mergeTableRows(groups),subjects=[originalSubject,...Array.from({length:7},(_,index)=>'row-'+(index+2))];
  const next=applyGridPasteWithRows(groups,subjects,{row:1,column:1},Array.from({length:9},(_,index)=>String(index+1)).join('\n'),[],stored);
  expect(next.tableRows).toHaveLength(10);expect(new Set(next.tableRows.map(row=>row.subject)).size).toBe(10);expect(next.groups[0].observations).toHaveLength(10);expect(next.groups[0].observations.find(point=>point.id==='existing')).toMatchObject({subject:originalSubject,value:99});expect(next.tableRows.map(row=>row.subject)).toEqual(next.groups[0].observations.map(point=>point.subject));
  const project=normalizeWorkspace(createProject());project.groups=next.groups;project.analysisConfig={...project.analysisConfig,control:'a'};project.datasets![0]={...project.datasets![0],groups:next.groups,analysisConfig:project.analysisConfig,tableRows:next.tableRows};
  expect(parseProject(serializeProject(project)).datasets![0].tableRows).toEqual(next.tableRows);
 }
});
it('commits a single-cell keyboard clear as one real deletion and preserves its row and labels after remount',async()=>{
 let groups=parseCsv('Subject,Label,A,B\ns1,Mouse one,12,34\ns2,Mouse two,56,78'),tableRows:DataTableRow[]|undefined;
 const changed=vi.fn((next:Group[],rows?:DataTableRow[])=>{groups=next;tableRows=rows;render()});
 const render=()=>root.render(<DataGrid groups={groups} tableRows={tableRows} onChange={changed}/>);await act(async()=>render());
 const input=host.querySelector<HTMLInputElement>('input[aria-label="A, row 1"]')!;
 await act(async()=>{input.dispatchEvent(new MouseEvent('mousedown',{bubbles:true,button:0}));input.dispatchEvent(new KeyboardEvent('keydown',{bubbles:true,key:'Backspace'}));input.value='';input.dispatchEvent(new FocusEvent('focusout',{bubbles:true}))});
 expect(changed).toHaveBeenCalledTimes(1);expect(groups[0].observations.map(point=>point.value)).toEqual([56]);expect(groups[1].observations.map(point=>point.value)).toEqual([34,78]);expect(tableRows?.[0]).toEqual({subject:'s1',labels:{Label:'Mouse one'}});
 await act(async()=>root.render(<DataGrid key="reopened" groups={groups} tableRows={tableRows} onChange={changed}/>));expect(host.querySelector<HTMLInputElement>('input[aria-label="A, row 1"]')!.value).toBe('');expect(host.querySelector<HTMLInputElement>('input[aria-label="Label, row 1"]')!.value).toBe('Mouse one');
});
it('fingerprints only selected groups and retains legacy fingerprints for absent selection',()=>{
 const p=createProject(),config={...p.analysisConfig,groupIds:p.groups.slice(0,2).map(g=>g.id)},fp=dataFingerprint(p.groups,config),changed=structuredClone(p.groups);changed[3].observations[0].value=999;
 expect(dataFingerprint(changed,config)).toBe(fp);changed[0].observations[0].value=888;expect(dataFingerprint(changed,config)).not.toBe(fp);
 expect(dataFingerprint(p.groups,{...config,groupIds:[...config.groupIds].reverse()})).toBe(fp);
});
