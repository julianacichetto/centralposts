// Textos (Claude API) e artes (OpenAI gpt-image-2, com fallback Nano Banana).
import Jimp from "jimp";

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

export async function gerarCopy(post, cfg, aviso = "", viral = null) {
  let refViral = "";
  if (viral?.insight) {
    refViral = `\n\nReferências de posts virais do nicho (use como modelagem de estilo e estrutura, não copie o conteúdo):
Cenas visuais que funcionam: ${(viral.cenas_frequentes || []).slice(0, 3).join("; ")}
Estrutura de carrossel observada: ${(viral.estrutura_carrossel || []).slice(0, 2).join(" | ")}
Ganchos virais: ${(viral.ganchos || []).slice(0, 3).join(" | ")}
Tom predominante: ${viral.tom_legenda || ""}
Insight: ${viral.insight}`;
  }
  const user = `${contexto(post, cfg)}${refViral}\n\n${aviso}\nRetorne neste formato: ${ESQUEMA}`;
  return claude(REGRAS, user);
}

// Analisa posts virais do Instagram com Claude Vision e extrai padrões de conteúdo.
// posts: [{ hashtag, caption, imgB64?, imgMime?, mediaType, permalink }]
export async function analisarPadroes(posts) {
  if (!posts?.length) return null;
  const content = [
    {
      type: "text",
      text: `Você é um analista de conteúdo viral do Instagram. Analise estes ${posts.length} posts que estão viralizando no nicho de farmácia de manipulação e saúde no Brasil.\n\nObserve: estilo visual, o que aparece nas imagens, como o carrossel é organizado, o gancho da legenda, o tom da escrita.\n\nRetorne SOMENTE o JSON com os padrões extraídos.`,
    },
  ];
  for (const p of posts.slice(0, 10)) {
    if (p.imgB64 && p.imgMime) {
      content.push({ type: "image", source: { type: "base64", media_type: p.imgMime, data: p.imgB64 } });
    }
    content.push({ type: "text", text: `Hashtag: #${p.hashtag} | Tipo: ${p.mediaType}\nLegenda: ${p.caption.slice(0, 400)}` });
  }
  const esquema = `{"padroes_visuais":["..."],"estrutura_carrossel":["..."],"ganchos":["..."],"tom_legenda":"...","cenas_frequentes":["..."],"insight":"..."}`;
  content.push({ type: "text", text: `\nRetorne SOMENTE este JSON: ${esquema}` });

  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.CLAUDE_MODEL || "claude-sonnet-5-5",
      max_tokens: 2000,
      messages: [{ role: "user", content }],
    }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error("Claude Vision: " + (j.error?.message || r.status));
  const txt = (j.content || []).map((c) => c.text || "").join("");
  const ini = txt.indexOf("{"), fim = txt.lastIndexOf("}");
  if (ini < 0) return null;
  return JSON.parse(txt.slice(ini, fim + 1));
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
const MASTER_ART_DIRECTION = `You are a senior art director for a luxury Brazilian compounding pharmacy brand, creating premium social media visuals that look like high-end advertising agency composites.

BACKGROUND & ATMOSPHERE:
- Warm ivory/cream background (#F5EFE6) with a soft gradient — lighter, almost glowing at the center.
- SIGNATURE ELEMENT: dramatic flowing deep crimson silk fabric (rich red #8B0000 to #CC0000) sweeping in large billowing waves — entering from the top-right corner, arching gracefully through the center-right of the frame, adding movement, luxury and brand energy.
- DEPTH ACCENT: soft-focus dark red or burgundy foliage/botanical leaves blurred in the upper-left background corner, adding organic depth without competing with the main content.
- PRODUCT GLOW: a warm golden spotlight radiating subtly from the lower-center area, giving a premium luminous halo effect to the product arrangement.

LOGO AREA:
- Leave the top-center area clean and uncluttered — NO logo, NO brand mark, NO text in that zone. The logo will be composited later.

PRODUCT PHOTOGRAPHY (lower half of the frame):
- Products rest on a warm travertine or veined marble stone surface.
- Unlabeled pharmaceutical items — mix of: white frosted pill bottle with white cap, amber glass dropper bottle with black rubber dropper cap, clear glass cream jar with white cream visible, white foil sachê packet, loose white/beige capsules scattered naturally, small clear glass petri dish with white powder.
- Professional studio lighting: soft fill light from the left, warm key light from the right, subtle reflections on glass and glossy surfaces, shallow depth of field with front items sharp and background items slightly soft.
- Arrangement: layered depth, items at varying heights, slight natural overlaps — like a premium editorial product shot.
- NO text, logos, labels or printed markings on any product.

TYPOGRAPHY (render exactly as specified — no improvisation):
- Main headline: large bold condensed black sans-serif, centered horizontally, proportional and legible — NOT oversized, text should feel balanced within the composition, not fill the entire frame.
- Emphasis word(s) (the "destaque"): same bold weight as the headline but in deep crimson red #BE0002.
- CTA faixa banner: a dark crimson rounded pill/capsule shape (#7A0000), white bold uppercase text centered inside, with a › arrow at the right end.
- Icon rows: each row has a crimson circle badge (#BE0002) with a simple white line icon inside, followed by black bold uppercase text to its right.
- Page indicator (if present): small discreet text top-right corner.
- CRITICAL: spell every single word EXACTLY as given. Correct all Brazilian Portuguese accents. Do not add, remove or change any word.

MANDATORY RULES:
- No text, brand marks or labels on any product packaging.
- No fake medical claims, prices, percentages or treatment promises.
- No watermarks, stock photo signatures or extra logos beyond HF.
- Final result must look like it was created by a top advertising agency — premium, editorial, luxury pharmacy aesthetic.`;

