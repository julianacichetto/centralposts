// Ações usadas tanto pelo painel quanto pelo WhatsApp.
import { salvarPost, salvarConfig, dataSP, horaSP, dataBR, dispararBg } from "./base.mjs";

// Aprova. Se a data do post já chegou e já passou das 8h, publica na hora.
export async function aprovarPost(post) {
  await salvarPost(post.id, { status: "aprovado", aprovadoEm: new Date().toISOString() });
  await salvarConfig({ pendente: null, aguardandoAjuste: false });
  const hoje = dataSP(0);
  if (post.date < hoje || (post.date === hoje && horaSP() >= 8)) {
    await dispararBg("/bg/publicar", { postId: post.id });
    return "✅ Aprovado! Como já passou do horário, estou publicando agora.";
  }
  return `✅ Aprovado! Vai ao ar dia ${dataBR(post.date)} às 8h.`;
}

export async function ajustarPost(post, instrucao) {
  await salvarConfig({ aguardandoAjuste: false });
  await dispararBg("/bg/gerar", { postId: post.id, instrucao });
  return "🔄 Ajustando. Te mando a nova versão em alguns minutos.";
}

// ---------- e-mails ----------
import { fb } from "./base.mjs";
export async function lerEmail(id) {
  const { db } = fb();
  const s = await db.doc(`emails/${id}`).get();
  if (!s.exists) throw new Error("E-mail não encontrado");
  return { id: s.id, ...s.data() };
}
export async function aprovarEmail(em) {
  const { db } = fb();
  await db.doc(`emails/${em.id}`).set({ status: "aprovado", aprovadoEm: new Date().toISOString() }, { merge: true });
  await salvarConfig({ pendente: null, aguardandoAjuste: false, pendenteTipo: null });
  const hoje = dataSP(0);
  if (em.date < hoje || (em.date === hoje && horaSP() >= 10)) {
    await dispararBg("/bg/emails-enviar", { emailId: em.id, tema: em.tema });
    return "✅ E-mail aprovado! Como já passou das 10h, estou enviando agora.";
  }
  return `✅ E-mail aprovado! Sai dia ${dataBR(em.date)} às 10h.`;
}
export async function ajustarEmail(em, instrucao) {
  await salvarConfig({ aguardandoAjuste: false });
  await dispararBg("/bg/emails-gerar", { emailId: em.id, instrucao });
  return "🔄 Ajustando o e-mail. Te mando a nova versão em alguns minutos.";
}
