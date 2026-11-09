import type {Chart} from './types';
import {scientificLineCount} from './ScientificText';

export function defaultYLabelDistance(chart:Chart):number{return (chart.type==='forest'?Math.min(chart.style.width*.29,200):88)-25}

/** Keep legacy geometry for one-line labels; reserve real space for additional lines. */
export function labelLayout(chart:Chart,{baseLeft=88,right=38,tickLines=1}:{baseLeft?:number;right?:number;tickLines?:number}={}){
 const {style}=chart,titleLineHeight=style.titleSize*1.2,axisLineHeight=(style.fontSize+1)*1.25,tickLineHeight=style.fontSize*1.2;
 const titleExtra=(scientificLineCount(chart.title)-1)*titleLineHeight;
 const xExtra=(scientificLineCount(chart.xLabel)-1)*axisLineHeight;
 const yExtra=(scientificLineCount(chart.yLabel)-1)*axisLineHeight;
 const tickExtra=(tickLines-1)*tickLineHeight;
 const requested=style.yLabelDistance??baseLeft-25;
 const maximum=Math.max(24,style.width-right-50-25-yExtra/2);
 const yDistance=Math.min(Math.max(24,requested),maximum);
 const left=Math.min(style.width-right-10,baseLeft+yExtra/2+Math.max(0,yDistance-(baseLeft-25)));
 let top=(style.legend?104:79)+titleExtra,bottom=89+xExtra+tickExtra;
 const crowded=titleExtra+xExtra+tickExtra>0&&top+bottom>style.height-50;
 if(crowded){
  const deficit=top+bottom-(style.height-50),topReduction=Math.min(26,deficit/2),bottomReduction=Math.min(24,deficit-topReduction);
  top-=topReduction;bottom-=bottomReduction;
  // Extreme labels cannot fit a fixed canvas; keep SVG geometry valid and ask for more height.
  if(top+bottom>style.height-10){const ratio=(style.height-10)/(top+bottom);top*=ratio;bottom*=ratio}
 }
 return {left,right,top,bottom,titleLineHeight,axisLineHeight,tickLineHeight,titleExtra,xLabelY:style.height-24-xExtra,yLabelX:left-yDistance,yDistance,crowded};
}
