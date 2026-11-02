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
});
