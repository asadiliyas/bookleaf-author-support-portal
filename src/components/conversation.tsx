import { FileText, ImageIcon, Paperclip } from "lucide-react";
import type { TicketAttachment, TicketMessage } from "@/lib/api-types";
import type { Role } from "@/lib/domain/constants";
import { formatBytes, formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { BrandMark } from "./brand";
import { Avatar } from "./user-menu";

interface Props {
  viewer: Role;
  authorName: string;
  subject: string;
  description: string;
  createdAt: string;
  messages: TicketMessage[];
  attachments: TicketAttachment[];
}

/**
 * The ticket conversation, oldest first. The viewer's own side sits on the
 * right, like any messaging app; the original query is always the first entry.
 */
export function Conversation({ viewer, authorName, subject, description, createdAt, messages, attachments }: Props) {
  return (
    <ol className="space-y-5">
      <Bubble mine={viewer === "author"} sender="author" name={authorName} at={createdAt} label="Original request">
        <p className="mb-2 font-bold text-ink">{subject}</p>
        <p className="whitespace-pre-wrap">{description}</p>
        {attachments.length > 0 && <Attachments items={attachments} />}
      </Bubble>
      {messages.map((m) => (
        <Bubble key={m.id} mine={viewer === m.senderRole} sender={m.senderRole} name={m.senderName} at={m.createdAt}>
          <p className="whitespace-pre-wrap">{m.body}</p>
        </Bubble>
      ))}
    </ol>
  );
}

function Bubble({
  mine,
  sender,
  name,
  at,
  label,
  children,
}: {
  mine: boolean;
  sender: "author" | "admin";
  name: string;
  at: string;
  label?: string;
  children: React.ReactNode;
}) {
  return (
    <li className={cn("flex gap-3", mine && "flex-row-reverse")}>
      {sender === "admin" ? <BrandMark className="size-8" /> : <Avatar name={name} />}
      <div className={cn("max-w-[85%] min-w-0 sm:max-w-[75%]", mine && "items-end text-right")}>
        <p className="mb-1 text-xs text-muted-foreground">
          <span className="font-bold text-ink">{sender === "admin" ? `${name} · BookLeaf Support` : name}</span>
          {label && <span> · {label}</span>} · {formatDateTime(at)}
        </p>
        <div
          className={cn(
            "rounded-2xl px-4 py-3 text-left text-[15px] leading-relaxed text-ink",
            sender === "admin" ? "bg-white ring-1 ring-line" : "bg-blush ring-1 ring-coral-100",
            mine ? "rounded-tr-sm" : "rounded-tl-sm",
          )}
        >
          {children}
        </div>
      </div>
    </li>
  );
}

function Attachments({ items }: { items: TicketAttachment[] }) {
  return (
    <div className="mt-3 border-t border-coral-100 pt-3">
      <p className="mb-2 flex items-center gap-1 text-xs font-bold text-muted-foreground">
        <Paperclip className="size-3.5" /> Attachments
      </p>
      <ul className="flex flex-wrap gap-2">
        {items.map((a) => {
          const Icon = a.mimeType.startsWith("image/") ? ImageIcon : FileText;
          return (
            <li key={a.id}>
              <a
                href={a.url ?? undefined}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-2 rounded-lg bg-white px-3 py-1.5 text-sm ring-1 ring-line hover:ring-coral-300"
              >
                <Icon className="size-4 text-coral-600" />
                <span className="max-w-[180px] truncate font-bold">{a.fileName}</span>
                <span className="text-xs text-muted-foreground">{formatBytes(a.sizeBytes)}</span>
              </a>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
