"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ArrowUpRight, Bot, CircleCheck, Loader2, Lock, RefreshCw, Send, Sparkles, Undo2 } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { AiDraft, DraftResponse, TicketDetail } from "@/lib/api-types";
import { api, errorMessage } from "@/lib/client/api";
import { STATUS_LABELS, type TicketStatus } from "@/lib/domain/constants";
import { cn } from "@/lib/utils";

const KEEP = "keep";

/**
 * Reply editor with the AI draft built in.
 *
 * The draft is requested automatically only when the author is waiting on
 * BookLeaf (no reply yet, or the author wrote last). Otherwise the agent can
 * ask for a follow-up draft explicitly, so no tokens are spent on tickets
 * that are waiting on the author. Drafts are never sent without a human.
 */
export function ReplyComposer({ ticket }: { ticket: TicketDetail }) {
  const queryClient = useQueryClient();
  const last = ticket.messages.at(-1);
  const awaitingUs = !last || last.senderRole === "author";
  const closed = ticket.status === "closed";
  const draftKey = ["admin", "draft", ticket.id, last?.id ?? "none", ticket.category];
  const draftKeyString = draftKey.join("|");

  const cached = queryClient.getQueryData<DraftResponse>(draftKey);
  const [body, setBody] = useState(cached?.draft?.reply ?? "");
  const [usedDraft, setUsedDraft] = useState<AiDraft | null>(cached?.draft ?? null);
  const [dirty, setDirtyState] = useState(false);
  // Ref mirror so a draft arriving mid-typing never overwrites the agent's text.
  const dirtyRef = useRef(false);
  const setDirty = (v: boolean) => {
    dirtyRef.current = v;
    setDirtyState(v);
  };
  const [statusAfter, setStatusAfter] = useState<string>(defaultStatusAfter(ticket.status, cached?.draft ?? null));
  const [manualKey, setManualKey] = useState<string | null>(null);
  const [checked, setChecked] = useState<Record<string, boolean>>({});

  function applyDraft(draft: AiDraft | null, force = false) {
    if (!draft) return;
    if (dirtyRef.current && !force) return;
    setBody(draft.reply);
    setUsedDraft(draft);
    setDirty(false);
    setStatusAfter(defaultStatusAfter(ticket.status, draft));
  }

  const draft = useQuery({
    queryKey: draftKey,
    queryFn: async () => {
      const res = await api<DraftResponse>(`/tickets/${ticket.id}/draft`, { method: "POST", json: { regenerate: false } });
      applyDraft(res.draft);
      return res;
    },
    enabled: !closed && (awaitingUs || manualKey === draftKeyString),
    staleTime: Infinity,
    retry: false,
  });

  const regenerate = useMutation({
    mutationFn: () => api<DraftResponse>(`/tickets/${ticket.id}/draft`, { method: "POST", json: { regenerate: true } }),
    onSuccess: (res) => {
      queryClient.setQueryData(draftKey, res);
      if (res.draft) applyDraft(res.draft, true);
      else toast.warning("AI draft unavailable", { description: res.degraded?.message });
    },
    onError: (err) => toast.error("Couldn't regenerate", { description: errorMessage(err) }),
  });

  const send = useMutation({
    mutationFn: () =>
      api(`/tickets/${ticket.id}/messages`, {
        method: "POST",
        json: {
          body: body.trim(),
          ...(usedDraft ? { aiDraftId: usedDraft.id } : {}),
          ...(statusAfter !== KEEP ? { statusAfter } : {}),
        },
      }),
    onSuccess: () => {
      toast.success("Reply sent", { description: "The author sees it immediately." });
      setBody("");
      setUsedDraft(null);
      setDirty(false);
      setChecked({});
      queryClient.invalidateQueries({ queryKey: ["admin", "ticket", ticket.id] });
      queryClient.invalidateQueries({ queryKey: ["admin", "events", ticket.id] });
      queryClient.invalidateQueries({ queryKey: ["admin", "tickets"] });
    },
    onError: (err) => toast.error("Reply not sent", { description: errorMessage(err) }),
  });

  const reopen = useMutation({
    mutationFn: () => api(`/tickets/${ticket.id}`, { method: "PATCH", json: { status: "in_progress" } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin", "ticket", ticket.id] }),
    onError: (err) => toast.error("Couldn't reopen", { description: errorMessage(err) }),
  });

  if (closed) {
    return (
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-line bg-white p-5 text-sm text-ink-soft">
        <Lock className="size-4" /> This ticket is closed, so replies are disabled.
        <Button size="sm" variant="outline" className="ml-auto rounded-full" onClick={() => reopen.mutate()} disabled={reopen.isPending}>
          <Undo2 /> Reopen ticket
        </Button>
      </div>
    );
  }

  const current = draft.data?.draft ?? null;
  const degraded = draft.data?.degraded ?? null;
  const generating = draft.isFetching || regenerate.isPending;

  return (
    <section className="overflow-hidden rounded-2xl border border-line bg-white">
      <div className="border-b border-line bg-gradient-to-r from-navy-50/70 to-white px-5 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <Sparkles className="size-4 text-navy-600" />
          <span className="text-sm font-bold text-ink">AI-assisted reply</span>
          {current && (
            <span className="rounded-full bg-white px-2 py-0.5 text-[11px] text-ink-soft ring-1 ring-line">
              {current.model} · {current.cached ? "cached, no new tokens" : "freshly drafted"}
            </span>
          )}
          <div className="ml-auto flex gap-1.5">
            {!awaitingUs && !draft.data && !generating && (
              <Button size="sm" variant="outline" className="rounded-full bg-white" onClick={() => setManualKey(draftKeyString)}>
                <Bot /> Draft a follow-up
              </Button>
            )}
            {(current || degraded) && (
              <Button size="sm" variant="ghost" className="rounded-full" onClick={() => regenerate.mutate()} disabled={generating}>
                <RefreshCw className={cn(generating && "animate-spin")} /> Regenerate
              </Button>
            )}
          </div>
        </div>

        {generating && (
          <p className="mt-2 flex items-center gap-2 text-sm text-navy-700">
            <Loader2 className="size-4 animate-spin" /> Drafting from the BookLeaf knowledge base and {ticket.author.name.split(" ")[0]}&apos;s account data…
          </p>
        )}
        {!generating && degraded && (
          <p className="mt-2 flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 ring-1 ring-amber-200">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <span>
              <b>AI draft unavailable.</b> {degraded.message} You can write the reply yourself below; everything else works normally.
            </span>
          </p>
        )}
        {!generating && !awaitingUs && !draft.data && (
          <p className="mt-1 text-xs text-muted-foreground">Waiting on the author. No draft generated, to save tokens; ask for one if you want to follow up.</p>
        )}
        {current && !generating && (
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            {current.escalation?.required && (
              <div className="rounded-lg bg-white px-3 py-2 text-sm ring-1 ring-orange-200">
                <p className="flex items-center gap-1.5 font-bold text-orange-800">
                  <ArrowUpRight className="size-4" /> Escalate to {current.escalation.team}
                </p>
                <p className="text-ink-soft">{current.escalation.reason}</p>
              </div>
            )}
            {current.adminChecklist.length > 0 && (
              <div className="rounded-lg bg-white px-3 py-2 text-sm ring-1 ring-line">
                <p className="mb-1 font-bold text-ink">Before you send</p>
                <ul className="space-y-1">
                  {current.adminChecklist.map((item) => (
                    <li key={item} className="flex items-start gap-2">
                      <Checkbox
                        id={item}
                        checked={!!checked[item]}
                        onCheckedChange={(v) => setChecked((c) => ({ ...c, [item]: v === true }))}
                        className="mt-0.5"
                      />
                      <label htmlFor={item} className={cn("text-ink-soft", checked[item] && "line-through opacity-60")}>
                        {item}
                      </label>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (body.trim()) send.mutate();
        }}
      >
        <Textarea
          value={body}
          onChange={(e) => {
            setBody(e.target.value);
            setDirty(true);
          }}
          rows={12}
          placeholder={generating ? "The AI draft will appear here…" : `Write your reply to ${ticket.author.name.split(" ")[0]}…`}
          className="min-h-[240px] rounded-none border-0 px-5 py-4 text-[15px] leading-relaxed shadow-none focus-visible:ring-0"
        />
        {current && dirty && body !== current.reply && (
          <div className="flex justify-end px-5 pb-2">
            <button type="button" onClick={() => applyDraft(current, true)} className="text-xs font-bold text-navy-600 hover:underline">
              Restore AI draft
            </button>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-3 border-t border-line bg-paper px-5 py-3">
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <CircleCheck className="size-3.5" /> Review before sending: replies go straight to the author.
          </p>
          <div className="ml-auto flex items-center gap-2">
            <Select value={statusAfter} onValueChange={setStatusAfter}>
              <SelectTrigger className="h-9 w-[190px] bg-white text-sm" aria-label="Status after sending">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={KEEP}>Keep status ({STATUS_LABELS[ticket.status]})</SelectItem>
                {(["in_progress", "resolved"] as TicketStatus[])
                  .filter((s) => s !== ticket.status)
                  .map((s) => (
                    <SelectItem key={s} value={s}>
                      Send &amp; mark {STATUS_LABELS[s]}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
            <Button type="submit" disabled={!body.trim() || send.isPending} className="h-9 rounded-full px-5 font-bold">
              {send.isPending ? <Loader2 className="animate-spin" /> : <Send />}
              Send reply
            </Button>
          </div>
        </div>
      </form>
    </section>
  );
}

function defaultStatusAfter(current: TicketStatus, draft: AiDraft | null): string {
  const suggested = draft?.suggestedStatus;
  if (suggested && suggested !== current && (suggested === "in_progress" || suggested === "resolved")) return suggested;
  if (current === "open") return "in_progress";
  return KEEP;
}
