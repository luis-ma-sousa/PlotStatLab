// @vitest-environment jsdom
import {act} from 'react';
import {createRoot} from 'react-dom/client';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import LabelEditor,{readLabelEditor} from './LabelEditor';
import {scientificPlainText,scientificTokens} from './ScientificText';

let host:HTMLDivElement,root:ReturnType<typeof createRoot>,value:string;
beforeEach(()=>{vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);host=document.createElement('div');document.body.append(host);root=createRoot(host);value=''});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();window.getSelection()?.removeAllRanges();vi.unstubAllGlobals()});
async function render(next:string){value=next;await act(async()=>root.render(<LabelEditor label="X axis title" value={value} onChange={next=>{value=next;root.render(<LabelEditor label="X axis title" value={value} onChange={v=>{value=v}}/>)}}/>))}
const field=()=>host.querySelector<HTMLElement>('[role=textbox]')!;
async function select(node:Node,start:number,end:number){const range=document.createRange();range.setStart(node,start);range.setEnd(node,end);window.getSelection()!.removeAllRanges();window.getSelection()!.addRange(range);await act(async()=>field().dispatchEvent(new MouseEvent('mouseup',{bubbles:true})))}
async function click(name:string){await act(async()=>host.querySelector<HTMLButtonElement>(`button[aria-label="${name}"]`)!.click())}

it('shows stored legacy emphasis visually and toggles selected italic text off without exposing syntax',async()=>{
 await render('Effect of *Gene*');expect(field().textContent).toBe('Effect of Gene');expect(field().querySelector('em')?.textContent).toBe('Gene');
 const text=field().querySelector('em')!.firstChild!;await select(text,0,4);await click('Italic X axis title');
 expect(value).toBe('Effect of Gene');expect(field().querySelector('em')).toBeNull();expect(field().textContent).not.toContain('*');
});
it('formats only selected characters and preserves the same editable DOM across parent updates',async()=>{
 await render('wild type');const original=field(),text=original.firstChild!;await select(text,0,4);await click('Italic X axis title');
 expect(scientificTokens(value)).toEqual([{text:'wild',italic:true},{text:' type'}]);expect(field()).toBe(original);expect(field().querySelector('em')?.textContent).toBe('wild');
 const range=window.getSelection()!.getRangeAt(0);expect(range.toString()).toBe('wild');
});
it('retains native Enter paragraph boundaries, intentional blank lines and mixed emphasis',()=>{
 const editor=document.createElement('div');editor.innerHTML='<div>First line</div><div><em>Second line</em></div><div><br></div><div>Fourth line</div>';
 const stored=readLabelEditor(editor);expect(scientificPlainText(stored)).toBe('First line\nSecond line\n\nFourth line');expect(scientificTokens(stored).some(token=>token.text==='Second line'&&token.italic)).toBe(true);
});
it('pastes text with line breaks as literal text, never executable HTML',async()=>{
 await render('');field().focus();const paste=new Event('paste',{bubbles:true,cancelable:true});Object.defineProperty(paste,'clipboardData',{value:{getData:(kind:string)=>kind==='text/plain'?'Control <script>alert(1)</script>\nTreated':'<script>alert(1)</script>'}});
 await act(async()=>field().dispatchEvent(paste));expect(field().querySelector('script')).toBeNull();expect(scientificPlainText(value)).toBe('Control <script>alert(1)</script>\nTreated');expect(field().textContent).toContain('<script>');
});
it('applies scientific scripts using visible buttons and preserves the surrounding letters',async()=>{
 await render('H2O');await select(field().firstChild!,1,2);await click('Subscript X axis title');expect(scientificTokens(value)).toEqual([{text:'H'},{text:'2',script:'sub'},{text:'O'}]);
 expect(field().querySelector('sub')?.textContent).toBe('2');expect(field().textContent).toBe('H2O');
});
