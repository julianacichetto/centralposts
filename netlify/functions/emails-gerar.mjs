// Segundo plano: escreve o e-mail (Claude), gera a imagem de capa (Nano Banana) e manda para aprovação.
import { fb, internoOk, lerConfig, baixarB64, salvarArquivo } from "../lib/base.mjs";
import { gerarImagem } from "../lib/criacao.mjs";
import { gerarCopyEmail, promptCapa } from "../lib/emailmkt.mjs";
import { enviarEmailAprovacao, avisar } from "../lib/telegram.mjs";

export default async (req) => {
  if (!internoOk(req)) return new Response("proibido", { status: 403 });
  const { emailId, instrucao, soImagem } = await req.json();
  const { db } = fb();
  const ref = db.doc(`emails/${emailId}`);
  let em;
  try {
    em = { id: emailId, ...(await ref.get()).data() };
    const cfg = await lerConfig();
    await ref.set({ status: "gerando", erro: null }, { merge: true });
    if (!soImagem) {
      em.copy = await gerarCopyEmail(em, instrucao);
      await ref.set({ copy: em.copy }, { merge: true });
    }
    const precisaImagem = soImagem || !em.capaUrl || /imagem|foto|capa/i.test(instrucao || "");
    if (precisaImagem) {
      const refs = [await baixarB64(cfg.logoUrl)];
      const buf = await gerarImagem(promptCapa(em, cfg), refs, "16:9");
      em.capaUrl = await salvarArquivo(buf, `emails/${emailId}/capa-${Date.now()}.jpg`);
    }
    // Fotos por bloco (boas-vindas: uma por marca)
    const blocos = em.copy?.blocos || [];
    for (let i = 0; i < blocos.length; i++) {
      if (!blocos[i].cena || (blocos[i].img && !precisaImagem)) continue;
      const p = [`Wide 4:3 photograph for an email section. Style: ${cfg.estilo}`, `Scene: ${blocos[i].cena}. Photorealistic, premium lighting.`, `ABSOLUTELY NO text, letters, logos or labels.`].join("\n");
      const b = await gerarImagem(p, [], "4:3");
      blocos[i].img = await salvarArquivo(b, `emails/${emailId}/bloco-${i + 1}-${Date.now()}.jpg`);
    }
    if (blocos.length) await ref.set({ copy: em.copy }, { merge: true });
    await ref.set({ capaUrl: em.capaUrl || null, status: "aguardando" }, { merge: true });
    try { await enviarEmailAprovacao(em); } catch (e) { await ref.set({ erro: "Pronto, mas o aviso falhou: " + e.message }, { merge: true }); }
  } catch (e) {
    console.error(e);
    await ref.set({ status: "erro", erro: String(e.message || e) }, { merge: true });
    await avisar(`⚠️ Falha ao gerar o e-mail "${em?.tema || emailId}": ${e.message}`).catch(() => {});
  }
  return new Response("ok");
};

export const config = { path: "/bg/emails-gerar", background: true };
