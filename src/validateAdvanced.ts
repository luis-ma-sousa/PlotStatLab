import type {AdvancedRow,AdvancedResult,AdvancedChartOptions} from './advancedTypes';
const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const finite=(v:unknown)=>typeof v==='number'&&Number.isFinite(v);
export function validAdvancedRows(value:unknown,pointIds:Set<string>):value is AdvancedRow[]{
 if(!Array.isArray(value)||value.length>100000)return false;const ids=new Set<string>();
 return value.every(row=>{if(!object(row)||typeof row.id!=='string'||ids.has(row.id)||!pointIds.has(row.id)||!finite(row.y))return false;ids.add(row.id);return ['x','lower','upper','p'].every(k=>row[k]===undefined||finite(row[k]))&&['groupId','group','factorA','factorB','subject','label'].every(k=>row[k]===undefined||typeof row[k]==='string'&&(row[k] as string).length<=100000)&&['event','excluded'].every(k=>row[k]===undefined||typeof row[k]==='boolean')&&!(finite(row.lower)&&finite(row.upper)&&(row.lower as number)>(row.upper as number));});
}
export function validAdvancedResult(value:unknown):value is AdvancedResult{
 if(!object(value))return false;
 if(!['method','methodLabel','engine','fingerprint','createdAt','reference'].every(k=>typeof value[k]==='string'))return false;
 if(!object(value.parameters)||!object(value.estimates)||!Array.isArray(value.warnings)||!value.warnings.every(w=>typeof w==='string'))return false;
 if(!Object.values(value.estimates).every(v=>v===null||typeof v==='string'||finite(v)))return false;
 if(!Array.isArray(value.tables)||!value.tables.every(t=>object(t)&&typeof t.title==='string'&&Array.isArray(t.columns)&&t.columns.every(c=>typeof c==='string')&&Array.isArray(t.rows)&&t.rows.every(r=>Array.isArray(r)&&r.length===(t.columns as unknown[]).length&&r.every(c=>c===null||typeof c==='string'||finite(c)))))return false;
 return value.series===undefined||Array.isArray(value.series)&&value.series.every(s=>object(s)&&typeof s.name==='string'&&['fit','residuals','survival','censors','agreement'].includes(String(s.kind))&&Array.isArray(s.points)&&s.points.every(p=>object(p)&&finite(p.x)&&finite(p.y)&&['lower','upper','nRisk','events'].every(k=>p[k]===undefined||finite(p[k]))));
}
export function validAdvancedOptions(value:unknown):value is AdvancedChartOptions{
 if(!object(value))return false;return (value.xScale===undefined||value.xScale==='linear'||value.xScale==='log')&&['xMin','xMax'].every(k=>value[k]===undefined||value[k]===null||finite(value[k]))&&(value.xMin==null||value.xMax==null||(value.xMin as number)<(value.xMax as number))&&['pThreshold','foldChangeThreshold','forestReference'].every(k=>value[k]===undefined||finite(value[k]))&&(value.pThreshold===undefined||(value.pThreshold as number)>0&&(value.pThreshold as number)<=1)&&(value.foldChangeThreshold===undefined||(value.foldChangeThreshold as number)>=0)&&(value.showConfidence===undefined||typeof value.showConfidence==='boolean');
}
