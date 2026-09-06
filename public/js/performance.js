// ============================================================
// Performance das Redes Sociais — Dashboard Executivo
// Reaproveita esc()/showConfirm() já globais de app.js (mesmo escopo, sem
// módulos). O motor de diagnóstico (lib/socialDiagnostics.js) já devolve
// insights ESTRUTURADOS (diagnosticoItems, score) — aqui só decidimos como
// distribuir isso entre os blocos do dashboard, nunca a regra em si.
// ============================================================
const perfState = {
  mode: 'semana', // semana(=Visão Geral) | instagram | youtube | comparativo | mes
  weekStart: null,
  month: null,
  earliestWeekStart: null,
  initialized: false,
  editingPostId: null,
  lastPosts: [],
  lastTrends: []
};

const MONTHS_PT = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

function brDate(iso) {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}
function brDateShort(iso) {
  if (!iso) return '—';
  const [, m, d] = iso.split('-');
  return `${d}/${m}`;
}
function monthLabel(monthStr) {
  const [y, m] = monthStr.split('-').map(Number);
  return `${MONTHS_PT[m - 1]} de ${y}`;
}
function shiftWeek(weekStart, days) {
  const d = new Date(`${weekStart}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
function fmtNumP(n) {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  return Number(n).toLocaleString('pt-BR');
}
function fmtPctP(n) {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  const sign = n > 0 ? '+' : '';
  return `${sign}${n.toFixed(1)}%`;
}
function fmtMinutes(min) {
  if (!min) return '—';
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return h > 0 ? `${h}h${m}min` : `${m}min`;
}
function pctChangeClient(curr, prev) {
  if (curr === null || curr === undefined || prev === null || prev === undefined || prev === 0) return null;
  return ((curr - prev) / Math.abs(prev)) * 100;
}
function deltaClass(n) {
  if (n === null || n === undefined) return 'flat';
  return n > 0 ? 'up' : (n < 0 ? 'down' : 'flat');
}
function deltaArrow(n) {
  if (n === null || n === undefined) return '';
  return n > 0 ? '▲' : (n < 0 ? '▼' : '▬');
}
function median(arr) {
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}
function numOrNull(id) {
  const v = document.getElementById(id).value;
  return v === '' ? null : Number(v);
}
function setVal(id, v) {
  document.getElementById(id).value = (v === null || v === undefined) ? '' : v;
}

async function perfFetchJson(url, opts) {
  const res = await fetch(url, opts);
  if (res.status === 401) {
    location.href = '/login.html?next=' + encodeURIComponent('/index.html#performance');
    throw new Error('redirect');
  }
  if (!res.ok) {
    let msg = res.statusText;
    try { const j = await res.json(); if (j.error) msg = j.error; } catch (e) { /* ignore */ }
    throw new Error(msg);
  }
  return res.json();
}

// ============================================================
// Diagnóstico — vem estruturado do backend (item.tone já vem pronto,
// nada de adivinhar por palavra-chave aqui).
// ============================================================
function diagSummaryFromItems(items) {
  const warnCount = (items || []).filter(i => i.tone === 'warn').length;
  const goodCount = (items || []).filter(i => i.tone === 'good').length;
  if (warnCount > goodCount) return { text: `${warnCount} ponto${warnCount > 1 ? 's' : ''} de atenção`, cls: 'warn' };
  if (goodCount > warnCount) return { text: `${goodCount} destaque${goodCount > 1 ? 's' : ''} positivo${goodCount > 1 ? 's' : ''}`, cls: 'good' };
  return { text: 'Semana estável', cls: 'neutral' };
}
function diagItemCard(item) {
  return `<div class="diag-item diag-item-${item.tone}">
    <div class="diag-item-icon">${item.emoji}</div>
    <div class="diag-item-body">
      <div class="diag-item-label">${esc(item.label)}</div>
      <div class="diag-item-text">${esc(item.text)}</div>
    </div>
  </div>`;
}
function diagCardsBlock(items, recomendacoes) {
  const itemsHtml = (items || []).map(diagItemCard).join('');
  const recs = recomendacoes || [];
  return `<div class="glass diag-card">
    <div class="diag-items">${itemsHtml}</div>
    ${recs.length ? `
      <div class="diag-recs">
        <div class="diag-section-label">🎯 Recomendações práticas</div>
        <ul class="rec-list">${recs.map(r => `<li class="rec-item">${esc(r)}</li>`).join('')}</ul>
      </div>
    ` : ''}
  </div>`;
}

// ============================================================
// Header executivo
// ============================================================
function execHeader(weekStart, weekEnd, diagnosticoItems, updatedAt) {
  const summary = diagSummaryFromItems(diagnosticoItems || []);
  const updated = updatedAt ? new Date(updatedAt).toLocaleString('pt-BR') : '—';
  return `<div class="glass exec-header">
    <div>
      <div class="exec-header-eyebrow">Diagnóstico Digital</div>
      <div class="exec-header-period">${brDate(weekStart)} — ${brDate(weekEnd)}</div>
    </div>
    <div class="exec-header-right">
      <span class="exec-status-pill exec-status-${summary.cls}"><span class="dot"></span>${esc(summary.text)}</span>
      <span class="exec-header-updated">Atualizado em ${esc(updated)}</span>
    </div>
  </div>`;
}

// ============================================================
// KPIs grandes
// ============================================================
function execKpi(label, value, delta, sub) {
  const deltaHtml = delta === 'na'
    ? `<span class="exec-kpi-delta na">Primeira semana registrada</span>`
    : (delta !== null && delta !== undefined
      ? `<span class="exec-kpi-delta ${deltaClass(delta)}">${deltaArrow(delta)} ${fmtPctP(delta)}</span>`
      : (sub ? `<span class="exec-kpi-delta na">${esc(sub)}</span>` : ''));
  return `<div class="glass exec-kpi">
    <span class="exec-kpi-label">${esc(label)}</span>
    <span class="exec-kpi-value">${value}</span>
    ${deltaHtml}
  </div>`;
}
function renderOverviewKpis(current, previous) {
  const ig = current.instagram || {};
  const igPrev = previous ? (previous.instagram || {}) : {};
  const yt = current.youtube || {};
  const ytPrev = previous ? (previous.youtube || {}) : {};
  const growthPct = ig.followersGrowthPct ?? pctChangeClient(ig.followers, igPrev.followers);

  const kpis = [
    execKpi('Seguidores IG', fmtNumP(ig.followers), previous ? growthPct : 'na'),
    execKpi('Inscritos YT', fmtNumP(yt.subscribers), previous ? pctChangeClient(yt.subscribers, ytPrev.subscribers) : 'na'),
    execKpi('Engajamento IG', `${ig.engagementRate != null ? ig.engagementRate.toFixed(2) : '—'}%`, previous ? pctChangeClient(ig.engagementRate, igPrev.engagementRate) : 'na'),
    execKpi('Alcance IG', fmtNumP(ig.reach), previous ? pctChangeClient(ig.reach, igPrev.reach) : 'na'),
    execKpi('Views YT', fmtNumP(yt.views), previous ? pctChangeClient(yt.views, ytPrev.views) : 'na'),
    execKpi('Watch Time YT', `${fmtNumP(yt.watchTimeHours)}h`, previous ? pctChangeClient(yt.watchTimeHours, ytPrev.watchTimeHours) : 'na')
  ];
  return `<div class="exec-kpis">${kpis.join('')}</div>`;
}

// ============================================================
// Score da semana
// ============================================================
function scoreColor(value) {
  if (value >= 70) return '#22c55e';
  if (value >= 50) return '#eab308';
  return '#ef4444';
}
function scoreRingSVG(value) {
  const size = 108, stroke = 9, r = (size - stroke) / 2, c = 2 * Math.PI * r;
  const offset = c * (1 - Math.max(0, Math.min(100, value)) / 100);
  const color = scoreColor(value);
  return `<div class="score-ring-wrap">
    <svg viewBox="0 0 ${size} ${size}">
      <circle class="score-ring-bg" cx="${size / 2}" cy="${size / 2}" r="${r}"/>
      <circle class="score-ring-fg" cx="${size / 2}" cy="${size / 2}" r="${r}" stroke="${color}" stroke-dasharray="${c.toFixed(1)}" stroke-dashoffset="${offset.toFixed(1)}"/>
    </svg>
    <div class="score-ring-label"><span class="score-ring-value">${value}</span><span class="score-ring-max">/100</span></div>
  </div>`;
}
function scoreBarRow(label, value) {
  return `<div class="score-bar-row">
    <span class="plat">${esc(label)}</span>
    <span class="score-bar-track"><span class="score-bar-fill" style="width:${value}%;background:${scoreColor(value)};"></span></span>
    <span class="score-bar-num">${value}</span>
  </div>`;
}
function scoreTag(overall) {
  if (overall >= 75) return { text: 'Ótima performance', cls: 'good' };
  if (overall >= 55) return { text: 'Boa performance', cls: 'good' };
  if (overall >= 40) return { text: 'Performance mediana', cls: 'warn' };
  return { text: 'Performance baixa', cls: 'warn' };
}
function renderScorePanel(score) {
  if (!score || score.insufficient) {
    return `<div class="glass score-panel"><span class="score-insufficient">Dados insuficientes para calcular — a partir da 2ª semana o score aparece aqui.</span></div>`;
  }
  const tag = scoreTag(score.overall);
  const bars = [];
  if (score.instagram !== null && score.instagram !== undefined) bars.push(scoreBarRow('Instagram', score.instagram));
  if (score.youtube !== null && score.youtube !== undefined) bars.push(scoreBarRow('YouTube', score.youtube));
  return `<div class="glass score-panel">
    ${scoreRingSVG(score.overall)}
    <div class="score-meta">
      <span class="score-tag ${tag.cls}">${esc(tag.text)}</span>
      <div class="score-bars">${bars.join('')}</div>
    </div>
  </div>`;
}

// ============================================================
// Gráfico de linha (SVG nativo, sem lib) — usado pra evolução de 8 semanas
// ============================================================
function lineChartSVG(series, labels) {
  if (labels.length < 2) return '<div class="chart-empty">Histórico em construção — a partir da 2ª semana os gráficos aparecem aqui.</div>';
  const allValues = series.flatMap(s => s.values.filter(v => v !== null && v !== undefined));
  if (allValues.length < 2) return '<div class="chart-empty">Sem dados suficientes ainda nesse período.</div>';

  const w = 560, h = 190, padL = 40, padR = 12, padT = 12, padB = 24;
  const max = Math.max(...allValues);
  const min = Math.min(0, ...allValues);
  const range = (max - min) || 1;
  const n = labels.length;
  const stepX = n > 1 ? (w - padL - padR) / (n - 1) : 0;
  const xFor = i => padL + i * stepX;
  const yFor = v => padT + (h - padT - padB) * (1 - (v - min) / range);

  const gridLines = [0, 0.5, 1].map(f => {
    const y = padT + (h - padT - padB) * f;
    const val = max - f * range;
    return `<line class="grid-line" x1="${padL}" y1="${y.toFixed(1)}" x2="${w - padR}" y2="${y.toFixed(1)}"/><text class="axis-label" x="${padL - 6}" y="${(y + 3).toFixed(1)}" text-anchor="end">${fmtNumP(Math.round(val))}</text>`;
  }).join('');

  const xLabels = labels.map((l, i) => (i === 0 || i === labels.length - 1 || i % 2 === 0)
    ? `<text class="axis-label" x="${xFor(i).toFixed(1)}" y="${h - 4}" text-anchor="middle">${esc(l)}</text>`
    : '').join('');

  const linesHtml = series.map(s => {
    const pts = s.values.map((v, i) => (v === null || v === undefined) ? null : `${xFor(i).toFixed(1)},${yFor(v).toFixed(1)}`).filter(Boolean).join(' ');
    const dots = s.values.map((v, i) => {
      if (v === null || v === undefined) return '';
      return `<circle class="line-dot" cx="${xFor(i).toFixed(1)}" cy="${yFor(v).toFixed(1)}" r="3.5" fill="${s.color}"><title>${esc(s.label)} — ${esc(labels[i])}: ${fmtNumP(v)}</title></circle>`;
    }).join('');
    return `<polyline class="line-path" points="${pts}" stroke="${s.color}"/>${dots}`;
  }).join('');

  return `<svg class="chart-svg" viewBox="0 0 ${w} ${h}">${gridLines}${linesHtml}${xLabels}</svg>`;
}
function chartLegend(series) {
  return `<div class="chart-legend">${series.map(s => `<span class="chart-legend-item"><span class="chart-legend-dot" style="background:${s.color}"></span>${esc(s.label)}</span>`).join('')}</div>`;
}
function renderEvolutionCharts(trends) {
  const labels = trends.map(s => brDateShort(s.weekStart));
  const followers = trends.map(s => s.instagram && s.instagram.followers);
  const subscribers = trends.map(s => s.youtube && s.youtube.subscribers);
  const reach = trends.map(s => s.instagram && s.instagram.reach);
  const views = trends.map(s => s.youtube && s.youtube.views);

  const audienceSeries = [{ label: 'Seguidores IG', color: '#22c55e', values: followers }, { label: 'Inscritos YT', color: '#ef4444', values: subscribers }];
  const reachSeries = [{ label: 'Alcance IG', color: '#3b82f6', values: reach }, { label: 'Views YT', color: '#eab308', values: views }];

  return `<div class="chart-row">
    <div class="glass chart-panel">
      <div class="chart-panel-title">Evolução da Audiência</div>
      ${chartLegend(audienceSeries)}
      ${lineChartSVG(audienceSeries, labels)}
    </div>
    <div class="glass chart-panel">
      <div class="chart-panel-title">Evolução de Alcance / Visualizações</div>
      ${chartLegend(reachSeries)}
      ${lineChartSVG(reachSeries, labels)}
    </div>
  </div>`;
}

// ============================================================
// Comparativo Instagram × YouTube (editorial)
// ============================================================
function renderPlatformCompare(current, previous) {
  const ig = current.instagram || {};
  const igPrev = previous ? (previous.instagram || {}) : {};
  const yt = current.youtube || {};
  const ytPrev = previous ? (previous.youtube || {}) : {};
  const igGrowth = ig.followersGrowthPct ?? pctChangeClient(ig.followers, igPrev.followers);
  const ytGrowth = pctChangeClient(yt.subscribers, ytPrev.subscribers);

  let verdict = 'Sem semana anterior suficiente pra comparar o ritmo de crescimento ainda.';
  if (previous && igGrowth !== null && ytGrowth !== null && igGrowth !== ytGrowth) {
    const faster = igGrowth > ytGrowth ? 'Instagram' : 'YouTube';
    verdict = `${faster} cresceu mais rápido esta semana (Instagram ${fmtPctP(igGrowth)} vs. YouTube ${fmtPctP(ytGrowth)}).`;
  }

  return `<div class="glass platform-compare">
    <div class="platform-compare-col ig">
      <span class="platform-compare-name">📷 Instagram</span>
      <span class="platform-compare-metric">${fmtNumP(ig.followers)} <small>seguidores</small></span>
      <span class="exec-kpi-delta ${previous ? deltaClass(igGrowth) : 'na'}">${previous ? `${deltaArrow(igGrowth)} ${fmtPctP(igGrowth)}` : 'Primeira semana'}</span>
      <span class="platform-compare-metric small">${fmtNumP(ig.reach)} <small>contas alcançadas</small></span>
      <span class="platform-compare-metric small">${ig.engagementRate != null ? ig.engagementRate.toFixed(2) : '—'}% <small>engajamento</small></span>
    </div>
    <span class="platform-compare-vs">vs.</span>
    <div class="platform-compare-col yt">
      <span class="platform-compare-name">▶️ YouTube</span>
      <span class="platform-compare-metric">${fmtNumP(yt.subscribers)} <small>inscritos</small></span>
      <span class="exec-kpi-delta ${previous ? deltaClass(ytGrowth) : 'na'}">${previous ? `${deltaArrow(ytGrowth)} ${fmtPctP(ytGrowth)}` : 'Primeira semana'}</span>
      <span class="platform-compare-metric small">${fmtNumP(yt.views)} <small>visualizações</small></span>
      <span class="platform-compare-metric small">${fmtNumP(yt.watchTimeHours)}h <small>de exibição</small></span>
    </div>
    <div class="platform-compare-verdict">${esc(verdict)}</div>
  </div>`;
}

// ============================================================
// Matriz Alcance × Engajamento (scatter)
// ============================================================
function scatterChartSVG(posts) {
  // Só Instagram: "alcance" e a taxa de engajamento nessa escala são conceitos
  // específicos do Instagram — YouTube usa "views", não é comparável aqui.
  const withData = posts.filter(p => p.platform === 'instagram' && p.reach > 0 && p.engagementRate !== null && p.engagementRate !== undefined);
  if (withData.length < 3) return { svg: '<div class="chart-empty">Poucos posts com alcance registrado pra montar a matriz (mínimo 3).</div>', counts: null };

  const w = 620, h = 300, pad = 44;
  const reaches = withData.map(p => p.reach);
  const rates = withData.map(p => p.engagementRate);
  const maxReach = Math.max(...reaches) * 1.08 || 1;
  const maxRate = Math.max(...rates) * 1.15 || 1;
  const medianReach = median(reaches);
  const medianRate = median(rates);
  const xFor = v => pad + (v / maxReach) * (w - pad * 2);
  const yFor = v => h - pad - (v / maxRate) * (h - pad * 2);
  const medianX = xFor(medianReach), medianY = yFor(medianRate);

  function quadrantOf(p) {
    const highReach = p.reach >= medianReach;
    const highEng = p.engagementRate >= medianRate;
    if (highReach && highEng) return { key: 'campeao', color: '#22c55e', label: '🚀 Campeão' };
    if (highReach && !highEng) return { key: 'atrai', color: '#3b82f6', label: '📢 Atrai, não converte' };
    if (!highReach && highEng) return { key: 'promissor', color: '#a855f7', label: '💎 Promissor' };
    return { key: 'baixa', color: '#6b7280', label: '💤 Baixa performance' };
  }

  const counts = { campeao: 0, atrai: 0, promissor: 0, baixa: 0 };
  const dots = withData.map(p => {
    const q = quadrantOf(p);
    counts[q.key]++;
    const dateLabel = p.publishedAt ? brDate(p.publishedAt.slice(0, 10)) : '';
    return `<circle class="scatter-dot" data-action="edit-post" data-id="${p.id}" cx="${xFor(p.reach).toFixed(1)}" cy="${yFor(p.engagementRate).toFixed(1)}" r="6.5" fill="${q.color}"><title>${esc(p.titulo)}${dateLabel ? ` (${dateLabel})` : ''}&#10;Alcance: ${fmtNumP(p.reach)}&#10;Engajamento: ${p.engagementRate.toFixed(2)}%</title></circle>`;
  }).join('');

  const svg = `<svg class="scatter-svg" viewBox="0 0 ${w} ${h}">
    <line class="quadrant-line" x1="${medianX.toFixed(1)}" y1="${pad}" x2="${medianX.toFixed(1)}" y2="${h - pad}"/>
    <line class="quadrant-line" x1="${pad}" y1="${medianY.toFixed(1)}" x2="${w - pad}" y2="${medianY.toFixed(1)}"/>
    <text class="axis-label" x="${w - pad}" y="${h - pad + 18}" text-anchor="end">Alcance →</text>
    <text class="axis-label" x="${pad}" y="${pad - 12}" text-anchor="start">↑ Engajamento</text>
    ${dots}
  </svg>`;
  return { svg, counts };
}
function renderContentMatrix(posts) {
  const { svg, counts } = scatterChartSVG(posts);
  const legend = counts ? `<div class="scatter-legend">
    <span class="scatter-legend-item"><span class="chart-legend-dot" style="background:#22c55e"></span>🚀 Campeão (${counts.campeao})</span>
    <span class="scatter-legend-item"><span class="chart-legend-dot" style="background:#3b82f6"></span>📢 Atrai, não converte (${counts.atrai})</span>
    <span class="scatter-legend-item"><span class="chart-legend-dot" style="background:#a855f7"></span>💎 Promissor (${counts.promissor})</span>
    <span class="scatter-legend-item"><span class="chart-legend-dot" style="background:#6b7280"></span>💤 Baixa performance (${counts.baixa})</span>
  </div>` : '';
  return `<div class="glass scatter-panel">${svg}${legend}</div>`;
}

