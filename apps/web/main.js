import { formatAskView, setBusy } from "./ui.js";

const API = import.meta.env.VITE_API_URL ?? "http://127.0.0.1:3000";

async function api(path, options = {}) {
  const response = await fetch(`${API}${path}`, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error?.message ?? response.statusText);
  }
  return data;
}

function showError(el, error) {
  if (!el) return;
  el.textContent = error instanceof Error ? error.message : String(error);
  el.classList.add("error");
}

function clearStatus(el) {
  if (!el) return;
  el.textContent = "";
  el.classList.remove("error");
}

document.getElementById("upload").addEventListener("click", async () => {
  const button = document.getElementById("upload");
  const status = document.getElementById("upload-status");
  const fileInput = document.getElementById("file");
  const file = fileInput.files?.[0];
  clearStatus(status);
  if (!file) {
    showError(status, new Error("Choose a file first."));
    return;
  }
  setBusy(button, true, "Uploading…");
  try {
    const form = new FormData();
    form.append("file", file);
    const uploaded = await api("/api/v1/documents", { method: "POST", body: form });
    status.textContent = uploaded.duplicate
      ? "Duplicate detected — reusing existing document."
      : "Processing…";
    const processed = await api(`/api/v1/documents/${uploaded.document.id}/process`, {
      method: "POST",
    });
    document.getElementById("upload-result").textContent = JSON.stringify(
      { ...uploaded, processed },
      null,
      2,
    );
    status.textContent = "Upload complete.";
    await loadDocs();
  } catch (error) {
    showError(status, error);
  } finally {
    setBusy(button, false);
  }
});

async function loadDocs() {
  const list = document.getElementById("doc-list");
  const empty = document.getElementById("docs-empty");
  try {
    const docs = await api("/api/v1/documents");
    list.innerHTML = "";
    if (!docs.length) {
      empty.classList.remove("hidden");
      return;
    }
    empty.classList.add("hidden");
    for (const doc of docs) {
      const li = document.createElement("li");
      li.textContent = `${doc.filename} (${doc.status}) — ${doc.id}`;
      list.appendChild(li);
    }
  } catch (error) {
    empty.classList.add("hidden");
    list.innerHTML = "";
    const li = document.createElement("li");
    li.className = "error";
    li.textContent = error instanceof Error ? error.message : String(error);
    list.appendChild(li);
  }
}

document.getElementById("refresh").addEventListener("click", loadDocs);

document.getElementById("ask").addEventListener("click", async () => {
  const button = document.getElementById("ask");
  const status = document.getElementById("ask-status");
  const answerEl = document.getElementById("ask-answer");
  const citationsEl = document.getElementById("ask-citations");
  clearStatus(status);
  answerEl.textContent = "";
  citationsEl.innerHTML = "";
  const query = document.getElementById("question").value.trim();
  if (!query) {
    showError(status, new Error("Enter a question."));
    return;
  }
  setBusy(button, true, "Asking…");
  try {
    const result = await api("/api/v1/ask", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query }),
    });
    const view = formatAskView(result);
    answerEl.textContent = view.answer;
    status.textContent =
      view.status === "ok"
        ? "Answer ready."
        : view.status === "blocked"
          ? "Query blocked."
          : "Insufficient evidence.";
    for (const citation of view.citations) {
      const li = document.createElement("li");
      li.textContent = citation;
      citationsEl.appendChild(li);
    }
  } catch (error) {
    showError(status, error);
  } finally {
    setBusy(button, false);
  }
});

document.getElementById("metrics").addEventListener("click", async () => {
  const button = document.getElementById("metrics");
  const status = document.getElementById("metrics-status");
  clearStatus(status);
  setBusy(button, true, "Loading…");
  try {
    const result = await api("/api/v1/metrics");
    document.getElementById("metrics-result").textContent = JSON.stringify(result, null, 2);
    status.textContent = "Metrics loaded.";
  } catch (error) {
    showError(status, error);
  } finally {
    setBusy(button, false);
  }
});

loadDocs().catch((error) => {
  const empty = document.getElementById("docs-empty");
  empty.classList.add("hidden");
  showError(document.getElementById("docs-empty"), error);
});
