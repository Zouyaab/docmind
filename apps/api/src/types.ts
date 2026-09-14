import type { DocMindConfig } from "@docmind/config";
import type { LocalFsBlobStore } from "@docmind/ingestion";
import type { ErrorTracker, MetricsRegistry } from "@docmind/observability";
import type { DocMindStores, PersistenceMode, PgPool } from "@docmind/persistence";
import type { AppContext } from "./pipeline.js";

export interface ApiDeps {
  config: DocMindConfig;
  stores: DocMindStores;
  blobs: LocalFsBlobStore;
  ctx: AppContext;
  metrics: MetricsRegistry;
  errorTracker: ErrorTracker;
  persistenceMode: PersistenceMode;
  pool?: PgPool | undefined;
}
