// Motor de diagnóstico por regras (sem IA generativa) — usado tanto pelo
// lançamento manual quanto pela busca automática, pra nunca duplicar a
// lógica de negócio entre os dois caminhos.
//
// Devolve os insights em formato ESTRUTURADO (items[]), não só um bloco de
// texto — é isso que alimenta o Diagnóstico Executivo, os Alertas, a Leitura
// da Semana e o Score ao mesmo tempo no frontend, sem duplicar a regra em
// vários lugares. `diagnostico` (string) continua existindo só por
// compatibilidade com o que já está gravado no histórico.

function pctChange(curr, prev) {
  if (curr === undefined || curr === null) return null;
  if (prev === undefined || prev === null || prev === 0) return null;
  return ((curr - prev) / Math.abs(prev)) * 100;
}

function fmtPct(n, digits = 1) {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  const sign = n > 0 ? '+' : '';
  return `${sign}${n.toFixed(digits)}%`;
}

function fmtNum(n) {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  return Number(n).toLocaleString('pt-BR');
}

function isFilled(v) {
  return v !== null && v !== undefined && v !== '';
}

function pillarLabel(contentItem) {
  if (!contentItem) return null;
  const list = contentItem.pilaresHammer || (contentItem.pilarHammer ? [contentItem.pilarHammer] : []);
  return list.length ? list.join(', ') : null;
}

// Só Instagram entra nesse ranking — a taxa de engajamento do YouTube
// (curtidas+comentários / views) não é comparável na mesma escala da do
// Instagram (curtidas+comentários+compart.+salvos / alcance). O YouTube já
// tem seu próprio Top de vídeos por visualizações.
function bestAndWorstPost(posts) {
  const withRate = posts
    .filter(p => p.platform === 'instagram')
    .map(p => ({ ...p, _rate: p.engagementRate ?? null }))
    .filter(p => p._rate !== null);
  if (!withRate.length) return { best: null, worst: null };
  const sorted = [...withRate].sort((a, b) => b._rate - a._rate);
  return { best: sorted[0], worst: sorted.length > 1 ? sorted[sorted.length - 1] : null };
}

