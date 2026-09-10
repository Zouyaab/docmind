const API = import.meta.env.VITE_API_URL ?? "http://127.0.0.1:3000";

async function api(path, options = {}) {
  const response = await fetch(`${API}${path}`, options);
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.error?.message ?? response.statusText);
  }
  return data;
}

document.getElementById("upload").addEventListener("click", async () => {
  const fileInput = document.getElementById("file");
  const file = fileInput.files?.[0];
  if (!file) {
    return;
  }
  const form = new FormData();
  form.append("file", file);
  const doc = await api("/api/v1/documents", { method: "POST", body: form });
  const processed = await api(`/api/v1/documents/${doc.id}/process`, { method: "POST" });
  document.getElementById("upload-result").textContent = JSON.stringify(
    { document: doc, processed },
    null,
    2,
  );
  await loadDocs();
});

async function loadDocs() {
  const docs = await api("/api/v1/documents");
  const list = document.getElementById("doc-list");
  list.innerHTML = "";
  for (const doc of docs) {
    const li = document.createElement("li");
    li.textContent = `${doc.filename} (${doc.status}) — ${doc.id}`;
    list.appendChild(li);
  }
}

document.getElementById("refresh").addEventListener("click", loadDocs);
document.getElementById("ask").addEventListener("click", async () => {
  const query = document.getElementById("question").value;
  const result = await api("/api/v1/ask", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
  document.getElementById("ask-result").textContent = JSON.stringify(result, null, 2);
});

document.getElementById("metrics").addEventListener("click", async () => {
  const result = await api("/api/v1/metrics");
  document.getElementById("metrics-result").textContent = JSON.stringify(result, null, 2);
});

loadDocs().catch(console.error);
