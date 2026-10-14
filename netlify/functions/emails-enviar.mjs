// Segundo plano: envia o próximo lote de uma campanha (respeitando o limite diário).
import { internoOk } from "../lib/base.mjs";
import { enviarLote } from "../lib/emailmkt.mjs";
import { avisar } from "../lib/telegram.mjs";

export default async (req) => {
  if (!internoOk(req)) return new Response("proibido", { status: 403 });
  const { emailId, tema } = await req.json();
  try {
    const r = await enviarLote(emailId);
    if (r.enviados || r.fim)
      await avisar(r.fim
        ? `📧 E-mail "${tema}" enviado para todos (${r.total}).`
        : `📧 E-mail "${tema}": ${r.enviados} enviados hoje (${r.total} no total). O restante sai amanhã às 10h (aquecimento do domínio).`).catch(() => {});
  } catch (e) {
    console.error(e);
    await avisar(`⚠️ Falha no envio do e-mail "${tema}": ${e.message}`).catch(() => {});
  }
  return new Response("ok");
};

export const config = { path: "/bg/emails-enviar", background: true };
