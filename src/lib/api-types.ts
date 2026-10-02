/**
 * Response shapes of the REST API (camelCase DTOs, decoupled from DB rows).
 * Shared by route handlers and the browser so both sides agree on the contract.
 */
import type {
  AiStatus,
  ClassificationSource,
  MessageSender,
  ProductionStage,
  Role,
  TicketCategory,
  TicketPriority,
  TicketStatus,
} from "./domain/constants";
import type { RoyaltyState } from "./domain/royalty";

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: { path: string; message: string }[];
    requestId?: string;
  };
}

export interface Me {
  userId: string;
  role: Role;
  name: string;
  email: string;
  /** Present for authors only. */
  authorId: string | null;
}

export interface SessionResponse {
  user: Me;
  /** Bearer token for API clients (Postman/Swagger). The browser uses the cookie session. */
  accessToken: string;
  expiresAt: number | null;
}

export interface RoyaltyStatus {
  state: RoyaltyState;
  /** Friendly, second person: shown to the author. */
  summary: string;
  /** Neutral wording for the ops team. */
  staffSummary: string;
  meetsThreshold: boolean;
  upcomingCycle: string;
  upcomingDeadline: string;
}

export interface Book {
  id: string;
  title: string;
  isbn: string;
  genre: string;
  stage: ProductionStage;
  statusLabel: string;
  isPublished: boolean;
  publicationDate: string | null;
  mrp: number | null;
  royaltyPerCopy: number | null;
  copiesSold: number;
  royaltyEarned: number;
  royaltyPaid: number;
  royaltyPending: number;
  lastPayoutDate: string | null;
  printPartner: string | null;
  availableOn: string[];
  royalty: RoyaltyStatus;
}

export interface BookPortfolio {
  books: Book[];
  totals: {
    books: number;
    published: number;
    inProduction: number;
    copiesSold: number;
    royaltyEarned: number;
    royaltyPaid: number;
    royaltyPending: number;
  };
  nextPayout: { cycle: string; deadline: string };
}

export interface PersonRef {
  id: string;
  name: string;
}

export interface TicketSummary {
  id: string;
  number: number;
  subject: string;
  status: TicketStatus;
  category: TicketCategory;
  priority: TicketPriority;
  categorySource: ClassificationSource;
  prioritySource: ClassificationSource;
  aiStatus: AiStatus;
  book: { id: string; title: string } | null;
  author: PersonRef;
  assignee: PersonRef | null;
  firstResponseAt: string | null;
  lastActivityAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface TicketMessage {
  id: string;
  senderRole: MessageSender;
  senderName: string;
  body: string;
  createdAt: string;
}

export interface TicketAttachment {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  /** Short-lived signed download URL. */
  url: string | null;
  createdAt: string;
}

export interface AiClassification {
  status: AiStatus;
  category: TicketCategory | null;
  priority: TicketPriority | null;
  confidence: number | null;
  rationale: string | null;
  error: string | null;
  classifiedAt: string | null;
}

export interface InternalNote {
  id: string;
  adminName: string;
  body: string;
  createdAt: string;
}

export interface TicketEvent {
  id: string;
  type: string;
  actorLabel: string;
  payload: Record<string, unknown>;
  createdAt: string;
}

export interface TicketDetail extends TicketSummary {
  description: string;
  resolvedAt: string | null;
  closedAt: string | null;
  messages: TicketMessage[];
  attachments: TicketAttachment[];
  /** Admin only. */
  ai?: AiClassification;
  /** Admin only. */
  notes?: InternalNote[];
}

export interface Paginated<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}

export interface AiDraft {
  id: string;
  reply: string;
  suggestedStatus: TicketStatus | null;
  escalation: { required: boolean; team: string | null; reason: string | null } | null;
  adminChecklist: string[];
  model: string;
  promptVersion: string;
  cached: boolean;
  createdAt: string;
}

export interface DraftResponse {
  /** null when the AI is unavailable: the admin writes the reply manually. */
  draft: AiDraft | null;
  degraded: { reason: string; message: string } | null;
}

export interface AuthorContext {
  author: { id: string; name: string; email: string; city: string | null; joinedDate: string };
  book: Book | null;
  otherBooks: { id: string; title: string; statusLabel: string }[];
  openTickets: number;
  totalTickets: number;
}

export interface QueueStats {
  open: number;
  inProgress: number;
  unassigned: number;
  mine: number;
  criticalOrHigh: number;
  slaBreached: number;
  needsReview: number;
  resolvedLast7Days: number;
}

export interface AiUsageStats {
  windowDays: number;
  totals: {
    requests: number;
    failures: number;
    inputTokens: number;
    outputTokens: number;
    cachedTokens: number;
    avgLatencyMs: number | null;
    estimatedCostUsd: number;
  };
  byOperation: {
    operation: "classify" | "draft";
    requests: number;
    failures: number;
    avgInputTokens: number | null;
    avgOutputTokens: number | null;
    avgLatencyMs: number | null;
  }[];
  classification: {
    classified: number;
    categoryOverrides: number;
    priorityOverrides: number;
    categoryAgreement: number | null;
    priorityAgreement: number | null;
    fallbackUsed: number;
  };
  drafts: {
    generated: number;
    cacheHits: number;
    repliesFromDraft: number;
    avgSimilarity: number | null;
  };
  recentFailures: { createdAt: string; operation: string; errorCode: string | null; model: string | null }[];
}

export interface AdminUser {
  id: string;
  name: string;
  email: string;
}
