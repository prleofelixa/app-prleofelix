// ============================================================
// Estado global
// ============================================================
let contentItems = [];
let ideaItems = [];

const calendarState = {
  mode: 'semana', // mes | semana | dia
  currentDate: new Date()
};

const expanded = {
  lista: new Set(),
  ideias: new Set(),
  arquivo: new Set()
};

const WEEKDAYS_SHORT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const WEEKDAYS_SHORT_MON_FIRST = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];

// ============================================================
// Helpers
// ============================================================
function esc(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function ymd(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function fmtDateDisplay(iso) {
  if (!iso) return '';
  const datePart = iso.split('T')[0];
  const [y, m, d] = datePart.split('-');
  return `${d}/${m}/${y}`;
}

function fmtTimeDisplay(iso) {
  if (!iso) return '';
  const t = iso.split('T')[1];
  return t ? t.slice(0, 5) : '';
}

// os nomes de variáveis CSS não têm acento — normaliza CONCLUÍDO -> concluido
function statusVarName(status) {
  const map = {
    ATIVO: 'ativo', PENDENTE: 'pendente', ATRASADO: 'atrasado',
    'CONCLUÍDO': 'concluido', CANCELADO: 'cancelado', INATIVO: 'inativo'
  };
  return map[status] || 'pendente';
}
function statusBadgeFixed(status) {
  const s = status || 'PENDENTE';
  return `<span class="status-badge status-${esc(s)}"><i class="dot" style="background:var(--status-${statusVarName(s)})"></i>${esc(s)}</span>`;
}
function pillClass(status) { return `pill-${status || 'PENDENTE'}`; }

function pillarsDisplay(raw) {
  const list = raw.pilaresHammer || (raw.pilarHammer ? [raw.pilarHammer] : []);
  return list.length ? esc(list.join(', ')) : '—';
}

function icon(name) {
  const icons = {
    edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
    archive: '<rect x="3" y="4" width="18" height="4" rx="1"/><path d="M5 8v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8"/><path d="M10 12h4"/>',
    unarchive: '<rect x="3" y="4" width="18" height="4" rx="1"/><path d="M5 8v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8"/><path d="M12 17v-5"/><path d="M9.5 14.5 12 12l2.5 2.5"/>',
    trash: '<path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/>'
  };
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${icons[name] || ''}</svg>`;
}

const TIPO_ICON_PATHS = {
  'VOD': '<circle cx="12" cy="12" r="9"/><polygon points="10 8 16 12 10 16 10 8"/>',
  'Corte VOD': '<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><line x1="20" y1="4" x2="8.12" y2="15.88"/><line x1="14.47" y1="14.48" x2="20" y2="20"/><line x1="8.12" y1="8.12" x2="12" y2="12"/>',
  'Martelada': '<path d="M9 6l6-3 3 3-3 6-6-3z"/><line x1="9" y1="9" x2="3" y2="21"/>',
  'Reels': '<rect x="2" y="2" width="20" height="20" rx="2"/><line x1="7" y1="2" x2="7" y2="22"/><line x1="17" y1="2" x2="17" y2="22"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="2" y1="7" x2="7" y2="7"/><line x1="2" y1="17" x2="7" y2="17"/><line x1="17" y1="17" x2="22" y2="17"/><line x1="17" y1="7" x2="22" y2="7"/>',
  'Fura Bolha': '<circle cx="12" cy="12" r="6"/><line x1="12" y1="2" x2="12" y2="5"/><line x1="12" y1="19" x2="12" y2="22"/><line x1="2" y1="12" x2="5" y2="12"/><line x1="19" y1="12" x2="22" y2="12"/>',
  'Frase': '<path d="M7 8c-1.5 0-2.5 1-2.5 2.5S6 13 7 13c0 2-1 3-2 3.5"/><path d="M15 8c-1.5 0-2.5 1-2.5 2.5S14 13 15 13c0 2-1 3-2 3.5"/>',
  'À Mesa Forja': '<path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/>',
  'Foto': '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>',
  'Lagocast': '<path d="M3 18v-6a9 9 0 0 1 18 0v6"/><path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3z"/><path d="M3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z"/>',
  'Post': '<path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/>',
  'Story': '<circle cx="12" cy="12" r="9"/>',
  'Artigo': '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="16" y2="17"/>',
  'Outro': '<path d="M20.59 13.41 13.42 20.58a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/>'
};

function tipoIcon(tipo) {
  const paths = TIPO_ICON_PATHS[tipo] || TIPO_ICON_PATHS['Outro'];
  return `<svg class="tipo-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;
}

function actionBtn(action, id, iconName, extraClass = '') {
  return `<button class="action-icon ${extraClass}" data-action="${action}" data-id="${id}" title="${action}">${icon(iconName)}</button>`;
}

// ============================================================
// Modal de confirmação (substitui o confirm() nativo)
// ============================================================
const confirmOverlay = document.getElementById('confirm-modal-overlay');
const confirmMessage = document.getElementById('confirm-modal-message');
let confirmResolver = null;

function showConfirm(message) {
  confirmMessage.textContent = message;
  confirmOverlay.classList.add('active');
  return new Promise(resolve => { confirmResolver = resolve; });
}
function resolveConfirm(value) {
  confirmOverlay.classList.remove('active');
  if (confirmResolver) { confirmResolver(value); confirmResolver = null; }
}
document.getElementById('confirm-modal-ok').addEventListener('click', () => resolveConfirm(true));
document.getElementById('confirm-modal-cancel').addEventListener('click', () => resolveConfirm(false));
document.getElementById('confirm-modal-close').addEventListener('click', () => resolveConfirm(false));
confirmOverlay.addEventListener('click', (e) => { if (e.target === confirmOverlay) resolveConfirm(false); });

// ============================================================
// API
// ============================================================
async function loadContent() {
  const res = await fetch('/api/content');
  contentItems = await res.json();
}
async function loadIdeas() {
  const res = await fetch('/api/ideas');
  ideaItems = await res.json();
}

async function saveContent(formData, id) {
  const url = id ? `/api/content/${id}` : '/api/content';
  const method = id ? 'PUT' : 'POST';
  const res = await fetch(url, { method, body: formData });
  if (!res.ok) throw new Error('Falha ao salvar conteúdo');
  return res.json();
}
async function deleteContentApi(id) {
  await fetch(`/api/content/${id}`, { method: 'DELETE' });
}
async function archiveContentApi(id) {
  await fetch(`/api/content/${id}/archive`, { method: 'PATCH' });
}
async function unarchiveContentApi(id) {
  await fetch(`/api/content/${id}/unarchive`, { method: 'PATCH' });
}

async function saveIdea(payload, id) {
  const url = id ? `/api/ideas/${id}` : '/api/ideas';
  const method = id ? 'PUT' : 'POST';
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (!res.ok) throw new Error('Falha ao salvar ideia');
  return res.json();
}
async function deleteIdeaApi(id) {
  await fetch(`/api/ideas/${id}`, { method: 'DELETE' });
}

// ============================================================
// Navegação entre views
// ============================================================
document.querySelectorAll('.nav-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.getElementById(`view-${btn.dataset.view}`).classList.add('active');
    if (btn.dataset.view === 'calendario') renderCalendar();
  });
});

