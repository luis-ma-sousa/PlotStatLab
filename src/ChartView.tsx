import { useMemo, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent, ReactNode } from 'react';
import { scaleLinear, scaleLog } from 'd3-scale';
import { bin } from 'd3-array';
import { area, curveBasis, line } from 'd3-shape';
import type { AnnotationPosition, Chart, Group, Observation, Selection, Shape } from './types';
import { annotationMetrics, bracketLevels, densityEstimate, errorSize, expandUpperDomain, heatmapRows, mean, placeBrackets, positiveLogDomain, quantile, significanceLabel, swarmLayout } from './chartMath';

interface Props { chart: Chart; groups: Group[]; selection: Selection; onSelect: (selection: Selection) => void; onAnnotationMove: (id: string, position: AnnotationPosition) => void; analysisStale?: boolean; flaggedIds?: string[] }
const categoryTypes = new Set(['bar-swarm', 'bar', 'swarm', 'box', 'violin', 'raincloud', 'paired']);
const fmt = (v: number) => Math.abs(v) >= 10000 || (Math.abs(v) > 0 && Math.abs(v) < .001) ? v.toExponential(1) : Number(v.toPrecision(4)).toLocaleString('en-US', {maximumFractionDigits: 4});
function marker(shape: Shape, x: number, y: number, radius: number, props: React.SVGProps<SVGElement>): ReactNode {
  if (shape === 'square') { const d = radius / Math.SQRT2; return <rect {...props as React.SVGProps<SVGRectElement>} x={x - d} y={y - d} width={d * 2} height={d * 2} />; }
  if (shape === 'diamond') return <path {...props as React.SVGProps<SVGPathElement>} d={`M${x},${y - radius}L${x + radius},${y}L${x},${y + radius}L${x - radius},${y}Z`} />;
  if (shape === 'triangle') return <path {...props as React.SVGProps<SVGPathElement>} d={`M${x},${y - radius}L${x + radius * .866},${y + radius * .5}L${x - radius * .866},${y + radius * .5}Z`} />;
  return <circle {...props as React.SVGProps<SVGCircleElement>} cx={x} cy={y} r={radius} />;
}

