export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      admins: {
        Row: {
          created_at: string
          email: string
          name: string
          user_id: string
        }
        Insert: {
          created_at?: string
          email: string
          name: string
          user_id: string
        }
        Update: {
          created_at?: string
          email?: string
          name?: string
          user_id?: string
        }
        Relationships: []
      }
      ai_drafts: {
        Row: {
          admin_checklist: Json
          agent_name: string
          cache_hits: number
          context_key: string
          created_at: string
          created_by: string | null
          escalation: Json | null
          id: string
          model: string
          prompt_version: string
          reply: string
          suggested_status: Database["public"]["Enums"]["ticket_status"] | null
          ticket_id: string
        }
        Insert: {
          admin_checklist?: Json
          agent_name?: string
          cache_hits?: number
          context_key: string
          created_at?: string
          created_by?: string | null
          escalation?: Json | null
          id?: string
          model: string
          prompt_version: string
          reply: string
          suggested_status?: Database["public"]["Enums"]["ticket_status"] | null
          ticket_id: string
        }
        Update: {
          admin_checklist?: Json
          agent_name?: string
          cache_hits?: number
          context_key?: string
          created_at?: string
          created_by?: string | null
          escalation?: Json | null
          id?: string
          model?: string
          prompt_version?: string
          reply?: string
          suggested_status?: Database["public"]["Enums"]["ticket_status"] | null
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_drafts_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_requests: {
        Row: {
          attempts: number
          cached_tokens: number | null
          created_at: string
          error_code: string | null
          id: string
          input_tokens: number | null
          latency_ms: number | null
          model: string | null
          operation: string
          outcome: string
          output_tokens: number | null
          prompt_version: string
          thinking_tokens: number | null
          ticket_id: string | null
        }
        Insert: {
          attempts?: number
          cached_tokens?: number | null
          created_at?: string
          error_code?: string | null
          id?: string
          input_tokens?: number | null
          latency_ms?: number | null
          model?: string | null
          operation: string
          outcome: string
          output_tokens?: number | null
          prompt_version: string
          thinking_tokens?: number | null
          ticket_id?: string | null
        }
        Update: {
          attempts?: number
          cached_tokens?: number | null
          created_at?: string
          error_code?: string | null
          id?: string
          input_tokens?: number | null
          latency_ms?: number | null
          model?: string | null
          operation?: string
          outcome?: string
          output_tokens?: number | null
          prompt_version?: string
          thinking_tokens?: number | null
          ticket_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_requests_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      authors: {
        Row: {
          city: string | null
          created_at: string
          email: string
          id: string
          joined_date: string
          name: string
          phone: string | null
          user_id: string | null
        }
        Insert: {
          city?: string | null
          created_at?: string
          email: string
          id: string
          joined_date: string
          name: string
          phone?: string | null
          user_id?: string | null
        }
        Update: {
          city?: string | null
          created_at?: string
          email?: string
          id?: string
          joined_date?: string
          name?: string
          phone?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      books: {
        Row: {
          author_id: string
          author_royalty_per_copy: number | null
          available_on: string[]
          created_at: string
          genre: string
          id: string
          isbn: string
          last_royalty_payout_date: string | null
          mrp: number | null
          print_partner: string | null
          publication_date: string | null
          royalty_paid: number
          royalty_pending: number
          stage: Database["public"]["Enums"]["production_stage"]
          title: string
          total_copies_sold: number
          total_royalty_earned: number
          updated_at: string
        }
        Insert: {
          author_id: string
          author_royalty_per_copy?: number | null
          available_on?: string[]
          created_at?: string
          genre: string
          id: string
          isbn: string
          last_royalty_payout_date?: string | null
          mrp?: number | null
          print_partner?: string | null
          publication_date?: string | null
          royalty_paid?: number
          royalty_pending?: number
          stage: Database["public"]["Enums"]["production_stage"]
          title: string
          total_copies_sold?: number
          total_royalty_earned?: number
          updated_at?: string
        }
        Update: {
          author_id?: string
          author_royalty_per_copy?: number | null
          available_on?: string[]
          created_at?: string
          genre?: string
          id?: string
          isbn?: string
          last_royalty_payout_date?: string | null
          mrp?: number | null
          print_partner?: string | null
          publication_date?: string | null
          royalty_paid?: number
          royalty_pending?: number
          stage?: Database["public"]["Enums"]["production_stage"]
          title?: string
          total_copies_sold?: number
          total_royalty_earned?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "books_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "authors"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_attachments: {
        Row: {
          author_id: string
          created_at: string
          file_name: string
          id: string
          mime_type: string
          size_bytes: number
          storage_path: string
          ticket_id: string
        }
        Insert: {
          author_id: string
          created_at?: string
          file_name: string
          id?: string
          mime_type: string
          size_bytes: number
          storage_path: string
          ticket_id: string
        }
        Update: {
          author_id?: string
          created_at?: string
          file_name?: string
          id?: string
          mime_type?: string
          size_bytes?: number
          storage_path?: string
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_attachments_ticket_id_author_id_fkey"
            columns: ["ticket_id", "author_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id", "author_id"]
          },
        ]
      }
      ticket_events: {
        Row: {
          actor_id: string | null
          actor_label: string
          created_at: string
          id: string
          payload: Json
          ticket_id: string
          type: string
        }
        Insert: {
          actor_id?: string | null
          actor_label: string
          created_at?: string
          id?: string
          payload?: Json
          ticket_id: string
          type: string
        }
        Update: {
          actor_id?: string | null
          actor_label?: string
          created_at?: string
          id?: string
          payload?: Json
          ticket_id?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_events_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_internal_notes: {
        Row: {
          admin_id: string
          admin_name: string
          body: string
          created_at: string
          id: string
          ticket_id: string
        }
        Insert: {
          admin_id: string
          admin_name: string
          body: string
          created_at?: string
          id?: string
          ticket_id: string
        }
        Update: {
          admin_id?: string
          admin_name?: string
          body?: string
          created_at?: string
          id?: string
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_internal_notes_admin_id_fkey"
            columns: ["admin_id"]
            isOneToOne: false
            referencedRelation: "admins"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "ticket_internal_notes_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_messages: {
        Row: {
          ai_draft_id: string | null
          author_id: string
          body: string
          created_at: string
          draft_similarity: number | null
          id: string
          sender_name: string
          sender_role: Database["public"]["Enums"]["message_sender"]
          sender_user_id: string | null
          ticket_id: string
        }
        Insert: {
          ai_draft_id?: string | null
          author_id: string
          body: string
          created_at?: string
          draft_similarity?: number | null
          id?: string
          sender_name: string
          sender_role: Database["public"]["Enums"]["message_sender"]
          sender_user_id?: string | null
          ticket_id: string
        }
        Update: {
          ai_draft_id?: string | null
          author_id?: string
          body?: string
          created_at?: string
          draft_similarity?: number | null
          id?: string
          sender_name?: string
          sender_role?: Database["public"]["Enums"]["message_sender"]
          sender_user_id?: string | null
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_messages_ai_draft_fk"
            columns: ["ai_draft_id"]
            isOneToOne: false
            referencedRelation: "ai_drafts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_messages_ticket_id_author_id_fkey"
            columns: ["ticket_id", "author_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id", "author_id"]
          },
        ]
      }
      tickets: {
        Row: {
          ai_category: Database["public"]["Enums"]["ticket_category"] | null
          ai_classified_at: string | null
          ai_confidence: number | null
          ai_error: string | null
          ai_priority: Database["public"]["Enums"]["ticket_priority"] | null
          ai_rationale: string | null
          ai_status: Database["public"]["Enums"]["ai_status"]
          assigned_admin_id: string | null
          author_id: string
          book_id: string | null
          category: Database["public"]["Enums"]["ticket_category"]
          category_source: Database["public"]["Enums"]["classification_source"]
          closed_at: string | null
          created_at: string
          description: string
          first_response_at: string | null
          id: string
          is_unresolved: boolean | null
          last_activity_at: string
          number: number
          priority: Database["public"]["Enums"]["ticket_priority"]
          priority_source: Database["public"]["Enums"]["classification_source"]
          resolved_at: string | null
          status: Database["public"]["Enums"]["ticket_status"]
          subject: string
          updated_at: string
        }
        Insert: {
          ai_category?: Database["public"]["Enums"]["ticket_category"] | null
          ai_classified_at?: string | null
          ai_confidence?: number | null
          ai_error?: string | null
          ai_priority?: Database["public"]["Enums"]["ticket_priority"] | null
          ai_rationale?: string | null
          ai_status?: Database["public"]["Enums"]["ai_status"]
          assigned_admin_id?: string | null
          author_id: string
          book_id?: string | null
          category: Database["public"]["Enums"]["ticket_category"]
          category_source: Database["public"]["Enums"]["classification_source"]
          closed_at?: string | null
          created_at?: string
          description: string
          first_response_at?: string | null
          id?: string
          is_unresolved?: boolean | null
          last_activity_at?: string
          number?: never
          priority: Database["public"]["Enums"]["ticket_priority"]
          priority_source: Database["public"]["Enums"]["classification_source"]
          resolved_at?: string | null
          status?: Database["public"]["Enums"]["ticket_status"]
          subject: string
          updated_at?: string
        }
        Update: {
          ai_category?: Database["public"]["Enums"]["ticket_category"] | null
          ai_classified_at?: string | null
          ai_confidence?: number | null
          ai_error?: string | null
          ai_priority?: Database["public"]["Enums"]["ticket_priority"] | null
          ai_rationale?: string | null
          ai_status?: Database["public"]["Enums"]["ai_status"]
          assigned_admin_id?: string | null
          author_id?: string
          book_id?: string | null
          category?: Database["public"]["Enums"]["ticket_category"]
          category_source?: Database["public"]["Enums"]["classification_source"]
          closed_at?: string | null
          created_at?: string
          description?: string
          first_response_at?: string | null
          id?: string
          is_unresolved?: boolean | null
          last_activity_at?: string
          number?: never
          priority?: Database["public"]["Enums"]["ticket_priority"]
          priority_source?: Database["public"]["Enums"]["classification_source"]
          resolved_at?: string | null
          status?: Database["public"]["Enums"]["ticket_status"]
          subject?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tickets_assigned_admin_id_fkey"
            columns: ["assigned_admin_id"]
            isOneToOne: false
            referencedRelation: "admins"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "tickets_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "authors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_book_id_author_id_fkey"
            columns: ["book_id", "author_id"]
            isOneToOne: false
            referencedRelation: "books"
            referencedColumns: ["id", "author_id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      ai_status: "pending" | "completed" | "failed"
      classification_source: "ai" | "fallback" | "admin"
      message_sender: "author" | "admin"
      production_stage:
        | "manuscript_received"
        | "editing"
        | "cover_design"
        | "typesetting"
        | "proofreading"
        | "isbn_assignment"
        | "printing"
        | "distribution_setup"
        | "published_live"
      ticket_category:
        | "royalty_payments"
        | "isbn_metadata"
        | "printing_quality"
        | "distribution_availability"
        | "book_status_production"
        | "general_inquiry"
      ticket_priority: "critical" | "high" | "medium" | "low"
      ticket_status: "open" | "in_progress" | "resolved" | "closed"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      ai_status: ["pending", "completed", "failed"],
      classification_source: ["ai", "fallback", "admin"],
      message_sender: ["author", "admin"],
      production_stage: [
        "manuscript_received",
        "editing",
        "cover_design",
        "typesetting",
        "proofreading",
        "isbn_assignment",
        "printing",
        "distribution_setup",
        "published_live",
      ],
      ticket_category: [
        "royalty_payments",
        "isbn_metadata",
        "printing_quality",
        "distribution_availability",
        "book_status_production",
        "general_inquiry",
      ],
      ticket_priority: ["critical", "high", "medium", "low"],
      ticket_status: ["open", "in_progress", "resolved", "closed"],
    },
  },
} as const
