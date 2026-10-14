// Página "não quero mais receber" + descadastro com um clique (List-Unsubscribe).
import { descadastrar, tokenDescOk } from "../lib/emailmkt.mjs";

const pagina = (titulo, corpo) => new Response(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${titulo}</title></head>
<body style="margin:0;font-family:Arial,sans-serif;background:#F2F2F2"><div style="max-width:440px;margin:12vh auto;background:#fff;border-radius:12px;padding:32px;text-align:center;border-top:6px solid #BE0002">
<img src="/brand/logo.png" alt="Grupo HF" style="height:56px"><h1 style="font-size:22px">${titulo}</h1>${corpo}</div></body></html>`, { headers: { "content-type": "text/html; charset=utf-8" } });

export default async (req) => {
  const u = new URL(req.url);
  const email = (u.searchParams.get("e") || "").toLowerCase();
  const t = u.searchParams.get("t");
  if (!tokenDescOk(email, t)) return pagina("Link inválido", "<p>Este link não é válido.</p>");
  if (req.method === "POST") {
    await descadastrar(email);
    return pagina("Pronto, você saiu da lista", `<p style="color:#444">O e-mail <b>${email.replace(/</g, "")}</b> não vai mais receber promoções e novidades do Grupo HF.</p>`);
  }
  return pagina("Não quer mais receber?", `<p style="color:#444">Confirme para parar de receber promoções e novidades no e-mail <b>${email.replace(/</g, "")}</b>.</p>
<form method="post"><button style="background:#BE0002;color:#fff;border:0;border-radius:8px;padding:14px 24px;font-size:16px;font-weight:bold;cursor:pointer">Não quero mais receber</button></form>`);
};

export const config = { path: "/descadastrar" };
