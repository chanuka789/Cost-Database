import { afterEach, describe, expect, it } from "vitest";
import { createDecipheriv, randomBytes } from "node:crypto";
import { costFor, sameNumbers, suggestionsSchema, columnMappingSchema, providerSchema } from "./ai-validation";
import { encryptKey, encryptionReady } from "./ai-keys";
const previous = process.env.AI_KEYS_ENCRYPTION_KEY;
afterEach(() => { if (previous === undefined) delete process.env.AI_KEYS_ENCRYPTION_KEY; else process.env.AI_KEYS_ENCRYPTION_KEY = previous; });
describe("AI safeguards", () => {
  it("encrypts with authenticated AES-GCM; tampering fails", () => {
    const key = randomBytes(32); process.env.AI_KEYS_ENCRYPTION_KEY = key.toString("base64");
    const encrypted = encryptKey("test-secret-1234");
    expect(encrypted).not.toContain("test-secret");
    const [, nonce, ciphertext, tag] = encrypted.split(":");
    const decrypt = (bytes: Buffer) => { const d = createDecipheriv("aes-256-gcm", key, Buffer.from(nonce, "base64")); d.setAAD(Buffer.from("qsgs-ai-key-v1")); d.setAuthTag(Buffer.from(tag, "base64")); return Buffer.concat([d.update(bytes), d.final()]).toString(); };
    expect(decrypt(Buffer.from(ciphertext, "base64"))).toBe("test-secret-1234");
    const damaged = Buffer.from(ciphertext, "base64"); damaged[0] ^= 1;
    expect(() => decrypt(damaged)).toThrow();
  });
  it("fails closed when the master key is absent", () => { delete process.env.AI_KEYS_ENCRYPTION_KEY; expect(encryptionReady()).toBe(false); expect(() => encryptKey("key")).toThrow(); });
  it("rejects numeric fields and dimension changes", () => {
    expect(suggestionsSchema.safeParse({ suggestions: [{ itemId: "i", kind: "TEXT", proposed: "Pavers", reason: "Typo", rate: 5 }] }).success).toBe(false);
    expect(sameNumbers("60mm pavrs C30", "60mm pavers C30")).toBe(true);
    expect(sameNumbers("60mm pavrs C30", "80mm pavers C30")).toBe(false);
    expect(sameNumbers("ISO 9001, 60mm", "60mm ISO 9001")).toBe(false);
  });
  it("rejects ambiguous column mappings", () => { expect(columnMappingSchema.safeParse({ reference: null, description: "Work", quantity: "Count", unit: "Count", rate: "Price", amount: null }).success).toBe(false); });
  it("requires public HTTPS configuration and excludes URL credentials", () => {
    const p = { name: "Example", type: "CUSTOM", baseUrl: "https://user:secret@example.com/v1", model: "model", priority: 0, inputPrice: 1, outputPrice: 2, monthlyBudget: 1, dataPolicy: "Reviewed policy" };
    expect(providerSchema.safeParse(p).success).toBe(false);
    expect(providerSchema.safeParse({ ...p, baseUrl: "http://example.com" }).success).toBe(false);
  });
  it("calculates provider-specific estimated token costs", () => { expect(costFor(1000, 500, 1, 2)).toBe(.002); });
});