// ============================================================
// Destaques (melhor/pior, com thumbnail)
// ============================================================
function spotlightCard(p, tag, avg) {
  const thumbHtml = p.thumbnail
    ? `<img class="spotlight-thumb" src="${esc(p.thumbnail)}" alt="">`
    : `<div class="spotlight-thumb">${p.platform === 'youtube' ? '▶️' : '📷'}</div>`;
  const diffPct = avg ? ((p.engagementRate / avg - 1) * 100) : null;
  const note = diffPct === null ? '' : (tag === 'best'
    ? `${Math.abs(diffPct).toFixed(0)}% acima da média da semana (${avg.toFixed(2)}%)`
    : `${Math.abs(diffPct).toFixed(0)}% abaixo da média da semana (${avg.toFixed(2)}%)`);
  const statsHtml = p.platform === 'youtube'
    ? `▶️ ${fmtNumP(p.views)} views · 👍 ${fmtNumP(p.likes)} · 💬 ${fmtNumP(p.comments)}`
    : `❤️ ${fmtNumP(p.likes)} · 💬 ${fmtNumP(p.comments)} · ↗ ${fmtNumP(p.shares)} · 🔖 ${fmtNumP(p.saves)}`;
  return `<div class="glass spotlight-card" data-action="edit-post" data-id="${p.id}">
    ${thumbHtml}
    <div class="spotlight-body">
      <span class="spotlight-tag ${tag === 'best' ? 'good' : 'warn'}">${tag === 'best' ? '🏆 Melhor conteúdo' : '⚠️ Precisa de atenção'}</span>
      <div class="spotlight-title">${esc(p.titulo)}</div>
      <div class="spotlight-rate">${p.engagementRate.toFixed(2)}% engajamento</div>
      <div class="spotlight-stats">${statsHtml}</div>
      ${note ? `<div class="spotlight-note">${esc(note)}</div>` : ''}
    </div>
  </div>`;
}
function renderSpotlights(posts) {
  // Só Instagram — taxa de engajamento do YouTube não é comparável na mesma escala.
  const withRate = posts.filter(p => p.platform === 'instagram' && p.engagementRate !== null && p.engagementRate !== undefined);
  if (!withRate.length) return '<p class="empty-msg">Nenhum post com dados suficientes esta semana.</p>';
  const sorted = [...withRate].sort((a, b) => b.engagementRate - a.engagementRate);
  const best = sorted[0];
  const worst = sorted.length > 1 ? sorted[sorted.length - 1] : null;
  const avg = withRate.reduce((s, p) => s + p.engagementRate, 0) / withRate.length;
  return `<div class="spotlight-grid">${spotlightCard(best, 'best', avg)}${worst ? spotlightCard(worst, 'worst', avg) : ''}</div>`;
}

