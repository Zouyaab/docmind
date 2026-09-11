/** Pure helpers for the Vite dashboard — kept testable without a browser harness. */

export function formatCitation(citation) {
  const parts = [
    citation.documentId ? `doc:${citation.documentId}` : null,
    citation.chunkId ? `chunk:${citation.chunkId}` : null,
    typeof citation.page === "number" ? `page:${citation.page}` : null,
  ].filter(Boolean);
  const header = parts.join(" · ");
  const text = citation.text ?? "";
  return header ? `${header}\n${text}` : text;
}

export function formatAskView(result) {
  if (result.injectionBlocked) {
    return {
      status: "blocked",
      answer: result.answer ?? "Query blocked.",
      citations: [],
    };
  }
  if (result.insufficientEvidence) {
    return {
      status: "insufficient",
      answer: result.answer ?? "Insufficient evidence.",
      citations: [],
    };
  }
  return {
    status: "ok",
    answer: result.answer ?? "",
    citations: Array.isArray(result.citations) ? result.citations.map(formatCitation) : [],
  };
}

export function setBusy(button, busy, busyLabel = "Working…") {
  if (!button) return;
  if (busy) {
    if (!button.dataset.label) {
      button.dataset.label = button.textContent ?? "";
    }
    button.disabled = true;
    button.textContent = busyLabel;
  } else {
    button.disabled = false;
    button.textContent = button.dataset.label || button.textContent;
  }
}
