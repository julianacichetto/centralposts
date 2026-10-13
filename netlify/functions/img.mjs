// Serve as imagens geradas (link público usado pelo Instagram, WhatsApp e painel).
import { midia } from "../lib/base.mjs";

export default async (req) => {
  const chave = decodeURIComponent(new URL(req.url).pathname.replace(/^\/img\//, ""));
  if (!chave || chave.includes("..")) return new Response("não encontrado", { status: 404 });
  const r = await midia().getWithMetadata(chave, { type: "arrayBuffer" });
  if (!r) return new Response("não encontrado", { status: 404 });
  return new Response(r.data, {
    headers: { "content-type": r.metadata?.contentType || "image/jpeg", "cache-control": "public, max-age=31536000, immutable" },
  });
};

export const config = { path: "/img/*" };