// ============================================================
// Alertas / Leitura da Semana / Próximas Ações — derivados 100% dos mesmos
// `diagnosticoItems`/`recomendacoes` que já vêm prontos do backend.
// ============================================================
function renderAlerts(items) {
  const warns = (items || []).filter(i => i.tone === 'warn');
  if (!warns.length) return '<p class="alert-empty">Nenhum alerta detectado nesta semana.</p>';
  return `<div class="alert-list">${warns.map(i => `<div class="alert-item warn">⚠️<span><b>${esc(i.label)}:</b> ${esc(i.text)}</span></div>`).join('')}</div>`;
}
function renderReadingWeek(items, recomendacoes) {
  const good = (items || []).filter(i => i.tone === 'good');
  const warn = (items || []).filter(i => i.tone === 'warn');
  const cards = [];
  cards.push(`<div class="glass reading-card good">
    <span class="reading-card-title">🟢 O que funcionou</span>
    <span class="reading-card-text">${good.length ? esc(good.map(i => i.text).join(' ')) : 'Nada se destacou positivamente de forma clara nesta semana.'}</span>
  </div>`);
  cards.push(`<div class="glass reading-card warn">
    <span class="reading-card-title">🟡 O que merece atenção</span>
    <span class="reading-card-text">${warn.length ? esc(warn.map(i => i.text).join(' ')) : 'Sem pontos de atenção relevantes esta semana.'}</span>
  </div>`);
  if (recomendacoes && recomendacoes.length) {
    cards.push(`<div class="glass reading-card opportunity">
      <span class="reading-card-title">🎯 Oportunidade</span>
      <span class="reading-card-text">${esc(recomendacoes[0])}</span>
    </div>`);
  }
  return `<div class="reading-grid">${cards.join('')}</div>`;
}
function renderNextActions(recomendacoes) {
  if (!recomendacoes || !recomendacoes.length) return '<p class="empty-msg">Sem recomendações nesta semana.</p>';
  return `<div class="glass" style="padding:8px 20px;"><div class="actions-list">${recomendacoes.map((r, i) => `<div class="action-item"><span class="action-number">${String(i + 1).padStart(2, '0')}</span><span class="action-text">${esc(r)}</span></div>`).join('')}</div></div>`;
}

