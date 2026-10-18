/**
 * PDF text extraction and cue detection.
 *
 * Uses pdf-parse, which reads the text layer only. A scanned or image-only PDF
 * has no text layer, and we say so plainly instead of pretending we read it.
 * OCR is out of scope for this prototype; the response explains the limitation
 * and the workspace sends the user back to manual entry.
 */
import pdfParse from "pdf-parse";

export const MAX_PDF_BYTES = 12 * 1024 * 1024; // 12 MB
const MAX_PREVIEW_CHARS = 6000;

export function looksLikePdf(buffer) {
  if (!buffer || buffer.length < 5) return false;
  // "%PDF-"
  return (
    buffer[0] === 0x25 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x44 &&
    buffer[3] === 0x46 &&
    buffer[4] === 0x2d
  );
}

function classify(err) {
  const msg = String(err?.message || err || "").toLowerCase();
  if (msg.includes("password") || msg.includes("encrypted")) {
    return {
      code: "pdf_encrypted",
      title: "This PDF is password protected",
      detail:
        "We cannot open a document that is locked. Re-export or print the unlocked version to PDF and upload that.",
    };
  }
  if (msg.includes("no /font") || msg.includes("not a pdf") || msg.includes("invalid")) {
    return {
      code: "pdf_invalid",
      title: "This file could not be read as a PDF",
      detail: "The file is either damaged or not really a PDF. Try exporting it again from the original application.",
    };
  }
  return {
    code: "pdf_unreadable",
    title: "The PDF could not be parsed",
    detail:
      "Something went wrong while reading the document structure. If this keeps happening with other PDFs, the file is probably damaged.",
  };
}

/**
 * Reads the text layer and reports what could not be done, so the caller can
 * render an honest result state.
 */
export async function extractPdf(buffer, originalName = "document.pdf") {
  const notices = [];

  if (!looksLikePdf(buffer)) {
    return {
      ok: false,
      code: "not_a_pdf",
      title: "That file is not a PDF",
      detail: `The file "${originalName}" does not begin with a PDF header. If you meant to upload a document, choose a .pdf file.`,
    };
  }

  if (buffer.length > MAX_PDF_BYTES) {
    return {
      ok: false,
      code: "pdf_too_large",
      title: "That PDF is too large",
      detail: `The file is ${(buffer.length / 1024 / 1024).toFixed(1)} MB. The limit is ${MAX_PDF_BYTES / 1024 / 1024} MB. Split the document, or remove scanned images and upload the text-heavy part.`,
    };
  }

  let parsed;
  try {
    parsed = await pdfParse(buffer);
  } catch (err) {
    return { ok: false, ...classify(err) };
  }

  const text = (parsed.text || "").replace(/\u0000/g, "").trim();
  const pages = parsed.numpages || 0;
  const charCount = text.length;

  if (charCount === 0) {
    return {
      ok: false,
      code: "no_text_layer",
      title: "This PDF contains no selectable text",
      detail:
        "This usually means the document is a scan of photographs rather than a digital PDF. Optical character recognition is not available in this build, so nothing could be read. The quickest route is to type the facts into the case narrative, or to scan the pages with a text layer and upload the result.",
      pages,
      ocrAvailable: false,
    };
  }

  if (charCount < 80) {
    notices.push({
      tone: "warn",
      text: `Only ${charCount} characters of text were found. This PDF may be mostly images with a little text, so extraction may be incomplete.`,
    });
  }

  return {
    ok: true,
    file: { name: originalName, bytes: buffer.length, pages },
    pages,
    charCount,
    wordCount: text.split(/\s+/).filter(Boolean).length,
    text,
    preview: text.slice(0, MAX_PREVIEW_CHARS),
    truncated: charCount > MAX_PREVIEW_CHARS,
    notices,
    extraction: "text-layer",
    notSupported: [
      "Optical character recognition of scanned pages",
      "Reading handwritten notes",
      "Reading tables or form fields whose content is drawn rather than typed",
    ],
  };
}