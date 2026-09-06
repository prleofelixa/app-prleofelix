// Integração com Instagram via Graph API (conta Business/Creator vinculada a
// uma Página do Facebook). Requer um app em https://developers.facebook.com
// com os produtos "Facebook Login" e "Instagram Graph API" ativados.
//
// Fluxo OAuth: autorizar -> trocar code por token de curta duração -> trocar
// por token de longa duração (60 dias) -> localizar a conta do Instagram
// vinculada via /me/accounts.
//
// Não precisa de App Review: é a própria conta do dono do app, usada em
// modo de desenvolvimento (o dono já é admin/tester do app por padrão).
const GRAPH_VERSION = 'v20.0';
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;

function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Variável de ambiente ${name} não configurada.`);
  return value;
}

function getRedirectUri() {
  const base = requireEnv('PUBLIC_BASE_URL');
  return `${base.replace(/\/$/, '')}/api/integrations/instagram/callback`;
}

function getAuthorizeUrl(state) {
  const clientId = requireEnv('META_APP_ID');
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: getRedirectUri(),
    scope: ['instagram_basic', 'instagram_manage_insights', 'pages_show_list', 'pages_read_engagement'].join(','),
    response_type: 'code',
    state
  });
  return `https://www.facebook.com/${GRAPH_VERSION}/dialog/oauth?${params.toString()}`;
}

async function graphGet(path, params = {}) {
  const url = new URL(`${GRAPH_BASE}${path}`);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url);
  const json = await res.json();
  if (!res.ok || json.error) {
    throw new Error(`Erro Graph API (${path}): ${json.error ? json.error.message : res.statusText}`);
  }
  return json;
}

async function exchangeCodeForShortToken(code) {
  const clientId = requireEnv('META_APP_ID');
  const clientSecret = requireEnv('META_APP_SECRET');
  return graphGet('/oauth/access_token', {
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: getRedirectUri(),
    code
  });
}

async function exchangeForLongLivedToken(shortToken) {
  const clientId = requireEnv('META_APP_ID');
  const clientSecret = requireEnv('META_APP_SECRET');
  const json = await graphGet('/oauth/access_token', {
    grant_type: 'fb_exchange_token',
    client_id: clientId,
    client_secret: clientSecret,
    fb_exchange_token: shortToken
  });
  // expires_in vem em segundos (tipicamente ~60 dias)
  return { accessToken: json.access_token, expiresInSec: json.expires_in };
}

// Localiza a conta do Instagram Business/Creator vinculada à Página do
// Facebook administrada por quem autorizou o app. Quem autoriza pode
// administrar várias Páginas (ex.: a própria + de outros ministérios/empresas)
// — por isso procura pelo username esperado em vez de pegar a primeira que
// aparecer, e avisa quando precisou usar um "melhor palpite".
//
// /me/accounts às vezes não lista uma Página que o usuário administra mesmo
// ela tendo o Instagram corretamente vinculado (comportamento observado do
// Graph API, não é bug nosso) — quando META_PAGE_ID está configurado,
// consulta essa Página diretamente por ID em vez de depender da listagem.
async function findInstagramAccount(longLivedToken, preferredUsername) {
  const fixedPageId = process.env.META_PAGE_ID;
  let candidates;
  if (fixedPageId) {
    const page = await graphGet(`/${fixedPageId}`, {
      access_token: longLivedToken,
      fields: 'id,name,instagram_business_account{id,username}'
    });
    candidates = page.instagram_business_account ? [page] : [];
  } else {
    const pages = await graphGet('/me/accounts', {
      access_token: longLivedToken,
      fields: 'id,name,instagram_business_account{id,username}'
    });
    candidates = (pages.data || []).filter(p => p.instagram_business_account);
  }
  if (!candidates.length) {
    throw new Error('Nenhuma Página do Facebook com conta do Instagram Business/Creator vinculada foi encontrada nesta conta.');
  }

  let chosen = candidates[0];
  let matched = !preferredUsername;
  if (preferredUsername) {
    const match = candidates.find(
      p => (p.instagram_business_account.username || '').toLowerCase() === preferredUsername.toLowerCase()
    );
    if (match) { chosen = match; matched = true; }
  }

  return {
    pageId: chosen.id,
    pageName: chosen.name,
    igUserId: chosen.instagram_business_account.id,
    igUsername: chosen.instagram_business_account.username,
    matched,
    candidates: candidates.map(p => p.instagram_business_account.username)
  };
}

async function fetchProfile(igUserId, token) {
  return graphGet(`/${igUserId}`, {
    fields: 'username,followers_count,media_count',
    access_token: token
  });
}

// Métricas agregadas da semana (reach, impressions, profile views).
async function fetchWeeklyInsights(igUserId, token, sinceUnix, untilUnix) {
  const json = await graphGet(`/${igUserId}/insights`, {
    metric: 'reach,impressions,profile_views',
    period: 'day',
    since: sinceUnix,
    until: untilUnix,
    access_token: token
  });
  const sums = { reach: 0, impressions: 0, profile_views: 0 };
  (json.data || []).forEach(metric => {
    const total = (metric.values || []).reduce((acc, v) => acc + (v.value || 0), 0);
    sums[metric.name] = total;
  });
  return { reach: sums.reach, impressions: sums.impressions, profileVisits: sums.profile_views };
}

async function fetchMediaSince(igUserId, token, sinceUnix, untilUnix) {
  const json = await graphGet(`/${igUserId}/media`, {
    fields: 'id,caption,permalink,timestamp,like_count,comments_count,media_type',
    since: sinceUnix,
    until: untilUnix,
    access_token: token
  });
  return json.data || [];
}

async function fetchMediaInsights(mediaId, token) {
  const json = await graphGet(`/${mediaId}/insights`, {
    metric: 'reach,saved,shares',
    access_token: token
  });
  const out = {};
  (json.data || []).forEach(m => { out[m.name] = (m.values || [])[0] ? m.values[0].value : 0; });
  return out;
}

async function fetchStoriesSince(igUserId, token, sinceUnix, untilUnix) {
  const json = await graphGet(`/${igUserId}/stories`, {
    fields: 'id,timestamp,insights.metric(impressions,reach,replies,exits)',
    since: sinceUnix,
    until: untilUnix,
    access_token: token
  });
  return json.data || [];
}

module.exports = {
  getAuthorizeUrl,
  exchangeCodeForShortToken,
  exchangeForLongLivedToken,
  findInstagramAccount,
  fetchProfile,
  fetchWeeklyInsights,
  fetchMediaSince,
  fetchMediaInsights,
  fetchStoriesSince
};