// ============================================================
// Rankings (Top 5)
// ============================================================
function rankTableInstagram(posts) {
  const filtered = posts.filter(p => p.platform === 'instagram' && p.engagementRate !== null && p.engagementRate !== undefined);
  const sorted = [...filtered].sort((a, b) => b.engagementRate - a.engagementRate).slice(0, 5);
  if (!sorted.length) return '<p class="empty-msg">Nenhum post do Instagram com dados suficientes esta semana.</p>';
  const medals = ['🥇', '🥈', '🥉', '4º', '5º'];
  const rows = sorted.map((p, i) => {
    const thumb = p.thumbnail ? `<img class="rank-thumb" src="${esc(p.thumbnail)}" alt="">` : '';
    return `<tr class="clickable" data-action="edit-post" data-id="${p.id}">
      <td class="rank-medal">${medals[i]}</td>
      <td><div class="rank-title-cell">${thumb}<span class="rank-title-text">${esc(p.titulo)}</span></div></td>
      <td>${esc(p.formato || p.tipo || '—')}</td>
      <td class="num">${fmtNumP(p.reach)}</td>
      <td class="num">${p.engagementRate.toFixed(2)}%</td>
      <td class="num">${fmtNumP(p.shares)}</td>
      <td class="num">${fmtNumP(p.saves)}</td>
    </tr>`;
  }).join('');
  return `<div class="rank-table-wrap"><table class="rank-table">
    <thead><tr><th></th><th>Conteúdo</th><th>Tipo</th><th class="num">Alcance</th><th class="num">Engajamento</th><th class="num">Compart.</th><th class="num">Salvos</th></tr></thead>
    <tbody>${rows}</tbody>
  </table></div>`;
}
function rankTableYoutube(posts) {
  const filtered = posts.filter(p => p.platform === 'youtube');
  const sorted = [...filtered].sort((a, b) => (b.views || 0) - (a.views || 0)).slice(0, 5);
  if (!sorted.length) return '<p class="empty-msg">Nenhum vídeo do YouTube publicado nesta semana (ou lançado manualmente).</p>';
  const medals = ['🥇', '🥈', '🥉', '4º', '5º'];
  const rows = sorted.map((p, i) => {
    const thumb = p.thumbnail ? `<img class="rank-thumb" src="${esc(p.thumbnail)}" alt="">` : '';
    return `<tr class="clickable" data-action="edit-post" data-id="${p.id}">
      <td class="rank-medal">${medals[i]}</td>
      <td><div class="rank-title-cell">${thumb}<span class="rank-title-text">${esc(p.titulo)}</span></div></td>
      <td class="num">${fmtNumP(p.views)}</td>
      <td class="num">${p.watchTimeMinutes ? fmtMinutes(p.watchTimeMinutes) : '—'}</td>
      <td class="num">${fmtNumP(p.likes)}</td>
    </tr>`;
  }).join('');
  return `<div class="rank-table-wrap"><table class="rank-table">
    <thead><tr><th></th><th>Vídeo</th><th class="num">Views</th><th class="num">Watch time</th><th class="num">Curtidas</th></tr></thead>
    <tbody>${rows}</tbody>
  </table></div>`;
}

// ============================================================
// Performance por formato (Instagram)
// ============================================================
function renderFormatBreakdown(posts) {
  const igPosts = posts.filter(p => p.platform === 'instagram' && p.formato);
  if (!igPosts.length) return '<p class="empty-msg">Sem posts suficientes para agrupar por formato esta semana.</p>';
  const groups = {};
  igPosts.forEach(p => {
    const key = p.formato;
    if (!groups[key]) groups[key] = { count: 0, reachSum: 0, engSum: 0, engCount: 0 };
    groups[key].count++;
    groups[key].reachSum += p.reach || 0;
    if (p.engagementRate !== null && p.engagementRate !== undefined) { groups[key].engSum += p.engagementRate; groups[key].engCount++; }
  });
  const rows = Object.entries(groups)
    .sort((a, b) => b[1].count - a[1].count)
    .map(([formato, g]) => `<tr>
      <td>${esc(formato)}</td>
      <td class="num">${g.count}</td>
      <td class="num">${fmtNumP(Math.round(g.reachSum / g.count))}</td>
      <td class="num">${g.engCount ? (g.engSum / g.engCount).toFixed(2) + '%' : '—'}</td>
    </tr>`).join('');
  return `<table class="format-table"><thead><tr><th>Formato</th><th class="num">Qtd.</th><th class="num">Alcance médio</th><th class="num">Engaj. médio</th></tr></thead><tbody>${rows}</tbody></table>`;
}

