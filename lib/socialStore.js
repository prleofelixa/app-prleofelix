// Acesso aos dados de performance social (snapshots semanais + posts),
// cruzando com o calendário de conteúdo já existente (data/content.json).
// Centraliza a lógica pra que routes/social.js fique só de orquestração HTTP.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { diagnose } = require('./socialDiagnostics');
const weekUtils = require('./weekUtils');

const DATA_DIR = path.join(__dirname, '..', 'data');
const SNAPSHOTS_FILE = path.join(DATA_DIR, 'social-snapshots.json');
const POSTS_FILE = path.join(DATA_DIR, 'social-posts.json');
const CONTENT_FILE = path.join(DATA_DIR, 'content.json');

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf-8'));
  } catch (e) {
    return fallback;
  }
}
function writeJson(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf-8');
}

function newId() {
  return crypto.randomBytes(8).toString('hex');
}

function getSnapshots() {
  return readJson(SNAPSHOTS_FILE, []);
}
function saveSnapshots(list) {
  writeJson(SNAPSHOTS_FILE, list);
}
function getPosts() {
  return readJson(POSTS_FILE, []);
}
function savePosts(list) {
  writeJson(POSTS_FILE, list);
}
function getContentItems() {
  return readJson(CONTENT_FILE, []);
}

function findSnapshot(weekStart) {
  return getSnapshots().find(s => s.weekStart === weekStart) || null;
}

function earliestWeekStart() {
  const list = getSnapshots();
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

function postsForWeek(weekStart) {
  return getPosts().filter(p => p.weekStart === weekStart);
}

// Recalcula campos derivados (delta/%/engajamento) e o diagnóstico, e grava.
// Único caminho de escrita de snapshot — usado pelo salvamento manual E pela
// busca automática, pra nunca duplicar a regra de negócio.
function upsertSnapshot(weekStart, patch) {
  const list = getSnapshots();
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
  const previous = findSnapshot(prevWeekStart);

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

  const posts = postsForWeek(weekStart);
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

  if (idx === -1) list.push(merged); else list[idx] = merged;
  saveSnapshots(list);
  return merged;
}

function getReport(weekStart) {
  const current = findSnapshot(weekStart);
  const previous = findSnapshot(weekUtils.previousWeekStart(weekStart));
  const posts = postsForWeek(weekStart);
  return { weekStart, weekEnd: weekUtils.weekEndFor(weekStart), current, previous, posts };
}

function buildMonthOverview(month) {
  const weekStarts = weekUtils.weekStartsInMonth(month);
  const found = weekStarts.map(ws => findSnapshot(ws)).filter(Boolean);
  const missingWeeks = weekStarts.filter(ws => !findSnapshot(ws));

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

function getTrends(weeks = 8) {
  return getSnapshots()
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
