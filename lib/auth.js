// Controle de acesso simples: um único código de acesso (dono do app),
// sessão guardada em memória e um cookie httpOnly assinado. Não é um sistema
// de contas — o app hoje não tem nenhuma, e só uma pessoa precisa entrar
// na Performance e na administração de integrações.
const crypto = require('crypto');

const COOKIE_NAME = 'pf_session';
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 dias

const sessions = new Map(); // token -> expiresAt

function getAccessCode() {
  return process.env.PERFORMANCE_ACCESS_CODE || '';
}

function isConfigured() {
  return !!getAccessCode();
}

function parseCookies(req) {
  const header = req.headers.cookie;
  const out = {};
  if (!header) return out;
  header.split(';').forEach(pair => {
    const idx = pair.indexOf('=');
    if (idx === -1) return;
    const key = pair.slice(0, idx).trim();
    const val = pair.slice(idx + 1).trim();
    out[key] = decodeURIComponent(val);
  });
  return out;
}

function createSession() {
  const token = crypto.randomBytes(24).toString('hex');
  sessions.set(token, Date.now() + SESSION_TTL_MS);
  return token;
}

function destroySession(token) {
  sessions.delete(token);
}

function isValidSession(token) {
  if (!token) return false;
  const expiresAt = sessions.get(token);
  if (!expiresAt) return false;
  if (Date.now() > expiresAt) {
    sessions.delete(token);
    return false;
  }
  return true;
}

function currentToken(req) {
  return parseCookies(req)[COOKIE_NAME];
}

function isAuthenticated(req) {
  return isValidSession(currentToken(req));
}

function setSessionCookie(res, token) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.setHeader(
    'Set-Cookie',
    `${COOKIE_NAME}=${encodeURIComponent(token)}; HttpOnly; Path=/; Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}; SameSite=Lax${secure}`
  );
}

function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax`);
}

// Protege rotas de API: aceita sessão de navegador (cookie) OU um bearer
// token de automação (CRON_SECRET), usado pela rotina agendada em nuvem que
// não tem cookie de navegador.
function requireAuth(req, res, next) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.authorization || '';
  if (cronSecret && authHeader === `Bearer ${cronSecret}`) return next();
  if (isAuthenticated(req)) return next();
  return res.status(401).json({ error: 'not_authenticated' });
}

// Protege páginas HTML servidas diretamente (ex.: admin-integracoes.html).
function requirePageAuth(req, res, next) {
  if (isAuthenticated(req)) return next();
  return res.redirect('/login.html?next=' + encodeURIComponent(req.originalUrl));
}

module.exports = {
  isConfigured,
  getAccessCode,
  createSession,
  destroySession,
  isAuthenticated,
  currentToken,
  setSessionCookie,
  clearSessionCookie,
  requireAuth,
  requirePageAuth
};
