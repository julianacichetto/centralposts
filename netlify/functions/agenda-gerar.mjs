// Todo dia às 18h (São Paulo): prepara o post de amanhã e manda para aprovação.
import { dataSP, postsDoDia, dispararBg } from "../lib/base.mjs";

export default async () => {
  const amanha = dataSP(1);
  for (const p of await postsDoDia(amanha)) {
    if (p.status === "rascunho") await dispararBg("/bg/gerar", { postId: p.id });
  }
  return new Response("ok");
};

// 21:00 UTC = 18:00 em São Paulo (UTC-3)
export const config = { schedule: "0 21 * * *" };
