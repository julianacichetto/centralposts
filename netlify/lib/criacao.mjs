// Textos (Claude API) e artes (OpenAI gpt-image-1, com fallback Nano Banana).

const REGRAS = `Você é o redator de redes sociais da HF Fórmulas, farmácia de manipulação no Brasil.
Escreva em português do Brasil, tom próximo, claro e profissional.

REGRAS DE PUBLICIDADE (ANVISA/CFF) — obrigatórias:
- Nunca prometa cura, resultado, emagrecimento ou efeito de tratamento.
- Nunca anuncie fórmula específica com indicação terapêutica, nem cite dosagens de medicamentos.
- Sem antes e depois, sem depoimento sobre efeito de tratamento.
- Nunca invente preços, descontos, prazos ou números. Se a nota pedir algo que não foi informado, escreva sem o dado.
- Conteúdo é educativo/institucional. Temas de saúde terminam com "converse com seu médico".
- Manipulados são feitos mediante prescrição.

FORMATO DA ARTE (cada slide vira uma imagem):
- titulo: no máximo 6 palavras, CAIXA ALTA.
- destaque: 1 a 2 palavras que já estão no título e ficarão em vermelho.
- faixa: no máximo 5 palavras, CAIXA ALTA (vai numa faixa vermelha). Pode ser "".
- itens: 0 a 4 itens, cada um com no máximo 5 palavras, CAIXA ALTA (viram ícones com texto).
- cena: descrição EM INGLÊS de uma foto realista que ilustra o slide (sem texto, sem marcas, sem embalagens com rótulo).
Carrossel = exatamente 5 slides: 1 capa (gancho forte, faixa "ARRASTE PARA O LADO" ou similar), 2 a 4 conteúdo, 5 chamada final
(titulo tipo "TEM UMA RECEITA?", faixa "ORÇAMENTO PELO WHATSAPP", itens [whatsapp, site]).
Foto única = exatamente 1 slide, completo em si.
story: versão vertical. Para carrossel, adapta a capa com faixa "POST NOVO NO PERFIL". Para foto, o mesmo conteúdo.

LEGENDA: 1ª linha = gancho; 2 a 3 linhas curtas de conteúdo; chamada para o WhatsApp; linha final com as hashtags. Emojis com moderação.

Responda SOMENTE com JSON válido, sem comentários.`;

const ESQUEMA = `{"slides":[{"titulo":"","destaque":"","faixa":"","itens":[],"cena":""}],"story":{"titulo":"","destaque":"","faixa":"","itens":[],"cena":""},"legenda":""}`;

async function claude(system, user) {
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.CLAUDE_MODEL || "claude-sonnet-5-5",
      max_tokens: 4000,
      system,
      messages: [{ role: "user", content: user }],
    }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error("Claude API: " + (j.error?.message || r.status));
  const txt = (j.content || []).map((c) => c.text || "").join("");
  const ini = txt.indexOf("{"), fim = txt.lastIndexOf("}");
  if (ini < 0 || fim < 0) throw new Error("Claude não retornou JSON");
  return JSON.parse(txt.slice(ini, fim + 1));
}

function contexto(post, cfg) {
  return `Post de ${post.date} — formato: ${post.formato === "carrossel" ? "CARROSSEL (5 slides)" : "FOTO ÚNICA (1 slide)"}
Tema: ${post.tema}
Gancho sugerido: ${post.gancho || "-"}
Notas: ${post.notas || "-"}
WhatsApp: ${cfg.whatsappExibido} | Site: ${cfg.site}${cfg.instagram ? " | Instagram: " + cfg.instagram : ""}
Hashtags padrão: ${cfg.hashtags}`;
}

export async function gerarCopy(post, cfg, aviso = "") {
  const user = `${contexto(post, cfg)}\n\n${aviso}\nRetorne neste formato: ${ESQUEMA}`;
  return claude(REGRAS, user);
}

// Revisão a partir de um pedido de ajuste (WhatsApp ou painel).
// Retorna o JSON completo + "regerar": índices dos slides (e/ou "story") cuja arte precisa ser refeita.
export async function revisarCopy(post, cfg, instrucao) {
  const atual = { slides: post.slides.map(({ url, ...s }) => s), story: (({ url, ...s }) => s)(post.story || {}), legenda: post.legenda };
  const user = `${contexto(post, cfg)}

Conteúdo atual:
${JSON.stringify(atual)}

Pedido de ajuste da responsável: "${instrucao}"

Aplique o ajuste (mantenha o resto igual) e retorne o JSON completo no mesmo formato, com o campo extra
"regerar": lista dos índices (começando em 0) dos slides cuja ARTE precisa ser refeita, e "story" se o story precisar ser refeito.
Se o pedido for só sobre a imagem (ex.: "troca a foto do slide 2"), mantenha os textos e inclua o slide em "regerar".
Se for só sobre a legenda, "regerar" fica vazio.`;
  return claude(REGRAS, user);
}

