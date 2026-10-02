import { badRequest } from "@/server/http/errors";
import { json, parseId, route } from "@/server/http/route";
import { addAttachments, listAttachments } from "@/server/services/attachments";
import { getTicket } from "@/server/services/tickets";

type Params = { ticketId: string };

/** GET /api/v1/tickets/:ticketId/attachments: files with short-lived signed URLs. */
export const GET = route<Params>({ roles: ["author", "admin"] }, async (ctx) => {
  const id = parseId(ctx.params.ticketId, "Ticket");
  await getTicket(ctx, id);
  return json({ items: await listAttachments(ctx, id) });
});

/** POST /api/v1/tickets/:ticketId/attachments: multipart upload (field "files", up to 3 × 5 MB). */
export const POST = route<Params>({ roles: ["author"] }, async (ctx) => {
  const id = parseId(ctx.params.ticketId, "Ticket");
  let form: FormData;
  try {
    form = await ctx.req.formData();
  } catch {
    throw badRequest("Expected multipart/form-data with one or more 'files' fields.");
  }
  const files = form.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  return json({ items: await addAttachments(ctx, id, files) }, { status: 201 });
});