// ============================================================
// CALENDÁRIO
// ============================================================
function itemsByDateKey() {
  const map = {};
  contentItems.filter(i => !i.archived).forEach(item => {
    const key = (item.dataPublicacao || '').split('T')[0];
    if (!key) return;
    if (!map[key]) map[key] = [];
    map[key].push(item);
  });
  Object.values(map).forEach(list => list.sort((a, b) => a.dataPublicacao.localeCompare(b.dataPublicacao)));
  return map;
}

function renderCalendar() {
  const label = document.getElementById('cal-label');
  const body = document.getElementById('calendar-body');
  const byDate = itemsByDateKey();
  const todayKey = ymd(new Date());

  if (calendarState.mode === 'mes') {
    const d = calendarState.currentDate;
    label.textContent = d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });

    const firstOfMonth = new Date(d.getFullYear(), d.getMonth(), 1);
    const firstWeekday = firstOfMonth.getDay();
    const gridStart = new Date(firstOfMonth);
    gridStart.setDate(gridStart.getDate() - firstWeekday);

    const lastOfMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0);
    const lastWeekday = lastOfMonth.getDay();
    const trailing = 6 - lastWeekday;
    const totalDays = firstWeekday + lastOfMonth.getDate() + trailing;

    let html = '<div class="month-grid">';
    WEEKDAYS_SHORT.forEach(w => html += `<div class="weekday-head">${w}</div>`);

    for (let i = 0; i < totalDays; i++) {
      const cellDate = new Date(gridStart);
      cellDate.setDate(gridStart.getDate() + i);
      const key = ymd(cellDate);
      const otherMonth = cellDate.getMonth() !== d.getMonth();
      const isToday = key === todayKey;
      const events = byDate[key] || [];
      const maxShow = 3;

      html += `<div class="day-cell ${otherMonth ? 'other-month' : ''} ${isToday ? 'today' : ''}">`;
      html += `<span class="day-num">${cellDate.getDate()}</span>`;
      events.slice(0, maxShow).forEach(ev => {
        html += `<div class="event-pill ${pillClass(ev.status)}" data-action="edit" data-id="${ev.id}">`
          + tipoIcon(ev.tipo)
          + `<span class="pill-text"><b>${esc(ev.tipo)}</b> · ${fmtTimeDisplay(ev.dataPublicacao)} — ${esc(ev.titulo)}</span></div>`;
      });
      if (events.length > maxShow) {
        html += `<div class="event-more" data-action="goto-day" data-date="${key}">+${events.length - maxShow} mais</div>`;
      }
      html += `</div>`;
    }
    html += '</div>';
    body.innerHTML = html;

  } else if (calendarState.mode === 'semana') {
    const d = calendarState.currentDate;
    const weekStart = new Date(d);
    weekStart.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);
    label.textContent = `${weekStart.getDate()} a ${weekEnd.getDate()} de ${weekEnd.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}`;

    let html = '<div class="week-grid">';
    for (let i = 0; i < 7; i++) {
      const cellDate = new Date(weekStart);
      cellDate.setDate(weekStart.getDate() + i);
      const key = ymd(cellDate);
      const isToday = key === todayKey;
      const events = byDate[key] || [];
      const maxShow = 6;

      html += `<div>`;
      html += `<div class="week-col-head"><span class="wd">${WEEKDAYS_SHORT_MON_FIRST[i]}</span>${cellDate.getDate()}</div>`;
      html += `<div class="week-col ${isToday ? 'today' : ''}">`;
      events.slice(0, maxShow).forEach(ev => {
        html += `<div class="week-event ${pillClass(ev.status)}" data-action="edit" data-id="${ev.id}">`
          + `<span class="t">${tipoIcon(ev.tipo)}${esc(ev.tipo)} · ${fmtTimeDisplay(ev.dataPublicacao)} · ${esc(ev.veiculo)}</span>`
          + `<span class="m">${esc(ev.titulo)}</span></div>`;
      });
      if (events.length > maxShow) {
        html += `<div class="event-more" data-action="goto-day" data-date="${key}">+${events.length - maxShow} mais</div>`;
      }
      html += `</div></div>`;
    }
    html += '</div>';
    body.innerHTML = html;

  } else {
    const d = calendarState.currentDate;
    label.textContent = d.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    const key = ymd(d);
    const events = byDate[key] || [];

    let html = '<div class="day-list">';
    if (events.length === 0) {
      html += '<div class="day-empty">Nenhum conteúdo agendado para este dia.</div>';
    } else {
      events.forEach(ev => {
        html += `<div class="day-event ${pillClass(ev.status)}" data-action="edit" data-id="${ev.id}">`
          + `<span class="hora">${tipoIcon(ev.tipo)}<b>${esc(ev.tipo)}</b> · ${fmtTimeDisplay(ev.dataPublicacao)}</span>`
          + `<span class="titulo">${esc(ev.titulo)}</span>`
          + `<span class="meta">${esc(ev.veiculo)} · ${esc(ev.status)}</span>`
          + (ev.descricao ? `<span class="desc">${esc(ev.descricao.slice(0, 160))}${ev.descricao.length > 160 ? '…' : ''}</span>` : '')
          + `</div>`;
      });
    }
    html += '</div>';
    body.innerHTML = html;
  }
}

document.querySelectorAll('.mode-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    calendarState.mode = btn.dataset.mode;
    renderCalendar();
  });
});

