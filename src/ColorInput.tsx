import {useEffect,useRef,useState} from 'react';
import {normalizeHex} from './preferences';
export default function ColorInput({label,value,onChange}:{label:string;value:string;onChange:(value:string)=>void}){
 const [draft,setDraft]=useState(value),[invalid,setInvalid]=useState(false),focused=useRef(false);
 useEffect(()=>{if(!focused.current)setDraft(value)},[value]);
 function apply(){focused.current=false;const normalized=normalizeHex(draft);if(normalized){onChange(normalized);setDraft(normalized);setInvalid(false)}else{setInvalid(true)}}
 return <div className="color-control"><div className="color-input"><input aria-label={label} type="color" value={normalizeHex(value)??'#000000'} onChange={e=>{onChange(e.target.value);setDraft(e.target.value);setInvalid(false)}}/><input aria-label={`${label} hex`} aria-invalid={invalid} spellCheck={false} maxLength={7} value={draft} placeholder="#RRGGBB" onFocus={()=>{focused.current=true}} onChange={e=>{const text=e.target.value;setDraft(text);setInvalid(false);const hex=normalizeHex(text);if(hex&&text.replace(/^#/,'').length===6)onChange(hex)}} onBlur={apply} onKeyDown={e=>{if(e.key==='Enter')e.currentTarget.blur();if(e.key==='Escape'){setDraft(value);setInvalid(false);focused.current=false;e.currentTarget.blur()}}}/></div>{invalid&&<small className="hex-error" role="alert">Use #RGB or #RRGGBB.</small>}</div>
}
