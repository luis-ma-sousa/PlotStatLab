import {version as applicationVersion} from '../package.json';
import type { Chart } from './types';
import { exportDownload } from './project';

const SVG_NS = 'http://www.w3.org/2000/svg';
const XMLNS_NS = 'http://www.w3.org/2000/xmlns/';
const XML_NS = 'http://www.w3.org/XML/1998/namespace';
const inheritedDefaults: Record<string, string> = {
  fill: '#000000', stroke: 'none', 'fill-opacity': '1', 'stroke-opacity': '1',
  'fill-rule': 'nonzero', 'stroke-width': '1', 'stroke-linecap': 'butt',
  'stroke-linejoin': 'miter', 'stroke-miterlimit': '4', 'stroke-dasharray': 'none',
  'stroke-dashoffset': '0', 'font-family': 'Arial', 'font-size': '15',
  'font-weight': '400', 'font-style': 'normal', 'text-anchor': 'start',
  'letter-spacing': 'normal', 'word-spacing': 'normal', visibility: 'visible', color: '#000000',
};
const textProperties = new Set(['font-family', 'font-size', 'font-weight', 'font-style', 'text-anchor', 'letter-spacing', 'word-spacing']);
const directPresentation = ['opacity', 'clip-path', 'clip-rule', 'display', 'dominant-baseline', 'baseline-shift', 'vector-effect'];
const graphics = new Set(['path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'text', 'tspan']);
const containers = new Set(['svg', 'g']);

function inheritedValue(element: SVGElement, property: string, fallback: string): string {
  let current: Element | null = element;
  while (current) {
    const inline = (current as SVGElement).style?.getPropertyValue(property)?.trim();
    const attribute = current.getAttribute(property)?.trim();
    const value = inline || attribute;
    if (value && value !== 'inherit' && value !== 'unset') return value === 'initial' ? fallback : value;
    current = current.parentElement;
  }
  return fallback;
}

function presentationColor(value: string): string {
  // CSSOM can canonicalize a hex input to rgb(); use portable SVG 1.1 hex when opaque.
  const rgb = /^rgb\(\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*\)$/i.exec(value);
  return rgb ? '#' + rgb.slice(1).map(channel => Math.max(0, Math.min(255, Math.round(Number(channel)))).toString(16).padStart(2, '0')).join('') : value;
}

function uniqueId(base: string, used: Set<string>): string {
  // IDs remain stable and meaningful in Illustrator's object hierarchy.
  const safe = `PSL-${base}`.replace(/[^A-Za-z0-9_.-]/g, '-');
  let candidate = safe, suffix = 2;
  while (used.has(candidate)) candidate = `${safe}-${suffix++}`;
  used.add(candidate);
  return candidate;
}

function identifyLayer(element: Element): string {
  const edit = element.getAttribute('data-edit');
  if (edit === 'title') return 'title';
  if (edit === 'xaxis' || edit === 'yaxis') return 'axis-labels';
  if (element.hasAttribute('data-annotation-id')) return 'statistics';
  if (element.hasAttribute('clip-path') || element.hasAttribute('data-point-id') || element.hasAttribute('data-group-id') || element.querySelector('[data-point-id]')) return 'data';
  if (element.localName === 'rect') return 'background';
  if (element.localName === 'line') return 'grid';
  if (element.localName === 'g' && element.hasAttribute('transform')) return 'legend';
  if (element.localName === 'text') return 'labels';
  return 'axes';
}

/** Produce self-contained SVG 1.1: live text and separate vector objects, never a flattened bitmap. */
export function serializeFigureSvg(chart: Chart, source?: SVGSVGElement): string {
  const original = source ?? document.querySelector<SVGSVGElement>('#chart-svg');
  if (!original) throw new Error('Could not find the chart to export.');
  const svg = original.cloneNode(true) as SVGSVGElement;
  svg.querySelectorAll('[data-editor-only], .editor-only').forEach(el => el.remove());
  if (svg.querySelector('image, foreignObject, use, script, iframe')) {
    throw new Error('Editable export requires vectors and text; this chart contains an unsupported element.');
  }
  // Apply the font chosen in the editor before resolving inherited attributes.
  svg.style.setProperty('font-family', chart.style.fontFamily);
  svg.style.removeProperty('font-size');
  svg.setAttribute('font-size', String(chart.style.fontSize));
  const elements = [svg, ...svg.querySelectorAll<SVGElement>('*')];
  const used = new Set<string>(elements.map(el => el.id).filter(Boolean));
  const rootChildren = [...svg.children];
  const layers = new Map<Element, string>();
  rootChildren.forEach(child => {if (!['defs', 'title', 'desc', 'metadata', 'style'].includes(child.localName)) layers.set(child, identifyLayer(child));});

  // Snapshot first; removing parent styles before children would lose inheritance.
  const presentations = new Map<SVGElement, Record<string, string>>();
  for (const element of elements) {
    const tag = element.localName;
    const attrs: Record<string, string> = {};
    if (graphics.has(tag) || containers.has(tag)) {
      for (const [property, defaultValue] of Object.entries(inheritedDefaults)) {
        if (textProperties.has(property) && !['text', 'tspan', 'svg', 'g'].includes(tag)) continue;
        let value = inheritedValue(element, property, defaultValue);
        if (value.toLowerCase() === 'currentcolor') value = inheritedValue(element, 'color', '#000000');
        attrs[property] = ['fill', 'stroke', 'color'].includes(property) ? presentationColor(value) : value;
      }
      for (const property of directPresentation) {
        const value = element.style.getPropertyValue(property)?.trim();
        if (value) attrs[property] = value;
      }
    }
    presentations.set(element, attrs);
  }
  let series = 0;
  for (const element of elements) {
    const point = element.getAttribute('data-point-id');
    const annotation = element.getAttribute('data-annotation-id');
    const group = element.getAttribute('data-group-id');
    const edit = element.getAttribute('data-edit');
    if (point) element.id = uniqueId(`point-${point}`, used);
    else if (annotation) element.id = uniqueId(`comparison-${annotation}`, used);
    else if (group) element.id = uniqueId(`series-${group}-${element.localName}`, used);
    else if (edit) element.id = uniqueId(`label-${edit}`, used);
    else if (element.localName === 'g' && element.parentElement?.hasAttribute('clip-path')) element.id = uniqueId(`series-${++series}`, used);
    for (const attribute of [...element.attributes]) {
      const name = attribute.name.toLowerCase();
      if (name === 'style' || name === 'class' || name === 'tabindex' || name === 'role' || name === 'focusable' || name === 'pointer-events' || name.startsWith('aria-') || name.startsWith('data-') || name.startsWith('on') || name === 'xmlns' || name.startsWith('xmlns:')) element.removeAttributeNode(attribute);
      if (['href', 'xlink:href'].includes(name) && !attribute.value.startsWith('#')) throw new Error('The figure contains an external reference incompatible with standalone SVG.');
      for (const match of attribute.value.matchAll(/url\(\s*(['"]?)(.*?)\1\s*\)/gi)) {if (!match[2].trim().startsWith('#')) throw new Error('The figure contains an external reference incompatible with standalone SVG.');}
    }
    for (const [property, value] of Object.entries(presentations.get(element) ?? {})) element.setAttribute(property, value);
    if (element.localName === 'clipPath') element.setAttribute('clipPathUnits', 'userSpaceOnUse');
  }
  // Old tooltips describe editor actions; export a concise document description instead.
  svg.querySelectorAll('style, title, desc, metadata').forEach(el => el.remove());
  const doc = svg.ownerDocument;
  const title = doc.createElementNS(SVG_NS, 'title'); title.textContent = chart.title || chart.name;
  const desc = doc.createElementNS(SVG_NS, 'desc');
  desc.textContent = `PlotStatLab (PSL) ${applicationVersion}. Editable vector figure: text remains text; observations, series, axes and comparisons are separate objects.`;
  const metadata = doc.createElementNS(SVG_NS, 'metadata');
  metadata.textContent = JSON.stringify({creator: 'PlotStatLab', abbreviation: 'PSL', version: applicationVersion, chartType: chart.type, text: 'editable', format: 'SVG 1.1'});
  svg.insertBefore(metadata, svg.firstChild); svg.insertBefore(desc, svg.firstChild); svg.insertBefore(title, svg.firstChild);

  // Group only contiguous peers: paint order and all existing transforms remain exact.
  let activeLayer: string | undefined, wrapper: SVGGElement | undefined;
  for (const child of rootChildren) {
    if (!child.parentNode) continue;
    const layer = layers.get(child);
    if (!layer) {activeLayer = undefined; wrapper = undefined; continue;}
    if (activeLayer !== layer || !wrapper) {
      wrapper = doc.createElementNS(SVG_NS, 'g'); wrapper.id = uniqueId(layer, used);
      svg.insertBefore(wrapper, child); activeLayer = layer;
    }
    wrapper.appendChild(child);
  }
  svg.id = 'PSL-figure';
  svg.setAttributeNS(XMLNS_NS, 'xmlns', SVG_NS);
  svg.setAttributeNS(XML_NS, 'xml:space', 'preserve');
  svg.setAttribute('version', '1.1');
  svg.setAttribute('width', String(chart.style.width)); svg.setAttribute('height', String(chart.style.height));
  svg.setAttribute('viewBox', `0 0 ${chart.style.width} ${chart.style.height}`);
  return `<?xml version="1.0" encoding="UTF-8"?>\n${new XMLSerializer().serializeToString(svg)}`;
}

export async function exportFigure(format: 'svg' | 'png', chart: Chart, scale = 2): Promise<void> {
  if (!Number.isFinite(scale) || scale <= 0 || scale > 8) throw new Error('Export scale must be between 0 and 8.');
  const filename = (chart.name || chart.title || 'figure').replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-');
  if (document.fonts) await document.fonts.ready;
  const serialized = serializeFigureSvg(chart);
  if (format === 'svg') {exportDownload(`${filename}.svg`, serialized, 'image/svg+xml;charset=utf-8'); return;}
  const width = Math.round(chart.style.width * scale), height = Math.round(chart.style.height * scale);
  if (width * height > 80_000_000) throw new Error('The image is too large. Reduce its dimensions or export scale.');
  const blob = new Blob([serialized], {type: 'image/svg+xml;charset=utf-8'}), url = URL.createObjectURL(blob);
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {image.onload = () => resolve(); image.onerror = () => reject(new Error('Could not render the chart as PNG.')); image.src = url;});
    const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
    const context = canvas.getContext('2d'); if (!context) throw new Error('This browser does not support PNG export.'); context.drawImage(image, 0, 0, width, height);
    const png = await new Promise<Blob>((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('PNG export failed.')), 'image/png'));
    exportDownload(`${filename}.png`, png, 'image/png');
  } finally {URL.revokeObjectURL(url);}
}
