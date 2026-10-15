// De hora em hora: às 18h gera o e-mail de amanhã; às 10h envia os aprovados (e continua lotes pendentes).
import { fb, dataSP, horaSP, dispararBg } from "../lib/base.mjs";
import { avisar } from "../lib/telegram.mjs";

export default async () => {
  const { db } = fb();
  const h = horaSP();
  if (h === 18) {
    const q = await db.collection("emails").where("date", "==", dataSP(1)).get();
    for (const d of q.docs) if (d.get("status") === "rascunho") await dispararBg("/bg/emails-gerar", { emailId: d.id });
  }
  if (h === 10) {
    const hoje = dataSP(0);
    const q = await db.collection("emails").where("date", "==", hoje).get();
    let disparou = false; // um por vez: o limite diário é dividido por ordem de data
    for (const d of q.docs) {
      const s = d.get("status");
      if ((s === "aprovado" || s === "enviando") && !disparou) { disparou = true; await dispararBg("/bg/emails-enviar", { emailId: d.id, tema: d.get("tema") }); }
      else if (s === "aguardando" && d.get("date") === hoje)
        await avisar(`⏰ O e-mail de hoje (${d.get("tema")}) ainda não foi aprovado. Toque em ✅ Aprovar que ele sai na hora.`).catch(() => {});
    }
  }
  return new Response("ok");
};

export const config = { schedule: "0 13,21 * * *" };
