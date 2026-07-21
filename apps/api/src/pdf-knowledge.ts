import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { normalizeKnowledgeContent } from "@reservation-platform/api";

export class KnowledgePdfError extends Error {
  constructor(readonly code: "invalid_pdf" | "pdf_too_large" | "pdf_page_limit" | "empty_pdf") {
    super(code);
    this.name = "KnowledgePdfError";
  }
}

export async function extractKnowledgePdf(bytes: Uint8Array): Promise<string> {
  if (!bytes.length || bytes.byteLength > 5 * 1024 * 1024) throw new KnowledgePdfError("pdf_too_large");
  let document;
  try {
    document = await getDocument({ data: bytes, isEvalSupported: false, useWorkerFetch: false }).promise;
  } catch {
    throw new KnowledgePdfError("invalid_pdf");
  }
  if (document.numPages > 100) throw new KnowledgePdfError("pdf_page_limit");
  const pages: string[] = [];
  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const text = await page.getTextContent();
    pages.push(text.items.flatMap((item) => (
      item && typeof item === "object" && "str" in item && typeof item.str === "string" ? [item.str] : []
    )).join(" "));
  }
  const content = normalizeKnowledgeContent(pages.join("\n\n"));
  if (!content || content.length > 250000) throw new KnowledgePdfError("empty_pdf");
  return content;
}
