// E2E DM crypto: ECDH (P-256) key exchange + AES-GCM 256.
// Each user generates a key pair on first DM use; the public key (JWK) is stored on the server.
// The private key is kept in localStorage (per-device).

const PRIV_KEY_STORAGE = "cc_e2e_priv_jwk";
const PUB_KEY_STORAGE = "cc_e2e_pub_jwk";

const subtle = () => window.crypto.subtle;
const enc = new TextEncoder();
const dec = new TextDecoder();

function buf2b64(buf) {
  const bytes = new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < bytes.byteLength; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}
function b642buf(b64) {
  const s = atob(b64);
  const arr = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) arr[i] = s.charCodeAt(i);
  return arr.buffer;
}

export async function ensureKeyPair() {
  let pub = localStorage.getItem(PUB_KEY_STORAGE);
  let priv = localStorage.getItem(PRIV_KEY_STORAGE);
  if (pub && priv) return { pub: JSON.parse(pub), priv: JSON.parse(priv) };
  const kp = await subtle().generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveKey", "deriveBits"]);
  const pubJwk = await subtle().exportKey("jwk", kp.publicKey);
  const privJwk = await subtle().exportKey("jwk", kp.privateKey);
  localStorage.setItem(PUB_KEY_STORAGE, JSON.stringify(pubJwk));
  localStorage.setItem(PRIV_KEY_STORAGE, JSON.stringify(privJwk));
  return { pub: pubJwk, priv: privJwk };
}

async function importPrivate(jwk) {
  return subtle().importKey("jwk", jwk, { name: "ECDH", namedCurve: "P-256" }, false, ["deriveKey", "deriveBits"]);
}
async function importPublic(jwk) {
  return subtle().importKey("jwk", jwk, { name: "ECDH", namedCurve: "P-256" }, false, []);
}

async function deriveSharedKey(privJwk, pubJwk) {
  const priv = await importPrivate(privJwk);
  const pub = await importPublic(pubJwk);
  return subtle().deriveKey({ name: "ECDH", public: pub }, priv, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}

export async function encryptDM(plaintext, myPriv, theirPub) {
  if (!theirPub) return { content: plaintext, nonce: null }; // fallback
  try {
    const key = await deriveSharedKey(myPriv, theirPub);
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const ct = await subtle().encrypt({ name: "AES-GCM", iv }, key, enc.encode(plaintext));
    return { content: buf2b64(ct), nonce: buf2b64(iv) };
  } catch (e) {
    return { content: plaintext, nonce: null };
  }
}

export async function decryptDM(ciphertextB64, nonceB64, myPriv, theirPub) {
  if (!nonceB64) return ciphertextB64; // not encrypted
  try {
    const key = await deriveSharedKey(myPriv, theirPub);
    const iv = new Uint8Array(b642buf(nonceB64));
    const pt = await subtle().decrypt({ name: "AES-GCM", iv }, key, b642buf(ciphertextB64));
    return dec.decode(pt);
  } catch (e) {
    return "[encrypted]";
  }
}
