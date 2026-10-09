import { mkdir, copyFile, cp } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
const require = createRequire(import.meta.url);
const source = path.dirname(require.resolve("pdfjs-dist/package.json"));
const destination = path.resolve(import.meta.dirname, "../public/pdfjs");
await mkdir(destination, { recursive: true });
await copyFile(
  path.join(source, "build/pdf.worker.min.mjs"),
  path.join(destination, "worker.mjs"),
);
for (const folder of ["standard_fonts", "cmaps", "wasm"])
  await cp(path.join(source, folder), path.join(destination, folder), {
    recursive: true,
  });
