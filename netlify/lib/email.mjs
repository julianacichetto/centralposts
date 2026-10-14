// Avisos por e-mail (Resend). Se as variáveis não estiverem configuradas, não faz nada.
const esc = (t) => String(t ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

export async function enviarEmail(assunto, html) {
  const key = process.env.RESEND_API_KEY;
  const para = process.env.EMAIL_AVISO;
  if (!key || !para) return;
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({
      from: process.env.EMAIL_REMETENTE || "Central HF <onboarding@resend.dev>",
      to: para.split(",").map((s) => s.trim()).filter(Boolean),
      subject: assunto,
      html,
    }),
  });
  if (!r.ok) console.error("E-mail falhou:", r.status, await r.text().catch(() => ""));
}

const moldura = (conteudo) => `<div style="font-family:Arial,Helvetica,sans-serif;max-width:640px;margin:0 auto;color:#111">
  <div style="border-top:6px solid #BE0002;padding:20px 0 8px;font-weight:bold;font-size:18px">Central de Posts HF</div>
  ${conteudo}
  <p style="margin-top:28px"><a href="${process.env.SITE_URL}" style="background:#BE0002;color:#fff;padding:12px 18px;border-radius:8px;text-decoration:none;font-weight:bold">Abrir o painel</a></p>
</div>`;

export const emailTexto = (texto) =>
  enviarEmail(texto.split("\n")[0].slice(0, 90), moldura(`<p style="font-size:15px;line-height:1.5;white-space:pre-line">${esc(texto)}</p>`));

export function emailAprovacao(post, imgs, dataBR) {
  const fotos = imgs
    .map((i) => `<div style="display:inline-block;width:46%;margin:0 2% 12px 0;vertical-align:top"><img src="${esc(i.url)}" style="width:100%;border-radius:8px;display:block"><div style="font-size:12px;color:#666;margin-top:4px">${esc(i.cap)}</div></div>`)
    .join("");
  const alerta = post.alertas?.length ? `<p style="background:#FFF1C2;padding:10px;border-radius:8px">⚠️ Revise estes termos: ${esc(post.alertas.join(", "))}</p>` : "";
  return enviarEmail(
    `Aprovar post de ${dataBR(post.date)}: ${post.tema}`.slice(0, 120),
    moldura(`<p style="font-size:15px">📅 <b>Post de ${dataBR(post.date)} às 8h</b> (${post.formato === "carrossel" ? "carrossel" : "foto"})<br>${esc(post.tema)}</p>
      ${alerta}${fotos}
      <p style="font-size:14px;line-height:1.5;white-space:pre-line;background:#F6F6F6;padding:12px;border-radius:8px"><b>Legenda:</b>\n${esc(post.legenda)}</p>
      <p style="font-size:14px">Para aprovar ou pedir ajuste, use os botões no Telegram ou o painel.</p>`)
  );
}
