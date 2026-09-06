function fmtDateTime(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleString('pt-BR');
}

function showBanner(text, kind) {
  const el = document.getElementById('admin-banner');
  el.textContent = text;
  el.className = `admin-banner admin-banner-${kind}`;
  el.style.display = 'block';
}

function renderPlatform(prefix, status) {
  const badge = document.getElementById(`${prefix}-status-badge`);
  const meta = document.getElementById(`${prefix}-meta`);
  const connectBtn = document.getElementById(`${prefix}-connect-btn`);
  const disconnectBtn = document.getElementById(`${prefix}-disconnect-btn`);

  if (status.connected) {
    badge.textContent = status.expired ? 'Token expirado' : (status.expiresSoon ? 'Expira em breve' : 'Conectado');
    badge.className = `status-badge status-${status.expired ? 'ATRASADO' : (status.expiresSoon ? 'PENDENTE' : 'ATIVO')}`;
    meta.innerHTML = `
      <div><dt>Conta</dt><dd>${status.accountName || '—'}</dd></div>
      ${status.expiresAt ? `<div><dt>Token expira em</dt><dd>${fmtDateTime(status.expiresAt)}</dd></div>` : ''}
    `;
    connectBtn.style.display = 'none';
    disconnectBtn.style.display = 'inline-flex';
    if (status.expired) {
      showBanner(`O token do ${prefix === 'ig' ? 'Instagram' : 'YouTube'} expirou — a busca automática vai falhar até reconectar.`, 'warn');
    }
  } else {
    badge.textContent = 'Não conectado';
    badge.className = 'status-badge status-INATIVO';
    meta.innerHTML = '';
    connectBtn.style.display = 'inline-flex';
    disconnectBtn.style.display = 'none';
  }
}

async function loadStatus() {
  const res = await fetch('/api/integrations/status');
  if (res.status === 401) { location.href = '/login.html?next=' + encodeURIComponent(location.pathname); return; }
  const data = await res.json();
  renderPlatform('ig', data.instagram);
  renderPlatform('yt', data.youtube);
}

document.getElementById('ig-disconnect-btn').addEventListener('click', async () => {
  await fetch('/api/integrations/instagram/disconnect', { method: 'POST' });
  loadStatus();
});
document.getElementById('yt-disconnect-btn').addEventListener('click', async () => {
  await fetch('/api/integrations/youtube/disconnect', { method: 'POST' });
  loadStatus();
});
document.getElementById('btn-logout').addEventListener('click', async () => {
  await fetch('/api/auth/logout', { method: 'POST' });
  location.href = '/login.html';
});

(function init() {
  const params = new URLSearchParams(location.search);
  if (params.get('connected')) {
    showBanner(`${params.get('connected') === 'instagram' ? 'Instagram' : 'YouTube'} conectado com sucesso.`, 'ok');
    history.replaceState({}, '', location.pathname);
  } else if (params.get('warning')) {
    showBanner(params.get('warning'), 'warn');
    history.replaceState({}, '', location.pathname);
  } else if (params.get('error')) {
    showBanner(params.get('error'), 'error');
    history.replaceState({}, '', location.pathname);
  }
  loadStatus();
})();
