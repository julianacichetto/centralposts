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
