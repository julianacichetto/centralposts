// Webhook do Telegram: botões Aprovar/Ajustar e mensagens de ajuste.
import { lerConfig, lerPost, salvarPost, salvarConfig, salvarArquivo } from "../lib/base.mjs";
import { enviarParaAprovacao, responder as avisar, responderBotao, baixarFotoTelegram } from "../lib/telegram.mjs";
import { aprovarPost, ajustarPost, lerEmail, aprovarEmail, ajustarEmail } from "../lib/acoes.mjs";

export default async (req) => {
  const segredo = process.env.TELEGRAM_SECRET;
  if (!segredo || req.headers.get("x-telegram-bot-api-secret-token") !== segredo) return new Response("proibido", { status: 403 });

  const u = await req.json().catch(() => ({}));
  const cfg = await lerConfig();
  const msg = u.message;
  const cb = u.callback_query;
  const chatId = String(msg?.chat?.id || cb?.message?.chat?.id || "");
  if (!chatId) return new Response("ok");

  // Primeiro contato conecta o chat (só uma vez; depois, só esse chat controla).
  if (!cfg.telegramChatId) {
    await salvarConfig({ telegramChatId: chatId });
    await avisar("✅ Telegram conectado! A partir de agora as aprovações chegam aqui.");
    return new Response("ok");
  }
  if (chatId !== String(cfg.telegramChatId)) return new Response("ok");

  try {
    if (cb) {
      const [acao, postId] = String(cb.data || "").split(":");
      if (acao === "ae" || acao === "je") {
        const em = await lerEmail(postId);
        await responderBotao(cb.id, acao === "ae" ? "Aprovado" : "");
        if (acao === "ae") await avisar(await aprovarEmail(em));
        else {
          await salvarConfig({ pendente: postId, aguardandoAjuste: true, pendenteTipo: "email" });
          await avisar("✏️ O que ajustar no e-mail? (ex.: muda o assunto para …, troca a imagem de capa)");
        }
        return new Response("ok");
      }
      const post = await lerPost(postId);
      if (acao === "ts") {
        await responderBotao(cb.id);
        await salvarConfig({ pendente: postId, aguardandoFoto: true, slideAlvo: null, aguardandoAjuste: false });
        const total = post.slides?.length || 0;
        const opcoes = total > 0 ? Array.from({ length: total }, (_, i) => i + 1).join(", ") + ' ou "story"' : '"story"';
        await avisar(`📷 Qual slide quer substituir pela sua própria imagem? Responda com o número (${opcoes}).`);
        return new Response("ok");
      } else if (acao === "ap") {
        await responderBotao(cb.id, "Aprovado");
        await avisar(await aprovarPost(post));
      } else if (acao === "aj") {
        await salvarConfig({ pendente: postId, aguardandoAjuste: true, pendenteTipo: "post" });
        await responderBotao(cb.id);
        await avisar("✏️ O que você quer ajustar? Escreva aqui (ex.: no slide 2 troca o título por …).");
      } else if (acao === "ve") {
        await responderBotao(cb.id);
        await enviarParaAprovacao(post, cfg);
      }
      return new Response("ok");
    }

    // Recebeu uma foto: substituição manual de slide
    if (msg?.photo && cfg.aguardandoFoto && cfg.slideAlvo && cfg.pendente) {
      const fileId = msg.photo[msg.photo.length - 1].file_id;
      const buf = await baixarFotoTelegram(fileId);
      const ehStory = cfg.slideAlvo === "story";
      const urlPath = `posts/${cfg.pendente}/${ehStory ? "story" : "slide-" + cfg.slideAlvo}-manual-${Date.now()}.jpg`;
      const url = await salvarArquivo(buf, urlPath);
      const postAtual = await lerPost(cfg.pendente);
      if (ehStory) {
        await salvarPost(cfg.pendente, { story: { ...(postAtual.story || {}), url } });
      } else {
        const idx = parseInt(cfg.slideAlvo) - 1;
        const slides = [...(postAtual.slides || [])];
        slides[idx] = { ...(slides[idx] || {}), url };
        await salvarPost(cfg.pendente, { slides });
      }
      await salvarConfig({ aguardandoFoto: false, slideAlvo: null });
      await avisar(ehStory ? "✅ Story substituído pela sua imagem!" : `✅ Slide ${cfg.slideAlvo} substituído pela sua imagem!`);
      await enviarParaAprovacao(await lerPost(cfg.pendente), cfg);
      return new Response("ok");
    }

    const texto = (msg?.text || "").trim();
    if (!texto || texto.startsWith("/start")) {
      await avisar("Tudo certo por aqui. Quando um post estiver pronto, ele chega neste chat.");
    } else if (cfg.aguardandoFoto && cfg.pendente && !cfg.slideAlvo) {
      // Escolha do slide a substituir
      const postAtual = await lerPost(cfg.pendente);
      const total = postAtual.slides?.length || 0;
      const limpo = texto.toLowerCase().replace(/[^a-z0-9]/g, "");
      if (limpo === "story") {
        await salvarConfig({ slideAlvo: "story" });
        await avisar('📷 Story selecionado. Agora mande a imagem (proporção 9:16 fica melhor).');
      } else {
        const n = parseInt(limpo);
        if (!isNaN(n) && n >= 1 && n <= total) {
          await salvarConfig({ slideAlvo: String(n) });
          await avisar(`📷 Slide ${n} selecionado. Agora mande a imagem.`);
        } else {
          await avisar(`❌ Não entendi. Responda com um número de 1 a ${total}${total > 0 ? " " : ""}ou "story". Para cancelar, escreva "cancelar".`);
        }
      }
    } else if (cfg.aguardandoFoto && cfg.pendente && cfg.slideAlvo) {
      if (/^cancelar$/i.test(texto)) {
        await salvarConfig({ aguardandoFoto: false, slideAlvo: null });
        await avisar("Cancelado. Use os botões da mensagem do post para continuar.");
      } else {
        await avisar(`📷 Estou aguardando a imagem do slide ${cfg.slideAlvo}. Mande uma foto, ou escreva "cancelar" para desistir.`);
      }
    } else if (/^cancelar$/i.test(texto) && cfg.aguardandoFoto) {
      await salvarConfig({ aguardandoFoto: false, slideAlvo: null });
      await avisar("Cancelado.");
    } else if (cfg.aguardandoAjuste && cfg.pendente) {
      await avisar(cfg.pendenteTipo === "email" ? await ajustarEmail(await lerEmail(cfg.pendente), texto) : await ajustarPost(await lerPost(cfg.pendente), texto));
    } else if (/^sim\b|^aprov/i.test(texto) && cfg.pendente) {
      await avisar(cfg.pendenteTipo === "email" ? await aprovarEmail(await lerEmail(cfg.pendente)) : await aprovarPost(await lerPost(cfg.pendente)));
    } else {
      await avisar("Use os botões ✅ Aprovar ou ✏️ Ajustar da última mensagem do post.");
    }
  } catch (e) {
    await avisar(`⚠️ Erro: ${e.message}`).catch(() => {});
  }
  return new Response("ok");
};

export const config = { path: "/webhook/telegram" };
