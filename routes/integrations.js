const express = require('express');
const crypto = require('crypto');
const integrationsStore = require('../lib/integrationsStore');
const instagramApi = require('../lib/instagramApi');
const youtubeApi = require('../lib/youtubeApi');
const { requireAuth } = require('../lib/auth');

const router = express.Router();
router.use(requireAuth);

// Estado do OAuth (anti-CSRF), só precisa viver alguns minutos.
const pendingStates = new Map();
function newState() {
  const state = crypto.randomBytes(16).toString('hex');
  pendingStates.set(state, Date.now() + 10 * 60 * 1000);
  return state;
}
function consumeState(state) {
  const expiresAt = pendingStates.get(state);
  pendingStates.delete(state);
  return !!expiresAt && Date.now() < expiresAt;
}

router.get('/status', async (req, res) => {
  res.json(await integrationsStore.getStatus());
});

// ---------- Instagram ----------

router.get('/instagram/connect', (req, res) => {
  try {
    const url = instagramApi.getAuthorizeUrl(newState());
    res.redirect(url);
  } catch (e) {
    res.redirect(`/admin-integracoes.html?error=${encodeURIComponent(e.message)}`);
  }
});

router.get('/instagram/callback', async (req, res) => {
  const { code, state, error_description: metaError } = req.query;
  if (metaError) return res.redirect(`/admin-integracoes.html?error=${encodeURIComponent(metaError)}`);
  if (!code || !consumeState(state)) {
    return res.redirect('/admin-integracoes.html?error=' + encodeURIComponent('Sessão de autorização inválida ou expirada. Tente conectar novamente.'));
  }
  try {
    const short = await instagramApi.exchangeCodeForShortToken(code);
    const long = await instagramApi.exchangeForLongLivedToken(short.access_token);
    const preferredUsername = process.env.INSTAGRAM_USERNAME || 'prleofelix';
    const account = await instagramApi.findInstagramAccount(long.accessToken, preferredUsername);
    await integrationsStore.setInstagram({
      accessToken: long.accessToken,
      expiresAt: Date.now() + (long.expiresInSec || 60 * 24 * 60 * 60) * 1000,
      igUserId: account.igUserId,
      pageId: account.pageId,
      accountName: `@${account.igUsername} (${account.pageName})`
    });
    if (!account.matched) {
      const warning = `Conectamos @${account.igUsername} porque @${preferredUsername} não apareceu entre as Páginas que você administra nesta autorização (encontradas: ${account.candidates.join(', ') || 'nenhuma'}). Desconecte e conecte de novo, ou verifique se @${preferredUsername} está entre as contas do Instagram vinculadas às suas Páginas do Facebook.`;
      return res.redirect(`/admin-integracoes.html?warning=${encodeURIComponent(warning)}`);
    }
    res.redirect('/admin-integracoes.html?connected=instagram');
  } catch (e) {
    res.redirect(`/admin-integracoes.html?error=${encodeURIComponent(e.message)}`);
  }
});

router.post('/instagram/disconnect', async (req, res) => {
  await integrationsStore.clearInstagram();
  res.json({ ok: true });
});

// ---------- YouTube ----------

router.get('/youtube/connect', (req, res) => {
  try {
    const url = youtubeApi.getAuthorizeUrl(newState());
    res.redirect(url);
  } catch (e) {
    res.redirect(`/admin-integracoes.html?error=${encodeURIComponent(e.message)}`);
  }
});

router.get('/youtube/callback', async (req, res) => {
  const { code, state, error } = req.query;
  if (error) return res.redirect(`/admin-integracoes.html?error=${encodeURIComponent(error)}`);
  if (!code || !consumeState(state)) {
    return res.redirect('/admin-integracoes.html?error=' + encodeURIComponent('Sessão de autorização inválida ou expirada. Tente conectar novamente.'));
  }
  try {
    const tokens = await youtubeApi.exchangeCodeForTokens(code);
    if (!tokens.refresh_token) {
      return res.redirect('/admin-integracoes.html?error=' + encodeURIComponent('O Google não retornou um refresh token. Desconecte o acesso do app em myaccount.google.com/permissions e tente conectar de novo.'));
    }
    const channel = await youtubeApi.fetchMyChannelId(tokens.access_token);
    await integrationsStore.setYoutube({
      refreshToken: tokens.refresh_token,
      channelId: channel.channelId,
      accountName: channel.title
    });
    res.redirect('/admin-integracoes.html?connected=youtube');
  } catch (e) {
    res.redirect(`/admin-integracoes.html?error=${encodeURIComponent(e.message)}`);
  }
});

router.post('/youtube/disconnect', async (req, res) => {
  await integrationsStore.clearYoutube();
  res.json({ ok: true });
});

module.exports = router;