function diagnose({ current, previous, posts = [], contentItemsThisWeek = [], contentItemsPrevWeek = [], contentById = {} }) {
  const items = []; // { key, emoji, label, tone: 'good'|'warn'|'neutral', text }
  const recomendacoes = [];
  const push = (key, emoji, label, tone, text) => items.push({ key, emoji, label, tone, text });

  const ig = current.instagram || {};
  const igPrev = previous ? previous.instagram || {} : {};
  const st = current.stories || {};
  const stPrev = previous ? previous.stories || {} : {};
  const yt = current.youtube || {};
  const ytPrev = previous ? previous.youtube || {} : {};

  const postsThisWeek = contentItemsThisWeek.length;
  const postsPrevWeek = contentItemsPrevWeek.length;

  // ---------- 1. Crescimento de seguidores ----------
  if (!previous) {
    push('crescimento', '📈', 'Crescimento', 'neutral',
      `primeira semana registrada (${fmtNum(ig.followers)} seguidores). Ainda não há semana anterior para comparar — a partir da próxima semana o relatório passa a mostrar evolução.`);
  } else {
    const growthPct = isFilled(ig.followersGrowthPct) ? ig.followersGrowthPct : pctChange(ig.followers, igPrev.followers);
    const prevGrowthPct = isFilled(igPrev.followersGrowthPct) ? igPrev.followersGrowthPct : null;
    const growthDeltaVsPrevWeek = prevGrowthPct !== null && growthPct !== null ? growthPct - prevGrowthPct : null;
    const churnDetail = isFilled(ig.newFollowers) && isFilled(ig.lostFollowers)
      ? ` ${fmtNum(ig.newFollowers)} começaram a seguir e ${fmtNum(ig.lostFollowers)} deixaram de seguir nesta semana.`
      : '';

    if (growthPct === null) {
      push('crescimento', '📈', 'Crescimento', 'neutral', 'sem número de seguidores suficiente para calcular a variação desta semana.');
    } else if (growthPct < 0) {
      push('crescimento', '📈', 'Crescimento', 'warn',
        `perda de seguidores esta semana (${fmtPct(growthPct)}, de ${fmtNum(igPrev.followers)} para ${fmtNum(ig.followers)}).${churnDetail}`);
      recomendacoes.push('Queda de seguidores: revise se houve unfollow em massa após algum post polêmico, limpeza de contas inativas pelo Instagram, ou queda de alcance orgânico — compare com a seção de Alcance abaixo.');
    } else if (growthDeltaVsPrevWeek !== null && growthDeltaVsPrevWeek < -0.5) {
      push('crescimento', '📈', 'Crescimento', 'warn',
        `desacelerou em relação à semana passada — ${fmtPct(growthPct)} nesta semana contra ${fmtPct(prevGrowthPct)} na anterior (${fmtNum(ig.followers)} seguidores).${churnDetail}`);
      recomendacoes.push('Crescimento de seguidores desacelerou: teste um formato de maior alcance (Reels/Corte VOD) ou aumente a frequência de publicação para recuperar o ritmo.');
    } else if (growthDeltaVsPrevWeek !== null && growthDeltaVsPrevWeek > 0.5) {
      push('crescimento', '📈', 'Crescimento', 'good',
        `acelerou — ${fmtPct(growthPct)} nesta semana contra ${fmtPct(prevGrowthPct)} na anterior (${fmtNum(ig.followers)} seguidores). Vale identificar o que impulsionou e repetir a fórmula.${churnDetail}`);
    } else {
      push('crescimento', '📈', 'Crescimento', 'neutral', `estável, ${fmtPct(growthPct)} nesta semana (${fmtNum(ig.followers)} seguidores).${churnDetail}`);
    }
  }

  // ---------- 2. Alcance ----------
  const reachChange = previous ? pctChange(ig.reach, igPrev.reach) : null;
  const impressionsChange = previous ? pctChange(ig.impressions, igPrev.impressions) : null;

  if (previous && reachChange !== null) {
    if (reachChange <= -15) {
      const postDiff = postsThisWeek - postsPrevWeek;
      const causaVolume = postDiff < 0
        ? ` provavelmente ligado à queda no volume de publicações (${postsThisWeek} contra ${postsPrevWeek} na semana anterior)`
        : ' sem queda no volume de publicações, o que sugere perda de alcance orgânico (algoritmo ou formato) e não falta de conteúdo';
      push('alcance', '👁️', 'Alcance', 'warn', `caiu ${fmtPct(reachChange)} (${fmtNum(igPrev.reach)} → ${fmtNum(ig.reach)} contas alcançadas),${causaVolume}.`);
      recomendacoes.push(
        postDiff < 0
          ? 'Alcance caiu: retome a frequência de publicação da semana anterior — o Instagram reduz distribuição de perfis que publicam menos.'
          : 'Alcance caiu mesmo com o mesmo volume de posts: teste variar o formato (mais Reels/vídeo curto) e revise os ganchos dos primeiros 3 segundos.'
      );
    } else if (reachChange >= 15) {
      push('alcance', '👁️', 'Alcance', 'good', `cresceu ${fmtPct(reachChange)} (${fmtNum(igPrev.reach)} → ${fmtNum(ig.reach)} contas alcançadas). Vale revisar qual post puxou esse resultado.`);
    } else {
      push('alcance', '👁️', 'Alcance', 'neutral', `${fmtNum(ig.reach)} contas alcançadas (${fmtPct(reachChange)} vs. semana anterior), ${fmtNum(ig.impressions)} impressões (${fmtPct(impressionsChange)}).`);
    }
  } else {
    push('alcance', '👁️', 'Alcance', 'neutral', `${fmtNum(ig.reach)} contas alcançadas, ${fmtNum(ig.impressions)} impressões.`);
  }

  // ---------- 3. Engajamento ----------
  const engChange = previous ? pctChange(ig.engagementRate, igPrev.engagementRate) : null;
  if (previous && engChange !== null) {
    if (engChange <= -15) {
      const postDiff = postsThisWeek - postsPrevWeek;
      const causa = postDiff < 0
        ? `provavelmente por causa da queda no volume de publicações (${postsThisWeek} vs. ${postsPrevWeek} posts)`
        : 'não parece ser falta de volume (mesmo número de posts) — pode ser formato, horário ou tema dos posts';
      push('engajamento', '💬', 'Engajamento', 'warn', `taxa caiu ${fmtPct(engChange)} nesta semana (${causa}).`);
      recomendacoes.push(
        postDiff < 0
          ? 'Engajamento caiu: aumente a frequência de publicação — perfis inativos por mais tempo tendem a perder engajamento junto com o alcance.'
          : 'Engajamento caiu mesmo com volume igual: revise os últimos posts com pior desempenho e ajuste gancho/CTA/formato para a próxima semana.'
      );
    } else if (engChange >= 15) {
      push('engajamento', '💬', 'Engajamento', 'good', `taxa subiu ${fmtPct(engChange)} nesta semana — vale repetir o que funcionou nos posts de melhor desempenho.`);
    } else {
      push('engajamento', '💬', 'Engajamento', 'neutral', `taxa de ${(ig.engagementRate ?? 0).toFixed(2)}% (${fmtPct(engChange)} vs. semana anterior). ${fmtNum(ig.likes)} curtidas, ${fmtNum(ig.comments)} comentários, ${fmtNum(ig.shares)} compartilhamentos, ${fmtNum(ig.saves)} salvamentos.`);
    }
  } else {
    push('engajamento', '💬', 'Engajamento', 'neutral', `taxa de ${(ig.engagementRate ?? 0).toFixed(2)}%. ${fmtNum(ig.likes)} curtidas, ${fmtNum(ig.comments)} comentários, ${fmtNum(ig.shares)} compartilhamentos, ${fmtNum(ig.saves)} salvamentos.`);
  }

  // ---------- 4. Stories ----------
  if (!isFilled(st.published) || st.published === 0) {
    push('stories', '🎬', 'Stories', 'warn', 'nenhum story publicado nesta semana.');
    recomendacoes.push('Nenhum story na semana: stories mantêm a conta "quente" no algoritmo e geram alcance sem custo de produção alto — vale reservar 2-3 por semana, mesmo que sejam bastidores simples.');
  } else {
    const viewsChange = previous ? pctChange(st.views, stPrev.views) : null;
    const tone = viewsChange !== null && viewsChange <= -20 ? 'warn' : 'neutral';
    push('stories', '🎬', 'Stories', tone,
      `${fmtNum(st.published)} publicados, ${fmtNum(st.views)} visualizações${viewsChange !== null ? ` (${fmtPct(viewsChange)} vs. semana anterior)` : ''}, ${fmtNum(st.replies)} respostas.`);
    if (tone === 'warn') {
      recomendacoes.push('Visualizações de stories caíram bastante: experimente enquetes/caixinhas de pergunta para gerar mais interação e retenção no story.');
    }
  }

  // ---------- 5. Desempenho de conteúdo (melhor/pior post) ----------
  if (posts.length) {
    const { best, worst } = bestAndWorstPost(posts);
    if (best) {
      const pillar = pillarLabel(contentById[best.contentId]);
      push('melhor-post', '🏆', 'Melhor post da semana', 'good',
        `"${best.titulo}" (${best.platform === 'youtube' ? 'YouTube' : 'Instagram'}), taxa de engajamento ${best._rate.toFixed(2)}%${pillar ? `, pilar ${pillar}` : ''}.`);
    }
    if (worst) {
      push('pior-post', '📉', 'Post de menor desempenho', 'warn', `"${worst.titulo}", taxa de engajamento ${worst._rate.toFixed(2)}%.`);
      recomendacoes.push(`Compare "${worst.titulo}" com "${best ? best.titulo : 'o melhor post'}" — geralmente a diferença está no gancho dos primeiros segundos ou no tema.`);
    }
  }

  // ---------- 6. YouTube ----------
  const subsGrowthPct = previous ? pctChange(yt.subscribers, ytPrev.subscribers) : null;
  const watchTimeChange = previous ? pctChange(yt.watchTimeHours, ytPrev.watchTimeHours) : null;
  const retentionChange = previous ? pctChange(yt.avgViewDurationSec, ytPrev.avgViewDurationSec) : null;

  const ytTone = subsGrowthPct !== null && subsGrowthPct < 0 ? 'warn' : (subsGrowthPct !== null && subsGrowthPct > 15 ? 'good' : 'neutral');
  const ytNetSubs = isFilled(yt.subscribersGained) ? yt.subscribersGained - (yt.subscribersLost || 0) : null;
  const ytChurnDetail = isFilled(yt.subscribersGained) && isFilled(yt.subscribersLost)
    ? ` (${fmtNum(yt.subscribersGained)} ganhos, ${fmtNum(yt.subscribersLost)} cancelaram)`
    : '';
  push('youtube', '▶️', 'YouTube', ytTone,
    `${fmtNum(yt.subscribers)} inscritos (${ytNetSubs !== null ? `${ytNetSubs >= 0 ? '+' : ''}${fmtNum(ytNetSubs)} na semana${ytChurnDetail}` : 'sem dado de variação'}), ${fmtNum(yt.views)} visualizações, ${fmtNum(yt.watchTimeHours)}h de tempo de exibição.`);

  if (watchTimeChange !== null && watchTimeChange <= -15) {
    recomendacoes.push('Tempo de exibição no YouTube caiu: vídeos mais longos com boa retenção nos primeiros 30s ajudam o YouTube a recomendar mais — revise a retenção dos últimos vídeos.');
  }
  if (retentionChange !== null && retentionChange <= -15) {
    recomendacoes.push('Duração média de visualização caiu: o início do vídeo pode estar demorando a entregar valor — corte a introdução e vá direto ao gancho.');
  }
  if (!isFilled(yt.impressions) || !isFilled(yt.ctr)) {
    push('youtube-manual', '▶️', 'YouTube (dados manuais)', 'warn',
      'impressões e CTR (aba Alcance do YouTube Studio) ainda não foram lançados manualmente esta semana — esses dois campos não são expostos pela API pública e precisam ser preenchidos à mão.');
    recomendacoes.push('Lance manualmente impressões e CTR do YouTube Studio para o diagnóstico de YouTube ficar completo.');
  }

  // ---------- 7. Comparativo Instagram × YouTube ----------
  if (previous) {
    const igGrowth = isFilled(ig.followersGrowthPct) ? ig.followersGrowthPct : pctChange(ig.followers, igPrev.followers);
    if (igGrowth !== null && subsGrowthPct !== null && igGrowth !== subsGrowthPct) {
      const faster = igGrowth > subsGrowthPct ? 'Instagram' : 'YouTube';
      push('comparativo', '📊', 'Comparativo', 'neutral', `${faster} cresceu mais rápido esta semana (Instagram ${fmtPct(igGrowth)} vs. YouTube ${fmtPct(subsGrowthPct)}).`);
    }
  }

  if (!recomendacoes.length) {
    recomendacoes.push('Sem alertas relevantes nesta semana — manter a cadência e os formatos atuais.');
  }

  const diagnostico = items.map(i => `${i.emoji} ${i.label}: ${i.text}`).join('\n\n');
  const score = computeScore({ current, previous, contentItemsThisWeek, contentItemsPrevWeek });

  return { items, diagnostico, recomendacoes, score };
}