const LAYOUT_VARIANTS = [
  // slide 1 — capa: foto hero em tela cheia, texto sobreposto na metade inferior
  `LAYOUT — COVER (slide 1): Full-bleed cinematic hero photo occupying the entire frame. Text and logo float over the image. Place the Leave top-center area clear. Headline in the lower-center third, very large, with a semi-transparent dark overlay strip behind the text if needed for contrast. Red faixa banner at the very bottom edge.`,
  // slide 2 — conteúdo: split vertical, foto à direita, texto à esquerda em fundo creme
  `LAYOUT — SPLIT (slide 2): Vertical split composition. LEFT half: cream (#F5EFE6) background with the headline, destaque in red, and icon rows stacked neatly. RIGHT half: the hero photo, slightly cropped, with the crimson silk flowing across the dividing line connecting both halves. Leave top-left area clear.`,
  // slide 3 — conteúdo: tipografia dominante, foto como textura de fundo desfocada
  `LAYOUT — TYPOGRAPHY-FIRST (slide 3): The hero photo is used as a blurred, darkened full-frame background texture (opacity ~30%). The entire foreground is a large, confident typographic composition: massive headline centered, icon rows below, red faixa banner. Bold graphic design feel — text is the hero. Leave top-center area clear.`,
  // slide 4 — conteúdo: foto dominante, legenda pequena embaixo
  `LAYOUT — PHOTO-DOMINANT (slide 4): The hero photo occupies the top 65% of the frame in sharp detail, editorial style. A clean cream (#F5EFE6) panel in the bottom 35% contains the headline and icon rows. Red silk flows from the photo area into the cream panel as a transition. Leave top-center area clear.`,
  // slide 5 — CTA: design limpo, sem foto, foco no vermelho e chamada
  `LAYOUT — CTA CLOSE (slide 5): Clean, brand-focused design with NO hero scene photo. Cream background with the crimson silk as the main decorative element (large, dramatic). Center: the headline very bold. Below: icon rows for WhatsApp and site. Red faixa banner prominent. Feels like a premium brand closing card.`,
];

export function promptImagem(slide, { cfg, tipo, n, total, ajuste, openai = false }) {
  const formato = tipo === "story" ? "vertical Instagram Story (9:16)" : "Instagram feed post (4:5)";
  if (openai) {
    // Seleciona layout pelo índice do slide (n começa em 1); para foto única usa layout neutro
    const layoutIdx = total > 1 ? Math.min(n - 1, LAYOUT_VARIANTS.length - 1) : 0;
    const layout = total > 1 ? LAYOUT_VARIANTS[layoutIdx] : `LAYOUT — SINGLE PHOTO: balanced composition, hero photo upper half, text lower half, Leave top-center area clear.`;
    const linhas = [
      MASTER_ART_DIRECTION,
      ``,
      `CREATE: a finished ${formato} graphic. Style override if different from above: ${cfg.estilo}`,
      ``,
      layout,
      ``,
      `HERO IMAGE: ${slide.cena || "pharmacy related still life"}. Photorealistic, no text or labels on any object.`,
      ``,
      `TEXT — render EXACTLY these words in Brazilian Portuguese with correct accents, nothing else:`,
      `• Headline (very large, heavy bold sans-serif, black, uppercase): "${slide.titulo}"${slide.destaque ? ` — the word(s) "${slide.destaque}" in crimson red #BE0002` : ""}.`,
      slide.faixa ? `• Red rounded banner (#BE0002) with white bold uppercase text: "${slide.faixa}".` : "",
      slide.itens?.length
        ? `• ${slide.itens.length} icon rows — each: a red circle (#BE0002) with simple white line icon + black bold uppercase text: ${slide.itens.map((i) => `"${i}"`).join(", ")}.`
        : "",
      tipo !== "story" && total > 1 ? `• Small discreet page indicator top-right: "${n}/${total}".` : "",
      ``,
      `STRICT RULES: Do NOT add any other text, prices, percentages, slogans, fake labels or medical claims. Spell every word exactly as given. Final image must look like it was shot and finished by a high-end advertising team.`,
      ajuste ? `ADJUSTMENT: ${ajuste}` : "",
    ];
    return linhas.filter(Boolean).join("\n");
  }
  // Nano Banana (with attached reference images)
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

async function composLogoReal(buf, logoB64, logoMime) {
  try {
    const [base, logo] = await Promise.all([
      Jimp.read(buf),
      Jimp.read(Buffer.from(logoB64, "base64")),
    ]);
    const logoW = Math.round(base.bitmap.width * 0.18);
    logo.resize(logoW, Jimp.AUTO);
    const x = Math.round((base.bitmap.width - logo.bitmap.width) / 2);
    const y = Math.round(base.bitmap.height * 0.025);
    base.composite(logo, x, y, { mode: Jimp.BLEND_SOURCE_OVER, opacitySource: 1, opacityDest: 1 });
    return base.getBufferAsync(Jimp.MIME_JPEG);
  } catch {
    return buf; // se falhar, retorna sem logo
  }
}

export async function gerarImagem(prompt, refs, aspect) {
  if (process.env.OPENAI_API_KEY) {
    // OpenAI gpt-image-2 — gera a arte sem logo, depois compõe o logo real
    const size = aspect === "9:16" ? "1024x1792" : "1024x1024";
    const model = process.env.OPENAI_IMAGE_MODEL || "gpt-image-2";
    const r = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: { "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`, "content-type": "application/json" },
      body: JSON.stringify({ model, prompt, n: 1, size, output_format: "jpeg" }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error("OpenAI: " + (j.error?.message || r.status));
    let buf = Buffer.from(j.data[0].b64_json, "base64");
    if (refs?.[0]?.b64) buf = await composLogoReal(buf, refs[0].b64, refs[0].mime);
    return buf;
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
