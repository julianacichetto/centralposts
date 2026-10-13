// Webhook do WhatsApp: recebe as respostas de quem aprova (SIM / AJUSTAR / VER TUDO).
import { createHmac, timingSafeEqual } from "node:crypto";
import { lerConfig, lerPost, salvarConfig } from "../lib/base.mjs";
import { enviarParaAprovacao, waTexto } from "../lib/meta.mjs";
import { aprovarPost, ajustarPost } from "../lib/acoes.mjs";

const norm = (t) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

function assinaturaOk(raw, header) {
  const segredo = process.env.META_APP_SECRET;
  if (!segredo) return true; // sem segredo configurado, não verifica
  if (!header) return false;
  const esperado = "sha256=" + createHmac("sha256", segredo).update(raw).digest("hex");
  const a = Buffer.from(esperado), b = Buffer.from(header);
  return a.length === b.length && timingSafeEqual(a, b);
}

export default async (req) => {
  const url = new URL(req.url);
  if (req.method === "GET") {
    const ok = url.searchParams.get("hub.mode") === "subscribe" && url.searchParams.get("hub.verify_token") === process.env.WA_VERIFY_TOKEN;
    return new Response(ok ? url.searchParams.get("hub.challenge") : "proibido", { status: ok ? 200 : 403 });
  }

  const raw = await req.text();
  if (!assinaturaOk(raw, req.headers.get("x-hub-signature-256"))) return new Response("assinatura inválida", { status: 401 });
  const body = JSON.parse(raw || "{}");
  const msgs = body.entry?.flatMap((e) => e.changes?.flatMap((c) => c.value?.messages || []) || []) || [];
  if (!msgs.length) return new Response("ok");

  const cfg = await lerConfig();
  const aprovador = String(cfg.aprovador || "").replace(/\D/g, "");

  for (const m of msgs) {
    if (!aprovador || m.from !== aprovador) continue; // só quem aprova controla
    const texto = m.text?.body || m.button?.text || m.interactive?.button_reply?.title || "";
    const t = norm(texto);
    if (!cfg.pendente) {
      await waTexto(aprovador, "Não tem nenhum post aguardando aprovação agora.");
      continue;
    }
    const post = await lerPost(cfg.pendente);

    try {
      if (/^(sim|aprovar|aprovado|aprovo|ok|pode postar)\b/.test(t)) {
        await waTexto(aprovador, await aprovarPost(post));
      } else if (/^ver\b/.test(t)) {
        await enviarParaAprovacao(post, cfg);
      } else if (/^ajust/.test(t)) {
        const instrucao = texto.replace(/^\s*ajust\w*\s*:?\s*/i, "").trim();
        if (!instrucao) {
          await salvarConfig({ aguardandoAjuste: true });
          await waTexto(aprovador, "Me diga o que ajustar (ex.: no slide 2 troca o título por …).");
        } else {
          await waTexto(aprovador, await ajustarPost(post, instrucao));
        }
      } else if (cfg.aguardandoAjuste) {
        await waTexto(aprovador, await ajustarPost(post, texto));
      } else {
        await waTexto(aprovador, "Responda *SIM* para aprovar, *AJUSTAR: o que mudar* para refazer, ou *VER* para receber as artes de novo.");
      }
    } catch (e) {
      await waTexto(aprovador, `⚠️ Erro: ${e.message}`).catch(() => {});
    }
  }
  return new Response("ok");
};

export const config = { path: "/webhook/whatsapp" };
