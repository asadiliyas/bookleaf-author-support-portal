import { loginSchema } from "@/lib/schemas";
import { json, parseBody, publicRoute } from "@/server/http/route";
import { login } from "@/server/services/auth";

/** POST /api/v1/auth/login: email + password → session cookie (+ bearer token). */
export const POST = publicRoute(async (req) => {
  const input = await parseBody(req, loginSchema);
  return json(await login(input));
});
