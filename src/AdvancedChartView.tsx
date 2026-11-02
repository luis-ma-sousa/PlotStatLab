import type {ReactNode, SVGProps} from 'react';
import {scaleLinear, scaleLog} from 'd3-scale';
import {area, curveStepAfter, line} from 'd3-shape';
import type {Chart, Group, Selection, Shape} from './types';
import type {AdvancedChartOptions, AdvancedResult, AdvancedRow, AdvancedSeriesPoint} from './advancedTypes';
import {agreementCoordinates, agreementSummary, forestInterval, kaplanMeier, paddedDomain, stepPath, survivalAt, volcanoCoordinates} from './advancedChartMath';
import {errorSize, mean, swarmLayout} from './chartMath';
import ScientificText from './ScientificText';

interface Props {
  svgId?: string;
  chart: Chart & {advancedOptions?: AdvancedChartOptions};
  groups: Group[];
  rows: AdvancedRow[];
  result?: AdvancedResult;
  selection: Selection;
  onSelect: (selection: Selection) => void;
  onContextMenu?: (event: React.MouseEvent, selection: Selection) => void;
  analysisStale?: boolean;
  flaggedIds?: string[];
}
const formatNumber = (value: number) => Math.abs(value) >= 10000 || Math.abs(value) > 0 && Math.abs(value) < .001 ? value.toExponential(1) : Number(value.toPrecision(4)).toLocaleString('en-US', {maximumFractionDigits: 4});
const isCoordinate = <T extends {x?: number; y?: number}>(point: T): point is T & {x: number; y: number} => Number.isFinite(point.x) && Number.isFinite(point.y);

function marker(shape: Shape, x: number, y: number, radius: number, props: SVGProps<SVGElement>): ReactNode {
  if (shape === 'square') {const d = radius / Math.SQRT2; return <rect {...props as SVGProps<SVGRectElement>} x={x-d} y={y-d} width={2*d} height={2*d}/>;}
  if (shape === 'diamond') return <path {...props as SVGProps<SVGPathElement>} d={`M${x},${y-radius}L${x+radius},${y}L${x},${y+radius}L${x-radius},${y}Z`}/>;
  if (shape === 'triangle') return <path {...props as SVGProps<SVGPathElement>} d={`M${x},${y-radius}L${x+radius*.866},${y+radius*.5}L${x-radius*.866},${y+radius*.5}Z`}/>;
  return <circle {...props as SVGProps<SVGCircleElement>} cx={x} cy={y} r={radius}/>;
}

