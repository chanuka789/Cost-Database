import "server-only";
import { extractResultSchema, inspectResultSchema, type ExtractResult, type InspectResult } from "./extraction-schema";

/** A problem the extractor reported about the file itself (scanned PDF, wrong format…). */
export class ExtractorRejected extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

/** The extractor couldn't be reached or answered with something unexpected. */
export class ExtractorUnavailable extends Error {}

const EXTRACT_TIMEOUT_MS = 5 * 60 * 1000;
const INSPECT_TIMEOUT_MS = 60 * 1000;

async function call(path: string, file: Buffer, fileName: string, timeoutMs: number): Promise<unknown> {
  const base = process.env.EXTRACTOR_URL;
  const token = process.env.EXTRACTOR_TOKEN;
  if (!base || !token) throw new ExtractorUnavailable("The extractor isn't configured (EXTRACTOR_URL / EXTRACTOR_TOKEN).");

  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(file)]), fileName);
  let res: Response;
  try {
    res = await fetch(`${base.replace(/\/$/, "")}${path}`, {
      method: "POST",
      headers: { "x-extractor-token": token },
      body: form,
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (e) {
    const timedOut = e instanceof Error && e.name === "TimeoutError";
    throw new ExtractorUnavailable(
      timedOut ? "The extractor took too long to read this file." : "The extractor service isn't reachable. Try again in a minute.",
    );
  }
  const body = await res.json().catch(() => null);
  if (res.status === 422 && body?.code) throw new ExtractorRejected(body.code, body.message);
  if (!res.ok) throw new ExtractorUnavailable(body?.message ?? `The extractor failed (HTTP ${res.status}).`);
  return body;
}

export async function inspectFile(file: Buffer, fileName: string): Promise<InspectResult> {
  return inspectResultSchema.parse(await call("/v1/inspect", file, fileName, INSPECT_TIMEOUT_MS));
}

export async function extractFile(file: Buffer, fileName: string): Promise<ExtractResult> {
  const parsed = extractResultSchema.safeParse(await call("/v1/extract", file, fileName, EXTRACT_TIMEOUT_MS));
  if (!parsed.success) {
    console.error("Extractor returned an unexpected shape", parsed.error.issues.slice(0, 5));
    throw new ExtractorUnavailable("The extractor returned data in an unexpected format. The web app and extractor may be out of step.");
  }
  return parsed.data;
}