document.getElementById('cal-prev').addEventListener('click', () => shiftCalendar(-1));
document.getElementById('cal-next').addEventListener('click', () => shiftCalendar(1));
document.getElementById('cal-today').addEventListener('click', () => {
  calendarState.currentDate = new Date();
  renderCalendar();
});

function shiftCalendar(dir) {
  const d = calendarState.currentDate;
  if (calendarState.mode === 'mes') {
    calendarState.currentDate = new Date(d.getFullYear(), d.getMonth() + dir, 1);
  } else if (calendarState.mode === 'semana') {
    const nd = new Date(d); nd.setDate(d.getDate() + dir * 7);
    calendarState.currentDate = nd;
  } else {
    const nd = new Date(d); nd.setDate(d.getDate() + dir);
    calendarState.currentDate = nd;
  }
  renderCalendar();
}

document.getElementById('calendar-body').addEventListener('click', (e) => {
  const gotoDay = e.target.closest('[data-action="goto-day"]');
  if (gotoDay) {
    const [y, m, day] = gotoDay.dataset.date.split('-').map(Number);
    calendarState.currentDate = new Date(y, m - 1, day);
    calendarState.mode = 'dia';
    document.querySelectorAll('.mode-btn').forEach(b => b.classList.toggle('active', b.dataset.mode === 'dia'));
    renderCalendar();
    return;
  }
  const editEl = e.target.closest('[data-action="edit"]');
  if (editEl) {
    const item = contentItems.find(i => i.id === editEl.dataset.id);
    if (item) openContentModal(item);
  }
});

// ============================================================
// TABELA GENÉRICA — filtros por coluna + linha expansível
// ============================================================
function readFilters(tableId) {
  const filters = {};
  document.querySelectorAll(`#${tableId} .col-filters input`).forEach(inp => {
    const v = inp.value.trim().toLowerCase();
    if (v) filters[inp.dataset.filter] = v;
  });
  return filters;
}

function matchesFilters(row, filters) {
  return Object.entries(filters).every(([key, val]) => {
    const cell = (row[key] || '').toString().toLowerCase();
    return cell.includes(val);
  });
}

// ---------- LISTA ----------
function renderListaTable() {
  const filters = readFilters('table-lista');
  const rows = contentItems
    .filter(i => !i.archived)
    .map(i => ({
      id: i.id,
      dataPublicacao: fmtDateDisplay(i.dataPublicacao),
      hora: fmtTimeDisplay(i.dataPublicacao),
      tipo: i.tipo,
      veiculo: i.veiculo,
      titulo: i.titulo,
      descricao: i.descricao,
      status: i.status,
      raw: i
    }))
    .filter(r => matchesFilters(r, filters))
    .sort((a, b) => (a.raw.dataPublicacao || '').localeCompare(b.raw.dataPublicacao || ''));

  const tbody = document.getElementById('lista-tbody');
  document.getElementById('lista-empty').style.display = rows.length ? 'none' : 'block';

  tbody.innerHTML = rows.map(r => {
    const isExp = expanded.lista.has(r.id);
    return `
      <tr class="data-row ${isExp ? 'expanded' : ''}" data-row-id="${r.id}">
        <td>${esc(r.dataPublicacao)}</td>
        <td>${esc(r.hora)}</td>
        <td>${esc(r.tipo)}</td>
        <td>${esc(r.veiculo)}</td>
        <td class="cell-clamp">${esc(r.titulo)}</td>
        <td class="cell-clamp">${esc(r.descricao)}</td>
        <td>${statusBadgeFixed(r.status)}</td>
        <td>
          <div class="actions-cell">
            ${actionBtn('edit', r.id, 'edit')}
            ${actionBtn('archive', r.id, 'archive')}
            ${actionBtn('delete', r.id, 'trash', 'danger')}
          </div>
        </td>
      </tr>
      ${isExp ? `<tr class="expand-row"><td colspan="8"><div class="expand-content">
          <div class="row-line"><b>Pilar HAMMER:</b> ${pillarsDisplay(r.raw)}</div>
          <div class="row-line"><b>Descrição/Legenda:</b>${esc(r.raw.descricao) || '—'}</div>
          <div class="row-line"><b>Roteiro:</b></div><div class="row-line" style="white-space:pre-line">${esc(r.raw.roteiro) || '—'}</div>
          <div class="row-line"><b>Link:</b> ${r.raw.link ? `<a href="${esc(r.raw.link)}" target="_blank" style="color:#8fbcfb">${esc(r.raw.link)}</a>` : '—'}</div>
          <div class="row-line"><b>Tags:</b> ${esc(r.raw.tags) || '—'}</div>
          ${(r.raw.arquivos && r.raw.arquivos.length) ? `<div class="row-line"><b>Arquivos:</b></div><div class="expand-files">${r.raw.arquivos.map(a => `<a href="${a.url}" target="_blank">${esc(a.originalname)}</a>`).join('')}</div>` : ''}
        </div></td></tr>` : ''}
    `;
  }).join('');
}

document.querySelectorAll('#table-lista .col-filters input').forEach(inp => inp.addEventListener('input', renderListaTable));
document.getElementById('lista-tbody').addEventListener('click', (e) => {
  const actionEl = e.target.closest('[data-action]');
  if (actionEl) {
    handleContentAction(actionEl.dataset.action, actionEl.dataset.id);
    return;
  }
  const row = e.target.closest('tr.data-row');
  if (row) {
    const id = row.dataset.rowId;
    expanded.lista.has(id) ? expanded.lista.delete(id) : expanded.lista.add(id);
    renderListaTable();
  }
});

async function handleContentAction(action, id) {
  const item = contentItems.find(i => i.id === id);
  if (action === 'edit') {
    if (item) openContentModal(item);
  } else if (action === 'archive') {
    await archiveContentApi(id);
    await loadContent();
    renderAllTables();
  } else if (action === 'unarchive') {
    await unarchiveContentApi(id);
    await loadContent();
    renderAllTables();
  } else if (action === 'delete') {
    if (await showConfirm(`Excluir o conteúdo "${item ? item.titulo : ''}"? Essa ação não pode ser desfeita.`)) {
      await deleteContentApi(id);
      await loadContent();
      renderAllTables();
    }
  }
}

