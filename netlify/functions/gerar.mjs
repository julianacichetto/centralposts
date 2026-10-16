// Função em segundo plano (até 15 min): escreve os textos, gera as artes e manda para aprovação.
// Corpo: { postId, instrucao?, apenasImagens?, slide?: número | "story", ajusteImagem?, enviar? }
import { internoOk, lerPost, salvarPost, lerConfig, baixarB64, salvarArquivo } from "../lib/base.mjs";
import { gerarCopy, revisarCopy, acharProibidas, promptImagem, gerarImagem } from "../lib/criacao.mjs";
import { enviarParaAprovacao, avisar } from "../lib/telegram.mjs";

export default async (req) => {
  if (!internoOk(req)) return new Response("proibido", { status: 403 });
  const { postId, instrucao, apenasImagens, slide, ajusteImagem, enviar = true } = await req.json();
  let post;
  try {
    post = await lerPost(postId);
    const cfg = await lerConfig();
    await salvarPost(postId, { status: "gerando", progresso: "Escrevendo os textos…", erro: null });

    // 1) Textos
    let regerar;
    if (instrucao && post.slides?.length) {
      const rev = await revisarCopy(post, cfg, instrucao);
      regerar = Array.isArray(rev.regerar) ? rev.regerar : [];
      const slides = rev.slides.map((s, i) => ({ ...s, url: regerar.includes(i) ? null : post.slides[i]?.url || null }));
      if (slides.some((s) => !s.url)) slides.forEach((s, i) => { if (!s.url && !regerar.includes(i)) regerar.push(i); });
      post = { ...post, slides, story: { ...rev.story, url: regerar.includes("story") ? null : post.story?.url || null }, legenda: rev.legenda };
    } else if (slide !== undefined && slide !== null && post.slides?.length) {
      regerar = [slide];
    } else if (apenasImagens && post.slides?.length) {
      regerar = [...post.slides.keys(), "story"];
    } else {
      let copy = await gerarCopy(post, cfg);
      let alertas = acharProibidas(copy, cfg.proibidas);
      if (alertas.length) {
        copy = await gerarCopy(post, cfg, `ATENÇÃO: não use estes termos proibidos: ${alertas.join(", ")}.`);
        alertas = acharProibidas(copy, cfg.proibidas);
      }
      post = { ...post, slides: copy.slides.map((s) => ({ ...s, url: null })), story: { ...copy.story, url: null }, legenda: copy.legenda, alertas };
      regerar = [...post.slides.keys(), "story"];
    }
    post.alertas = acharProibidas(post, cfg.proibidas);
    await salvarPost(postId, { slides: post.slides, story: post.story, legenda: post.legenda, alertas: post.alertas });

    // 2) Artes
    const refs = [await baixarB64(cfg.logoUrl)];
    if (cfg.estiloRefUrl) refs.push(await baixarB64(cfg.estiloRefUrl));
    const total = post.slides.length;
    let feitos = 0;
    for (const alvo of regerar) {
      const ehStory = alvo === "story";
      const s = ehStory ? post.story : post.slides[alvo];
      if (!s) continue;
      feitos++;
      await salvarPost(postId, { progresso: `Gerando arte ${feitos}/${regerar.length}${ehStory ? " (story)" : ""}…` });
      const prompt = promptImagem(s, { cfg, tipo: ehStory ? "story" : "feed", n: alvo + 1, total, ajuste: ajusteImagem, openai: !!process.env.OPENAI_API_KEY });
      const buf = await gerarImagem(prompt, refs, ehStory ? "9:16" : "4:5");
      const url = await salvarArquivo(buf, `posts/${postId}/${ehStory ? "story" : "slide-" + (alvo + 1)}-${Date.now()}.jpg`);
      if (ehStory) post.story = { ...post.story, url };
      else post.slides[alvo] = { ...post.slides[alvo], url };
      await salvarPost(postId, { slides: post.slides, story: post.story });
    }

    // 3) Aprovação
    await salvarPost(postId, { status: "aguardando", progresso: null, geradoEm: new Date().toISOString() });
    if (enviar) {
      try {
        await enviarParaAprovacao({ ...post, id: postId }, cfg);
      } catch (e) {
        await salvarPost(postId, { erro: "Artes prontas, mas o aviso não foi enviado: " + e.message });
      }
    }
  } catch (e) {
    console.error(e);
    await salvarPost(postId, { status: "erro", progresso: null, erro: String(e.message || e) }).catch(() => {});
    await avisar(`⚠️ Falha ao gerar o post "${post?.tema || postId}": ${e.message}`).catch(() => {});
  }
  return new Response("ok");
};

export const config = { path: "/bg/gerar", background: true };
