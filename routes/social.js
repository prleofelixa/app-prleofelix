const express = require('express');
const store = require('../lib/socialStore');
const integrationsStore = require('../lib/integrationsStore');
const instagramApi = require('../lib/instagramApi');
const youtubeApi = require('../lib/youtubeApi');
const weekUtils = require('../lib/weekUtils');
const { requireAuth } = require('../lib/auth');

const router = express.Router();
router.use(requireAuth);

router.get('/config', async (req, res) => {
  res.json({
    currentWeekStart: weekUtils.currentWeekStart(),
    earliestWeekStart: await store.earliestWeekStart()
  });
});

router.get('/report', async (req, res) => {
  const weekStart = req.query.weekStart || weekUtils.currentWeekStart();
  res.json(await store.getReport(weekStart));
});

router.put('/snapshots/:weekStart', async (req, res) => {
  const { weekStart } = req.params;
  const canonical = weekUtils.weekStartFor(weekStart);
  if (canonical !== weekStart) {
    return res.status(400).json({ error: `weekStart precisa ser uma segunda-feira (ex.: ${canonical}).` });
  }
  const { instagram, stories, youtube, notasManuais } = req.body || {};
  const snapshot = await store.upsertSnapshot(weekStart, { instagram, stories, youtube, notasManuais });
  res.json(snapshot);
});

router.get('/month', async (req, res) => {
  const month = req.query.month || weekUtils.monthOfWeek(weekUtils.currentWeekStart());
  res.json(await store.buildMonthOverview(month));
});

router.get('/trends', async (req, res) => {
  const weeks = Number(req.query.weeks) || 8;
  res.json(await store.getTrends(weeks));
});

// ---------- Posts da semana ----------

router.get('/posts', async (req, res) => {
  const weekStart = req.query.weekStart || weekUtils.currentWeekStart();
  res.json(await store.postsForWeek(weekStart));
});

router.post('/posts', async (req, res) => {
  const body = req.body || {};
  const weekStart = body.weekStart || weekUtils.currentWeekStart();
  const post = {
    id: store.newId(),
    weekStart,
    platform: body.platform || 'instagram',
    tipo: body.tipo || '',
    titulo: body.titulo || '',
    url: body.url || '',
    publishedAt: body.publishedAt || '',
    likes: Number(body.likes) || 0,
    comments: Number(body.comments) || 0,
    shares: Number(body.shares) || 0,
    saves: Number(body.saves) || 0,
    reach: Number(body.reach) || 0,
    impressions: Number(body.impressions) || 0,
    views: Number(body.views) || 0,
    engagementRate: body.engagementRate != null ? Number(body.engagementRate) : null,
    contentId: body.contentId || null
  };
  const posts = await store.getPosts();
  posts.push(post);
  await store.savePosts(posts);
  res.status(201).json(post);
});

