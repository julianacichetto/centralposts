// Função em segundo plano: busca posts virais do Instagram e analisa padrões com Claude Vision.
import { internoOk, lerConfig, salvarViralRefs, baixarB64 } from "../lib/base.mjs";
import { buscarViralIG } from "../lib/meta.mjs";
import { analisarPadroes } from "../lib/criacao.mjs";
import { avisar } from "../lib/telegram.mjs";

export default async (req) => {
  if (!internoOk(req)) return new Response("proibido", { status: 403 });
  try {
    const cfg = await lerConfig();
    const hashtags = cfg.hashtagsViral?.length ? cfg.hashtagsViral : undefined;

    // 1) Busca posts virais do Instagram
    const posts = await buscarViralIG(hashtags);
    if (!posts.length) {
      await avisar("⚠️ Viral: nenhum post encontrado nas hashtags.").catch(() => {});
      return new Response("ok");
    }

    // 2) Baixa imagens para análise visual
    for (const p of posts) {
      if (p.imgUrl) {
        try {
          const { b64, mime } = await baixarB64(p.imgUrl);
          p.imgB64 = b64;
          p.imgMime = mime;
        } catch { /* sem imagem, segue sem ela */ }
      }
    }

    // 3) Analisa padrões com Claude Vision
    const analise = await analisarPadroes(posts);

    // 4) Salva no Firebase
    const hashtagesUsadas = [...new Set(posts.map((p) => p.hashtag))];
    await salvarViralRefs({ hashtags: hashtagesUsadas, totalPosts: posts.length, analise });

    await avisar(
      `✅ Referências virais atualizadas!\n${posts.length} posts analisados (${hashtagesUsadas.map((h) => "#" + h).join(", ")})\n\nInsight: ${analise?.insight || "—"}`
    ).catch(() => {});
  } catch (e) {
    console.error(e);
    await avisar("⚠️ Falha ao buscar viral: " + e.message).catch(() => {});
  }
  return new Response("ok");
};

export const config = { path: "/bg/viral", background: true };
