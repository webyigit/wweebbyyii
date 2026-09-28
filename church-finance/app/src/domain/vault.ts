// 주민등록번호 금고.
//
// - 넣을 때(암호화)는 비밀번호가 필요 없다: 공개 열쇠(RSA)로 잠근다.
//   → 엑셀 가져오기·신청자 입력·(나중에) 온라인 신청서 모두 비밀번호 없이 저장 가능
// - 볼 때(복호화)는 '영수증 비밀번호'가 필요하다: 개인 열쇠가 그 비밀번호로 잠겨 있다.
// - 기기·클라우드 어디에도 주민번호 원문은 저장되지 않는다. 비밀번호도 저장되지 않는다.
// - 비밀번호를 잊으면 주민번호는 되살릴 수 없다 → 다시 받아야 함 (교회 금고에 적어 두기)
export interface VaultParams {
  v: 1;
  pub: string; // 공개 열쇠 (spki, base64)
  salt: string; // 비밀번호 → 열쇠 만들 때 쓰는 소금 (base64)
  iv: string;
  wrapped: string; // 비밀번호로 잠근 개인 열쇠 (pkcs8, base64)
}

const subtle = () => globalThis.crypto.subtle;
const ITER = 310_000;
const RSA = { name: "RSA-OAEP", hash: "SHA-256" } as const;

const b64 = (buf: ArrayBuffer | Uint8Array) => {
  const u = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = "";
  for (const c of u) s += String.fromCharCode(c);
  return btoa(s);
};
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function passKey(pass: string, salt: BufferSource) {
  const base = await subtle().importKey("raw", new TextEncoder().encode(pass), "PBKDF2", false, ["deriveKey"]);
  return subtle().deriveKey({ name: "PBKDF2", salt, iterations: ITER, hash: "SHA-256" }, base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}

async function wrap(pkcs8: ArrayBuffer, pass: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const wrapped = await subtle().encrypt({ name: "AES-GCM", iv }, await passKey(pass, salt), pkcs8);
  return { salt: b64(salt), iv: b64(iv), wrapped: b64(wrapped) };
}

/** 처음 한 번: 열쇠 한 쌍을 만들고 개인 열쇠를 비밀번호로 잠근다 */
export async function createVault(pass: string): Promise<VaultParams> {
  const pair = (await subtle().generateKey({ ...RSA, modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]) }, true, ["encrypt", "decrypt"])) as CryptoKeyPair;
  const pub = b64(await subtle().exportKey("spki", pair.publicKey));
  const pkcs8 = await subtle().exportKey("pkcs8", pair.privateKey);
  return { v: 1, pub, ...(await wrap(pkcs8, pass)) };
}

/** 비밀번호가 맞으면 개인 열쇠, 틀리면 null */
export async function unlockVault(p: VaultParams, pass: string): Promise<CryptoKey | null> {
  try {
    const pkcs8 = await subtle().decrypt({ name: "AES-GCM", iv: unb64(p.iv) }, await passKey(pass, unb64(p.salt)), unb64(p.wrapped));
    return await subtle().importKey("pkcs8", pkcs8, RSA, true, ["decrypt"]);
  } catch {
    return null;
  }
}

/** 비밀번호 바꾸기 (열쇠 쌍은 그대로 → 이미 저장된 주민번호도 그대로 열림) */
export async function changeVaultPass(p: VaultParams, oldPass: string, newPass: string): Promise<VaultParams | null> {
  const key = await unlockVault(p, oldPass);
  if (!key) return null;
  return { ...p, ...(await wrap(await subtle().exportKey("pkcs8", key), newPass)) };
}

export async function sealText(pub: string, text: string): Promise<string> {
  const key = await subtle().importKey("spki", unb64(pub), RSA, false, ["encrypt"]);
  return "r1:" + b64(await subtle().encrypt(RSA, key, new TextEncoder().encode(text)));
}

export async function openText(key: CryptoKey, sealed: string): Promise<string | null> {
  if (!sealed.startsWith("r1:")) return null;
  try {
    return new TextDecoder().decode(await subtle().decrypt(RSA, key, unb64(sealed.slice(3))));
  } catch {
    return null;
  }
}
