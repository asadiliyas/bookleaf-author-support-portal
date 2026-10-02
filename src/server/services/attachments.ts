import "server-only";
import type { TicketAttachment } from "@/lib/api-types";
import { ATTACHMENT_MAX_BYTES, ATTACHMENT_MAX_FILES, ATTACHMENT_MIME_TYPES } from "@/lib/domain/constants";
import type { AuthContext } from "../auth/actor";
import { systemDb } from "../db/clients";
import { check, conflict, forbidden, notFound, validationError } from "../http/errors";

const BUCKET = "ticket-attachments";
const SIGNED_URL_TTL_SECONDS = 60 * 10;

export async function listAttachments({ db }: AuthContext, ticketId: string): Promise<TicketAttachment[]> {
  const rows = check(
    await db
      .from("ticket_attachments")
      .select("id, storage_path, file_name, mime_type, size_bytes, created_at")
      .eq("ticket_id", ticketId)
      .order("created_at", { ascending: true }),
    "list attachments",
  );
  if (rows.length === 0) return [];

  // Rows were read through RLS, so the caller is allowed to see these files.
  const { data: signed } = await systemDb()
    .storage.from(BUCKET)
    .createSignedUrls(rows.map((r) => r.storage_path), SIGNED_URL_TTL_SECONDS);
  const urlByPath = new Map((signed ?? []).map((s) => [s.path, s.signedUrl]));

  return rows.map((r) => ({
    id: r.id,
    fileName: r.file_name,
    mimeType: r.mime_type,
    sizeBytes: r.size_bytes,
    url: urlByPath.get(r.storage_path) ?? null,
    createdAt: r.created_at,
  }));
}

function safeFileName(name: string): string {
  const cleaned = name.normalize("NFKD").replace(/[^\w.\- ]+/g, "").trim().replace(/\s+/g, "-");
  return cleaned.slice(-80) || "file";
}

/** Uploads files to a private bucket. Only the ticket's author can attach. */
export async function addAttachments(ctx: AuthContext, ticketId: string, files: File[]): Promise<TicketAttachment[]> {
  const { actor, db } = ctx;
  if (actor.role !== "author") throw forbidden("Only the ticket's author can add attachments.");

  const ticket = check(
    await db.from("tickets").select("id, author_id, status").eq("id", ticketId).maybeSingle(),
    "load ticket",
  );
  if (!ticket) throw notFound("Ticket");
  if (ticket.status === "closed") throw conflict("This ticket is closed.");

  if (files.length === 0) throw validationError("Attach at least one file.", [{ path: "files", message: "No files" }]);

  const sys = systemDb();
  const existing = await sys
    .from("ticket_attachments")
    .select("id", { count: "exact", head: true })
    .eq("ticket_id", ticketId);
  if ((existing.count ?? 0) + files.length > ATTACHMENT_MAX_FILES) {
    throw validationError(`A ticket can have at most ${ATTACHMENT_MAX_FILES} attachments.`);
  }

  for (const file of files) {
    if (!(ATTACHMENT_MIME_TYPES as readonly string[]).includes(file.type)) {
      throw validationError(`${file.name}: only PNG, JPEG, WebP and PDF files are allowed.`, [
        { path: "files", message: "Unsupported file type" },
      ]);
    }
    if (file.size > ATTACHMENT_MAX_BYTES) {
      throw validationError(`${file.name} is larger than 5 MB.`, [{ path: "files", message: "File too large" }]);
    }
  }

  for (const file of files) {
    const path = `${ticket.author_id}/${ticketId}/${crypto.randomUUID()}-${safeFileName(file.name)}`;
    const upload = await sys.storage.from(BUCKET).upload(path, file, { contentType: file.type, upsert: false });
    if (upload.error) throw new Error(`Storage upload failed: ${upload.error.message}`);
    check(
      await sys.from("ticket_attachments").insert({
        ticket_id: ticketId,
        author_id: ticket.author_id,
        storage_path: path,
        file_name: file.name.slice(0, 200),
        mime_type: file.type,
        size_bytes: file.size,
      }),
      "record attachment",
    );
  }

  return listAttachments(ctx, ticketId);
}
