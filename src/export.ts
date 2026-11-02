import type { Chart } from './types';
import { exportDownload } from './project';

function figureSvg(chart:Chart):string {
  const original=document.querySelector<SVGSVGElement>('#chart-svg');
  if(!original)throw new Error('Não foi possível encontrar o gráfico para exportar.');
  const svg=original.cloneNode(true) as SVGSVGElement;
  svg.querySelectorAll('[data-editor-only], .editor-only').forEach(el=>el.remove());
  svg.querySelectorAll('[tabindex]').forEach(el=>el.removeAttribute('tabindex'));
  svg.removeAttribute('class');svg.removeAttribute('style');svg.removeAttribute('aria-label');
  svg.setAttribute('xmlns','http://www.w3.org/2000/svg');
  svg.setAttribute('xmlns:xlink','http://www.w3.org/1999/xlink');
  svg.setAttribute('width',String(chart.style.width));svg.setAttribute('height',String(chart.style.height));
  svg.setAttribute('font-family',chart.style.fontFamily);svg.setAttribute('font-size',String(chart.style.fontSize));
  svg.querySelectorAll<SVGElement>('*').forEach(el=>{el.style.cursor='';el.style.outline='';});
  return `<?xml version="1.0" encoding="UTF-8"?>\n${new XMLSerializer().serializeToString(svg)}`;
}

export async function exportFigure(format:'svg'|'png',chart:Chart,scale=2):Promise<void> {
  if(!Number.isFinite(scale)||scale<=0||scale>8)throw new Error('A escala de exportação deve estar entre 0 e 8.');
  const filename=(chart.name||chart.title||'figure').replace(/[<>:"/\\|?*\u0000-\u001f]/g,'-');
  if(document.fonts)await document.fonts.ready;
  const serialized=figureSvg(chart);
  if(format==='svg'){exportDownload(`${filename}.svg`,serialized,'image/svg+xml;charset=utf-8');return;}
  const width=Math.round(chart.style.width*scale),height=Math.round(chart.style.height*scale);
  if(width*height>80_000_000)throw new Error('A imagem é demasiado grande. Reduz as dimensões ou a escala de exportação.');
  const blob=new Blob([serialized],{type:'image/svg+xml;charset=utf-8'}), url=URL.createObjectURL(blob);
  try {
    const image=new Image();await new Promise<void>((resolve,reject)=>{image.onload=()=>resolve();image.onerror=()=>reject(new Error('Não foi possível renderizar o gráfico para PNG.'));image.src=url;});
    const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
    const context=canvas.getContext('2d');if(!context)throw new Error('O browser não suporta a exportação para PNG.');context.drawImage(image,0,0,width,height);
    const png=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('A exportação PNG falhou.')),'image/png'));
    exportDownload(`${filename}.png`,png,'image/png');
  } finally {URL.revokeObjectURL(url);}
}
