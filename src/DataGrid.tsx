import {useEffect,useRef,useState} from 'react';
import type {ClipboardEvent,KeyboardEvent,MouseEvent as ReactMouseEvent} from 'react';
import Papa from 'papaparse';
import type {Group,Observation,Selection} from './types';
import {exportDownload,tableNumber} from './project';
import {clearSelectedValues,excludeSelectedValues,mergeTableRows,rangeBounds,rangeContains,rangeSize,selectedValueCount} from './gridSelection';
import type {CellRange,DataTableRow,NumericCell} from './gridSelection';
import './dataGrid.css';

type GridAddress={row:number;column:number};
type Props={groups:Group[];tableRows?:DataTableRow[];onChange:(groups:Group[],tableRows?:DataTableRow[])=>void;onSelection?:(selection:Selection)=>void;onPaste?:()=>void;onNew?:()=>void;showX?:boolean;focusPointId?:string;onUndo?:()=>void;onRedo?:()=>void};
const uid=()=>crypto.randomUUID();
export const gridSubjects=(groups:Group[])=>[...new Set(groups.flatMap(g=>g.observations.map(o=>o.subject??o.id)))];
const observation=(group:Group,subject:string)=>group.observations.find(o=>(o.subject??o.id)===subject);
const isMissing=(value:string)=>/^(?:|na|n\/a|nan|null|missing)$/i.test(value.trim());

export function dataTableText(groups:Group[],format:'wide'|'long'='wide',delimiter=",",tableRows:DataTableRow[]=[]):string {
 const rows=mergeTableRows(groups,tableRows),labelKeys=[...new Set(rows.flatMap(row=>Object.keys(row.labels??{})))];
 const hasX=groups.some(g=>g.observations.some(o=>o.x!==undefined));
 const reserved=new Set((format==='long'?['group','subject','subjectid','subject_id','id','label','x','y','value','response','time','estimate','p','pvalue','p_value','factora','factor_a','factorb','factor_b','event','status','censored','excluded','lower','upper','lo','hi']:['subject',...groups.map(g=>g.name.toLowerCase())]));
 const labelHeaders=labelKeys.map(key=>{let name=key;while(reserved.has(name.toLowerCase()))name=`Label: ${name}`;reserved.add(name.toLowerCase());return name});
 if(format==='long')return Papa.unparse([['Group','Subject',...labelHeaders,'Y',...(hasX?['X']:[]),'Excluded'],...groups.flatMap(g=>g.observations.map(o=>[g.name,o.subject??o.id,...labelKeys.map(key=>o.labels?.[key]??rows.find(row=>row.subject===(o.subject??o.id))?.labels?.[key]??''),o.value,...(hasX?[o.x??'']:[]),o.excluded?'true':'false']))],{delimiter,newline:'\n'});
 return Papa.unparse([['Subject',...labelHeaders,...groups.map(g=>g.name)],...rows.map(row=>[row.subject,...labelKeys.map(key=>row.labels?.[key]??''),...groups.map(g=>observation(g,row.subject)?.value??'')])],{delimiter,newline:'\n'});
}

function clipboardRows(text:string,labelColumn=false):string[][]{
 const normalized=text.replace(/\r\n/g,'\n'),lines=normalized.split('\n');
 const singleColumn=!text.includes('\t')&&!text.includes(';')&&(labelColumn||lines.every(line=>isMissing(line)||tableNumber(line)!==undefined));
 const parsed=singleColumn?{data:lines.map(line=>[line]),errors:[]}:Papa.parse<string[]>(normalized,{skipEmptyLines:false,delimiter:text.includes('\t')?'\t':text.includes(';')?';':undefined});
 if(parsed.errors.some(e=>e.code!=='UndetectableDelimiter'))throw new Error('This clipboard table could not be read. Try copying the cells again.');
 const rows=parsed.data;while(rows.length&&rows.at(-1)!.every(v=>v===''))rows.pop();
 if(rows.length>100000||rows.some(row=>row.length>512)||rows.reduce((count,row)=>count+row.length,0)>1000000)throw new Error('Paste a smaller selection (up to 100,000 rows, 512 columns and 1,000,000 cells).');
 return rows;
}

/** Pasted ranges can extend beyond the currently displayed blank rows. */
function extendSubjects(subjects:string[],count:number):string[]{
 const names=[...subjects],used=new Set(names);
 for(let index=names.length;index<count;index++){let subject='row-'+(index+1);while(used.has(subject))subject+='-new';names.push(subject);used.add(subject)}
 return names;
}

