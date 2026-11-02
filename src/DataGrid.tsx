import {useEffect,useRef,useState} from 'react';
import type {ClipboardEvent,KeyboardEvent} from 'react';
import Papa from 'papaparse';
import type {Group,Observation,Selection} from './types';
import {exportDownload,tableNumber} from './project';
import './dataGrid.css';

type GridAddress={row:number;column:number};
type Props={groups:Group[];onChange:(groups:Group[])=>void;onSelection?:(selection:Selection)=>void;onPaste?:()=>void;onNew?:()=>void;showX?:boolean;focusPointId?:string};
const uid=()=>crypto.randomUUID();
export const gridSubjects=(groups:Group[])=>[...new Set(groups.flatMap(g=>g.observations.map(o=>o.subject??o.id)))];
const observation=(group:Group,subject:string)=>group.observations.find(o=>(o.subject??o.id)===subject);
const isMissing=(value:string)=>/^(?:|na|n\/a|nan|null|missing)$/i.test(value.trim());

export function dataTableText(groups:Group[],format:'wide'|'long'='wide',delimiter=","):string {
 const labelKeys=[...new Set(groups.flatMap(g=>g.observations.flatMap(o=>Object.keys(o.labels??{}))))];
 const hasX=groups.some(g=>g.observations.some(o=>o.x!==undefined));
 const reserved=new Set((format==='long'?['group','subject','subjectid','subject_id','id','label','x','y','value','response','time','estimate','p','pvalue','p_value','factora','factor_a','factorb','factor_b','event','status','censored','excluded','lower','upper','lo','hi']:['subject',...groups.map(g=>g.name.toLowerCase())]));
 const labelHeaders=labelKeys.map(key=>{let name=key;while(reserved.has(name.toLowerCase()))name=`Label: ${name}`;reserved.add(name.toLowerCase());return name});
 if(format==='long')return Papa.unparse([['Group','Subject',...labelHeaders,'Y',...(hasX?['X']:[]),'Excluded'],...groups.flatMap(g=>g.observations.map(o=>[g.name,o.subject??o.id,...labelKeys.map(key=>o.labels?.[key]??''),o.value,...(hasX?[o.x??'']:[]),o.excluded?'true':'false']))],{delimiter,newline:'\n'});
 const subjects=gridSubjects(groups);
 return Papa.unparse([['Subject',...labelHeaders,...groups.map(g=>g.name)],...subjects.map(subject=>[subject,...labelKeys.map(key=>groups.map(g=>observation(g,subject)?.labels?.[key]).find(value=>value!==undefined)??''),...groups.map(g=>observation(g,subject)?.value??'')])],{delimiter,newline:'\n'});
}