// ---------- ARQUIVO ----------
function renderArquivoTable() {
  const filters = readFilters('table-arquivo');
  const rows = contentItems
    .filter(i => i.archived)
    .map(i => ({
      id: i.id,
      dataPublicacao: fmtDateDisplay(i.dataPublicacao),
      tipo: i.tipo, veiculo: i.veiculo, titulo: i.titulo, descricao: i.descricao, status: i.status,
      raw: i
    }))
    .filter(r => matchesFilters(r, filters))
    .sort((a, b) => (b.raw.dataPublicacao || '').localeCompare(a.raw.dataPublicacao || ''));

  const tbody = document.getElementById('arquivo-tbody');
  document.getElementById('arquivo-empty').style.display = rows.length ? 'none' : 'block';

  tbody.innerHTML = rows.map(r => {
    const isExp = expanded.arquivo.has(r.id);
    return `
      <tr class="data-row ${isExp ? 'expanded' : ''}" data-row-id="${r.id}">
        <td>${esc(r.dataPublicacao)}</td>
        <td>${esc(r.tipo)}</td>
        <td>${esc(r.veiculo)}</td>
        <td class="cell-clamp">${esc(r.titulo)}</td>
        <td class="cell-clamp">${esc(r.descricao)}</td>
        <td>${statusBadgeFixed(r.status)}</td>
        <td>
          <div class="actions-cell">
            ${actionBtn('edit', r.id, 'edit')}
            ${actionBtn('unarchive', r.id, 'unarchive')}
            ${actionBtn('delete', r.id, 'trash', 'danger')}
          </div>
        </td>
      </tr>
      ${isExp ? `<tr class="expand-row"><td colspan="7"><div class="expand-content">
          <div class="row-line"><b>Pilar HAMMER:</b> ${pillarsDisplay(r.raw)}</div>
          <div class="row-line"><b>Descrição/Legenda:</b> ${esc(r.raw.descricao) || '—'}</div>
          <div class="row-line"><b>Roteiro:</b></div><div class="row-line" style="white-space:pre-line">${esc(r.raw.roteiro) || '—'}</div>
          <div class="row-line"><b>Link:</b> ${r.raw.link ? `<a href="${esc(r.raw.link)}" target="_blank" style="color:#8fbcfb">${esc(r.raw.link)}</a>` : '—'}</div>
          <div class="row-line"><b>Tags:</b> ${esc(r.raw.tags) || '—'}</div>
        </div></td></tr>` : ''}
    `;
  }).join('');
}
document.querySelectorAll('#table-arquivo .col-filters input').forEach(inp => inp.addEventListener('input', renderArquivoTable));
document.getElementById('arquivo-tbody').addEventListener('click', (e) => {
  const actionEl = e.target.closest('[data-action]');
  if (actionEl) { handleContentAction(actionEl.dataset.action, actionEl.dataset.id); return; }
  const row = e.target.closest('tr.data-row');
  if (row) {
    const id = row.dataset.rowId;
    expanded.arquivo.has(id) ? expanded.arquivo.delete(id) : expanded.arquivo.add(id);
    renderArquivoTable();
  }
});

// ---------- REPOSITÓRIO DE IDEIAS ----------
function renderIdeiasTable() {
  const filters = readFilters('table-ideias');
  const rows = ideaItems
    .map(i => ({ id: i.id, titulo: i.titulo, descricao: i.descricao, link: i.link, raw: i }))
    .filter(r => matchesFilters(r, filters))
    .sort((a, b) => (b.raw.createdAt || '').localeCompare(a.raw.createdAt || ''));

  const tbody = document.getElementById('ideias-tbody');
  document.getElementById('ideias-empty').style.display = rows.length ? 'none' : 'block';

  tbody.innerHTML = rows.map(r => {
    const isExp = expanded.ideias.has(r.id);
    return `
      <tr class="data-row ${isExp ? 'expanded' : ''}" data-row-id="${r.id}">
        <td class="cell-clamp">${esc(r.titulo)}</td>
        <td class="cell-clamp">${esc(r.descricao)}</td>
        <td class="cell-clamp">${r.link ? `<a href="${esc(r.link)}" target="_blank" style="color:#8fbcfb">${esc(r.link)}</a>` : '—'}</td>
        <td>
          <div class="actions-cell">
            ${actionBtn('edit', r.id, 'edit')}
            ${actionBtn('delete', r.id, 'trash', 'danger')}
          </div>
        </td>
      </tr>
      ${isExp ? `<tr class="expand-row"><td colspan="4"><div class="expand-content">
          <div class="row-line"><b>Descrição:</b> ${esc(r.raw.descricao) || '—'}</div>
        </div></td></tr>` : ''}
    `;
  }).join('');
}
document.querySelectorAll('#table-ideias .col-filters input').forEach(inp => inp.addEventListener('input', renderIdeiasTable));
document.getElementById('ideias-tbody').addEventListener('click', async (e) => {
  const actionEl = e.target.closest('[data-action]');
  if (actionEl) {
    const id = actionEl.dataset.id;
    const item = ideaItems.find(i => i.id === id);
    if (actionEl.dataset.action === 'edit') {
      openIdeaModal(item);
    } else if (actionEl.dataset.action === 'delete') {
      if (await showConfirm(`Excluir a ideia "${item ? item.titulo : ''}"?`)) {
        await deleteIdeaApi(id);
        await loadIdeas();
        renderIdeiasTable();
      }
    }
    return;
  }
  const row = e.target.closest('tr.data-row');
  if (row) {
    const id = row.dataset.rowId;
    expanded.ideias.has(id) ? expanded.ideias.delete(id) : expanded.ideias.add(id);
    renderIdeiasTable();
  }
});

function renderAllTables() {
  renderListaTable();
  renderArquivoTable();
  renderCalendar();
}