/** Paste is validated before applying any edit, so an invalid range cannot partially overwrite data. */
export function applyGridPaste(groups:Group[],subjects:string[],start:GridAddress,text:string,labelKeys:string[]=[]):Group[]{
 const rows=clipboardRows(text,start.column<1+labelKeys.length);
 if(!rows.length)return groups;
 const next=structuredClone(groups),names=extendSubjects(subjects,start.row+rows.length),measurementOffset=1+labelKeys.length;
 for(let r=0;r<rows.length;r++){
  const rowIndex=start.row+r;let subject=names[rowIndex];
  for(let c=0;c<rows[r].length;c++){
   const column=start.column+c,raw=rows[r][c].trim();
   if(column===0){
    if(!raw)continue;
    if(names.some((v,i)=>v===raw&&i!==rowIndex))throw new Error(`Row label “${raw}” is already in use. Pairing needs unique row IDs.`);
    next.forEach(group=>group.observations.forEach(o=>{if((o.subject??o.id)===subject)o.subject=raw}));subject=raw;names[rowIndex]=raw;
   }else if(column<measurementOffset){
    const key=labelKeys[column-1];next.forEach(group=>group.observations.forEach(o=>{if((o.subject??o.id)===subject)o.labels={...o.labels,[key]:raw}}));
   }else{
    const value=isMissing(raw)?undefined:tableNumber(raw);
    if(!isMissing(raw)&&value===undefined)throw new Error(`“${raw}” is text. Paste it in Row label or a label column. For a table with headers, use “Paste table”. No cells were changed.`);
    const groupIndex=column-measurementOffset;
    while(next.length<=groupIndex)next.push({id:uid(),name:`Group ${next.length+1}`,observations:[]});
    const group=next[groupIndex],old=observation(group,subject);
    if(value===undefined){if(old)group.observations=group.observations.filter(o=>o.id!==old.id)}
    else if(old)old.value=value;
    else group.observations.push({id:uid(),subject,value});
   }
  }
 }
 return next;
}

export function applyGridPasteWithRows(groups:Group[],subjects:string[],start:GridAddress,text:string,labelKeys:string[]=[],stored:DataTableRow[]=[]):{groups:Group[];tableRows:DataTableRow[]}{
 const next=applyGridPaste(groups,subjects,start,text,labelKeys),pasted=clipboardRows(text,start.column<1+labelKeys.length);
 if(!pasted.length)return {groups:next,tableRows:mergeTableRows(next,stored)};
 const count=Math.max(stored.length,start.row+pasted.length),names=extendSubjects(subjects,count),bySubject=new Map(mergeTableRows(groups,stored).map(row=>[row.subject,row]));
 const rows=Array.from({length:count},(_,index)=>({...bySubject.get(names[index]),subject:names[index]}));
 pasted.forEach((cells,index)=>cells.forEach((raw,offset)=>{const column=start.column+offset,row=rows[start.row+index],value=raw.trim();if(column===0&&value)row.subject=value;else if(column>0&&column<=labelKeys.length)row.labels={...row.labels,[labelKeys[column-1]]:value}}));
 const nextRows=mergeTableRows(next,rows),labelsBySubject=new Map(nextRows.map(row=>[row.subject,row.labels]));
 const labeled=next.map(group=>({...group,observations:group.observations.map(point=>{const labels=labelsBySubject.get(point.subject??point.id);return labels?{...point,labels:{...labels,...point.labels}}:point})}));
 return {groups:labeled,tableRows:nextRows};
}