/** Paste is validated before applying any edit, so an invalid range cannot partially overwrite data. */
export function applyGridPaste(groups:Group[],subjects:string[],start:GridAddress,text:string,labelKeys:string[]=[]):Group[]{
 const lines=text.replace(/\r\n/g,'\n').split('\n');
 const singleColumn=!text.includes('\t')&&!text.includes(';')&&lines.every(line=>isMissing(line)||tableNumber(line)!==undefined);
 const parsed=singleColumn?{data:lines.map(line=>[line]),errors:[]}:Papa.parse<string[]>(text.replace(/\r\n/g,'\n'),{skipEmptyLines:false,delimiter:text.includes('\t')?'\t':text.includes(';')?';':undefined});
 if(parsed.errors.some(e=>e.code!=='UndetectableDelimiter'))throw new Error('This clipboard table could not be read. Try copying the cells again.');
 const rows=parsed.data;while(rows.length&&rows.at(-1)!.every(v=>v===''))rows.pop();
 if(!rows.length)return groups;
 if(rows.length>100000||rows.some(row=>row.length>512)||rows.reduce((count,row)=>count+row.length,0)>1000000)throw new Error('Paste a smaller selection (up to 100,000 rows, 512 columns and 1,000,000 cells).');
 const next=structuredClone(groups),names=[...subjects],measurementOffset=1+labelKeys.length;
 for(let r=0;r<rows.length;r++){
  const rowIndex=start.row+r;let subject=names[rowIndex]??`row-${rowIndex+1}`;
  while(!names[rowIndex]&&names.includes(subject))subject=`${subject}-new`;
  names[rowIndex]=subject;
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

export default function DataGrid({groups,onChange,onSelection,onPaste,onNew,showX=false,focusPointId}:Props){
 const [extraRows,setExtraRows]=useState(5),[error,setError]=useState(''),[page,setPage]=useState(0),[draftLabels,setDraftLabels]=useState<Record<number,string>>({}),[exportFormat,setExportFormat]=useState<''|'wide'|'long'>(''),[copyNotice,setCopyNotice]=useState('');
 const [context,setContext]=useState<{x:number;y:number;row:number;groupId?:string;pointId?:string}|null>(null);
 const table=useRef<HTMLDivElement>(null);
 const requestedFocus=useRef<string|undefined>(undefined),pendingFocus=useRef<string|undefined>(undefined);
 const storedSubjects=gridSubjects(groups),subjects=Array.from({length:Math.max(8,storedSubjects.length+extraRows)},(_,row)=>storedSubjects[row]??draftLabels[row]??`row-${row+1}`),labelKeys=[...new Set(groups.flatMap(g=>g.observations.flatMap(o=>Object.keys(o.labels??{}))))];
 const rowCount=subjects.length,pageStart=page*100,measurementOffset=1+labelKeys.length;
 const rows=Array.from({length:Math.min(100,Math.max(0,rowCount-pageStart))},(_,i)=>pageStart+i);
 const rowSubject=(row:number)=>subjects[row]??`row-${row+1}`;
 const excluded=groups.flatMap(g=>g.observations).filter(o=>o.excluded).length;
 const dataFormat=exportFormat||(excluded?'long':'wide');
 useEffect(()=>{
  if(!focusPointId){requestedFocus.current=undefined;pendingFocus.current=undefined;return}
  if(requestedFocus.current===focusPointId)return;
  const point=groups.flatMap(g=>g.observations).find(o=>o.id===focusPointId);if(!point)return;
  const row=gridSubjects(groups).indexOf(point.subject??point.id);if(row<0)return;
  requestedFocus.current=focusPointId;pendingFocus.current=focusPointId;setPage(Math.floor(row/100));
 },[focusPointId,groups]);
 useEffect(()=>{
  if(!pendingFocus.current)return;
  const cell=Array.from(table.current?.querySelectorAll<HTMLTableCellElement>('td[data-observation-id]')??[]).find(cell=>cell.dataset.observationId===pendingFocus.current);
  if(!cell)return;
  cell.querySelector<HTMLInputElement>('input')?.focus();cell.scrollIntoView?.({block:'center',inline:'center'});pendingFocus.current=undefined;
 },[focusPointId,page]);
 useEffect(()=>{if(!context)return;const close=()=>setContext(null);window.addEventListener('click',close);const key=(e:globalThis.KeyboardEvent)=>{if(e.key==='Escape')close()};window.addEventListener('keydown',key);return()=>{window.removeEventListener('click',close);window.removeEventListener('keydown',key)}},[context]);
 function update(changes:()=>Group[]){try{const next=changes();onChange(next);setError('');return true}catch(e){setError((e as Error).message);return false}}
 function paste(event:ClipboardEvent<HTMLInputElement>,row:number,column:number){const text=event.clipboardData.getData('text');if(!text)return;event.preventDefault();update(()=>applyGridPaste(groups,subjects,{row,column},text,labelKeys));setExtraRows(n=>Math.max(n,5))}
 function commitValue(row:number,column:number,raw:string){const success=update(()=>applyGridPaste(groups,subjects,{row,column},column===0?Papa.unparse([[raw]],{delimiter:'\t'}):raw,labelKeys));if(success&&column===0&&raw.trim())setDraftLabels(labels=>({...labels,[row]:raw.trim()}));return success}
 function changeLabel(row:number,key:string,value:string){const subject=rowSubject(row);onChange(groups.map(g=>({...g,observations:g.observations.map(o=>(o.subject??o.id)===subject?{...o,labels:{...o.labels,[key]:value}}:o)})))}
 function setExcluded(pointId:string|undefined,row:number,value:boolean){const subject=rowSubject(row);onChange(groups.map(g=>({...g,observations:g.observations.map(o=>(pointId?o.id===pointId:(o.subject??o.id)===subject)?{...o,excluded:value}:o)})))}
 function nav(event:KeyboardEvent<HTMLInputElement>,row:number,column:number){
  let nextRow=row,nextColumn=column;
  if(event.key==='Enter'){nextRow+=event.shiftKey?-1:1;event.currentTarget.blur()}
  else if(event.key==='ArrowDown')nextRow++;
  else if(event.key==='ArrowUp')nextRow--;
  else return;
  event.preventDefault();const target=table.current?.querySelector<HTMLInputElement>(`[data-row="${nextRow}"][data-column="${nextColumn}"]`);target?.focus();target?.select();
 }
 function menu(event:React.MouseEvent,row:number,groupId?:string,point?:Observation){event.preventDefault();setContext({x:Math.min(event.clientX,window.innerWidth-240),y:Math.min(event.clientY,window.innerHeight-250),row,groupId,pointId:point?.id})}
 const currentPoint=context?.pointId?groups.flatMap(g=>g.observations).find(o=>o.id===context.pointId):undefined;
 const rowPoints=context?groups.flatMap(g=>g.observations.filter(o=>(o.subject??o.id)===rowSubject(context.row))):[];
 return <section className="data-grid-panel" aria-label="Editable data table">
  <div className="data-grid-toolbar"><div><strong>Type or paste your data</strong><span>Click a cell and paste a range from Excel. Right-click to exclude or restore values.</span></div><div>{onNew&&<button className="button compact" onClick={onNew}>New dataset</button>}{onPaste&&<button className="button compact" onClick={onPaste}>Paste table</button>}<button className="button compact" onClick={()=>onChange([...groups,{id:uid(),name:`Group ${groups.length+1}`,observations:[]}])}>+ Column</button><button className="button compact" onClick={()=>setExtraRows(n=>n+10)}>+ Rows</button></div></div>
  {error&&<div className="data-grid-error" role="alert">{error}<button className="text-button" onClick={()=>setError('')}>Dismiss</button></div>}
  {excluded>0&&<div className="data-grid-excluded"><strong>{excluded} excluded {excluded===1?'value':'values'}</strong><span>Crossed-out values stay in the dataset and are omitted from analyses.</span><button className="text-button" onClick={()=>onChange(groups.map(g=>({...g,observations:g.observations.map(o=>({...o,excluded:false}))})))}>Restore all</button></div>}
  <div className="data-grid-scroll" ref={table}><table className="data-grid"><thead><tr><th className="data-grid-label-heading">Row label / Subject ID</th>{labelKeys.map(key=><th key={key} className="data-grid-label-heading">{key}<small>Text label</small></th>)}{groups.map((group,i)=><th key={group.id}><input aria-label={`Column ${i+1} name`} defaultValue={group.name} key={group.name} onBlur={e=>{const name=e.target.value.trim();if(!name){e.target.value=group.name;return}if(groups.some(g=>g.id!==group.id&&g.name===name)){setError('Use a unique name for each measurement column.');e.target.value=group.name;return}if(name!==group.name)onChange(groups.map(g=>g.id===group.id?{...g,name}:g))}}/><small>Numeric measurements</small></th>)}</tr></thead><tbody>{rows.map(row=>{const subject=rowSubject(row);return <tr key={row}>
   <th onContextMenu={e=>menu(e,row)}><span className="data-grid-row-number">{row+1}</span><input aria-label={`Subject ID ${row+1}`} data-row={row} data-column={0} defaultValue={storedSubjects[row]??draftLabels[row]??''} key={subject} placeholder={`row-${row+1}`} onPaste={e=>paste(e,row,0)} onBlur={e=>{const value=e.target.value.trim();if(!value&&storedSubjects[row]){e.target.value=subject;setError('Keep a non-empty row label so paired observations remain linked.');return}if(value&&value!==subject&&!commitValue(row,0,value))e.target.value=storedSubjects[row]??draftLabels[row]??''}} onKeyDown={e=>nav(e,row,0)}/></th>
   {labelKeys.map((key,column)=>{const label=groups.map(g=>observation(g,subject)?.labels?.[key]).find(value=>value!==undefined)??'';return <td key={key} className="data-grid-label-cell"><input aria-label={`${key}, row ${row+1}`} data-row={row} data-column={column+1} key={label} defaultValue={label} onPaste={e=>paste(e,row,column+1)} onBlur={e=>{if(e.target.value!==label)changeLabel(row,key,e.target.value)}} onKeyDown={e=>nav(e,row,column+1)}/></td>})}
   {groups.map((group,column)=>{const point=observation(group,subject),gridColumn=column+measurementOffset;return <td key={group.id} data-observation-id={point?.id} className={point?.excluded?'data-grid-cell-excluded':''} onContextMenu={e=>menu(e,row,group.id,point)}><input aria-label={`${group.name}, row ${row+1}`} data-row={row} data-column={gridColumn} aria-description={point?.excluded?'Excluded from analysis. Right-click to restore.':undefined} key={`${point?.id??subject}-${point?.value??''}`} type="text" inputMode="decimal" defaultValue={point?.value??''} onPaste={e=>paste(e,row,gridColumn)} onBlur={e=>{const raw=e.target.value.trim();if(raw!==String(point?.value??''))if(!commitValue(row,gridColumn,raw))e.target.value=String(point?.value??'')}} onKeyDown={e=>nav(e,row,gridColumn)}/>{point&&<button className="data-grid-cell-action" aria-label={`${point.excluded?'Restore':'Exclude'} ${group.name}, row ${row+1}`} title={point.excluded?'Restore value':'Exclude from analysis'} onClick={()=>setExcluded(point.id,row,!point.excluded)}>{point.excluded?'↶':'⊘'}</button>}{showX&&point&&<label className="data-grid-x">X<input aria-label={`X ${group.name}, row ${row+1}`} defaultValue={point.x??row+1} key={point.x} inputMode="decimal" onBlur={e=>{const x=tableNumber(e.target.value);if(x===undefined){setError('X coordinates must be numbers.');return}onChange(groups.map(g=>g.id===group.id?{...g,observations:g.observations.map(o=>o.id===point.id?{...o,x}:o)}:g))}}/></label>}</td>})}
  </tr>})}</tbody></table></div>
  <div className="data-grid-footer"><span>Blank cells are missing values. Row labels link paired observations. Text label columns remain available.</span>{rowCount>100&&<div><button className="button compact" disabled={page===0} onClick={()=>setPage(p=>p-1)}>Previous rows</button><span>Rows {pageStart+1}–{Math.min(rowCount,pageStart+100)}</span><button className="button compact" disabled={pageStart+100>=rowCount} onClick={()=>setPage(p=>p+1)}>Next rows</button></div>}</div>
  <div className="data-grid-export"><label>Data format<select aria-label="Data export format" value={dataFormat} onChange={e=>setExportFormat(e.target.value as 'wide'|'long')}><option value="wide">Wide table · all values</option><option value="long">Long table · includes exclusion flags</option></select></label><button className="button compact" onClick={()=>exportDownload('PlotStatLab-data.csv',dataTableText(groups,dataFormat),'text/csv;charset=utf-8')}>Download data CSV</button><button className="button compact" onClick={async()=>{try{await navigator.clipboard.writeText(dataTableText(groups,dataFormat,'\t'));setCopyNotice('Table copied. Paste it into Excel or another dataset.')}catch{setError('Could not access the clipboard. Use Download data CSV instead.')}}}>Copy table</button>{copyNotice&&<span role="status">{copyNotice}</span>}{excluded>0&&dataFormat==='wide'&&<span className="data-grid-export-warning">Wide tables include excluded values. Choose Long table to carry exclusion flags.</span>}</div>
  {context&&<div className="data-grid-context" role="menu" aria-label="Data actions" style={{left:context.x,top:context.y}} onClick={e=>e.stopPropagation()}>{currentPoint&&<><strong>{groups.find(g=>g.id===context.groupId)?.name} · {currentPoint.value}</strong>{onSelection&&<button role="menuitem" onClick={()=>{onSelection({kind:'point',id:currentPoint.id,groupId:context.groupId!});setContext(null)}}>Edit point appearance…</button>}<button role="menuitem" onClick={()=>{setExcluded(currentPoint.id,context.row,!currentPoint.excluded);setContext(null)}}>{currentPoint.excluded?'Restore value to analysis':'Exclude value from analysis'}</button></>}<button role="menuitem" disabled={!rowPoints.length} onClick={()=>{setExcluded(undefined,context.row,!rowPoints.every(o=>o.excluded));setContext(null)}}>{rowPoints.length&&rowPoints.every(o=>o.excluded)?'Restore entire row':'Exclude entire row'}</button><button role="menuitem" disabled={!rowPoints.length} onClick={()=>{const subject=rowSubject(context.row);onChange(groups.map(g=>({...g,observations:g.observations.filter(o=>(o.subject??o.id)!==subject)})));setContext(null)}}>Clear row values</button></div>}
 </section>;
}