// ============================================================
// LEITOR (aba nova) — usado pro Roteiro do modal e pros arquivos da equipe
// ============================================================
function openReaderWindow(tipo, titulo, contentHtml, extraContentCss, showTeleprompter) {
  const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>${esc(tipo)} — ${esc(titulo)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;700&display=swap" rel="stylesheet">
<style>
  :root { --font-size: 24px; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #0a0a0a; color: #ffffff; font-family: 'Montserrat', sans-serif; }
  .topbar {
    position: sticky; top: 0; z-index: 1; background: #0a0a0a;
    border-bottom: 1px solid rgba(255,255,255,0.1);
    padding: 16px 24px; display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap;
  }
  .meta { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
  .meta .tipo { font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: rgba(255,255,255,0.55); font-weight: 700; }
  .meta .titulo { font-size: 16px; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .topbar-controls { display: flex; align-items: center; gap: 16px; flex-shrink: 0; flex-wrap: wrap; }
  .font-controls { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
  .font-controls button {
    width: 36px; height: 36px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.15);
    background: rgba(255,255,255,0.06); color: #fff; font-size: 18px; cursor: pointer; line-height: 1;
  }
  .font-controls button:hover { background: rgba(255,255,255,0.14); }
  .font-controls .size-label { font-size: 12px; color: rgba(255,255,255,0.5); width: 44px; text-align: center; }
  .teleprompter-controls { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
  #tp-toggle {
    height: 36px; padding: 0 16px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.15);
    background: rgba(255,255,255,0.06); color: #fff; font-size: 13px; font-weight: 700; cursor: pointer; white-space: nowrap;
  }
  #tp-toggle:hover { background: rgba(255,255,255,0.14); }
  #tp-toggle.active { background: #2e7d46; border-color: #2e7d46; }
  .tp-speed-controls { display: none; align-items: center; gap: 8px; }
  .tp-speed-controls.visible { display: flex; }
  .tp-speed-controls button {
    width: 36px; height: 36px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.15);
    background: rgba(255,255,255,0.06); color: #fff; font-size: 18px; cursor: pointer; line-height: 1;
  }
  .tp-speed-controls button:hover { background: rgba(255,255,255,0.14); }
  .tp-speed-controls .tp-speed-label { font-size: 12px; color: rgba(255,255,255,0.5); width: 44px; text-align: center; }
  .content {
    padding: 40px 56px 80px 56px; font-size: var(--font-size); line-height: 1.55;
    max-width: 900px; margin: 0 auto;
  }
  @media (max-width: 600px) {
    .content { padding: 24px 20px 60px 20px; }
    .meta .titulo { max-width: 50vw; }
  }
  ${extraContentCss || ''}
</style>
</head>
<body>
  <div class="topbar">
    <div class="meta">
      <span class="tipo">${esc(tipo)}</span>
      <span class="titulo">${esc(titulo)}</span>
    </div>
    <div class="topbar-controls">
      ${showTeleprompter ? `
      <div class="teleprompter-controls">
        <button id="tp-toggle" title="Ativar rolagem automática de teleprompter">Teleprompter</button>
        <div class="tp-speed-controls" id="tp-speed-controls">
          <button id="tp-dec" title="Diminuir velocidade">−</button>
          <span class="tp-speed-label" id="tp-speed-label">3x</span>
          <button id="tp-inc" title="Aumentar velocidade">+</button>
        </div>
      </div>
      ` : ''}
      <div class="font-controls">
        <button id="dec" title="Diminuir fonte">−</button>
        <span class="size-label" id="size-label">24px</span>
        <button id="inc" title="Aumentar fonte">+</button>
      </div>
    </div>
  </div>
  <div class="content" id="content">${contentHtml}</div>
  <script>
    var size = 24;
    var root = document.documentElement;
    var label = document.getElementById('size-label');
    function apply() { root.style.setProperty('--font-size', size + 'px'); label.textContent = size + 'px'; }
    document.getElementById('inc').addEventListener('click', function () { size = Math.min(72, size + 2); apply(); });
    document.getElementById('dec').addEventListener('click', function () { size = Math.max(14, size - 2); apply(); });

    ${showTeleprompter ? `
    var tpToggle = document.getElementById('tp-toggle');
    var tpSpeedControls = document.getElementById('tp-speed-controls');
    var tpSpeedLabel = document.getElementById('tp-speed-label');
    var tpRunning = false;
    var tpSpeed = 3;
    var tpRAF = null;
    var tpAccum = 0;
    function tpTick() {
      tpAccum += tpSpeed * 0.35;
      var whole = Math.floor(tpAccum);
      if (whole > 0) {
        window.scrollBy(0, whole);
        tpAccum -= whole;
      }
      tpRAF = requestAnimationFrame(tpTick);
    }
    function tpStart() {
      tpRunning = true;
      tpToggle.textContent = 'Parar Teleprompter';
      tpToggle.classList.add('active');
      tpSpeedControls.classList.add('visible');
      tpTick();
    }
    function tpStop() {
      tpRunning = false;
      tpToggle.textContent = 'Teleprompter';
      tpToggle.classList.remove('active');
      tpSpeedControls.classList.remove('visible');
      if (tpRAF) cancelAnimationFrame(tpRAF);
    }
    tpToggle.addEventListener('click', function () { tpRunning ? tpStop() : tpStart(); });
    document.getElementById('tp-inc').addEventListener('click', function () { tpSpeed = Math.min(20, tpSpeed + 1); tpSpeedLabel.textContent = tpSpeed + 'x'; });
    document.getElementById('tp-dec').addEventListener('click', function () { tpSpeed = Math.max(1, tpSpeed - 1); tpSpeedLabel.textContent = tpSpeed + 'x'; });
    ` : ''}
  </script>
</body>
</html>`;

  const blob = new Blob([html], { type: 'text/html' });
  const blobUrl = URL.createObjectURL(blob);
  const win = window.open(blobUrl, '_blank');
  if (!win) { alert('Seu navegador bloqueou a abertura da aba. Permita pop-ups pra este site.'); }
}

document.getElementById('btn-ler-roteiro').addEventListener('click', () => {
  const tipo = document.getElementById('f-tipo').value || 'Conteúdo';
  const titulo = document.getElementById('f-titulo').value || 'Sem título';
  const texto = document.getElementById('f-roteiro').value.trim() || 'Nenhum roteiro escrito ainda.';
  openReaderWindow(tipo, titulo, esc(texto), '.content { white-space: pre-wrap; }', true);
});

// ---------- Renderizador leve de Markdown (sem biblioteca externa) ----------
function mdToHtml(md) {
  const inline = (s) => s
    .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
    .replace(/`([^`]+)`/g, '<code>$1</code>');

  const lines = md.replace(/\r\n/g, '\n').split('\n');
  let html = '';
  let inCode = false, inList = false, inQuote = false;
  const closeList = () => { if (inList) { html += '</ul>'; inList = false; } };
  const closeQuote = () => { if (inQuote) { html += '</blockquote>'; inQuote = false; } };

  for (const line of lines) {
    if (line.trim().startsWith('```')) {
      if (!inCode) { closeList(); closeQuote(); html += '<pre>'; inCode = true; }
      else { html += '</pre>'; inCode = false; }
      continue;
    }
    if (inCode) { html += esc(line) + '\n'; continue; }

    const h = line.match(/^(#{1,4})\s+(.*)$/);
    if (h) { closeList(); closeQuote(); const lvl = Math.min(h[1].length + 1, 6); html += `<h${lvl}>${inline(esc(h[2]))}</h${lvl}>`; continue; }

    if (/^-{3,}$/.test(line.trim())) { closeList(); closeQuote(); html += '<hr>'; continue; }

    const li = line.match(/^\s*[-*]\s+(.*)$/);
    if (li) { closeQuote(); if (!inList) { html += '<ul>'; inList = true; } html += `<li>${inline(esc(li[1]))}</li>`; continue; }
    closeList();

    const q = line.match(/^>\s?(.*)$/);
    if (q) { if (!inQuote) { html += '<blockquote>'; inQuote = true; } html += `<p>${inline(esc(q[1]))}</p>`; continue; }
    closeQuote();

    if (line.trim() === '') continue;
    html += `<p>${inline(esc(line))}</p>`;
  }
  closeList();
  closeQuote();
  if (inCode) html += '</pre>';
  return html;
}

const MD_READER_CSS = `
  .content h2, .content h3, .content h4, .content h5, .content h6 { font-weight: 700; margin: 1.2em 0 0.5em 0; line-height: 1.3; }
  .content h2 { font-size: 1.35em; }
  .content h3 { font-size: 1.15em; }
  .content p { margin: 0 0 0.9em 0; }
  .content ul { margin: 0 0 0.9em 0; padding-left: 1.4em; }
  .content li { margin-bottom: 0.4em; }
  .content blockquote { margin: 0 0 0.9em 0; padding: 0.2em 1em; border-left: 3px solid rgba(255,255,255,0.25); color: rgba(255,255,255,0.85); }
  .content pre { background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.12); border-radius: 10px; padding: 16px; overflow-x: auto; white-space: pre-wrap; font-size: 0.85em; }
  .content code { background: rgba(255,255,255,0.08); border-radius: 4px; padding: 1px 5px; font-size: 0.9em; }
  .content hr { border: none; border-top: 1px solid rgba(255,255,255,0.15); margin: 1.5em 0; }
  .content b { color: #fff; }
`;

const ARTIFACT_LABELS = {
  briefing: 'Briefing', research: 'Pesquisa', hooks: 'Ganchos', script: 'Roteiro',
  'design-brief': 'Design', publishing: 'Publicação', performance: 'Performance'
};

document.querySelectorAll('.chip-btn[data-artifact]').forEach(btn => {
  btn.addEventListener('click', async () => {
    const name = btn.dataset.artifact;
    btn.disabled = true;
    try {
      const res = await fetch(`/api/generate/artifact/${name}`);
      const data = await res.json();
      if (!res.ok) { alert(data.error || 'Não foi possível abrir esse arquivo.'); return; }
      openReaderWindow('Equipe de Conteúdo', ARTIFACT_LABELS[name] || name, mdToHtml(data.content), MD_READER_CSS);
    } catch (e) {
      alert('Erro ao carregar o arquivo: ' + e.message);
    } finally {
      btn.disabled = false;
    }
  });
});

// ============================================================
// MODAL: CONTEÚDO
// ============================================================
const contentModalOverlay = document.getElementById('content-modal-overlay');
const contentForm = document.getElementById('content-form');
const pillarToggle = document.getElementById('f-pilar-toggle');
const pillarToggleText = document.getElementById('f-pilar-toggle-text');
const pillarPanel = document.getElementById('f-pilar-panel');
let pendingRemoveFiles = [];
let selectedPillars = new Set();

function updatePillarToggleText() {
  if (selectedPillars.size === 0) {
    pillarToggleText.textContent = 'Selecione';
    pillarToggleText.classList.add('placeholder');
  } else {
    pillarToggleText.textContent = Array.from(selectedPillars).join(', ');
    pillarToggleText.classList.remove('placeholder');
  }
}

function openPillarPanel() {
  pillarPanel.classList.add('open');
  pillarToggle.classList.add('open');
}
function closePillarPanel() {
  pillarPanel.classList.remove('open');
  pillarToggle.classList.remove('open');
}

pillarToggle.addEventListener('click', () => {
  pillarPanel.classList.contains('open') ? closePillarPanel() : openPillarPanel();
});
pillarPanel.addEventListener('change', (e) => {
  const checkbox = e.target.closest('input[type=checkbox]');
  if (!checkbox) return;
  const value = checkbox.dataset.value;
  if (checkbox.checked) selectedPillars.add(value);
  else selectedPillars.delete(value);
  updatePillarToggleText();
});
document.addEventListener('click', (e) => {
  if (!e.target.closest('#f-pilar-dropdown')) closePillarPanel();
});

function setPillarChips(values) {
  selectedPillars = new Set(values);
  pillarPanel.querySelectorAll('input[type=checkbox]').forEach(cb => {
    cb.checked = selectedPillars.has(cb.dataset.value);
  });
  updatePillarToggleText();
}

function openContentModal(item = null) {
  contentForm.reset();
  pendingRemoveFiles = [];
  closePillarPanel();
  setPillarChips([]);
  document.getElementById('existing-files').innerHTML = '';
  document.getElementById('content-id').value = '';
  document.getElementById('content-delete-btn').style.display = 'none';

  if (item) {
    document.getElementById('content-modal-title').textContent = 'Editar Conteúdo';
    document.getElementById('content-id').value = item.id;
    document.getElementById('f-tipo').value = item.tipo || '';
    document.getElementById('f-veiculo').value = item.veiculo || '';
    setPillarChips(item.pilaresHammer || (item.pilarHammer ? [item.pilarHammer] : []));
    document.getElementById('f-titulo').value = item.titulo || '';
    document.getElementById('f-descricao').value = item.descricao || '';
    document.getElementById('f-roteiro').value = item.roteiro || '';
    document.getElementById('f-data').value = item.dataPublicacao || '';
    document.getElementById('f-status').value = item.status || 'PENDENTE';
    document.getElementById('f-link').value = item.link || '';
    document.getElementById('f-tags').value = item.tags || '';
    document.getElementById('content-delete-btn').style.display = 'inline-block';

    const existingWrap = document.getElementById('existing-files');
    (item.arquivos || []).forEach(a => {
      const chip = document.createElement('div');
      chip.className = 'existing-file-chip';
      chip.innerHTML = `<a href="${a.url}" target="_blank" style="color:inherit;text-decoration:none;">${esc(a.originalname)}</a> <button type="button" title="Remover">✕</button>`;
      chip.querySelector('button').addEventListener('click', () => {
        pendingRemoveFiles.push(a.filename);
        chip.remove();
      });
      existingWrap.appendChild(chip);
    });
  } else {
    document.getElementById('content-modal-title').textContent = 'Cadastrar Conteúdo';
  }
  contentModalOverlay.classList.add('active');
}
function closeContentModal() { contentModalOverlay.classList.remove('active'); }

document.getElementById('btn-open-content-modal').addEventListener('click', () => openContentModal());
document.getElementById('content-modal-close').addEventListener('click', closeContentModal);
document.getElementById('content-cancel-btn').addEventListener('click', closeContentModal);
// Sem fechar ao clicar fora — só pelo X, Cancelar ou Salvar (pedido explícito).

contentForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = document.getElementById('content-id').value || null;
  const fd = new FormData();
  fd.append('tipo', document.getElementById('f-tipo').value);
  fd.append('veiculo', document.getElementById('f-veiculo').value);
  fd.append('pilaresHammer', JSON.stringify(Array.from(selectedPillars)));
  fd.append('titulo', document.getElementById('f-titulo').value);
  fd.append('descricao', document.getElementById('f-descricao').value);
  fd.append('roteiro', document.getElementById('f-roteiro').value);
  fd.append('dataPublicacao', document.getElementById('f-data').value);
  fd.append('status', document.getElementById('f-status').value);
  fd.append('link', document.getElementById('f-link').value);
  fd.append('tags', document.getElementById('f-tags').value);
  if (pendingRemoveFiles.length) fd.append('removeFiles', JSON.stringify(pendingRemoveFiles));

  const fileInput = document.getElementById('f-arquivos');
  Array.from(fileInput.files).forEach(f => fd.append('arquivos', f));

  await saveContent(fd, id);
  await loadContent();
  renderAllTables();
  closeContentModal();
});

document.getElementById('content-delete-btn').addEventListener('click', async () => {
  const id = document.getElementById('content-id').value;
  const item = contentItems.find(i => i.id === id);
  if (!id) return;
  if (await showConfirm(`Excluir o conteúdo "${item ? item.titulo : ''}"? Essa ação não pode ser desfeita.`)) {
    await deleteContentApi(id);
    await loadContent();
    renderAllTables();
    closeContentModal();
  }
});

// ============================================================
// MODAL: IDEIA
// ============================================================
const ideaModalOverlay = document.getElementById('idea-modal-overlay');
const ideaForm = document.getElementById('idea-form');

function openIdeaModal(item = null) {
  ideaForm.reset();
  document.getElementById('idea-id').value = '';
  document.getElementById('idea-delete-btn').style.display = 'none';
  if (item) {
    document.getElementById('idea-modal-title').textContent = 'Editar Ideia';
    document.getElementById('idea-id').value = item.id;
    document.getElementById('i-titulo').value = item.titulo || '';
    document.getElementById('i-descricao').value = item.descricao || '';
    document.getElementById('i-link').value = item.link || '';
    document.getElementById('idea-delete-btn').style.display = 'inline-block';
  } else {
    document.getElementById('idea-modal-title').textContent = 'Cadastrar Ideia';
  }
  ideaModalOverlay.classList.add('active');
}
function closeIdeaModal() { ideaModalOverlay.classList.remove('active'); }

document.getElementById('btn-open-idea-modal').addEventListener('click', () => openIdeaModal());
document.getElementById('idea-modal-close').addEventListener('click', closeIdeaModal);
document.getElementById('idea-cancel-btn').addEventListener('click', closeIdeaModal);
ideaModalOverlay.addEventListener('click', (e) => { if (e.target === ideaModalOverlay) closeIdeaModal(); });

ideaForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = document.getElementById('idea-id').value || null;
  const payload = {
    titulo: document.getElementById('i-titulo').value,
    descricao: document.getElementById('i-descricao').value,
    link: document.getElementById('i-link').value
  };
  await saveIdea(payload, id);
  await loadIdeas();
  renderIdeiasTable();
  closeIdeaModal();
});

document.getElementById('idea-delete-btn').addEventListener('click', async () => {
  const id = document.getElementById('idea-id').value;
  const item = ideaItems.find(i => i.id === id);
  if (!id) return;
  if (await showConfirm(`Excluir a ideia "${item ? item.titulo : ''}"?`)) {
    await deleteIdeaApi(id);
    await loadIdeas();
    renderIdeiasTable();
    closeIdeaModal();
  }
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    // O modal de Cadastrar/Editar Conteúdo só fecha pelo X, Cancelar ou Salvar.
    if (pillarPanel.classList.contains('open')) { closePillarPanel(); return; }
    closeIdeaModal();
    if (confirmOverlay.classList.contains('active')) resolveConfirm(false);
  }
});

