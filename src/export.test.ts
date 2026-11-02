// @vitest-environment jsdom
import {describe, expect, it} from 'vitest';
import {serializeFigureSvg} from './export';
import {defaultStyle} from './project';
import type {Chart} from './types';

const chart:Chart={id:'example',name:'Example',type:'bar-swarm',title:'α response & effect',xLabel:'Dose',yLabel:'Signal',style:{...defaultStyle,fontFamily:'Georgia',fontSize:16,width:800,height:560},pointStyles:{},annotationPositions:{},showSignificance:true,showNs:false,significanceDisplay:'stars'};
function source(markup:string){document.body.innerHTML=`<svg xmlns="http://www.w3.org/2000/svg" id="chart-svg" width="800" height="560" viewBox="0 0 800 560" style="font-family:Arial;cursor:pointer" role="img">${markup}</svg>`;return document.querySelector<SVGSVGElement>('svg')!;}
function expectNoEditorAttributes(xml:Document){
 for(const element of [xml.documentElement,...xml.querySelectorAll('*')])for(const attribute of [...element.attributes]){
  const name=attribute.name.toLowerCase();
  expect(['style','class','tabindex','role','focusable','pointer-events'].includes(name)||name.startsWith('aria-')||name.startsWith('data-')||name.startsWith('on'),`unexpected editor attribute ${name}`).toBe(false);
 }
 expect(xml.querySelector('style')).toBeNull();
}
function parsed(markup:string){const output=serializeFigureSvg(chart,source(markup));const xml=new DOMParser().parseFromString(output,'image/svg+xml');expect(xml.querySelector('parsererror')).toBeNull();return {output,xml,svg:xml.documentElement};}

