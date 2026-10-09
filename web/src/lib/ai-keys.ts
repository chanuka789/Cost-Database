import { createCipheriv, createHash, randomBytes } from "node:crypto";

export function encryptionReady() {
  try { return masterKey().length === 32; } catch { return false; }
}
function masterKey() {
  const encoded = process.env.AI_KEYS_ENCRYPTION_KEY ?? "";
  const key = Buffer.from(encoded, "base64");
  if (!/^[A-Za-z0-9+/]{43}=$/.test(encoded) || key.length !== 32) throw new Error("Configure AI_KEYS_ENCRYPTION_KEY as a base64-encoded 32-byte key in both services.");
  return key;
}
/** v1:nonce:ciphertext:tag; plaintext is never decrypted in the web process. */
export function encryptKey(raw: string) {
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", masterKey(), nonce);
  cipher.setAAD(Buffer.from("qsgs-ai-key-v1"));
  const encrypted = Buffer.concat([cipher.update(raw, "utf8"), cipher.final()]);
  return ["v1", nonce.toString("base64"), encrypted.toString("base64"), cipher.getAuthTag().toString("base64")].join(":");
}
export function providerFingerprint(p: { baseUrl: string; model: string; taskModels: unknown; encryptedKey: string }) {
  return createHash("sha256").update(JSON.stringify([p.baseUrl, p.model, p.taskModels, p.encryptedKey])).digest("hex");
}
