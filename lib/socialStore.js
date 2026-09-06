// Acesso aos dados de performance social (snapshots semanais + posts),
// cruzando com o calendário de conteúdo já existente (data/content.json).
// Centraliza a lógica pra que routes/social.js fique só de orquestração HTTP.
//
// Snapshots e posts vão pro Upstash Redis (via lib/kv.js) quando configurado,
// pra sobreviver a deploys/reinícios sem disco persistente; senão caem para
// arquivo local. content.json continua sempre local (fora do escopo desta
// mudança — é o calendário de conteúdo já existente no app).
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const kv = require('./kv');
const { diagnose } = require('./socialDiagnostics');
const weekUtils = require('./weekUtils');

const CONTENT_FILE = path.join(__dirname, '..', 'data', 'content.json');
const SNAPSHOTS_KEY = 'social-snapshots';
const POSTS_KEY = 'social-posts';

function newId() {
  return crypto.randomBytes(8).toString('hex');
}

function getContentItems() {
  try {
    return JSON.parse(fs.readFileSync(CONTENT_FILE, 'utf-8'));
  } catch (e) {
    return [];
  }
}

async function getSnapshots() {
  return kv.get(SNAPSHOTS_KEY, []);
}
async function saveSnapshots(list) {
  return kv.set(SNAPSHOTS_KEY, list);
}
async function getPosts() {
  return kv.get(POSTS_KEY, []);
}
async function savePosts(list) {
  return kv.set(POSTS_KEY, list);
}

async function findSnapshot(weekStart) {
  const list = await getSnapshots();
  return list.find(s => s.weekStart === weekStart) || null;
}

async function earliestWeekStart() {
  const list = await getSnapshots();
  if (!list.length) return null;
  return list.map(s => s.weekStart).sort()[0];
}

function computeEngagementRate({ likes = 0, comments = 0, shares = 0, saves = 0 } = {}, reach) {
  if (!reach) return null;
  return ((Number(likes) + Number(comments) + Number(shares) + Number(saves)) / Number(reach)) * 100;
}

function contentItemsForWeek(weekStart) {
  const weekEnd = weekUtils.weekEndFor(weekStart);
  return getContentItems().filter(i => {
    const d = (i.dataPublicacao || '').split('T')[0];
    return d && d >= weekStart && d <= weekEnd;
  });
}

function contentByIdMap() {
  const map = {};
  getContentItems().forEach(i => { map[i.id] = i; });
  return map;
}

async function postsForWeek(weekStart) {
  const posts = await getPosts();
  return posts.filter(p => p.weekStart === weekStart);
}

// Recalcula campos derivados (delta/%/engajamento) e o diagnóstico, e grava.
// Único caminho de escrita de snapshot — usado pelo salvamento manual E pela
// busca automática, pra nunca duplicar a regra de negócio.
async function upsertSnapshot(weekStart, patch) {
  const list = await getSnapshots();
  const idx = list.findIndex(s => s.weekStart === weekStart);
  const now = new Date().toISOString();
  const base = idx === -1
    ? {
      weekStart,
      weekEnd: weekUtils.weekEndFor(weekStart),
      instagram: {},
      stories: {},
      youtube: {},
      notasManuais: '',
      diagnostico: '',
      recomendacoes: [],
      createdAt: now
    }
    : list[idx];

  const merged = {
    ...base,
    instagram: { ...base.instagram, ...(patch.instagram || {}) },
    stories: { ...base.stories, ...(patch.stories || {}) },
    youtube: { ...base.youtube, ...(patch.youtube || {}) },
    notasManuais: patch.notasManuais !== undefined ? patch.notasManuais : base.notasManuais,
    updatedAt: now
  };

  const prevWeekStart = weekUtils.previousWeekStart(weekStart);
  const previous = await findSnapshot(prevWeekStart);

  if (merged.instagram.followers != null && previous && previous.instagram.followers != null) {
    merged.instagram.followersDelta = merged.instagram.followers - previous.instagram.followers;
    if (patch.instagram?.followersGrowthPct == null) {
      merged.instagram.followersGrowthPct = previous.instagram.followers
        ? (merged.instagram.followersDelta / previous.instagram.followers) * 100
        : null;
    }
  }
  if (patch.instagram?.engagementRate == null && merged.instagram.reach) {
    merged.instagram.engagementRate = computeEngagementRate(merged.instagram, merged.instagram.reach);
  }

  const posts = await postsForWeek(weekStart);
  const diagResult = diagnose({
    current: merged,
    previous,
    posts,
    contentItemsThisWeek: contentItemsForWeek(weekStart),
    contentItemsPrevWeek: contentItemsForWeek(prevWeekStart),
    contentById: contentByIdMap()
  });
  merged.diagnostico = diagResult.diagnostico;
  merged.recomendacoes = diagResult.recomendacoes;
  merged.diagnosticoItems = diagResult.items;
  merged.score = diagResult.score;

  if (idx === -1) list.push(merged); else list[idx] = merged;
  await saveSnapshots(list);
  return merged;
}

