// @vitest-environment jsdom
import {act} from 'react';
import {createRoot} from 'react-dom/client';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {AdvancedDataPanel} from './AdvancedPanel';
import {groupsFromAdvanced,rowsForDataset} from './advancedData';
import {createProject} from './project';
import type {AdvancedRow} from './advancedTypes';
import type {Dataset} from './types';

let host:HTMLDivElement,root:ReturnType<typeof createRoot>;
beforeEach(()=>{vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);host=document.createElement('div');document.body.append(host);root=createRoot(host)});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();vi.unstubAllGlobals()});
const control=(label:string)=>host.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)!;
const button=(label:string)=>[...host.querySelectorAll<HTMLButtonElement>('button')].find(element=>element.textContent===label)!;
async function click(element:HTMLElement){expect(element).toBeTruthy();await act(async()=>element.click())}
async function setup(count:number){
 const rows:AdvancedRow[]=Array.from({length:count},(_,index)=>({id:`point-${index+1}`,x:index,y:index+10,group:'Measurements',subject:`sample-${index+1}`,label:`Sample ${index+1}`}));
 let dataset:Dataset={id:'d',name:'Advanced measurements',groups:groupsFromAdvanced(rows),advancedRows:rows,analysisConfig:createProject().analysisConfig};
 const changed=vi.fn((next:AdvancedRow[])=>{dataset={...dataset,advancedRows:next,groups:next.length?groupsFromAdvanced(next):dataset.groups.map(group=>({...group,observations:[]}))};render()});
 const render=()=>root.render(<AdvancedDataPanel dataset={dataset} onChange={changed} onAdd={()=>{}}/>);
 await act(async()=>render());return {changed,current:()=>rowsForDataset(dataset)};
}

it('removes selected observations together while retaining unselected IDs and measurements',async()=>{
 const {changed,current}=await setup(4),before=current();
 await click(control('Select observation 1'));await click(control('Select observation 3'));
 expect(changed).not.toHaveBeenCalled();expect(host.textContent).toContain('2 of 4 rows selected');expect(control('Select all advanced observations').indeterminate).toBe(true);
 await click(button('Remove selected rows'));
 expect(changed).toHaveBeenCalledTimes(1);expect(current().map(row=>row.id)).toEqual(['point-2','point-4']);
 expect(current()).toEqual([before[1],before[3]]);expect(host.textContent).toContain('0 of 2 rows selected');expect(button('Remove selected rows').disabled).toBe(true);
});

it('selects all observations across pages and can remove every row in one undoable callback',async()=>{
 const {changed,current}=await setup(250);
 expect(host.querySelectorAll('tbody tr')).toHaveLength(100);await click(control('Select all advanced observations'));
 expect(host.textContent).toContain('250 of 250 rows selected');expect(control('Select all advanced observations').checked).toBe(true);
 await click(button('Remove selected rows'));
 expect(changed).toHaveBeenCalledTimes(1);expect(changed.mock.calls[0][0]).toEqual([]);expect(current()).toEqual([]);expect(host.querySelectorAll('tbody tr')).toHaveLength(0);
 expect(control('Select all advanced observations').disabled).toBe(true);expect(button('Add observation').disabled).toBe(false);
});

it('excludes and restores a selected row without deleting its original observation',async()=>{
 const {changed,current}=await setup(3),before=current();await click(control('Select observation 2'));
 await click(button('Exclude selected'));
 expect(changed).toHaveBeenCalledTimes(1);expect(current()).toHaveLength(3);expect(current()[1]).toEqual({...before[1],excluded:true});expect(current()[0]).toEqual(before[0]);expect(current()[2]).toEqual(before[2]);
 await click(button('Restore selected'));
 expect(changed).toHaveBeenCalledTimes(2);expect(current()).toEqual(before);expect(control('Select observation 2').checked).toBe(true);
});
