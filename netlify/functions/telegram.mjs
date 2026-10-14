// Webhook do Telegram: botões Aprovar/Ajustar e mensagens de ajuste.
import { lerConfig, lerPost, salvarConfig } from "../lib/base.mjs";
import { enviarParaAprovacao, avisar, responderBotao } from "../lib/telegram.mjs";
import { aprovarPost, ajustarPost } from "../lib/acoes.mjs";

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
      const post = await lerPost(postId);
      if (acao === "ap") {
        await responderBotao(cb.id, "Aprovado");
        await avisar(await aprovarPost(post));
      } else if (acao === "aj") {
        await salvarConfig({ pendente: postId, aguardandoAjuste: true });
        await responderBotao(cb.id);
        await avisar("✏️ O que você quer ajustar? Escreva aqui (ex.: no slide 2 troca o título por …).");
      } else if (acao === "ve") {
        await responderBotao(cb.id);
        await enviarParaAprovacao(post, cfg);
      }
      return new Response("ok");
    }

    const texto = (msg?.text || "").trim();
    if (!texto || texto.startsWith("/start")) {
      await avisar("Tudo certo por aqui. Quando um post estiver pronto, ele chega neste chat.");
    } else if (cfg.aguardandoAjuste && cfg.pendente) {
      await avisar(await ajustarPost(await lerPost(cfg.pendente), texto));
    } else if (/^sim\b|^aprov/i.test(texto) && cfg.pendente) {
      await avisar(await aprovarPost(await lerPost(cfg.pendente)));
    } else {
      await avisar("Use os botões ✅ Aprovar ou ✏️ Ajustar da última mensagem do post.");
    }
  } catch (e) {
    await avisar(`⚠️ Erro: ${e.message}`).catch(() => {});
  }
  return new Response("ok");
};

export const config = { path: "/webhook/telegram" };