// ============================================================
// VISÃO GERAL (Executivo)
// ============================================================
async function renderOverview() {
  const content = document.getElementById('perf-content');
  content.innerHTML = '<p class="empty-msg">Carregando…</p>';
  const [report, trends] = await Promise.all([
    perfFetchJson(`/api/social/report?weekStart=${perfState.weekStart}`),
    perfFetchJson('/api/social/trends?weeks=8')
  ]);
  const { current, previous, posts, weekEnd } = report;
  perfState.lastPosts = posts;
  perfState.lastTrends = trends;

  if (!current) {
    content.innerHTML = `<div class="glass exec-empty">
      <div class="exec-empty-title">Nenhum número lançado para esta semana</div>
      <div class="exec-empty-text">Semana de ${brDate(perfState.weekStart)} a ${brDate(weekEnd)}. Use "Lançar números" pra preencher manualmente ou "Buscar automaticamente" se já tiver contas conectadas.</div>
    </div>`;
    return;
  }

  const items = current.diagnosticoItems || [];
  const recs = current.recomendacoes || [];
  const earliestNote = perfState.earliestWeekStart === perfState.weekStart
    ? `<p class="month-weeks-note">Histórico disponível a partir desta semana (${brDate(perfState.earliestWeekStart)}) — as redes sociais não permitem consultar dados retroativos. Comparações aparecem a partir da próxima semana.</p>`
    : '';
  const notasHtml = current.notasManuais
    ? `<div class="exec-section"><div class="exec-section-title" style="margin-bottom:10px;">📝 Notas manuais</div><div class="glass" style="padding:14px 18px;font-size:13px;color:var(--text-secondary);">${esc(current.notasManuais)}</div></div>`
    : '';

  content.innerHTML = `
    ${execHeader(perfState.weekStart, weekEnd, items, current.updatedAt)}

    <div class="exec-section">
      <div class="exec-section-head"><span class="exec-section-title">Visão Geral da Semana</span></div>
      ${renderOverviewKpis(current, previous)}
    </div>

    <div class="exec-section">
      <div class="exec-section-head"><span class="exec-section-title">Performance da Semana</span></div>
      ${renderScorePanel(current.score)}
    </div>

    <div class="exec-section">
      <div class="exec-section-head"><span class="exec-section-title">Diagnóstico da Semana</span></div>
      ${diagCardsBlock(items, recs)}
      ${earliestNote}
    </div>

    <div class="exec-section">
      <div class="exec-section-head"><span class="exec-section-title">Evolução</span></div>
      ${renderEvolutionCharts(trends)}
    </div>

    <div class="exec-section">
      <div class="exec-section-head"><span class="exec-section-title">Instagram × YouTube</span></div>
      ${renderPlatformCompare(current, previous)}
    </div>

    <div class="exec-section">
      <div class="exec-section-head"><span class="exec-section-title">Matriz Alcance × Engajamento</span><span class="exec-section-sub">Posts do Instagram na semana — clique num ponto pra ver detalhes</span></div>
      ${renderContentMatrix(posts)}
    </div>

    <div class="exec-section">
      <div class="exec-section-head">
        <span class="exec-section-title">Destaques</span>
        <button type="button" class="btn btn-ghost" data-action="add-post" style="padding:6px 14px;font-size:11.5px;">+ Adicionar post</button>
      </div>
      ${renderSpotlights(posts)}
    </div>

    <div class="exec-section">
      <div class="exec-section-head"><span class="exec-section-title">⚠️ Alertas da Semana</span></div>
      <div class="glass" style="padding:16px 18px;">${renderAlerts(items)}</div>
    </div>

    <div class="exec-section">
      <div class="exec-section-head"><span class="exec-section-title">🧠 Leitura da Semana</span></div>
      ${renderReadingWeek(items, recs)}
    </div>

    <div class="exec-section">
      <div class="exec-section-head"><span class="exec-section-title">🎯 Próximas Ações</span></div>
      ${renderNextActions(recs)}
    </div>

    ${notasHtml}
  `;
}

// ============================================================
// ABA INSTAGRAM
// ============================================================
async function renderInstagramTab() {
  const content = document.getElementById('perf-content');
  content.innerHTML = '<p class="empty-msg">Carregando…</p>';
  const [report, trends] = await Promise.all([
    perfFetchJson(`/api/social/report?weekStart=${perfState.weekStart}`),
    perfFetchJson('/api/social/trends?weeks=8')
  ]);
  const { current, previous, posts, weekEnd } = report;
  perfState.lastPosts = posts;

  if (!current) {
    content.innerHTML = `<div class="glass exec-empty"><div class="exec-empty-title">Sem dados do Instagram nesta semana</div><div class="exec-empty-text">Lance os números manualmente ou conecte a integração em Administração de Integrações.</div></div>`;
    return;
  }

  const ig = current.instagram || {};
  const igPrev = previous ? (previous.instagram || {}) : {};
  const st = current.stories || {};
  const stPrev = previous ? (previous.stories || {}) : {};

  const labels = trends.map(s => brDateShort(s.weekStart));
  const followersSeries = [{ label: 'Seguidores', color: '#22c55e', values: trends.map(s => s.instagram && s.instagram.followers) }];
  const reachSeries = [{ label: 'Alcance', color: '#3b82f6', values: trends.map(s => s.instagram && s.instagram.reach) }];
  const engSeries = [{ label: 'Engajamento (%)', color: '#a855f7', values: trends.map(s => s.instagram && s.instagram.engagementRate) }];

  const storiesTone = !st.published ? 'warn' : 'neutral';

  content.innerHTML = `
    <div class="platform-tab-header">
      <div class="platform-tab-icon instagram">📷</div>
      <div><div class="platform-tab-name">Instagram · @prleofelix</div><div class="platform-tab-handle">${brDate(perfState.weekStart)} — ${brDate(weekEnd)}</div></div>
    </div>

    <div class="exec-section">
      <div class="exec-section-head"><span class="exec-section-title">Crescimento &amp; Alcance</span></div>
      <div class="exec-kpis">
        ${execKpi('Seguidores', fmtNumP(ig.followers), previous ? (ig.followersGrowthPct ?? pctChangeClient(ig.followers, igPrev.followers)) : 'na')}
        ${execKpi('Alcance', fmtNumP(ig.reach), previous ? pctChangeClient(ig.reach, igPrev.reach) : 'na')}
        ${execKpi('Impressões', fmtNumP(ig.impressions), previous ? pctChangeClient(ig.impressions, igPrev.impressions) : 'na')}
        ${execKpi('Visitas ao perfil', fmtNumP(ig.profileVisits), previous ? pctChangeClient(ig.profileVisits, igPrev.profileVisits) : 'na')}
      </div>
    </div>

    <div class="exec-section">
      <div class="exec-section-head"><span class="exec-section-title">Engajamento</span></div>
      <div class="exec-kpis">
        ${execKpi('Taxa de engajamento', `${ig.engagementRate != null ? ig.engagementRate.toFixed(2) : '—'}%`, previous ? pctChangeClient(ig.engagementRate, igPrev.engagementRate) : 'na')}
        ${execKpi('Curtidas', fmtNumP(ig.likes), previous ? pctChangeClient(ig.likes, igPrev.likes) : 'na')}
        ${execKpi('Comentários', fmtNumP(ig.comments), previous ? pctChangeClient(ig.comments, igPrev.comments) : 'na')}
        ${execKpi('Compartilhamentos', fmtNumP(ig.shares), previous ? pctChangeClient(ig.shares, igPrev.shares) : 'na')}
        ${execKpi('Salvamentos', fmtNumP(ig.saves), previous ? pctChangeClient(ig.saves, igPrev.saves) : 'na')}
      </div>
    </div>

    <div class="exec-section">
      <div class="exec-section-head"><span class="exec-section-title">Stories</span></div>
      <div class="exec-kpis">
        ${execKpi('Stories publicados', fmtNumP(st.published), null, storiesTone === 'warn' ? 'Nenhum story esta semana' : '')}
        ${execKpi('Visualizações', fmtNumP(st.views), previous ? pctChangeClient(st.views, stPrev.views) : 'na')}
        ${execKpi('Respostas', fmtNumP(st.replies), previous ? pctChangeClient(st.replies, stPrev.replies) : 'na')}
      </div>
    </div>

    <div class="exec-section">
      <div class="exec-section-head"><span class="exec-section-title">Evolução — Instagram (8 semanas)</span></div>
      <div class="chart-row">
        <div class="glass chart-panel"><div class="chart-panel-title">Seguidores</div>${lineChartSVG(followersSeries, labels)}</div>
        <div class="glass chart-panel"><div class="chart-panel-title">Alcance</div>${lineChartSVG(reachSeries, labels)}</div>
        <div class="glass chart-panel"><div class="chart-panel-title">Engajamento</div>${lineChartSVG(engSeries, labels)}</div>
      </div>
    </div>

    <div class="exec-section">
      <div class="exec-section-head"><span class="exec-section-title">Performance por Formato</span></div>
      <div class="glass" style="padding:16px 18px;">${renderFormatBreakdown(posts)}</div>
    </div>

    <div class="exec-section">
      <div class="exec-section-head">
        <span class="exec-section-title">Top 5 — Instagram</span>
        <button type="button" class="btn btn-ghost" data-action="add-post" style="padding:6px 14px;font-size:11.5px;">+ Adicionar post</button>
      </div>
      <div class="glass" style="padding:8px 12px;">${rankTableInstagram(posts)}</div>
    </div>
  `;
}