export default function DataGrid(props:Props){
 const {groups,tableRows,onChange,onSelection,onPaste,onNew,showX=false,focusPointId,onUndo,onRedo}=props;
 const controlledRows=Object.prototype.hasOwnProperty.call(props,'tableRows');
 const [extraRows,setExtraRows]=useState(5),[error,setError]=useState(''),[page,setPage]=useState(0),[draftLabels,setDraftLabels]=useState<Record<number,string>>({}),[exportFormat,setExportFormat]=useState<''|'wide'|'long'>(''),[copyNotice,setCopyNotice]=useState('');
 const [localRows,setLocalRows]=useState<DataTableRow[]>(()=>mergeTableRows(groups,tableRows));
 const [range,setRange]=useState<CellRange|null>(null),rangeRef=useRef<CellRange|null>(null);
 const [editingCell,setEditingCell]=useState<string|null>(null),editingRef=useRef<string|null>(null);
 const [context,setContext]=useState<{x:number;y:number;row:number;groupId?:string;pointId?:string}|null>(null);
 const table=useRef<HTMLDivElement>(null),drag=useRef<{anchor:NumericCell}|null>(null),pendingCellFocus=useRef<NumericCell|null>(null);
 const requestedFocus=useRef<string|undefined>(undefined),pendingFocus=useRef<string|undefined>(undefined);
 const storedRows=mergeTableRows(groups,controlledRows?(tableRows??[]):localRows),storedSubjects=storedRows.map(row=>row.subject);
 const subjects=[...storedSubjects],usedSubjects=new Set(storedSubjects);
 for(let row=subjects.length;row<Math.max(8,storedRows.length+extraRows);row++){const base=draftLabels[row]??'row-'+(row+1);let subject=base,suffix=2;while(usedSubjects.has(subject))subject=base+'-'+suffix++;subjects.push(subject);usedSubjects.add(subject)}
 const visualRows=subjects.map((subject,index)=>({...storedRows[index],subject}));
 const labelKeys=[...new Set(storedRows.flatMap(row=>Object.keys(row.labels??{})))];
 const rowCount=subjects.length,visiblePage=Math.min(page,Math.max(0,Math.ceil(rowCount/100)-1)),pageStart=visiblePage*100,measurementOffset=1+labelKeys.length;
 const rows=Array.from({length:Math.min(100,Math.max(0,rowCount-pageStart))},(_,i)=>pageStart+i);
 const rowSubject=(row:number)=>subjects[row]??'row-'+(row+1),cellKey=(row:number,column:number)=>row+':'+column;
 const excluded=groups.flatMap(group=>group.observations).filter(point=>point.excluded).length;
 const safeRange=range&&rangeBounds(range).lastRow<rowCount&&rangeBounds(range).lastColumn<groups.length?range:null;
 const dataFormat=exportFormat||(excluded?'long':'wide'),selectedCells=rangeSize(safeRange);
 const selectedValues=safeRange?selectedValueCount(groups,visualRows,safeRange):0;
 function choose(next:CellRange|null){rangeRef.current=next;setRange(next)}
 function editCell(key:string|null){editingRef.current=key;setEditingCell(key)}
 function emit(next:Group[],nextRows=mergeTableRows(next,storedRows)){setLocalRows(nextRows);onChange(next,nextRows)}
 function update(changes:()=>{groups:Group[];tableRows:DataTableRow[]}){try{const next=changes();emit(next.groups,next.tableRows);setError('');return true}catch(caught){setError((caught as Error).message);return false}}
 function focusCell(cell:NumericCell,extend=false){
  const next={row:Math.max(0,Math.min(rowCount-1,cell.row)),column:Math.max(0,Math.min(groups.length-1,cell.column))};
  choose({anchor:extend&&rangeRef.current?rangeRef.current.anchor:next,focus:next});editCell(null);pendingCellFocus.current=next;setPage(Math.floor(next.row/100));
 }
 useEffect(()=>{if(controlledRows)setLocalRows(tableRows??[])},[tableRows,controlledRows]);
 useEffect(()=>{if(range&&!safeRange)choose(null)},[rowCount,groups.length]);
 useEffect(()=>{
  if(!pendingCellFocus.current)return;const cell=pendingCellFocus.current;
  const input=table.current?.querySelector<HTMLInputElement>('[data-numeric-row="'+cell.row+'"][data-numeric-column="'+cell.column+'"]');
  if(!input)return;pendingCellFocus.current=null;input.focus();input.select();input.scrollIntoView?.({block:'nearest',inline:'nearest'});
 },[page,range]);
 useEffect(()=>{
  if(!focusPointId){requestedFocus.current=undefined;pendingFocus.current=undefined;return}
  if(requestedFocus.current===focusPointId)return;
  const column=groups.findIndex(group=>group.observations.some(point=>point.id===focusPointId));
  const point=groups[column]?.observations.find(point=>point.id===focusPointId);if(!point)return;
  const row=storedSubjects.indexOf(point.subject??point.id);if(row<0)return;
  requestedFocus.current=focusPointId;pendingFocus.current=focusPointId;
  choose({anchor:{row,column},focus:{row,column}});setPage(Math.floor(row/100));
 },[focusPointId,groups]);
 useEffect(()=>{
  if(!pendingFocus.current)return;
  const cell=Array.from(table.current?.querySelectorAll<HTMLTableCellElement>('td[data-observation-id]')??[]).find(cell=>cell.dataset.observationId===pendingFocus.current);
  if(!cell)return;pendingFocus.current=undefined;
  cell.querySelector<HTMLInputElement>('input')?.focus();cell.scrollIntoView?.({block:'center',inline:'center'});
 },[focusPointId,page]);
 useEffect(()=>{const release=()=>{drag.current=null};window.addEventListener('mouseup',release);return()=>window.removeEventListener('mouseup',release)},[]);
 useEffect(()=>{if(!context)return;const close=()=>setContext(null);window.addEventListener('click',close);const key=(event:globalThis.KeyboardEvent)=>{if(event.key==='Escape')close()};window.addEventListener('keydown',key);return()=>{window.removeEventListener('click',close);window.removeEventListener('keydown',key)}},[context]);
 function paste(event:ClipboardEvent<HTMLInputElement>,row:number,column:number){
  const text=event.clipboardData.getData('text');if(!text)return;event.preventDefault();
  const bounds=rangeRef.current&&column>=measurementOffset?rangeBounds(rangeRef.current):undefined;
  const start=bounds?{row:bounds.firstRow,column:bounds.firstColumn+measurementOffset}:{row,column};
  if(update(()=>applyGridPasteWithRows(groups,subjects,start,text,labelKeys,storedRows))){setExtraRows(count=>Math.max(count,5));editCell(null)}
 }
 function copyRange(event:ClipboardEvent<HTMLInputElement>,cut=false){
  if(!rangeRef.current||rangeSize(rangeRef.current)<2||editingRef.current)return;
  const bounds=rangeBounds(rangeRef.current),values=visualRows.slice(bounds.firstRow,bounds.lastRow+1).map(row=>groups.slice(bounds.firstColumn,bounds.lastColumn+1).map(group=>observation(group,row.subject)?.value??''));
  event.clipboardData.setData('text/plain',Papa.unparse(values,{delimiter:'\t',newline:'\n'}));event.preventDefault();
  if(cut)clearRange();
 }
 function commitValue(row:number,column:number,raw:string){
  if(column===0){const subject=rowSubject(row),value=raw.trim();
   if(!value||subjects.some((name,index)=>index!==row&&name===value)){setError('Use a unique, non-empty row label so paired observations remain linked.');return false}
   const nextRows=visualRows.slice(0,Math.max(storedRows.length,row+1)).map((entry,index)=>index===row?{...entry,subject:value}:entry);
   emit(groups.map(group=>({...group,observations:group.observations.map(point=>(point.subject??point.id)===subject?{...point,subject:value}:point)})),nextRows);
   setDraftLabels(labels=>({...labels,[row]:value}));setError('');return true;
  }
  if(column>=measurementOffset&&isMissing(raw)){const subject=rowSubject(row),groupIndex=column-measurementOffset;emit(groups.map((group,index)=>index===groupIndex?{...group,observations:group.observations.filter(point=>(point.subject??point.id)!==subject)}:group),storedRows);setError('');return true}
  return update(()=>applyGridPasteWithRows(groups,subjects,{row,column},raw,labelKeys,storedRows));
 }
 function changeLabel(row:number,key:string,value:string){
  const subject=rowSubject(row),nextRows=visualRows.slice(0,Math.max(storedRows.length,row+1)).map((entry,index)=>index===row?{...entry,labels:{...entry.labels,[key]:value}}:entry);
  emit(groups.map(group=>({...group,observations:group.observations.map(point=>(point.subject??point.id)===subject?{...point,labels:{...point.labels,[key]:value}}:point)})),nextRows);
 }
 function setExcluded(pointId:string|undefined,row:number,value:boolean){const subject=rowSubject(row);emit(groups.map(group=>({...group,observations:group.observations.map(point=>(pointId?point.id===pointId:(point.subject??point.id)===subject)?{...point,excluded:value}:point)})))}
 function clearRange(target=rangeRef.current){
  if(!target)return;const removed=selectedValueCount(groups,visualRows,target);if(!removed)return;
  emit(clearSelectedValues(groups,visualRows,target),storedRows);editCell(null);setContext(null);setCopyNotice(removed+' '+(removed===1?'value cleared.':'values cleared.')+' Use Undo to restore.');table.current?.focus();
 }
 function excludeRange(exclude:boolean){if(!rangeRef.current)return;emit(excludeSelectedValues(groups,visualRows,rangeRef.current,exclude),storedRows);setContext(null);table.current?.focus()}
 function selectAll(){const lastRow=Math.max(0,storedRows.length-1);choose({anchor:{row:0,column:0},focus:{row:lastRow,column:Math.max(0,groups.length-1)}});editCell(null);table.current?.focus()}
 function selectRow(row:number,extend=false){const anchor=extend&&rangeRef.current?rangeRef.current.anchor:{row,column:0};choose({anchor,focus:{row,column:groups.length-1}});editCell(null);table.current?.focus()}
 function selectColumn(column:number){choose({anchor:{row:0,column},focus:{row:Math.max(0,storedRows.length-1),column}});editCell(null);table.current?.focus()}
 function numericMouseDown(event:ReactMouseEvent<HTMLTableCellElement>,row:number,column:number){
  if(event.button!==0||(event.target as HTMLElement).closest('button,.data-grid-x'))return;
  if(editingRef.current===cellKey(row,column)&&!event.shiftKey)return;
  event.preventDefault();editCell(null);
  const cell={row,column},anchor=event.shiftKey&&rangeRef.current?rangeRef.current.anchor:cell;
  choose({anchor,focus:cell});
  if(event.shiftKey){(document.activeElement as HTMLElement)?.blur?.();table.current?.focus();return}
  drag.current={anchor};const input=event.currentTarget.querySelector<HTMLInputElement>('input');input?.focus();input?.select();
 }
 function numericMouseEnter(event:ReactMouseEvent,row:number,column:number){if(!drag.current||event.buttons!==1)return;choose({anchor:drag.current.anchor,focus:{row,column}})}
 function onCellFocus(row:number,column:number){const current=rangeRef.current;if(!current||!rangeContains(current,row,column))choose({anchor:{row,column},focus:{row,column}})}
 function nav(event:KeyboardEvent<HTMLInputElement>,row:number,column:number){
  const numeric=column>=measurementOffset,numericColumn=column-measurementOffset,key=numeric?cellKey(row,numericColumn):null,editing=key!==null&&editingRef.current===key;
  const command=event.metaKey||event.ctrlKey;
  if(numeric&&!editing){
   if(command&&(event.key==='z'||event.key==='Z'||event.key==='y'||event.key==='Y')&&(onUndo||onRedo)){event.preventDefault();event.stopPropagation();if(event.shiftKey||event.key.toLowerCase()==='y')onRedo?.();else onUndo?.();return}
   if(command&&event.key.toLowerCase()==='a'){event.preventDefault();event.stopPropagation();selectAll();return}
   if((event.key==='Delete'||event.key==='Backspace')&&rangeSize(rangeRef.current)>1){event.preventDefault();event.stopPropagation();clearRange();return}
   if(event.key.startsWith('Arrow')){event.preventDefault();event.stopPropagation();const base=rangeRef.current?.focus??{row,column:numericColumn};focusCell({row:base.row+(event.key==='ArrowDown'?1:event.key==='ArrowUp'?-1:0),column:base.column+(event.key==='ArrowRight'?1:event.key==='ArrowLeft'?-1:0)},event.shiftKey);return}
   if(event.key==='F2'){event.preventDefault();editCell(key);return}
   if(!command&&!event.altKey&&(event.key.length===1||event.key==='Backspace'||event.key==='Delete'))editCell(key);
  }
  if(numeric&&event.key==='Escape'){event.preventDefault();event.stopPropagation();const point=observation(groups[numericColumn],rowSubject(row));event.currentTarget.value=String(point?.value??'');editCell(null);choose({anchor:{row,column:numericColumn},focus:{row,column:numericColumn}});event.currentTarget.select();return}
  if(event.key==='Enter'||numeric&&event.key==='Tab'){
   event.preventDefault();event.stopPropagation();event.currentTarget.blur();editCell(null);
   if(numeric){let nextRow=row,nextColumn=numericColumn;if(event.key==='Enter')nextRow+=event.shiftKey?-1:1;else {nextColumn+=event.shiftKey?-1:1;if(nextColumn>=groups.length){nextColumn=0;nextRow++}if(nextColumn<0){nextColumn=groups.length-1;nextRow--}}focusCell({row:nextRow,column:nextColumn})}
   else {const nextRow=row+(event.shiftKey?-1:1),target=table.current?.querySelector<HTMLInputElement>('[data-row="'+nextRow+'"][data-column="'+column+'"]');target?.focus();target?.select()}
  }else if(!numeric&&(event.key==='ArrowDown'||event.key==='ArrowUp')){event.preventDefault();const nextRow=row+(event.key==='ArrowDown'?1:-1);table.current?.querySelector<HTMLInputElement>('[data-row="'+nextRow+'"][data-column="'+column+'"]')?.focus()}
 }
 function tableKey(event:KeyboardEvent<HTMLDivElement>){
  if(event.target instanceof HTMLInputElement)return;
  const command=event.metaKey||event.ctrlKey;
  if(command&&event.key.toLowerCase()==='a'){event.preventDefault();event.stopPropagation();selectAll()}
  else if((event.key==='Delete'||event.key==='Backspace')&&rangeRef.current){event.preventDefault();event.stopPropagation();clearRange()}
  else if(command&&event.key.toLowerCase()==='z'&&onUndo){event.preventDefault();event.stopPropagation();if(event.shiftKey)onRedo?.();else onUndo()}
  else if(command&&event.key.toLowerCase()==='y'&&onRedo){event.preventDefault();event.stopPropagation();onRedo()}
  else if(event.key.startsWith('Arrow')&&rangeRef.current){event.preventDefault();const base=rangeRef.current.focus;focusCell({row:base.row+(event.key==='ArrowDown'?1:event.key==='ArrowUp'?-1:0),column:base.column+(event.key==='ArrowRight'?1:event.key==='ArrowLeft'?-1:0)},event.shiftKey)}
  else if(event.key==='Escape')choose(null);
 }
 function menu(event:ReactMouseEvent,row:number,groupId?:string,point?:Observation){
  event.preventDefault();const column=groups.findIndex(group=>group.id===groupId);
  if(column>=0&&!rangeContains(rangeRef.current,row,column))choose({anchor:{row,column},focus:{row,column}});
  setContext({x:Math.max(8,Math.min(event.clientX,window.innerWidth-260)),y:Math.max(8,Math.min(event.clientY,window.innerHeight-340)),row,groupId,pointId:point?.id});
 }
 const currentPoint=context?.pointId?groups.flatMap(group=>group.observations).find(point=>point.id===context.pointId):undefined;
 const rowPoints=context?groups.flatMap(group=>group.observations.filter(point=>(point.subject??point.id)===rowSubject(context.row))):[];
 return <section className="data-grid-panel" aria-label="Editable data table">
  <div className="data-grid-toolbar"><div><strong>Type or paste your data</strong><span>Click a cell to type. Drag or Shift-click to select several cells.</span></div><div>{onNew&&<button className="button compact" onClick={onNew}>New dataset</button>}{onPaste&&<button className="button compact" onClick={onPaste}>Paste table</button>}<button className="button compact" onClick={()=>emit([...groups,{id:uid(),name:'Group '+(groups.length+1),observations:[]}])}>+ Column</button><button className="button compact" onClick={()=>setExtraRows(count=>count+10)}>+ Rows</button></div></div>
  <div className="data-grid-selection-bar" aria-label="Selection actions"><div><strong aria-live="polite">{selectedCells?selectedCells+' '+(selectedCells===1?'cell selected':'cells selected'):'Select values to edit together'}</strong><span>{selectedCells?selectedValues+' stored '+(selectedValues===1?'value':'values')+' · labels stay in place':'Drag across cells, click a row number, or select a column.'}</span></div><div><button className="button compact" onClick={selectAll}>Select all values</button><button className="button compact clear-selected-values" disabled={!selectedValues} onClick={()=>clearRange()}>Clear selected values</button><button className="button compact" disabled={!selectedValues} onClick={()=>excludeRange(true)}>Exclude selected</button><button className="button compact" disabled={!selectedValues} onClick={()=>excludeRange(false)}>Restore selected</button></div><small>Clear removes values. Exclude keeps them visible. Use Undo to restore a clear.</small></div>
  {error&&<div className="data-grid-error" role="alert">{error}<button className="text-button" onClick={()=>setError('')}>Dismiss</button></div>}
  {excluded>0&&<div className="data-grid-excluded"><strong>{excluded} excluded {excluded===1?'value':'values'}</strong><span>Crossed-out values stay in the dataset and are omitted from analyses.</span><button className="text-button" onClick={()=>emit(groups.map(group=>({...group,observations:group.observations.map(point=>({...point,excluded:false}))})))}>Restore all</button></div>}
  <div className="data-grid-scroll" ref={table} tabIndex={0} aria-label="Data cells" onKeyDown={tableKey}><table className="data-grid"><thead><tr><th className="data-grid-label-heading">Row label / Subject ID</th>{labelKeys.map(key=><th key={key} className="data-grid-label-heading">{key}<small>Text label</small></th>)}{groups.map((group,index)=><th key={group.id}><input aria-label={'Column '+(index+1)+' name'} defaultValue={group.name} key={group.name} onFocus={()=>{choose(null);editCell(null)}} onBlur={event=>{const name=event.target.value.trim();if(!name){event.target.value=group.name;return}if(groups.some(other=>other.id!==group.id&&other.name===name)){setError('Use a unique name for each measurement column.');event.target.value=group.name;return}if(name!==group.name)emit(groups.map(other=>other.id===group.id?{...other,name}:other))}}/><button className="data-grid-column-select" aria-label={'Select column '+group.name} onClick={()=>selectColumn(index)}>Select column</button></th>)}</tr></thead><tbody>{rows.map(row=>{const subject=rowSubject(row);return <tr key={row}>
   <th onContextMenu={event=>menu(event,row)}><button className="data-grid-row-number" aria-label={'Select row '+(row+1)} onClick={event=>selectRow(row,event.shiftKey)}>{row+1}</button><input aria-label={'Subject ID '+(row+1)} data-row={row} data-column={0} defaultValue={storedSubjects[row]??draftLabels[row]??''} key={subject} placeholder={'row-'+(row+1)} onPaste={event=>paste(event,row,0)} onFocus={()=>{choose(null);editCell(null)}} onBlur={event=>{const value=event.target.value.trim();if(!value&&storedSubjects[row]){event.target.value=subject;setError('Keep a non-empty row label so paired observations remain linked.');return}if(value&&value!==subject&&!commitValue(row,0,value))event.target.value=storedSubjects[row]??draftLabels[row]??''}} onKeyDown={event=>nav(event,row,0)}/></th>
   {labelKeys.map((key,column)=>{const label=storedRows[row]?.labels?.[key]??'';return <td key={key} className="data-grid-label-cell"><input aria-label={key+', row '+(row+1)} data-row={row} data-column={column+1} key={label} defaultValue={label} onPaste={event=>paste(event,row,column+1)} onFocus={()=>{choose(null);editCell(null)}} onBlur={event=>{if(event.target.value!==label)changeLabel(row,key,event.target.value)}} onKeyDown={event=>nav(event,row,column+1)}/></td>})}
   {groups.map((group,column)=>{const point=observation(group,subject),gridColumn=column+measurementOffset,selected=rangeContains(range,row,column);return <td key={group.id} data-observation-id={point?.id} data-range-selected={selected||undefined} className={(point?.excluded?'data-grid-cell-excluded ':'')+(selected?'data-grid-cell-selected ':'')+(range?.anchor.row===row&&range.anchor.column===column?'data-grid-range-anchor':'')} onMouseDown={event=>numericMouseDown(event,row,column)} onMouseEnter={event=>numericMouseEnter(event,row,column)} onContextMenu={event=>menu(event,row,group.id,point)}><input aria-label={group.name+', row '+(row+1)} data-row={row} data-column={gridColumn} data-numeric-row={row} data-numeric-column={column} data-editing={editingCell===cellKey(row,column)||undefined} aria-description={point?.excluded?'Excluded from analysis. Right-click to restore.':'Drag or Shift-click to select a range. Double-click or press F2 to edit text.'} key={(point?.id??subject)+'-'+(point?.value??'')} type="text" inputMode="decimal" defaultValue={point?.value??''} onFocus={()=>onCellFocus(row,column)} onDoubleClick={()=>editCell(cellKey(row,column))} onPaste={event=>paste(event,row,gridColumn)} onCopy={event=>copyRange(event)} onCut={event=>copyRange(event,true)} onBlur={event=>{const raw=event.target.value.trim();editCell(null);if(raw!==String(point?.value??''))if(!commitValue(row,gridColumn,raw))event.target.value=String(point?.value??'')}} onKeyDown={event=>nav(event,row,gridColumn)}/>{point&&<button tabIndex={-1} className="data-grid-cell-action" aria-label={(point.excluded?'Restore':'Exclude')+' '+group.name+', row '+(row+1)} title={point.excluded?'Restore value':'Exclude from analysis'} onClick={()=>setExcluded(point.id,row,!point.excluded)}>{point.excluded?'↶':'⊘'}</button>}{showX&&point&&<label className="data-grid-x">X<input aria-label={'X '+group.name+', row '+(row+1)} defaultValue={point.x??row+1} key={point.x} inputMode="decimal" onBlur={event=>{const x=tableNumber(event.target.value);if(x===undefined){setError('X coordinates must be numbers.');return}emit(groups.map(other=>other.id===group.id?{...other,observations:other.observations.map(value=>value.id===point.id?{...value,x}:value)}:other))}}/></label>}</td>})}
  </tr>})}</tbody></table></div>
  <div className="data-grid-footer"><span>Double-click a value to edit its text. Enter moves down; Tab moves across. Shift + arrows extends a selection.</span>{rowCount>100&&<div><button className="button compact" disabled={visiblePage===0} onClick={()=>setPage(visiblePage-1)}>Previous rows</button><span>Rows {pageStart+1}–{Math.min(rowCount,pageStart+100)}</span><button className="button compact" disabled={pageStart+100>=rowCount} onClick={()=>setPage(visiblePage+1)}>Next rows</button></div>}</div>
  <div className="data-grid-export"><label>Data format<select aria-label="Data export format" value={dataFormat} onChange={event=>setExportFormat(event.target.value as 'wide'|'long')}><option value="wide">Wide table · all values</option><option value="long">Long table · includes exclusion flags</option></select></label><button className="button compact" onClick={()=>exportDownload('PlotStatLab-data.csv',dataTableText(groups,dataFormat,',',storedRows),'text/csv;charset=utf-8')}>Download data CSV</button><button className="button compact" onClick={async()=>{try{await navigator.clipboard.writeText(dataTableText(groups,dataFormat,'\t',storedRows));setCopyNotice('Table copied. Paste it into Excel or another dataset.')}catch{setError('Could not access the clipboard. Use Download data CSV instead.')}}}>Copy table</button>{copyNotice&&<span role="status">{copyNotice}</span>}{excluded>0&&dataFormat==='wide'&&<span className="data-grid-export-warning">Wide tables include excluded values. Choose Long table to carry exclusion flags.</span>}</div>
  {context&&<div className="data-grid-context" role="menu" aria-label="Data actions" style={{left:context.x,top:context.y}} onClick={event=>event.stopPropagation()}>{selectedValues>0&&<><strong>{selectedCells} selected {selectedCells===1?'cell':'cells'}</strong><button role="menuitem" onClick={()=>clearRange()}>Clear selected values</button>{selectedCells>1&&<><button role="menuitem" onClick={()=>excludeRange(true)}>Exclude selected values</button><button role="menuitem" onClick={()=>excludeRange(false)}>Restore selected values</button></>}</>}{currentPoint&&<><strong>{groups.find(group=>group.id===context.groupId)?.name} · {currentPoint.value}</strong>{onSelection&&<button role="menuitem" onClick={()=>{onSelection({kind:'point',id:currentPoint.id,groupId:context.groupId!});setContext(null)}}>Edit point appearance…</button>}<button role="menuitem" onClick={()=>{setExcluded(currentPoint.id,context.row,!currentPoint.excluded);setContext(null)}}>{currentPoint.excluded?'Restore value to analysis':'Exclude value from analysis'}</button></>}<button role="menuitem" disabled={!rowPoints.length} onClick={()=>{setExcluded(undefined,context.row,!rowPoints.every(point=>point.excluded));setContext(null)}}>{rowPoints.length&&rowPoints.every(point=>point.excluded)?'Restore entire row':'Exclude entire row'}</button><button role="menuitem" disabled={!rowPoints.length} onClick={()=>{clearRange({anchor:{row:context.row,column:0},focus:{row:context.row,column:groups.length-1}});setContext(null)}}>Clear row values</button></div>}
 </section>;
}
