import {readFileSync} from 'node:fs';
import {afterEach,describe,it,expect,vi} from 'vitest';
import {applyStyle,createProject,dataFingerprint,getLoadWarning,loadProject,parseCsv,parseProject,reconcileProject,saveProject,serializeProject} from './project';
import type {Project} from './types';

function addAnalysis(project:Project):void {
  project.charts[0].analysis={test:'welch',testLabel:'Welch',engine:'SciPy',statistic:2,p:.01,
    fingerprint:'test',config:{...project.analysisConfig},createdAt:new Date().toISOString(),summaries:[],warnings:[],
    comparisons:[{id:'control-low',groupA:project.groups[0].id,groupB:project.groups[2].id,p:.01,adjustedP:.02,label:'*'}]};
}
afterEach(()=>vi.unstubAllGlobals());

describe('editable project persistence',()=>{
  it('round-trips individual point overrides, manual bracket positions, and original measurements',()=>{
    const project=createProject(),chart=project.charts[0],point=project.groups[0].observations[0];
    chart.pointStyles[point.id]={color:'#ee1133',size:8,shape:'diamond',stroke:'#111111',opacity:.7};
    addAnalysis(project);
    chart.annotationPositions['control-low']={dx:14.5,dy:-22};
    const reopened=parseProject(serializeProject(project));
    expect(reopened).toEqual(project);
    expect(reopened.groups[0].observations[0].value).toBe(28);
  });
  it('removes orphan overrides after row/group deletion while retaining other edits and historical analysis',()=>{
    const project=createProject(),chart=project.charts[0];addAnalysis(project);
    const deleted=project.groups[0].observations[0].id,kept=project.groups[0].observations[1].id;
    chart.pointStyles[deleted]={color:'#ff0000'};chart.pointStyles[kept]={color:'#00ff00'};
    chart.annotationPositions['control-low']={dx:8,dy:-10};chart.annotationPositions.orphan={dx:1,dy:2};
    project.groups[0].observations.shift();
    const reconciled=reconcileProject(project);
    expect(reconciled.charts[0].pointStyles).toEqual({[kept]:{color:'#00ff00'}});
    expect(reconciled.charts[0].annotationPositions).toEqual({'control-low':{dx:8,dy:-10}});
    expect(reconciled.charts[0].analysis).toBe(chart.analysis);
    expect(chart.pointStyles[deleted]).toEqual({color:'#ff0000'});
    expect(parseProject(serializeProject(project))).toEqual(reconciled);
    project.groups.splice(2,1);
    expect(reconcileProject(project).charts[0].annotationPositions).toEqual({});
    expect(reconcileProject(project).charts[0].analysis).toBe(chart.analysis);
  });
  it('backs up corrupt local data before returning a sample, exposing a recovery warning',()=>{
    const raw='{"schemaVersion":999,"important":"preserve me"}',storage=new Map([['plotstatlab.project.v1',raw]]);
    vi.stubGlobal('localStorage',{getItem:(key:string)=>storage.get(key)??null,setItem:(key:string,value:string)=>storage.set(key,value)});
    const recovered=loadProject();
    expect(recovered.schemaVersion).toBe(1);expect(getLoadWarning()).toContain('complete recovery copy');
    const backupKey=[...storage.keys()].find(key=>key.startsWith('plotstatlab.project.v1.recovery.'))!;
    expect(storage.get(backupKey)).toBe(raw);
    saveProject(recovered);expect(storage.get(backupKey)).toBe(raw);
    expect(parseProject(storage.get('plotstatlab.project.v1')!)).toEqual(recovered);
    loadProject();expect(getLoadWarning()).toBe('');
  });
  it('keeps the original untouched if a recovery backup cannot be written',()=>{
    const raw='corrupt data';const setItem=vi.fn((_key:string,_value:string)=>{throw new Error('quota exceeded');});
    vi.stubGlobal('localStorage',{getItem:()=>raw,setItem});
    expect(()=>loadProject()).toThrow('Original data were preserved');
    expect(setItem).toHaveBeenCalledTimes(1);
    expect(setItem.mock.calls[0][1]).toBe(raw);
  });
  it('rejects unsupported formats, invalid active charts, duplicate point IDs, and nonfinite values',()=>{
    const project=createProject();
    expect(()=>parseProject('{bad')).toThrow('JSON');
    expect(()=>parseProject(JSON.stringify({...project,schemaVersion:2}))).toThrow('version');
    expect(()=>parseProject(JSON.stringify({...project,activeChartId:'absent'}))).toThrow('active');
    project.groups[1].observations[0].id=project.groups[0].observations[0].id;
    expect(()=>parseProject(serializeProject(project))).toThrow('duplicate');
    const broken=createProject();broken.groups[0].observations[0].value=Infinity;
    expect(()=>parseProject(serializeProject(broken))).toThrow('number');
  });
});

