// @vitest-environment jsdom
import {beforeEach,expect,it} from 'vitest';
import {checkpointWorkspace,createEmptyWorkspace,listWorkspaces,readWorkspace} from './workspaceLibrary';
import {appendDatasets,normalizeWorkspace,syncWorkspace,activeDataset,activateDataset} from './workspace';
import {createChart,createProject,parseCsv} from './project';
beforeEach(()=>localStorage.clear());
it('keeps independent workspace snapshots when switching and reopens labels, exclusions and styling',()=>{
 const first=normalizeWorkspace(createProject());first.name='Experiment A';first.groups[0].observations[0].excluded=true;first.groups[0].observations[0].labels={Sample:'Mouse A'};first.charts[0].pointStyles[first.groups[0].observations[0].id]={color:'#cc2277'};
 const second=createEmptyWorkspace('Experiment B');checkpointWorkspace(first);checkpointWorkspace(second);
 expect(listWorkspaces()).toHaveLength(2);expect(readWorkspace(first.id)).toEqual(first);expect(readWorkspace(second.id).groups.every(g=>g.observations.length===0)).toBe(true);
 const changed={...second,name:'Renamed workspace'};checkpointWorkspace(changed);expect(listWorkspaces()).toHaveLength(2);expect(readWorkspace(first.id).name).toBe('Experiment A');expect(readWorkspace(second.id).name).toBe('Renamed workspace');
});
it('never silently replaces a damaged saved workspace with a blank workspace',()=>{
 const first=createEmptyWorkspace();checkpointWorkspace(first);localStorage.setItem(`plotstatlab.workspace.${first.id}`,'invalid json');expect(()=>readWorkspace(first.id)).toThrow();expect(localStorage.getItem(`plotstatlab.workspace.${first.id}`)).toBe('invalid json');
});
it('keeps explicit dataset selection even when the prior active chart belongs elsewhere',()=>{
 let project=appendDatasets(normalizeWorkspace(createProject()),[{name:'Second',groups:parseCsv('A,B\n1,4\n2,5')}],()=>createChart());
 const prior=project;project={...activateDataset(project,project.datasets![0].id),activeChartId:prior.activeChartId};const next=syncWorkspace(prior,project);expect(activeDataset(next).id).toBe(project.datasets![0].id);
});
