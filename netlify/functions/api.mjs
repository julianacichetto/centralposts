// API do painel. Todas as rotas exigem o cabeçalho x-senha = PANEL_PASSWORD.
import { fb, json, lerConfig, salvarConfig, lerPost, salvarPost, dispararBg, salvarArquivo, CONFIG_PADRAO, dataSP } from "../lib/base.mjs";
import { enviarParaAprovacao } from "../lib/telegram.mjs";
import { aprovarPost, lerEmail, aprovarEmail } from "../lib/acoes.mjs";
import { CALENDARIO_EMAILS, importarContatos, resumoContatos, renderEmail, linkPreview } from "../lib/emailmkt.mjs";
import { enviarEmailAprovacao } from "../lib/telegram.mjs";
import { CALENDARIO_INICIAL } from "../lib/calendario.mjs";

const CAMPOS_POST = ["date", "formato", "tema", "gancho", "notas", "status", "slides", "story", "legenda"];
const CAMPOS_CFG = Object.keys(CONFIG_PADRAO).filter((k) => !["pendente", "aguardandoAjuste"].includes(k));
const CAMPOS_EMAIL = ["date", "marca", "tipo", "tema", "notas", "status", "copy"];
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

    // ----- contatos -----
    if (partes[0] === "contatos") {
      if (m === "GET") return json(await resumoContatos());
      if (m === "POST") return json(await importarContatos(String(corpo.csv || "")));
    }

    // ----- e-mails -----
    if (partes[0] === "emails") {
      const id = partes[1], acao = partes[2];
      if (id === "importar" && m === "POST") {
        let n = 0;
        // Substitui o calendário: apaga os que ainda não foram mexidos (rascunho/pausado sem texto gerado)
        const todos = await db.collection("emails").get();
        for (const d of todos.docs) if (["rascunho", "pausado"].includes(d.get("status")) && !d.get("copy")) await d.ref.delete();
        for (const e of CALENDARIO_EMAILS) {
          const ex = await db.collection("emails").where("date", "==", e.date).limit(1).get();
          if (ex.empty) { await db.collection("emails").add({ ...e, criadoEm: new Date().toISOString() }); n++; }
        }
        return json({ importados: n });
      }
      if (!id && m === "GET") {
        const q = await db.collection("emails").where("date", ">=", dataSP(-30)).where("date", "<=", dataSP(90)).orderBy("date").get();
        return json(q.docs.map((d) => ({ id: d.id, ...d.data() })));
      }
      if (!id && m === "POST") {
        const novo = { status: "rascunho", ...pick(corpo, ["date", "marca", "tipo", "tema", "notas"]), criadoEm: new Date().toISOString() };
        const ref = await db.collection("emails").add(novo);
        return json({ id: ref.id, ...novo });
      }
      if (id && !acao) {
        if (m === "GET") { const e = await lerEmail(id); return json({ ...e, preview: e.copy ? linkPreview(id) : null }); }
        if (m === "PUT") { await db.doc(`emails/${id}`).set(pick(corpo, CAMPOS_EMAIL), { merge: true }); return json(await lerEmail(id)); }
        if (m === "DELETE") { await db.doc(`emails/${id}`).delete(); return json({ ok: true }); }
      }
      if (id && m === "POST") {
        const e = await lerEmail(id);
        if (acao === "gerar") {
          await db.doc(`emails/${id}`).set({ status: "gerando", erro: null }, { merge: true });
          await dispararBg("/bg/emails-gerar", { emailId: id, ...pick(corpo, ["instrucao", "soImagem"]) });
          return json({ ok: true });
        }
        if (acao === "aprovar") return json({ ok: true, msg: await aprovarEmail(e) });
        if (acao === "telegram") { await enviarEmailAprovacao(e); return json({ ok: true }); }
        if (acao === "enviar") { await dispararBg("/bg/emails-enviar", { emailId: id, tema: e.tema }); return json({ ok: true }); }
        if (acao === "teste") {
          const para = process.env.EMAIL_AVISO || process.env.EMAIL_RESPOSTA || "hfformulas@gmail.com";
          const r = await fetch("https://api.resend.com/emails", { method: "POST", headers: { authorization: `Bearer ${process.env.RESEND_API_KEY}`, "content-type": "application/json" },
            body: JSON.stringify({ from: process.env.EMAIL_REMETENTE_MKT || "Grupo HF <contato@hfformulas.com.br>", to: [para], subject: "[TESTE] " + (e.copy?.assunto || e.tema), html: renderEmail(e, { nome: "Juliana", descadastro: "#" }) }) });
          if (!r.ok) throw new Error("Resend: " + (await r.text()));
          return json({ ok: true, msg: "Teste enviado para " + para });
        }
      }
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
