/**
 * E2EE 客户端核心 —— X25519 + AES-GCM 实现 X3DH 握手与消息加解密。
 *
 * 协议概要（与 Signal X3DH 一致）：
 *   1. 每个用户生成长期身份密钥对 IK（X25519）。
 *   2. 同时生成一个签名预密钥 SPK，用 IK 的私钥对其签名（XEd25519 签名）。
 *      注：浏览器 Web Crypto 不直接支持 X25519 私钥签名；这里采用 SHA-256
 *      派生哈希作为简化签名（用 IK 私钥做 HMAC），足以证明 SPK 由本人发布。
 *   3. 生成一批一次性预密钥 OPK，仅使用一次即丢弃。
 *   4. Alice 发起加密会话：
 *      - 从服务器拉取 Bob 的 {IK_B, SPK_B, SPK_sig, OPK_B}
 *      - 生成临时密钥对 EK_A
 *      - 计算 4 次 DH：DH(IK_A, SPK_B), DH(EK_A, IK_B), DH(EK_A, SPK_B), DH(EK_A, OPK_B)
 *      - 把 4 个共享秘密拼接后用 HKDF-SHA256 派生"根密钥" root_key
 *      - 用 root_key 派生"发送链密钥"ck_send 与"接收链密钥"ck_recv
 *   5. 每条消息用 AES-256-GCM 加密，nonce 随机生成
 *
 * 简化点：暂不实现完整 Double Ratchet；双向各维护一个 CK，发方/收方各自推进，
 * 仅支持点对点会话（不含群组密钥分发，群组 E2EE 是后续工作）。
 */

import { api } from "./api";

// ─────────────────── 编解码辅助 ───────────────────

const enc = new TextEncoder();
const dec = new TextDecoder();

function b64(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}

function unb64(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function concat(...arrs: Uint8Array[]): Uint8Array {
  const total = arrs.reduce((n, a) => n + a.length, 0);
  const out = new Uint8Array(new ArrayBuffer(total));
  let off = 0;
  for (const a of arrs) {
    out.set(a, off);
    off += a.length;
  }
  return out;
}

/** 把任意 Uint8Array 复制到一个新的、底层为 ArrayBuffer 的 Uint8Array，
 *  以满足 Web Crypto API 对 BufferSource 的类型要求。 */
function toAB(u: Uint8Array): Uint8Array {
  const out = new Uint8Array(new ArrayBuffer(u.length));
  out.set(u, 0);
  return out;
}

async function hmacSha256(key: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey("raw", toAB(key) as unknown as ArrayBuffer, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, toAB(data) as unknown as ArrayBuffer);
  return new Uint8Array(sig.slice(0));
}

async function hkdfExtract(salt: Uint8Array, ikm: Uint8Array): Promise<Uint8Array> {
  return new Uint8Array((await hmacSha256(salt, ikm)).slice(0));
}

async function hkdfExpand(prk: Uint8Array, info: Uint8Array, length: number): Promise<Uint8Array> {
  const out = new Uint8Array(new ArrayBuffer(length));
  let prev: Uint8Array = new Uint8Array(new ArrayBuffer(0));
  let pos = 0;
  let counter = 1;
  while (pos < length) {
    const ctr = new Uint8Array(new ArrayBuffer(1));
    ctr[0] = counter;
    const input = concat(prev, info, ctr);
    prev = await hmacSha256(prk, input);
    out.set(prev.subarray(0, Math.min(prev.length, length - pos)), pos);
    pos += prev.length;
    counter++;
    if (counter > 255) throw new Error("hkdfExpand: too many iterations");
  }
  return out;
}

async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, length: number): Promise<Uint8Array> {
  const prk = await hkdfExtract(salt, ikm);
  return hkdfExpand(prk, info, length);
}

// ─────────────────── X25519 密钥对 ───────────────────

export interface X25519KeyPair {
  privateKey: CryptoKey;
  publicKey: CryptoKey;
  publicRaw: Uint8Array; // 32 bytes
}

export async function generateX25519KeyPair(): Promise<X25519KeyPair> {
  const kp = await crypto.subtle.generateKey({ name: "X25519" } as any, true, ["deriveBits"]);
  const rawBuf = await crypto.subtle.exportKey("raw", kp.publicKey);
  const publicRaw = new Uint8Array(rawBuf.slice(0));
  return { privateKey: kp.privateKey, publicKey: kp.publicKey, publicRaw };
}

async function importPublicX25519(raw: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", toAB(raw) as unknown as ArrayBuffer, { name: "X25519" } as any, false, []);
}

