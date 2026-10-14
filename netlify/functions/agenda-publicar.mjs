// Todo dia às 8h (São Paulo): publica o que foi aprovado e avisa o que ficou sem aprovação.
import { dataSP, postsDoDia, dispararBg } from "../lib/base.mjs";
import { avisar } from "../lib/telegram.mjs";

export default async () => {
  const hoje = dataSP(0);
  for (const p of await postsDoDia(hoje)) {
    if (p.status === "aprovado") await dispararBg("/bg/publicar", { postId: p.id });
    else if (p.status === "aguardando")
      await avisar(`⏰ O post de hoje (${p.tema}) ainda não foi aprovado, então não publiquei. Toque em ✅ Aprovar na mensagem dele que eu publico na hora.`).catch(() => {});
  }
  return new Response("ok");
};

// 11:00 UTC = 08:00 em São Paulo (UTC-3)
export const config = { schedule: "0 11 * * *" };
