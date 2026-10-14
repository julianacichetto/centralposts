// API do painel. Todas as rotas exigem o cabeçalho x-senha = PANEL_PASSWORD.
import { fb, json, lerConfig, salvarConfig, lerPost, salvarPost, dispararBg, salvarArquivo, CONFIG_PADRAO } from "../lib/base.mjs";
import { enviarParaAprovacao } from "../lib/telegram.mjs";
import { aprovarPost } from "../lib/acoes.mjs";
import { CALENDARIO_INICIAL } from "../lib/calendario.mjs";

const CAMPOS_POST = ["date", "formato", "tema", "gancho", "notas", "status", "slides", "story", "legenda"];
const CAMPOS_CFG = Object.keys(CONFIG_PADRAO).filter((k) => !["pendente", "aguardandoAjuste"].includes(k));
const pick = (o, ks) => Object.fromEntries(ks.filter((k) => o[k] !== undefined).map((k) => [k, o[k]]));

export default async (req) => {
  if (!process.env.PANEL_PASSWORD || req.headers.get("x-senha") !== process.env.PANEL_PASSWORD)
    return json({ erro: "Senha inválida" }, 401);

  const { db } = fb();
  const url = new URL(req.url);
  const partes = url.pathname.replace(/^\/api\/?/, "").split("/").filter(Boolean);
  const m = req.method;
  const corpo = m === "GET" || m === "DELETE" ? {} : await req.json().catch(() => ({}));

  try {
    // ----- configuração -----
    if (partes[0] === "config") {
      if (m === "GET") return json(await lerConfig());
      if (m === "PUT") { await salvarConfig(pick(corpo, CAMPOS_CFG)); return json(await lerConfig()); }
    }

    // ----- upload de logo / referência de estilo -----
    if (partes[0] === "upload" && m === "POST") {
      const { tipo, b64, mime = "image/png" } = corpo;
      if (!["logo", "estilo"].includes(tipo) || !b64) return json({ erro: "Dados inválidos" }, 400);
      const ext = mime.includes("jpeg") ? "jpg" : "png";
      const link = await salvarArquivo(Buffer.from(b64, "base64"), `marca/${tipo}-${Date.now()}.${ext}`, mime);
      await salvarConfig(tipo === "logo" ? { logoUrl: link } : { estiloRefUrl: link });
      return json(await lerConfig());
    }

    // ----- importar calendário inicial -----
    if (partes[0] === "importar" && m === "POST") {
      let n = 0;
      for (const p of CALENDARIO_INICIAL) {
        const existe = await db.collection("posts").where("date", "==", p.date).limit(1).get();
        if (existe.empty) { await db.collection("posts").add({ ...p, criadoEm: new Date().toISOString() }); n++; }
      }
      return json({ importados: n });
    }

    // ----- posts -----
    if (partes[0] === "posts") {
      const id = partes[1], acao = partes[2];
      if (!id && m === "GET") {
        const q = await db.collection("posts").orderBy("date").get();
        return json(q.docs.map((d) => ({ id: d.id, ...d.data() })));
      }
      if (!id && m === "POST") {
        const novo = { status: "rascunho", ...pick(corpo, ["date", "formato", "tema", "gancho", "notas"]), criadoEm: new Date().toISOString() };
        const ref = await db.collection("posts").add(novo);
        return json({ id: ref.id, ...novo });
      }
      if (id && !acao) {
        if (m === "GET") return json(await lerPost(id));
        if (m === "PUT") { await salvarPost(id, pick(corpo, CAMPOS_POST)); return json(await lerPost(id)); }
        if (m === "DELETE") { await db.doc(`posts/${id}`).delete(); return json({ ok: true }); }
      }
      if (id && m === "POST") {
        const post = await lerPost(id);
        if (acao === "gerar") {
          await salvarPost(id, { status: "gerando", progresso: "Na fila…" });
          await dispararBg("/bg/gerar", { postId: id, ...pick(corpo, ["instrucao", "apenasImagens", "slide", "ajusteImagem", "enviar"]) });
          return json({ ok: true });
        }
        if (acao === "enviar") { await enviarParaAprovacao(post, await lerConfig()); return json({ ok: true }); }
        if (acao === "aprovar") return json({ ok: true, msg: await aprovarPost(post) });
        if (acao === "publicar") { await dispararBg("/bg/publicar", { postId: id }); return json({ ok: true }); }
      }
    }
    return json({ erro: "Rota não encontrada" }, 404);
  } catch (e) {
    console.error(e);
    return json({ erro: String(e.message || e) }, 500);
  }
};

export const config = { path: "/api/*" };