// ============================================================
// GERAR CONTEÚDO (equipe de 7 agentes, via claude -p em stream)
// ============================================================
const CONTEUDO_AGENT_NAMES = ['gestor', 'pesquisador', 'escritor-de-ganchos', 'roteirista', 'designer', 'analista', 'publicador'];

const gerarState = {
  sessionId: null,
  running: false,
  totalCost: 0
};

const gerarLogEl = document.getElementById('gerar-log');
const gerarFormEl = document.getElementById('gerar-form');
const gerarInputEl = document.getElementById('gerar-input');
const gerarSubmitBtn = document.getElementById('gerar-submit-btn');
const gerarStatusBadge = document.getElementById('gerar-status-badge');
const gerarCostEl = document.getElementById('gerar-cost');

function gerarClearEmpty() {
  const emptyMsg = gerarLogEl.querySelector('.gerar-empty');
  if (emptyMsg) emptyMsg.remove();
}
function gerarScrollToEnd() { gerarLogEl.scrollTop = gerarLogEl.scrollHeight; }

function gerarAppendUserBubble(text) {
  gerarClearEmpty();
  const div = document.createElement('div');
  div.className = 'gerar-bubble gerar-bubble-user';
  div.innerHTML = `<div class="bubble-role">Você</div><div class="bubble-text">${esc(text)}</div>`;
  gerarLogEl.appendChild(div);
  gerarScrollToEnd();
}
function gerarAppendAssistantBubble() {
  gerarClearEmpty();
  const div = document.createElement('div');
  div.className = 'gerar-bubble gerar-bubble-assistant';
  div.innerHTML = `<div class="bubble-role">Equipe</div><div class="bubble-text"></div>`;
  gerarLogEl.appendChild(div);
  gerarScrollToEnd();
  return div;
}
function gerarAppendSystemLine(text, isError) {
  gerarClearEmpty();
  const div = document.createElement('div');
  div.className = 'gerar-sysline' + (isError ? ' gerar-sysline-error' : '');
  div.textContent = text;
  gerarLogEl.appendChild(div);
  gerarScrollToEnd();
}

