// Prévia pública (com token) do e-mail — usada no link do Telegram.
import { fb } from "../lib/base.mjs";
import { renderEmail, tokenPrevOk } from "../lib/emailmkt.mjs";

export default async (req) => {
  const u = new URL(req.url);
  const id = u.searchParams.get("id") || "";
  if (!tokenPrevOk(id, u.searchParams.get("t"))) return new Response("Link inválido", { status: 403 });
  const { db } = fb();
  const s = await db.doc(`emails/${id}`).get();
  if (!s.exists || !s.data().copy) return new Response("E-mail ainda não gerado", { status: 404 });
  return new Response(renderEmail({ id, ...s.data() }, { nome: "Juliana" }), { headers: { "content-type": "text/html; charset=utf-8" } });
};

export const config = { path: "/ver-email" };
