import { buildOpenApiDocument } from "@/server/openapi";

/** GET /api/v1/openapi.json: OpenAPI 3.1 spec (public, no data). */
export async function GET(req: Request) {
  const origin = new URL(req.url).origin;
  return Response.json(buildOpenApiDocument(origin), { headers: { "Cache-Control": "public, max-age=300" } });
}
