import {rowsForDataset,resultForChart} from './advancedData';
import {useMemo,useState} from 'react';
import {ArrowDown,ArrowUp,Download,FileImage,Grid2X2} from 'lucide-react';
import type {Project} from './types';
import type {PublicationSettings} from './publication';
import ChartView from './ChartView';
import {dataFingerprint,outlierFingerprint,exportDownload} from './project';
import {datasetForChart} from './workspace';
import {publicationSettings,publicationGeometry,publicationChart,publicationPresets,serializePublication,renderPublicationPng,publicationZip,safeFilename} from './publication';
import {serializeFigureSvg} from './export';
import './publication.css';

interface Props {project:Project;onChange:(settings:PublicationSettings)=>void;onEditChart?:(id:string)=>void}
const fmt=(value:number)=>Number(value.toFixed(2)).toString();
function Numeric({label,value,min,max,step=1,onChange}:{label:string;value:number;min:number;max:number;step?:number;onChange:(n:number)=>void}){return <label className="field"><span>{label}</span><input type="number" min={min} max={max} step={step} value={value} onChange={e=>{if(e.target.value!==''&&Number.isFinite(e.target.valueAsNumber))onChange(Math.min(max,Math.max(min,e.target.valueAsNumber)))}}/></label>}

export default function PublicationView({project,onChange,onEditChart}:Props){
 const settings=publicationSettings(project.publication,project.charts.map(c=>c.id));
 const charts=settings.chartIds.flatMap(id=>{const chart=project.charts.find(c=>c.id===id);return chart?[publicationChart(chart,settings)]:[]});
 const geometry=publicationGeometry(settings,charts.length),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[error,setError]=useState('');
 const chartIds=useMemo(()=>new Set(settings.chartIds),[settings.chartIds]);
 const change=(patch:Partial<PublicationSettings>)=>onChange({...settings,...patch});
 function toggle(id:string){change({chartIds:chartIds.has(id)?settings.chartIds.filter(i=>i!==id):[...settings.chartIds,id]})}
 function move(index:number,delta:number){const ids=[...settings.chartIds],target=index+delta;if(target<0||target>=ids.length)return;[ids[index],ids[target]]=[ids[target],ids[index]];change({chartIds:ids})}
 function sources(){return charts.map(chart=>{const source=document.getElementById(`publication-${chart.id}`) as SVGSVGElement|null;if(!source)throw new Error('A selected figure is not ready.');return{chart,source}})}
 async function download(format:'svg'|'png',batch=false){
  setBusy(true);setError('');setMessage('');
  try{
   if(document.fonts)await document.fonts.ready;
   const panels=sources();
   if(!panels.length)throw new Error('Choose at least one figure.');
   if(batch){
    const files: {name:string;content:Uint8Array}[]=[];
    for(let i=0;i<panels.length;i++){
     const {chart,source}=panels[i],serialized=serializeFigureSvg(chart,source),name=`${String(i+1).padStart(2,'0')}-${safeFilename(chart.name)}.${format}`;
     if(format==='svg'){
      const doc=new DOMParser().parseFromString(serialized,'image/svg+xml'),svg=doc.documentElement,widthMm=settings.widthMm*settings.panelWidth/geometry.width;
      svg.setAttribute('width',`${widthMm}mm`);svg.setAttribute('height',`${widthMm*settings.panelHeight/settings.panelWidth}mm`);
      files.push({name,content:new TextEncoder().encode(`<?xml version="1.0" encoding="UTF-8"?>\n${new XMLSerializer().serializeToString(svg)}`)});
     }else{
      const pixelWidth=Math.round(geometry.pixelWidth*settings.panelWidth/geometry.width),blob=await renderPublicationPng(serialized,pixelWidth,Math.round(pixelWidth*settings.panelHeight/settings.panelWidth),settings.dpi);
      files.push({name,content:new Uint8Array(await blob.arrayBuffer())});
     }
    }
    exportDownload(`${safeFilename(settings.name)}-${format}-panels.zip`,publicationZip(files),'application/zip');setMessage(`${panels.length} editable figures exported in a ZIP archive.`);
   }else{
    const serialized=serializePublication(settings,panels),content=format==='svg'?serialized:await renderPublicationPng(serialized,geometry.pixelWidth,geometry.pixelHeight,settings.dpi);
    exportDownload(`${safeFilename(settings.name)}.${format}`,content,format==='svg'?'image/svg+xml;charset=utf-8':'image/png');setMessage(`Publication ${format.toUpperCase()} exported.`);
   }
  }catch(e){setError((e as Error).message)}finally{setBusy(false)}
 }
 return <div className="content-scroll publication-view">
  <div className="section-intro"><div><h2>Ready for publication.</h2><p>Arrange figures from any dataset. Match typography, align panels and export at a precise print size.</p></div><Grid2X2 size={23}/></div>
  <div className="publication-workbench">
   <aside className="publication-controls">
    <section><h3>Layout</h3><label className="field"><span>Figure name</span><input value={settings.name} maxLength={300} onChange={e=>change({name:e.target.value})}/></label>
     <label className="field"><span>Publication size preset</span><select value={settings.preset} onChange={e=>{const preset=publicationPresets.find(p=>p.id===e.target.value)!;change({preset:preset.id,widthMm:preset.widthMm,dpi:preset.dpi})}}>{publicationPresets.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select><small>Size templates. Check the journal's current submission format and text requirements.</small></label>
     <div className="publication-fields"><Numeric label="Print width (mm)" value={settings.widthMm} min={25} max={1000} step={.1} onChange={widthMm=>change({widthMm,preset:'custom'})}/><Numeric label="PNG resolution (DPI)" value={settings.dpi} min={72} max={1200} onChange={dpi=>change({dpi,preset:'custom'})}/><Numeric label="Columns" value={settings.columns} min={1} max={4} onChange={columns=>change({columns:Math.round(columns)})}/><Numeric label="Gap (drawing units)" value={settings.gap} min={0} max={160} onChange={gap=>change({gap})}/><Numeric label="Panel width" value={settings.panelWidth} min={400} max={1600} onChange={panelWidth=>change({panelWidth})}/><Numeric label="Panel height" value={settings.panelHeight} min={300} max={1200} onChange={panelHeight=>change({panelHeight})}/><Numeric label="Outer margin" value={settings.padding} min={0} max={160} onChange={padding=>change({padding})}/></div>
     <label className="toggle"><span>A / B / C panel labels</span><input type="checkbox" checked={settings.labels} onChange={e=>change({labels:e.target.checked})}/></label><label className="toggle"><span>Legends in every panel</span><input type="checkbox" checked={settings.legend} onChange={e=>change({legend:e.target.checked})}/></label>
     <p className="muted-note">Panels share their drawing dimensions and legend spacing, so plot edges align. Original figure settings are preserved.</p>
    </section>
    <section><h3>Shared typography</h3><label className="toggle"><span>Use the same fonts</span><input type="checkbox" checked={settings.sharedTypography} onChange={e=>change({sharedTypography:e.target.checked})}/></label>{settings.sharedTypography&&<><label className="field"><span>Font</span><select value={settings.fontFamily} onChange={e=>change({fontFamily:e.target.value})}>{['Arial','Helvetica','Georgia','Times New Roman','Verdana','Courier New'].map(font=><option key={font}>{font}</option>)}</select></label><div className="publication-fields"><Numeric label="Label size (pt)" value={settings.fontSize} min={5} max={24} step={.5} onChange={fontSize=>change({fontSize})}/><Numeric label="Title size (pt)" value={settings.titleSize} min={6} max={36} step={.5} onChange={titleSize=>change({titleSize})}/></div></>}<p className="muted-note">Scientific text supports H_&#123;2&#125;O, 10^&#123;−3&#125;, *italic* and **bold** in the figure editor.</p></section>
    <section><h3>Figures and order</h3><div className="publication-choices">{project.charts.map(chart=><label key={chart.id}><input type="checkbox" checked={chartIds.has(chart.id)} onChange={()=>toggle(chart.id)}/><span>{chart.name}<small>{datasetForChart(project,chart).name}</small></span></label>)}</div>{settings.chartIds.map((chartId,index)=>{const chart=project.charts.find(c=>c.id===chartId);return chart?<div className="publication-order" key={chartId}><span>{geometry.panels[index]?.label}. {chart.name}</span><button className="icon-button" aria-label={`Move ${chart.name} earlier`} disabled={index===0} onClick={()=>move(index,-1)}><ArrowUp size={14}/></button><button className="icon-button" aria-label={`Move ${chart.name} later`} disabled={index===settings.chartIds.length-1} onClick={()=>move(index,1)}><ArrowDown size={14}/></button>{onEditChart&&<button className="text-button" onClick={()=>onEditChart(chart.id)}>Edit</button>}</div>:null})}</section>
   </aside>
   <section className="publication-preview">
    <div className="publication-export"><div><strong>{fmt(geometry.widthMm)} × {fmt(geometry.heightMm)} mm</strong><small>{geometry.pixelWidth} × {geometry.pixelHeight} px at {settings.dpi} DPI</small></div><button className="button primary" disabled={busy||!charts.length} onClick={()=>download('svg')}><Download size={15}/>Export SVG</button><button className="button" disabled={busy||!charts.length} onClick={()=>download('png')}><FileImage size={15}/>Export PNG</button><details><summary>Batch export</summary><button className="text-button" disabled={busy||!charts.length} onClick={()=>download('svg',true)}>SVG panels (.zip)</button><button className="text-button" disabled={busy||!charts.length} onClick={()=>download('png',true)}>PNG panels (.zip)</button></details></div>
    {error&&<p className="publication-error" role="alert">{error}</p>}{message&&<p className="publication-message" role="status">{message}</p>}{busy&&<p className="muted-note" role="status">Preparing export…</p>}
    {settings.sharedTypography&&charts.some(c=>c.style.fontSize>36)&&<p className="publication-error">Narrow panels may crowd labels at this print size. Increase the print width, reduce columns or use smaller text.</p>}{charts.length?<div className="publication-artboard"><svg xmlns="http://www.w3.org/2000/svg" width={geometry.width} height={geometry.height} viewBox={`0 0 ${geometry.width} ${geometry.height}`} role="img" aria-label={`${settings.name}, ${charts.length} aligned panels`}><rect width={geometry.width} height={geometry.height} fill="#ffffff"/>{charts.map((chart,index)=>{const dataset=datasetForChart(project,chart),stale=!!chart.analysis&&chart.analysis.fingerprint!==dataFingerprint(dataset.groups,chart.analysis.config),panel=geometry.panels[index];return <g key={chart.id} transform={`translate(${panel.x},${panel.y})`}><ChartView svgId={`publication-${chart.id}`} chart={chart} groups={dataset.groups} advancedRows={rowsForDataset(dataset)} advancedResult={resultForChart(dataset,chart)} selection={{kind:'chart'}} onSelect={()=>{}} onAnnotationMove={()=>{}} analysisStale={stale} flaggedIds={dataset.outlierAnalysis?.fingerprint===outlierFingerprint(dataset.groups)?dataset.outlierAnalysis.groups.flatMap(g=>g.flaggedIds):[]}/>{settings.labels&&<text x={12} y={30} fontFamily={settings.sharedTypography?settings.fontFamily:chart.style.fontFamily} fontSize={9*geometry.width/(settings.widthMm/25.4*72)} fontWeight={700} fill="#202b28">{panel.label}</text>}</g>})}</svg></div>:<div className="publication-empty"><Grid2X2 size={30}/><p>Choose figures to compose a publication layout.</p></div>}
    <p className="muted-note">SVG keeps live text and independent vectors. PNG includes print-resolution metadata. This layout and its settings are saved with the workspace.</p>
   </section>
  </div>
 </div>;
}
