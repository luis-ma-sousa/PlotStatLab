// @vitest-environment jsdom
import {describe,expect,it} from 'vitest';
import {defaultStyle} from './project';
import {crc32,defaultPublication,panelLabel,pngWithDpi,prefixSvgIds,publicationChart,publicationGeometry,publicationSettings,publicationZip,serializePublication,validPublication} from './publication';
import type {Chart} from './types';

const chart=(id:string):Chart=>({id,name:`Figure ${id}`,type:'bar-swarm',title:`Panel ${id}`,xLabel:'Dose',yLabel:'Response',style:{...defaultStyle},pointStyles:{observation:{color:'#123abc'}},annotationPositions:{comparison:{dx:4,dy:-2}},showSignificance:true,showNs:false,significanceDisplay:'stars'});
const source=()=>{const doc=new DOMParser().parseFromString('<svg xmlns="http://www.w3.org/2000/svg" width="800" height="560"><defs><clipPath id="plot-clip"><rect x="80" y="80" width="600" height="400"/></clipPath></defs><g clip-path="url(#plot-clip)"><g data-point-id="observation"><circle cx="100" cy="200" r="7" fill="#123abc"/></g></g><text>H<tspan baseline-shift="sub" font-size="70%">2</tspan>O</text><circle data-editor-only="true"/></svg>','image/svg+xml');return doc.documentElement as unknown as SVGSVGElement};
function bytes(blob:Blob):Promise<Uint8Array>{return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(new Uint8Array(reader.result as ArrayBuffer));reader.onerror=()=>reject(reader.error);reader.readAsArrayBuffer(blob)})}
function pngChunks(png:Uint8Array){const chunks:{type:string;data:Uint8Array;crc:number}[]=[];let offset=8;while(offset<png.length){const view=new DataView(png.buffer,png.byteOffset+offset),length=view.getUint32(0);chunks.push({type:String.fromCharCode(...png.slice(offset+4,offset+8)),data:png.slice(offset+8,offset+8+length),crc:view.getUint32(8+length)});offset+=length+12}return chunks}

describe('publication layout and saved settings',()=>{
 it('computes print and raster sizes from physical units, with exact aligned panel origins',()=>{
  const settings={...defaultPublication(['a','b','c']),widthMm:180,dpi:300,panelWidth:800,panelHeight:560,gap:20,padding:10,columns:2};
  const layout=publicationGeometry(settings);expect(layout.width).toBe(1640);expect(layout.height).toBe(1160);expect(layout.panels).toEqual([{x:10,y:10,label:'A'},{x:830,y:10,label:'B'},{x:10,y:590,label:'C'}]);expect(layout.pixelWidth).toBe(2126);expect(layout.pixelHeight).toBe(Math.round(2126*1160/1640));expect(layout.heightMm).toBeCloseTo(180*1160/1640,12);
 });
 it('validates stored layout settings and rejects orphan/duplicate figure references or invalid dimensions',()=>{
  const settings=defaultPublication(['a','b']);expect(validPublication(settings,['a','b'])).toBe(true);
  for(const invalid of [{...settings,chartIds:['missing']},{...settings,chartIds:['a','a']},{...settings,widthMm:NaN},{...settings,dpi:0},{...settings,columns:1.5},{...settings,panelWidth:0},{...settings,fontSize:100},{...settings,preset:'unknown'}])expect(validPublication(invalid,['a','b'])).toBe(false);
  expect(publicationSettings(undefined,['a','b']).chartIds).toEqual(['a','b']);
 });
 it('uses a compact column count and labels beyond Z without clipping the layout',()=>{
  expect(panelLabel(0)).toBe('A');expect(panelLabel(25)).toBe('Z');expect(panelLabel(26)).toBe('AA');expect(panelLabel(51)).toBe('AZ');expect(panelLabel(52)).toBe('BA');
  const settings={...defaultPublication(['a']),columns:4};expect(publicationGeometry(settings).columns).toBe(1);expect(publicationGeometry(settings).width).toBe(832);
 });
 it('aligns styles for composition without changing individual point edits or the original figure',()=>{
  const original=chart('a'),before=JSON.stringify(original),settings={...defaultPublication(['a']),fontSize:20,fontFamily:'Georgia',legend:false};const composed=publicationChart(original,settings);
  expect(JSON.stringify(original)).toBe(before);expect(composed.style.fontFamily).toBe('Georgia');expect(composed.style.fontSize).toBeCloseTo(20*publicationGeometry(settings).width/(settings.widthMm/25.4*72),12);expect(composed.style.legend).toBe(false);expect(composed.pointStyles).toBe(original.pointStyles);expect(composed.annotationPositions).toBe(original.annotationPositions);
  expect(publicationChart(original,{...settings,sharedTypography:false}).style.fontFamily).toBe(original.style.fontFamily);
 });
});

