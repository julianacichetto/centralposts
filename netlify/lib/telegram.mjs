// Aprovação pelo Telegram: envia as artes + legenda com botões Aprovar / Ajustar.
import { dataBR, salvarConfig, lerConfig } from "./base.mjs";

async function tg(metodo, corpo) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("Falta a variável TELEGRAM_BOT_TOKEN");
  const r = await fetch(`https://api.telegram.org/bot${token}/${metodo}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(corpo),
  });
  const j = await r.json().catch(() => ({}));
  if (!j.ok) throw new Error("Telegram: " + (j.description || r.status));
  return j.result;
}

const corta = (t, n) => (t.length > n ? t.slice(0, n - 1) + "…" : t);

export async function avisar(texto, extra = {}) {
  const cfg = await lerConfig().catch(() => ({}));
  if (!cfg.telegramChatId) return;
  await tg("sendMessage", { chat_id: cfg.telegramChatId, text: corta(texto, 4000), ...extra });
}

export const responderBotao = (id, texto) => tg("answerCallbackQuery", { callback_query_id: id, text: texto || "" }).catch(() => {});

export async function enviarParaAprovacao(post, cfg) {
  if (!cfg.telegramChatId) throw new Error("Telegram não conectado: abra o bot e mande /start.");
  const chat = cfg.telegramChatId;
  const imgs = [
    ...(post.slides || []).map((s, i) => ({ url: s.url, cap: post.formato === "carrossel" ? `Slide ${i + 1}/${post.slides.length}` : "Feed" })),
    post.story?.url ? { url: post.story.url, cap: "Story" } : null,
  ].filter((x) => x && x.url);

  if (imgs.length > 1) {
    await tg("sendMediaGroup", { chat_id: chat, media: imgs.slice(0, 10).map((i) => ({ type: "photo", media: i.url, caption: i.cap })) });
  } else if (imgs.length === 1) {
    await tg("sendPhoto", { chat_id: chat, photo: imgs[0].url, caption: imgs[0].cap });
  }

  const alerta = post.alertas?.length ? `\n\n⚠️ Revise estes termos: ${post.alertas.join(", ")}` : "";
  const texto =
    `📅 Post de ${dataBR(post.date)} às 8h (${post.formato === "carrossel" ? "carrossel" : "foto"})\n${post.tema}\n\n` +
    `📝 Legenda:\n${post.legenda}${alerta}\n\n` +
    `Toque em ✅ para aprovar ou ✏️ para pedir ajuste.`;
  await tg("sendMessage", {
    chat_id: chat,
    text: corta(texto, 4000),
    reply_markup: {
      inline_keyboard: [[
        { text: "✅ Aprovar", callback_data: `ap:${post.id}` },
        { text: "✏️ Ajustar", callback_data: `aj:${post.id}` },
      ], [{ text: "🔁 Ver artes de novo", callback_data: `ve:${post.id}` }]],
    },
  });
  await salvarConfig({ pendente: post.id, aguardandoAjuste: false });
}