describe('CSV import',()=>{
  it('keeps row identity when different columns have blanks, preventing shifted pairing',()=>{
    const [a,b]=parseCsv('Control,Treated\n10,20\n,21\n12,\n13,23\n');
    expect(a.observations.map(o=>[o.value,o.subject])).toEqual([[10,'row-1'],[12,'row-3'],[13,'row-4']]);
    expect(b.observations.map(o=>[o.value,o.subject])).toEqual([[20,'row-1'],[21,'row-2'],[23,'row-4']]);
  });
  it('supports semicolon delimiters, decimal commas, explicit subjects and XY coordinates',()=>{
    const groups=parseCsv('Subject;X;Control;Treated\nS1;1,5;10,25;20,5\nS2;2,5;11,75;21,8');
    expect(groups[0].observations[0]).toMatchObject({subject:'S1',x:1.5,value:10.25});
    expect(groups[1].observations[1]).toMatchObject({subject:'S2',x:2.5,value:21.8});
  });
  it('rejects malformed data rather than converting it to zero or silently dropping it',()=>{
    expect(()=>parseCsv('A,B\n1,n/a')).toThrow('Invalid value');
    expect(()=>parseCsv('A,A\n1,2')).toThrow('unique');
    expect(()=>parseCsv('Subject,A\nS1,1\nS1,2')).toThrow('Duplicate');
    expect(()=>parseCsv('A,B\n1,2,3')).toThrow('more columns');
  });
});

describe('reusable formatting',()=>{
  it('copies formatting independently of point overrides, annotations, and chart identity',()=>{
    const p=createProject(),target=p.charts[0],source=p.charts[1];
    target.pointStyles[p.groups[0].observations[0].id]={color:'#ff0000'};
    target.annotationPositions.test={dx:4,dy:-8};source.style.palette=['#123456'];source.style.fontSize=20;
    const applied=applyStyle(target,source,'all');
    expect(applied.style).toEqual(source.style);expect(applied.style).not.toBe(source.style);
    expect(applied.pointStyles).toEqual(target.pointStyles);expect(applied.annotationPositions).toEqual(target.annotationPositions);
    expect(applied.id).toBe(target.id);expect(applied.type).toBe(target.type);
    expect(p.groups[0].observations[0].value).toBe(28);
    applied.style.palette[0]='#ffffff';expect(source.style.palette[0]).toBe('#123456');
  });
  it('copies only selected style properties',()=>{
    const p=createProject(),[target,source]=p.charts;source.style.fontSize=28;source.style.palette=['#123456'];
    const applied=applyStyle(target,source,'colors');expect(applied.style.palette).toEqual(['#123456']);expect(applied.style.fontSize).toBe(target.style.fontSize);
  });
});

describe('analysis freshness',()=>{
  it('changes when measurements, subject identity, or parameters change; ignores aesthetic changes',()=>{
    const p=createProject(),fingerprint=dataFingerprint(p.groups,p.analysisConfig);
    p.charts[0].style.fontSize=30;expect(dataFingerprint(p.groups,p.analysisConfig)).toBe(fingerprint);
    expect(dataFingerprint(p.groups,{...p.analysisConfig,correction:'bonferroni'})).not.toBe(fingerprint);
    p.groups[0].observations[0].subject='another subject';expect(dataFingerprint(p.groups,p.analysisConfig)).not.toBe(fingerprint);
    p.groups[0].observations[0].subject='S01';p.groups[0].observations[0].value+=.001;expect(dataFingerprint(p.groups,p.analysisConfig)).not.toBe(fingerprint);
  });
});

it('migrates the previous brand autosave without overwriting the original project',()=>{const original=serializeProject(createProject());const storage=new Map([['prismatica.project.v1',original]]);vi.stubGlobal('localStorage',{getItem:(key:string)=>storage.get(key)??null,setItem:(key:string,value:string)=>storage.set(key,value)});const loaded=loadProject();saveProject(loaded);expect(storage.get('prismatica.project.v1')).toBe(original);expect(storage.get('plotstatlab.project.v1')).toBe(original);});
it('preserves existing fingerprints when exclusion is absent or explicitly false',()=>{const p=createProject();const original=dataFingerprint(p.groups,p.analysisConfig);p.groups[0].observations[0].excluded=false;expect(dataFingerprint(p.groups,p.analysisConfig)).toBe(original);p.groups[0].observations[0].excluded=true;expect(dataFingerprint(p.groups,p.analysisConfig)).not.toBe(original);});

it('opens the v0.1 project fixture without changing its analysis fingerprint or individual formatting',()=>{const p=parseProject(readFileSync(new URL('../examples/legacy-v0.1.json',import.meta.url),'utf8'));expect(dataFingerprint(p.groups,p.analysisConfig)).toBe(p.charts[0].analysis?.fingerprint);expect(p.charts[0].pointStyles['point-1-1'].color).toBe('#cc2288');expect(parseProject(serializeProject(p))).toEqual(p);});
