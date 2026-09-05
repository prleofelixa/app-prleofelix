const express = require('express');
const auth = require('../lib/auth');

const router = express.Router();

router.get('/status', (req, res) => {
  res.json({ configured: auth.isConfigured(), authenticated: auth.isAuthenticated(req) });
});

router.post('/login', (req, res) => {
  if (!auth.isConfigured()) {
    return res.status(500).json({ error: 'Código de acesso ainda não configurado no servidor (PERFORMANCE_ACCESS_CODE).' });
  }
  const { code } = req.body || {};
  if (!code || code !== auth.getAccessCode()) {
    return res.status(401).json({ error: 'Código incorreto.' });
  }
  const token = auth.createSession();
  auth.setSessionCookie(res, token);
  res.json({ ok: true });
});

router.post('/logout', (req, res) => {
  auth.destroySession(auth.currentToken(req));
  auth.clearSessionCookie(res);
  res.json({ ok: true });
});

module.exports = router;