/** Each plotted measurement keeps the same stable ID and point overrides as the standard editor. */
export default function AdvancedChartView({svgId = 'chart-svg', chart, groups, rows, result, selection, onSelect, onContextMenu, analysisStale = false, flaggedIds = []}: Props) {
  const {style} = chart, options = chart.advancedOptions ?? {};
  const width = style.width, height = style.height;
  const margin = {left: chart.type === 'forest' ? Math.min(width * .29, 200) : 88, right: 40, top: style.legend ? 104 : 79, bottom: 89};
  const left = margin.left, right = width-margin.right, top = margin.top, bottom = height-margin.bottom;
  const plotWidth = Math.max(10, right-left), plotHeight = Math.max(10, bottom-top);
  const color = (index: number) => style.palette[index % style.palette.length] || '#387c70';
  const rowGroupName = (row: AdvancedRow) => row.factorA || row.group || groups.find(g => g.id === row.groupId || g.observations.some(o => o.id === row.id))?.name || 'All observations';
  const groupNames = [...new Set(rows.map(rowGroupName))];
  const seriesIndex = (row: AdvancedRow) => Math.max(0, groupNames.indexOf(rowGroupName(row)));
  const groupId = (row: AdvancedRow) => groups.find(group => group.observations.some(observation => observation.id === row.id))?.id ?? row.groupId ?? groups[0]?.id ?? 'advanced';
  const ownRadius = (id: string) => Math.max(1, chart.pointStyles[id]?.size ?? style.pointSize);
  const collisionRadius = (id: string) => ownRadius(id) + (chart.pointStyles[id]?.strokeWidth ?? 1.15)/2;
  const cleanRows = rows.filter(row => Number.isFinite(row.y));
  const availableResult = analysisStale ? undefined : result;
  const notes: string[] = [];
  let horizontalLabel = chart.xLabel, verticalLabel = chart.yLabel;
  let xTicks: {value: number; label: string}[] = [], yTicks: {value: number; label: string}[] = [];
  let content: ReactNode, legend = groupNames.map((name, index) => ({name, color: color(index)}));

  function contextMenu(event: React.MouseEvent, target: Selection) {if (!onContextMenu) return; event.preventDefault(); event.stopPropagation(); onSelect(target); onContextMenu(event,target);}
  function point(row: AdvancedRow, x: number, y: number, index = seriesIndex(row), censor = false) {
    const own = chart.pointStyles[row.id] ?? {}, radius = ownRadius(row.id), selected = selection.kind === 'point' && selection.id === row.id;
    const select = (event: React.MouseEvent | React.KeyboardEvent) => {event.stopPropagation(); onSelect({kind: 'point', id: row.id, groupId: groupId(row)});};
    return <g key={row.id} data-point-id={row.id} data-group-id={groupId(row)} data-excluded={row.excluded || undefined} role="button" aria-pressed={selected} tabIndex={0} aria-label={`${row.label || row.id}, ${rowGroupName(row)}: ${row.y}${censor ? ', right-censored' : ''}${row.excluded ? ', excluded from analysis' : ''}`} onClick={select} onContextMenu={event=>contextMenu(event,{kind:'point',id:row.id,groupId:groupId(row)})} onKeyDown={event => {if (event.key === 'Enter' || event.key === ' ') {event.preventDefault(); select(event);}}} style={{cursor: 'pointer'}}>
      <title>{`${row.label || row.id} · ${rowGroupName(row)}\n${row.x === undefined ? '' : `X: ${row.x}\n`}Y: ${row.y}${row.subject ? `\nSubject: ${row.subject}` : ''}${censor ? '\nRight-censored' : ''}${row.excluded ? '\nExcluded from analysis' : ''}`}</title>
      {marker(own.shape ?? style.pointShape, x, y, radius, {fill: row.excluded ? style.background : own.color ?? color(index), stroke: row.excluded ? own.color ?? color(index) : own.stroke ?? '#ffffff', strokeWidth: own.strokeWidth ?? 1.15, opacity: row.excluded ? .65 : own.opacity ?? style.pointOpacity})}
      {censor && <path d={`M${x},${y-radius-2}V${y+radius+2}`} stroke={own.color ?? color(index)} strokeWidth={Math.max(1, style.lineWidth)} pointerEvents="none"/>}
      {flaggedIds.includes(row.id) && !row.excluded && <circle cx={x} cy={y} r={radius+3} fill="none" stroke="#c88b30" strokeWidth={1.5} pointerEvents="none"/>}
      {row.excluded && <path d={`M${x-radius},${y-radius}L${x+radius},${y+radius}M${x+radius},${y-radius}L${x-radius},${y+radius}`} stroke={style.axisColor} strokeWidth={1.1} opacity={.65} pointerEvents="none"/>}
      {selected && <circle data-editor-only="true" cx={x} cy={y} r={radius+4} fill="none" stroke="#224e47" strokeWidth={1.8} strokeDasharray="3 2"/>}
      <circle data-editor-only="true" cx={x} cy={y} r={radius + .75} fill="transparent"/>
    </g>;
  }
  function selectText(event: React.MouseEvent, kind: 'title' | 'xaxis' | 'yaxis') {event.stopPropagation(); onSelect({kind});}
  function limits(values: number[], axis: 'x' | 'y', includeZero = false): [number, number] {
    const log = axis === 'x' ? options.xScale === 'log' : style.yScale === 'log' && chart.type !== 'volcano';
    let [min, max] = paddedDomain(values, includeZero);
    if (log) {
      const positive = values.filter(value => value > 0 && Number.isFinite(value));
      min = positive.length ? Math.min(...positive) / 1.15 : .1;
      max = positive.length ? Math.max(...positive) * 1.15 : 10;
      if (max <= min) max = min * 10;
    }
    const customMin = axis === 'x' ? options.xMin : style.yMin, customMax = axis === 'x' ? options.xMax : style.yMax;
    if (customMin !== undefined && customMin !== null && Number.isFinite(customMin) && (!log || customMin > 0)) min = customMin;
    if (customMax !== undefined && customMax !== null && Number.isFinite(customMax) && customMax > min) max = customMax;
    if (max <= min) max = log ? min*10 : min+1;
    return [min, max];
  }
  function numericScale(domain: [number, number], range: [number, number], logarithmic: boolean) {return logarithmic ? scaleLog().domain(domain).range(range) : scaleLinear().domain(domain).range(range);}
  function fitBand(points: AdvancedSeriesPoint[], x: (n: number) => number, y: (n: number) => number, shade: string, step = false): ReactNode {
    if (options.showConfidence === false) return null;
    const valid = points.filter(p => isCoordinate(p) && Number.isFinite(p.lower) && Number.isFinite(p.upper) && Number.isFinite(x(p.x)) && Number.isFinite(y(p.lower!)) && Number.isFinite(y(p.upper!)));
    if (valid.length < 2) return null;
    const path = area<AdvancedSeriesPoint>().x(p => x(p.x)).y0(p => y(p.lower!)).y1(p => y(p.upper!));
    if (step) path.curve(curveStepAfter);
    return <path d={path(valid) ?? ''} fill={shade} fillOpacity={.12} stroke="none"/>;
  }

  if (chart.type === 'grouped') {
    const aLevels = [...new Set(cleanRows.map(row => row.factorA || row.group || 'All observations'))];
    const bLevels = [...new Set(cleanRows.map(row => row.factorB || 'Response'))];
    const cells = aLevels.flatMap((factorA, a) => bLevels.map((factorB, b) => {
      const cellRows = cleanRows.filter(row => (row.factorA || row.group || 'All observations') === factorA && (row.factorB || 'Response') === factorB);
      const values = cellRows.filter(row => !row.excluded).map(row => row.y);
      return {factorA, factorB, a, b, rows: cellRows, values, mean: mean(values), error: errorSize(values, style.error)};
    }));
    const yDomain = limits([...cleanRows.map(row => row.y), ...cells.filter(cell => cell.values.length).flatMap(cell => [cell.mean-cell.error, cell.mean+cell.error])], 'y', true);
    const y = numericScale(yDomain, [bottom, top], style.yScale === 'log');
    const step = plotWidth/Math.max(1, aLevels.length), cellWidth = step*.8/Math.max(1, bLevels.length);
    const center = (a: number, b: number) => left+step*(a+.5)+cellWidth*(b-(bLevels.length-1)/2);
    const zero = style.yScale === 'log' ? bottom : Math.max(top, Math.min(bottom, y(0)));
    const barWidth = cellWidth*Math.min(.9, style.barWidth);
    xTicks = aLevels.map((label, a) => ({value: left+step*(a+.5), label}));
    yTicks = y.ticks(6).map(value => ({value: y(value), label: formatNumber(value)}));
    legend = bLevels.map((name, index) => ({name, color: color(index)}));
    horizontalLabel ||= 'Factor A'; verticalLabel ||= 'Response';
    content = <>{cells.map(cell => {
      const displayed = cell.rows.filter(row => style.yScale !== 'log' || row.y > 0);
      const swarm = swarmLayout(displayed.map(row => ({id: row.id, value: row.y})), center(cell.a, cell.b), y, collisionRadius, cellWidth*.9);
      return <g key={`${cell.factorA}\0${cell.factorB}`} data-series-name={`${cell.factorA} / ${cell.factorB}`}>
        {cell.values.length > 0 && (style.yScale !== 'log' || cell.mean > 0) && <rect x={center(cell.a, cell.b)-barWidth/2} y={Math.min(y(cell.mean), zero)} width={barWidth} height={Math.max(.5, Math.abs(y(cell.mean)-zero))} fill={color(cell.b)} fillOpacity={style.barOpacity} stroke={color(cell.b)} strokeWidth={style.lineWidth}/>}
        {cell.values.length > 1 && style.error !== 'none' && (style.yScale !== 'log' || cell.mean+cell.error > 0) && <path d={`M${center(cell.a,cell.b)},${y(Math.max(style.yScale === 'log' ? yDomain[0] : -Infinity, cell.mean-cell.error))}V${y(cell.mean+cell.error)}M${center(cell.a,cell.b)-5},${y(cell.mean+cell.error)}H${center(cell.a,cell.b)+5}M${center(cell.a,cell.b)-5},${y(Math.max(style.yScale === 'log' ? yDomain[0] : -Infinity, cell.mean-cell.error))}H${center(cell.a,cell.b)+5}`} fill="none" stroke={style.axisColor} strokeWidth={style.lineWidth}/>}
        {displayed.map(row => {const position = swarm.find(position => position.id === row.id)!; return point(row, position.x, position.y, cell.b);})}
      </g>;
    })}</>;
    if (!cleanRows.every(row => row.factorA && row.factorB)) notes.push('Assign Factor A and Factor B columns to represent the two-factor design.');
  } else if (chart.type === 'forest') {
    const forestRows = cleanRows.filter(row => !!forestInterval(row));
    const reference = Number.isFinite(options.forestReference) ? options.forestReference! : 0;
    const xDomain = limits([...forestRows.flatMap(row => [row.lower!, row.upper!]), reference], 'x');
    const x = numericScale(xDomain, [left, right], options.xScale === 'log');
    const visible = forestRows.filter(row => options.xScale !== 'log' || row.lower! > 0);
    const rowHeight = plotHeight/Math.max(1, visible.length);
    xTicks = x.ticks(6).map(value => ({value: x(value), label: formatNumber(value)}));
    yTicks = visible.map((row, index) => ({value: top+rowHeight*(index+.5), label: row.label || row.subject || row.id}));
    horizontalLabel ||= 'Effect estimate and interval'; verticalLabel = '';
    content = <>
      {(options.xScale !== 'log' || reference > 0) && <path d={`M${x(reference)},${top}V${bottom}`} stroke={style.axisColor} strokeOpacity={.4} strokeDasharray="4 4" fill="none"/>}
      {visible.map((row, index) => {const cy = top+rowHeight*(index+.5), own = chart.pointStyles[row.id] ?? {}; return <g key={row.id}>
        <path d={`M${x(row.lower!)},${cy}H${x(row.upper!)}M${x(row.lower!)},${cy-4}V${cy+4}M${x(row.upper!)},${cy-4}V${cy+4}`} stroke={own.color ?? color(seriesIndex(row))} strokeWidth={style.lineWidth} strokeOpacity={row.excluded ? .24 : own.opacity ?? 1} fill="none"/>
        {point(row, x(row.y), cy)}
      </g>;})}
    </>;
    if (forestRows.length !== cleanRows.length) notes.push('Forest plots require Lower ≤ Y ≤ Upper for every interval.');
    if (options.xScale === 'log' && visible.length !== forestRows.length) notes.push('Intervals at or below zero are omitted from the logarithmic axis.');
  } else if (chart.type === 'kaplan-meier') {
    const valid = cleanRows.filter(row => row.y >= 0 && typeof row.event === 'boolean');
    const xDomain = limits([0, ...valid.map(row => row.y)], 'x', true);
    if (options.xMin == null && options.xScale !== 'log') xDomain[0] = 0;
    const x = numericScale(xDomain, [left, right], options.xScale === 'log');
    const y = scaleLinear().domain([style.yMin ?? 0, style.yMax ?? 1.04]).range([bottom, top]);
    xTicks = x.ticks(6).map(value => ({value: x(value), label: formatNumber(value)}));
    yTicks = y.ticks(5).map(value => ({value: y(value), label: formatNumber(value)}));
    horizontalLabel ||= 'Time'; verticalLabel ||= 'Survival probability';
    content = <>{groupNames.map((name, index) => {
      const groupRows = valid.filter(row => rowGroupName(row) === name), localSteps = kaplanMeier(groupRows);
      const fromAnalysis = availableResult?.series?.find(series => series.kind === 'survival' && (series.group === name || series.name === name));
      let steps: AdvancedSeriesPoint[] = fromAnalysis?.points.filter(isCoordinate) ?? localSteps;
      if (steps.length && steps[0].x !== 0) steps = [{x: 0, y: 1}, ...steps];
      if (options.xScale === 'log') steps = [{x: xDomain[0], y: survivalAt(steps,xDomain[0])}, ...steps.filter(step => step.x > xDomain[0])];
      if (!steps.length) return null;
      const final = steps[steps.length-1];
      return <g key={name} data-series-name={name}>
        {fitBand(steps, x, y, color(index), true)}
        <path d={stepPath([...steps, {x: Math.max(final.x, xDomain[1]), y: final.y}], x, y)} fill="none" stroke={color(index)} strokeWidth={style.lineWidth+ .5}/>
        {groupRows.filter(row => options.xScale !== 'log' || row.y > 0).map(row => point(row, x(row.y), y(survivalAt(localSteps, row.y)), index, !row.event))}
      </g>;
    })}</>;
    if (valid.length !== cleanRows.length) notes.push('Survival rows require nonnegative Y=time and explicit Event=true/false; false means right-censored.');
    if (options.xScale === 'log') notes.push('Time zero is not displayed on a logarithmic axis.');
  } else {
    const transformed = cleanRows.flatMap(row => {
      const coordinates = chart.type === 'volcano' ? volcanoCoordinates(row) : chart.type === 'bland-altman' ? agreementCoordinates(row) : isCoordinate(row) ? {x: row.x, y: row.y} : undefined;
      return coordinates ? [{row, ...coordinates}] : [];
    });
    const fitKind = chart.type === 'regression' ? 'linear' : 'dose';
    const fitMatches = chart.type === 'regression' ? availableResult?.method.includes('linear') : chart.type === 'dose-response' ? availableResult?.method.includes('dose') : false;
    const fitSeries = fitMatches ? availableResult?.series?.filter(series => series.kind === 'fit') ?? [] : [];
    const bounds = fitSeries.flatMap(series => series.points.filter(isCoordinate));
    const agreement = chart.type === 'bland-altman' ? agreementSummary(cleanRows) : undefined;
    const fromEstimate = (key: string, fallback?: number) => typeof availableResult?.estimates[key] === 'number' ? availableResult.estimates[key] as number : fallback;
    const bias = fromEstimate('bias', agreement?.bias), lowerAgreement = fromEstimate('lowerAgreement', agreement?.lower), upperAgreement = fromEstimate('upperAgreement', agreement?.upper);
    const pThreshold = Math.min(1, Math.max(Number.MIN_VALUE, options.pThreshold ?? .05));
    const foldThreshold = Math.max(0, options.foldChangeThreshold ?? 1);
    const xValues = [...transformed.map(p => p.x), ...bounds.map(p => p.x)];
    const yValues = [...transformed.map(p => p.y), ...bounds.flatMap(p => [p.y, p.lower, p.upper].filter((value): value is number => typeof value === 'number' && Number.isFinite(value)))];
    if (chart.type === 'bland-altman') yValues.push(...[bias, lowerAgreement, upperAgreement].filter((v): v is number => v !== undefined));
    if (chart.type === 'volcano') {xValues.push(-foldThreshold, foldThreshold); yValues.push(0, -Math.log10(pThreshold));}
    const logX = options.xScale === 'log', logY = style.yScale === 'log' && chart.type !== 'volcano';
    const xDomain = limits(xValues, 'x'), yDomain = limits(yValues, 'y', chart.type === 'volcano');
    if (chart.type === 'volcano' && style.yMin === null) yDomain[0] = 0;
    const x = numericScale(xDomain, [left, right], logX), y = numericScale(yDomain, [bottom, top], logY);
    const visible = transformed.filter(p => (!logX || p.x > 0) && (!logY || p.y > 0));
    xTicks = x.ticks(6).map(value => ({value: x(value), label: formatNumber(value)}));
    yTicks = y.ticks(6).map(value => ({value: y(value), label: formatNumber(value)}));
    if (chart.type === 'volcano') {horizontalLabel ||= 'log₂ fold change'; verticalLabel ||= '−log₁₀(p)'; legend = [{name: 'Below threshold', color: color(0)}, {name: 'Lower', color: color(1)}, {name: 'Higher', color: color(2)}];}
    if (chart.type === 'bland-altman') {horizontalLabel ||= 'Mean of methods (X + Y) / 2'; verticalLabel ||= 'Difference Y − X';}
    if (chart.type === 'dose-response') {horizontalLabel ||= 'Concentration'; verticalLabel ||= 'Response';}
    if (chart.type === 'regression') {horizontalLabel ||= 'X'; verticalLabel ||= 'Y';}
    content = <>
      {fitSeries.map((series, index) => {const points = series.points.filter(p => isCoordinate(p) && (!logX || p.x > 0) && (!logY || p.y > 0)).sort((a, b) => a.x-b.x); return <g key={`${series.name}-${index}`} data-series-name={series.name}>
        {fitBand(points, x, y, color(index))}
        <path d={line<AdvancedSeriesPoint>().x(p => x(p.x)).y(p => y(p.y))(points) ?? ''} stroke={color(index)} strokeWidth={style.lineWidth+ .6} fill="none"/>
      </g>;})}
      {chart.type === 'bland-altman' && [{value: bias, label: 'Bias', dash: ''}, {value: lowerAgreement, label: '−1.96 SD', dash: '5 4'}, {value: upperAgreement, label: '+1.96 SD', dash: '5 4'}].map(({value, label, dash}) => value !== undefined && Number.isFinite(y(value)) ? <g key={label}><line x1={left} x2={right} y1={y(value)} y2={y(value)} stroke={style.axisColor} strokeWidth={style.lineWidth} strokeDasharray={dash} strokeOpacity={.6}/><text x={right-4} y={y(value)-5} textAnchor="end" fill={style.axisColor} fontSize={Math.max(9, style.fontSize-3)}>{`${label}: ${formatNumber(value)}`}</text></g> : null)}
      {chart.type === 'volcano' && <g stroke={style.axisColor} strokeOpacity={.45} strokeDasharray="4 4" strokeWidth={1} fill="none"><path d={`M${left},${y(-Math.log10(pThreshold))}H${right}`}/>{[-foldThreshold, foldThreshold].map(value => <path key={value} d={`M${x(value)},${top}V${bottom}`}/>)}</g>}
      {visible.map(({row, x: px, y: py}) => {
        const index = chart.type === 'volcano' ? ((row.p ?? row.y) < pThreshold && Math.abs(row.x!) >= foldThreshold ? row.x! < 0 ? 1 : 2 : 0) : seriesIndex(row);
        return point(row, x(px), y(py), index);
      })}
    </>;
    if (transformed.length !== cleanRows.length) notes.push(chart.type === 'volcano' ? 'Volcano points require X=log₂ fold change and 0 < Y=p ≤ 1. Zero p-values need a documented lower bound.' : 'Assign finite X and Y values to display paired coordinates.');
    if (visible.length !== transformed.length) notes.push('Values at or below zero are omitted from logarithmic axes.');
    if (['regression', 'dose-response'].includes(chart.type) && !fitSeries.length) notes.push(`Run ${fitKind === 'linear' ? 'linear regression' : 'dose–response 4PL'} in Advanced analysis to add the fitted curve and confidence band.`);
    if (chart.type === 'bland-altman' && !availableResult) notes.push('Descriptive agreement lines use bias ± 1.96 sample SD; run Bland–Altman analysis for interval estimates and assumptions.');
  }
  if (!rows.length) notes.push('Open Advanced data to enter or import the columns needed for this chart.');
  if (analysisStale && result) notes.push('The recorded analysis is out of date. Run it again to display fitted results.');
  const textStyle = {fill: style.axisColor, fontSize: style.fontSize};
  const axisStyle = {fill: 'none', stroke: style.axisColor, strokeWidth: 1.2};
  return <svg id={svgId} xmlns="http://www.w3.org/2000/svg" width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="group" aria-roledescription="interactive scientific chart" aria-label={chart.title || 'Scientific chart'} style={{display: 'block', maxWidth: '100%', height: 'auto', fontFamily: style.fontFamily, background: style.background}} onClick={() => onSelect({kind: 'chart'})} onContextMenu={event=>contextMenu(event,{kind:'chart'})}>
    <rect width={width} height={height} fill={style.background}/>
    <defs><clipPath id={`advanced-clip-${chart.id}`} clipPathUnits="userSpaceOnUse"><rect x={left-1} y={top-1} width={plotWidth+2} height={plotHeight+2}/></clipPath></defs>
    <text data-edit="title" x={width/2} y={39} textAnchor="middle" fill={style.axisColor} fontSize={style.titleSize} fontWeight={600} style={{cursor: 'pointer'}} onClick={event => selectText(event, 'title')} onContextMenu={event=>contextMenu(event,{kind:'title'})}><ScientificText text={chart.title}/></text>
    {style.legend && <g transform={`translate(${left},66)`}>{legend.map((item, index) => {const spacing = plotWidth/Math.max(1, legend.length); return <g key={`${item.name}-${index}`} transform={`translate(${index*spacing},0)`}><circle cx={4} cy={-4} r={3.7} fill={item.color}/><text x={15} fill={style.axisColor} fontSize={Math.max(10,style.fontSize-2)}>{item.name.length > 22 ? `${item.name.slice(0,20)}…` : item.name}</text></g>;})}</g>}
    {style.grid && yTicks.map((tick, index) => <line key={index} x1={left} x2={right} y1={tick.value} y2={tick.value} stroke={style.axisColor} strokeOpacity={.09} strokeWidth={.8}/>)}
    <g clipPath={`url(#advanced-clip-${chart.id})`}>{content}</g>
    <path d={`M${left},${top}V${bottom}H${right}`} {...axisStyle}/>
    {yTicks.map((tick, index) => <g key={index}><line x1={left-5} x2={left} y1={tick.value} y2={tick.value} {...axisStyle}/><text x={left-11} y={tick.value+style.fontSize*.34} textAnchor="end" {...textStyle}>{tick.label}</text></g>)}
    {xTicks.map((tick, index) => <g key={index}><line x1={tick.value} x2={tick.value} y1={bottom} y2={bottom+5} {...axisStyle}/><text x={tick.value} y={bottom+24} textAnchor="middle" {...textStyle}>{tick.label}</text></g>)}
    <text data-edit="xaxis" x={(left+right)/2} y={height-24} textAnchor="middle" {...textStyle} fontSize={style.fontSize+1} style={{cursor: 'pointer'}} onClick={event => selectText(event, 'xaxis')} onContextMenu={event=>contextMenu(event,{kind:'xaxis'})}><ScientificText text={horizontalLabel}/></text>
    <text data-edit="yaxis" transform={`translate(25,${(top+bottom)/2}) rotate(-90)`} textAnchor="middle" {...textStyle} fontSize={style.fontSize+1} style={{cursor: 'pointer'}} onClick={event => selectText(event, 'yaxis')} onContextMenu={event=>contextMenu(event,{kind:'yaxis'})}><ScientificText text={verticalLabel}/></text>
    {notes.length > 0 && <text data-editor-only="true" x={left} y={height-5} fontSize={9} fill="#9a6b2b">{notes.join(' ')}</text>}
  </svg>;
}