export function acharProibidas(copy, lista) {
  const tudo = JSON.stringify({ s: copy.slides, st: copy.story, l: copy.legenda }).toLowerCase();
  const letra = "a-z0-9à-öø-ÿ";
  return (lista || []).filter((p) => {
    const termo = String(p || "").trim().toLowerCase();
    if (!termo) return false;
    const re = new RegExp(`(^|[^${letra}])${termo.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}($|[^${letra}])`, "i");
    return re.test(tudo);
  });
}

// ---------- Imagens ----------
export function promptImagem(slide, { cfg, tipo, n, total, ajuste }) {
  const formato = tipo === "story" ? "vertical Instagram Story (9:16)" : "Instagram feed post (4:5)";
  const linhas = [
    `Create a finished ${formato} graphic for HF Fórmulas, a Brazilian compounding pharmacy.`,
    `VISUAL STYLE: ${cfg.estilo}`,
    `LOGO: the FIRST attached image is the brand logo. Place it at the top center, reproduced exactly (same shape and red color), not distorted, no extra text near it.`,
    cfg.estiloRefUrl ? `STYLE REFERENCE: the SECOND attached image shows the desired visual style. Copy its look (layout feel, red curves, lighting, typography weight) but NOT its words, product or claims.` : "",
    `HERO IMAGE: ${slide.cena || "pharmacy related still life"}. Photorealistic, no text or labels on any object.`,
    `TEXT — render EXACTLY these words in Brazilian Portuguese with correct accents, nothing else:`,
    `• Headline (very large, heavy bold sans-serif, black, uppercase): "${slide.titulo}"${slide.destaque ? ` — the word(s) "${slide.destaque}" in red #BE0002` : ""}.`,
    slide.faixa ? `• Red rounded banner with white bold uppercase text: "${slide.faixa}".` : "",
    slide.itens?.length
      ? `• ${slide.itens.length} short rows, each with a red circle containing a simple white line icon, followed by black bold uppercase text: ${slide.itens.map((i) => `"${i}"`).join(", ")}.`
      : "",
    tipo !== "story" && total > 1 ? `• Small discreet page indicator at the top right: "${n}/${total}".` : "",
    `Do NOT add any other words, prices, percentages, slogans, fake labels or medical claims. Every letter must be spelled exactly as given.`,
    ajuste ? `ADJUSTMENT REQUESTED: ${ajuste}` : "",
  ];
  return linhas.filter(Boolean).join("\n");
}

function acharImagem(o) {
  if (!o || typeof o !== "object") return null;
  const mime = String(o.mime_type || o.mimeType || "");
  if (typeof o.data === "string" && mime.startsWith("image/")) return o;
  if (o.inlineData) return acharImagem(o.inlineData);
  for (const v of Object.values(o)) {
    const r = acharImagem(v);
    if (r) return r;
  }
  return null;
}

export async function gerarImagem(prompt, refs, aspect) {
  if (process.env.OPENAI_API_KEY) {
    const size = aspect === "9:16" ? "1024x1536" : "1024x1024";
    if (refs.length > 0) {
      const form = new FormData();
      form.append("model", "gpt-image-1");
      form.append("prompt", prompt);
      form.append("size", size);
      form.append("quality", "high");
      form.append("output_format", "jpeg");
      form.append("n", "1");
      for (const ref of refs) {
        const buf = Buffer.from(ref.b64, "base64");
        form.append("image[]", new Blob([buf], { type: ref.mime }), "ref.jpg");
      }
      const r = await fetch("https://api.openai.com/v1/images/edits", {
        method: "POST",
        headers: { "Authorization": `Bearer ${process.env.OPENAI_API_KEY}` },
        body: form,
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error("OpenAI: " + (j.error?.message || r.status));
      const b64 = j.data?.[0]?.b64_json;
      if (!b64) throw new Error("OpenAI não retornou imagem");
      return Buffer.from(b64, "base64");
    }
    const r = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: { "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`, "content-type": "application/json" },
      body: JSON.stringify({ model: "gpt-image-1", prompt, size, quality: "high", output_format: "jpeg", n: 1 }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error("OpenAI: " + (j.error?.message || r.status));
    const b64 = j.data?.[0]?.b64_json;
    if (!b64) throw new Error("OpenAI não retornou imagem");
    return Buffer.from(b64, "base64");
  }
  // Fallback: Nano Banana
  const input = [{ type: "text", text: prompt }, ...refs.map((r) => ({ type: "image", mime_type: r.mime, data: r.b64 }))];
  const r = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
    method: "POST",
    headers: { "x-goog-api-key": process.env.GEMINI_API_KEY, "content-type": "application/json" },
    body: JSON.stringify({
      model: process.env.GEMINI_IMAGE_MODEL || "gemini-nano-banana-2.1",
      input,
      response_format: { type: "image", mime_type: "image/jpeg", aspect_ratio: aspect, image_size: "2K" },
    }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error("Nano Banana: " + (j.error?.message || r.status));
  const img = acharImagem(j);
  if (!img) throw new Error("Nano Banana não retornou imagem");
  return Buffer.from(img.data, "base64");
}
