import {Fragment} from 'react';

export interface ScientificToken {text:string;script?:'super'|'sub';italic?:boolean;bold?:boolean}
type Emphasis=Omit<ScientificToken,'text'>;
const tagStyles:Record<string,Emphasis>={i:{italic:true},b:{bold:true},sub:{script:'sub'},sup:{script:'super'}};

/** Literal, bounded text grammar. Formatting tags are parsed, never inserted as HTML. */
export function scientificTokens(text:string):ScientificToken[] {
 const tokens:ScientificToken[]=[];
 function append(value:string,style:Emphasis){if(!value)return;const previous=tokens.at(-1);if(previous&&previous.script===style.script&&previous.italic===style.italic&&previous.bold===style.bold)previous.text+=value;else tokens.push({text:value,...style})}
 function read(value:string,style:Emphasis={},depth=0){
  if(depth>24){append(value,style);return}
  let plain='';const flush=()=>{append(plain,style);plain=''};
  for(let i=0;i<value.length;){
   if(value[i]==='\\'&&i+1<value.length&&'_^*\\<>'.includes(value[i+1])){plain+=value[i+1];i+=2;continue}
   const tag=value[i]==='<'?/^<(i|b|sub|sup)>/.exec(value.slice(i)):null;
   if(tag){
    const opening=tag[0],closing=`</${tag[1]}>`;let level=1,cursor=i+opening.length,end=-1;
    while(level){const nextOpen=value.indexOf(opening,cursor),nextClose=value.indexOf(closing,cursor);if(nextClose<0)break;if(nextOpen>=0&&nextOpen<nextClose){level++;cursor=nextOpen+opening.length}else{level--;if(!level)end=nextClose;cursor=nextClose+closing.length}}
    if(end>=0){flush();read(value.slice(i+opening.length,end),{...style,...tagStyles[tag[1]]},depth+1);i=end+closing.length;continue}
   }
   if((value[i]==='^'||value[i]==='_')&&value[i+1]==='{'){
    const end=value.indexOf('}',i+2),content=end<0?'':value.slice(i+2,end);
    if(end>=0&&content&&!content.includes('{')){flush();read(content,{...style,script:value[i]==='^'?'super':'sub'},depth+1);i=end+1;continue}
   }
   if(value[i]==='*'){
    const delimiter=value.startsWith('***',i)?'***':value.startsWith('**',i)?'**':'*';let end=value.indexOf(delimiter,i+delimiter.length);
    while(end>=0&&value[end-1]==='\\')end=value.indexOf(delimiter,end+delimiter.length);
    if(end>i+delimiter.length){flush();read(value.slice(i+delimiter.length,end),{...style,...(delimiter.length>1?{bold:true}:{}),...(delimiter.length!==2?{italic:true}:{})},depth+1);i=end+delimiter.length;continue}
   }
   plain+=value[i++];
  }
  flush();
 }
 read(text.replace(/\r\n?/g,'\n'));return tokens;
}

export function scientificPlainText(text:string):string{return scientificTokens(text).map(token=>token.text).join('')}
export function scientificLineCount(text:string):number{return scientificPlainText(text).split('\n').length}

function Token({token}:{token:ScientificToken}){return token.script||token.italic||token.bold?<tspan baselineShift={token.script} fontSize={token.script?'70%':undefined} fontStyle={token.italic?'italic':undefined} fontWeight={token.bold?700:undefined}>{token.text}</tspan>:<Fragment>{token.text}</Fragment>}

/** Every line remains editable SVG text. x resets the cursor for Illustrator-friendly tspans. */
export default function ScientificText({text,x=0,lineHeight=20,centerLines=false}:{text:string;x?:number;lineHeight?:number;centerLines?:boolean}){
 const tokens=scientificTokens(text);
 if(!tokens.some(token=>token.text.includes('\n')))return <>{tokens.map((token,index)=><Token key={index} token={token}/>)}</>;
 const lines:ScientificToken[][]=[[]];
 tokens.forEach(token=>token.text.split('\n').forEach((part,index)=>{if(index)lines.push([]);if(part)lines.at(-1)!.push({...token,text:part})}));
 return <>{lines.map((line,index)=><tspan key={index} data-text-line={index+1} x={x} dy={index?lineHeight:centerLines?-(lines.length-1)*lineHeight/2:0}>{line.length?line.map((token,i)=><Token key={i} token={token}/>):'\u200b'}</tspan>)}</>;
}
