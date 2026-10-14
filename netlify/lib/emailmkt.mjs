// E-mail marketing: campanhas, modelo HTML, envio em lotes (Resend) e descadastro.
import { createHmac, createHash } from "node:crypto";
import { fb, lerConfig, salvarConfig, dataSP } from "./base.mjs";

export const MARCAS = {
  formulas: { nome: "HF Fórmulas", desc: "Farmácia de manipulação", url: "https://hfformulas.com.br" },
  nutricao: { nome: "HF Nutrição", desc: "Suplementos", url: "https://hfnutricaoesportiva.com.br" },
  sports: { nome: "HF Sports", desc: "Moda fitness", url: "https://hfnutricaoesportiva.com.br" },
  todas: { nome: "Grupo HF", desc: "HF Fórmulas, HF Nutrição e HF Sports", url: "https://hfformulas.com.br" },
};
export const WHATS = "https://wa.me/5519988042330";
const LEGAL = "HF Nutrição Esportiva Ltda · CNPJ 50.827.813/0001-28 · Farmacêutico responsável: Fabrício Chiaparini · CRF 41.828";

// ---------- calendário inicial (terças, 10h) ----------
export const CALENDARIO_EMAILS = [
  ["2026-10-20", "todas", "boasvindas", "Boas-vindas: a partir de agora você recebe novidades, promoções e conteúdos das marcas HF (Fórmulas, Nutrição e Sports)"],
  ["2026-10-27", "formulas", "educativo", "Manipulado x industrializado: por que a fórmula sob medida faz diferença"],
  ["2026-11-03", "nutricao", "educativo", "Suplementos: como escolher e usar do jeito certo (com orientação profissional)"],
  ["2026-11-10", "formulas", "educativo", "Novembro Azul: cuidado com a saúde do homem e a importância do check-up"],
  ["2026-11-17", "sports", "oferta", "HF Sports: conheça a linha de roupas fitness", "PREENCHER: peças em destaque / condição especial"],
  ["2026-11-24", "todas", "oferta", "Black Friday Grupo HF", "PREENCHER: ofertas de cada marca e validade", "pausado"],
  ["2026-12-01", "formulas", "educativo", "Como guardar seus manipulados no verão (calor e umidade)"],
].map(([date, marca, tipo, tema, notas = "", status = "rascunho"]) => ({ date, marca, tipo, tema, notas, status }));

// ---------- tokens ----------
const hmac = (txt) => createHmac("sha256", process.env.INTERNAL_SECRET || "x").update(txt).digest("hex").slice(0, 32);
export const tokenOk = (txt, t) => !!t && hmac(txt) === t;
export const linkDescadastro = (email) => `${process.env.SITE_URL}/descadastrar?e=${encodeURIComponent(email)}&t=${hmac("unsub:" + email)}`;
export const linkPreview = (id) => `${process.env.SITE_URL}/ver-email?id=${id}&t=${hmac("prev:" + id)}`;
export const tokenDescOk = (email, t) => tokenOk("unsub:" + email, t);
export const tokenPrevOk = (id, t) => tokenOk("prev:" + id, t);
export const idContato = (email) => createHash("sha1").update(email).digest("hex");

// ---------- textos (Claude) ----------
const REGRAS = `Você escreve e-mails marketing do Grupo HF (Brasil): HF Fórmulas (farmácia de manipulação), HF Nutrição (suplementos) e HF Sports (moda fitness).
Português do Brasil, tom próximo, direto e profissional. Use {{nome}} uma vez na saudação.
REGRAS OBRIGATÓRIAS (ANVISA/CFF/CDC):
- Nunca prometa cura, emagrecimento ou resultado de saúde. Nada de antes/depois.
- Manipulados: só conteúdo educativo/institucional; nunca anunciar fórmula específica com indicação; preço de manipulado não.
- Suplementos: sem alegações terapêuticas; "consulte um nutricionista ou médico".
- Nunca invente preço, desconto, cupom, prazo ou estoque. Só use os dados das notas. Se a oferta não foi informada, não cite valores.
- Não fale em "sorteio" (exige autorização legal). Use "promoções", "novidades", "condições especiais".
- Assunto com no máximo 55 caracteres, sem caixa alta inteira, no máximo 1 emoji.
Responda SOMENTE com JSON válido.`;
const ESQUEMA = `{"assunto":"","preheader":"","titulo":"","intro":"","beneficios":["","",""],"blocos":[{"titulo":"","texto":"","link":"formulas|nutricao|whatsapp|","linkTexto":"","cena":""}],"cupom":{"codigo":"","texto":""},"cta":{"texto":"","destino":"whatsapp|formulas|nutricao"},"cena":""}`;

