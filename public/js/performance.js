// ============================================================
// Performance das Redes Sociais
// Reaproveita esc()/showConfirm() já globais de app.js (mesmo escopo, sem
// módulos). Cada view (semana/comparativo/mês) busca da API e renderiza
// dentro de #perf-content; nada aqui decide o texto do diagnóstico —
// isso vem pronto de lib/socialDiagnostics.js no servidor.
// ============================================================
const perfState = {
  mode: 'semana',
  weekStart: null,
  month: null,
  earliestWeekStart: null,
  initialized: false,
  editingPostId: null,
  lastPosts: []
};

const MONTHS_PT = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

function brDate(iso) {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
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
// Cards / componentes
// ============================================================
function metricCard({ icon, title, main, delta, sub }) {
  return `<div class="metric-card glass">
    <div class="metric-card-head"><span class="metric-icon">${icon}</span><h3>${esc(title)}</h3></div>
    <div class="metric-main">${main}</div>
    ${delta !== null && delta !== undefined ? `<span class="metric-delta ${deltaClass(delta)}">${deltaArrow(delta)} ${fmtPctP(delta)}</span>` : ''}
    ${sub ? `<div class="metric-sub">${sub}</div>` : ''}
  </div>`;
}

function buildMetricCards(current, previous) {
  const ig = current.instagram || {};
  const igPrev = previous ? (previous.instagram || {}) : {};
  const st = current.stories || {};
  const stPrev = previous ? (previous.stories || {}) : {};
  const yt = current.youtube || {};
  const ytPrev = previous ? (previous.youtube || {}) : {};

  const growthPct = ig.followersGrowthPct ?? pctChangeClient(ig.followers, igPrev.followers);
  const cards = [];

  cards.push(metricCard({
    icon: '📈', title: 'Crescimento', main: `${fmtNumP(ig.followers)} seguidores`,
    delta: previous ? growthPct : null,
    sub: previous ? `Semana anterior: ${fmtNumP(igPrev.followers)}` : 'Primeira semana registrada'
  }));

  cards.push(metricCard({
    icon: '👁️', title: 'Alcance', main: `${fmtNumP(ig.reach)} contas`,
    delta: previous ? pctChangeClient(ig.reach, igPrev.reach) : null,
    sub: `${fmtNumP(ig.impressions)} impressões · ${fmtNumP(ig.profileVisits)} visitas ao perfil`
  }));

  cards.push(metricCard({
    icon: '💬', title: 'Engajamento', main: `${ig.engagementRate != null ? ig.engagementRate.toFixed(2) : '—'}%`,
    delta: previous ? pctChangeClient(ig.engagementRate, igPrev.engagementRate) : null,
    sub: `${fmtNumP(ig.likes)} curtidas · ${fmtNumP(ig.comments)} coment. · ${fmtNumP(ig.shares)} compart. · ${fmtNumP(ig.saves)} salvos`
  }));

  cards.push(metricCard({
    icon: '🎬', title: 'Stories', main: `${fmtNumP(st.published)} publicados`,
    delta: previous ? pctChangeClient(st.views, stPrev.views) : null,
    sub: `${fmtNumP(st.views)} visualizações · ${fmtNumP(st.replies)} respostas · ${fmtNumP(st.exits)} saídas`
  }));

  const ytMissingManual = yt.impressions == null || yt.ctr == null;
  cards.push(metricCard({
    icon: '▶️', title: 'YouTube', main: `${fmtNumP(yt.subscribers)} inscritos`,
    delta: previous ? pctChangeClient(yt.subscribers, ytPrev.subscribers) : null,
    sub: `${yt.subscribersGained >= 0 ? '+' : ''}${fmtNumP(yt.subscribersGained)} na semana · ${fmtNumP(yt.views)} views · ${fmtNumP(yt.watchTimeHours)}h exibição${ytMissingManual ? ' · <b>faltam impressões/CTR</b>' : ''}`
  }));

  if (previous) {
    const ytGrowth = pctChangeClient(yt.subscribers, ytPrev.subscribers);
    if (growthPct !== null && ytGrowth !== null) {
      const leader = growthPct === ytGrowth ? 'Empate' : (growthPct > ytGrowth ? 'Instagram' : 'YouTube');
      cards.push(metricCard({
        icon: '📊', title: 'Comparativo IG × YT', main: leader,
        sub: `Instagram ${fmtPctP(growthPct)} · YouTube ${fmtPctP(ytGrowth)}`
      }));
    }
  }

  return cards.join('');
}

function renderPostRank(posts) {
  const withRate = posts.filter(p => p.engagementRate !== null && p.engagementRate !== undefined);
  let bestId = null, worstId = null;
  if (withRate.length) {
    const sorted = [...withRate].sort((a, b) => b.engagementRate - a.engagementRate);
    bestId = sorted[0].id;
    worstId = sorted.length > 1 ? sorted[sorted.length - 1].id : null;
  }
  // Melhor e pior sempre no topo da lista, nessa ordem — o resto mantém a ordem original.
  const bestPost = posts.find(p => p.id === bestId);
  const worstPost = posts.find(p => p.id === worstId);
  const others = posts.filter(p => p.id !== bestId && p.id !== worstId);
  const ordered = [bestPost, worstPost, ...others].filter(Boolean);

  const items = ordered.length
    ? ordered.map(p => {
      const badge = p.id === bestId
        ? '<span class="post-rank-badge best">Melhor</span>'
        : (p.id === worstId ? '<span class="post-rank-badge worst">Pior</span>' : '');
      const rate = p.engagementRate != null ? `${p.engagementRate.toFixed(2)}%` : '—';
      return `<div class="post-rank-item" data-action="edit-post" data-id="${p.id}">
        ${badge}
        <span class="post-rank-title">${esc(p.titulo)}</span>
        <span class="post-rank-rate">${rate}</span>
      </div>`;
    }).join('')
    : '<p class="empty-msg">Nenhum post cadastrado para esta semana ainda.</p>';

  return `<div class="perf-section">
    <div class="field-label-row" style="margin-bottom:10px;">
      <div class="perf-section-title" style="margin:0;">🎥 Desempenho de Conteúdo</div>
      <button type="button" class="btn btn-ghost" data-action="add-post" style="padding:6px 14px;font-size:11.5px;">+ Adicionar post</button>
    </div>
    <div class="post-rank">${items}</div>
  </div>`;
}

function sparklinePoints(values, w = 200, h = 40) {
  const valid = values.map(v => (v === null || v === undefined ? 0 : v));
  const max = Math.max(...valid, 1);
  const min = Math.min(...valid, 0);
  const range = (max - min) || 1;
  const stepX = valid.length > 1 ? w / (valid.length - 1) : w;
  return valid.map((v, i) => `${(i * stepX).toFixed(1)},${(h - ((v - min) / range) * h).toFixed(1)}`).join(' ');
}
function trendCard(title, values, formatter) {
  const last = values[values.length - 1];
  return `<div class="glass trend-card">
    <h4>${esc(title)}</h4>
    <svg viewBox="0 0 200 40" preserveAspectRatio="none"><polyline points="${sparklinePoints(values)}" fill="none" stroke="var(--accent-green)" stroke-width="2"/></svg>
    <div class="trend-value">${formatter(last)}</div>
  </div>`;
}
function renderTrends(trends) {
  if (trends.length < 2) return '';
  const followers = trends.map(s => s.instagram && s.instagram.followers);
  const reach = trends.map(s => s.instagram && s.instagram.reach);
  const eng = trends.map(s => s.instagram && s.instagram.engagementRate);
  const ytViews = trends.map(s => s.youtube && s.youtube.views);
  return `<div class="perf-section">
    <div class="perf-section-title">🔎 Tendências (últimas ${trends.length} semanas)</div>
    <div class="trend-row">
      ${trendCard('Seguidores', followers, fmtNumP)}
      ${trendCard('Alcance', reach, fmtNumP)}
      ${trendCard('Engajamento (%)', eng, v => v != null ? v.toFixed(2) + '%' : '—')}
      ${trendCard('Views YouTube', ytViews, fmtNumP)}
    </div>
  </div>`;
}

// ============================================================
// Views: Relatório da Semana / Comparativo / Visão Geral do Mês
// ============================================================
async function renderWeekReport() {
  const content = document.getElementById('perf-content');
  content.innerHTML = '<p class="empty-msg">Carregando…</p>';
  const [report, trends] = await Promise.all([
    perfFetchJson(`/api/social/report?weekStart=${perfState.weekStart}`),
    perfFetchJson('/api/social/trends?weeks=8')
  ]);
  const { current, previous, posts, weekEnd } = report;
  perfState.lastPosts = posts;

  if (!current) {
    content.innerHTML = `<div class="glass" style="padding:40px;text-align:center;">
      <p class="empty-msg" style="padding:0;">Nenhum número lançado para a semana de ${brDate(perfState.weekStart)} a ${brDate(weekEnd)}.</p>
      <p class="empty-msg" style="padding:0;">Use "Lançar números" pra preencher manualmente ou "Buscar automaticamente" se já tiver contas conectadas.</p>
    </div>`;
    return;
  }

  const earliestNote = perfState.earliestWeekStart === perfState.weekStart
    ? `<p class="month-weeks-note">Histórico disponível a partir desta semana (${brDate(perfState.earliestWeekStart)}) — as redes sociais não permitem consultar dados retroativos.</p>`
    : '';
  const notasHtml = current.notasManuais
    ? `<div class="perf-section"><div class="perf-section-title">📝 Notas manuais</div><div class="glass" style="padding:14px 18px;font-size:13px;color:var(--text-secondary);">${esc(current.notasManuais)}</div></div>`
    : '';

  content.innerHTML = `
    <div class="perf-section">
      <div class="perf-section-title">🎯 Diagnóstico &amp; Recomendações</div>
      <div class="glass diag-card">
        <p class="diag-text">${esc(current.diagnostico)}</p>
        <ul class="rec-list">${(current.recomendacoes || []).map(r => `<li class="rec-item">${esc(r)}</li>`).join('')}</ul>
      </div>
      ${earliestNote}
    </div>
    <div class="perf-section">
      <div class="perf-section-title">Números da Semana</div>
      <div class="perf-grid">${buildMetricCards(current, previous)}</div>
    </div>
    ${renderPostRank(posts)}
    ${renderTrends(trends)}
    ${notasHtml}
  `;
}

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
    if (perfState.mode === 'semana') await renderWeekReport();
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
