import Papa from 'papaparse';
import type {AdvancedRow} from './advancedTypes';
import type {Dataset,Group} from './types';

export function rowsForDataset(dataset:Dataset):AdvancedRow[]{
 const anchors=new Map(dataset.groups.flatMap(g=>g.observations.map(o=>[o.id,{o,g}] as const)));
 if(dataset.advancedRows)return dataset.advancedRows.flatMap(row=>{const anchor=anchors.get(row.id);return anchor?[{...row,y:anchor.o.value,...(row.p!==undefined?{p:anchor.o.value}:{}),x:anchor.o.x??row.x,subject:anchor.o.subject??row.subject,labels:anchor.o.labels??row.labels,excluded:anchor.o.excluded??false,groupId:anchor.g.id}]:[]});
 return dataset.groups.flatMap(g=>g.observations.map(o=>({id:o.id,groupId:g.id,group:g.name,factorA:g.name,y:o.value,x:o.x,subject:o.subject,labels:o.labels,excluded:o.excluded})));
}
export function advancedFingerprint(rows:AdvancedRow[]):string{
 const canonical=JSON.stringify(rows.map(r=>Object.fromEntries(Object.entries(r).filter(([k,v])=>k!=='groupId'&&v!==undefined&&!(k==='excluded'&&v===false)).sort(([a],[b])=>a.localeCompare(b)))));
 let hash=14695981039346656037n;for(let i=0;i<canonical.length;i++){hash^=BigInt(canonical.charCodeAt(i));hash=BigInt.asUintN(64,hash*1099511628211n)}return hash.toString(16).padStart(16,'0');
}
export function groupsFromAdvanced(rows:AdvancedRow[]):Group[]{
 const groups=new Map<string,Group>();
 for(const row of rows){const name=row.factorA??row.group??'Series 1';let group=groups.get(name);if(!group){group={id:row.groupId??`long-group-${groups.size+1}`,name,observations:[]};groups.set(name,group)}group.observations.push({id:row.id,value:row.y,x:row.x,subject:row.subject,...(row.labels?{labels:row.labels}:{}),...(row.excluded?{excluded:true}:{})})}
 if(!groups.size)throw new Error('Add at least one observation.');return [...groups.values()];
}
const aliases:Record<string,string>={value:'y',response:'y',time:'y',estimate:'y',p:'y',pvalue:'y',p_value:'y',factor_a:'factorA',factora:'factorA',factor_b:'factorB',factorb:'factorB',condition:'factorA',treatment:'factorA',subjectid:'subject',subject_id:'subject',censored:'censored',status:'event',lo:'lower',hi:'upper'};
export function isAdvancedCsv(text:string):boolean{
 const header=Papa.parse<string[]>(text,{preview:1}).data[0]??[];
 const numericY=header.some(v=>/^(y|value|response|time|estimate|p|pvalue|p_value)$/i.test(v.trim()));
 return numericY&&header.some(v=>/^(group|factor[ _]?[ab]|event|lower|upper|x)$/i.test(v.trim()));
}
export function parseAdvancedCsv(text:string):AdvancedRow[]{
 const parsed=Papa.parse<string[]>(text.replace(/^\uFEFF/,''),{skipEmptyLines:'greedy'});
 if(parsed.errors.some(e=>e.code!=='UndetectableDelimiter'))throw new Error(`Invalid table: ${parsed.errors[0].message}`);
 if(parsed.data.length<2)throw new Error('Use a header and at least one observation.');
 const header=parsed.data[0].map(h=>h.trim()),keys=header.map(h=>{const key=h.toLowerCase().replaceAll(' ','');return aliases[key]??key});
 if(new Set(keys).size!==keys.length)throw new Error('Column names must be unique (including aliases).');
 if(!keys.includes('y'))throw new Error('A numeric Y, response, time, estimate or p column is required.');
 const recognized=new Set(['id','x','y','factora','factorb','factorA','factorB','subject','event','group','lower','upper','label','excluded','censored']);
 // Additional descriptive columns are labels, never candidate numeric axes.
 const unknown=keys.filter(k=>!recognized.has(k));
 const numeric=(raw:string,key:string,row:number)=>{const cleaned=raw.trim().replace(',','.');if(!/^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(cleaned)||!Number.isFinite(Number(cleaned)))throw new Error(`Row ${row}: ${key} must be a finite number.`);return Number(cleaned)};
 const boolean=(raw:string,key:string,row:number)=>{if(/^(1|true|yes|event|dead)$/i.test(raw))return true;if(/^(0|false|no|censored|alive)$/i.test(raw))return false;throw new Error(`Row ${row}: ${key} must be 1/0 or true/false.`)};
 const ids=new Set<string>();
 return parsed.data.slice(1).map((cells,i)=>{
  if(cells.length>keys.length)throw new Error(`Row ${i+2} has too many columns.`);
  const row:Record<string,unknown>={id:`row-${i+1}`};
  keys.forEach((key,j)=>{const raw=(cells[j]??'').trim();if(!raw){if(key==='y')throw new Error(`Row ${i+2}: Y is missing. Remove the missing observation or supply its value.`);return}
   if(unknown.includes(key)){row.labels={...(row.labels as Record<string,string>??{}),[header[j]]:raw};return}
   if(['x','y','lower','upper'].includes(key))row[key]=numeric(raw,key,i+2);
   else if(['event','excluded','censored'].includes(key)){const value=boolean(raw,key,i+2);row[key==='censored'?'event':key]=key==='censored'?!value:value}
   else row[key]=raw;
  });
  if(!row.label&&row.labels)row.label=Object.values(row.labels as Record<string,string>).join(' · ');
  if(ids.has(row.id as string))throw new Error('Observation IDs must be unique.');ids.add(row.id as string);
  if(typeof row.lower==='number'&&typeof row.upper==='number'&&row.lower>row.upper)throw new Error(`Row ${i+2}: lower exceeds upper.`);
  if(header.some(h=>/^(p|pvalue|p_value)$/i.test(h.trim())))row.p=row.y;return row as unknown as AdvancedRow;
 });
}
export const advancedExamples:Record<string,{name:string;text:string;chart:string}>={
 factorial:{name:'Two-factor experiment',chart:'grouped',text:'factorA,factorB,subject,y\nControl,Before,C1,9\nControl,Before,C2,11\nControl,Before,C3,10\nControl,After,C1,12\nControl,After,C2,13\nControl,After,C3,14\nTreated,Before,T1,10\nTreated,Before,T2,12\nTreated,Before,T3,11\nTreated,After,T1,19\nTreated,After,T2,22\nTreated,After,T3,20'},
 xy:{name:'XY measurements',chart:'regression',text:'x,y\n1,2.2\n2,3.8\n3,6.1\n4,7.7\n5,10.3\n6,12.1'},
 dose:{name:'Dose response',chart:'dose-response',text:'x,y\n0.01,4\n0.03,6\n0.1,12\n0.3,27\n1,51\n3,75\n10,91\n30,97\n100,99'},
 survival:{name:'Survival study',chart:'kaplan-meier',text:'group,time,event\nControl,2,1\nControl,3,1\nControl,4,0\nControl,5,1\nControl,6,1\nControl,8,0\nTreated,3,1\nTreated,5,0\nTreated,7,1\nTreated,9,0\nTreated,10,1\nTreated,12,0'},
 forest:{name:'Study estimates',chart:'forest',text:'label,estimate,lower,upper\nStudy A,0.6,0.2,1.0\nStudy B,0.3,-0.2,0.8\nStudy C,0.9,0.4,1.4'},
 agreement:{name:'Method agreement',chart:'bland-altman',text:'x,y\n10,11\n15,14\n20,22\n25,26\n30,29\n35,38\n40,41\n45,46'},
 volcano:{name:'Differential expression',chart:'volcano',text:'label,x,p\nGene A,2.1,0.0002\nGene B,-1.8,0.003\nGene C,0.2,0.4\nGene D,1.2,0.02\nGene E,-0.3,0.6\nGene F,-2.5,0.00001'},
};
export function resultForChart(dataset:Dataset,chart:{type:string;advancedResultId?:string}){
 if(chart.advancedResultId)return dataset.advancedAnalyses?.find(r=>r.id===chart.advancedResultId)?.result;
 const kinds:Record<string,string[]>={grouped:['two-way-anova','repeated-anova','mixed-model'],regression:['linear-regression'], 'dose-response':['dose-response'],'kaplan-meier':['survival'],'bland-altman':['bland-altman']};
 return [...(dataset.advancedAnalyses??[])].reverse().find(r=>kinds[chart.type]?.includes(r.result.method))?.result;
}
/** Standard column tests cannot treat right-censored times as complete outcomes. */
export function hasCensoredObservations(dataset:Dataset):boolean{return rowsForDataset(dataset).some(row=>!row.excluded&&row.event===false)}
