// Todo dia às 8h (São Paulo): publica o que foi aprovado e avisa o que ficou sem aprovação.
import { dataSP, postsDoDia, dispararBg, lerConfig } from "../lib/base.mjs";
import { waTexto } from "../lib/meta.mjs";

export default async () => {
  const hoje = dataSP(0);
  const cfg = await lerConfig();
  for (const p of await postsDoDia(hoje)) {
    if (p.status === "aprovado") await dispararBg("/bg/publicar", { postId: p.id });
    else if (p.status === "aguardando" && cfg.aprovador)
      await waTexto(cfg.aprovador, `⏰ O post de hoje (${p.tema}) ainda não foi aprovado, então não publiquei. Responda *SIM* que eu publico na hora.`).catch(() => {});
  }
  return new Response("ok");
};

// 11:00 UTC = 08:00 em São Paulo (UTC-3)
export const config = { schedule: "0 11 * * *" };