// ---------------------------------------------------------------------
// Score da semana — 0 a 100, calculado a partir de variações reais.
// Metodologia documentada aqui de propósito: fácil de reajustar os pesos
// sem mexer no resto do motor. Cada fator é normalizado de -50%..+50% de
// variação para 0..100 pontos (0%=50, "sem mudança"), depois combinado por
// média ponderada. Sem semana anterior não dá pra calcular nenhum fator —
// retorna { insufficient: true } em vez de inventar um número.
// ---------------------------------------------------------------------
const SCORE_WEIGHTS = {
  instagram: { crescimento: 0.30, alcance: 0.25, engajamento: 0.35, consistencia: 0.10 },
  // Sem fator de consistência pro YouTube por enquanto: exigiria comparar o
  // nº de vídeos publicados com a semana anterior, dado que ainda não temos
  // de forma confiável nesse ponto do pipeline.
  youtube: { crescimento: 0.35, visualizacoes: 0.35, consumo: 0.30 }
};

function normalizeDelta(pct) {
  if (pct === null || pct === undefined) return null;
  const clamped = Math.max(-50, Math.min(50, pct));
  return 50 + clamped;
}

function weightedAvg(parts) {
  const valid = parts.filter(p => p.value !== null && p.value !== undefined);
  if (!valid.length) return null;
  const totalWeight = valid.reduce((s, p) => s + p.weight, 0);
  const sum = valid.reduce((s, p) => s + p.value * p.weight, 0);
  return Math.round(sum / totalWeight);
}

