import {useEffect,useRef,useState} from 'react';
import {scientificTokens} from './ScientificText';
import type {ScientificToken} from './ScientificText';
import './labelEditor.css';

type Mark='italic'|'bold'|'subscript'|'superscript';
const sameStyle=(a:ScientificToken,b:ScientificToken)=>a.italic===b.italic&&a.bold===b.bold&&a.script===b.script;
const escapeText=(text:string)=>text.replace(/[\\*_^<>]/g,char=>'\\'+char);

/** Serialize only text and the editor's supported emphasis, never pasted HTML. */
export function readLabelEditor(editor:HTMLElement):string {
 const tokens:ScientificToken[]=[];
 const append=(text:string,style:Omit<ScientificToken,'text'>)=>{if(!text)return;const token={text,...style},previous=tokens.at(-1);if(previous&&sameStyle(previous,token))previous.text+=text;else tokens.push(token)};
 function visit(node:Node,style:Omit<ScientificToken,'text'>={}){
  if(node.nodeType===Node.TEXT_NODE){append(node.textContent??'',style);return}
  if(!(node instanceof HTMLElement))return;
  const next={...style};if(['I','EM'].includes(node.tagName))next.italic=true;if(['B','STRONG'].includes(node.tagName))next.bold=true;if(node.tagName==='SUB')next.script='sub';if(node.tagName==='SUP')next.script='super';
  if(node.style.verticalAlign==='sub'||node.style.verticalAlign==='super')next.script=node.style.verticalAlign;if(node.style.fontStyle)next.italic=node.style.fontStyle==='italic';if(node.style.fontWeight)next.bold=node.style.fontWeight==='bold'||Number(node.style.fontWeight)>=600;
  if(node.tagName==='BR'){if(node.parentElement!==editor&&node.parentElement?.childNodes.length===1&&['DIV','P'].includes(node.parentElement.tagName))return;if(!node.nextSibling&&node.previousSibling instanceof HTMLElement&&node.previousSibling.tagName==='BR')return;append('\n',next);return}
  const block=['DIV','P'].includes(node.tagName),hasPrevious=node.previousSibling!==null;
  if(block&&hasPrevious)append('\n',style);
  node.childNodes.forEach(child=>visit(child,next));
 }
 editor.childNodes.forEach(node=>visit(node));
 return serializeTokens(tokens);
}

function serializeTokens(tokens:ScientificToken[]):string {return tokens.map(token=>{let text=escapeText(token.text);if(token.script)text=`<${token.script==='sub'?'sub':'sup'}>${text}</${token.script==='sub'?'sub':'sup'}>`;if(token.bold)text=`<b>${text}</b>`;if(token.italic)text=`<i>${text}</i>`;return text}).join('');}

function fallbackEmphasis(editor:HTMLElement,range:Range,mark:Mark){
 const prefix=range.cloneRange();prefix.selectNodeContents(editor);prefix.setEnd(range.startContainer,range.startOffset);const start=prefix.toString().length,end=start+range.toString().length;
 const tokens=scientificTokens(readLabelEditor(editor));let offset=0;
 const portions=tokens.flatMap(token=>{const a=offset,b=offset+token.text.length;offset=b;const left=Math.max(a,start),right=Math.min(b,end);if(left>=right)return [{...token,selected:false}];const result=[];if(a<left)result.push({...token,text:token.text.slice(0,left-a),selected:false});result.push({...token,text:token.text.slice(left-a,right-a),selected:true});if(right<b)result.push({...token,text:token.text.slice(right-a),selected:false});return result});
 const enabled=portions.filter(token=>token.selected).every(token=>mark==='italic'?token.italic:mark==='bold'?token.bold:token.script===(mark==='subscript'?'sub':'super'));
 const changed=portions.map(({selected,...token})=>!selected?token:mark==='italic'?{...token,italic:!enabled}:mark==='bold'?{...token,bold:!enabled}:{...token,script:enabled?undefined:mark==='subscript'?'sub' as const:'super' as const});
 populate(editor,serializeTokens(changed));
 const walker=document.createTreeWalker(editor,NodeFilter.SHOW_TEXT);let node=walker.nextNode(),position=0;const restored=document.createRange();let foundStart=false;
 while(node){const length=node.textContent?.length??0;if(!foundStart&&start<=position+length){restored.setStart(node,Math.max(0,start-position));foundStart=true}if(foundStart&&end<=position+length){restored.setEnd(node,Math.max(0,end-position));break}position+=length;node=walker.nextNode()}
 const selection=window.getSelection();if(foundStart&&selection){selection.removeAllRanges();selection.addRange(restored)}
}

function populate(editor:HTMLElement,value:string){
 const fragment=document.createDocumentFragment();
 scientificTokens(value).forEach(token=>{let node:Node=document.createTextNode(token.text);if(token.script){const element=document.createElement(token.script==='sub'?'sub':'sup');element.append(node);node=element}if(token.bold){const element=document.createElement('strong');element.append(node);node=element}if(token.italic){const element=document.createElement('em');element.append(node);node=element}fragment.append(node)});
 editor.replaceChildren(fragment);
}