describe('editable multipanel export',()=>{
 it('exports physical units and independent vector panels with unique clip references',()=>{
  const settings=defaultPublication(['a','b']);const a=source(),b=source(),before=a.outerHTML;
  const result=serializePublication(settings,[{chart:publicationChart(chart('a'),settings),source:a},{chart:publicationChart(chart('b'),settings),source:b}]);
  const doc=new DOMParser().parseFromString(result,'image/svg+xml'),svg=doc.documentElement;expect(doc.querySelector('parsererror')).toBeNull();expect(svg.getAttribute('width')).toBe('180mm');expect(svg.getAttribute('viewBox')).toBe('0 0 1656 592');expect(doc.querySelectorAll('svg')).toHaveLength(3);expect(doc.querySelectorAll('image,foreignObject,script,use')).toHaveLength(0);
  const ids=[...doc.querySelectorAll('[id]')].map(e=>e.id);expect(new Set(ids).size).toBe(ids.length);for(const element of doc.querySelectorAll('[clip-path]')){const target=element.getAttribute('clip-path')!.slice(5,-1);expect(doc.getElementById(target)).not.toBeNull()}
  expect(doc.querySelector('#PSL-panel-label-A')?.textContent).toBe('A');expect(doc.querySelector('#PSL-panel-label-B')?.textContent).toBe('B');expect(doc.querySelectorAll('[id$="PSL-point-observation"] circle')).toHaveLength(2);expect(doc.querySelectorAll('tspan[baseline-shift="sub"]')).toHaveLength(2);expect(a.outerHTML).toBe(before);
 });
 it('rejects an empty composition and does not export panel labels when disabled',()=>{
  const settings={...defaultPublication(['a']),labels:false};expect(()=>serializePublication(settings,[])).toThrow('Choose at least one');const doc=new DOMParser().parseFromString(serializePublication(settings,[{chart:chart('a'),source:source()}]),'image/svg+xml');expect(doc.querySelector('[id^="PSL-panel-label"]')).toBeNull();
 });
 it('namespaces local URL and fragment references',()=>{
  const svg=new DOMParser().parseFromString('<svg xmlns="http://www.w3.org/2000/svg"><defs><clipPath id="clip"/></defs><path id="line" clip-path="url(\'#clip\')"/><a href="#line"/></svg>','image/svg+xml').documentElement as unknown as SVGSVGElement;prefixSvgIds(svg,'panel');expect(svg.querySelector('path')?.getAttribute('clip-path')).toBe('url(#panel-clip)');expect(svg.querySelector('a')?.getAttribute('href')).toBe('#panel-line');
 });
});

describe('portable batch ZIP and PNG print metadata',()=>{
 it('uses the standard CRC32 reference value',()=>{expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926)});
 it('writes stored UTF8 ZIP entries with actual sizes, offsets and checksums',async()=>{
  const payload=new TextEncoder().encode('<svg>μ</svg>'),archive=await bytes(publicationZip([{name:'01-μ.svg',content:payload},{name:'02-b.svg',content:new TextEncoder().encode('B')}]));
  const view=new DataView(archive.buffer);expect(view.getUint32(0,true)).toBe(0x04034b50);expect(view.getUint16(6,true)&0x800).toBe(0x800);expect(view.getUint32(14,true)).toBe(crc32(payload));expect(view.getUint32(18,true)).toBe(payload.length);const nameLength=view.getUint16(26,true);expect(new TextDecoder().decode(archive.slice(30,30+nameLength))).toBe('01-μ.svg');expect([...archive.slice(30+nameLength,30+nameLength+payload.length)]).toEqual([...payload]);
  const end=archive.length-22;expect(view.getUint32(end,true)).toBe(0x06054b50);expect(view.getUint16(end+8,true)).toBe(2);const centralOffset=view.getUint32(end+16,true);expect(view.getUint32(centralOffset,true)).toBe(0x02014b50);expect(view.getUint32(centralOffset+42,true)).toBe(0);
 });
 it('adds one correct pHYs chunk for 300 DPI and replaces prior resolution metadata',()=>{
  const encoded='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==',original=Uint8Array.from(atob(encoded),c=>c.charCodeAt(0));
  const output=pngWithDpi(original,300),chunks=pngChunks(output),physical=chunks.filter(c=>c.type==='pHYs');expect(physical).toHaveLength(1);const data=physical[0].data,view=new DataView(data.buffer);expect(view.getUint32(0)).toBe(11811);expect(view.getUint32(4)).toBe(11811);expect(data[8]).toBe(1);expect(chunks.map(c=>c.type)).toEqual(['IHDR','pHYs','IDAT','IEND']);
  const toCheck=new Uint8Array(13);toCheck.set(new TextEncoder().encode('pHYs'));toCheck.set(data,4);expect(physical[0].crc).toBe(crc32(toCheck));expect(pngChunks(pngWithDpi(output,600)).filter(c=>c.type==='pHYs')).toHaveLength(1);expect(()=>pngWithDpi(new Uint8Array([1,2,3]),300)).toThrow('Invalid PNG');
 });
});
