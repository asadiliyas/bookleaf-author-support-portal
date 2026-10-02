import { noContent, route } from "@/server/http/route";
import { logout } from "@/server/services/auth";

/** POST /api/v1/auth/logout: ends the session and clears the cookie. */
export const POST = route({ roles: ["author", "admin"] }, async () => {
  await logout();
  return noContent();
});