function computeScore({ current, previous, contentItemsThisWeek = [], contentItemsPrevWeek = [] }) {
  if (!previous) return { insufficient: true };

  const ig = current.instagram || {};
  const igPrev = previous.instagram || {};
  const yt = current.youtube || {};
  const ytPrev = previous.youtube || {};

  const igGrowthPct = isFilled(ig.followersGrowthPct) ? ig.followersGrowthPct : pctChange(ig.followers, igPrev.followers);
  const igReachPct = pctChange(ig.reach, igPrev.reach);
  const igEngPct = pctChange(ig.engagementRate, igPrev.engagementRate);
  const igVolumePct = pctChange(contentItemsThisWeek.length, contentItemsPrevWeek.length);

  const instagram = weightedAvg([
    { value: normalizeDelta(igGrowthPct), weight: SCORE_WEIGHTS.instagram.crescimento },
    { value: normalizeDelta(igReachPct), weight: SCORE_WEIGHTS.instagram.alcance },
    { value: normalizeDelta(igEngPct), weight: SCORE_WEIGHTS.instagram.engajamento },
    { value: normalizeDelta(igVolumePct), weight: SCORE_WEIGHTS.instagram.consistencia }
  ]);

  const ytGrowthPct = pctChange(yt.subscribers, ytPrev.subscribers);
  const ytViewsPct = pctChange(yt.views, ytPrev.views);
  const ytWatchPct = pctChange(yt.watchTimeHours, ytPrev.watchTimeHours);

  const youtube = weightedAvg([
    { value: normalizeDelta(ytGrowthPct), weight: SCORE_WEIGHTS.youtube.crescimento },
    { value: normalizeDelta(ytViewsPct), weight: SCORE_WEIGHTS.youtube.visualizacoes },
    { value: normalizeDelta(ytWatchPct), weight: SCORE_WEIGHTS.youtube.consumo }
  ]);

  const platforms = [instagram, youtube].filter(v => v !== null);
  if (!platforms.length) return { insufficient: true };
  const overall = Math.round(platforms.reduce((a, b) => a + b, 0) / platforms.length);

  return { overall, instagram, youtube };
}

module.exports = { diagnose, computeScore, pctChange, fmtPct, fmtNum };