// ============================================================
// ABA YOUTUBE
// ============================================================
async function renderYoutubeTab() {
  const content = document.getElementById('perf-content');
  content.innerHTML = '<p class="empty-msg">Carregando…</p>';
  const [report, trends] = await Promise.all([
    perfFetchJson(`/api/social/report?weekStart=${perfState.weekStart}`),
    perfFetchJson('/api/social/trends?weeks=8')
  ]);
  const { current, previous, posts, weekEnd } = report;
  perfState.lastPosts = posts;

  if (!current) {
    content.innerHTML = `<div class="glass exec-empty"><div class="exec-empty-title">Sem dados do YouTube nesta semana</div><div class="exec-empty-text">Lance os números manualmente ou conecte a integração em Administração de Integrações.</div></div>`;
    return;
  }

  const yt = current.youtube || {};
  const ytPrev = previous ? (previous.youtube || {}) : {};
  const manualMissing = yt.impressions == null || yt.ctr == null;

  const labels = trends.map(s => brDateShort(s.weekStart));
  const subsSeries = [{ label: 'Inscritos', color: '#ef4444', values: trends.map(s => s.youtube && s.youtube.subscribers) }];
  const viewsSeries = [{ label: 'Views', color: '#eab308', values: trends.map(s => s.youtube && s.youtube.views) }];
  const watchSeries = [{ label: 'Watch time (h)', color: '#3b82f6', values: trends.map(s => s.youtube && s.youtube.watchTimeHours) }];

  content.innerHTML = `
    <div class="platform-tab-header">
      <div class="platform-tab-icon youtube">▶️</div>
      <div><div class="platform-tab-name">YouTube · PrLeofelix</div><div class="platform-tab-handle">${brDate(perfState.weekStart)} — ${brDate(weekEnd)}</div></div>
    </div>

    <div class="exec-section">
      <div class="exec-section-head"><span class="exec-section-title">Audiência</span></div>
      <div class="exec-kpis">
        ${execKpi('Inscritos', fmtNumP(yt.subscribers), previous ? pctChangeClient(yt.subscribers, ytPrev.subscribers) : 'na')}
        ${execKpi('Novos inscritos', `${yt.subscribersGained >= 0 ? '+' : ''}${fmtNumP(yt.subscribersGained)}`, previous ? pctChangeClient(yt.subscribersGained, ytPrev.subscribersGained) : 'na')}
        ${execKpi('Visualizações', fmtNumP(yt.views), previous ? pctChangeClient(yt.views, ytPrev.views) : 'na')}
      </div>
    </div>

    <div class="exec-section">
      <div class="exec-section-head"><span class="exec-section-title">Consumo</span></div>
      <div class="exec-kpis">
        ${execKpi('Tempo de exibição', `${fmtNumP(yt.watchTimeHours)}h`, previous ? pctChangeClient(yt.watchTimeHours, ytPrev.watchTimeHours) : 'na')}
        ${execKpi('Duração média', yt.avgViewDurationSec ? fmtMinutes(yt.avgViewDurationSec / 60) : '—', previous ? pctChangeClient(yt.avgViewDurationSec, ytPrev.avgViewDurationSec) : 'na')}
        <div class="glass exec-kpi"><span class="exec-kpi-label">Retenção (%)</span><span class="exec-kpi-value na-value" style="font-size:16px;">Não disponível via API</span></div>
      </div>
    </div>

    <div class="exec-section">
      <div class="exec-section-head"><span class="exec-section-title">Alcance (aba do Studio — manual)</span></div>
      <div class="glass" style="padding:18px 20px;">
        <div class="exec-kpis" style="margin-bottom: ${manualMissing ? '14px' : '0'};">
          ${execKpi('Impressões', yt.impressions != null ? fmtNumP(yt.impressions) : '<span class="na-value">Não lançado</span>', null)}
          ${execKpi('CTR', yt.ctr != null ? `${yt.ctr.toFixed(2)}%` : '<span class="na-value">Não lançado</span>', null)}
        </div>
        ${manualMissing ? '<p class="month-weeks-note" style="margin:0;">Impressões e CTR não são expostos pela API pública do YouTube — lance manualmente pelo botão "Lançar números".</p>' : ''}
      </div>
    </div>

    <div class="exec-section">
      <div class="exec-section-head"><span class="exec-section-title">Evolução — YouTube (8 semanas)</span></div>
      <div class="chart-row">
        <div class="glass chart-panel"><div class="chart-panel-title">Inscritos</div>${lineChartSVG(subsSeries, labels)}</div>
        <div class="glass chart-panel"><div class="chart-panel-title">Visualizações</div>${lineChartSVG(viewsSeries, labels)}</div>
        <div class="glass chart-panel"><div class="chart-panel-title">Tempo de exibição (h)</div>${lineChartSVG(watchSeries, labels)}</div>
      </div>
    </div>

    <div class="exec-section">
      <div class="exec-section-head">
        <span class="exec-section-title">Top Vídeos da Semana</span>
        <button type="button" class="btn btn-ghost" data-action="add-post" style="padding:6px 14px;font-size:11.5px;">+ Adicionar vídeo</button>
      </div>
      <div class="glass" style="padding:8px 12px;">${rankTableYoutube(posts)}</div>
    </div>
  `;
}

// ============================================================
// Comparativo / Mês (mantidos como estavam — visões de detalhe)
// ============================================================
function comparativoRow(label, prevVal, curVal, isPct) {
  const delta = pctChangeClient(curVal, prevVal);
  const fmt = isPct ? (v => v != null ? `${v.toFixed(2)}%` : '—') : fmtNumP;
  return `<tr>
    <td>${esc(label)}</td>
    <td class="num">${fmt(prevVal)}</td>
    <td class="num">${fmt(curVal)}</td>
    <td class="num"><span class="metric-delta ${deltaClass(delta)}">${deltaArrow(delta)} ${fmtPctP(delta)}</span></td>
  </tr>`;
}
function buildComparativoRows(current, previous) {
  const ig = current.instagram || {}, igP = previous.instagram || {};
  const st = current.stories || {}, stP = previous.stories || {};
  const yt = current.youtube || {}, ytP = previous.youtube || {};
  return [
    comparativoRow('Seguidores', igP.followers, ig.followers),
    comparativoRow('Alcance', igP.reach, ig.reach),
    comparativoRow('Impressões', igP.impressions, ig.impressions),
    comparativoRow('Visitas ao perfil', igP.profileVisits, ig.profileVisits),
    comparativoRow('Curtidas', igP.likes, ig.likes),
    comparativoRow('Comentários', igP.comments, ig.comments),
    comparativoRow('Compartilhamentos', igP.shares, ig.shares),
    comparativoRow('Salvamentos', igP.saves, ig.saves),
    comparativoRow('Taxa de engajamento', igP.engagementRate, ig.engagementRate, true),
    comparativoRow('Stories publicados', stP.published, st.published),
    comparativoRow('Visualizações de stories', stP.views, st.views),
    comparativoRow('Inscritos YouTube', ytP.subscribers, yt.subscribers),
    comparativoRow('Inscritos ganhos', ytP.subscribersGained, yt.subscribersGained),
    comparativoRow('Views YouTube', ytP.views, yt.views),
    comparativoRow('Tempo de exibição (h)', ytP.watchTimeHours, yt.watchTimeHours),
    comparativoRow('Duração média (s)', ytP.avgViewDurationSec, yt.avgViewDurationSec),
    comparativoRow('Impressões YouTube (manual)', ytP.impressions, yt.impressions),
    comparativoRow('CTR YouTube (manual)', ytP.ctr, yt.ctr, true)
  ].join('');
}
async function renderComparativo() {
  const content = document.getElementById('perf-content');
  content.innerHTML = '<p class="empty-msg">Carregando…</p>';
  const report = await perfFetchJson(`/api/social/report?weekStart=${perfState.weekStart}`);
  perfState.lastPosts = report.posts;
  const { current, previous } = report;
  if (!current || !previous) {
    const msg = !current
      ? 'Nenhum número lançado para esta semana ainda.'
      : 'Não há semana anterior registrada pra comparar (esta é a primeira semana do histórico).';
    content.innerHTML = `<div class="glass" style="padding:40px;text-align:center;"><p class="empty-msg" style="padding:0;">${esc(msg)}</p></div>`;
    return;
  }
  content.innerHTML = `<div class="glass table-wrap">
    <table class="comparativo-table">
      <thead><tr><th>Métrica</th><th class="num">Semana anterior</th><th class="num">Esta semana</th><th class="num">Variação</th></tr></thead>
      <tbody>${buildComparativoRows(current, previous)}</tbody>
    </table>
  </div>`;
}