export default function LabelEditor({label,value,onChange}:{label:string;value:string;onChange:(value:string)=>void}){
 const editor=useRef<HTMLDivElement>(null),lastValue=useRef<string|undefined>(undefined),savedRange=useRef<Range|null>(null);
 const [active,setActive]=useState({italic:false,bold:false,subscript:false,superscript:false});
 useEffect(()=>{if(editor.current&&value!==lastValue.current){populate(editor.current,value);lastValue.current=value}},[value]);
 function publish(){if(!editor.current)return;const next=readLabelEditor(editor.current);if(next!==lastValue.current){lastValue.current=next;onChange(next)}capture()}
 function capture(){
  const selection=window.getSelection(),range=selection?.rangeCount?selection.getRangeAt(0):null;if(!range||!editor.current?.contains(range.commonAncestorContainer))return;
  savedRange.current=range.cloneRange();let node=range.startContainer.nodeType===Node.ELEMENT_NODE?range.startContainer as HTMLElement:range.startContainer.parentElement;const ancestors:HTMLElement[]=[];
  while(node&&node!==editor.current){ancestors.push(node);node=node.parentElement}
  const marks={italic:false,bold:false,subscript:false,superscript:false};
  for(const element of ancestors.reverse()){if(['I','EM'].includes(element.tagName))marks.italic=true;if(['B','STRONG'].includes(element.tagName))marks.bold=true;if(element.style.fontStyle)marks.italic=element.style.fontStyle==='italic';if(element.style.fontWeight)marks.bold=element.style.fontWeight==='bold'||Number(element.style.fontWeight)>=600;if(element.tagName==='SUB'||element.style.verticalAlign==='sub'){marks.subscript=true;marks.superscript=false}if(element.tagName==='SUP'||element.style.verticalAlign==='super'){marks.superscript=true;marks.subscript=false}}
  setActive(marks);
 }

 function emphasize(mark:Mark){
  const target=editor.current;if(!target)return;target.focus();const selection=window.getSelection();if(!selection)return;
  const range=savedRange.current&&target.contains(savedRange.current.commonAncestorContainer)?savedRange.current.cloneRange():document.createRange();
  if(!target.contains(range.commonAncestorContainer)||range.collapsed){range.selectNodeContents(target)}
  selection.removeAllRanges();selection.addRange(range);
  const handled=typeof document.execCommand==='function'&&document.execCommand(mark,false);
  if(!handled)fallbackEmphasis(target,range,mark)
  savedRange.current=selection.rangeCount?selection.getRangeAt(0).cloneRange():null;publish();
 }
 function insert(text:string){const target=editor.current,selection=window.getSelection();if(!target||!selection)return;const range=selection.rangeCount&&target.contains(selection.getRangeAt(0).commonAncestorContainer)?selection.getRangeAt(0):document.createRange();if(!target.contains(range.commonAncestorContainer)){range.selectNodeContents(target);range.collapse(false)}range.deleteContents();const node=document.createTextNode(text);range.insertNode(node);range.setStartAfter(node);range.collapse(true);selection.removeAllRanges();selection.addRange(range);publish()}
 return <div className="label-editor"><div className="label-editor-heading"><label>{label}</label><div role="toolbar" aria-label={`${label} formatting`}><button type="button" className="label-mark bold" aria-label={`Bold ${label}`} aria-pressed={active.bold} title="Bold selected text (Ctrl/⌘ B)" onMouseDown={e=>e.preventDefault()} onClick={()=>emphasize('bold')}>B</button><button type="button" className="label-mark italic" aria-label={`Italic ${label}`} aria-pressed={active.italic} title="Italic selected text (Ctrl/⌘ I)" onMouseDown={e=>e.preventDefault()} onClick={()=>emphasize('italic')}>I</button><button type="button" className="label-mark" aria-label={`Subscript ${label}`} aria-pressed={active.subscript} title="Subscript selected text" onMouseDown={e=>e.preventDefault()} onClick={()=>emphasize('subscript')}>x₂</button><button type="button" className="label-mark" aria-label={`Superscript ${label}`} aria-pressed={active.superscript} title="Superscript selected text" onMouseDown={e=>e.preventDefault()} onClick={()=>emphasize('superscript')}>x²</button></div></div><div ref={editor} role="textbox" aria-label={label} aria-multiline="true" contentEditable suppressContentEditableWarning spellCheck={false} className="label-editor-input" onInput={publish} onKeyUp={capture} onMouseUp={capture} onFocus={capture} onPaste={e=>{e.preventDefault();insert(e.clipboardData.getData('text/plain').replace(/\r\n?/g,'\n'))}} onKeyDown={e=>{if((e.metaKey||e.ctrlKey)&&['i','b'].includes(e.key.toLowerCase())){e.preventDefault();e.stopPropagation();emphasize(e.key.toLowerCase()==='i'?'italic':'bold')}else if(e.key==='Enter'){e.stopPropagation()}}}/><small>Select text, then choose B or I. Press Enter for a new line.</small></div>
}
