import {useEffect,useRef,useState} from 'react';
import {ArrowRight,Download,Plus,Trash2} from 'lucide-react';
import type {AnalysisConfig,AnalysisResult,AnalysisRun,Chart,Dataset,Project,Suggestion} from './types';
import {dataFingerprint,exportDownload} from './project';
import './analysis-workbench.css';

interface Props {
 project:Project; dataset:Dataset; chart:Chart;
 onConfigChange:(config:AnalysisConfig)=>void;
 onResult:(result:AnalysisResult)=>void;
 onAttach:(runId:string,chartId:string)=>void;
 onRenameRun:(id:string,name:string)=>void;
 onDeleteRun:(id:string)=>void;
 onFigure?:(chartId:string)=>void;
}
const annotationTypes=new Set(['bar-swarm','bar','swarm','box','violin','raincloud','paired']);
const number=(v:number|null|undefined)=>v==null?'—':v!==0&&Math.abs(v)<.0001?v.toExponential(4):Number(v.toPrecision(6)).toString();
const safeName=(name:string)=>name.replace(/[\\/:*?"<>|]/g,'_');
const csvCell=(v:unknown)=>{const text=String(v??'');return `"${(/^[=+@\-]/.test(text)&&typeof v!=='number'?"'":'')+text.replaceAll('"','""')}"`;};
export function analysisCsv(run:AnalysisRun,dataset:Dataset):string {
 const r=run.result,group=(id:string)=>dataset.groups.find(g=>g.id===id)?.name??id;
 const rows:unknown[][]=[['Analysis',run.name],['Dataset',dataset.name],['Method',r.testLabel],['Calculated',r.createdAt],['Engine',r.engine],['Fingerprint',r.fingerprint],['Design',r.config.design],['Correction',r.config.correction],['Alpha',r.config.alpha],['Overall statistic',r.statistic],['Overall p',r.p],[],['Group A','Group B','p','Adjusted p','Mean difference','CI lower','CI upper','Symbol'],...r.comparisons.map(c=>[group(c.groupA),group(c.groupB),c.p,c.adjustedP,c.effect,c.ci?.[0],c.ci?.[1],c.label]),[],['Group','Included n','Mean','SD','SEM'],...r.summaries.map(s=>[s.group,s.n,s.mean,s.sd,s.sem]),[],['Warnings'],...r.warnings.map(w=>[w])];
 return '\uFEFF'+rows.map(row=>row.map(csvCell).join(',')).join('\r\n');
}

export default function AnalysisPanel({project,dataset,chart,onConfigChange,onResult,onAttach,onRenameRun,onDeleteRun,onFigure}:Props){
 const config=dataset.analysisConfig;
 const [suggestions,setSuggestions]=useState<Suggestion[]>([]),[warnings,setWarnings]=useState<string[]>([]),[loading,setLoading]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
 const runs=(project.analysisRuns??[]).filter(r=>r.datasetId===dataset.id);
 const [selectedRunId,setSelectedRunId]=useState(runs.at(-1)?.id??'');
 const [targetChartId,setTargetChartId]=useState(chart.datasetId===dataset.id?chart.id:'');
 const requestVersion=useRef(0),latest=useRef({dataset,onResult});latest.current={dataset,onResult};
 const selectedIds=config.groupIds??dataset.groups.map(g=>g.id);
 const selectedGroups=dataset.groups.filter(g=>selectedIds.includes(g.id));
 const groupKey=JSON.stringify(selectedGroups);
 const run=runs.find(r=>r.id===selectedRunId)??runs.at(-1);
 const matchingCharts=project.charts.filter(c=>c.datasetId===dataset.id&&annotationTypes.has(c.type));
 const stale=!!run&&dataFingerprint(dataset.groups,run.result.config)!==run.result.fingerprint;
 const target=matchingCharts.find(c=>c.id===targetChartId)??matchingCharts[0];
 const linked=!!run&&!!target&&target.analysis?.createdAt===run.result.createdAt&&target.analysis.fingerprint===run.result.fingerprint;
 useEffect(()=>{setSelectedRunId(runs.at(-1)?.id??'')},[dataset.id,runs.at(-1)?.id]);
 useEffect(()=>{setError('');setMessage('')},[dataset.id]);
 useEffect(()=>{
  const controller=new AbortController();setLoading(true);setSuggestions([]);
  fetch('/api/suggest',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({groups:selectedGroups,design:config.design}),signal:controller.signal})
   .then(async response=>{const body=await response.json();if(!response.ok)throw new Error(typeof body.detail==='string'?body.detail:'Select at least two groups.');return body})
   .then(body=>{if(!controller.signal.aborted){setSuggestions(body.suggestions??[]);setWarnings(body.warnings??[])}})
   .catch(e=>{if(!controller.signal.aborted)setWarnings([e instanceof Error?e.message:'Statistics engine unavailable. Start the app with its launcher.'])})
   .finally(()=>{if(!controller.signal.aborted)setLoading(false)});
  return()=>controller.abort();
 },[dataset.id,groupKey,config.design]);
 function change(patch:Partial<AnalysisConfig>){onConfigChange({...config,...patch});setError('')}
 function toggleGroup(groupId:string){
  const ids=selectedIds.includes(groupId)?selectedIds.filter(id=>id!==groupId):[...selectedIds,groupId];
  const control=ids.includes(config.control)?config.control:ids[0]??'';
  const test=config.design==='paired'?(ids.length===2?'paired-t':'friedman'):(ids.length===2?'welch':'welch-anova');
  change({groupIds:ids,control,test});
 }
 async function calculate(){
  const version=++requestVersion.current,requestDatasetId=dataset.id,requestConfig=structuredClone(config),fingerprint=dataFingerprint(dataset.groups,requestConfig);
  setBusy(true);setError('');setMessage('');
  try{
   const response=await fetch('/api/analyze',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({groups:dataset.groups,config:requestConfig,fingerprint})});
   const body=await response.json();if(!response.ok)throw new Error(typeof body.detail==='string'?body.detail:'Check the selected groups and experimental design.');
   if(latest.current.dataset.id!==requestDatasetId||dataFingerprint(latest.current.dataset.groups,requestConfig)!==fingerprint)throw new Error('The dataset changed during calculation. Please run the analysis again.');
   latest.current.onResult(body as AnalysisResult);setMessage('New result saved in this workspace. Earlier results are kept.');
  }catch(e){if(version===requestVersion.current)setError(e instanceof Error?e.message:'Could not calculate the analysis.')}
  finally{if(version===requestVersion.current)setBusy(false)}
 }
 return <div className="analysis-workbench">
  <div className="section-intro"><div><h2>Analyze {dataset.name}</h2><p>Choose data, run a test, then send its comparisons to a figure. Every run is saved separately.</p></div><span className="engine-badge"><span/>Local computation</span></div>
  {dataset.advancedRows?.some(row=>row.factorB)&&<p className="analysis-warning">This panel compares factor A / group only. Use the advanced workbench to model both factors.</p>}
  <div className="analysis-grid">
   <section className="analysis-card"><h3>1. Choose columns and design</h3>
    <div className="analysis-group-choices">{dataset.groups.map(group=><label key={group.id}><input type="checkbox" checked={selectedIds.includes(group.id)} onChange={()=>toggleGroup(group.id)}/><span>{group.name}</span><small>n = {group.observations.filter(o=>!o.excluded).length}</small></label>)}</div>
    <p className="muted-note">Select two columns for a t-test, or several for a multiple-group test. Excluded values are omitted.</p>
    <label className="field"><span>Experimental design</span><select aria-label="Experimental design" value={config.design} onChange={e=>{const design=e.target.value as AnalysisConfig['design'];change({design,test:design==='paired'?(selectedGroups.length===2?'paired-t':'friedman'):(selectedGroups.length===2?'welch':'welch-anova')})}}><option value="independent">Independent groups</option><option value="paired">Paired / matched by subject ID</option></select></label>
    <p className="muted-note">The same subject IDs must be present in every selected paired column. Design depends on your experiment.</p>
    <h3>2. Choose a test</h3>
    {loading?<p role="status">Checking compatible tests…</p>:<div className="test-list">{suggestions.map(s=><label className={'test-option '+(config.test===s.id?'selected':'')} key={s.id}><input type="radio" name={`test-${dataset.id}`} value={s.id} checked={config.test===s.id} disabled={!s.compatible} onChange={()=>change({test:s.id,...(s.id==='anova-tukey'?{comparisons:'all' as const}:s.id==='anova-dunnett'?{comparisons:'control' as const}:{})})}/><span><strong>{s.label}{s.recommended&&<em>Suggested</em>}</strong><small>{s.reason}</small></span></label>)}</div>}
    {warnings.map((warning,i)=><p className="muted-note" key={i}>{warning}</p>)}
   </section>
   <section className="analysis-card"><h3>3. Comparison settings</h3>
    <label className="field"><span>Comparison family</span><select aria-label="Comparison family" value={config.comparisons} disabled={['anova-tukey','anova-dunnett'].includes(config.test)} onChange={e=>change({comparisons:e.target.value as AnalysisConfig['comparisons']})}><option value="control">Each selected group versus control</option><option value="all">All pairs of selected groups</option></select></label>
    {config.comparisons==='control'&&<label className="field"><span>Control group</span><select aria-label="Control group" value={config.control} onChange={e=>change({control:e.target.value})}>{selectedGroups.map(group=><option key={group.id} value={group.id}>{group.name}</option>)}</select></label>}
    <label className="field"><span>Multiple comparison correction</span><select aria-label="Multiple comparison correction" value={config.correction} disabled={['anova-tukey','anova-dunnett'].includes(config.test)} onChange={e=>change({correction:e.target.value as AnalysisConfig['correction']})}><option value="holm">Holm</option><option value="bonferroni">Bonferroni</option><option value="bh">Benjamini–Hochberg (FDR)</option><option value="none">None</option></select></label>
    {['anova-tukey','anova-dunnett'].includes(config.test)&&<p className="muted-note">This method applies its own adjustment.</p>}
    <label className="field"><span>Significance level (alpha)</span><select aria-label="Significance level" value={config.alpha} onChange={e=>change({alpha:Number(e.target.value)})}><option value="0.05">0.05</option><option value="0.01">0.01</option><option value="0.001">0.001</option></select></label>
    <div className="analysis-preview"><strong>{suggestions.find(s=>s.id===config.test)?.label??'Select a compatible test'}</strong><span>{selectedGroups.length} selected columns · {selectedGroups.reduce((n,g)=>n+g.observations.filter(o=>!o.excluded).length,0)} included values</span><small>Two-sided tests. Each calculation creates a new saved result.</small></div>
    <button className="button primary wide" disabled={busy||loading||!suggestions.some(s=>s.id===config.test&&s.compatible)} onClick={()=>void calculate()}><Plus size={16}/>{busy?'Calculating…':'Run and save new analysis'}</button>
    {error&&<p className="analysis-warning" role="alert">{error}</p>}{message&&<p className="analysis-success" role="status">{message}</p>}
   </section>
  </div>
  <section className="results-card saved-analysis-results"><div className="results-heading"><div><span className="eyebrow">SAVED RESULTS · {runs.length}</span><h2>Analyses for {dataset.name}</h2></div><p className="muted-note">Included when you save this workspace.</p></div>
   {!runs.length?<p className="workspace-empty">Run a test above to create your first saved result. You can run several tests on the same data.</p>:<>
    <div className="saved-analysis-toolbar"><label className="field"><span>Open saved result</span><select aria-label="Open saved result" value={run?.id??''} onChange={e=>setSelectedRunId(e.target.value)}>{runs.map(r=><option key={r.id} value={r.id}>{r.name} · {new Date(r.result.createdAt).toLocaleString('en-GB')}</option>)}</select></label>{run&&<><button className="button compact" onClick={()=>exportDownload(`${safeName(run.name)}.csv`,analysisCsv(run,dataset),'text/csv;charset=utf-8')}><Download size={14}/>Results CSV</button><button className="button compact" onClick={()=>exportDownload(`${safeName(run.name)}.json`,JSON.stringify({format:'PlotStatLab analysis',version:1,dataset:{id:dataset.id,name:dataset.name,groups:dataset.groups.map(g=>({id:g.id,name:g.name}))},analysis:run},null,2),'application/json')}><Download size={14}/>Results JSON</button></>}</div>
    {run&&<article className={stale?'results-stale':''} key={run.id}>
     <label className="field"><span>Result name</span><input aria-label="Result name" defaultValue={run.name} onBlur={e=>{const name=e.target.value.trim();if(name&&name!==run.name)onRenameRun(run.id,name);else e.target.value=run.name}} onKeyDown={e=>{if(e.key==='Enter')e.currentTarget.blur()}}/></label>
     <h3>{run.result.testLabel}</h3>{stale&&<p className="analysis-warning" role="status">Data changed after this result was calculated. It is retained for reference; run a new analysis before annotating a figure.</p>}
     <div className="result-metrics"><div><small>Overall statistic</small><strong>{number(run.result.statistic)}</strong></div><div><small>Overall p</small><strong>{number(run.result.p)}</strong></div><div><small>Correction</small><span>{run.result.test==='anova-tukey'?'Tukey HSD':run.result.test==='anova-dunnett'?'Dunnett':run.result.config.correction}</span></div><div><small>Calculated</small><span>{new Date(run.result.createdAt).toLocaleString('en-GB')}</span></div></div>
     <div className="table-scroll"><table className="results-table"><thead><tr><th>Comparison</th><th>p</th><th>Adjusted p</th><th>Mean difference</th><th>CI {Math.round((1-run.result.config.alpha)*100)}%</th><th>Symbol</th></tr></thead><tbody>{run.result.comparisons.map(c=><tr key={c.id}><td>{dataset.groups.find(g=>g.id===c.groupA)?.name??c.groupA} vs. {dataset.groups.find(g=>g.id===c.groupB)?.name??c.groupB}</td><td>{number(c.p)}</td><td>{number(c.adjustedP)}</td><td>{number(c.effect)}</td><td>{c.ci?`${number(c.ci[0])} to ${number(c.ci[1])}`:'—'}</td><td><span className={'significance-tag '+(c.adjustedP<run.result.config.alpha?'significant':'')}>{c.label}</span></td></tr>)}</tbody></table></div>
     <div className="analysis-annotation-action"><div><strong>4. Add comparisons to a figure</strong><p>Figures below use {dataset.name}. Any compared columns missing from your figure are added when you apply the result. Non-significant comparisons are labelled “ns”.</p></div>{matchingCharts.length?<><label className="field"><span>Target figure</span><select aria-label="Target figure" value={target?.id??''} onChange={e=>setTargetChartId(e.target.value)}>{matchingCharts.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label><button className="button primary" disabled={stale||!target} onClick={()=>{onAttach(run.id,target!.id);setMessage('Comparisons linked to the selected figure. Click Open figure to edit them.')}}>Add stars / ns to figure</button>{target&&onFigure&&<button className="button" onClick={()=>onFigure(target.id)}>Open figure<ArrowRight size={14}/></button>}{linked&&<span className="analysis-linked">Linked to {target!.name}</span>}</>:<p className="muted-note">Create a group figure (for example Bar + swarm) from this dataset to add comparisons.</p>}</div>
     <details className="analysis-details"><summary>Method, assumptions and warnings</summary>{run.result.warnings.map((warning,i)=><p className="muted-note" key={i}>{warning}</p>)}<p className="muted-note">{run.result.engine} · Design: {run.result.config.design}. Symbols use conventional p thresholds.</p></details>
     <button className="button danger compact" onClick={()=>onDeleteRun(run.id)}><Trash2 size={14}/>Remove saved result</button>
    </article>}
   </>}
  </section>
 </div>;
}
