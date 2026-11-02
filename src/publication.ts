import type {Chart} from './types';
import {serializeFigureSvg} from './export';

export interface PublicationSettings {
 name:string;chartIds:string[];columns:number;widthMm:number;dpi:number;
 panelWidth:number;panelHeight:number;gap:number;padding:number;labels:boolean;
 sharedTypography:boolean;fontFamily:string;fontSize:number;titleSize:number;
 legend:boolean;preset:string;
}
export const publicationPresets=[
 {id:'single',name:'Single column · 85 mm',widthMm:85,dpi:300},
 {id:'wide',name:'Double column · 180 mm',widthMm:180,dpi:300},
 {id:'nature-single',name:'Nature single column · 90 mm',widthMm:90,dpi:300},
 {id:'nature-double',name:'Nature double column · 180 mm',widthMm:180,dpi:300},
 {id:'plos-column',name:'PLOS text width · 132 mm',widthMm:132,dpi:300},
 {id:'plos-full',name:'PLOS full width · 190.5 mm',widthMm:190.5,dpi:300},
 {id:'presentation',name:'Presentation · 254 mm',widthMm:254,dpi:150},
 {id:'custom',name:'Custom dimensions',widthMm:180,dpi:300},
];
export function defaultPublication(chartIds:string[]=[]):PublicationSettings{return {
 name:'Publication figure',chartIds,columns:Math.min(2,Math.max(1,chartIds.length)),widthMm:180,dpi:300,
 panelWidth:800,panelHeight:560,gap:24,padding:16,labels:true,sharedTypography:true,
 fontFamily:'Arial',fontSize:8,titleSize:11,legend:true,preset:'wide',
}}
const finiteRange=(v:unknown,min:number,max:number)=>typeof v==='number'&&Number.isFinite(v)&&v>=min&&v<=max;
export function validPublication(value:unknown,chartIds:string[]):value is PublicationSettings {
 if(!value||typeof value!=='object')return false;
 const v=value as PublicationSettings;
 return typeof v.name==='string'&&v.name.length<=300&&Array.isArray(v.chartIds)&&v.chartIds.length<=100&&
  v.chartIds.every(id=>typeof id==='string'&&chartIds.includes(id))&&new Set(v.chartIds).size===v.chartIds.length&&
  Number.isInteger(v.columns)&&finiteRange(v.columns,1,4)&&finiteRange(v.widthMm,25,1000)&&finiteRange(v.dpi,72,1200)&&
  finiteRange(v.panelWidth,400,1600)&&finiteRange(v.panelHeight,300,1200)&&finiteRange(v.gap,0,160)&&finiteRange(v.padding,0,160)&&
  typeof v.labels==='boolean'&&typeof v.sharedTypography==='boolean'&&typeof v.legend==='boolean'&&
  typeof v.fontFamily==='string'&&v.fontFamily.length>0&&v.fontFamily.length<=100&&finiteRange(v.fontSize,5,24)&&
  finiteRange(v.titleSize,6,36)&&typeof v.preset==='string'&&publicationPresets.some(p=>p.id===v.preset);
}
export function publicationSettings(value:unknown,chartIds:string[]):PublicationSettings {
 return validPublication(value,chartIds)?value:defaultPublication(chartIds.slice(0,4));
}
export function panelLabel(index:number):string {
 let n=index+1,label='';while(n>0){n--;label=String.fromCharCode(65+n%26)+label;n=Math.floor(n/26)}return label;
}
export function publicationGeometry(settings:PublicationSettings,count=settings.chartIds.length){
 const columns=Math.max(1,Math.min(settings.columns,Math.max(count,1))),rows=Math.max(1,Math.ceil(count/columns));
 const width=2*settings.padding+columns*settings.panelWidth+(columns-1)*settings.gap;
 const height=2*settings.padding+rows*settings.panelHeight+(rows-1)*settings.gap;
 const pixelWidth=Math.round(settings.widthMm/25.4*settings.dpi),pixelHeight=Math.round(pixelWidth*height/width);
 return {columns,rows,width,height,widthMm:settings.widthMm,heightMm:settings.widthMm*height/width,pixelWidth,pixelHeight,
  panels:Array.from({length:count},(_,i)=>({x:settings.padding+(i%columns)*(settings.panelWidth+settings.gap),y:settings.padding+Math.floor(i/columns)*(settings.panelHeight+settings.gap),label:panelLabel(i)}))};
}
export function publicationChart(chart:Chart,settings:PublicationSettings):Chart {
 const unitsPerPoint=publicationGeometry(settings).width/(settings.widthMm/25.4*72);
 return {...chart,style:{...chart.style,width:settings.panelWidth,height:settings.panelHeight,legend:settings.legend,
  ...(settings.sharedTypography?{fontFamily:settings.fontFamily,fontSize:settings.fontSize*unitsPerPoint,titleSize:settings.titleSize*unitsPerPoint}:{})}};
}
export function safeFilename(value:string){
 const name=value.replace(/[<>:"/\\|?*\u0000-\u001f]/g,'-').trim().replace(/[. ]+$/,'')||'figure';
 return /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name)?`PSL-${name}`:name;
}
const SVG_NS='http://www.w3.org/2000/svg';

/** Namespace every panel ID/reference so clip paths never cross panel boundaries. */
export function prefixSvgIds(root:SVGSVGElement,prefix:string){
 const ids=new Map<string,string>();
 for(const el of [root,...root.querySelectorAll('[id]')])if(el.id){ids.set(el.id,`${prefix}-${el.id}`);el.id=`${prefix}-${el.id}`}
 for(const el of [root,...root.querySelectorAll('*')])for(const attr of [...el.attributes]){
  const value=attr.value.replace(/url\(\s*(['"]?)#([^)'"\s]+)\1\s*\)/g,(_all,_quote,id:string)=>`url(#${ids.get(id)??id})`);
  if(value!==attr.value)el.setAttribute(attr.name,value);
  else if((attr.name==='href'||attr.name==='xlink:href')&&attr.value.startsWith('#')&&ids.has(attr.value.slice(1)))el.setAttribute(attr.name,`#${ids.get(attr.value.slice(1))}`);
 }
}

export function serializePublication(settings:PublicationSettings,panels:{chart:Chart;source:SVGSVGElement}[]):string {
 if(!panels.length)throw new Error('Choose at least one figure for the publication layout.');
 const geometry=publicationGeometry(settings,panels.length),doc=document.implementation.createDocument(SVG_NS,'svg'),svg=doc.documentElement;
 svg.setAttribute('version','1.1');svg.setAttribute('width',`${geometry.widthMm}mm`);svg.setAttribute('height',`${Number(geometry.heightMm.toFixed(6))}mm`);svg.setAttribute('viewBox',`0 0 ${geometry.width} ${geometry.height}`);
 const title=doc.createElementNS(SVG_NS,'title');title.textContent=settings.name;svg.appendChild(title);
 const description=doc.createElementNS(SVG_NS,'desc');description.textContent='PlotStatLab publication layout. Every panel, observation and scientific label remains editable vector artwork.';svg.appendChild(description);
 const background=doc.createElementNS(SVG_NS,'rect');background.setAttribute('width',String(geometry.width));background.setAttribute('height',String(geometry.height));background.setAttribute('fill','#ffffff');svg.appendChild(background);
 panels.forEach(({chart,source},i)=>{
  const parsed=new DOMParser().parseFromString(serializeFigureSvg(chart,source),'image/svg+xml');
  if(parsed.querySelector('parsererror'))throw new Error('Could not prepare a vector panel.');
  const panel=doc.importNode(parsed.documentElement,true) as unknown as SVGSVGElement;prefixSvgIds(panel,`PSL-panel-${panelLabel(i)}`);
  panel.setAttribute('x',String(geometry.panels[i].x));panel.setAttribute('y',String(geometry.panels[i].y));panel.setAttribute('width',String(settings.panelWidth));panel.setAttribute('height',String(settings.panelHeight));
  svg.appendChild(panel);
  if(settings.labels){const label=doc.createElementNS(SVG_NS,'text');label.setAttribute('id',`PSL-panel-label-${panelLabel(i)}`);label.setAttribute('x',String(geometry.panels[i].x+12));label.setAttribute('y',String(geometry.panels[i].y+30));label.setAttribute('font-family',settings.sharedTypography?settings.fontFamily:chart.style.fontFamily);label.setAttribute('font-size',String(9*geometry.width/(settings.widthMm/25.4*72)));label.setAttribute('font-weight','700');label.setAttribute('fill','#202b28');label.textContent=panelLabel(i);svg.appendChild(label)}
 });
 return `<?xml version="1.0" encoding="UTF-8"?>\n${new XMLSerializer().serializeToString(svg)}`;
}

const crcTable=Array.from({length:256},(_,n)=>{for(let k=0;k<8;k++)n=n&1?0xedb88320^(n>>>1):n>>>1;return n>>>0});
export function crc32(bytes:Uint8Array):number {let c=0xffffffff;for(const b of bytes)c=crcTable[(c^b)&255]^(c>>>8);return(c^0xffffffff)>>>0}
const u32=(value:number)=>new Uint8Array([(value>>>24)&255,(value>>>16)&255,(value>>>8)&255,value&255]);
function joinBytes(parts:Uint8Array[]):Uint8Array {const result=new Uint8Array(parts.reduce((n,p)=>n+p.length,0));let offset=0;for(const part of parts){result.set(part,offset);offset+=part.length}return result}

/** Canvas omits print resolution. Add standard PNG pHYs metadata, preserving image bytes. */
export function pngWithDpi(bytes:Uint8Array,dpi:number):Uint8Array {
 const signature=[137,80,78,71,13,10,26,10];if(!signature.every((v,i)=>bytes[i]===v))throw new Error('Invalid PNG image.');
 const ppm=Math.round(dpi/0.0254),type=new TextEncoder().encode('pHYs'),data=joinBytes([u32(ppm),u32(ppm),new Uint8Array([1])]),chunk=joinBytes([u32(9),type,data,u32(crc32(joinBytes([type,data])))]),parts:Uint8Array[]=[bytes.slice(0,8)];
 let offset=8,inserted=false;
 while(offset+12<=bytes.length){const length=new DataView(bytes.buffer,bytes.byteOffset+offset,4).getUint32(0),end=offset+length+12;if(end>bytes.length)throw new Error('Truncated PNG image.');const name=String.fromCharCode(...bytes.slice(offset+4,offset+8));if(name!=='pHYs')parts.push(bytes.slice(offset,end));if(name==='IHDR'){parts.push(chunk);inserted=true}offset=end;}
 if(!inserted||offset!==bytes.length)throw new Error('Invalid PNG image structure.');return joinBytes(parts);
}

export async function renderPublicationPng(serialized:string,width:number,height:number,dpi:number):Promise<Blob> {
 if(width<1||height<1||width*height>80_000_000)throw new Error('The PNG exceeds 80 megapixels. Reduce the physical width or DPI.');
 if(document.fonts)await document.fonts.ready;
 const source=URL.createObjectURL(new Blob([serialized],{type:'image/svg+xml;charset=utf-8'}));
 try{const image=new Image();await new Promise<void>((resolve,reject)=>{image.onload=()=>resolve();image.onerror=()=>reject(new Error('Could not render the publication image.'));image.src=source});const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;const context=canvas.getContext('2d');if(!context)throw new Error('PNG export is unavailable in this browser.');context.drawImage(image,0,0,width,height);const blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(result=>result?resolve(result):reject(new Error('PNG export failed.')),'image/png'));const content=pngWithDpi(new Uint8Array(await blob.arrayBuffer()),dpi);return new Blob([content as BlobPart],{type:'image/png'})}finally{URL.revokeObjectURL(source)}
}

/** A standards-compliant uncompressed ZIP avoids browser multi-download restrictions. */
export function publicationZip(files:{name:string;content:Uint8Array}[]):Blob {
 const locals:Uint8Array[]=[],central:Uint8Array[]=[];let offset=0,total=0;
 for(const file of files){const name=new TextEncoder().encode(safeFilename(file.name)),size=file.content.length;total+=size;if(total>150_000_000)throw new Error('Batch export exceeds 150 MB. Export fewer figures at a time.');const crc=crc32(file.content),local=new Uint8Array(30+name.length),view=new DataView(local.buffer);view.setUint32(0,0x04034b50,true);view.setUint16(4,20,true);view.setUint16(6,0x800,true);view.setUint16(12,33,true);view.setUint32(14,crc,true);view.setUint32(18,size,true);view.setUint32(22,size,true);view.setUint16(26,name.length,true);local.set(name,30);locals.push(local,file.content);const directory=new Uint8Array(46+name.length),dv=new DataView(directory.buffer);dv.setUint32(0,0x02014b50,true);dv.setUint16(4,20,true);dv.setUint16(6,20,true);dv.setUint16(8,0x800,true);dv.setUint16(14,33,true);dv.setUint32(16,crc,true);dv.setUint32(20,size,true);dv.setUint32(24,size,true);dv.setUint16(28,name.length,true);dv.setUint32(42,offset,true);directory.set(name,46);central.push(directory);offset+=local.length+size}
 const directory=joinBytes(central),end=new Uint8Array(22),ev=new DataView(end.buffer);ev.setUint32(0,0x06054b50,true);ev.setUint16(8,files.length,true);ev.setUint16(10,files.length,true);ev.setUint32(12,directory.length,true);ev.setUint32(16,offset,true);return new Blob([...locals,directory,end] as BlobPart[],{type:'application/zip'});
}