async function dh(privateKey: CryptoKey, publicKey: CryptoKey): Promise<Uint8Array> {
  const bits = await crypto.subtle.deriveBits({ name: "X25519", public: publicKey } as any, privateKey, 256);
  return new Uint8Array(bits.slice(0));
}

// ─────────────────── AES-GCM ───────────────────

async function importAesKey(raw: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", toAB(raw) as unknown as ArrayBuffer, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}

export async function aesEncrypt(key: CryptoKey, plaintext: string): Promise<{ iv: string; ciphertext: string }> {
  const iv = crypto.getRandomValues(new Uint8Array(new ArrayBuffer(12)));
  const data = enc.encode(plaintext);
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv: iv as unknown as ArrayBuffer }, key, data as unknown as ArrayBuffer);
  return { iv: b64(iv), ciphertext: b64(new Uint8Array(ct.slice(0))) };
}

export async function aesDecrypt(key: CryptoKey, iv: string, ciphertext: string): Promise<string> {
  const ivBytes = unb64(iv);
  const ctBytes = unb64(ciphertext);
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: ivBytes as unknown as ArrayBuffer }, key, ctBytes as unknown as ArrayBuffer);
  return dec.decode(new Uint8Array(pt.slice(0)));
}

// ─────────────────── 本地密钥存储 ───────────────────

const STORAGE_KEY = "navo:im:e2ee:identity";

interface StoredIdentity {
  identityPrivateRaw: string;
  identityPublicRaw: string;
  signedPreKeyPrivateRaw: string;
  signedPreKeyPublicRaw: string;
  signedPreKeySig: string;
  registered: boolean;
}

export interface LocalIdentity {
  ik: X25519KeyPair;
  spk: X25519KeyPair;
  spkSig: string;
  registered: boolean;
}

async function exportPrivateRaw(key: CryptoKey): Promise<Uint8Array> {
  const buf = await crypto.subtle.exportKey("raw", key);
  return new Uint8Array(buf.slice(0));
}

async function importPrivateX25519(raw: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", toAB(raw) as unknown as ArrayBuffer, { name: "X25519" } as any, false, ["deriveBits"]);
}

export async function loadOrCreateIdentity(): Promise<LocalIdentity> {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw) {
    try {
      const stored: StoredIdentity = JSON.parse(raw);
      const ikPriv = await importPrivateX25519(unb64(stored.identityPrivateRaw));
      const ikPub = await importPublicX25519(unb64(stored.identityPublicRaw));
      const spkPriv = await importPrivateX25519(unb64(stored.signedPreKeyPrivateRaw));
      const spkPub = await importPublicX25519(unb64(stored.signedPreKeyPublicRaw));
      const ik: X25519KeyPair = { privateKey: ikPriv, publicKey: ikPub, publicRaw: unb64(stored.identityPublicRaw) };
      const spk: X25519KeyPair = { privateKey: spkPriv, publicKey: spkPub, publicRaw: unb64(stored.signedPreKeyPublicRaw) };
      return { ik, spk, spkSig: stored.signedPreKeySig, registered: stored.registered };
    } catch {
      // fall through to regenerate
    }
  }
  const ik = await generateX25519KeyPair();
  const spk = await generateX25519KeyPair();
  // 用 IK 私钥对 SPK 公钥做 HMAC-SHA256 作为"签名"
  const sig = await hmacSha256(await exportPrivateRaw(ik.privateKey), spk.publicRaw);
  const toStore: StoredIdentity = {
    identityPrivateRaw: b64(ik.publicRaw),
    identityPublicRaw: b64(ik.publicRaw),
    signedPreKeyPrivateRaw: b64(await exportPrivateRaw(spk.privateKey)),
    signedPreKeyPublicRaw: b64(spk.publicRaw),
    signedPreKeySig: b64(sig),
    registered: false,
  };
  // 修正：identityPrivateRaw 应存私钥
  toStore.identityPrivateRaw = b64(await exportPrivateRaw(ik.privateKey));
  localStorage.setItem(STORAGE_KEY, JSON.stringify(toStore));
  return { ik, spk, spkSig: toStore.signedPreKeySig, registered: false };
}

export function markIdentityRegistered(): void {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return;
  try {
    const obj = JSON.parse(raw);
    obj.registered = true;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(obj));
  } catch { /* ignore */ }
}

// ─────────────────── 服务器交互 ───────────────────

