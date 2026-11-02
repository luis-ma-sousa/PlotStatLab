import {useEffect,useRef} from 'react';
/** Keep keyboard focus in an open modal and restore the invoking control. */
export default function useDialogAccessibility(active:boolean,onClose:()=>void){
 const close=useRef(onClose);close.current=onClose;
 useEffect(()=>{if(!active)return;const opener=document.activeElement as HTMLElement|null;const dialog=document.querySelector<HTMLElement>('[role="dialog"]');if(!dialog)return;const focusable=()=>[...dialog.querySelectorAll<HTMLElement>('button:not([disabled]),input:not([disabled]):not([type="hidden"]),select:not([disabled]),textarea:not([disabled]),a[href],[tabindex="0"]')].filter(el=>!el.closest('[hidden]')&&getComputedStyle(el).display!=='none');const first=focusable()[0];if(first)first.focus();else{dialog.tabIndex=-1;dialog.focus()}
 const key=(e:KeyboardEvent)=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();close.current();return}if(e.key!=='Tab')return;const controls=focusable();if(!controls.length){e.preventDefault();dialog.focus();return}const index=controls.indexOf(document.activeElement as HTMLElement);if(e.shiftKey&&index<=0){e.preventDefault();controls.at(-1)!.focus()}else if(!e.shiftKey&&(index<0||index===controls.length-1)){e.preventDefault();controls[0].focus()}};
 document.addEventListener('keydown',key,true);return()=>{document.removeEventListener('keydown',key,true);if(opener?.isConnected)opener.focus()};
 },[active]);
}
