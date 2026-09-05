// Guarda tokens de acesso do Instagram/YouTube. Nunca vai pro git — ver
// .gitignore — porque tem segredo (access/refresh token) dentro.
const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, '..', 'data', 'integrations.json');

function read() {
  try {
    return JSON.parse(fs.readFileSync(FILE, 'utf-8'));
  } catch (e) {
    return { instagram: null, youtube: null };
  }
}
function write(data) {
  fs.writeFileSync(FILE, JSON.stringify(data, null, 2), 'utf-8');
}

function getStatus() {
  const data = read();
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

function getInstagram() {
  return read().instagram;
}
function setInstagram(entry) {
  const data = read();
  data.instagram = entry;
  write(data);
}
function clearInstagram() {
  const data = read();
  data.instagram = null;
  write(data);
}

function getYoutube() {
  return read().youtube;
}
function setYoutube(entry) {
  const data = read();
  data.youtube = entry;
  write(data);
}
function clearYoutube() {
  const data = read();
  data.youtube = null;
  write(data);
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