async function getReport(weekStart) {
  const current = await findSnapshot(weekStart);
  const previous = await findSnapshot(weekUtils.previousWeekStart(weekStart));
  const posts = await postsForWeek(weekStart);
  return { weekStart, weekEnd: weekUtils.weekEndFor(weekStart), current, previous, posts };
}

async function buildMonthOverview(month) {
  const weekStarts = weekUtils.weekStartsInMonth(month);
  const all = await getSnapshots();
  const byWeek = new Map(all.map(s => [s.weekStart, s]));
  const found = weekStarts.map(ws => byWeek.get(ws)).filter(Boolean);
  const missingWeeks = weekStarts.filter(ws => !byWeek.has(ws));

  if (!found.length) {
    return { month, weeksExpected: weekStarts, weeksFound: [], missingWeeks, totals: null };
  }

  const first = found[0];
  const last = found[found.length - 1];
  const sum = (section, key) => found.reduce((acc, s) => acc + (Number(s[section] && s[section][key]) || 0), 0);
  const avg = (section, key) => {
    const vals = found.map(s => s[section] && s[section][key]).filter(v => v !== null && v !== undefined);
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  };

  return {
    month,
    weeksExpected: weekStarts,
    weeksFound: found.map(s => s.weekStart),
    missingWeeks,
    instagram: {
      followersStart: first.instagram.followers ?? null,
      followersEnd: last.instagram.followers ?? null,
      followersGrowth: (first.instagram.followers != null && last.instagram.followers != null)
        ? last.instagram.followers - first.instagram.followers
        : null,
      reach: sum('instagram', 'reach'),
      impressions: sum('instagram', 'impressions'),
      likes: sum('instagram', 'likes'),
      comments: sum('instagram', 'comments'),
      shares: sum('instagram', 'shares'),
      saves: sum('instagram', 'saves'),
      avgEngagementRate: avg('instagram', 'engagementRate')
    },
    stories: {
      published: sum('stories', 'published'),
      views: sum('stories', 'views')
    },
    youtube: {
      subscribersStart: first.youtube.subscribers ?? null,
      subscribersEnd: last.youtube.subscribers ?? null,
      subscribersGained: sum('youtube', 'subscribersGained'),
      views: sum('youtube', 'views'),
      watchTimeHours: sum('youtube', 'watchTimeHours')
    }
  };
}

async function getTrends(weeks = 8) {
  const list = await getSnapshots();
  return list
    .sort((a, b) => a.weekStart.localeCompare(b.weekStart))
    .slice(-weeks);
}

module.exports = {
  getSnapshots,
  findSnapshot,
  earliestWeekStart,
  upsertSnapshot,
  getReport,
  buildMonthOverview,
  getTrends,
  getPosts,
  postsForWeek,
  savePosts,
  newId,
  contentByIdMap
};
