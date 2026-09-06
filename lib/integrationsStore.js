// Guarda tokens de acesso do Instagram/YouTube. Vai pro Upstash Redis (via
// lib/kv.js) quando configurado — sem isso, um deploy no Render sem disco
// persistente apaga os tokens a cada atualização de código. Nunca vai pro
// git — ver .gitignore — porque tem segredo (access/refresh token) dentro.
const KEY = 'integrations';
const kv = require('./kv');

async function read() {
  return kv.get(KEY, { instagram: null, youtube: null });
}
async function write(data) {
  return kv.set(KEY, data);
}

async function getStatus() {
  const data = await read();
  const now = Date.now();
  const summarize = (entry) => {
    if (!entry) return { connected: false };
    const expiresAt = entry.expiresAt || null;
    return {
      connected: true,
      accountName: entry.accountName || null,
      expiresAt,
      expiresSoon: expiresAt ? (expiresAt - now) < 7 * 24 * 60 * 60 * 1000 : false,
      expired: expiresAt ? now > expiresAt : false
    };
  };
  return { instagram: summarize(data.instagram), youtube: summarize(data.youtube) };
}

async function getInstagram() {
  return (await read()).instagram;
}
async function setInstagram(entry) {
  const data = await read();
  data.instagram = entry;
  await write(data);
}
async function clearInstagram() {
  const data = await read();
  data.instagram = null;
  await write(data);
}

async function getYoutube() {
  return (await read()).youtube;
}
async function setYoutube(entry) {
  const data = await read();
  data.youtube = entry;
  await write(data);
}
async function clearYoutube() {
  const data = await read();
  data.youtube = null;
  await write(data);
}

module.exports = {
  getStatus,
  getInstagram,
  setInstagram,
  clearInstagram,
  getYoutube,
  setYoutube,
  clearYoutube
};
