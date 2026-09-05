require('dotenv').config();

const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');

const { requirePageAuth } = require('./lib/auth');
const authRoutes = require('./routes/auth');
const socialRoutes = require('./routes/social');
const integrationsRoutes = require('./routes/integrations');

const DATA_DIR = path.join(__dirname, 'data');
const UPLOADS_DIR = path.join(__dirname, 'uploads');
const CONTENT_FILE = path.join(DATA_DIR, 'content.json');
const IDEAS_FILE = path.join(DATA_DIR, 'ideas.json');
const SOCIAL_SNAPSHOTS_FILE = path.join(DATA_DIR, 'social-snapshots.json');
const SOCIAL_POSTS_FILE = path.join(DATA_DIR, 'social-posts.json');
const INTEGRATIONS_FILE = path.join(DATA_DIR, 'integrations.json');

// Pasta da equipe de conteúdo (agentes .claude), pasta irmã de APP PRLEOFELIX
const EQUIPE_AGENCIA_DIR = path.resolve(__dirname, '..', 'BIBLIOTECA DE CONTEÚDO', 'equipe-agencia');
const CONTENT_TEAM_DIR = path.join(EQUIPE_AGENCIA_DIR, '.claude', 'content-team');
const GERAR_MAX_BUDGET_USD = '5';

// Lista fechada de arquivos que podem ser lidos — evita path traversal via req.params.
const ARTIFACT_FILES = {
  briefing: 'briefing.md',
  research: 'research.md',
  hooks: 'hooks.md',
  script: 'script.md',
  'design-brief': 'design-brief.md',
  publishing: 'publishing.md',
  performance: 'performance.md'
};

if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
[SOCIAL_SNAPSHOTS_FILE, SOCIAL_POSTS_FILE].forEach(f => {
  if (!fs.existsSync(f)) fs.writeFileSync(f, '[]', 'utf-8');
});
if (!fs.existsSync(INTEGRATIONS_FILE)) {
  fs.writeFileSync(INTEGRATIONS_FILE, JSON.stringify({ instagram: null, youtube: null }, null, 2), 'utf-8');
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf-8'));
  } catch (e) {
    return [];
  }
}

function writeJson(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf-8');
}

function newId() {
  return crypto.randomBytes(8).toString('hex');
}

