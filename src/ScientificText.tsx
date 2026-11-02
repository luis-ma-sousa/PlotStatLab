import {Fragment} from 'react';

export interface ScientificToken {text:string;script?:'super'|'sub';italic?:boolean;bold?:boolean}

/** A deliberately small literal grammar. Unbalanced markup remains readable. */
export function scientificTokens(text:string):ScientificToken[] {
  const tokens:ScientificToken[]=[];
  let plain='';
  const flush=()=>{if(plain){tokens.push({text:plain});plain=''}};
  for(let i=0;i<text.length;){
    if(text[i]==='\\'&&i+1<text.length&&'_^*\\'.includes(text[i+1])){plain+=text[i+1];i+=2;continue}
    if((text[i]==='^'||text[i]==='_')&&text[i+1]==='{'){
      const end=text.indexOf('}',i+2),content=end<0?'':text.slice(i+2,end);
      if(end>=0&&content&&!content.includes('{')){flush();tokens.push({text:content,script:text[i]==='^'?'super':'sub'});i=end+1;continue}
    }
    if(text[i]==='*'){
      const bold=text[i+1]==='*',delimiter=bold?'**':'*',end=text.indexOf(delimiter,i+delimiter.length);
      if(end>i+delimiter.length){flush();tokens.push({text:text.slice(i+delimiter.length,end),...(bold?{bold:true}:{italic:true})});i=end+delimiter.length;continue}
    }
    plain+=text[i++];
  }
  flush();return tokens;
}

/** Scientific labels remain live SVG text, including editable scripts. */
export default function ScientificText({text}:{text:string}){
 return <>{scientificTokens(text).map((token,index)=>token.script||token.italic||token.bold?<tspan key={index} baselineShift={token.script} fontSize={token.script?'70%':undefined} fontStyle={token.italic?'italic':undefined} fontWeight={token.bold?700:undefined}>{token.text}</tspan>:<Fragment key={index}>{token.text}</Fragment>)}</>;
}
