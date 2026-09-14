import type { DocMindConfig } from "@docmind/config";
import type { FastifyInstance } from "fastify";
import { PUBLIC_PATHS } from "../schemas.js";

export function registerAuthHook(app: FastifyInstance, config: DocMindConfig): void {
  app.addHook("onRequest", async (request, reply) => {
    reply.header("x-request-id", request.id);
    if (!config.API_TOKEN) {
      return;
    }
    const path = request.url.split("?")[0] ?? request.url;
    if (PUBLIC_PATHS.has(path) || path.startsWith("/docs/")) {
      return;
    }
    const auth = request.headers.authorization;
    if (auth !== `Bearer ${config.API_TOKEN}`) {
      return reply.code(401).send({
        error: { code: "UNAUTHORIZED", message: "Invalid or missing Bearer token" },
      });
    }
  });
}
