// WhatsApp Cloud API (aprovação) e Instagram Graph API (publicação).
import { dataBR, salvarConfig } from "./base.mjs";

const GRAPH = () => `https://graph.facebook.com/${process.env.GRAPH_VERSION || "v23.0"}`;
const so = (n) => String(n || "").replace(/\D/g, "");

// ---------- WhatsApp ----------
async function wa(payload) {
  const r = await fetch(`${GRAPH()}/${process.env.WA_PHONE_NUMBER_ID}/messages`, {
    method: "POST",
    headers: { authorization: `Bearer ${process.env.WA_TOKEN}`, "content-type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", ...payload }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    const e = new Error("WhatsApp: " + (j.error?.message || r.status));
    e.code = j.error?.code;
    throw e;
  }
  return j;
}
export const waTexto = (to, body) => wa({ to: so(to), type: "text", text: { body } });
export const waImagem = (to, link, caption) => wa({ to: so(to), type: "image", image: caption ? { link, caption } : { link } });

const janelaFechada = (e) => e.code === 131047 || /24 hours|re-engagement|outside the allowed window/i.test(e.message);

export async function enviarParaAprovacao(post, cfg) {
  if (!cfg.aprovador) throw new Error("Configure o número que aprova (Configurações).");
  const to = cfg.aprovador;
  const imgs = [
    ...(post.slides || []).map((s, i) => ({ url: s.url, cap: post.formato === "carrossel" ? `Slide ${i + 1}/${post.slides.length}` : "Feed" })),
    post.story?.url ? { url: post.story.url, cap: "Story" } : null,
  ].filter((x) => x && x.url);

  const alerta = post.alertas?.length ? `⚠️ Atenção, revise estes termos: ${post.alertas.join(", ")}\n\n` : "";
  const resumo =
    `📅 Post de ${dataBR(post.date)} às 8h (${post.formato === "carrossel" ? "carrossel" : "foto"})\n${post.tema}\n\n` +
    `📝 Legenda:\n${post.legenda}\n\n${alerta}` +
    `Responda:\n✅ *SIM* para aprovar\n✏️ *AJUSTAR:* o que mudar\n(ex.: AJUSTAR: no slide 2 troca o título por ...)`;

  try {
    for (const i of imgs) await waImagem(to, i.url, i.cap);
    await waTexto(to, resumo);
  } catch (e) {
    if (!janelaFechada(e)) throw e;
    // Fora da janela de 24h: só template aprovado pode iniciar a conversa.
    await wa({
      to: so(to),
      type: "template",
      template: {
        name: process.env.WA_TEMPLATE || "aprovacao_post",
        language: { code: "pt_BR" },
        components: [
          { type: "header", parameters: [{ type: "image", image: { link: imgs[0]?.url } }] },
          { type: "body", parameters: [{ type: "text", text: dataBR(post.date) }, { type: "text", text: post.tema }] },
        ],
      },
    });
  }
  await salvarConfig({ pendente: post.id, aguardandoAjuste: false });
}

// ---------- Instagram ----------
async function ig(path, params, method = "POST") {
  const url = new URL(`${GRAPH()}/${path}`);
  const body = new URLSearchParams({ ...params, access_token: process.env.IG_TOKEN });
  const r = method === "GET"
    ? await fetch(`${url}?${body}`)
    : await fetch(url, { method, body });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) throw new Error("Instagram: " + (j.error?.error_user_msg || j.error?.message || r.status));
  return j;
}
async function esperarPronto(id) {
  for (let t = 0; t < 20; t++) {
    const s = await ig(id, { fields: "status_code" }, "GET");
    if (s.status_code === "FINISHED") return;
    if (s.status_code === "ERROR" || s.status_code === "EXPIRED") throw new Error("Instagram recusou a mídia (" + s.status_code + ")");
    await new Promise((r) => setTimeout(r, 3000));
  }
  throw new Error("Instagram demorou demais para processar a mídia");
}
async function publicarContainer(id) {
  await esperarPronto(id);
  return (await ig(`${process.env.IG_USER_ID}/media_publish`, { creation_id: id })).id;
}

export async function publicarFeed(post) {
  const igId = process.env.IG_USER_ID;
  const urls = post.slides.map((s) => s.url).filter(Boolean);
  if (!urls.length) throw new Error("Post sem artes");
  if (urls.length === 1) {
    const c = await ig(`${igId}/media`, { image_url: urls[0], caption: post.legenda });
    return publicarContainer(c.id);
  }
  const filhos = [];
  for (const u of urls) {
    const c = await ig(`${igId}/media`, { image_url: u, is_carousel_item: "true" });
    filhos.push(c.id);
  }
  for (const f of filhos) await esperarPronto(f);
  const car = await ig(`${igId}/media`, { media_type: "CAROUSEL", children: filhos.join(","), caption: post.legenda });
  return publicarContainer(car.id);
}

export async function publicarStory(post) {
  if (!post.story?.url) return null;
  const c = await ig(`${process.env.IG_USER_ID}/media`, { media_type: "STORIES", image_url: post.story.url });
  return publicarContainer(c.id);
}
