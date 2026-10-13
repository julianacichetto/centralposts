// Firebase (só Firestore, plano gratuito), imagens no Netlify Blobs, utilidades e configuração.
import admin from "firebase-admin";
import { getStore } from "@netlify/blobs";

export function fb() {
  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: (process.env.FIREBASE_PRIVATE_KEY || "").replace(/\\n/g, "\n"),
      }),
    });
  }
  return { db: admin.firestore() };
}
export const midia = () => getStore("midia");

// ---------- datas (fuso de São Paulo) ----------
export function dataSP(offsetDias = 0) {
  const d = new Date(Date.now() + offsetDias * 86400000);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(d);
}
export function horaSP() {
  return Number(new Intl.DateTimeFormat("en-GB", { timeZone: "America/Sao_Paulo", hour: "2-digit", hour12: false }).format(new Date()));
}
export const dataBR = (iso) => { const [, m, d] = iso.split("-"); return `${d}/${m}`; };

// ---------- respostas ----------
export const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });

// Dispara uma função em segundo plano (geração/publicação), sem esperar terminar.
export async function dispararBg(path, body) {
  const base = process.env.SITE_URL;
  if (!base) throw new Error("Falta a variável SITE_URL");
  const r = await fetch(`${base}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-internal": process.env.INTERNAL_SECRET || "" },
    body: JSON.stringify(body),
  });
  if (r.status >= 400) throw new Error(`Falha ao disparar ${path}: ${r.status}`);
}
export const internoOk = (req) =>
  !!process.env.INTERNAL_SECRET && req.headers.get("x-internal") === process.env.INTERNAL_SECRET;

// ---------- imagens (Netlify Blobs, servidas em /img/...) ----------
export async function salvarArquivo(buf, path, contentType = "image/jpeg") {
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  await midia().set(path, ab, { metadata: { contentType } });
  return `${process.env.SITE_URL}/img/${path}`;
}
export async function baixarB64(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Não consegui baixar ${url} (${r.status})`);
  const mime = (r.headers.get("content-type") || "image/png").split(";")[0];
  return { mime, b64: Buffer.from(await r.arrayBuffer()).toString("base64") };
}

// ---------- configuração ----------
export const CONFIG_PADRAO = {
  estilo:
    "Premium pharmacy advertising campaign look, like a professional agency piece: bright clean white and light grey background " +
    "with a softly blurred modern pharmacy or laboratory environment, large glossy crimson red (#BE0002) curved wave shapes sweeping " +
    "in from the corners, one photorealistic hero image with studio lighting, soft reflections and shallow depth of field, " +
    "bold heavy sans-serif typography in black with red accents, red rounded banners with white text, red circular icon badges. " +
    "Clean composition with generous margins, high-end and trustworthy.",
  aprovador: "",
  whatsappExibido: "(19) 98804-2330",
  site: "hfformulas.com.br",
  instagram: "",
  hashtags: "#farmaciademanipulacao #manipulados #hfformulas #farmacia #saude",
  proibidas: [
    "cura", "curar", "milagre", "milagroso", "garantido", "garantia de resultado", "100%", "emagrece", "emagrecer",
    "perca peso", "queima gordura", "elimina", "antes e depois", "sem efeitos colaterais", "sem contraindicação",
    "estimula o crescimento", "aumenta a densidade", "trata ", "tratamento definitivo", "resultado em",
  ],
  logoUrl: "",
  estiloRefUrl: "",
  pendente: null,
  aguardandoAjuste: false,
};

export async function lerConfig() {
  const { db } = fb();
  const snap = await db.doc("config/main").get();
  const cfg = { ...CONFIG_PADRAO, ...(snap.exists ? snap.data() : {}) };
  if (!cfg.logoUrl) cfg.logoUrl = `${process.env.SITE_URL}/brand/logo.png`;
  return cfg;
}
export async function salvarConfig(parcial) {
  const { db } = fb();
  await db.doc("config/main").set(parcial, { merge: true });
}

// ---------- posts ----------
export async function lerPost(id) {
  const { db } = fb();
  const s = await db.doc(`posts/${id}`).get();
  if (!s.exists) throw new Error("Post não encontrado");
  return { id: s.id, ...s.data() };
}
export async function salvarPost(id, parcial) {
  const { db } = fb();
  await db.doc(`posts/${id}`).set({ ...parcial, atualizadoEm: new Date().toISOString() }, { merge: true });
}
export async function postsDoDia(iso) {
  const { db } = fb();
  const q = await db.collection("posts").where("date", "==", iso).get();
  return q.docs.map((d) => ({ id: d.id, ...d.data() }));
}
