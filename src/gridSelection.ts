import type {Group} from './types';

export interface DataTableRow {subject:string;labels?:Record<string,string>}
export interface NumericCell {row:number;column:number}
export interface CellRange {anchor:NumericCell;focus:NumericCell}
export function rangeBounds(range:CellRange){
 return {firstRow:Math.min(range.anchor.row,range.focus.row),lastRow:Math.max(range.anchor.row,range.focus.row),firstColumn:Math.min(range.anchor.column,range.focus.column),lastColumn:Math.max(range.anchor.column,range.focus.column)};
}
export function rangeContains(range:CellRange|null,row:number,column:number):boolean {
 if(!range)return false;const b=rangeBounds(range);return row>=b.firstRow&&row<=b.lastRow&&column>=b.firstColumn&&column<=b.lastColumn;
}
export function rangeSize(range:CellRange|null):number {if(!range)return 0;const b=rangeBounds(range);return (b.lastRow-b.firstRow+1)*(b.lastColumn-b.firstColumn+1)}

/** Row identities are independent from whether any measurement remains in a row. */
export function mergeTableRows(groups:Group[],stored:DataTableRow[]=[]):DataTableRow[]{
 const rows=stored.map(row=>({...row,...(row.labels?{labels:{...row.labels}}:{})})),bySubject=new Map(rows.map(row=>[row.subject,row]));
 for(const group of groups)for(const point of group.observations){const subject=point.subject??point.id;let row=bySubject.get(subject);if(!row){row={subject};bySubject.set(subject,row);rows.push(row)}if(point.labels)row.labels={...row.labels,...point.labels}}
 return rows;
}
function selectedSubjects(groups:Group[],rows:DataTableRow[],range:CellRange):{subjects:Set<string>;firstColumn:number;lastColumn:number}{
 const b=rangeBounds(range);
 if(![range.anchor.row,range.anchor.column,range.focus.row,range.focus.column].every(Number.isInteger)||b.firstRow<0||b.lastRow>=rows.length||b.firstColumn<0||b.lastColumn>=groups.length)throw new Error('Choose a range inside the data table. No values were changed.');
 return {subjects:new Set(rows.slice(b.firstRow,b.lastRow+1).map(row=>row.subject)),firstColumn:b.firstColumn,lastColumn:b.lastColumn};
}
export function selectedValueCount(groups:Group[],rows:DataTableRow[],range:CellRange|null):number {
 if(!range)return 0;const selected=selectedSubjects(groups,rows,range);return groups.reduce((count,group,index)=>count+(index>=selected.firstColumn&&index<=selected.lastColumn?group.observations.filter(point=>selected.subjects.has(point.subject??point.id)).length:0),0);
}
/** One immutable edit lets the workspace's Undo restore a whole cleared range. */
export function clearSelectedValues(groups:Group[],rows:DataTableRow[],range:CellRange):Group[]{
 const selected=selectedSubjects(groups,rows,range);
 return groups.map((group,index)=>index<selected.firstColumn||index>selected.lastColumn?group:{...group,observations:group.observations.filter(point=>!selected.subjects.has(point.subject??point.id))});
}
export function excludeSelectedValues(groups:Group[],rows:DataTableRow[],range:CellRange,excluded:boolean):Group[]{
 const selected=selectedSubjects(groups,rows,range);
 return groups.map((group,index)=>index<selected.firstColumn||index>selected.lastColumn?group:{...group,observations:group.observations.map(point=>selected.subjects.has(point.subject??point.id)?{...point,excluded}:point)});
}
