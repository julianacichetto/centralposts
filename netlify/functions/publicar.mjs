// Função em segundo plano: publica o feed (carrossel ou foto) e o story no Instagram.
import { internoOk, lerPost, salvarPost, lerConfig } from "../lib/base.mjs";
import { publicarFeed, publicarStory, waTexto } from "../lib/meta.mjs";

export default async (req) => {
  if (!internoOk(req)) return new Response("proibido", { status: 403 });
  const { postId } = await req.json();
  const cfg = await lerConfig().catch(() => ({}));
  let post;
  try {
    post = await lerPost(postId);
    if (post.status === "publicado" || post.status === "publicando") return new Response("já foi");
    await salvarPost(postId, { status: "publicando", erro: null });

    const feedId = post.igFeedId || (await publicarFeed(post));
    await salvarPost(postId, { igFeedId: feedId });
    let storyId = post.igStoryId || null;
    let avisoStory = "";
    try {
      storyId = storyId || (await publicarStory(post));
    } catch (e) {
      avisoStory = `\n⚠️ O story falhou: ${e.message}`;
    }
    await salvarPost(postId, { status: "publicado", igStoryId: storyId, publicadoEm: new Date().toISOString() });
    if (cfg.aprovador) await waTexto(cfg.aprovador, `✅ Publicado no Instagram: ${post.tema}${storyId ? " (feed + story)" : ""}${avisoStory}`).catch(() => {});
  } catch (e) {
    console.error(e);
    await salvarPost(postId, { status: "erro", erro: String(e.message || e) }).catch(() => {});
    if (cfg.aprovador) await waTexto(cfg.aprovador, `⚠️ Não consegui publicar "${post?.tema || postId}": ${e.message}`).catch(() => {});
  }
  return new Response("ok");
};

export const config = { path: "/bg/publicar", background: true };
