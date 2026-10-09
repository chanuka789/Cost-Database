"use client";
import { useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";
export function PdfPreview({
  id,
  page,
  selected,
}: {
  id: string;
  page: number;
  selected: { itemRef: string; description: string } | null;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let disposed = false;
    let task: ReturnType<typeof import("pdfjs-dist").getDocument> | undefined;
    async function load() {
      const pdfjs = await import("pdfjs-dist");
      pdfjs.GlobalWorkerOptions.workerSrc = "/pdfjs/worker.mjs";
      task = pdfjs.getDocument({
        url: `/api/uploads/${id}/file`,
        standardFontDataUrl: "/pdfjs/standard_fonts/",
        cMapUrl: "/pdfjs/cmaps/",
        cMapPacked: true,
        wasmUrl: "/pdfjs/wasm/",
      });
      const document = await task.promise;
      if (!disposed) setPdf(document);
    }
    load().catch(() => {
      if (!disposed)
        setError("Couldn't load the PDF. Open the original file to check it.");
    });
    return () => {
      disposed = true;
      void task?.destroy();
    };
  }, [id]);
  useEffect(() => {
    if (!pdf) return;
    let disposed = false;
    let rendering: RenderTask | undefined;
    async function render() {
      const source = await pdf!.getPage(Math.min(page, pdf!.numPages));
      if (disposed || !canvas.current) return;
      const viewport = source.getViewport({ scale: 1.4 });
      const element = canvas.current;
      element.width = viewport.width;
      element.height = viewport.height;
      const context = element.getContext("2d")!;
      rendering = source.render({
        canvas: element,
        canvasContext: context,
        viewport,
      });
      await rendering.promise;
      if (disposed || !selected) return;
      const content = await source.getTextContent();
      if (disposed) return;
      const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
      const description = norm(selected.description);
      context.fillStyle = "rgba(255,190,35,0.30)";
      // Highlight matching source text, including the reference. Coordinates come from the PDF text layer.
      for (const word of content.items) {
        if (!("str" in word)) continue;
        const text = norm(word.str);
        if (
          !text ||
          !(
            word.str.trim() === selected.itemRef ||
            (text.length > 3 && description.includes(text))
          )
        )
          continue;
        const [x, y] = viewport.convertToViewportPoint(
          word.transform[4],
          word.transform[5],
        );
        const height = Math.max(word.height * viewport.scale, 9);
        context.fillRect(
          x,
          y - height,
          word.width * viewport.scale,
          height + 3,
        );
      }
    }
    render().catch((e) => {
      if (!disposed && e?.name !== "RenderingCancelledException")
        setError("Couldn't render this page. Open the original file.");
    });
    return () => {
      disposed = true;
      rendering?.cancel();
    };
  }, [pdf, page, selected]);
  return (
    <div className="overflow-auto bg-qs-raised p-2">
      {error ? (
        <p role="alert" className="p-4 text-[13px] text-qs-danger">
          {error}
        </p>
      ) : null}
      {!pdf && !error ? (
        <p className="p-4 text-[13px] text-qs-text-muted">
          Loading source page…
        </p>
      ) : null}
      <canvas
        ref={canvas}
        className="h-auto w-full bg-white"
        aria-label={`Original BOQ page ${page}${selected ? `, matching source text highlighted for item ${selected.itemRef}` : ""}`}
      />
    </div>
  );
}