function metricCard({ icon, title, main, delta, sub }) {
  return `<div class="metric-card glass">
    <div class="metric-card-head"><span class="metric-icon">${icon}</span><h3>${esc(title)}</h3></div>
    <div class="metric-main">${main}</div>
    ${delta !== null && delta !== undefined ? `<span class="metric-delta ${deltaClass(delta)}">${deltaArrow(delta)} ${fmtPctP(delta)}</span>` : ''}
    ${sub ? `<div class="metric-sub">${sub}</div>` : ''}
  </div>`;
}
async function renderMonthOverview() {
  const content = document.getElementById('perf-content');
  content.innerHTML = '<p class="empty-msg">Carregando…</p>';
  const data = await perfFetchJson(`/api/social/month?month=${perfState.month}`);
  if (!data.weeksFound.length) {
    content.innerHTML = `<div class="glass" style="padding:40px;text-align:center;"><p class="empty-msg" style="padding:0;">Nenhuma semana registrada em ${esc(monthLabel(perfState.month))} ainda.</p></div>`;
    return;
  }
  const ig = data.instagram, st = data.stories, yt = data.youtube;
  const cards = [
    metricCard({
      icon: '📈', title: 'Seguidores no mês', main: fmtNumP(ig.followersEnd),
      sub: `${ig.followersGrowth >= 0 ? '+' : ''}${fmtNumP(ig.followersGrowth)} no mês (de ${fmtNumP(ig.followersStart)})`
    }),
    metricCard({ icon: '👁️', title: 'Alcance total', main: fmtNumP(ig.reach), sub: `${fmtNumP(ig.impressions)} impressões somadas` }),
    metricCard({
      icon: '💬', title: 'Engajamento médio', main: `${ig.avgEngagementRate != null ? ig.avgEngagementRate.toFixed(2) : '—'}%`,
      sub: `${fmtNumP(ig.likes)} curtidas · ${fmtNumP(ig.comments)} coment. · ${fmtNumP(ig.shares)} compart. · ${fmtNumP(ig.saves)} salvos (somado no mês)`
    }),
    metricCard({ icon: '🎬', title: 'Stories no mês', main: `${fmtNumP(st.published)} publicados`, sub: `${fmtNumP(st.views)} visualizações somadas` }),
    metricCard({
      icon: '▶️', title: 'YouTube no mês', main: `${yt.subscribersGained >= 0 ? '+' : ''}${fmtNumP(yt.subscribersGained)} inscritos`,
      sub: `${fmtNumP(yt.views)} views · ${fmtNumP(yt.watchTimeHours)}h exibição`
    })
  ].join('');
  const missingNote = data.missingWeeks.length
    ? `<p class="month-weeks-note">Semanas sem lançamento neste mês: ${data.missingWeeks.map(brDate).join(', ')}.</p>`
    : '<p class="month-weeks-note">Todas as semanas do mês têm dados lançados.</p>';
  content.innerHTML = `<div class="perf-section"><div class="perf-grid">${cards}</div>${missingNote}</div>`;
}

// ============================================================
// Dispatcher / navegação
// ============================================================
function updatePerfLabel() {
  const label = document.getElementById('perf-week-label');
  if (perfState.mode === 'mes') {
    label.textContent = monthLabel(perfState.month);
  } else {
    label.textContent = `${brDate(perfState.weekStart)} – ${brDate(shiftWeek(perfState.weekStart, 6))}`;
  }
}
function updateToolbarButtonsVisibility() {
  const isMonth = perfState.mode === 'mes';
  document.getElementById('perf-fetch-btn').style.display = isMonth ? 'none' : 'inline-flex';
  document.getElementById('perf-edit-btn').style.display = isMonth ? 'none' : 'inline-flex';
}

async function renderPerfContent() {
  updateToolbarButtonsVisibility();
  updatePerfLabel();
  try {
    if (perfState.mode === 'semana') await renderOverview();
    else if (perfState.mode === 'instagram') await renderInstagramTab();
    else if (perfState.mode === 'youtube') await renderYoutubeTab();
    else if (perfState.mode === 'comparativo') await renderComparativo();
    else await renderMonthOverview();
  } catch (e) {
    if (e.message === 'redirect') return;
    document.getElementById('perf-content').innerHTML = `<div class="glass" style="padding:30px;"><p class="empty-msg" style="padding:0;">Erro ao carregar: ${esc(e.message)}</p></div>`;
  }
}

async function ensurePerfInit() {
  if (perfState.initialized) return;
  const cfg = await perfFetchJson('/api/social/config');
  perfState.currentWeekStart = cfg.currentWeekStart;
  perfState.earliestWeekStart = cfg.earliestWeekStart;
  perfState.weekStart = cfg.currentWeekStart;
  perfState.month = cfg.currentWeekStart.slice(0, 7);
  perfState.initialized = true;
}

async function loadPerformance() {
  try {
    await ensurePerfInit();
  } catch (e) {
    return; // já redirecionou pro login
  }
  renderPerfContent();
}

function navigatePerf(dir) {
  if (perfState.mode === 'mes') {
    const [y, m] = perfState.month.split('-').map(Number);
    const d = new Date(Date.UTC(y, (m - 1) + dir, 1));
    perfState.month = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  } else {
    perfState.weekStart = shiftWeek(perfState.weekStart, dir * 7);
  }
  renderPerfContent();
}

// ============================================================
// Modal: lançar números da semana
// ============================================================
function openPerfModal(snapshot) {
  const s = snapshot || { instagram: {}, stories: {}, youtube: {}, notasManuais: '' };
  document.getElementById('perf-modal-title').textContent = `Lançar números — semana de ${brDate(perfState.weekStart)}`;
  setVal('pf-ig-followers', s.instagram.followers);
  setVal('pf-ig-reach', s.instagram.reach);
  setVal('pf-ig-impressions', s.instagram.impressions);
  setVal('pf-ig-profileVisits', s.instagram.profileVisits);
  setVal('pf-ig-likes', s.instagram.likes);
  setVal('pf-ig-comments', s.instagram.comments);
  setVal('pf-ig-shares', s.instagram.shares);
  setVal('pf-ig-saves', s.instagram.saves);
  setVal('pf-ig-engagementRate', s.instagram.engagementRate);
  setVal('pf-st-published', s.stories.published);
  setVal('pf-st-views', s.stories.views);
  setVal('pf-st-replies', s.stories.replies);
  setVal('pf-st-exits', s.stories.exits);
  setVal('pf-yt-subscribers', s.youtube.subscribers);
  setVal('pf-yt-subscribersGained', s.youtube.subscribersGained);
  setVal('pf-yt-views', s.youtube.views);
  setVal('pf-yt-watchTimeHours', s.youtube.watchTimeHours);
  setVal('pf-yt-avgViewDurationSec', s.youtube.avgViewDurationSec);
  setVal('pf-yt-impressions', s.youtube.impressions);
  setVal('pf-yt-ctr', s.youtube.ctr);
  document.getElementById('pf-notas').value = s.notasManuais || '';
  document.getElementById('perf-modal-overlay').classList.add('active');
}
function closePerfModal() {
  document.getElementById('perf-modal-overlay').classList.remove('active');
}