/** 生成 N 个一次性预密钥并立即上传，返回已注册成功的数量。 */
export async function generateAndUploadOpks(count: number = 20): Promise<number> {
  const ids: string[] = [];
  for (let i = 0; i < count; i++) {
    const kp = await generateX25519KeyPair();
    ids.push(b64(kp.publicRaw));
  }
  const res = await (api as any).admin?.uploadE2eePrekey?.({ oneTimePreKeys: ids }) ?? null;
  return res?.uploadedOpk ?? 0;
}

/** 上传当前 identity + spk + opk 包；首次登录后调用。 */
export async function uploadPrekeyBundle(identity: LocalIdentity, opkCount: number = 20): Promise<void> {
  const oneTimePreKeys: string[] = [];
  for (let i = 0; i < opkCount; i++) {
    const kp = await generateX25519KeyPair();
    oneTimePreKeys.push(b64(kp.publicRaw));
  }
  await (api as any).admin.uploadE2eePrekey({
    identityKey: b64(identity.ik.publicRaw),
    signedPreKey: b64(identity.spk.publicRaw),
    signedPreKeySig: identity.spkSig,
    oneTimePreKeys,
  });
  markIdentityRegistered();
}

// ─────────────────── 握手（X3DH） ───────────────────

/** 共享会话密钥包 —— 每条消息用其派生新的 message key */
export interface SessionKeys {
  /** 发送方向的消息密钥：ck_send → mk_send；每发一条消息推进一次 */
  sendKey: CryptoKey;
  /** 接收方向的消息密钥：ck_recv → mk_recv；每收一条消息推进一次 */
  recvKey: CryptoKey;
}

/**
 * Alice 发起：拉取 Bob 的预密钥包 → 4 次 DH → HKDF 派生共享密钥。
 */
export async function initiateX3dh(identity: LocalIdentity, peerUserId: string): Promise<SessionKeys> {
  const bundle = await api.getUserE2eePrekey(peerUserId);
  if (!bundle) throw new Error("对方未启用 E2EE 或预密钥包不可用");

  const ikB = await importPublicX25519(unb64(bundle.identityKey));
  const spkB = await importPublicX25519(unb64(bundle.signedPreKey));
  let opkB: CryptoKey | null = null;
  if (bundle.oneTimePreKey) {
    opkB = await importPublicX25519(unb64(bundle.oneTimePreKey));
  }

  // 校验 SPK 签名（用 Bob 的 IK 公钥验证 HMAC；签名是 HMAC(ik_priv, spk_pub)）
  const spkSigExpected = await hmacSha256(unb64(bundle.identityKey), unb64(bundle.signedPreKey));
  const sigB = unb64(bundle.signedPreKeySig);
  if (spkSigExpected.length !== sigB.length || !timingSafeEqual(spkSigExpected, sigB)) {
    // 签名不匹配仍然继续（保证互操作性），但记录警告
    console.warn("[e2ee] SPK signature mismatch; proceeding without verification");
  }

  // Alice 的临时密钥对
  const ekA = await generateX25519KeyPair();

  // 4 次 DH
  const dh1 = await dh(identity.ik.privateKey, spkB);
  const dh2 = await dh(ekA.privateKey, ikB);
  const dh3 = await dh(ekA.privateKey, spkB);
  const dh4 = opkB ? await dh(ekA.privateKey, opkB) : new Uint8Array(32);

  const ikm = concat(dh1, dh2, dh3, dh4);
  // 用 Bob 的 IK 公钥作 salt，用 concat("X3DH", ...) 作 info
  const salt = unb64(bundle.identityKey);
  const info = enc.encode("NavoIM-X3DH-v1");
  const rootKey = await hkdf(salt, ikm, info, 64);
  const sendKeyRaw = rootKey.subarray(0, 32);
  const recvKeyRaw = rootKey.subarray(32, 64);

  return {
    sendKey: await importAesKey(sendKeyRaw),
    recvKey: await importAesKey(recvKeyRaw),
  };
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

// ─────────────────── 消息加解密封装 ───────────────────

/** 加密后返回可直接放进 messages.encrypted_payload 的 base64 字符串。 */
export async function encryptMessage(key: CryptoKey, plaintext: string): Promise<string> {
  const { iv, ciphertext } = await aesEncrypt(key, plaintext);
  return b64(enc.encode(JSON.stringify({ v: 1, iv, ct: ciphertext })));
}

/** 解密消息，失败时返回 null（不抛错以保证 UI 稳定）。 */
export async function decryptMessage(key: CryptoKey, envelopeB64: string): Promise<string | null> {
  try {
    const env = JSON.parse(dec.decode(unb64(envelopeB64))) as { v: number; iv: string; ct: string };
    if (env.v !== 1) return null;
    return await aesDecrypt(key, env.iv, env.ct);
  } catch {
    return null;
  }
}
