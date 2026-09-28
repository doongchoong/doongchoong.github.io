/* mini-chart 1.0.0 — dependency-free SVG charts for article HTML. */
(() => {
  'use strict';
  if (window.MiniChart) return;

  const NS = 'http://www.w3.org/2000/svg';
  const BASE = ['#2563EB', '#0EA5E9', '#6366F1'];
  const ACCENT = ['#E5484D', '#F59E0B'];
  const CURVES = ['linear', 'ease-in', 'ease-out', 'ease-in-out'];
  const instances = new WeakMap();
  let sequence = 0;

  const CSS = `
    .mini-chart{--mc-text:#444;--mc-muted:#777;--mc-grid:#e8e8e8;--mc-paper:#fff;
      display:block;width:100%;max-width:1100px;margin:28px auto;color:var(--mc-text);
      font-family:inherit;line-height:1.5;box-sizing:border-box}
    .mini-chart *{box-sizing:border-box}
    .mini-chart .mc-title{font:700 22px/1.4 inherit;font-size:22px;font-weight:700;margin:0 0 4px;color:var(--mc-text)}
    .mini-chart .mc-description,.mini-chart .mc-caption{font-size:13px;color:var(--mc-muted);margin:0 0 12px}
    .mini-chart .mc-caption{margin:8px 0}
    .mini-chart .mc-legend{display:flex;flex-wrap:wrap;gap:8px 20px;padding:0;margin:14px 0 8px;list-style:none;font-size:13px}
    .mini-chart .mc-legend li{display:flex;align-items:center;gap:8px;margin:0;padding:0}
    .mini-chart .mc-swatch{width:30px;height:12px;overflow:visible;flex:none}
    .mini-chart .mc-plot{display:block;width:100%;height:auto;overflow:visible;font-family:inherit}
    .mini-chart .mc-tick{fill:var(--mc-muted);font-size:12px}
    .mini-chart .mc-grid{stroke:var(--mc-grid);stroke-width:1}
    .mini-chart .mc-annotation-text{font-size:12px;font-weight:600;paint-order:stroke;stroke:var(--mc-paper);stroke-width:3;stroke-linejoin:round}
    .mini-chart .mc-table{font-size:12px;color:var(--mc-muted);margin-top:10px}
    .mini-chart .mc-table summary{cursor:pointer;width:fit-content}
    .mini-chart .mc-table-scroll{overflow-x:auto;max-height:360px}
    .mini-chart table{border-collapse:collapse;width:100%;font-size:12px;color:var(--mc-text)}
    .mini-chart th,.mini-chart td{padding:6px 10px;border-bottom:1px solid var(--mc-grid);text-align:right;white-space:nowrap}
    .mini-chart th:first-child{text-align:left}
    .mini-chart .mc-error{padding:12px;border:1px solid #E5484D;border-radius:6px;color:var(--mc-text);font-size:14px}
    @media(prefers-color-scheme:dark){.mini-chart{--mc-text:#e5e7eb;--mc-muted:#a3aab5;--mc-grid:#343b45;--mc-paper:#171b22}}
    [data-theme="light"] .mini-chart,.mini-chart[data-theme="light"]{--mc-text:#444;--mc-muted:#777;--mc-grid:#e8e8e8;--mc-paper:#fff}
    [data-theme="dark"] .mini-chart,.mini-chart[data-theme="dark"]{--mc-text:#e5e7eb;--mc-muted:#a3aab5;--mc-grid:#343b45;--mc-paper:#171b22}
  `;

  function installStyle() {
    if (document.getElementById('mini-chart-style')) return;
    const style = document.createElement('style');
    style.id = 'mini-chart-style';
    style.textContent = CSS;
    document.head.append(style);
  }
  function html(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }
  function svg(tag, attrs = {}, text) {
    const node = document.createElementNS(NS, tag);
    Object.entries(attrs).forEach(([key, value]) => {
      if (value !== undefined) node.setAttribute(key, String(value));
    });
    if (text !== undefined) node.textContent = text;
    return node;
  }
  function check(condition, message) {
    if (!condition) throw new Error(message);
  }
  function object(value, name) {
    check(value !== null && typeof value === 'object' && !Array.isArray(value), `${name}: 객체가 필요합니다.`);
  }
  function keys(value, allowed, name) {
    object(value, name);
    Object.keys(value).forEach(key => check(allowed.includes(key), `${name}.${key}: 지원하지 않는 옵션입니다.`));
  }
  function string(value, name) {
    check(typeof value === 'string' && value.trim().length > 0, `${name}: 비어 있지 않은 문자열이 필요합니다.`);
  }
  function finite(value, name) {
    check(typeof value === 'number' && Number.isFinite(value), `${name}: 유한한 숫자가 필요합니다.`);
  }
  function choice(value, allowed, name) {
    check(allowed.includes(value), `${name}: ${allowed.join(', ')} 중 하나여야 합니다.`);
  }
  function color(value, name) {
    string(value, name);
    check(!/url\s*\(|var\s*\(/i.test(value) && CSSSupportsColor(value), `${name}: 유효한 CSS 색상을 입력하세요.`);
    return value;
  }
  function CSSSupportsColor(value) {
    return window.CSS && window.CSS.supports('color', value);
  }

  function normalize(input) {
    keys(input, ['type', 'title', 'description', 'caption', 'labels', 'series', 'unit', 'curve', 'fill', 'y', 'height', 'annotations'], 'chart');
    const c = { type: 'line', unit: '', curve: 'linear', fill: 'none', height: 360, annotations: [], ...input };
    choice(c.type, ['line', 'bar'], 'type');
    ['title', 'description', 'caption'].forEach(key => { if (c[key] !== undefined) string(c[key], key); });
    check(typeof c.unit === 'string', 'unit: 문자열이 필요합니다.');
    choice(c.curve, CURVES, 'curve');
    choice(c.fill, ['none', 'gradient'], 'fill');
    finite(c.height, 'height');
    check(c.height >= 240 && c.height <= 1200, 'height: 240~1200 범위여야 합니다.');
    if (c.type === 'bar') check(c.curve === 'linear' && c.fill === 'none', '막대차트에는 curve와 fill을 지정하지 않습니다.');
    check(Array.isArray(c.labels) && c.labels.length > 0, 'labels: 하나 이상의 항목이 필요합니다.');
    c.labels.forEach((label, i) => string(label, `labels[${i}]`));
    check(new Set(c.labels).size === c.labels.length, 'labels: 중복된 이름을 사용할 수 없습니다.');
    check(Array.isArray(c.series) && c.series.length > 0, 'series: 하나 이상의 계열이 필요합니다.');
    let baseIndex = 0;
    let accentIndex = 0;
    c.series = c.series.map((source, index) => {
      const name = `series[${index}]`;
      keys(source, ['name', 'values', 'style', 'color', 'curve', 'fill'], name);
      string(source.name, `${name}.name`);
      const s = { style: 'solid', curve: c.curve, fill: c.fill, ...source };
      choice(s.style, ['solid', 'dashed'], `${name}.style`);
      choice(s.curve, CURVES, `${name}.curve`);
      choice(s.fill, ['none', 'gradient'], `${name}.fill`);
      if (c.type === 'bar') check(s.style === 'solid' && s.curve === 'linear' && s.fill === 'none', `${name}: 막대에는 점선·곡선·영역 채움을 지정하지 않습니다.`);
      s.color = s.color !== undefined ? color(s.color, `${name}.color`)
        : s.style === 'dashed' ? ACCENT[accentIndex++ % ACCENT.length] : BASE[baseIndex++ % BASE.length];
      check(Array.isArray(s.values) && s.values.length === c.labels.length, `${name}.values: labels와 개수가 같아야 합니다.`);
      s.points = s.values.map((value, i) => {
        if (value === null) return null;
        let point = { value, color: s.color };
        if (typeof value === 'object') {
          check(c.type === 'bar', `${name}.values[${i}]: 객체형 값은 막대차트에서만 사용합니다.`);
          keys(value, ['value', 'color'], `${name}.values[${i}]`);
          point = { ...point, ...value };
          if (value.color !== undefined) color(value.color, `${name}.values[${i}].color`);
        }
        finite(point.value, `${name}.values[${i}]`);
        return point;
      });
      return s;
    });
    check(new Set(c.series.map(s => s.name)).size === c.series.length, 'series: 계열 이름은 서로 달라야 합니다.');
    c.y = { ...(input.y || {}) };
    if (input.y !== undefined) keys(input.y, ['min', 'max', 'step'], 'y');
    ['min', 'max', 'step'].forEach(key => { if (c.y[key] !== undefined) finite(c.y[key], `y.${key}`); });
    if (c.y.step !== undefined) check(c.y.step > 0, 'y.step: 0보다 커야 합니다.');
    if (c.y.min !== undefined && c.y.max !== undefined) check(c.y.min < c.y.max, 'y.min은 y.max보다 작아야 합니다.');
    check(Array.isArray(c.annotations), 'annotations: 배열이 필요합니다.');
    c.annotations = c.annotations.map((source, index) => {
      const name = `annotations[${index}]`;
      object(source, name);
      choice(source.type, ['x-line', 'y-line', 'point', 'x-range'], `${name}.type`);
      const fields = { 'x-line': ['x', 'placement'], 'y-line': ['y'], point: ['x', 'y', 'series'], 'x-range': ['from', 'to', 'opacity'] };
      keys(source, ['type', 'label', 'color', 'position', ...fields[source.type]], name);
      const a = { position: 'above', ...source };
      if (a.label !== undefined) string(a.label, `${name}.label`);
      if (a.color !== undefined) color(a.color, `${name}.color`);
      choice(a.position, ['above', 'below', 'left', 'right'], `${name}.position`);
      ['x', 'from', 'to'].filter(key => fields[a.type].includes(key)).forEach(key => {
        check(c.labels.includes(a[key]), `${name}.${key}: labels에 있는 이름이 필요합니다.`);
      });
      if (a.type === 'x-line') {
        a.placement = a.placement || 'at';
        choice(a.placement, ['at', 'before', 'after'], `${name}.placement`);
        check(c.type === 'bar' || a.placement === 'at', `${name}: before/after는 막대차트에서만 사용합니다.`);
      }
      if (a.type === 'y-line') finite(a.y, `${name}.y`);
      if (a.type === 'point') {
        string(a.label, `${name}.label`);
        check((a.series !== undefined) !== (a.y !== undefined), `${name}: series 또는 y 중 하나만 지정하세요.`);
        if (a.series !== undefined) {
          a.seriesIndex = c.series.findIndex(s => s.name === a.series);
          check(a.seriesIndex >= 0, `${name}.series: 존재하지 않는 계열입니다.`);
          const point = c.series[a.seriesIndex].points[c.labels.indexOf(a.x)];
          check(point !== null, `${name}: null인 지점에는 주석을 연결할 수 없습니다.`);
          a.y = point.value;
          a.color = a.color || c.series[a.seriesIndex].color;
        } else finite(a.y, `${name}.y`);
      }
      if (a.type === 'x-range') {
        check(c.labels.indexOf(a.from) <= c.labels.indexOf(a.to), `${name}: from이 to보다 뒤에 있습니다.`);
        a.opacity = a.opacity === undefined ? 0.07 : a.opacity;
        finite(a.opacity, `${name}.opacity`);
        check(a.opacity >= 0 && a.opacity <= 1, `${name}.opacity: 0~1 범위여야 합니다.`);
      }
      return a;
    });
    return c;
  }

  function niceStep(span) {
    const target = span / 4;
    const power = 10 ** Math.floor(Math.log10(target));
    const fraction = target / power;
    return (fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 2.5 ? 2.5 : fraction <= 5 ? 5 : 10) * power;
  }
  function scale(c) {
    let low = 0;
    let high = 0;
    for (const s of c.series) for (const point of s.points) if (point !== null) {
      low = Math.min(low, point.value);
      high = Math.max(high, point.value);
    }
    c.annotations.forEach(a => { if (a.y !== undefined) { low = Math.min(low, a.y); high = Math.max(high, a.y); } });
    if (low === high) high = low + 1;
    let min = c.y.min === undefined ? low : c.y.min;
    let max = c.y.max === undefined ? high : c.y.max;
    if (max <= min) {
      if (c.y.max === undefined) max = min + Math.max(1, Math.abs(min) * 0.1);
      else if (c.y.min === undefined) min = max - Math.max(1, Math.abs(max) * 0.1);
    }
    check(Number.isFinite(max - min) && max > min, 'Y축 범위를 계산할 수 없습니다. y.min/max를 확인하세요.');
    const step = c.y.step || niceStep(max - min);
    check(Number.isFinite(step) && step > 0, 'Y축 눈금 간격을 계산할 수 없습니다.');
    if (c.y.min === undefined) min = Math.floor(min / step) * step;
    if (c.y.max === undefined) max = Math.ceil(max / step) * step;
    check(Number.isFinite(min) && Number.isFinite(max) && Number.isFinite(max - min), 'Y축 범위가 너무 큽니다.');
    check((max - min) / step <= 100, 'Y축 눈금이 100개를 넘습니다. y.step을 늘려주세요.');
    const ticks = [min];
    for (let i = 1; i <= 100; i++) {
      const value = min + i * step;
      if (value >= max - step * 1e-8) break;
      ticks.push(value);
    }
    ticks.push(max);
    return { min, max, ticks };
  }
  function format(value) {
    if (value !== 0 && (Math.abs(value) < 0.0001 || Math.abs(value) >= 1e9)) return Number(value.toPrecision(4)).toString();
    return Number(value.toPrecision(12)).toLocaleString('ko-KR', { maximumFractionDigits: 8 });
  }
  function segments(points) {
    const result = [];
    let current = [];
    points.forEach(point => {
      if (point === null) { if (current.length) result.push(current); current = []; }
      else current.push(point);
    });
    if (current.length) result.push(current);
    return result;
  }
  function linePath(points, curve) {
    let path = `M ${points[0].x} ${points[0].y}`;
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1];
      const b = points[i];
      if (curve === 'linear') path += ` L ${b.x} ${b.y}`;
      else {
        const dx = (b.x - a.x) / 3;
        const y1 = curve === 'ease-out' ? b.y : a.y;
        const y2 = curve === 'ease-in' ? a.y : b.y;
        path += ` C ${a.x + dx} ${y1}, ${b.x - dx} ${y2}, ${b.x} ${b.y}`;
      }
    }
    return path;
  }

  function drawPlot(c, width, id, range) {
    const height = c.height;
    const longestTick = Math.max(...range.ticks.map(v => (format(v) + c.unit).length));
    const left = Math.min(width * 0.36, Math.max(48, longestTick * 7 + 16));
    const right = 24;
    const top = 38;
    const bottom = height - 44;
    const plotWidth = width - left - right;
    const plotHeight = bottom - top;
    const slot = plotWidth / c.labels.length;
    const x = index => c.type === 'bar' ? left + (index + 0.5) * slot
      : c.labels.length === 1 ? left + plotWidth / 2 : left + index * plotWidth / (c.labels.length - 1);
    const y = value => bottom - ((value - range.min) / (range.max - range.min)) * plotHeight;
    const baseline = y(Math.max(range.min, Math.min(range.max, 0)));
    const barWidth = slot * 0.72 / c.series.length;
    const barX = (index, seriesIndex) => x(index) - slot * 0.36 + (seriesIndex + 0.5) * barWidth;
    const root = svg('svg', { class: 'mc-plot', viewBox: `0 0 ${width} ${height}`, role: 'img', 'aria-labelledby': `${id}-title ${id}-desc` });
    root.append(svg('title', { id: `${id}-title` }, c.title || (c.type === 'line' ? '라인차트' : '막대차트')));
    root.append(svg('desc', { id: `${id}-desc` }, `${c.description || ''} ${c.labels.length}개 항목, ${c.series.length}개 계열. 아래 데이터 표에서 정확한 값을 확인할 수 있습니다.`));
    const defs = svg('defs');
    const clip = svg('clipPath', { id: `${id}-clip` });
    clip.append(svg('rect', { x: left - 5, y: top - 5, width: plotWidth + 10, height: plotHeight + 10 }));
    defs.append(clip);
    root.append(defs);
    const backgrounds = svg('g', { class: 'mc-ranges' });
    const grid = svg('g');
    const fills = svg('g', { class: 'mc-fills', 'clip-path': `url(#${id}-clip)` });
    const guides = svg('g');
    const lines = svg('g', { class: 'mc-series', 'clip-path': `url(#${id}-clip)` });
    const notes = svg('g', { class: 'mc-annotations' });
    root.append(backgrounds, grid, fills, guides, lines, notes);

    range.ticks.forEach(value => {
      grid.append(svg('line', { class: 'mc-grid', x1: left, x2: width - right, y1: y(value), y2: y(value) }));
      grid.append(svg('text', { class: 'mc-tick', x: left - 10, y: y(value) + 4, 'text-anchor': 'end' }, format(value) + c.unit));
    });
    grid.append(svg('line', { class: 'mc-grid', x1: left, x2: width - right, y1: baseline, y2: baseline, 'stroke-width': 1.5 }));
    const longestLabel = Math.max(...c.labels.map(label => Array.from(label).length));
    const desired = Math.min(125, Math.max(55, longestLabel * 9));
    const maxLabels = Math.max(2, Math.floor(plotWidth / desired));
    const stride = Math.max(1, Math.ceil((c.labels.length - 1) / (maxLabels - 1)));
    c.labels.forEach((label, index) => {
      if (index !== c.labels.length - 1 && (index % stride !== 0 || (index > 0 && c.labels.length - 1 - index < stride * 0.6))) return;
      const chars = Array.from(label);
      const budget = Math.max(4, Math.floor(plotWidth / maxLabels / 9));
      const shown = chars.length > budget ? chars.slice(0, budget - 1).join('') + '…' : label;
      const anchor = index === 0 ? 'start' : index === c.labels.length - 1 ? 'end' : 'middle';
      const text = svg('text', { class: 'mc-tick', x: x(index), y: bottom + 26, 'text-anchor': c.labels.length === 1 ? 'middle' : anchor }, shown);
      text.append(svg('title', {}, label));
      grid.append(text);
    });

    c.series.forEach((s, seriesIndex) => {
      const group = svg('g', { 'data-series': s.name });
      lines.append(group);
      if (c.type === 'bar') {
        s.points.forEach((point, index) => {
          if (point === null) return;
          const rect = svg('rect', {
            class: 'mc-bar', x: barX(index, seriesIndex) - barWidth * 0.46,
            y: Math.min(y(point.value), baseline), width: barWidth * 0.92,
            height: Math.abs(y(point.value) - baseline), fill: point.color, rx: Math.min(2, barWidth / 4), 'data-index': index
          });
          rect.append(svg('title', {}, `${c.labels[index]} · ${s.name}: ${format(point.value)}${c.unit}`));
          group.append(rect);
        });
        return;
      }
      const runs = segments(s.points.map((point, index) => point === null ? null : { x: x(index), y: y(point.value) }));
      if (s.fill === 'gradient') {
        const gradientId = `${id}-gradient-${seriesIndex}`;
        const gradient = svg('linearGradient', { id: gradientId, x1: '0%', y1: '0%', x2: '0%', y2: '100%' });
        gradient.append(svg('stop', { offset: '0%', 'stop-color': s.color, 'stop-opacity': 0.2 }), svg('stop', { offset: '100%', 'stop-color': s.color, 'stop-opacity': 0 }));
        defs.append(gradient);
        runs.filter(run => run.length > 1).forEach(run => {
          fills.append(svg('path', { d: `${linePath(run, s.curve)} L ${run[run.length - 1].x} ${baseline} L ${run[0].x} ${baseline} Z`, fill: `url(#${gradientId})` }));
        });
      }
      runs.filter(run => run.length > 1).forEach(run => {
        group.append(svg('path', { class: 'mc-line', d: linePath(run, s.curve), fill: 'none', stroke: s.color, 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'stroke-dasharray': s.style === 'dashed' ? '9 7' : undefined }));
      });
      s.points.forEach((point, index) => {
        if (point === null) return;
        const circle = svg('circle', { class: 'mc-point', cx: x(index), cy: y(point.value), r: 4, fill: s.color, stroke: 'var(--mc-paper)', 'stroke-width': 2, 'data-index': index });
        circle.append(svg('title', {}, `${c.labels[index]} · ${s.name}: ${format(point.value)}${c.unit}`));
        group.append(circle);
      });
    });

    function label(a, px, py) {
      if (!a.label) return;
      let tx = px;
      let ty = py;
      let anchor = 'middle';
      if (a.position === 'above') ty -= 12;
      if (a.position === 'below') ty += 20;
      if (a.position === 'left') { tx -= 10; ty += 4; anchor = 'end'; }
      if (a.position === 'right') { tx += 10; ty += 4; anchor = 'start'; }
      const estimatedWidth = Math.min(plotWidth, Array.from(a.label).length * 12);
      let start = anchor === 'middle' ? tx - estimatedWidth / 2 : anchor === 'end' ? tx - estimatedWidth : tx;
      start = Math.max(left, Math.min(start, width - right - estimatedWidth));
      tx = start;
      const node = svg('text', { class: 'mc-annotation-text', x: tx, y: Math.max(14, Math.min(ty, bottom + 14)), 'text-anchor': 'start', fill: a.color || 'var(--mc-muted)' }, a.label);
      if (Array.from(a.label).length * 12 > plotWidth) {
        node.setAttribute('textLength', plotWidth);
        node.setAttribute('lengthAdjust', 'spacingAndGlyphs');
      }
      notes.append(node);
    }
    c.annotations.forEach(a => {
      const stroke = a.color || 'var(--mc-muted)';
      if (a.type === 'x-range') {
        const start = x(c.labels.indexOf(a.from)) - (c.type === 'bar' ? slot / 2 : 0);
        const end = x(c.labels.indexOf(a.to)) + (c.type === 'bar' ? slot / 2 : 0);
        backgrounds.append(svg('rect', { x: start, y: top, width: end - start, height: plotHeight, fill: a.color || BASE[0], opacity: a.opacity }));
        label(a, (start + end) / 2, top);
      } else if (a.type === 'x-line') {
        const px = x(c.labels.indexOf(a.x)) + (a.placement === 'after' ? slot / 2 : a.placement === 'before' ? -slot / 2 : 0);
        guides.append(svg('line', { x1: px, x2: px, y1: top, y2: bottom, stroke, 'stroke-width': 1.3, 'stroke-dasharray': '4 5' }));
        label(a, px, top);
      } else if (a.type === 'y-line') {
        check(a.y >= range.min && a.y <= range.max, 'y-line이 지정한 Y축 범위를 벗어났습니다.');
        guides.append(svg('line', { x1: left, x2: width - right, y1: y(a.y), y2: y(a.y), stroke, 'stroke-width': 1.3, 'stroke-dasharray': '4 5' }));
        label(a, left + plotWidth / 2, y(a.y));
      } else {
        check(a.y >= range.min && a.y <= range.max, 'point가 지정한 Y축 범위를 벗어났습니다.');
        const index = c.labels.indexOf(a.x);
        const px = c.type === 'bar' && a.seriesIndex !== undefined ? barX(index, a.seriesIndex) : x(index);
        notes.append(svg('circle', { cx: px, cy: y(a.y), r: 6, fill: 'none', stroke, 'stroke-width': 1.5 }));
        label(a, px, y(a.y));
      }
    });
    return root;
  }

  function dataTable(c) {
    const details = html('details', 'mc-table');
    details.append(html('summary', '', '데이터 표 보기'));
    const scroll = html('div', 'mc-table-scroll');
    const table = html('table');
    table.append(html('caption', '', c.title || '차트 데이터'));
    const head = html('thead');
    const row = html('tr');
    ['항목', ...c.series.map(s => s.name)].forEach(name => {
      const th = html('th', '', name); th.scope = 'col'; row.append(th);
    });
    head.append(row);
    const body = html('tbody');
    c.labels.forEach((label, index) => {
      const tr = html('tr');
      const th = html('th', '', label); th.scope = 'row'; tr.append(th);
      c.series.forEach(s => tr.append(html('td', '', s.points[index] === null ? '—' : format(s.points[index].value) + c.unit)));
      body.append(tr);
    });
    table.append(head, body); scroll.append(table); details.append(scroll);
    return details;
  }
  function output(host) {
    return Array.from(host.children).find(child => child.classList.contains('mc-output'));
  }
  function showError(host, error) {
    const old = instances.get(host);
    if (old && old.observer) old.observer.disconnect();
    instances.delete(host);
    const node = html('div', 'mc-output');
    const message = html('p', 'mc-error', `mini-chart: ${error.message}`);
    message.setAttribute('role', 'alert'); node.append(message);
    const current = output(host);
    if (current) current.replaceWith(node); else host.append(node);
    return { ok: false, error: error.message };
  }
  function render(host, input) {
    if (typeof host === 'string') host = document.querySelector(host);
    check(host instanceof Element, '차트를 넣을 HTML 요소가 필요합니다.');
    installStyle();
    host.classList.add('mini-chart');
    try {
      if (input === undefined) {
        const source = Array.from(host.children).find(child => child.matches('script[type="application/json"]'));
        check(source, '직접 자식으로 <script type="application/json"> 데이터가 필요합니다.');
        input = JSON.parse(source.textContent);
      }
      const c = normalize(input);
      const range = scale(c);
      const old = instances.get(host);
      if (old && old.observer) old.observer.disconnect();
      const id = `mini-chart-${++sequence}`;
      const node = html('div', 'mc-output');
      if (c.title) node.append(html('div', 'mc-title', c.title));
      if (c.description) node.append(html('p', 'mc-description', c.description));
      const legend = html('ul', 'mc-legend');
      legend.setAttribute('aria-label', '범례');
      c.series.forEach(s => {
        const li = html('li');
        const swatch = svg('svg', { class: 'mc-swatch', viewBox: '0 0 30 12', 'aria-hidden': 'true' });
        if (c.type === 'bar') swatch.append(svg('rect', { x: 3, y: 1, width: 24, height: 10, rx: 2, fill: s.color }));
        else swatch.append(svg('line', { x1: 0, x2: 30, y1: 6, y2: 6, stroke: s.color, 'stroke-width': 2, 'stroke-dasharray': s.style === 'dashed' ? '7 5' : undefined }));
        li.append(swatch, html('span', '', s.name)); legend.append(li);
      });
      node.append(legend);
      let lastWidth = Math.max(280, Math.round(host.getBoundingClientRect().width || 800));
      let plot = drawPlot(c, lastWidth, id, range);
      node.append(plot);
      if (c.caption) node.append(html('p', 'mc-caption', c.caption));
      node.append(dataTable(c));
      const current = output(host);
      if (current) current.replaceWith(node); else host.append(node);
      const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(entries => {
        const width = Math.max(280, Math.round(entries[0].contentRect.width));
        if (width === lastWidth) return;
        lastWidth = width;
        const next = drawPlot(c, width, id, range);
        plot.replaceWith(next); plot = next;
      }) : null;
      if (observer) observer.observe(host);
      instances.set(host, { observer });
      return { ok: true };
    } catch (error) {
      return showError(host, error);
    }
  }
  function scan(root = document) {
    const hosts = [...root.querySelectorAll('.mini-chart')];
    if (root instanceof Element && root.matches('.mini-chart')) hosts.unshift(root);
    return hosts.filter(host => !instances.has(host)).map(host => render(host));
  }
  function destroy(host) {
    if (typeof host === 'string') host = document.querySelector(host);
    const instance = instances.get(host);
    if (instance && instance.observer) instance.observer.disconnect();
    instances.delete(host);
    if (host) { const node = output(host); if (node) node.remove(); }
  }
  window.MiniChart = Object.freeze({ version: '1.0.0', render, scan, destroy,
    validate(input) {
      try { const c = normalize(input); const range = scale(c); drawPlot(c, 800, 'mini-chart-validation', range); return { ok: true }; }
      catch (error) { return { ok: false, error: error.message }; }
    }
  });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => scan(), { once: true });
  else scan();
})();