describe('Illustrator-editable SVG export',()=>{
 it('exports valid self-contained SVG1.1 with one namespace and exact artboard',()=>{
  const {output,svg}=parsed('<rect width="800" height="560" fill="#fff"/>');
  expect(svg.getAttribute('version')).toBe('1.1');expect(svg.namespaceURI).toBe('http://www.w3.org/2000/svg');
  expect(svg.getAttribute('width')).toBe('800');expect(svg.getAttribute('height')).toBe('560');expect(svg.getAttribute('viewBox')).toBe('0 0 800 560');
  expect((output.match(/xmlns="http:\/\/www.w3.org\/2000\/svg"/g)??[])).toHaveLength(1);
  expect(output).toContain('PlotStatLab');expect(output).not.toContain('<image');
 });
 it('keeps editable scientific text, explicit font details, anchoring and rotation',()=>{
  const {xml}=parsed('<text data-edit="yaxis" x="25" y="250" transform="rotate(-90 25 250)" text-anchor="middle" fill="#234567" font-size="21" font-weight="600">Δ expression μM</text>');
  const text=xml.querySelector('text')!;expect(text.textContent).toBe('Δ expression μM');expect(text.getAttribute('font-family')).toBe('Georgia');expect(text.getAttribute('font-size')).toBe('21');expect(text.getAttribute('font-weight')).toBe('600');expect(text.getAttribute('font-style')).toBe('normal');expect(text.getAttribute('text-anchor')).toBe('middle');expect(text.getAttribute('transform')).toBe('rotate(-90 25 250)');
 });
 it('uses the chosen root font size for text without an explicit size',()=>{
  const original=source('<g><text>Inherited font size</text><text font-size="23">Explicit size</text></g>');
  original.style.fontSize='99px';
  const xml=new DOMParser().parseFromString(serializeFigureSvg(chart,original),'image/svg+xml');
  const labels=[...xml.querySelectorAll('text')];
  expect(xml.documentElement.getAttribute('font-size')).toBe('16');
  expect(labels[0].getAttribute('font-size')).toBe('16');
  expect(labels[1].getAttribute('font-size')).toBe('23');
 });
 it('materializes inherited line styles without converting open strokes into filled shapes',()=>{
  const {xml}=parsed('<g stroke="#588176" stroke-width="2.5" fill="none" fill-opacity="0.4" style="stroke-linejoin:round"><path d="M10 20V40H30"/><path d="M20 10V30" stroke-width="1"/></g>');
  const paths=[...xml.querySelectorAll('path')];for(const p of paths){expect(p.getAttribute('fill')).toBe('none');expect(p.getAttribute('stroke')).toBe('#588176');expect(p.getAttribute('stroke-linejoin')).toBe('round');expect(p.getAttribute('fill-opacity')).toBe('0.4')}
  expect(paths[0].getAttribute('stroke-width')).toBe('2.5');expect(paths[1].getAttribute('stroke-width')).toBe('1');
 });
 it('preserves each observation as a separate editable object and strips hit targets',()=>{
  const {xml,output}=parsed('<g clip-path="url(#clip)"><g data-point-id="p-1" data-group-id="control" role="button" tabindex="0"><circle cx="30" cy="40" r="8" fill="#cc2288" stroke="#ffffff" opacity="0.7"/><circle data-editor-only="true" cx="30" cy="40" r="12" fill="transparent"/></g><g data-point-id="p-2"><path d="M50 20L60 30L50 40Z" fill="#88aa77"/></g></g>');
  expect(xml.querySelector('#PSL-point-p-1 circle')?.getAttribute('fill')).toBe('#cc2288');expect(xml.querySelector('#PSL-point-p-1 circle')?.getAttribute('r')).toBe('8');expect(xml.querySelector('#PSL-point-p-1 circle')?.getAttribute('opacity')).toBe('0.7');expect(xml.querySelectorAll('#PSL-point-p-1 circle')).toHaveLength(1);expect(xml.querySelector('#PSL-point-p-2 path')).not.toBeNull();
  expectNoEditorAttributes(xml);
 });
 it('preserves grouped opacity without multiplying it again on each child',()=>{
  const {xml}=parsed('<g opacity="0.5"><rect width="20" height="30" fill="#556677"/><circle cx="15" cy="15" r="4" fill="#fff"/></g>');
  expect(xml.querySelector('g[opacity="0.5"]')).not.toBeNull();expect(xml.querySelector('circle')?.hasAttribute('opacity')).toBe(false);
 });
 it('keeps clip geometry and transform while naming semantic layers without changing paint order',()=>{
  const {xml}=parsed('<rect width="800" height="560" fill="#fff"/><defs><clipPath id="clip"><rect x="80" y="90" width="600" height="400"/></clipPath></defs><text data-edit="title" y="35">Title</text><g transform="translate(80 66)"><text>Legend</text></g><line x1="80" x2="680" y1="100" y2="100" stroke="#eee"/><g clip-path="url(#clip)"><circle cx="100" cy="120" r="5"/></g><g data-annotation-id="g1::g2"><path d="M100 70V60H200V70" fill="none"/><text x="150" y="55">***</text></g><path d="M80 90V490H680" fill="none"/>');
  const top=[...xml.documentElement.children].filter(e=>!['title','desc','metadata'].includes(e.localName));expect(top.map(e=>e.localName==='defs'?'defs':e.id)).toEqual(['PSL-background','defs','PSL-title','PSL-legend','PSL-grid','PSL-data','PSL-statistics','PSL-axes']);
  expect(xml.querySelector('clipPath')?.getAttribute('clipPathUnits')).toBe('userSpaceOnUse');expect(xml.querySelector('#PSL-data > g')?.getAttribute('clip-path')).toBe('url(#clip)');expect(xml.querySelector('#PSL-legend > g')?.getAttribute('transform')).toBe('translate(80 66)');expect(xml.querySelector('#PSL-comparison-g1--g2 text')?.textContent).toBe('***');
 });
 it('preserves inline presentation attributes and currentColor but removes CSS',()=>{
  const {xml,output}=parsed('<g style="color:#aa1155;fill:currentcolor;stroke:#112233;stroke-width:3"><circle cx="20" cy="20" r="5"/></g>');
  const circle=xml.querySelector('circle')!;expect(circle.getAttribute('fill')).toBe('#aa1155');expect(circle.getAttribute('stroke')).toBe('#112233');expect(circle.getAttribute('stroke-width')).toBe('3');expectNoEditorAttributes(xml);
 });
 it('does not mutate the live editor SVG',()=>{
  const original=source('<g data-point-id="point"><circle fill="#cc2288"/><circle data-editor-only="true"/></g>');const before=original.outerHTML;serializeFigureSvg(chart,original);expect(original.outerHTML).toBe(before);
 });
 it('rejects raster or executable content and references to external resources',()=>{
  for(const fragment of ['<image href="https://example.test/image.png"/>','<foreignObject/>','<use href="#marker"/>','<script>alert(1)</script>','<path fill="url(https://example.test/p.svg#pattern)"/>'])expect(()=>serializeFigureSvg(chart,source(fragment))).toThrow();
 });
 it('gives colliding source identifiers unique Illustrator-safe object IDs',()=>{
  const {xml}=parsed('<g data-point-id="a:b"><circle/></g><g data-point-id="a b"><circle/></g>');expect(xml.querySelector('#PSL-point-a-b')).not.toBeNull();expect(xml.querySelector('#PSL-point-a-b-2')).not.toBeNull();
 });
});
