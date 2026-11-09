// @vitest-environment jsdom
import {describe,expect,it} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import ScientificText,{scientificTokens} from './ScientificText';

describe('editable scientific typography',()=>{
 it('supports chemical subscripts, exponent superscripts and font emphasis',()=>{
  expect(scientificTokens('H_{2}O · 10^{−3} *P* **signal**')).toEqual([{text:'H'},{text:'2',script:'sub'},{text:'O · 10'},{text:'−3',script:'super'},{text:' '},{text:'P',italic:true},{text:' '},{text:'signal',bold:true}]);
 });
 it('keeps unsupported, empty and unbalanced syntax literal and allows escaping',()=>{
  expect(scientificTokens('H_{} x^{2 *plain')).toEqual([{text:'H_{} x^{2 *plain'}]);expect(scientificTokens('\\*literal\\* x\\^{2}')).toEqual([{text:'*literal* x^{2}'}]);
 });
 it('renders live SVG tspans and escapes arbitrary user text',()=>{
  const markup=renderToStaticMarkup(<svg><text><ScientificText text={'H_{2}O & 10^{−3} *P* **A** <script>'}/></text></svg>),doc=new DOMParser().parseFromString(markup,'image/svg+xml');expect(doc.querySelector('script')).toBeNull();expect(doc.querySelector('text')?.textContent).toBe('H2O & 10−3 P A <script>');expect(doc.querySelector('tspan[baseline-shift="sub"]')?.textContent).toBe('2');expect(doc.querySelector('tspan[baseline-shift="super"]')?.getAttribute('font-size')).toBe('70%');expect(doc.querySelector('tspan[font-style="italic"]')?.textContent).toBe('P');expect(doc.querySelector('tspan[font-weight="700"]')?.textContent).toBe('A');
 });
 it('keeps nested visual-editor emphasis and multiline SVG text editable without interpreting arbitrary tags',()=>{
  const markup=renderToStaticMarkup(<svg><text x={180} y={500}><ScientificText text={'<i>Gene <b>A</b></i>\nH<sub>2</sub>O <script>alert(1)</script>'} x={180} lineHeight={22}/></text></svg>),doc=new DOMParser().parseFromString(markup,'image/svg+xml');
  const lines=doc.querySelectorAll('tspan[data-text-line]');expect(lines).toHaveLength(2);expect(lines[0].getAttribute('x')).toBe('180');expect(lines[1].getAttribute('dy')).toBe('22');expect(lines[0].querySelector('tspan[font-style="italic"][font-weight="700"]')?.textContent).toBe('A');expect(lines[1].querySelector('[baseline-shift="sub"]')?.textContent).toBe('2');expect(doc.querySelector('script')).toBeNull();expect(lines[1].textContent).toContain('<script>alert(1)</script>');
 });
});
