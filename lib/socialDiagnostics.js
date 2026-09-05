// Motor de diagnóstico por regras (sem IA generativa) — usado tanto pelo
// lançamento manual quanto pela busca automática, pra nunca duplicar a
// lógica de negócio entre os dois caminhos.
//
// Recebe o snapshot da semana atual, o da semana anterior (pode ser null se
// ainda não existir histórico) e os posts da semana, devolve um diagnóstico
// em texto e uma lista de recomendações práticas.

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

function bestAndWorstPost(posts, contentById) {
  const withRate = posts
    .map(p => ({ ...p, _rate: p.engagementRate ?? null }))
    .filter(p => p._rate !== null);
  if (!withRate.length) return { best: null, worst: null };
  const sorted = [...withRate].sort((a, b) => b._rate - a._rate);
  const best = sorted[0];
  const worst = sorted[sorted.length - 1];
  return {
    best: best && best !== worst ? best : best,
    worst: sorted.length > 1 ? worst : null
  };
}

function diagnose({ current, previous, posts = [], contentItemsThisWeek = [], contentItemsPrevWeek = [], contentById = {} }) {
  const paragraphs = [];
  const recomendacoes = [];

  const ig = current.instagram || {};
  const igPrev = previous ? previous.instagram || {} : {};
  const st = current.stories || {};
  const stPrev = previous ? previous.stories || {} : {};
  const yt = current.youtube || {};
  const ytPrev = previous ? previous.youtube || {} : {};

  // ---------- 1. Crescimento de seguidores ----------
  if (!previous) {
    paragraphs.push(
      `📈 Crescimento: primeira semana registrada (${fmtNum(ig.followers)} seguidores). Ainda não há semana anterior para comparar — a partir da próxima semana o relatório passa a mostrar evolução.`
    );
  } else {
    const growthPct = isFilled(ig.followersGrowthPct) ? ig.followersGrowthPct : pctChange(ig.followers, igPrev.followers);
    const prevGrowthPct = isFilled(igPrev.followersGrowthPct) ? igPrev.followersGrowthPct : null;
    const growthDeltaVsPrevWeek = prevGrowthPct !== null && growthPct !== null ? growthPct - prevGrowthPct : null;

    if (growthPct === null) {
      paragraphs.push('📈 Crescimento: sem número de seguidores suficiente para calcular a variação desta semana.');
    } else if (growthPct < 0) {
      paragraphs.push(
        `📈 Crescimento: perda de seguidores esta semana (${fmtPct(growthPct)}, de ${fmtNum(igPrev.followers)} para ${fmtNum(ig.followers)}).`
      );
      recomendacoes.push('Queda de seguidores: revise se houve unfollow em massa após algum post polêmico, limpeza de contas inativas pelo Instagram, ou queda de alcance orgânico — compare com a seção de Alcance abaixo.');
    } else if (growthDeltaVsPrevWeek !== null && growthDeltaVsPrevWeek < -0.5) {
      paragraphs.push(
        `📈 Crescimento: desacelerou em relação à semana passada — ${fmtPct(growthPct)} nesta semana contra ${fmtPct(prevGrowthPct)} na anterior (${fmtNum(ig.followers)} seguidores).`
      );
      recomendacoes.push('Crescimento de seguidores desacelerou: teste um formato de maior alcance (Reels/Corte VOD) ou aumente a frequência de publicação para recuperar o ritmo.');
    } else if (growthDeltaVsPrevWeek !== null && growthDeltaVsPrevWeek > 0.5) {
      paragraphs.push(
        `📈 Crescimento: acelerou — ${fmtPct(growthPct)} nesta semana contra ${fmtPct(prevGrowthPct)} na anterior (${fmtNum(ig.followers)} seguidores). Vale identificar o que impulsionou e repetir a fórmula.`
      );
    } else {
      paragraphs.push(`📈 Crescimento: estável, ${fmtPct(growthPct)} nesta semana (${fmtNum(ig.followers)} seguidores).`);
    }
  }

  // ---------- 2. Alcance ----------
  const reachChange = previous ? pctChange(ig.reach, igPrev.reach) : null;
  const impressionsChange = previous ? pctChange(ig.impressions, igPrev.impressions) : null;
  const postsThisWeek = contentItemsThisWeek.length;
  const postsPrevWeek = contentItemsPrevWeek.length;

  if (previous && reachChange !== null) {
    if (reachChange <= -15) {
      const postDiff = postsThisWeek - postsPrevWeek;
      const causaVolume = postDiff < 0
        ? ` provavelmente ligado à queda no volume de publicações (${postsThisWeek} contra ${postsPrevWeek} na semana anterior)`
        : ' sem queda no volume de publicações, o que sugere perda de alcance orgânico (algoritmo ou formato) e não falta de conteúdo';
      paragraphs.push(`👁️ Alcance: caiu ${fmtPct(reachChange)} (${fmtNum(igPrev.reach)} → ${fmtNum(ig.reach)} contas alcançadas),${causaVolume}.`);
      recomendacoes.push(
        postDiff < 0
          ? 'Alcance caiu: retome a frequência de publicação da semana anterior — o Instagram reduz distribuição de perfis que publicam menos.'
          : 'Alcance caiu mesmo com o mesmo volume de posts: teste variar o formato (mais Reels/vídeo curto) e revise os ganchos dos primeiros 3 segundos.'
      );
    } else if (reachChange >= 15) {
      paragraphs.push(`👁️ Alcance: cresceu ${fmtPct(reachChange)} (${fmtNum(igPrev.reach)} → ${fmtNum(ig.reach)} contas alcançadas). Vale revisar qual post puxou esse resultado.`);
    } else {
      paragraphs.push(`👁️ Alcance: ${fmtNum(ig.reach)} contas alcançadas (${fmtPct(reachChange)} vs. semana anterior), ${fmtNum(ig.impressions)} impressões (${fmtPct(impressionsChange)}).`);
    }
  } else {
    paragraphs.push(`👁️ Alcance: ${fmtNum(ig.reach)} contas alcançadas, ${fmtNum(ig.impressions)} impressões.`);
  }

  // ---------- 3. Engajamento ----------
  const engChange = previous ? pctChange(ig.engagementRate, igPrev.engagementRate) : null;
  if (previous && engChange !== null) {
    if (engChange <= -15) {
      const postDiff = postsThisWeek - postsPrevWeek;
      const causa = postDiff < 0
        ? `provavelmente por causa da queda no volume de publicações (${postsThisWeek} vs. ${postsPrevWeek} posts)`
        : 'não parece ser falta de volume (mesmo número de posts) — pode ser formato, horário ou tema dos posts';
      paragraphs.push(`💬 Engajamento: taxa caiu ${fmtPct(engChange)} nesta semana (${causa}).`);
      recomendacoes.push(
        postDiff < 0
          ? 'Engajamento caiu: aumente a frequência de publicação — perfis inativos por mais tempo tendem a perder engajamento junto com o alcance.'
          : 'Engajamento caiu mesmo com volume igual: revise os últimos posts com pior desempenho e ajuste gancho/CTA/formato para a próxima semana.'
      );
    } else if (engChange >= 15) {
      paragraphs.push(`💬 Engajamento: taxa subiu ${fmtPct(engChange)} nesta semana — vale repetir o que funcionou nos posts de melhor desempenho.`);
    } else {
      paragraphs.push(`💬 Engajamento: taxa de ${(ig.engagementRate ?? 0).toFixed(2)}% (${fmtPct(engChange)} vs. semana anterior). ${fmtNum(ig.likes)} curtidas, ${fmtNum(ig.comments)} comentários, ${fmtNum(ig.shares)} compartilhamentos, ${fmtNum(ig.saves)} salvamentos.`);
    }
  } else {
    paragraphs.push(`💬 Engajamento: taxa de ${(ig.engagementRate ?? 0).toFixed(2)}%. ${fmtNum(ig.likes)} curtidas, ${fmtNum(ig.comments)} comentários, ${fmtNum(ig.shares)} compartilhamentos, ${fmtNum(ig.saves)} salvamentos.`);
  }

  // ---------- 4. Stories ----------
  if (!isFilled(st.published) || st.published === 0) {
    paragraphs.push('🎬 Stories: nenhum story publicado nesta semana.');
    recomendacoes.push('Nenhum story na semana: stories mantêm a conta "quente" no algoritmo e geram alcance sem custo de produção alto — vale reservar 2-3 por semana, mesmo que sejam bastidores simples.');
  } else {
    const viewsChange = previous ? pctChange(st.views, stPrev.views) : null;
    paragraphs.push(
      `🎬 Stories: ${fmtNum(st.published)} publicados, ${fmtNum(st.views)} visualizações${viewsChange !== null ? ` (${fmtPct(viewsChange)} vs. semana anterior)` : ''}, ${fmtNum(st.replies)} respostas, ${fmtNum(st.exits)} saídas.`
    );
    if (viewsChange !== null && viewsChange <= -20) {
      recomendacoes.push('Visualizações de stories caíram bastante: experimente enquetes/caixinhas de pergunta para gerar mais interação e retenção no story.');
    }
  }

  // ---------- 5. Desempenho de conteúdo (melhor/pior post) ----------
  if (posts.length) {
    const { best, worst } = bestAndWorstPost(posts, contentById);
    if (best) {
      const pillar = pillarLabel(contentById[best.contentId]);
      paragraphs.push(
        `🏆 Melhor post da semana: "${best.titulo}" (${best.platform === 'youtube' ? 'YouTube' : 'Instagram'}), taxa de engajamento ${best._rate.toFixed(2)}%${pillar ? `, pilar ${pillar}` : ''}.`
      );
    }
    if (worst) {
      paragraphs.push(`📉 Post de menor desempenho: "${worst.titulo}", taxa de engajamento ${worst._rate.toFixed(2)}%.`);
      recomendacoes.push(`Compare "${worst.titulo}" com "${best ? best.titulo : 'o melhor post'}" — geralmente a diferença está no gancho dos primeiros segundos ou no tema.`);
    }
  }

  // ---------- 6. YouTube ----------
  const subsGrowthPct = previous ? pctChange(yt.subscribers, ytPrev.subscribers) : null;
  const viewsChangeYt = previous ? pctChange(yt.views, ytPrev.views) : null;
  const watchTimeChange = previous ? pctChange(yt.watchTimeHours, ytPrev.watchTimeHours) : null;
  const retentionChange = previous ? pctChange(yt.avgViewDurationSec, ytPrev.avgViewDurationSec) : null;

  let ytLine = `▶️ YouTube: ${fmtNum(yt.subscribers)} inscritos (${yt.subscribersGained >= 0 ? '+' : ''}${fmtNum(yt.subscribersGained)} na semana), ${fmtNum(yt.views)} visualizações, ${fmtNum(yt.watchTimeHours)}h de tempo de exibição.`;
  paragraphs.push(ytLine);

  if (watchTimeChange !== null && watchTimeChange <= -15) {
    recomendacoes.push('Tempo de exibição no YouTube caiu: vídeos mais longos com boa retenção nos primeiros 30s ajudam o YouTube a recomendar mais — revise a retenção dos últimos vídeos.');
  }
  if (retentionChange !== null && retentionChange <= -15) {
    recomendacoes.push('Duração média de visualização caiu: o início do vídeo pode estar demorando a entregar valor — corte a introdução e vá direto ao gancho.');
  }
  if (!isFilled(yt.impressions) || !isFilled(yt.ctr)) {
    paragraphs.push('▶️ YouTube: impressões e CTR (aba Alcance do YouTube Studio) ainda não foram lançados manualmente esta semana — esses dois campos não são expostos pela API pública e precisam ser preenchidos à mão.');
    recomendacoes.push('Lance manualmente impressões e CTR do YouTube Studio para o diagnóstico de YouTube ficar completo.');
  }

  // ---------- 7. Comparativo Instagram × YouTube ----------
  if (previous) {
    const igGrowth = isFilled(ig.followersGrowthPct) ? ig.followersGrowthPct : pctChange(ig.followers, igPrev.followers);
    if (igGrowth !== null && subsGrowthPct !== null) {
      const faster = igGrowth === subsGrowthPct ? null : (igGrowth > subsGrowthPct ? 'Instagram' : 'YouTube');
      if (faster) {
        paragraphs.push(`📊 Comparativo: ${faster} cresceu mais rápido esta semana (Instagram ${fmtPct(igGrowth)} vs. YouTube ${fmtPct(subsGrowthPct)}).`);
      }
    }
  }

  const diagnostico = paragraphs.join('\n\n');
  if (!recomendacoes.length) {
    recomendacoes.push('Sem alertas relevantes nesta semana — manter a cadência e os formatos atuais.');
  }

  return { diagnostico, recomendacoes };
}

module.exports = { diagnose, pctChange, fmtPct, fmtNum };