async function claude(user) {
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: process.env.CLAUDE_MODEL || "claude-sonnet-5-5", max_tokens: 3000, system: REGRAS, messages: [{ role: "user", content: user }] }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error("Claude API: " + (j.error?.message || r.status));
  const t = (j.content || []).map((c) => c.text || "").join("");
  return JSON.parse(t.slice(t.indexOf("{"), t.lastIndexOf("}") + 1));
}

export function gerarCopyEmail(em, instrucao) {
  const m = MARCAS[em.marca] || MARCAS.todas;
  const tipo = { boasvindas: "BOAS-VINDAS (primeiro e-mail que a pessoa recebe — caprichado e acolhedor. Título emocional e curto. Intro de 2–3 frases contando que o Grupo HF agora vai estar mais perto. 'beneficios': 3 itens curtos do que ela vai receber (ex.: promoções exclusivas, lançamentos em primeira mão, dicas de saúde e treino). 3 blocos, um por marca, NESTA ORDEM: HF Fórmulas (link formulas, linkTexto 'Conhecer a HF Fórmulas'), HF Nutrição (link nutricao, 'Ver suplementos'), HF Sports (link nutricao, 'Ver a linha fitness'); cada bloco com 2 frases e 'cena' (foto realista em inglês sem texto: laboratório/cápsulas; suplementos em bancada clara; mulher com roupa fitness treinando). Feche dizendo que é fácil sair da lista no rodapé.)", educativo: "EDUCATIVO (2 a 3 blocos curtos, útil, termina com convite para falar no WhatsApp)", oferta: "OFERTA (destaque a condição das notas; se não houver dados, apresente a linha sem citar valores)" }[em.tipo] || em.tipo;
  let user = `E-mail de ${em.date} — marca: ${m.nome} (${m.desc}). Tipo: ${tipo}.\nTema: ${em.tema}\nNotas: ${em.notas || "-"}\n`;
  if (instrucao && em.copy) user += `\nConteúdo atual: ${JSON.stringify(em.copy)}\nAjuste pedido: "${instrucao}". Aplique e mantenha o resto.\n`;
  user += `\n"cena": descrição EM INGLÊS de uma foto realista para o topo do e-mail (sem texto). Em blocos que não sejam de boas-vindas, deixe "cena" e "link" do bloco vazios. "cupom": preencha SOMENTE se as notas trouxerem um cupom; senão deixe vazio.\nFormato: ${ESQUEMA}`;
  return claude(user);
}

export function promptCapa(em, cfg) {
  return [
    `Create a wide 16:9 email header photograph for ${(MARCAS[em.marca] || MARCAS.todas).nome}, Brazilian health/wellness brand.`,
    `Style: ${cfg.estilo}`,
    `Scene: ${em.copy?.cena || em.tema}. Photorealistic, premium commercial lighting.`,
    `ABSOLUTELY NO text, letters, numbers, logos or labels anywhere in the image.`,
  ].join("\n");
}

