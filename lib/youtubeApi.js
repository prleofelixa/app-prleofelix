// Integração com YouTube: YouTube Data API v3 (dados públicos, via API key)
// + YouTube Analytics API (dados privados: watch time, retenção, inscritos
// ganhos — via OAuth). Criar projeto em https://console.cloud.google.com,
// ativar as duas APIs e gerar: 1 API key + 1 credencial OAuth (Desktop/Web).
//
// Atenção: impressões e CTR (aba "Alcance" do YouTube Studio) NÃO são
// expostas pela API pública do YouTube Analytics — limitação confirmada e
// permanente do Google. Esses dois campos continuam sendo lançados
// manualmente mesmo com tudo o resto automatizado (ver lib/socialDiagnostics.js).

function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Variável de ambiente ${name} não configurada.`);
  return value;
}

function getRedirectUri() {
  const base = requireEnv('PUBLIC_BASE_URL');
  return `${base.replace(/\/$/, '')}/api/integrations/youtube/callback`;
}

function getAuthorizeUrl(state) {
  const clientId = requireEnv('GOOGLE_CLIENT_ID');
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: getRedirectUri(),
    response_type: 'code',
    access_type: 'offline',
    prompt: 'consent',
    scope: [
      'https://www.googleapis.com/auth/yt-analytics.readonly',
      'https://www.googleapis.com/auth/youtube.readonly'
    ].join(' '),
    state
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

async function exchangeCodeForTokens(code) {
  const clientId = requireEnv('GOOGLE_CLIENT_ID');
  const clientSecret = requireEnv('GOOGLE_CLIENT_SECRET');
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: getRedirectUri(),
      grant_type: 'authorization_code'
    })
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`Erro ao trocar código do Google: ${json.error_description || json.error}`);
  return json; // { access_token, refresh_token, expires_in, ... }
}

async function refreshAccessToken(refreshToken) {
  const clientId = requireEnv('GOOGLE_CLIENT_ID');
  const clientSecret = requireEnv('GOOGLE_CLIENT_SECRET');
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'refresh_token'
    })
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`Erro ao renovar token do Google: ${json.error_description || json.error}`);
  return json; // { access_token, expires_in, ... }
}

// Identifica o canal do Google que acabou de autorizar o app (usado no
// callback do OAuth, pra não precisar pedir o ID do canal manualmente).
async function fetchMyChannelId(accessToken) {
  const url = new URL('https://www.googleapis.com/youtube/v3/channels');
  url.searchParams.set('part', 'snippet');
  url.searchParams.set('mine', 'true');
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  const json = await res.json();
  if (!res.ok) throw new Error(`Erro YouTube Data API: ${json.error ? json.error.message : res.statusText}`);
  const item = (json.items || [])[0];
  if (!item) throw new Error('Nenhum canal do YouTube encontrado para esta conta Google.');
  return { channelId: item.id, title: item.snippet.title };
}

// Dados públicos via API key — não exige OAuth.
async function fetchChannelPublicStats(channelId) {
  const apiKey = requireEnv('GOOGLE_API_KEY');
  const url = new URL('https://www.googleapis.com/youtube/v3/channels');
  url.searchParams.set('part', 'statistics,snippet');
  url.searchParams.set('id', channelId);
  url.searchParams.set('key', apiKey);
  const res = await fetch(url);
  const json = await res.json();
  if (!res.ok) throw new Error(`Erro YouTube Data API: ${json.error ? json.error.message : res.statusText}`);
  const item = (json.items || [])[0];
  if (!item) throw new Error('Canal do YouTube não encontrado.');
  return {
    title: item.snippet.title,
    subscribers: Number(item.statistics.subscriberCount || 0),
    totalViews: Number(item.statistics.viewCount || 0)
  };
}

// Dados privados via YouTube Analytics API (precisa de access token OAuth válido).
async function fetchWeeklyAnalytics(accessToken, startDate, endDate) {
  const url = new URL('https://youtubeanalytics.googleapis.com/v2/reports');
  url.searchParams.set('ids', 'channel==MINE');
  url.searchParams.set('startDate', startDate);
  url.searchParams.set('endDate', endDate);
  url.searchParams.set('metrics', 'views,estimatedMinutesWatched,averageViewDuration,subscribersGained,subscribersLost');
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  const json = await res.json();
  if (!res.ok) throw new Error(`Erro YouTube Analytics API: ${json.error ? json.error.message : res.statusText}`);
  const row = (json.rows || [])[0] || [];
  const [views, estimatedMinutesWatched, averageViewDuration, subscribersGained, subscribersLost] = row;
  return {
    views: views || 0,
    watchTimeHours: Math.round(((estimatedMinutesWatched || 0) / 60) * 10) / 10,
    avgViewDurationSec: averageViewDuration || 0,
    subscribersGained: subscribersGained || 0,
    subscribersLost: subscribersLost || 0
  };
}

// Acha a playlist de "uploads" do canal — é a lista técnica que a API usa
// pra listar todos os vídeos publicados, em vez de expor um endpoint direto.
async function fetchUploadsPlaylistId(channelId) {
  const apiKey = requireEnv('GOOGLE_API_KEY');
  const url = new URL('https://www.googleapis.com/youtube/v3/channels');
  url.searchParams.set('part', 'contentDetails');
  url.searchParams.set('id', channelId);
  url.searchParams.set('key', apiKey);
  const res = await fetch(url);
  const json = await res.json();
  if (!res.ok) throw new Error(`Erro YouTube Data API: ${json.error ? json.error.message : res.statusText}`);
  const item = (json.items || [])[0];
  if (!item) throw new Error('Canal do YouTube não encontrado.');
  return item.contentDetails.relatedPlaylists.uploads;
}

// Vídeos publicados dentro do período (semana). A API não filtra playlist
// por data diretamente — busca os mais recentes (até 50) e filtra aqui.
async function fetchVideosPublishedInRange(channelId, sinceDate, untilDate) {
  const apiKey = requireEnv('GOOGLE_API_KEY');
  const playlistId = await fetchUploadsPlaylistId(channelId);
  const url = new URL('https://www.googleapis.com/youtube/v3/playlistItems');
  url.searchParams.set('part', 'snippet,contentDetails');
  url.searchParams.set('playlistId', playlistId);
  url.searchParams.set('maxResults', '50');
  url.searchParams.set('key', apiKey);
  const res = await fetch(url);
  const json = await res.json();
  if (!res.ok) throw new Error(`Erro YouTube Data API: ${json.error ? json.error.message : res.statusText}`);
  return (json.items || [])
    .map(it => ({
      videoId: it.contentDetails.videoId,
      title: it.snippet.title,
      publishedAt: it.contentDetails.videoPublishedAt || it.snippet.publishedAt,
      thumbnail: (it.snippet.thumbnails && (it.snippet.thumbnails.medium || it.snippet.thumbnails.default) || {}).url || null
    }))
    .filter(v => {
      const d = new Date(v.publishedAt);
      return d >= sinceDate && d <= untilDate;
    });
}

// Estatísticas públicas por vídeo (views/likes/comments) — sem OAuth.
async function fetchVideoPublicStats(videoIds) {
  if (!videoIds.length) return {};
  const apiKey = requireEnv('GOOGLE_API_KEY');
  const url = new URL('https://www.googleapis.com/youtube/v3/videos');
  url.searchParams.set('part', 'statistics');
  url.searchParams.set('id', videoIds.join(','));
  url.searchParams.set('key', apiKey);
  const res = await fetch(url);
  const json = await res.json();
  if (!res.ok) throw new Error(`Erro YouTube Data API: ${json.error ? json.error.message : res.statusText}`);
  const map = {};
  (json.items || []).forEach(it => {
    map[it.id] = {
      views: Number(it.statistics.viewCount || 0),
      likes: Number(it.statistics.likeCount || 0),
      comments: Number(it.statistics.commentCount || 0)
    };
  });
  return map;
}

// Watch time / duração média por vídeo — precisa do token OAuth do dono do canal.
async function fetchVideoAnalytics(accessToken, videoIds, startDate, endDate) {
  if (!videoIds.length) return {};
  const url = new URL('https://youtubeanalytics.googleapis.com/v2/reports');
  url.searchParams.set('ids', 'channel==MINE');
  url.searchParams.set('startDate', startDate);
  url.searchParams.set('endDate', endDate);
  url.searchParams.set('metrics', 'estimatedMinutesWatched,averageViewDuration');
  url.searchParams.set('dimensions', 'video');
  url.searchParams.set('filters', `video==${videoIds.join(',')}`);
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  const json = await res.json();
  if (!res.ok) throw new Error(`Erro YouTube Analytics API: ${json.error ? json.error.message : res.statusText}`);
  const map = {};
  (json.rows || []).forEach(row => {
    const [videoId, estimatedMinutesWatched, averageViewDuration] = row;
    map[videoId] = { watchTimeMinutes: estimatedMinutesWatched || 0, avgViewDurationSec: averageViewDuration || 0 };
  });
  return map;
}

module.exports = {
  getAuthorizeUrl,
  exchangeCodeForTokens,
  refreshAccessToken,
  fetchMyChannelId,
  fetchChannelPublicStats,
  fetchWeeklyAnalytics,
  fetchVideosPublishedInRange,
  fetchVideoPublicStats,
  fetchVideoAnalytics
};