function gerarSetRunningUI(running) {
  gerarState.running = running;
  gerarSubmitBtn.disabled = running;
  gerarSubmitBtn.textContent = running ? 'Rodando...' : (gerarState.sessionId ? 'Responder' : 'Gerar');
  gerarStatusBadge.textContent = running ? 'Rodando' : 'Ocioso';
  gerarStatusBadge.className = 'status-badge ' + (running ? 'status-ATIVO' : 'status-INATIVO');
}

function gerarToolLabel(block) {
  if (block.name === 'Task') {
    const t = block.input && (block.input.subagent_type || block.input.description);
    return `→ chamando agente: ${t || '...'}`;
  }
  if (block.name && block.name.startsWith('mcp__')) {
    return `→ usando ferramenta: ${block.name.split('__').pop()}`;
  }
  return `→ usando ferramenta: ${block.name || '...'}`;
}

// Processa um evento do stream e devolve a bolha de texto do assistente
// "em aberto" (pra continuar concatenando texto nela), ou null.
function gerarHandleEvent(evt, assistantBubble) {
  switch (evt.type) {
    case '__session__':
      gerarState.sessionId = evt.sessionId;
      return assistantBubble;

    case 'system':
      if (evt.subtype === 'init') {
        const found = (evt.agents || []).filter(a => CONTEUDO_AGENT_NAMES.includes(a));
        gerarAppendSystemLine('Sessão iniciada. Agentes disponíveis: ' + (found.length ? found.join(', ') : 'nenhum agente da equipe encontrado nesta pasta.'), found.length === 0);
      }
      return assistantBubble;

    case 'assistant': {
      const content = (evt.message && evt.message.content) || [];
      for (const block of content) {
        if (block.type === 'text' && block.text) {
          if (!assistantBubble) assistantBubble = gerarAppendAssistantBubble();
          assistantBubble.querySelector('.bubble-text').textContent += block.text;
          gerarScrollToEnd();
        } else if (block.type === 'tool_use') {
          gerarAppendSystemLine(gerarToolLabel(block));
          assistantBubble = null; // próxima fala de texto abre uma bolha nova, na ordem certa
        }
      }
      return assistantBubble;
    }

    case 'result': {
      if (typeof evt.total_cost_usd === 'number') {
        gerarState.totalCost += evt.total_cost_usd;
        gerarCostEl.textContent = `Uso desta sessão: $${gerarState.totalCost.toFixed(2)}`;
      }
      if (evt.is_error) {
        gerarAppendSystemLine('Encerrado com erro: ' + (evt.errors && evt.errors.length ? evt.errors.join('; ') : evt.subtype || 'erro desconhecido'), true);
      }
      return null;
    }

    case 'stderr':
      if (evt.text && evt.text.trim()) gerarAppendSystemLine(evt.text.trim(), true);
      return assistantBubble;

    case '__done__':
      return null;

    default:
      return assistantBubble;
  }
}