// ---------- modelo HTML ----------
const esc = (t) => String(t ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const destinoUrl = (d) => (d === "nutricao" ? MARCAS.nutricao.url : d === "formulas" ? MARCAS.formulas.url : WHATS);

export function renderEmail(em, { nome = "", descadastro = "#" } = {}) {
  const c = em.copy || {};
  const RED = "#BE0002";
  const fill = (t) => esc(t).replace(/\{\{nome\}\}/g, esc(nome || "")).replace(/,\s*(?=[!,.])/g, "").replace(/Olá\s*,/g, "Olá,");
  const blocos = (c.blocos || []).map((b) => `<tr><td style="padding:0 32px 26px">
    ${b.img ? `<img src="${esc(b.img)}" alt="" width="536" style="display:block;width:100%;height:auto;border-radius:10px;margin-bottom:12px">` : ""}
    <div style="font-size:19px;font-weight:bold;color:#111;margin-bottom:6px">${fill(b.titulo)}</div>
    <div style="font-size:15px;line-height:1.55;color:#333">${fill(b.texto)}</div>
    ${b.link && b.linkTexto ? `<div style="margin-top:10px"><a href="${destinoUrl(b.link)}" style="color:${RED};font-weight:bold;font-size:15px;text-decoration:none">${fill(b.linkTexto)} →</a></div>` : ""}
  </td></tr>`).join("");
  const benef = (c.beneficios || []).filter(Boolean);
  const beneficios = benef.length ? `<tr><td style="padding:0 32px 26px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#FFF3F3;border-radius:10px"><tr>${benef.map((t) => `<td align="center" valign="top" width="${Math.floor(100 / benef.length)}%" style="padding:14px 8px;font-size:13px;line-height:1.35;color:#111"><div style="font-size:20px;color:${RED};font-weight:bold;margin-bottom:4px">✓</div>${fill(t)}</td>`).join("")}</tr></table></td></tr>` : "";
  const cupom = c.cupom?.codigo ? `<tr><td style="padding:0 32px 26px"><div style="border:2px dashed ${RED};border-radius:10px;padding:18px;text-align:center"><div style="font-size:14px;color:#333;margin-bottom:6px">${fill(c.cupom.texto)}</div><div style="font-size:26px;font-weight:bold;letter-spacing:2px;color:${RED}">${esc(c.cupom.codigo)}</div></div></td></tr>` : "";
  const marcas = ["formulas", "nutricao", "sports"].map((k) => `<td align="center" valign="top" width="33%" style="padding:8px"><a href="${MARCAS[k].url}" style="color:#111;text-decoration:none;font-size:13px"><b>${MARCAS[k].nome}</b><br><span style="color:#666">${MARCAS[k].desc}</span></a></td>`).join("");
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(c.assunto)}</title></head>
<body style="margin:0;background:#F2F2F2;font-family:Arial,Helvetica,sans-serif">
<div style="display:none;max-height:0;overflow:hidden">${esc(c.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F2F2F2"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#fff;border-radius:12px;overflow:hidden">
<tr><td style="background:${RED};height:6px"></td></tr>
<tr><td align="center" style="padding:24px"><img src="${process.env.SITE_URL}/brand/logo.png" alt="Grupo HF" height="56" style="display:block;height:56px"></td></tr>
${em.capaUrl ? `<tr><td><img src="${esc(em.capaUrl)}" alt="" width="600" style="display:block;width:100%;height:auto"></td></tr>` : ""}
<tr><td style="padding:28px 32px 8px"><div style="font-size:26px;line-height:1.2;font-weight:bold;color:#111">${fill(c.titulo)}</div></td></tr>
<tr><td style="padding:0 32px 20px;font-size:16px;line-height:1.55;color:#333">${fill(c.intro)}</td></tr>
${beneficios}${blocos}${cupom}
<tr><td align="center" style="padding:8px 32px 32px"><a href="${destinoUrl(c.cta?.destino)}" style="display:inline-block;background:${RED};color:#fff;font-weight:bold;font-size:16px;padding:14px 28px;border-radius:8px;text-decoration:none">${fill(c.cta?.texto || "Falar no WhatsApp")}</a></td></tr>
<tr><td style="border-top:1px solid #eee;padding:12px 16px"><table role="presentation" width="100%"><tr>${marcas}</tr></table></td></tr>
<tr><td style="background:#111;color:#bbb;font-size:11px;line-height:1.6;padding:20px 24px;text-align:center">
${esc(LEGAL)}<br>WhatsApp (19) 98804-2330 · hfformulas.com.br · hfnutricaoesportiva.com.br<br><br>
Você recebe este e-mail por ser cliente ou contato do Grupo HF.<br>
Não quer mais receber promoções e novidades? <a href="${esc(descadastro)}" style="color:#fff;font-weight:bold">Clique aqui para não receber mais</a>.
</td></tr></table></td></tr></table></body></html>`;
}

// ---------- contatos ----------
export async function importarContatos(csv) {
  const { db } = fb();
  const linhas = csv.replace(/^﻿/, "").split(/\r?\n/).filter(Boolean);
  const cab = linhas.shift().toLowerCase().split(/[;,]/).map((s) => s.trim().replace(/"/g, ""));
  const iE = cab.findIndex((c) => c.includes("mail")), iN = cab.findIndex((c) => c.includes("nome")), iG = cab.indexOf("grupo");
  if (iE < 0) throw new Error("A planilha precisa de uma coluna de e-mail");
  const sairam = new Set((await db.collection("contatos").where("ativo", "==", false).get()).docs.map((d) => d.get("email")));
  let novos = 0, total = 0, batch = db.batch(), n = 0;
  for (const l of linhas) {
    const col = l.split(/[;,](?=(?:[^"]*"[^"]*")*[^"]*$)/).map((s) => s.trim().replace(/^"|"$/g, ""));
    const email = (col[iE] || "").toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) continue;
    total++;
    const ref = db.doc(`contatos/${idContato(email)}`);
    const grupo = iG >= 0 ? col[iG] : "2_demais";
    if (sairam.has(email)) continue; // quem saiu da lista não volta
    batch.set(ref, { email, nome: (col[iN] || "").split(" ")[0], grupo, ordem: `${grupo}|${email}`, ativo: true }, { merge: true });
    if (++n === 450) { await batch.commit(); batch = db.batch(); n = 0; }
    novos++;
  }
  if (n) await batch.commit();
  return { importados: novos, linhas: total };
}

export async function resumoContatos() {
  const { db } = fb();
  const q = await db.collection("contatos").select("ativo").get();
  let ativos = 0, sairam = 0;
  q.docs.forEach((d) => (d.get("ativo") === false ? sairam++ : ativos++));
  return { total: q.size, ativos, sairam };
}

export async function descadastrar(email) {
  const { db } = fb();
  await db.doc(`contatos/${idContato(email)}`).set({ email, ativo: false, saiuEm: new Date().toISOString() }, { merge: true });
}

// ---------- envio em lotes (respeita limite diário de aquecimento) ----------
async function resendBatch(lista) {
  const r = await fetch("https://api.resend.com/emails/batch", {
    method: "POST",
    headers: { authorization: `Bearer ${process.env.RESEND_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify(lista),
  });
  if (!r.ok) throw new Error("Resend: " + (await r.text().catch(() => r.status)));
}

export async function enviarLote(emId) {
  const { db } = fb();
  const ref = db.doc(`emails/${emId}`);
  const em = { id: emId, ...(await ref.get()).data() };
  const cfg = await lerConfig();
  const hoje = dataSP(0);
  const jaHoje = cfg.envioHoje?.data === hoje ? cfg.envioHoje.qtd : 0;
  const limite = Math.max(0, Number(cfg.emailLimiteDia || 1300) - jaHoje);
  if (!limite) return { enviados: 0, fim: false, motivo: "limite diário atingido" };

  let cursor = em.cursor || "";
  const remetente = process.env.EMAIL_REMETENTE_MKT || "Grupo HF <contato@hfformulas.com.br>";
  let enviados = 0, fim = false;
  while (enviados < limite) {
    let q = db.collection("contatos").orderBy("ordem").limit(100);
    if (cursor) q = q.startAfter(cursor);
    const snap = await q.get();
    if (snap.empty) { fim = true; break; }
    const docs = snap.docs.slice(0, limite - enviados);
    const lista = docs.map((d) => d.data()).filter((c) => c.ativo !== false).map((c) => {
      const desc = linkDescadastro(c.email);
      return {
        from: remetente,
        to: [c.email],
        reply_to: process.env.EMAIL_RESPOSTA || "hfformulas@gmail.com",
        subject: (em.copy.assunto || "").replace(/\{\{nome\}\}/g, c.nome || "").trim(),
        html: renderEmail(em, { nome: c.nome, descadastro: desc }),
        headers: { "List-Unsubscribe": `<${desc}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
      };
    });
    if (lista.length) await resendBatch(lista);
    enviados += lista.length;
    cursor = docs[docs.length - 1].get("ordem");
    await ref.set({ cursor, enviados: (em.enviados || 0) + enviados, status: "enviando" }, { merge: true });
    if (snap.size < 100 && docs.length === snap.size) { fim = true; break; }
    await new Promise((r) => setTimeout(r, 700));
  }
  await salvarConfig({ envioHoje: { data: hoje, qtd: jaHoje + enviados } });
  await ref.set({ status: fim ? "enviado" : "enviando", ...(fim ? { enviadoEm: new Date().toISOString() } : {}) }, { merge: true });
  return { enviados, total: (em.enviados || 0) + enviados, fim };
}