function parsePillars(raw) {
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch (e) {
    return [];
  }
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => {
    const safeName = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}${path.extname(file.originalname)}`;
    cb(null, safeName);
  }
});
const upload = multer({ storage, limits: { fileSize: 500 * 1024 * 1024 } });

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(UPLOADS_DIR));

// Página de administração de integrações é restrita ao dono do app —
// protegida antes do static, senão qualquer um poderia abrir o HTML direto.
app.get('/admin-integracoes.html', requirePageAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin-integracoes.html'));
});

app.use(express.static(path.join(__dirname, 'public')));

app.use('/api/auth', authRoutes);
app.use('/api/social', socialRoutes);
app.use('/api/integrations', integrationsRoutes);

// ---------- CONTEÚDO ----------

app.get('/api/content', (req, res) => {
  const items = readJson(CONTENT_FILE);
  res.json(items);
});

app.post('/api/content', upload.array('arquivos', 20), (req, res) => {
  const items = readJson(CONTENT_FILE);
  const files = (req.files || []).map(f => ({
    filename: f.filename,
    originalname: f.originalname,
    url: `/uploads/${f.filename}`
  }));
  const now = new Date().toISOString();
  const item = {
    id: newId(),
    tipo: req.body.tipo || '',
    veiculo: req.body.veiculo || '',
    pilaresHammer: parsePillars(req.body.pilaresHammer),
    titulo: req.body.titulo || '',
    descricao: req.body.descricao || '',
    roteiro: req.body.roteiro || '',
    link: req.body.link || '',
    tags: req.body.tags || '',
    dataPublicacao: req.body.dataPublicacao || '',
    status: req.body.status || 'PENDENTE',
    arquivos: files,
    archived: false,
    createdAt: now,
    updatedAt: now
  };
  items.push(item);
  writeJson(CONTENT_FILE, items);
  res.status(201).json(item);
});

app.put('/api/content/:id', upload.array('arquivos', 20), (req, res) => {
  const items = readJson(CONTENT_FILE);
  const idx = items.findIndex(i => i.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Conteúdo não encontrado' });

  const existing = items[idx];
  let arquivos = existing.arquivos || [];

  if (req.body.removeFiles) {
    const toRemove = JSON.parse(req.body.removeFiles);
    arquivos = arquivos.filter(a => {
      if (toRemove.includes(a.filename)) {
        const fp = path.join(UPLOADS_DIR, a.filename);
        if (fs.existsSync(fp)) fs.unlinkSync(fp);
        return false;
      }
      return true;
    });
  }

  const newFiles = (req.files || []).map(f => ({
    filename: f.filename,
    originalname: f.originalname,
    url: `/uploads/${f.filename}`
  }));
  arquivos = arquivos.concat(newFiles);

  const updated = {
    ...existing,
    tipo: req.body.tipo ?? existing.tipo,
    veiculo: req.body.veiculo ?? existing.veiculo,
    pilaresHammer: req.body.pilaresHammer ? parsePillars(req.body.pilaresHammer) : (existing.pilaresHammer || (existing.pilarHammer ? [existing.pilarHammer] : [])),
    titulo: req.body.titulo ?? existing.titulo,
    descricao: req.body.descricao ?? existing.descricao,
    roteiro: req.body.roteiro ?? existing.roteiro,
    link: req.body.link ?? existing.link,
    tags: req.body.tags ?? existing.tags,
    dataPublicacao: req.body.dataPublicacao ?? existing.dataPublicacao,
    status: req.body.status ?? existing.status,
    arquivos,
    updatedAt: new Date().toISOString()
  };
  items[idx] = updated;
  writeJson(CONTENT_FILE, items);
  res.json(updated);
});

app.patch('/api/content/:id/archive', (req, res) => {
  const items = readJson(CONTENT_FILE);
  const idx = items.findIndex(i => i.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Conteúdo não encontrado' });
  items[idx].archived = true;
  items[idx].updatedAt = new Date().toISOString();
  writeJson(CONTENT_FILE, items);
  res.json(items[idx]);
});

app.patch('/api/content/:id/unarchive', (req, res) => {
  const items = readJson(CONTENT_FILE);
  const idx = items.findIndex(i => i.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Conteúdo não encontrado' });
  items[idx].archived = false;
  items[idx].updatedAt = new Date().toISOString();
  writeJson(CONTENT_FILE, items);
  res.json(items[idx]);
});

app.delete('/api/content/:id', (req, res) => {
  const items = readJson(CONTENT_FILE);
  const idx = items.findIndex(i => i.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Conteúdo não encontrado' });
  const [removed] = items.splice(idx, 1);
  (removed.arquivos || []).forEach(a => {
    const fp = path.join(UPLOADS_DIR, a.filename);
    if (fs.existsSync(fp)) fs.unlinkSync(fp);
  });
  writeJson(CONTENT_FILE, items);
  res.json({ ok: true });
});

// ---------- GERAR CONTEÚDO (equipe de agentes) ----------
// Roda o comando /criar-conteudo (ou uma resposta de continuação) via CLI do
// Claude Code, na pasta equipe-agencia, e transmite os eventos em tempo real
// via Server-Sent Events. Nada aqui publica nada sozinho — é o mesmo
// pipeline de agentes que já para para aprovação humana quando necessário.
app.post('/api/generate/run', (req, res) => {
  const prompt = (req.body.prompt || '').toString();
  const resume = !!req.body.resume;
  const sessionId = (req.body.sessionId || '').toString();

  if (!prompt.trim()) {
    return res.status(400).json({ error: 'Mensagem vazia.' });
  }
  if (resume && !sessionId) {
    return res.status(400).json({ error: 'sessionId é obrigatório para continuar uma conversa.' });
  }

  const newSessionId = sessionId || crypto.randomUUID();

  const args = [
    '-p',
    '--output-format', 'stream-json',
    '--verbose',
    '--permission-mode', 'acceptEdits',
    '--max-budget-usd', GERAR_MAX_BUDGET_USD
  ];
  if (resume) {
    args.push('--resume', sessionId);
  } else {
    args.push('--session-id', newSessionId);
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no'
  });
  res.write(`data: ${JSON.stringify({ type: '__session__', sessionId: newSessionId })}\n\n`);

  const child = spawn('claude', args, { cwd: EQUIPE_AGENCIA_DIR, shell: true, windowsHide: true });

  child.stdin.write(prompt, 'utf-8');
  child.stdin.end();

  let buffer = '';
  child.stdout.on('data', (chunk) => {
    buffer += chunk.toString('utf-8');
    const lines = buffer.split('\n');
    buffer = lines.pop();
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed) res.write(`data: ${trimmed}\n\n`);
    }
  });

  child.stderr.on('data', (chunk) => {
    res.write(`data: ${JSON.stringify({ type: 'stderr', text: chunk.toString('utf-8') })}\n\n`);
  });

  child.on('error', (err) => {
    res.write(`data: ${JSON.stringify({ type: 'stderr', text: 'Falha ao iniciar o Claude Code: ' + err.message })}\n\n`);
    res.write(`data: ${JSON.stringify({ type: '__done__', sessionId: newSessionId, exitCode: -1 })}\n\n`);
    res.end();
  });

  child.on('close', (code) => {
    res.write(`data: ${JSON.stringify({ type: '__done__', sessionId: newSessionId, exitCode: code })}\n\n`);
    res.end();
  });

  res.on('close', () => {
    if (!child.killed && !res.writableEnded) child.kill();
  });
});

// Lê um dos arquivos gerados pela equipe (só leitura, lista fechada de nomes).
app.get('/api/generate/artifact/:name', (req, res) => {
  const filename = ARTIFACT_FILES[req.params.name];
  if (!filename) return res.status(404).json({ error: 'Arquivo não reconhecido.' });
  const filePath = path.join(CONTENT_TEAM_DIR, filename);
  fs.readFile(filePath, 'utf-8', (err, data) => {
    if (err) return res.status(404).json({ error: 'Esse arquivo ainda não foi gerado neste ciclo.' });
    let updatedAt = null;
    try { updatedAt = fs.statSync(filePath).mtime; } catch (e) {}
    res.json({ content: data, updatedAt });
  });
});

// ---------- REPOSITÓRIO DE IDEIAS ----------

app.get('/api/ideas', (req, res) => {
  res.json(readJson(IDEAS_FILE));
});

app.post('/api/ideas', (req, res) => {
  const items = readJson(IDEAS_FILE);
  const now = new Date().toISOString();
  const item = {
    id: newId(),
    titulo: req.body.titulo || '',
    descricao: req.body.descricao || '',
    link: req.body.link || '',
    createdAt: now,
    updatedAt: now
  };
  items.push(item);
  writeJson(IDEAS_FILE, items);
  res.status(201).json(item);
});

app.put('/api/ideas/:id', (req, res) => {
  const items = readJson(IDEAS_FILE);
  const idx = items.findIndex(i => i.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Ideia não encontrada' });
  items[idx] = {
    ...items[idx],
    titulo: req.body.titulo ?? items[idx].titulo,
    descricao: req.body.descricao ?? items[idx].descricao,
    link: req.body.link ?? items[idx].link,
    updatedAt: new Date().toISOString()
  };
  writeJson(IDEAS_FILE, items);
  res.json(items[idx]);
});

app.delete('/api/ideas/:id', (req, res) => {
  const items = readJson(IDEAS_FILE);
  const idx = items.findIndex(i => i.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Ideia não encontrada' });
  items.splice(idx, 1);
  writeJson(IDEAS_FILE, items);
  res.json({ ok: true });
});

const PORT = process.env.PORT || 4173;
app.listen(PORT, () => {
  console.log(`\nPainel PrLeofelix rodando em http://localhost:${PORT}\n`);
});