router.put('/posts/:id', async (req, res) => {
  const posts = await store.getPosts();
  const idx = posts.findIndex(p => p.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Post não encontrado.' });
  posts[idx] = { ...posts[idx], ...req.body, id: posts[idx].id };
  await store.savePosts(posts);
  res.json(posts[idx]);
});

router.delete('/posts/:id', async (req, res) => {
  const posts = await store.getPosts();
  const idx = posts.findIndex(p => p.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Post não encontrado.' });
  posts.splice(idx, 1);
  await store.savePosts(posts);
  res.json({ ok: true });
});

// ---------- Busca automática ----------
// Mesmo caminho usado pelo botão "Buscar automaticamente" e pela rotina
// agendada de sexta-feira — nunca duplica a regra de negócio do diagnóstico
// (lib/socialDiagnostics.js), só alimenta os números.
router.post('/fetch', async (req, res) => {
  const weekStart = weekUtils.currentWeekStart();
  const weekEnd = weekUtils.weekEndFor(weekStart);
  const patch = { instagram: {}, stories: {}, youtube: {} };
  const messages = [];

  const ig = await integrationsStore.getInstagram();
  if (ig && ig.accessToken) {
    try {
      const sinceUnix = Math.floor(new Date(`${weekStart}T00:00:00-03:00`).getTime() / 1000);
      const untilUnix = Math.floor(new Date(`${weekEnd}T23:59:59-03:00`).getTime() / 1000);

      const profile = await instagramApi.fetchProfile(ig.igUserId, ig.accessToken);
      const insights = await instagramApi.fetchWeeklyInsights(ig.igUserId, ig.accessToken, sinceUnix, untilUnix);
      const media = await instagramApi.fetchMediaSince(ig.igUserId, ig.accessToken, sinceUnix, untilUnix);

      let likesSum = 0, commentsSum = 0, sharesSum = 0, savesSum = 0;
      const newPosts = [];
      for (const m of media) {
        let extra = { shares: 0, saved: 0, reach: 0 };
        try { extra = await instagramApi.fetchMediaInsights(m.id, ig.accessToken); } catch (e) { /* segue sem insights desse post */ }
        likesSum += m.like_count || 0;
        commentsSum += m.comments_count || 0;
        sharesSum += extra.shares || 0;
        savesSum += extra.saved || 0;
        const engagementRate = extra.reach
          ? ((m.like_count || 0) + (m.comments_count || 0) + (extra.shares || 0) + (extra.saved || 0)) / extra.reach * 100
          : null;
        newPosts.push({
          id: store.newId(),
          weekStart,
          platform: 'instagram',
          tipo: m.media_type || '',
          formato: instagramApi.mediaFormatLabel(m.media_type, m.media_product_type),
          titulo: (m.caption || '').slice(0, 90) || '(sem legenda)',
          url: m.permalink || '',
          thumbnail: m.thumbnail_url || m.media_url || null,
          publishedAt: m.timestamp || '',
          likes: m.like_count || 0,
          comments: m.comments_count || 0,
          shares: extra.shares || 0,
          saves: extra.saved || 0,
          reach: extra.reach || 0,
          impressions: 0,
          views: 0,
          engagementRate,
          contentId: null
        });
      }

      const otherPosts = (await store.getPosts()).filter(p => !(p.weekStart === weekStart && p.platform === 'instagram'));
      await store.savePosts(otherPosts.concat(newPosts));

      const stories = await instagramApi.fetchStoriesSince(ig.igUserId, ig.accessToken, sinceUnix, untilUnix);
      let storyViews = 0, storyReplies = 0, storyExits = 0;
      stories.forEach(s => {
        const metrics = {};
        ((s.insights && s.insights.data) || []).forEach(m => { metrics[m.name] = (m.values || [])[0] ? m.values[0].value : 0; });
        storyViews += metrics.impressions || 0;
        storyReplies += metrics.replies || 0;
        storyExits += metrics.exits || 0;
      });

      patch.instagram = {
        followers: profile.followers_count,
        reach: insights.reach,
        impressions: insights.impressions,
        profileVisits: insights.profileVisits,
        likes: likesSum,
        comments: commentsSum,
        shares: sharesSum,
        saves: savesSum,
        source: 'auto'
      };
      patch.stories = { published: stories.length, views: storyViews, replies: storyReplies, exits: storyExits, source: 'auto' };
    } catch (e) {
      messages.push(`Instagram: falha ao buscar automaticamente — ${e.message}`);
    }
  } else {
    messages.push('Instagram não conectado — os números desta semana precisam ser lançados manualmente (ou conecte em Administração de Integrações).');
  }

  const yt = await integrationsStore.getYoutube();
  if (yt && yt.refreshToken) {
    try {
      const refreshed = await youtubeApi.refreshAccessToken(yt.refreshToken);
      const channel = await youtubeApi.fetchChannelPublicStats(yt.channelId);
      const analytics = await youtubeApi.fetchWeeklyAnalytics(refreshed.access_token, weekStart, weekEnd);
      patch.youtube = {
        subscribers: channel.subscribers,
        subscribersGained: analytics.subscribersGained,
        views: analytics.views,
        watchTimeHours: analytics.watchTimeHours,
        avgViewDurationSec: analytics.avgViewDurationSec,
        source: 'auto'
      };

      // Vídeos individuais da semana — pro ranking Top YouTube ficar automático,
      // não só o agregado do canal.
      try {
        const sinceDate = new Date(`${weekStart}T00:00:00-03:00`);
        const untilDate = new Date(`${weekEnd}T23:59:59-03:00`);
        const videos = await youtubeApi.fetchVideosPublishedInRange(yt.channelId, sinceDate, untilDate);
        const videoIds = videos.map(v => v.videoId);
        const publicStats = await youtubeApi.fetchVideoPublicStats(videoIds);
        const videoAnalytics = await youtubeApi.fetchVideoAnalytics(refreshed.access_token, videoIds, weekStart, weekEnd);

        const newYtPosts = videos.map(v => {
          const stats = publicStats[v.videoId] || { views: 0, likes: 0, comments: 0 };
          const vAnalytics = videoAnalytics[v.videoId] || { watchTimeMinutes: 0, avgViewDurationSec: 0 };
          return {
            id: store.newId(),
            weekStart,
            platform: 'youtube',
            tipo: 'video',
            formato: 'Vídeo',
            titulo: (v.title || '').slice(0, 90),
            url: `https://www.youtube.com/watch?v=${v.videoId}`,
            thumbnail: v.thumbnail,
            publishedAt: v.publishedAt || '',
            likes: stats.likes,
            comments: stats.comments,
            shares: 0,
            saves: 0,
            reach: 0,
            impressions: 0,
            views: stats.views,
            watchTimeMinutes: vAnalytics.watchTimeMinutes,
            avgViewDurationSec: vAnalytics.avgViewDurationSec,
            engagementRate: stats.views ? ((stats.likes + stats.comments) / stats.views) * 100 : null,
            contentId: null
          };
        });
        const otherYtPosts = (await store.getPosts()).filter(p => !(p.weekStart === weekStart && p.platform === 'youtube'));
        await store.savePosts(otherYtPosts.concat(newYtPosts));
      } catch (e) {
        messages.push(`YouTube: falha ao buscar vídeos individuais — ${e.message}`);
      }
    } catch (e) {
      messages.push(`YouTube: falha ao buscar automaticamente — ${e.message}`);
    }
  } else {
    messages.push('YouTube não conectado — os números desta semana precisam ser lançados manualmente (ou conecte em Administração de Integrações).');
  }

  // impressions/ctr do YouTube são sempre manuais (limitação da API) — nunca sobrescrever.
  const existing = await store.findSnapshot(weekStart);
  if (existing && existing.youtube) {
    if (existing.youtube.impressions != null) patch.youtube.impressions = existing.youtube.impressions;
    if (existing.youtube.ctr != null) patch.youtube.ctr = existing.youtube.ctr;
  }

  const snapshot = await store.upsertSnapshot(weekStart, patch);
  res.json({ snapshot, messages });
});

module.exports = router;