export default function ChartView({chart, groups, selection, onSelect, onAnnotationMove, analysisStale = false, flaggedIds = []}: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const suppressRootClick = useRef(false);
  const drag = useRef<{id: string; startX: number; startY: number; position: AnnotationPosition} | null>(null);
  const [preview, setPreview] = useState<{id: string; position: AnnotationPosition} | null>(null);
  const {style} = chart, width = style.width, height = style.height;
  const margin = {left: 88, right: 38, top: style.legend ? 104 : 79, bottom: 89};
  const plotLeft = margin.left, plotRight = width - margin.right, plotTop = margin.top, plotBottom = height - margin.bottom;
  const plotWidth = plotRight - plotLeft, plotHeight = plotBottom - plotTop;
  const categorical = categoryTypes.has(chart.type), distribution = ['histogram', 'density', 'ecdf'].includes(chart.type);
  const allValues = groups.flatMap(g => g.observations.map(o => o.value)).filter(Number.isFinite);
  const useLog = style.yScale === 'log' && chart.type !== 'ecdf' && chart.type !== 'heatmap' && !distribution;
  const visibleGroups = groups.map(g => ({...g, observations: g.observations.filter(o => Number.isFinite(o.value) && (!useLog || o.value > 0))}));
  const values = visibleGroups.flatMap(g => g.observations.map(o => o.value));
  const color = (index: number) => style.palette[index % style.palette.length] || '#387c70';
  const step = plotWidth / Math.max(groups.length, 1), groupX = (index: number) => plotLeft + step * (index + .5);
  const xFor = (id: string) => { const index = groups.findIndex(g => g.id === id); return index < 0 ? undefined : groupX(index); };
  const comparisons = useMemo(() => !analysisStale && chart.showSignificance && categorical ? (chart.analysis?.comparisons ?? []).filter(c => chart.showNs || c.adjustedP < (chart.analysis?.config.alpha ?? .05)) : [], [analysisStale, chart.analysis, chart.showSignificance, chart.showNs, categorical]);
  const brackets = bracketLevels(comparisons, xFor);
  const bracketCount = Math.max(0, ...brackets.map(b => b.level + 1));
  const pointRadius = (id: string) => Math.max(1, chart.pointStyles[id]?.size ?? style.pointSize);
  const collisionRadius = (id: string) => pointRadius(id) + (chart.pointStyles[id]?.strokeWidth ?? 1.15) / 2;
  const maxPointRadius = chart.type === 'bar' ? 0 : Math.max(style.pointSize, ...visibleGroups.flatMap(g => g.observations.map(o => collisionRadius(o.id))));
  const annotationLayout = annotationMetrics(bracketCount, plotHeight, maxPointRadius, style.fontSize + 3);
  const dataMin = values.length ? Math.min(...values) : 0, dataMax = values.length ? Math.max(...values) : 1;
  const minError = Math.min(dataMin, ...visibleGroups.map(g => mean(g.observations.filter(o => !o.excluded).map(o => o.value)) - errorSize(g.observations.filter(o => !o.excluded).map(o => o.value), style.error)));
  const maxError = Math.max(dataMax, ...visibleGroups.map(g => mean(g.observations.filter(o => !o.excluded).map(o => o.value)) + errorSize(g.observations.filter(o => !o.excluded).map(o => o.value), style.error)));
  const rawRange = maxError - minError || Math.abs(maxError) || 1;
  const logDomain = positiveLogDomain(values);
  let minY = useLog ? logDomain[0] : (['bar', 'bar-swarm'].includes(chart.type) ? Math.min(0, minError - (minError < 0 ? rawRange * .08 : 0)) : minError - rawRange * .12);
  let maxY = useLog ? logDomain[1] : maxError + rawRange * .15;
  if (style.yMin !== null && Number.isFinite(style.yMin) && (!useLog || style.yMin > 0)) minY = style.yMin;
  if (maxY <= minY) maxY = useLog ? minY * 10 : minY + Math.max(1, Math.abs(minY) * .1);
  maxY = expandUpperDomain(minY, maxY, maxError, plotHeight, annotationLayout.clearance, useLog);
  if (style.yMax !== null && Number.isFinite(style.yMax) && style.yMax > minY) maxY = style.yMax;
  const yScale = useLog ? scaleLog().domain([minY, maxY]).range([plotBottom, plotTop]) : scaleLinear().domain([minY, maxY]).range([plotBottom, plotTop]);
  const swarm = visibleGroups.map((group, index) => swarmLayout(group.observations, groupX(index) + (chart.type === 'raincloud' ? step * .13 : 0), yScale, collisionRadius, step * (chart.type === 'raincloud' ? .36 : .75)));
  const zeroY = useLog ? plotBottom : Math.max(plotTop, Math.min(plotBottom, yScale(0)));
  const dataTop = Math.min(...visibleGroups.flatMap(g => g.observations.map(o => yScale(o.value) - (chart.type === 'bar' ? 0 : collisionRadius(o.id)))), ...visibleGroups.filter(g => g.observations.length > 0).map(g => yScale(mean(g.observations.filter(o => !o.excluded).map(o => o.value)) + errorSize(g.observations.filter(o => !o.excluded).map(o => o.value), style.error))), plotBottom);
  const positions = preview ? {...chart.annotationPositions, [preview.id]: preview.position} : chart.annotationPositions;
  const placedBrackets = placeBrackets(comparisons, xFor, dataTop, positions, annotationLayout.spacing);

  function selectPoint(e: React.MouseEvent | React.KeyboardEvent, observation: Observation, group: Group) { e.stopPropagation(); onSelect({kind: 'point', id: observation.id, groupId: group.id}); }
  function renderPoint(observation: Observation, group: Group, index: number, x: number, y: number) {
    const own = chart.pointStyles[observation.id] ?? {}, radius = pointRadius(observation.id), selected = selection.kind === 'point' && selection.id === observation.id;
    return <g key={observation.id} data-point-id={observation.id} data-group-id={group.id} role="button" tabIndex={0} aria-label={`${group.name}, ${observation.id}: ${observation.value}`} onClick={e => selectPoint(e, observation, group)} onKeyDown={e => {if (e.key === 'Enter' || e.key === ' ') selectPoint(e, observation, group);}} style={{cursor: 'pointer'}}>
      <title>{`${group.name} · ${observation.id}\nValue: ${observation.value}${observation.subject ? `\nSubject: ${observation.subject}` : ''}`}</title>
      {marker(own.shape ?? style.pointShape, x, y, radius, {fill: own.color ?? color(index), stroke: own.stroke ?? '#ffffff', strokeWidth: own.strokeWidth ?? 1.15, opacity: observation.excluded ? .24 : own.opacity ?? style.pointOpacity})}
      {flaggedIds.includes(observation.id) && !observation.excluded && <circle cx={x} cy={y} r={radius+3} fill="none" stroke="#c88b30" strokeWidth={1.5} pointerEvents="none"/>}
      {observation.excluded && <path d={`M${x-radius},${y-radius}L${x+radius},${y+radius}M${x+radius},${y-radius}L${x-radius},${y+radius}`} stroke={style.axisColor} strokeWidth={1.1} opacity={.45} pointerEvents="none"/>}
      {selected && <circle data-editor-only="true" cx={x} cy={y} r={radius + 4} fill="none" stroke="#224e47" strokeWidth={1.8} strokeDasharray="3 2" />}
      <circle data-editor-only="true" cx={x} cy={y} r={Math.max(7, radius)} fill="transparent" />
    </g>;
  }
  function pointerPosition(e: ReactPointerEvent) { const svg = svgRef.current; if (!svg) return {x: 0, y: 0}; const matrix = svg.getScreenCTM(); if (!matrix) return {x: 0, y: 0}; const point = new DOMPoint(e.clientX, e.clientY).matrixTransform(matrix.inverse()); return {x: point.x, y: point.y}; }
  function startDrag(e: ReactPointerEvent, id: string) { e.stopPropagation(); onSelect({kind: 'annotation', id}); const point = pointerPosition(e), position = chart.annotationPositions[id] ?? {dx: 0, dy: 0}; drag.current = {id, startX: point.x, startY: point.y, position}; svgRef.current?.setPointerCapture(e.pointerId); }
  function moveDrag(e: ReactPointerEvent) { if (!drag.current) return; const p = pointerPosition(e), d = drag.current; setPreview({id: d.id, position: {dx: d.position.dx + p.x - d.startX, dy: d.position.dy + p.y - d.startY}}); }
  function endDrag(e: ReactPointerEvent) {
    const d = drag.current; if (!d) return; const p = pointerPosition(e);
    const dx = p.x - d.startX, dy = p.y - d.startY;
    // SVG pointer capture retargets the following click to the SVG itself.
    suppressRootClick.current = true;
    if (Math.hypot(dx, dy) > 1) onAnnotationMove(d.id, {dx: d.position.dx + dx, dy: d.position.dy + dy});
    onSelect({kind: 'annotation', id: d.id});
    drag.current = null; setPreview(null);
    if (svgRef.current?.hasPointerCapture(e.pointerId)) svgRef.current.releasePointerCapture(e.pointerId);
  }
  function annotationKey(e: React.KeyboardEvent, id: string) { const delta = e.shiftKey ? 10 : 2, current = chart.annotationPositions[id] ?? {dx: 0, dy: 0}; const vectors: Record<string, [number, number]> = {ArrowLeft: [-delta, 0], ArrowRight: [delta, 0], ArrowUp: [0, -delta], ArrowDown: [0, delta]}; if (vectors[e.key]) {e.preventDefault(); const [dx, dy] = vectors[e.key]; onAnnotationMove(id, {dx: current.dx + dx, dy: current.dy + dy});} }

  const axisProps = {stroke: style.axisColor, strokeWidth: 1.2, fill: 'none'}, textProps = {fill: style.axisColor, fontSize: style.fontSize};
  let content: ReactNode, xTickItems: {value: number; label: string}[] = [], yTickItems: {value: number; label: string}[] = [], horizontalLabel = chart.xLabel, verticalLabel = chart.yLabel;
  if (categorical) {
    const yTicks = yScale.ticks(6).filter(v => v >= minY && v <= maxY);
    yTickItems = yTicks.map(v => ({value: yScale(v), label: fmt(v)}));
    xTickItems = groups.map((g, i) => ({value: groupX(i), label: g.name}));
    content = <>
      {chart.type === 'paired' && Array.from(new Set(visibleGroups.flatMap(g => g.observations.map(o => o.subject).filter((s): s is string => !!s)))).map(subject => {
        const paired = visibleGroups.flatMap((g, i) => { const o = g.observations.find(o => o.subject === subject && !o.excluded); return o ? [[groupX(i), yScale(o.value)] as [number, number]] : []; }); return paired.length > 1 ? <path key={subject} d={line()(paired) ?? ''} fill="none" stroke={style.axisColor} strokeOpacity={.22} strokeWidth={style.lineWidth} /> : null;
      })}
      {visibleGroups.map((g, index) => {
        const vals = g.observations.filter(o => !o.excluded).map(o => o.value), center = groupX(index), average = mean(vals), error = errorSize(vals, style.error), w = step * style.barWidth;
        const summary = chart.analysis?.summaries.find(s => s.group === g.id || s.group === g.name);
        const ci = style.error === 'ci95' && !analysisStale && summary?.ci95 ? summary.ci95 : [average - error, average + error];
        const bottom = yScale(Math.max(useLog ? minY : -Infinity, ci[0])), top = yScale(Math.max(useLog ? minY : -Infinity, ci[1]));
        const quartiles = [quantile(vals, .25), quantile(vals, .5), quantile(vals, .75)], iqr = quartiles[2] - quartiles[0], low = vals.length ? Math.min(...vals.filter(v => v >= quartiles[0] - 1.5 * iqr)) : 0, high = vals.length ? Math.max(...vals.filter(v => v <= quartiles[2] + 1.5 * iqr)) : 0;
        const violinDensity = densityEstimate(vals, [Math.max(useLog ? minY : -Infinity, dataMin - rawRange * .09), dataMax + rawRange * .09]);
        const maxDensity = Math.max(...violinDensity.map(d => d.density), 1e-9), violinWidth = step * .33;
        const violinPath = area<{x: number; density: number}>().y(d => yScale(d.x)).x0(d => center - d.density / maxDensity * violinWidth).x1(d => chart.type === 'raincloud' ? center - 5 : center + d.density / maxDensity * violinWidth).curve(curveBasis)(violinDensity);
        return <g key={g.id}>
          {vals.length > 0 && ['bar', 'bar-swarm'].includes(chart.type) && <rect data-group-id={g.id} x={center - w / 2} y={Math.min(yScale(average), zeroY)} width={w} height={Math.max(.5, Math.abs(yScale(average) - zeroY))} fill={color(index)} fillOpacity={style.barOpacity} stroke={color(index)} strokeWidth={style.lineWidth} onClick={e => {e.stopPropagation(); onSelect({kind: 'group', id: g.id});}} style={{cursor: 'pointer'}} />}
          {vals.length > 0 && ['violin', 'raincloud'].includes(chart.type) && <path d={violinPath ?? ''} fill={color(index)} fillOpacity={style.barOpacity} stroke={color(index)} strokeWidth={style.lineWidth} onClick={e => {e.stopPropagation(); onSelect({kind: 'group', id: g.id});}} style={{cursor: 'pointer'}} />}
          {vals.length > 0 && chart.type === 'box' && <g stroke={color(index)} strokeWidth={style.lineWidth} fill={color(index)} fillOpacity={style.barOpacity} onClick={e => {e.stopPropagation(); onSelect({kind: 'group', id: g.id});}} style={{cursor: 'pointer'}}>
            <path d={`M${center},${yScale(low)}V${yScale(high)}M${center - w / 4},${yScale(low)}H${center + w / 4}M${center - w / 4},${yScale(high)}H${center + w / 4}`} fill="none" />
            <rect x={center - w / 2} y={yScale(quartiles[2])} width={w} height={Math.max(1, yScale(quartiles[0]) - yScale(quartiles[2]))} />
            <path d={`M${center - w / 2},${yScale(quartiles[1])}H${center + w / 2}`} strokeWidth={2} />
          </g>}
          {vals.length > 0 && ['bar', 'bar-swarm', 'swarm', 'paired'].includes(chart.type) && <g stroke={style.axisColor} strokeWidth={style.lineWidth} fill="none" pointerEvents="none">
            {style.error !== 'none' && vals.length > 1 && <path d={`M${center},${top}V${bottom}M${center - 6},${top}H${center + 6}M${center - 6},${bottom}H${center + 6}`} />}
            {['swarm', 'paired'].includes(chart.type) && <path d={`M${center - w / 2},${yScale(average)}H${center + w / 2}`} strokeWidth={2.3} />}
          </g>}
          {['violin', 'raincloud'].includes(chart.type) && vals.length > 0 && <g pointerEvents="none" stroke={style.axisColor} strokeWidth={1.4}><path d={`M${center},${yScale(quartiles[0])}V${yScale(quartiles[2])}`} /><circle cx={center} cy={yScale(quartiles[1])} r={3} fill={style.background} /></g>}
          {chart.type !== 'bar' && g.observations.map(o => {
            const point = swarm[index].find(p => p.id === o.id)!;
            // Paired points share an exact x coordinate to preserve subject trajectories.
            return renderPoint(o, g, index, chart.type === 'paired' ? center : point.x, point.y);
          })}
        </g>;
      })}
    </>;
  } else if (chart.type === 'heatmap') {
    const rowLayout = heatmapRows(visibleGroups), rows = Math.max(1, rowLayout.rows.length), cellHeight = plotHeight / rows;
    const heatScale = scaleLinear<string>().domain(dataMin === dataMax ? [dataMin - .5, dataMin, dataMin + .5] : [dataMin, (dataMin + dataMax) / 2, dataMax]).range(['#e8f0ec', '#7eb0a0', '#214c48']);
    xTickItems = groups.map((g, i) => ({value: groupX(i), label: g.name}));
    yTickItems = rowLayout.rows.map((row, i) => ({value: plotTop + cellHeight * (i + .5), label: row.label})).filter((_, i) => rows <= 16 || i % Math.ceil(rows / 12) === 0);
    verticalLabel = chart.yLabel || 'Observation';
    content = <>{visibleGroups.flatMap((g, i) => g.observations.map(o => <g key={o.id} data-point-id={o.id} role="button" tabIndex={0} aria-label={`${g.name}, ${o.id}: ${o.value}`} onClick={e => selectPoint(e, o, g)} onKeyDown={e => {if (e.key === 'Enter') selectPoint(e, o, g);}} style={{cursor: 'pointer'}}><title>{`${g.name} · ${o.id}: ${o.value}`}</title><rect x={plotLeft + step * i + 1} y={plotTop + rowLayout.byObservation[o.id] * cellHeight + 1} width={step - 2} height={cellHeight - 2} fill={chart.pointStyles[o.id]?.color ?? heatScale(o.value)} opacity={o.excluded ? .24 : chart.pointStyles[o.id]?.opacity ?? 1} />{(flaggedIds.includes(o.id)||o.excluded)&&<rect x={plotLeft+step*i+2} y={plotTop+rowLayout.byObservation[o.id]*cellHeight+2} width={step-4} height={cellHeight-4} fill="none" stroke={o.excluded?style.axisColor:'#c88b30'} strokeWidth={1.5} strokeDasharray={o.excluded?'4 3':undefined} pointerEvents="none"/>}{selection.kind === 'point' && selection.id === o.id && <rect data-editor-only="true" x={plotLeft + step * i + 2} y={plotTop + rowLayout.byObservation[o.id] * cellHeight + 2} width={step - 4} height={cellHeight - 4} fill="none" stroke="#172f2a" strokeWidth={2} />}</g>))}<text x={plotRight} y={plotBottom + 57} textAnchor="end" {...textProps} fontSize={10}>Scale: {fmt(dataMin)} — {fmt(dataMax)}</text></>;
  } else {
    const xValues = distribution ? allValues : visibleGroups.flatMap(g => g.observations.map((o, i) => o.x ?? i + 1));
    let minX = xValues.length ? Math.min(...xValues) : 0, maxX = xValues.length ? Math.max(...xValues) : 1; const xSpan = maxX - minX || Math.abs(maxX) || 1; minX -= xSpan * .06; maxX += xSpan * .06;
    const x = scaleLinear().domain([minX, maxX]).range([plotLeft, plotRight]);
    xTickItems = x.ticks(6).map(v => ({value: x(v), label: fmt(v)}));
    const bins = visibleGroups.map(g => bin().domain([minX, maxX]).thresholds(Math.min(30, Math.max(5, Math.ceil(Math.sqrt(allValues.length)))))(g.observations.filter(o => !o.excluded).map(o => o.value)));
    const densities = visibleGroups.map(g => densityEstimate(g.observations.filter(o => !o.excluded).map(o => o.value), [minX, maxX], 100));
    const maxCount = Math.max(1, ...bins.flatMap(b => b.map(v => v.length)));
    const maxDensity = Math.max(.001, ...densities.flatMap(ds => ds.map(d => d.density)));
    const distY = scaleLinear().domain([0, chart.type === 'ecdf' ? 1.04 : chart.type === 'histogram' ? maxCount * 1.15 : maxDensity * 1.15]).range([plotBottom, plotTop]);
    const y = distribution ? distY : yScale;
    yTickItems = y.ticks(6).map(v => ({value: y(v), label: fmt(v)}));
    if (distribution) { horizontalLabel = chart.xLabel || 'Value'; verticalLabel = chart.type === 'histogram' ? 'Frequency' : chart.type === 'ecdf' ? 'Cumulative probability' : 'Density'; }
    content = <>{visibleGroups.map((g, index) => {
      const ordered = g.observations.filter(o => !o.excluded).sort((a, b) => a.value - b.value);
      const points = g.observations.map((o, i) => ({observation: o, x: o.x ?? i + 1})).sort((a, b) => a.x - b.x);
      return <g key={g.id}>
        {chart.type === 'histogram' && bins[index].map((b, i) => <rect key={i} x={x(b.x0 ?? 0) + .7} y={y(b.length)} width={Math.max(0, x(b.x1 ?? 0) - x(b.x0 ?? 0) - 1.4)} height={plotBottom - y(b.length)} fill={color(index)} fillOpacity={Math.min(.6, style.barOpacity + .15)} stroke={color(index)} strokeWidth={.7} onClick={e => {e.stopPropagation(); onSelect({kind: 'group', id: g.id});}}><title>{`${g.name}: ${fmt(b.x0 ?? 0)}–${fmt(b.x1 ?? 0)}; n=${b.length}`}</title></rect>)}
        {chart.type === 'density' && <path d={area<{x: number; density: number}>().x(d => x(d.x)).y0(plotBottom).y1(d => y(d.density)).curve(curveBasis)(densities[index]) ?? ''} fill={color(index)} fillOpacity={style.barOpacity * .65} stroke={color(index)} strokeWidth={style.lineWidth} onClick={e => {e.stopPropagation(); onSelect({kind: 'group', id: g.id});}} />}
        {chart.type === 'ecdf' && ordered.length > 0 && <path d={`M${x(minX)},${y(0)}${ordered.map((o, i) => `H${x(o.value)}V${y((i + 1) / ordered.length)}`).join('')}H${x(maxX)}`} fill="none" stroke={color(index)} strokeWidth={style.lineWidth + .5} />}
        {chart.type === 'ecdf' && ordered.map((o, i) => renderPoint(o, g, index, x(o.value), y((i + 1) / ordered.length)))}
        {chart.type === 'line' && <path d={line<{observation: Observation; x: number}>().x(p => x(p.x)).y(p => y(p.observation.value))(points) ?? ''} fill="none" stroke={color(index)} strokeWidth={style.lineWidth} />}
        {['line', 'scatter'].includes(chart.type) && points.map(p => renderPoint(p.observation, g, index, x(p.x), y(p.observation.value)))}
      </g>;
    })}</>;
  }
  const warnings = [];
  if (useLog && allValues.some(v => v <= 0)) warnings.push('Values ≤ 0 are not shown on a logarithmic scale.');
  if (chart.type === 'paired' && groups.some(g => g.observations.some(o => !o.subject))) warnings.push('Lines connect only observations with matching subject IDs.');
  if (bracketCount > 5) warnings.push('Many comparisons: increase the height or select fewer pairs.');
  return <svg ref={svgRef} id="chart-svg" xmlns="http://www.w3.org/2000/svg" width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={chart.title || 'Scientific chart'} style={{display: 'block', maxWidth: '100%', height: 'auto', fontFamily: style.fontFamily, background: style.background, touchAction: 'none'}} onClick={() => {if (suppressRootClick.current) {suppressRootClick.current = false; return;} onSelect({kind: 'chart'});}} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={() => {drag.current = null; suppressRootClick.current = false; setPreview(null);}}>
    <rect width={width} height={height} fill={style.background} />
    <defs><clipPath id={`plot-clip-${chart.id}`}><rect x={plotLeft - 1} y={plotTop - 1} width={plotWidth + 2} height={plotHeight + 2} /></clipPath></defs>
    <text data-edit="title" x={width / 2} y={39} textAnchor="middle" fill={style.axisColor} fontSize={style.titleSize} fontWeight={600} style={{cursor: 'pointer'}} onClick={e => {e.stopPropagation(); onSelect({kind: 'title'});}}>{chart.title}</text>
    {style.legend && <g transform={`translate(${plotLeft},66)`}>{groups.map((g, i) => {const spacing = Math.min(160, plotWidth / Math.max(groups.length, 1)); return <g key={g.id} transform={`translate(${i * spacing},0)`} onClick={e => {e.stopPropagation(); onSelect({kind: 'group', id: g.id});}} style={{cursor: 'pointer'}}><circle cx={4} cy={-4} r={3.7} fill={color(i)} /><text x={15} fill={style.axisColor} fontSize={Math.max(10, style.fontSize - 2)}>{g.name.length > 21 ? `${g.name.slice(0, 19)}…` : g.name}</text></g>;})}</g>}
    {style.grid && yTickItems.map((tick, i) => <line key={i} x1={plotLeft} x2={plotRight} y1={tick.value} y2={tick.value} stroke={style.axisColor} strokeOpacity={.09} strokeWidth={.8} />)}
    <g clipPath={`url(#plot-clip-${chart.id})`}>{content}</g>
    {placedBrackets.map(b => {const selected = selection.kind === 'annotation' && selection.id === b.comparison.id; const label = chart.significanceDisplay === 'p' ? `p = ${Number(b.comparison.adjustedP.toPrecision(3))}` : significanceLabel(b.comparison.adjustedP); return <g key={b.comparison.id} data-annotation-id={b.comparison.id} role="button" aria-label={`Comparison ${b.comparison.groupA} with ${b.comparison.groupB}, ${label}. Drag to reposition.`} tabIndex={0} style={{cursor: 'grab'}} onPointerDown={e => startDrag(e, b.comparison.id)} onClick={e => {e.stopPropagation(); onSelect({kind: 'annotation', id: b.comparison.id});}} onKeyDown={e => annotationKey(e, b.comparison.id)}>
      <title>{`${b.comparison.groupA} × ${b.comparison.groupB}\nAdjusted p = ${b.comparison.adjustedP}\nDrag to move; use arrow keys for fine adjustment.`}</title>
      <path d={`M${b.x1},${b.y + 6}V${b.y}H${b.x2}V${b.y + 6}`} stroke={style.axisColor} strokeWidth={1.15} fill="none" />
      <text x={b.labelX} y={b.y - 5} textAnchor="middle" fill={style.axisColor} fontSize={chart.significanceDisplay === 'stars' ? annotationLayout.fontSize : Math.min(style.fontSize - 1, annotationLayout.fontSize)} fontWeight={chart.significanceDisplay === 'stars' ? 600 : 400}>{label}</text>
      <rect data-editor-only="true" x={b.x1 - 8} y={b.y - 26} width={b.x2 - b.x1 + 16} height={40} fill="transparent" stroke={selected ? '#4d8a78' : 'none'} strokeDasharray="4 3" rx={3} />
    </g>;})}
    <path d={`M${plotLeft},${plotTop}V${plotBottom}H${plotRight}`} {...axisProps} />
    {yTickItems.map((tick, i) => <g key={i}><line x1={plotLeft - 5} x2={plotLeft} y1={tick.value} y2={tick.value} {...axisProps} /><text x={plotLeft - 11} y={tick.value + style.fontSize * .34} textAnchor="end" {...textProps}>{tick.label}</text></g>)}
    {xTickItems.map((tick, i) => <g key={i}><line x1={tick.value} x2={tick.value} y1={plotBottom} y2={plotBottom + 5} {...axisProps} /><text x={tick.value} y={plotBottom + 24} textAnchor="middle" {...textProps}>{tick.label}</text></g>)}
    <text data-edit="xaxis" x={(plotLeft + plotRight) / 2} y={height - 24} textAnchor="middle" {...textProps} fontSize={style.fontSize + 1} style={{cursor: 'pointer'}} onClick={e => {e.stopPropagation(); onSelect({kind: 'xaxis'});}}>{horizontalLabel}</text>
    <text data-edit="yaxis" transform={`translate(25,${(plotTop + plotBottom) / 2}) rotate(-90)`} textAnchor="middle" {...textProps} fontSize={style.fontSize + 1} style={{cursor: 'pointer'}} onClick={e => {e.stopPropagation(); onSelect({kind: 'yaxis'});}}>{verticalLabel}</text>
    {warnings.length > 0 && <text data-editor-only="true" x={plotLeft} y={height - 5} fontSize={9} fill="#9a6b2b">{warnings.join(' ')}</text>}
    {selection.kind === 'title' && <rect data-editor-only="true" x={plotLeft} y={15} width={plotWidth} height={32} fill="none" stroke="#4d8a78" strokeDasharray="4 3" rx={3} />}
  </svg>;
}
