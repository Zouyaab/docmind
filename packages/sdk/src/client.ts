import type { DocumentRecord } from "@docmind/core";
import { DocMindError } from "@docmind/core";

export interface DocMindClientOptions {
  baseUrl: string;
  token?: string;
  fetchImpl?: typeof fetch;
}

export class DocMindClient {
  private readonly baseUrl: string;
  private readonly token?: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: DocMindClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
    if (options.token !== undefined) {
      this.token = options.token;
    }
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  private headers(extra: Record<string, string> = {}): Record<string, string> {
    const headers: Record<string, string> = { ...extra };
    if (this.token) {
      headers.Authorization = `Bearer ${this.token}`;
    }
    return headers;
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
      ...init,
      headers: this.headers(init?.headers as Record<string, string>),
    });

    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as {
        error?: { message?: string; code?: string };
      };
      throw new DocMindError(
        body.error?.code ?? "API_ERROR",
        body.error?.message ?? response.statusText,
        response.status,
      );
    }

    return response.json() as Promise<T>;
  }

  health(): Promise<{ status: string }> {
    return this.request("/api/v1/health");
  }

  version(): Promise<{ name: string; version: string }> {
    return this.request("/api/v1/version");
  }

  async upload(filename: string, bytes: Uint8Array): Promise<DocumentRecord> {
    const form = new FormData();
    form.append("file", new Blob([bytes]), filename);
    return this.request("/api/v1/documents", { method: "POST", body: form });
  }

  listDocuments(): Promise<DocumentRecord[]> {
    return this.request("/api/v1/documents");
  }

  getDocument(id: string): Promise<DocumentRecord> {
    return this.request(`/api/v1/documents/${id}`);
  }

  processDocument(id: string): Promise<{ status: string; chunks: number }> {
    return this.request(`/api/v1/documents/${id}/process`, { method: "POST" });
  }

  search(query: string, topK = 5): Promise<{ results: unknown[] }> {
    return this.request("/api/v1/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, topK }),
    });
  }

  ask(query: string, topK = 5): Promise<{ answer: string; citations: unknown[] }> {
    return this.request("/api/v1/ask", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, topK }),
    });
  }

  decide(documentId: string): Promise<unknown> {
    return this.request("/api/v1/decide", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ documentId }),
    });
  }
}
