// Armazenamento chave-valor: usa Upstash Redis (API REST, HTTP puro — sem
// driver novo) quando configurado, senão cai para arquivo JSON local. Isso
// permite continuar rodando localmente sem precisar de conta nenhuma, e
// sobreviver a deploys/reinícios no Render sem disco persistente.
const fs = require('fs');
const path = require('path');

const KV_URL = process.env.UPSTASH_REDIS_REST_URL;
const KV_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const LOCAL_DIR = path.join(__dirname, '..', 'data');

function localFile(key) {
  return path.join(LOCAL_DIR, `${key}.json`);
}

async function get(key, fallback) {
  if (KV_URL) {
    try {
      const res = await fetch(`${KV_URL}/get/${key}`, {
        headers: { Authorization: `Bearer ${KV_TOKEN}` }
      });
      const json = await res.json();
      if (!res.ok || json.result === null || json.result === undefined) return fallback;
      return JSON.parse(json.result);
    } catch (e) {
      console.error(`kv.get(${key}) falhou, usando valor padrão:`, e.message);
      return fallback;
    }
  }
  try {
    return JSON.parse(fs.readFileSync(localFile(key), 'utf-8'));
  } catch (e) {
    return fallback;
  }
}

async function set(key, value) {
  if (KV_URL) {
    const res = await fetch(`${KV_URL}/set/${key}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${KV_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(value)
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Falha ao salvar "${key}" no Upstash: ${res.status} ${text}`);
    }
    return;
  }
  fs.writeFileSync(localFile(key), JSON.stringify(value, null, 2), 'utf-8');
}

module.exports = { get, set };
