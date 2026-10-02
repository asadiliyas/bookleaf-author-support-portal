"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, FileText, ImageIcon, Lightbulb, Loader2, Paperclip, Send, X } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useRef, useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectSeparator, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { Book, BookPortfolio, TicketDetail } from "@/lib/api-types";
import { api, errorMessage } from "@/lib/client/api";
import { ATTACHMENT_MAX_BYTES, ATTACHMENT_MAX_FILES, ATTACHMENT_MIME_TYPES, STAGE_LABELS } from "@/lib/domain/constants";
import { formatBytes, formatDate } from "@/lib/format";
import { createTicketSchema } from "@/lib/schemas";
import { z } from "zod";

const GENERAL = "general";
const formSchema = createTicketSchema.extend({ bookId: z.string() });
type FormValues = z.infer<typeof formSchema>;

export function NewTicketForm() {
  const router = useRouter();
  const params = useSearchParams();
  const queryClient = useQueryClient();
  const fileInput = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [fileError, setFileError] = useState<string | null>(null);

  const books = useQuery({ queryKey: ["me", "books"], queryFn: () => api<BookPortfolio>("/me/books") });
  const preselected = params.get("book");

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { bookId: preselected ?? GENERAL, subject: "", description: "" },
  });
  const bookId = useWatch({ control: form.control, name: "bookId" });
  const description = useWatch({ control: form.control, name: "description" }) ?? "";
  const selectedBook = books.data?.books.find((b) => b.id === bookId) ?? null;

  const submit = useMutation({
    mutationFn: async (values: FormValues) => {
      const ticket = await api<TicketDetail>("/tickets", {
        method: "POST",
        json: { ...values, bookId: values.bookId === GENERAL ? null : values.bookId },
      });
      let uploadFailed: string | null = null;
      if (files.length) {
        const body = new FormData();
        files.forEach((f) => body.append("files", f));
        try {
          await api(`/tickets/${ticket.id}/attachments`, { method: "POST", body });
        } catch (err) {
          uploadFailed = errorMessage(err);
        }
      }
      return { ticket, uploadFailed };
    },
    onSuccess: ({ ticket, uploadFailed }) => {
      queryClient.invalidateQueries({ queryKey: ["tickets"] });
      toast.success(`Request #${ticket.number} sent`, { description: "We'll reply here, and you'll see it the moment we do." });
      if (uploadFailed) toast.warning("Your request was sent, but the attachments didn't upload", { description: uploadFailed });
      router.push(`/tickets/${ticket.id}`);
    },
    onError: (err) => toast.error("Couldn't send your request", { description: errorMessage(err) }),
  });

  function addFiles(list: FileList | null) {
    if (!list) return;
    setFileError(null);
    const next = [...files];
    for (const f of Array.from(list)) {
      if (!(ATTACHMENT_MIME_TYPES as readonly string[]).includes(f.type)) {
        setFileError(`${f.name}: only PNG, JPEG, WebP or PDF files.`);
        continue;
      }
      if (f.size > ATTACHMENT_MAX_BYTES) {
        setFileError(`${f.name} is larger than 5 MB.`);
        continue;
      }
      if (next.length >= ATTACHMENT_MAX_FILES) {
        setFileError(`You can attach up to ${ATTACHMENT_MAX_FILES} files.`);
        break;
      }
      next.push(f);
    }
    setFiles(next);
    if (fileInput.current) fileInput.current.value = "";
  }

  const { errors } = form.formState;
  const published = books.data?.books.filter((b) => b.isPublished) ?? [];
  const inProduction = books.data?.books.filter((b) => !b.isPublished) ?? [];

  return (
    <div className="mx-auto max-w-5xl">
      <Link href="/tickets" className="mb-6 inline-flex items-center gap-1 text-sm text-ink-soft hover:text-ink">
        <ArrowLeft className="size-4" /> Back to my tickets
      </Link>
      <h1 className="text-3xl font-black">How can we help?</h1>
      <p className="mt-2 text-ink-soft">Tell us what&apos;s going on. A real person on the BookLeaf team reads every request.</p>

      <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_320px]">
        <form onSubmit={form.handleSubmit((v) => submit.mutate(v))} className="space-y-6 rounded-2xl border border-line bg-white p-6" noValidate>
          <div className="space-y-2">
            <Label>Which book is this about?</Label>
            <Controller
              control={form.control}
              name="bookId"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange} disabled={books.isPending}>
                  <SelectTrigger className="h-11 w-full bg-white">
                    <SelectValue placeholder={books.isPending ? "Loading your books…" : "Choose a book"} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={GENERAL}>General / Account Level</SelectItem>
                    {published.length > 0 && (
                      <>
                        <SelectSeparator />
                        <SelectGroup>
                          <SelectLabel>Published</SelectLabel>
                          {published.map((b) => (
                            <SelectItem key={b.id} value={b.id}>
                              {b.title}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </>
                    )}
                    {inProduction.length > 0 && (
                      <>
                        <SelectSeparator />
                        <SelectGroup>
                          <SelectLabel>In production</SelectLabel>
                          {inProduction.map((b) => (
                            <SelectItem key={b.id} value={b.id}>
                              {b.title} · {STAGE_LABELS[b.stage]}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </>
                    )}
                  </SelectContent>
                </Select>
              )}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="subject">Subject</Label>
            <Input id="subject" className="h-11 bg-white" placeholder="e.g. Royalty for last quarter hasn't arrived" aria-invalid={!!errors.subject} {...form.register("subject")} />
            {errors.subject && <p className="text-sm text-destructive">{errors.subject.message}</p>}
          </div>

          <div className="space-y-2">
            <div className="flex items-baseline justify-between">
              <Label htmlFor="description">Details</Label>
              <span className={`text-xs ${description.length > 5000 ? "text-destructive" : "text-muted-foreground"}`}>{description.length.toLocaleString("en-IN")} / 5,000</span>
            </div>
            <Textarea
              id="description"
              rows={8}
              className="bg-white text-[15px] leading-relaxed"
              placeholder="What happened, when, and what you expected instead. Order numbers, platform names and dates help us resolve things faster."
              aria-invalid={!!errors.description}
              {...form.register("description")}
            />
            {errors.description && <p className="text-sm text-destructive">{errors.description.message}</p>}
          </div>

          <div className="space-y-2">
            <Label>Attachments <span className="font-normal text-muted-foreground">(optional)</span></Label>
            <div
              className="flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-coral-200 bg-coral-50/50 px-4 py-5 text-center transition hover:bg-coral-50"
              onClick={() => fileInput.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                addFiles(e.dataTransfer.files);
              }}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && fileInput.current?.click()}
            >
              <Paperclip className="mb-1 size-5 text-coral-600" />
              <p className="text-sm font-bold text-ink">Drop files here or click to browse</p>
              <p className="text-xs text-muted-foreground">Photos of print defects, screenshots of listings, PDFs · up to 3 files, 5 MB each</p>
              <input ref={fileInput} type="file" multiple accept={ATTACHMENT_MIME_TYPES.join(",")} className="hidden" onChange={(e) => addFiles(e.target.files)} />
            </div>
            {fileError && <p className="text-sm text-destructive">{fileError}</p>}
            {files.length > 0 && (
              <ul className="space-y-1.5">
                {files.map((f, i) => (
                  <li key={`${f.name}-${i}`} className="flex items-center gap-2 rounded-lg bg-paper px-3 py-2 text-sm">
                    {f.type.startsWith("image/") ? <ImageIcon className="size-4 text-coral-600" /> : <FileText className="size-4 text-coral-600" />}
                    <span className="flex-1 truncate font-bold">{f.name}</span>
                    <span className="text-xs text-muted-foreground">{formatBytes(f.size)}</span>
                    <button type="button" aria-label={`Remove ${f.name}`} onClick={() => setFiles(files.filter((_, j) => j !== i))} className="rounded p-0.5 text-muted-foreground hover:bg-white hover:text-ink">
                      <X className="size-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="flex items-center justify-end gap-3 border-t border-line pt-5">
            <Button type="button" variant="ghost" className="rounded-full" onClick={() => router.back()}>
              Cancel
            </Button>
            <Button type="submit" disabled={submit.isPending} className="h-10 rounded-full px-6 font-bold">
              {submit.isPending ? <Loader2 className="animate-spin" /> : <Send />}
              Send request
            </Button>
          </div>
        </form>

        <aside className="space-y-4">
          <ContextHint book={selectedBook} nextPayout={books.data?.nextPayout} />
          <div className="rounded-2xl border border-line bg-white p-5 text-sm">
            <p className="mb-3 font-bold text-ink">What happens next</p>
            <ol className="space-y-2 text-ink-soft">
              <li><span className="font-bold text-coral-700">1.</span> Your request is routed to the right team automatically.</li>
              <li><span className="font-bold text-coral-700">2.</span> A BookLeaf team member reviews it, usually within a day (urgent payment and ISBN issues first).</li>
              <li><span className="font-bold text-coral-700">3.</span> Replies appear on the ticket instantly; no need to refresh.</li>
            </ol>
          </div>
        </aside>
      </div>
    </div>
  );
}

/** Answers the most common question before it's asked, based on the selected book. */
function ContextHint({ book, nextPayout }: { book: Book | null; nextPayout?: { cycle: string; deadline: string } }) {
  let title = "Quick facts";
  let body: React.ReactNode = (
    <>
      Royalties are calculated quarterly and paid within 45 days of each quarter ending
      {nextPayout && <> (next: <b>{nextPayout.cycle}</b> by <b>{formatDate(nextPayout.deadline)}</b>)</>}. Balances under ₹1,000 roll over to
      the next quarter.
    </>
  );
  if (book && !book.isPublished) {
    title = `${book.title} is in ${STAGE_LABELS[book.stage]}`;
    body = (
      <>
        Books move through cover design, typesetting, proofreading, ISBN assignment, printing and distribution setup. Most delays happen
        while a cover or proof is waiting for approval, so check your email for anything awaiting your reply.
      </>
    );
  } else if (book) {
    title = `${book.title}: royalty status`;
    body = book.royalty.summary;
  }
  return (
    <div className="rounded-2xl border border-coral-200 bg-blush p-5 text-sm">
      <p className="mb-2 flex items-center gap-2 font-bold text-coral-800">
        <Lightbulb className="size-4" /> {title}
      </p>
      <p className="leading-relaxed text-ink-soft">{body}</p>
    </div>
  );
}
