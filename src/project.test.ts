import {readFileSync} from 'node:fs';
import {afterEach,describe,it,expect,vi} from 'vitest';
import {applyStyle,createChart,createProject,dataFingerprint,getLoadWarning,loadProject,parseCsv,parseDataTable,parseProject,reconcileProject,saveProject,serializeProject} from './project';
import {appendDatasets,normalizeWorkspace} from './workspace';
import type {Project} from './types';

function addAnalysis(project:Project):void {
  project.charts[0].analysis={test:'welch',testLabel:'Welch',engine:'SciPy',statistic:2,p:.01,
    fingerprint:'test',config:{...project.analysisConfig},createdAt:new Date().toISOString(),summaries:[],warnings:[],
    comparisons:[{id:'control-low',groupA:project.groups[0].id,groupB:project.groups[2].id,p:.01,adjustedP:.02,label:'*'}]};
}
afterEach(()=>vi.unstubAllGlobals());

describe('editable project persistence',()=>{
  it('validates figure column selections against their own dataset and requires a nonempty unique selection',()=>{
    const project=appendDatasets(normalizeWorkspace(createProject()),[{name:'Other data',groups:parseCsv('Other\n1\n2')}],()=>createChart());
    project.charts[0].groupIds=[project.datasets![0].groups[0].id];
    expect(()=>parseProject(JSON.stringify(project))).not.toThrow();
    project.charts[0].groupIds=[];expect(()=>parseProject(JSON.stringify(project))).toThrow('at least one column');
    project.charts[0].groupIds=[project.datasets![0].groups[0].id,project.datasets![0].groups[0].id];expect(()=>parseProject(JSON.stringify(project))).toThrow('duplicate chart columns');
    project.charts[0].groupIds=[project.datasets![1].groups[0].id];expect(()=>parseProject(JSON.stringify(project))).toThrow('missing column');
  });
  it('reconciles removed columns and cross-dataset point overrides without mutating the original chart',()=>{
    const project=appendDatasets(normalizeWorkspace(createProject()),[{name:'Other data',groups:parseCsv('Other\n1\n2')}],()=>createChart());
    const chart=project.charts[0],own=project.datasets![0].groups[0],foreign=project.datasets![1].groups[0];
    chart.groupIds=[own.id,'removed'];chart.pointStyles[own.observations[0].id]={color:'#aabbcc'};chart.pointStyles[foreign.observations[0].id]={color:'#ccaaee'};
    const reconciled=reconcileProject(project);expect(reconciled.charts[0].groupIds).toEqual([own.id]);expect(reconciled.charts[0].pointStyles).toEqual({[own.observations[0].id]:{color:'#aabbcc'}});
    expect(chart.groupIds).toEqual([own.id,'removed']);chart.groupIds=['removed'];expect(reconcileProject(project).charts[0].groupIds).toBeUndefined();
  });
  it('validates stored analysis links and accepts semantically equal results independent of JSON key order',()=>{
    const project=normalizeWorkspace(createProject());addAnalysis(project);const chart=project.charts[0],result=structuredClone(chart.analysis!);
    project.analysisRuns=[{id:'saved-run',datasetId:project.activeDatasetId!,name:'First analysis',result}];chart.analysisRunId='saved-run';
    chart.analysis=Object.fromEntries(Object.entries(result).reverse()) as typeof result;
    expect(parseProject(JSON.stringify(project)).charts[0].analysisRunId).toBe('saved-run');
    chart.analysisRunId='missing';expect(()=>parseProject(JSON.stringify(project))).toThrow('missing saved analysis');
    chart.analysisRunId='saved-run';project.analysisRuns[0].datasetId='missing';expect(()=>parseProject(JSON.stringify(project))).toThrow('analysis dataset');
    project.analysisRuns[0].datasetId=project.activeDatasetId!;chart.analysis.statistic=7;expect(()=>parseProject(JSON.stringify(project))).toThrow('does not match');
    const detached=reconcileProject(project);expect(detached.charts[0].analysisRunId).toBeUndefined();expect(detached.charts[0].analysis?.statistic).toBe(7);expect(project.analysisRuns[0].result.statistic).toBe(2);
    const other=appendDatasets(project,[{name:'Second dataset',groups:parseCsv('Other\n1\n2')}],()=>createChart());other.analysisRuns![0].datasetId=other.activeDatasetId!;expect(()=>parseProject(JSON.stringify(other))).toThrow('different dataset');
  });
  it('keeps historical selected columns and linked results after measurements or groups are removed',()=>{
    const project=normalizeWorkspace(createProject());addAnalysis(project);const chart=project.charts[0],removed=project.groups[0].id;
    chart.analysis!.config.groupIds=[removed,project.groups[2].id];chart.groupIds=[removed];
    project.analysisRuns=[{id:'saved-run',datasetId:project.activeDatasetId!,name:'First analysis',result:structuredClone(chart.analysis!)}];chart.analysisRunId='saved-run';
    project.groups=project.groups.slice(1);project.datasets![0].groups=project.groups;
    const reopened=parseProject(serializeProject(project));expect(reopened.charts[0].groupIds).toBeUndefined();expect(reopened.charts[0].analysisRunId).toBe('saved-run');expect(reopened.analysisRuns![0].result.config.groupIds).toContain(removed);
  });
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
  it('detects descriptive columns, keeps their original text and accepts missing measurements',()=>{
    const groups=parseCsv('Mouse code;Sex;Control;Treatment\nM1;female;1,5;3\nM2;male;NA;4,2\nM3;female;2,5;N/A');
    expect(groups.map(g=>g.name)).toEqual(['Control','Treatment']);
    expect(groups[0].observations.map(o=>[o.value,o.subject])).toEqual([[1.5,'M1 · female'],[2.5,'M3 · female']]);
    expect(groups[0].observations[0].labels).toEqual({'Mouse code':'M1',Sex:'female'});
    expect(groups[1].observations.map(o=>o.value)).toEqual([3,4.2]);
  });
  it('retains explicit IDs, multiple label columns and repeated descriptive labels',()=>{
    const groups=parseCsv('Subject,Label,Batch,Control,Treated\nS1,mouse,alpha,1,2\nS2,mouse,alpha,3,4');
    expect(groups[0].observations.map(o=>o.subject)).toEqual(['S1','S2']);
    expect(groups[1].observations[0].labels).toEqual({Label:'mouse',Batch:'alpha'});
    expect(parseCsv('Label,A\nmouse,1\nmouse,2')[0].observations.map(o=>o.subject)).toEqual(['mouse','mouse [row 2]']);
  });
  it('handles a blank row-label header and explains text inside measurement columns',()=>{
    expect(parseCsv('\tControl\nMouse A\t2\nMouse B\t3')[0].observations[0].subject).toBe('Mouse A');
    expect(()=>parseCsv('Label,A\nmouse1,1\nmouse2,broken')).toThrow('mixes numbers and text');
  });
  it('imports JSON records, named arrays and groups without dropping labels or exclusions',()=>{
    expect(parseDataTable('[{"Label":"A","Control":1,"Treated":2},{"Label":"B","Control":3,"Treated":4}]')[1].observations[1].subject).toBe('B');
    expect(parseDataTable('{"Control":[1,null,3],"Treated":[2,4,6]}')[0].observations.map(o=>o.subject)).toEqual(['row-1','row-3']);
    expect(parseDataTable('{"groups":[{"name":"A","observations":[{"value":2,"label":"mouse","excluded":true,"labels":{"Sex":"female"}}]}]}')[0].observations[0]).toMatchObject({value:2,subject:'mouse',excluded:true,labels:{Sex:'female'}});
    expect(()=>parseDataTable('{"Control":[1,"oops"]}')).toThrow('Invalid numeric value');
  });
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

it('retains visual text, line breaks and Y-title distance through workspace files and axis style transfer',()=>{
 const project=createProject(),chart=project.charts[0];chart.title='<i>Gene A</i>\nResponse';chart.xLabel='Treatment\nDose';chart.yLabel='<b>Signal</b>\n(a.u.)';chart.style.yLabelDistance=140;
 const reopened=parseProject(serializeProject(project));expect(reopened.charts[0]).toEqual(chart);expect(applyStyle(project.charts[1],chart,'axes').style.yLabelDistance).toBe(140);
 chart.style.yLabelDistance=NaN;expect(()=>parseProject(JSON.stringify(project))).toThrow('yLabelDistance');chart.style.yLabelDistance=241;expect(()=>parseProject(JSON.stringify(project))).toThrow('yLabelDistance');
});
it('preserves empty table rows and descriptive labels and rejects duplicate or invalid row identities',()=>{
 const project=normalizeWorkspace(createProject());project.datasets![0].tableRows=[{subject:'Sample 1',labels:{Cell:'A'}},{subject:'Sample 2',labels:{Cell:'B'}}];
 expect(parseProject(serializeProject(project)).datasets![0].tableRows).toEqual(project.datasets![0].tableRows);
 project.datasets![0].tableRows!.push({subject:'Sample 1'});expect(()=>parseProject(JSON.stringify(project))).toThrow('duplicate table row');
 project.datasets![0].tableRows=[{subject:''}];expect(()=>parseProject(JSON.stringify(project))).toThrow('tableRow.subject');
});