document.getElementById('perf-edit-btn').addEventListener('click', async () => {
  const report = await perfFetchJson(`/api/social/report?weekStart=${perfState.weekStart}`);
  openPerfModal(report.current);
});
document.getElementById('perf-modal-close').addEventListener('click', closePerfModal);
document.getElementById('perf-cancel-btn').addEventListener('click', closePerfModal);
document.getElementById('perf-modal-overlay').addEventListener('click', (e) => {
  if (e.target === document.getElementById('perf-modal-overlay')) closePerfModal();
});

document.getElementById('perf-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const payload = {
    instagram: {
      followers: numOrNull('pf-ig-followers'), reach: numOrNull('pf-ig-reach'),
      impressions: numOrNull('pf-ig-impressions'), profileVisits: numOrNull('pf-ig-profileVisits'),
      likes: numOrNull('pf-ig-likes'), comments: numOrNull('pf-ig-comments'),
      shares: numOrNull('pf-ig-shares'), saves: numOrNull('pf-ig-saves'),
      engagementRate: numOrNull('pf-ig-engagementRate'),
      source: 'manual'
    },
    stories: {
      published: numOrNull('pf-st-published'), views: numOrNull('pf-st-views'),
      replies: numOrNull('pf-st-replies'), exits: numOrNull('pf-st-exits'),
      source: 'manual'
    },
    youtube: {
      subscribers: numOrNull('pf-yt-subscribers'), subscribersGained: numOrNull('pf-yt-subscribersGained'),
      views: numOrNull('pf-yt-views'), watchTimeHours: numOrNull('pf-yt-watchTimeHours'),
      avgViewDurationSec: numOrNull('pf-yt-avgViewDurationSec'),
      impressions: numOrNull('pf-yt-impressions'), ctr: numOrNull('pf-yt-ctr'),
      source: 'manual'
    },
    notasManuais: document.getElementById('pf-notas').value
  };
  await perfFetchJson(`/api/social/snapshots/${perfState.weekStart}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
  });
  closePerfModal();
  renderPerfContent();
});

document.getElementById('perf-fetch-btn').addEventListener('click', async () => {
  const btn = document.getElementById('perf-fetch-btn');
  btn.disabled = true;
  btn.textContent = 'Buscando…';
  try {
    const result = await perfFetchJson('/api/social/fetch', { method: 'POST' });
    if (result.messages && result.messages.length) alert(result.messages.join('\n'));
    perfState.weekStart = perfState.currentWeekStart;
    renderPerfContent();
  } catch (e) {
    if (e.message !== 'redirect') alert('Erro ao buscar automaticamente: ' + e.message);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Buscar automaticamente';
  }
});

// ============================================================
// Modal: post da semana
// ============================================================
function fmtDateTimeP(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('pt-BR');
}

// Um post já registrado é um fato (veio da API ou já foi lançado) — mostra
// só leitura + link clicável, nunca um formulário editável. Só cadastrar um
// post novo usa o formulário.
function openPerfPostModal(post) {
  perfState.editingPostId = post ? post.id : null;
  const view = document.getElementById('perf-post-view');
  const form = document.getElementById('perf-post-form');
  const title = document.getElementById('perf-post-modal-title');

  if (post) {
    title.textContent = 'Post da semana';
    view.style.display = 'block';
    form.style.display = 'none';
    document.getElementById('pv-platform').textContent = post.platform === 'youtube' ? 'YouTube' : 'Instagram';
    document.getElementById('pv-publishedAt').textContent = fmtDateTimeP(post.publishedAt);
    document.getElementById('pv-titulo').textContent = post.titulo || '—';
    const link = document.getElementById('pv-url');
    if (post.url) { link.href = post.url; link.textContent = post.url; }
    else { link.removeAttribute('href'); link.textContent = '—'; }
    document.getElementById('pv-likes').textContent = fmtNumP(post.likes);
    document.getElementById('pv-comments').textContent = fmtNumP(post.comments);
    document.getElementById('pv-shares').textContent = fmtNumP(post.shares);
    document.getElementById('pv-saves').textContent = fmtNumP(post.saves);
    document.getElementById('pv-reach').textContent = fmtNumP(post.reach);
    document.getElementById('pv-views').textContent = fmtNumP(post.views);
    document.getElementById('pv-engagementRate').textContent = post.engagementRate != null ? `${post.engagementRate.toFixed(2)}%` : '—';
  } else {
    title.textContent = 'Adicionar post da semana';
    view.style.display = 'none';
    form.style.display = 'block';
    document.getElementById('pp-platform').value = 'instagram';
    setVal('pp-titulo', '');
    setVal('pp-url', '');
    setVal('pp-likes', '');
    setVal('pp-comments', '');
    setVal('pp-shares', '');
    setVal('pp-saves', '');
    setVal('pp-reach', '');
    setVal('pp-views', '');
    setVal('pp-engagementRate', '');
  }
  document.getElementById('perf-post-modal-overlay').classList.add('active');
}
function closePerfPostModal() {
  document.getElementById('perf-post-modal-overlay').classList.remove('active');
}

document.getElementById('perf-content').addEventListener('click', (e) => {
  if (e.target.closest('[data-action="add-post"]')) { openPerfPostModal(null); return; }
  const postItem = e.target.closest('[data-action="edit-post"]');
  if (postItem) {
    const post = perfState.lastPosts.find(p => p.id === postItem.dataset.id);
    if (post) openPerfPostModal(post);
  }
});
document.getElementById('perf-post-modal-close').addEventListener('click', closePerfPostModal);
document.getElementById('perf-post-cancel-btn').addEventListener('click', closePerfPostModal);
document.getElementById('perf-post-view-close-btn').addEventListener('click', closePerfPostModal);
document.getElementById('perf-post-modal-overlay').addEventListener('click', (e) => {
  if (e.target === document.getElementById('perf-post-modal-overlay')) closePerfPostModal();
});

document.getElementById('perf-post-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const reach = numOrNull('pp-reach') || 0;
  const likes = numOrNull('pp-likes') || 0;
  const comments = numOrNull('pp-comments') || 0;
  const shares = numOrNull('pp-shares') || 0;
  const saves = numOrNull('pp-saves') || 0;
  let engagementRate = numOrNull('pp-engagementRate');
  if (engagementRate === null && reach) engagementRate = (likes + comments + shares + saves) / reach * 100;
  const payload = {
    weekStart: perfState.weekStart,
    platform: document.getElementById('pp-platform').value,
    titulo: document.getElementById('pp-titulo').value,
    url: document.getElementById('pp-url').value,
    likes, comments, shares, saves, reach,
    views: numOrNull('pp-views') || 0,
    engagementRate
  };
  await perfFetchJson('/api/social/posts', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
  });
  closePerfPostModal();
  renderPerfContent();
});
document.getElementById('perf-post-delete-btn').addEventListener('click', async () => {
  if (!perfState.editingPostId) return;
  const ok = await showConfirm('Excluir este post da semana?');
  if (!ok) return;
  await perfFetchJson(`/api/social/posts/${perfState.editingPostId}`, { method: 'DELETE' });
  closePerfPostModal();
  renderPerfContent();
});

// ============================================================
// Navegação (nav, modos, anterior/próximo)
// ============================================================
document.querySelectorAll('#perf-modes .mode-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('#perf-modes .mode-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    perfState.mode = btn.dataset.perfMode;
    renderPerfContent();
  });
});
document.getElementById('perf-prev').addEventListener('click', () => navigatePerf(-1));
document.getElementById('perf-next').addEventListener('click', () => navigatePerf(1));

const perfNavBtn = document.querySelector('.nav-btn[data-view="performance"]');
if (perfNavBtn) {
  perfNavBtn.addEventListener('click', () => {
    document.title = 'Performance das Redes Sociais — PrLeofelix';
    loadPerformance();
  });
}
document.querySelectorAll('.nav-btn:not([data-view="performance"])').forEach(btn => {
  btn.addEventListener('click', () => { document.title = 'Produção de Conteúdo — PrLeofelix'; });
});
if (location.hash === '#performance' && perfNavBtn) {
  perfNavBtn.click();
}