async function gerarStreamRun(prompt, resume) {
  gerarAppendUserBubble(prompt);
  gerarSetRunningUI(true);

  const body = { prompt, resume: !!resume };
  if (resume) body.sessionId = gerarState.sessionId;

  let assistantBubble = null;

  try {
    const res = await fetch('/api/generate/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    if (!res.ok || !res.body) {
      let err = {};
      try { err = await res.json(); } catch (e) {}
      gerarAppendSystemLine('Erro: ' + (err.error || res.statusText), true);
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buf = '';

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const parts = buf.split('\n\n');
      buf = parts.pop();
      for (const part of parts) {
        const line = part.trim();
        if (!line.startsWith('data:')) continue;
        let evt;
        try { evt = JSON.parse(line.slice(5).trim()); } catch (e) { continue; }
        assistantBubble = gerarHandleEvent(evt, assistantBubble);
      }
    }
  } catch (e) {
    gerarAppendSystemLine('Erro de conexão: ' + e.message, true);
  } finally {
    gerarSetRunningUI(false);
  }
}

gerarFormEl.addEventListener('submit', (e) => {
  e.preventDefault();
  if (gerarState.running) return;
  const text = gerarInputEl.value.trim();
  if (!text) return;
  gerarInputEl.value = '';
  gerarStreamRun(text, !!gerarState.sessionId);
});

document.getElementById('gerar-reset-btn').addEventListener('click', () => {
  if (gerarState.running) return;
  gerarState.sessionId = null;
  gerarState.totalCost = 0;
  gerarCostEl.textContent = '';
  gerarLogEl.innerHTML = '<p class="gerar-empty">Ainda não há nada aqui. Escreva sua mensagem na caixa de baixo e clique em Gerar.</p>';
  gerarSubmitBtn.textContent = 'Gerar';
});

// ============================================================
// INIT
// ============================================================
(async function init() {
  await Promise.all([loadContent(), loadIdeas()]);
  renderCalendar();
  renderListaTable();
  renderIdeiasTable();
  renderArquivoTable();
})();
