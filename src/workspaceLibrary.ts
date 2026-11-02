import {parseProject,serializeProject,createProject,createChart} from './project';
import {normalizeWorkspace} from './workspace';
import type {Project} from './types';

const indexKey='plotstatlab.workspaces.v1';
const entryKey=(id:string)=>`plotstatlab.workspace.${id}`;
export interface WorkspaceEntry {id:string;name:string;updatedAt:string;datasets:number;figures:number;analyses:number}
export function listWorkspaces():WorkspaceEntry[]{
 const raw=localStorage.getItem(indexKey);if(!raw)return [];
 try{const value:unknown=JSON.parse(raw);return Array.isArray(value)?value.filter((v):v is WorkspaceEntry=>!!v&&typeof v==='object'&&typeof v.id==='string'&&typeof v.name==='string'&&typeof v.updatedAt==='string'):[]}catch{return []}
}
/** Save the project copy before updating its index; failed writes never delete a previous workspace. */
export function checkpointWorkspace(project:Project):void {
 localStorage.setItem(entryKey(project.id),serializeProject(project));
 const entry:WorkspaceEntry={id:project.id,name:project.name,updatedAt:project.updatedAt,datasets:project.datasets?.length??1,figures:project.charts.length,analyses:project.analysisRuns?.length??0};
 localStorage.setItem(indexKey,JSON.stringify([entry,...listWorkspaces().filter(e=>e.id!==project.id)].sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt))));
}
export function readWorkspace(id:string):Project {
 const text=localStorage.getItem(entryKey(id));if(!text)throw new Error('This workspace is unavailable on this device. Open its .psl file instead.');
 return normalizeWorkspace(parseProject(text));
}
export function createEmptyWorkspace(name='Untitled workspace'):Project {
 const base=createProject(),groups=[{id:crypto.randomUUID(),name:'Group A',observations:[]},{id:crypto.randomUUID(),name:'Group B',observations:[]}];
 const chart={...createChart(),name:'Figure 1',title:'',yLabel:'Value'};
 return normalizeWorkspace({...base,name,groups,charts:[chart],activeChartId:chart.id,analysisConfig:{...base.analysisConfig,test:'welch',control:groups[0].id},analysisRuns:[]});
}
