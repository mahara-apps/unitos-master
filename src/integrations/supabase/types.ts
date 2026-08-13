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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      activity_events: {
        Row: {
          actor_id: string | null
          brand_id: string
          client_id: string | null
          created_at: string
          entity_id: string | null
          entity_type: string
          id: string
          payload: Json | null
          verb: string
        }
        Insert: {
          actor_id?: string | null
          brand_id: string
          client_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: string
          payload?: Json | null
          verb: string
        }
        Update: {
          actor_id?: string | null
          brand_id?: string
          client_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: string
          payload?: Json | null
          verb?: string
        }
        Relationships: [
          {
            foreignKeyName: "activity_events_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brain_stats_mv"
            referencedColumns: ["brand_id"]
          },
          {
            foreignKeyName: "activity_events_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_events_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_prompt_overrides: {
        Row: {
          agent_id: string
          brand_id: string
          created_at: string
          created_by: string | null
          id: string
          system_prompt: string
          updated_at: string
        }
        Insert: {
          agent_id: string
          brand_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          system_prompt: string
          updated_at?: string
        }
        Update: {
          agent_id?: string
          brand_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          system_prompt?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_prompt_overrides_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brain_stats_mv"
            referencedColumns: ["brand_id"]
          },
          {
            foreignKeyName: "agent_prompt_overrides_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_prompts: {
        Row: {
          agent_id: string
          agent_name: string
          brain_enabled: boolean
          created_at: string
          default_prompt: string
          required_fields: Json
          system_prompt: string
          updated_at: string
        }
        Insert: {
          agent_id: string
          agent_name: string
          brain_enabled?: boolean
          created_at?: string
          default_prompt: string
          required_fields?: Json
          system_prompt: string
          updated_at?: string
        }
        Update: {
          agent_id?: string
          agent_name?: string
          brain_enabled?: boolean
          created_at?: string
          default_prompt?: string
          required_fields?: Json
          system_prompt?: string
          updated_at?: string
        }
        Relationships: []
      }
      ai_jobs: {
        Row: {
          brand_id: string
          client_id: string | null
          created_at: string
          error: string | null
          finished_at: string | null
          id: string
          input: Json
          kind: string
          progress: number
          result: Json | null
          started_at: string | null
          status: string
          step_label: string | null
          subtitle: string | null
          target_route: string | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          brand_id: string
          client_id?: string | null
          created_at?: string
          error?: string | null
          finished_at?: string | null
          id?: string
          input?: Json
          kind: string
          progress?: number
          result?: Json | null
          started_at?: string | null
          status?: string
          step_label?: string | null
          subtitle?: string | null
          target_route?: string | null
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          brand_id?: string
          client_id?: string | null
          created_at?: string
          error?: string | null
          finished_at?: string | null
          id?: string
          input?: Json
          kind?: string
          progress?: number
          result?: Json | null
          started_at?: string | null
          status?: string
          step_label?: string | null
          subtitle?: string | null
          target_route?: string | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_jobs_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brain_stats_mv"
            referencedColumns: ["brand_id"]
          },
          {
            foreignKeyName: "ai_jobs_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_jobs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_model_catalog_overrides: {
        Row: {
          created_at: string
          id: string
          model_id: string
          provider: string
          reason: string | null
          replaced_model_id: string | null
          role: string
          source: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          model_id: string
          provider: string
          reason?: string | null
          replaced_model_id?: string | null
          role: string
          source?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          model_id?: string
          provider?: string
          reason?: string | null
          replaced_model_id?: string | null
          role?: string
          source?: string
          updated_at?: string
        }
        Relationships: []
      }
      ai_model_health: {
        Row: {
          checked_at: string
          error_message: string | null
          id: string
          model_id: string
          provider: string
          role: string
          status: string
        }
        Insert: {
          checked_at?: string
          error_message?: string | null
          id?: string
          model_id: string
          provider: string
          role?: string
          status: string
        }
        Update: {
          checked_at?: string
          error_message?: string | null
          id?: string
          model_id?: string
          provider?: string
          role?: string
          status?: string
        }
        Relationships: []
      }
      ai_usage_limits: {
        Row: {
          brand_id: string
          client_id: string | null
          created_at: string
          created_by: string | null
          hard_stop: boolean
          id: string
          limit_usd: number
          notify_at_pct: number
          period: string
          scope: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          brand_id: string
          client_id?: string | null
          created_at?: string
          created_by?: string | null
          hard_stop?: boolean
          id?: string
          limit_usd: number
          notify_at_pct?: number
          period?: string
          scope: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          brand_id?: string
          client_id?: string | null
          created_at?: string
          created_by?: string | null
          hard_stop?: boolean
          id?: string
          limit_usd?: number
          notify_at_pct?: number
          period?: string
          scope?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_usage_limits_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brain_stats_mv"
            referencedColumns: ["brand_id"]
          },
          {
            foreignKeyName: "ai_usage_limits_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_usage_limits_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      brain_embeddings: {
        Row: {
          brand_id: string | null
          content_summary: string
          created_at: string
          embedding: string | null
          event_id: string | null
          id: string
        }
        Insert: {
          brand_id?: string | null
          content_summary: string
          created_at?: string
          embedding?: string | null
          event_id?: string | null
          id?: string
        }
        Update: {
          brand_id?: string | null
          content_summary?: string
          created_at?: string
          embedding?: string | null
          event_id?: string | null
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "brain_embeddings_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brain_stats_mv"
            referencedColumns: ["brand_id"]
          },
          {
            foreignKeyName: "brain_embeddings_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
      brain_events: {
        Row: {
          action: string | null
          actor_id: string | null
          brand_id: string | null
          client_id: string | null
          confidence: number | null
          correlation_id: string | null
          created_at: string
          entity_id: string | null
          entity_type: string | null
          event_type: string
          id: string
          outcome_score: number | null
          payload: Json
          processed_at: string | null
          project_id: string | null
          source_module: string
        }
        Insert: {
          action?: string | null
          actor_id?: string | null
          brand_id?: string | null
          client_id?: string | null
          confidence?: number | null
          correlation_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          event_type: string
          id?: string
          outcome_score?: number | null
          payload?: Json
          processed_at?: string | null
          project_id?: string | null
          source_module: string
        }
        Update: {
          action?: string | null
          actor_id?: string | null
          brand_id?: string | null
          client_id?: string | null
          confidence?: number | null
          correlation_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          event_type?: string
          id?: string
          outcome_score?: number | null
          payload?: Json
          processed_at?: string | null
          project_id?: string | null
          source_module?: string
        }
        Relationships: [
          {
            foreignKeyName: "brain_events_brand_id_fkey1"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brain_stats_mv"
            referencedColumns: ["brand_id"]
          },
          {
            foreignKeyName: "brain_events_brand_id_fkey1"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
      brain_events_202605: {
        Row: {
          action: string | null
          actor_id: string | null
          brand_id: string | null
          client_id: string | null
          confidence: number | null
          correlation_id: string | null
          created_at: string
          entity_id: string | null
          entity_type: string | null
          event_type: string
          id: string
          outcome_score: number | null
          payload: Json
          processed_at: string | null
          project_id: string | null
          source_module: string
        }
        Insert: {
          action?: string | null
          actor_id?: string | null
          brand_id?: string | null
          client_id?: string | null
          confidence?: number | null
          correlation_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          event_type: string
          id?: string
          outcome_score?: number | null
          payload?: Json
          processed_at?: string | null
          project_id?: string | null
          source_module: string
        }
        Update: {
          action?: string | null
          actor_id?: string | null
          brand_id?: string | null
          client_id?: string | null
          confidence?: number | null
          correlation_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          event_type?: string
          id?: string
          outcome_score?: number | null
          payload?: Json
          processed_at?: string | null
          project_id?: string | null
          source_module?: string
        }
        Relationships: []
      }
      brain_events_202606: {
        Row: {
          action: string | null
          actor_id: string | null
          brand_id: string | null
          client_id: string | null
          confidence: number | null
          correlation_id: string | null
          created_at: string
          entity_id: string | null
          entity_type: string | null
          event_type: string
          id: string
          outcome_score: number | null
          payload: Json
          processed_at: string | null
          project_id: string | null
          source_module: string
        }
        Insert: {
          action?: string | null
          actor_id?: string | null
          brand_id?: string | null
          client_id?: string | null
          confidence?: number | null
          correlation_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          event_type: string
          id?: string
          outcome_score?: number | null
          payload?: Json
          processed_at?: string | null
          project_id?: string | null
          source_module: string
        }
        Update: {
          action?: string | null
          actor_id?: string | null
          brand_id?: string | null
          client_id?: string | null
          confidence?: number | null
          correlation_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          event_type?: string
          id?: string
          outcome_score?: number | null
          payload?: Json
          processed_at?: string | null
          project_id?: string | null
          source_module?: string
        }
        Relationships: []
      }
      brain_events_202607: {
        Row: {
          action: string | null
          actor_id: string | null
          brand_id: string | null
          client_id: string | null
          confidence: number | null
          correlation_id: string | null
          created_at: string
          entity_id: string | null
          entity_type: string | null
          event_type: string
          id: string
          outcome_score: number | null
          payload: Json
          processed_at: string | null
          project_id: string | null
          source_module: string
        }
        Insert: {
          action?: string | null
          actor_id?: string | null
          brand_id?: string | null
          client_id?: string | null
          confidence?: number | null
          correlation_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          event_type: string
          id?: string
          outcome_score?: number | null
          payload?: Json
          processed_at?: string | null
          project_id?: string | null
          source_module: string
        }
        Update: {
          action?: string | null
          actor_id?: string | null
          brand_id?: string | null
          client_id?: string | null
          confidence?: number | null
          correlation_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          event_type?: string
          id?: string
          outcome_score?: number | null
          payload?: Json
          processed_at?: string | null
          project_id?: string | null
          source_module?: string
        }
        Relationships: []
      }
      brain_events_202608: {
        Row: {
          action: string | null
          actor_id: string | null
          brand_id: string | null
          client_id: string | null
          confidence: number | null
          correlation_id: string | null
          created_at: string
          entity_id: string | null
          entity_type: string | null
          event_type: string
          id: string
          outcome_score: number | null
          payload: Json
          processed_at: string | null
          project_id: string | null
          source_module: string
        }
        Insert: {
          action?: string | null
          actor_id?: string | null
          brand_id?: string | null
          client_id?: string | null
          confidence?: number | null
          correlation_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          event_type: string
          id?: string
          outcome_score?: number | null
          payload?: Json
          processed_at?: string | null
          project_id?: string | null
          source_module: string
        }
        Update: {
          action?: string | null
          actor_id?: string | null
          brand_id?: string | null
          client_id?: string | null
          confidence?: number | null
          correlation_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          event_type?: string
          id?: string
          outcome_score?: number | null
          payload?: Json
          processed_at?: string | null
          project_id?: string | null
          source_module?: string
        }
        Relationships: []
      }
      brain_events_202609: {
        Row: {
          action: string | null
          actor_id: string | null
          brand_id: string | null
          client_id: string | null
          confidence: number | null
          correlation_id: string | null
          created_at: string
          entity_id: string | null
          entity_type: string | null
          event_type: string
          id: string
          outcome_score: number | null
          payload: Json
          processed_at: string | null
          project_id: string | null
          source_module: string
        }
        Insert: {
          action?: string | null
          actor_id?: string | null
          brand_id?: string | null
          client_id?: string | null
          confidence?: number | null
          correlation_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          event_type: string
          id?: string
          outcome_score?: number | null
          payload?: Json
          processed_at?: string | null
          project_id?: string | null
          source_module: string
        }
        Update: {
          action?: string | null
          actor_id?: string | null
          brand_id?: string | null
          client_id?: string | null
          confidence?: number | null
          correlation_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          event_type?: string
          id?: string
          outcome_score?: number | null
          payload?: Json
          processed_at?: string | null
          project_id?: string | null
          source_module?: string
        }
        Relationships: []
      }
      brain_events_202610: {
        Row: {
          action: string | null
          actor_id: string | null
          brand_id: string | null
          client_id: string | null
          confidence: number | null
          correlation_id: string | null
          created_at: string
          entity_id: string | null
          entity_type: string | null
          event_type: string
          id: string
          outcome_score: number | null
          payload: Json
          processed_at: string | null
          project_id: string | null
          source_module: string
        }
        Insert: {
          action?: string | null
          actor_id?: string | null
          brand_id?: string | null
          client_id?: string | null
          confidence?: number | null
          correlation_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          event_type: string
          id?: string
          outcome_score?: number | null
          payload?: Json
          processed_at?: string | null
          project_id?: string | null
          source_module: string
        }
        Update: {
          action?: string | null
          actor_id?: string | null
          brand_id?: string | null
          client_id?: string | null
          confidence?: number | null
          correlation_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          event_type?: string
          id?: string
          outcome_score?: number | null
          payload?: Json
          processed_at?: string | null
          project_id?: string | null
          source_module?: string
        }
        Relationships: []
      }
      brain_events_202611: {
        Row: {
          action: string | null
          actor_id: string | null
          brand_id: string | null
          client_id: string | null
          confidence: number | null
          correlation_id: string | null
          created_at: string
          entity_id: string | null
          entity_type: string | null
          event_type: string
          id: string
          outcome_score: number | null
          payload: Json
          processed_at: string | null
          project_id: string | null
          source_module: string
        }
        Insert: {
          action?: string | null
          actor_id?: string | null
          brand_id?: string | null
          client_id?: string | null
          confidence?: number | null
          correlation_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          event_type: string
          id?: string
          outcome_score?: number | null
          payload?: Json
          processed_at?: string | null
          project_id?: string | null
          source_module: string
        }
        Update: {
          action?: string | null
          actor_id?: string | null
          brand_id?: string | null
          client_id?: string | null
          confidence?: number | null
          correlation_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          event_type?: string
          id?: string
          outcome_score?: number | null
          payload?: Json
          processed_at?: string | null
          project_id?: string | null
          source_module?: string
        }
        Relationships: []
      }
      brain_events_archive: {
        Row: {
          action: string | null
          actor_id: string | null
          archived_at: string
          brand_id: string | null
          client_id: string | null
          confidence: number | null
          correlation_id: string | null
          created_at: string
          entity_id: string | null
          entity_type: string | null
          event_type: string
          id: string
          outcome_score: number | null
          payload: Json
          processed_at: string | null
          project_id: string | null
          source_module: string
        }
        Insert: {
          action?: string | null
          actor_id?: string | null
          archived_at?: string
          brand_id?: string | null
          client_id?: string | null
          confidence?: number | null
          correlation_id?: string | null
          created_at: string
          entity_id?: string | null
          entity_type?: string | null
          event_type: string
          id: string
          outcome_score?: number | null
          payload: Json
          processed_at?: string | null
          project_id?: string | null
          source_module: string
        }
        Update: {
          action?: string | null
          actor_id?: string | null
          archived_at?: string
          brand_id?: string | null
          client_id?: string | null
          confidence?: number | null
          correlation_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          event_type?: string
          id?: string
          outcome_score?: number | null
          payload?: Json
          processed_at?: string | null
          project_id?: string | null
          source_module?: string
        }
        Relationships: []
      }
      brain_events_default: {
        Row: {
          action: string | null
          actor_id: string | null
          brand_id: string | null
          client_id: string | null
          confidence: number | null
          correlation_id: string | null
          created_at: string
          entity_id: string | null
          entity_type: string | null
          event_type: string
          id: string
          outcome_score: number | null
          payload: Json
          processed_at: string | null
          project_id: string | null
          source_module: string
        }
        Insert: {
          action?: string | null
          actor_id?: string | null
          brand_id?: string | null
          client_id?: string | null
          confidence?: number | null
          correlation_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          event_type: string
          id?: string
          outcome_score?: number | null
          payload?: Json
          processed_at?: string | null
          project_id?: string | null
          source_module: string
        }
        Update: {
          action?: string | null
          actor_id?: string | null
          brand_id?: string | null
          client_id?: string | null
          confidence?: number | null
          correlation_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          event_type?: string
          id?: string
          outcome_score?: number | null
          payload?: Json
          processed_at?: string | null
          project_id?: string | null
          source_module?: string
        }
        Relationships: []
      }
      brain_insights: {
        Row: {
          based_on_events: number | null
          brand_id: string | null
          confidence: number | null
          created_at: string
          description: string
          expires_at: string | null
          id: string
          insight_type: string
        }
        Insert: {
          based_on_events?: number | null
          brand_id?: string | null
          confidence?: number | null
          created_at?: string
          description: string
          expires_at?: string | null
          id?: string
          insight_type: string
        }
        Update: {
          based_on_events?: number | null
          brand_id?: string | null
          confidence?: number | null
          created_at?: string
          description?: string
          expires_at?: string | null
          id?: string
          insight_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "brain_insights_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brain_stats_mv"
            referencedColumns: ["brand_id"]
          },
          {
            foreignKeyName: "brain_insights_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
      brain_learning_queue: {
        Row: {
          attempts: number
          brand_id: string | null
          created_at: string
          enqueued_at: string
          error: string | null
          event_id: string
          id: string
          processed_at: string | null
          started_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          attempts?: number
          brand_id?: string | null
          created_at?: string
          enqueued_at?: string
          error?: string | null
          event_id: string
          id?: string
          processed_at?: string | null
          started_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          attempts?: number
          brand_id?: string | null
          created_at?: string
          enqueued_at?: string
          error?: string | null
          event_id?: string
          id?: string
          processed_at?: string | null
          started_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      brain_memory: {
        Row: {
          access_count: number
          brand_id: string | null
          category: string | null
          confidence: number
          content: Json
          contradiction_count: number
          created_at: string
          decay_rate: number
          description: string | null
          entity_id: string | null
          entity_type: string | null
          expires_at: string | null
          id: string
          key: string
          last_accessed_at: string | null
          memory_type: string
          metadata: Json
          origin: string
          previous_confidence: number | null
          reinforcement_count: number
          relations: Json
          scope: string
          source_event: string | null
          source_refs: Json
          status: string
          subject_id: string | null
          subject_type: string | null
          tags: string[]
          title: string | null
          updated_at: string
          version: number
        }
        Insert: {
          access_count?: number
          brand_id?: string | null
          category?: string | null
          confidence?: number
          content?: Json
          contradiction_count?: number
          created_at?: string
          decay_rate?: number
          description?: string | null
          entity_id?: string | null
          entity_type?: string | null
          expires_at?: string | null
          id?: string
          key: string
          last_accessed_at?: string | null
          memory_type: string
          metadata?: Json
          origin?: string
          previous_confidence?: number | null
          reinforcement_count?: number
          relations?: Json
          scope?: string
          source_event?: string | null
          source_refs?: Json
          status?: string
          subject_id?: string | null
          subject_type?: string | null
          tags?: string[]
          title?: string | null
          updated_at?: string
          version?: number
        }
        Update: {
          access_count?: number
          brand_id?: string | null
          category?: string | null
          confidence?: number
          content?: Json
          contradiction_count?: number
          created_at?: string
          decay_rate?: number
          description?: string | null
          entity_id?: string | null
          entity_type?: string | null
          expires_at?: string | null
          id?: string
          key?: string
          last_accessed_at?: string | null
          memory_type?: string
          metadata?: Json
          origin?: string
          previous_confidence?: number | null
          reinforcement_count?: number
          relations?: Json
          scope?: string
          source_event?: string | null
          source_refs?: Json
          status?: string
          subject_id?: string | null
          subject_type?: string | null
          tags?: string[]
          title?: string | null
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "brain_memory_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brain_stats_mv"
            referencedColumns: ["brand_id"]
          },
          {
            foreignKeyName: "brain_memory_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
      brain_memory_versions: {
        Row: {
          brand_id: string | null
          change_reason: string | null
          changed_by: string | null
          confidence: number
          content: Json
          created_at: string
          delta_confidence: number | null
          description: string | null
          id: string
          memory_id: string
          metadata: Json
          previous_confidence: number | null
          relations: Json
          source_event: string | null
          status: string
          tags: string[]
          title: string | null
          version: number
        }
        Insert: {
          brand_id?: string | null
          change_reason?: string | null
          changed_by?: string | null
          confidence: number
          content?: Json
          created_at?: string
          delta_confidence?: number | null
          description?: string | null
          id?: string
          memory_id: string
          metadata?: Json
          previous_confidence?: number | null
          relations?: Json
          source_event?: string | null
          status?: string
          tags?: string[]
          title?: string | null
          version: number
        }
        Update: {
          brand_id?: string | null
          change_reason?: string | null
          changed_by?: string | null
          confidence?: number
          content?: Json
          created_at?: string
          delta_confidence?: number | null
          description?: string | null
          id?: string
          memory_id?: string
          metadata?: Json
          previous_confidence?: number | null
          relations?: Json
          source_event?: string | null
          status?: string
          tags?: string[]
          title?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "brain_memory_versions_memory_id_fkey"
            columns: ["memory_id"]
            isOneToOne: false
            referencedRelation: "brain_memory"
            referencedColumns: ["id"]
          },
        ]
      }
      brain_metrics_snapshots: {
        Row: {
          brand_id: string | null
          channel: string | null
          created_at: string
          id: string
          metric_name: string
          metric_value: number
          period_end: string
          period_start: string
        }
        Insert: {
          brand_id?: string | null
          channel?: string | null
          created_at?: string
          id?: string
          metric_name: string
          metric_value: number
          period_end: string
          period_start: string
        }
        Update: {
          brand_id?: string | null
          channel?: string | null
          created_at?: string
          id?: string
          metric_name?: string
          metric_value?: number
          period_end?: string
          period_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "brain_metrics_snapshots_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brain_stats_mv"
            referencedColumns: ["brand_id"]
          },
          {
            foreignKeyName: "brain_metrics_snapshots_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
      brain_reasoning_logs: {
        Row: {
          answer_confidence: number | null
          answer_preview: string | null
          brand_id: string | null
          client_id: string | null
          conversation_id: string | null
          created_at: string
          decision: string
          id: string
          intent: string
          intent_confidence: number | null
          latency_ms: number | null
          memory_hits: number
          plan: Json
          question: string
          tools_used: Json
          used_llm: boolean
          user_id: string | null
        }
        Insert: {
          answer_confidence?: number | null
          answer_preview?: string | null
          brand_id?: string | null
          client_id?: string | null
          conversation_id?: string | null
          created_at?: string
          decision: string
          id?: string
          intent: string
          intent_confidence?: number | null
          latency_ms?: number | null
          memory_hits?: number
          plan?: Json
          question: string
          tools_used?: Json
          used_llm?: boolean
          user_id?: string | null
        }
        Update: {
          answer_confidence?: number | null
          answer_preview?: string | null
          brand_id?: string | null
          client_id?: string | null
          conversation_id?: string | null
          created_at?: string
          decision?: string
          id?: string
          intent?: string
          intent_confidence?: number | null
          latency_ms?: number | null
          memory_hits?: number
          plan?: Json
          question?: string
          tools_used?: Json
          used_llm?: boolean
          user_id?: string | null
        }
        Relationships: []
      }
      brain_recommendations: {
        Row: {
          acted_at: string | null
          action_payload: Json | null
          brand_id: string | null
          client_id: string | null
          confidence: number
          created_at: string
          description: string | null
          expires_at: string | null
          id: string
          priority: string
          recommendation_type: string
          source_event_ids: string[] | null
          source_insight_id: string | null
          status: string
          target_user_id: string | null
          title: string
          updated_at: string
        }
        Insert: {
          acted_at?: string | null
          action_payload?: Json | null
          brand_id?: string | null
          client_id?: string | null
          confidence?: number
          created_at?: string
          description?: string | null
          expires_at?: string | null
          id?: string
          priority?: string
          recommendation_type: string
          source_event_ids?: string[] | null
          source_insight_id?: string | null
          status?: string
          target_user_id?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          acted_at?: string | null
          action_payload?: Json | null
          brand_id?: string | null
          client_id?: string | null
          confidence?: number
          created_at?: string
          description?: string | null
          expires_at?: string | null
          id?: string
          priority?: string
          recommendation_type?: string
          source_event_ids?: string[] | null
          source_insight_id?: string | null
          status?: string
          target_user_id?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "brain_recommendations_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brain_stats_mv"
            referencedColumns: ["brand_id"]
          },
          {
            foreignKeyName: "brain_recommendations_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "brain_recommendations_source_insight_id_fkey"
            columns: ["source_insight_id"]
            isOneToOne: false
            referencedRelation: "brain_insights"
            referencedColumns: ["id"]
          },
        ]
      }
      brain_relationships: {
        Row: {
          bidirectional: boolean
          brand_id: string | null
          confidence: number
          created_at: string
          from_id: string
          from_type: string
          id: string
          last_observed_at: string
          metadata: Json | null
          observation_count: number
          relationship_type: string
          strength: number
          to_id: string
          to_type: string
          updated_at: string
        }
        Insert: {
          bidirectional?: boolean
          brand_id?: string | null
          confidence?: number
          created_at?: string
          from_id: string
          from_type: string
          id?: string
          last_observed_at?: string
          metadata?: Json | null
          observation_count?: number
          relationship_type: string
          strength?: number
          to_id: string
          to_type: string
          updated_at?: string
        }
        Update: {
          bidirectional?: boolean
          brand_id?: string | null
          confidence?: number
          created_at?: string
          from_id?: string
          from_type?: string
          id?: string
          last_observed_at?: string
          metadata?: Json | null
          observation_count?: number
          relationship_type?: string
          strength?: number
          to_id?: string
          to_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "brain_relationships_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brain_stats_mv"
            referencedColumns: ["brand_id"]
          },
          {
            foreignKeyName: "brain_relationships_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
      brain_retention_config: {
        Row: {
          description: string | null
          key: string
          updated_at: string
          value_days: number
        }
        Insert: {
          description?: string | null
          key: string
          updated_at?: string
          value_days: number
        }
        Update: {
          description?: string | null
          key?: string
          updated_at?: string
          value_days?: number
        }
        Relationships: []
      }
      brand_ai_content: {
        Row: {
          brand_id: string
          client_id: string
          created_at: string
          created_by: string | null
          data: Json
          formato: string | null
          id: string
          pauta_id: string | null
          plataforma: string | null
          post_id: string | null
          updated_at: string
        }
        Insert: {
          brand_id: string
          client_id: string
          created_at?: string
          created_by?: string | null
          data?: Json
          formato?: string | null
          id?: string
          pauta_id?: string | null
          plataforma?: string | null
          post_id?: string | null
          updated_at?: string
        }
        Update: {
          brand_id?: string
          client_id?: string
          created_at?: string
          created_by?: string | null
          data?: Json
          formato?: string | null
          id?: string
          pauta_id?: string | null
          plataforma?: string | null
          post_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "brand_ai_content_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brain_stats_mv"
            referencedColumns: ["brand_id"]
          },
          {
            foreignKeyName: "brand_ai_content_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "brand_ai_content_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "brand_ai_content_pauta_id_fkey"
            columns: ["pauta_id"]
            isOneToOne: false
            referencedRelation: "brand_pautas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "brand_ai_content_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      brand_ai_usage: {
        Row: {
          actor_id: string | null
          agent: string
          brand_id: string
          client_id: string | null
          cost_usd: number
          created_at: string
          error_message: string | null
          id: string
          input_tokens: number
          model: string
          output_tokens: number
          success: boolean
        }
        Insert: {
          actor_id?: string | null
          agent: string
          brand_id: string
          client_id?: string | null
          cost_usd?: number
          created_at?: string
          error_message?: string | null
          id?: string
          input_tokens?: number
          model: string
          output_tokens?: number
          success?: boolean
        }
        Update: {
          actor_id?: string | null
          agent?: string
          brand_id?: string
          client_id?: string | null
          cost_usd?: number
          created_at?: string
          error_message?: string | null
          id?: string
          input_tokens?: number
          model?: string
          output_tokens?: number
          success?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "brand_ai_usage_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brain_stats_mv"
            referencedColumns: ["brand_id"]
          },
          {
            foreignKeyName: "brand_ai_usage_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "brand_ai_usage_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      brand_ai_versions: {
        Row: {
          brand_id: string
          changed_by: string | null
          client_id: string
          created_at: string
          data: Json
          entity_id: string
          entity_type: string
          id: string
        }
        Insert: {
          brand_id: string
          changed_by?: string | null
          client_id: string
          created_at?: string
          data: Json
          entity_id: string
          entity_type: string
          id?: string
        }
        Update: {
          brand_id?: string
          changed_by?: string | null
          client_id?: string
          created_at?: string
          data?: Json
          entity_id?: string
          entity_type?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "brand_ai_versions_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brain_stats_mv"
            referencedColumns: ["brand_id"]
          },
          {
            foreignKeyName: "brand_ai_versions_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "brand_ai_versions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      brand_api_credentials: {
        Row: {
          brand_id: string
          ciphertext: string
          created_at: string
          id: string
          masked: string
          metadata: Json
          provider: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          brand_id: string
          ciphertext: string
          created_at?: string
          id?: string
          masked: string
          metadata?: Json
          provider: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          brand_id?: string
          ciphertext?: string
          created_at?: string
          id?: string
          masked?: string
          metadata?: Json
          provider?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "brand_api_credentials_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brain_stats_mv"
            referencedColumns: ["brand_id"]
          },
          {
            foreignKeyName: "brand_api_credentials_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
      brand_briefings: {
        Row: {
          brand_id: string
          client_id: string
          completude: number
          created_at: string
          created_by: string | null
          data: Json
          id: string
          raw_text: string | null
          updated_at: string
        }
        Insert: {
          brand_id: string
          client_id: string
          completude?: number
          created_at?: string
          created_by?: string | null
          data?: Json
          id?: string
          raw_text?: string | null
          updated_at?: string
        }
        Update: {
          brand_id?: string
          client_id?: string
          completude?: number
          created_at?: string
          created_by?: string | null
          data?: Json
          id?: string
          raw_text?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "brand_briefings_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brain_stats_mv"
            referencedColumns: ["brand_id"]
          },
          {
            foreignKeyName: "brand_briefings_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "brand_briefings_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      brand_cohorts: {
        Row: {
          brand_id: string
          client_id: string
          created_at: string
          created_by: string | null
          data: Json
          id: string
          is_active: boolean
          updated_at: string
        }
        Insert: {
          brand_id: string
          client_id: string
          created_at?: string
          created_by?: string | null
          data?: Json
          id?: string
          is_active?: boolean
          updated_at?: string
        }
        Update: {
          brand_id?: string
          client_id?: string
          created_at?: string
          created_by?: string | null
          data?: Json
          id?: string
          is_active?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "brand_cohorts_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brain_stats_mv"
            referencedColumns: ["brand_id"]
          },
          {
            foreignKeyName: "brand_cohorts_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "brand_cohorts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      brand_competitors: {
        Row: {
          bio_colada: string | null
          brand_id: string
          client_id: string
          created_at: string
          created_by: string | null
          handle: string | null
          id: string
          pautas_inspiradas: Json
          posts_colados: string | null
          snapshot: Json
          updated_at: string
        }
        Insert: {
          bio_colada?: string | null
          brand_id: string
          client_id: string
          created_at?: string
          created_by?: string | null
          handle?: string | null
          id?: string
          pautas_inspiradas?: Json
          posts_colados?: string | null
          snapshot?: Json
          updated_at?: string
        }
        Update: {
          bio_colada?: string | null
          brand_id?: string
          client_id?: string
          created_at?: string
          created_by?: string | null
          handle?: string | null
          id?: string
          pautas_inspiradas?: Json
          posts_colados?: string | null
          snapshot?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "brand_competitors_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brain_stats_mv"
            referencedColumns: ["brand_id"]
          },
          {
            foreignKeyName: "brand_competitors_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "brand_competitors_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      brand_connections: {
        Row: {
          brand_id: string
          channels: Json
          created_at: string
          image_provider: string
          monthly_budget_usd: number
          providers: Json
          text_provider: string
          updated_at: string
        }
        Insert: {
          brand_id: string
          channels?: Json
          created_at?: string
          image_provider?: string
          monthly_budget_usd?: number
          providers?: Json
          text_provider?: string
          updated_at?: string
        }
        Update: {
          brand_id?: string
          channels?: Json
          created_at?: string
          image_provider?: string
          monthly_budget_usd?: number
          providers?: Json
          text_provider?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "brand_connections_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: true
            referencedRelation: "brain_stats_mv"
            referencedColumns: ["brand_id"]
          },
          {
            foreignKeyName: "brand_connections_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: true
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
      brand_features: {
        Row: {
          brand_id: string
          created_at: string
          enabled: boolean
          enabled_at: string | null
          enabled_by: string | null
          feature_key: string
          id: string
          notes: string | null
          updated_at: string
        }
        Insert: {
          brand_id: string
          created_at?: string
          enabled?: boolean
          enabled_at?: string | null
          enabled_by?: string | null
          feature_key: string
          id?: string
          notes?: string | null
          updated_at?: string
        }
        Update: {
          brand_id?: string
          created_at?: string
          enabled?: boolean
          enabled_at?: string | null
          enabled_by?: string | null
          feature_key?: string
          id?: string
          notes?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "brand_features_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brain_stats_mv"
            referencedColumns: ["brand_id"]
          },
          {
            foreignKeyName: "brand_features_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "brand_features_feature_key_fkey"
            columns: ["feature_key"]
            isOneToOne: false
            referencedRelation: "feature_catalog"
            referencedColumns: ["key"]
          },
        ]
      }
      brand_invites: {
        Row: {
          accepted_at: string | null
          accepted_by: string | null
          brand_id: string
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by: string
          permissions: Json
          revoked_at: string | null
          revoked_by: string | null
          role: Database["public"]["Enums"]["app_role"]
          temp_password_sent: boolean
          token: string
          updated_at: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_by?: string | null
          brand_id: string
          created_at?: string
          email: string
          expires_at?: string
          id?: string
          invited_by: string
          permissions?: Json
          revoked_at?: string | null
          revoked_by?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          temp_password_sent?: boolean
          token: string
          updated_at?: string
        }
        Update: {
          accepted_at?: string | null
          accepted_by?: string | null
          brand_id?: string
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string
          permissions?: Json
          revoked_at?: string | null
          revoked_by?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          temp_password_sent?: boolean
          token?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "brand_invites_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brain_stats_mv"
            referencedColumns: ["brand_id"]
          },
          {
            foreignKeyName: "brand_invites_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
      brand_journey_stage_templates: {
        Row: {
          brand_id: string
          created_at: string
          id: string
          project_template_id: string
          stage: string
          updated_at: string
        }
        Insert: {
          brand_id: string
          created_at?: string
          id?: string
          project_template_id: string
          stage: string
          updated_at?: string
        }
        Update: {
          brand_id?: string
          created_at?: string
          id?: string
          project_template_id?: string
          stage?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "brand_journey_stage_templates_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brain_stats_mv"
            referencedColumns: ["brand_id"]
          },
          {
            foreignKeyName: "brand_journey_stage_templates_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "brand_journey_stage_templates_project_template_id_fkey"
            columns: ["project_template_id"]
            isOneToOne: false
            referencedRelation: "project_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      brand_media_assets: {
        Row: {
          brand_id: string
          client_id: string | null
          created_at: string
          height: number | null
          id: string
          kind: string
          metadata: Json
          mime_type: string
          name: string
          size_bytes: number
          storage_path: string
          tags: string[]
          updated_at: string
          uploaded_by: string | null
          width: number | null
        }
        Insert: {
          brand_id: string
          client_id?: string | null
          created_at?: string
          height?: number | null
          id?: string
          kind: string
          metadata?: Json
          mime_type: string
          name: string
          size_bytes?: number
          storage_path: string
          tags?: string[]
          updated_at?: string
          uploaded_by?: string | null
          width?: number | null
        }
        Update: {
          brand_id?: string
          client_id?: string | null
          created_at?: string
          height?: number | null
          id?: string
          kind?: string
          metadata?: Json
          mime_type?: string
          name?: string
          size_bytes?: number
          storage_path?: string
          tags?: string[]
          updated_at?: string
          uploaded_by?: string | null
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "brand_media_assets_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brain_stats_mv"
            referencedColumns: ["brand_id"]
          },
          {
            foreignKeyName: "brand_media_assets_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "brand_media_assets_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      brand_members: {
        Row: {
          brand_id: string
          created_at: string
          id: string
          permissions: Json
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          brand_id: string
          created_at?: string
          id?: string
          permissions?: Json
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          brand_id?: string
          created_at?: string
          id?: string
          permissions?: Json
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "brand_members_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brain_stats_mv"
            referencedColumns: ["brand_id"]
          },
          {
            foreignKeyName: "brand_members_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
      brand_pautas: {
        Row: {
          brand_id: string
          client_id: string
          cohort_alvo: string | null
          created_at: string
          created_by: string | null
          data: Json
          formato: string | null
          formato_recomendado: string | null
          gancho: string | null
          id: string
          pilar: string | null
          pilar_type: string | null
          plataforma: string | null
          status: string
          titulo: string
          updated_at: string
        }
        Insert: {
          brand_id: string
          client_id: string
          cohort_alvo?: string | null
          created_at?: string
          created_by?: string | null
          data?: Json
          formato?: string | null
          formato_recomendado?: string | null
          gancho?: string | null
          id?: string
          pilar?: string | null
          pilar_type?: string | null
          plataforma?: string | null
          status?: string
          titulo: string
          updated_at?: string
        }
        Update: {
          brand_id?: string
          client_id?: string
          cohort_alvo?: string | null
          created_at?: string
          created_by?: string | null
          data?: Json
          formato?: string | null
          formato_recomendado?: string | null
          gancho?: string | null
          id?: string
          pilar?: string | null
          pilar_type?: string | null
          plataforma?: string | null
          status?: string
          titulo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "brand_pautas_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brain_stats_mv"
            referencedColumns: ["brand_id"]
          },
          {
            foreignKeyName: "brand_pautas_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "brand_pautas_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      brand_personas: {
        Row: {
          brand_id: string
          client_id: string
          created_at: string
          created_by: string | null
          data: Json
          id: string
          is_active: boolean
          updated_at: string
        }
        Insert: {
          brand_id: string
          client_id: string
          created_at?: string
          created_by?: string | null
          data?: Json
          id?: string
          is_active?: boolean
          updated_at?: string
        }
        Update: {
          brand_id?: string
          client_id?: string
          created_at?: string
          created_by?: string | null
          data?: Json
          id?: string
          is_active?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "brand_personas_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brain_stats_mv"
            referencedColumns: ["brand_id"]
          },
          {
            foreignKeyName: "brand_personas_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "brand_personas_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      brand_swot: {
        Row: {
          brand_id: string
          client_id: string
          created_at: string
          created_by: string | null
          data: Json
          id: string
          is_active: boolean
          updated_at: string
        }
        Insert: {
          brand_id: string
          client_id: string
          created_at?: string
          created_by?: string | null
          data?: Json
          id?: string
          is_active?: boolean
          updated_at?: string
        }
        Update: {
          brand_id?: string
          client_id?: string
          created_at?: string
          created_by?: string | null
          data?: Json
          id?: string
          is_active?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "brand_swot_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brain_stats_mv"
            referencedColumns: ["brand_id"]
          },
          {
            foreignKeyName: "brand_swot_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "brand_swot_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      brand_voice_cards: {
        Row: {
          brand_id: string
          client_id: string
          created_at: string
          created_by: string | null
          data: Json
          id: string
          is_active: boolean
          updated_at: string
        }
        Insert: {
          brand_id: string
          client_id: string
          created_at?: string
          created_by?: string | null
          data?: Json
          id?: string
          is_active?: boolean
          updated_at?: string
        }
        Update: {
          brand_id?: string
          client_id?: string
          created_at?: string
          created_by?: string | null
          data?: Json
          id?: string
          is_active?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "brand_voice_cards_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brain_stats_mv"
            referencedColumns: ["brand_id"]
          },
          {
            foreignKeyName: "brand_voice_cards_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "brand_voice_cards_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      brands: {
        Row: {
          bairro: string | null
          cep: string | null
          cidade: string | null
          cnpj: string | null
          color: string | null
          complemento: string | null
          cpf: string | null
          created_at: string
          created_by: string
          estado: string | null
          icon_url: string | null
          id: string
          logo_dark_url: string | null
          logo_url: string | null
          name: string
          nome_fantasia: string | null
          numero: string | null
          razao_social: string | null
          rua: string | null
          slug: string
          updated_at: string
        }
        Insert: {
          bairro?: string | null
          cep?: string | null
          cidade?: string | null
          cnpj?: string | null
          color?: string | null
          complemento?: string | null
          cpf?: string | null
          created_at?: string
          created_by: string
          estado?: string | null
          icon_url?: string | null
          id?: string
          logo_dark_url?: string | null
          logo_url?: string | null
          name: string
          nome_fantasia?: string | null
          numero?: string | null
          razao_social?: string | null
          rua?: string | null
          slug: string
          updated_at?: string
        }
        Update: {
          bairro?: string | null
          cep?: string | null
          cidade?: string | null
          cnpj?: string | null
          color?: string | null
          complemento?: string | null
          cpf?: string | null
          created_at?: string
          created_by?: string
          estado?: string | null
          icon_url?: string | null
          id?: string
          logo_dark_url?: string | null
          logo_url?: string | null
          name?: string
          nome_fantasia?: string | null
          numero?: string | null
          razao_social?: string | null
          rua?: string | null
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      calendar_events: {
        Row: {
          all_day: boolean
          brand_id: string | null
          client_id: string | null
          color: string | null
          created_at: string
          created_by: string | null
          description: string | null
          ends_at: string | null
          id: string
          is_global: boolean
          starts_at: string
          title: string
          type: Database["public"]["Enums"]["calendar_event_type"]
          updated_at: string
        }
        Insert: {
          all_day?: boolean
          brand_id?: string | null
          client_id?: string | null
          color?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          ends_at?: string | null
          id?: string
          is_global?: boolean
          starts_at: string
          title: string
          type: Database["public"]["Enums"]["calendar_event_type"]
          updated_at?: string
        }
        Update: {
          all_day?: boolean
          brand_id?: string | null
          client_id?: string | null
          color?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          ends_at?: string | null
          id?: string
          is_global?: boolean
          starts_at?: string
          title?: string
          type?: Database["public"]["Enums"]["calendar_event_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "calendar_events_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brain_stats_mv"
            referencedColumns: ["brand_id"]
          },
          {
            foreignKeyName: "calendar_events_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_events_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      card_approval_events: {
        Row: {
          brand_id: string
          comment: string | null
          created_at: string
          id: string
          ip: unknown
          post_id: string
          token_id: string | null
          user_agent: string | null
          verb: string
        }
        Insert: {
          brand_id: string
          comment?: string | null
          created_at?: string
          id?: string
          ip?: unknown
          post_id: string
          token_id?: string | null
          user_agent?: string | null
          verb: string
        }
        Update: {
          brand_id?: string
          comment?: string | null
          created_at?: string
          id?: string
          ip?: unknown
          post_id?: string
          token_id?: string | null
          user_agent?: string | null
          verb?: string
        }
        Relationships: [
          {
            foreignKeyName: "card_approval_events_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brain_stats_mv"
            referencedColumns: ["brand_id"]
          },
          {
            foreignKeyName: "card_approval_events_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "card_approval_events_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "card_approval_events_token_id_fkey"
            columns: ["token_id"]
            isOneToOne: false
            referencedRelation: "card_approval_tokens"
            referencedColumns: ["id"]
          },
        ]
      }
      card_approval_tokens: {
        Row: {
          brand_id: string
          created_at: string
          created_by: string | null
          expires_at: string | null
          id: string
          post_id: string
          revoked_at: string | null
          token: string
        }
        Insert: {
          brand_id: string
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          post_id: string
          revoked_at?: string | null
          token: string
        }
        Update: {
          brand_id?: string
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          post_id?: string
          revoked_at?: string | null
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "card_approval_tokens_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brain_stats_mv"
            referencedColumns: ["brand_id"]
          },
          {
            foreignKeyName: "card_approval_tokens_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "card_approval_tokens_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_conversations: {
        Row: {
          brand_id: string | null
          client_id: string | null
          created_at: string
          id: string
          last_message_at: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          brand_id?: string | null
          client_id?: string | null
          created_at?: string
          id?: string
          last_message_at?: string
          title?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          brand_id?: string | null
          client_id?: string | null
          created_at?: string
          id?: string
          last_message_at?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_conversations_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brain_stats_mv"
            referencedColumns: ["brand_id"]
          },
          {
            foreignKeyName: "chat_conversations_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_conversations_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_messages: {
        Row: {
          attachments: Json
          brain_context: Json | null
          content: string
          conversation_id: string
          created_at: string
          id: string
          model: string | null
          role: string
          tokens_in: number | null
          tokens_out: number | null
          tool_calls: Json
          used_llm: boolean
          user_id: string
        }
        Insert: {
          attachments?: Json
          brain_context?: Json | null
          content?: string
          conversation_id: string
          created_at?: string
          id?: string
          model?: string | null
          role: string
          tokens_in?: number | null
          tokens_out?: number | null
          tool_calls?: Json
          used_llm?: boolean
          user_id: string
        }
        Update: {
          attachments?: Json
          brain_context?: Json | null
          content?: string
          conversation_id?: string
          created_at?: string
          id?: string
          model?: string | null
          role?: string
          tokens_in?: number | null
          tokens_out?: number | null
          tool_calls?: Json
          used_llm?: boolean
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "chat_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      client_briefing_tokens: {
        Row: {
          brand_id: string
          client_id: string
          created_at: string
          created_by: string | null
          expires_at: string | null
          id: string
          label: string | null
          revoked_at: string | null
          submission: Json | null
          submitted_at: string | null
          token: string
          updated_at: string
        }
        Insert: {
          brand_id: string
          client_id: string
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          label?: string | null
          revoked_at?: string | null
          submission?: Json | null
          submitted_at?: string | null
          token: string
          updated_at?: string
        }
        Update: {
          brand_id?: string
          client_id?: string
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          label?: string | null
          revoked_at?: string | null
          submission?: Json | null
          submitted_at?: string | null
          token?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_briefing_tokens_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brain_stats_mv"
            referencedColumns: ["brand_id"]
          },
          {
            foreignKeyName: "client_briefing_tokens_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_briefing_tokens_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      client_briefings: {
        Row: {
          client_id: string
          created_at: string
          guidelines: string | null
          hashtags: string[] | null
          id: string
          monthly_volume: number | null
          personas: Json | null
          target_audience: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          client_id: string
          created_at?: string
          guidelines?: string | null
          hashtags?: string[] | null
          id?: string
          monthly_volume?: number | null
          personas?: Json | null
          target_audience?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          client_id?: string
          created_at?: string
          guidelines?: string | null
          hashtags?: string[] | null
          id?: string
          monthly_volume?: number | null
          personas?: Json | null
          target_audience?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_briefings_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: true
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      client_documents: {
        Row: {
          ai_error: string | null
          ai_model: string | null
          ai_status: string
          ai_summary: Json | null
          analyzed_at: string | null
          applied_to_briefing_at: string | null
          brand_id: string
          client_id: string
          created_at: string
          extracted_text: string | null
          id: string
          mime_type: string | null
          name: string
          size_bytes: number | null
          storage_path: string
          updated_at: string
          uploaded_by: string | null
          visible_to_client: boolean
        }
        Insert: {
          ai_error?: string | null
          ai_model?: string | null
          ai_status?: string
          ai_summary?: Json | null
          analyzed_at?: string | null
          applied_to_briefing_at?: string | null
          brand_id: string
          client_id: string
          created_at?: string
          extracted_text?: string | null
          id?: string
          mime_type?: string | null
          name: string
          size_bytes?: number | null
          storage_path: string
          updated_at?: string
          uploaded_by?: string | null
          visible_to_client?: boolean
        }
        Update: {
          ai_error?: string | null
          ai_model?: string | null
          ai_status?: string
          ai_summary?: Json | null
          analyzed_at?: string | null
          applied_to_briefing_at?: string | null
          brand_id?: string
          client_id?: string
          created_at?: string
          extracted_text?: string | null
          id?: string
          mime_type?: string | null
          name?: string
          size_bytes?: number | null
          storage_path?: string
          updated_at?: string
          uploaded_by?: string | null
          visible_to_client?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "client_documents_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brain_stats_mv"
            referencedColumns: ["brand_id"]
          },
          {
            foreignKeyName: "client_documents_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_documents_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      client_journey_events: {
        Row: {
          brand_id: string
          client_id: string
          created_at: string
          from_stage: string | null
          id: string
          moved_by: string | null
          note: string | null
          project_id: string | null
          to_stage: string
        }
        Insert: {
          brand_id: string
          client_id: string
          created_at?: string
          from_stage?: string | null
          id?: string
          moved_by?: string | null
          note?: string | null
          project_id?: string | null
          to_stage: string
        }
        Update: {
          brand_id?: string
          client_id?: string
          created_at?: string
          from_stage?: string | null
          id?: string
          moved_by?: string | null
          note?: string | null
          project_id?: string | null
          to_stage?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_journey_events_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brain_stats_mv"
            referencedColumns: ["brand_id"]
          },
          {
            foreignKeyName: "client_journey_events_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_journey_events_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_journey_events_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      client_members: {
        Row: {
          brand_id: string
          client_id: string
          created_at: string
          created_by: string | null
          id: string
          role: string
          user_id: string
        }
        Insert: {
          brand_id: string
          client_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          role?: string
          user_id: string
        }
        Update: {
          brand_id?: string
          client_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_members_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brain_stats_mv"
            referencedColumns: ["brand_id"]
          },
          {
            foreignKeyName: "client_members_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_members_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      client_social_accounts: {
        Row: {
          brand_id: string
          client_id: string
          connection_id: string
          created_at: string
          created_by: string | null
          id: string
        }
        Insert: {
          brand_id: string
          client_id: string
          connection_id: string
          created_at?: string
          created_by?: string | null
          id?: string
        }
        Update: {
          brand_id?: string
          client_id?: string
          connection_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_social_accounts_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brain_stats_mv"
            referencedColumns: ["brand_id"]
          },
          {
            foreignKeyName: "client_social_accounts_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_social_accounts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_social_accounts_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "social_connections"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          address: string | null
          archived_at: string | null
          brand_hub: Json
          brand_id: string
          color: string | null
          contact_email: string | null
          contact_name: string | null
          contact_phone: string | null
          contract_renewal_date: string | null
          contract_start_date: string | null
          contract_status: string
          created_at: string
          favicon_url: string | null
          id: string
          internal_notes: string | null
          is_active: boolean
          journey_stage: string
          logo_secondary_url: string | null
          logo_url: string | null
          margin_percent: number | null
          monthly_contract_value: number | null
          name: string
          niche: string | null
          owner_user_id: string | null
          palette: Json | null
          socials: Json | null
          tone_of_voice: string | null
          updated_at: string
          website: string | null
        }
        Insert: {
          address?: string | null
          archived_at?: string | null
          brand_hub?: Json
          brand_id: string
          color?: string | null
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          contract_renewal_date?: string | null
          contract_start_date?: string | null
          contract_status?: string
          created_at?: string
          favicon_url?: string | null
          id?: string
          internal_notes?: string | null
          is_active?: boolean
          journey_stage?: string
          logo_secondary_url?: string | null
          logo_url?: string | null
          margin_percent?: number | null
          monthly_contract_value?: number | null
          name: string
          niche?: string | null
          owner_user_id?: string | null
          palette?: Json | null
          socials?: Json | null
          tone_of_voice?: string | null
          updated_at?: string
          website?: string | null
        }
        Update: {
          address?: string | null
          archived_at?: string | null
          brand_hub?: Json
          brand_id?: string
          color?: string | null
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          contract_renewal_date?: string | null
          contract_start_date?: string | null
          contract_status?: string
          created_at?: string
          favicon_url?: string | null
          id?: string
          internal_notes?: string | null
          is_active?: boolean
          journey_stage?: string
          logo_secondary_url?: string | null
          logo_url?: string | null
          margin_percent?: number | null
          monthly_contract_value?: number | null
          name?: string
          niche?: string | null
          owner_user_id?: string | null
          palette?: Json | null
          socials?: Json | null
          tone_of_voice?: string | null
          updated_at?: string
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "clients_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brain_stats_mv"
            referencedColumns: ["brand_id"]
          },
          {
            foreignKeyName: "clients_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
      content_pipeline_stages: {
        Row: {
          color: string
          created_at: string
          enables_approval_link: boolean
          hide_in_portal: boolean
          id: string
          is_terminal: boolean
          key: string
          label: string
          pipeline_id: string
          position: number
          sla_days: number | null
          sla_hours: number | null
          updated_at: string
        }
        Insert: {
          color?: string
          created_at?: string
          enables_approval_link?: boolean
          hide_in_portal?: boolean
          id?: string
          is_terminal?: boolean
          key: string
          label: string
          pipeline_id: string
          position?: number
          sla_days?: number | null
          sla_hours?: number | null
          updated_at?: string
        }
        Update: {
          color?: string
          created_at?: string
          enables_approval_link?: boolean
          hide_in_portal?: boolean
          id?: string
          is_terminal?: boolean
          key?: string
          label?: string
          pipeline_id?: string
          position?: number
          sla_days?: number | null
          sla_hours?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "content_pipeline_stages_pipeline_id_fkey"
            columns: ["pipeline_id"]
            isOneToOne: false
            referencedRelation: "content_pipelines"
            referencedColumns: ["id"]
          },
        ]
      }
      content_pipelines: {
        Row: {
          brand_id: string
          client_id: string
          color: string | null
          created_at: string
          created_by: string | null
          description: string | null
          icon: string | null
          id: string
          is_default: boolean
          name: string
          position: number
          slug: string
          updated_at: string
        }
        Insert: {
          brand_id: string
          client_id: string
          color?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          icon?: string | null
          id?: string
          is_default?: boolean
          name: string
          position?: number
          slug: string
          updated_at?: string
        }
        Update: {
          brand_id?: string
          client_id?: string
          color?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          icon?: string | null
          id?: string
          is_default?: boolean
          name?: string
          position?: number
          slug?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "content_pipelines_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brain_stats_mv"
            referencedColumns: ["brand_id"]
          },
          {
            foreignKeyName: "content_pipelines_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_pipelines_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      feature_catalog: {
        Row: {
          category: string | null
          created_at: string
          description: string | null
          icon: string | null
          id: string
          is_core: boolean
          key: string
          name: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          is_core?: boolean
          key: string
          name: string
        }
        Update: {
          category?: string | null
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          is_core?: boolean
          key?: string
          name?: string
        }
        Relationships: []
      }
      media_plan_items: {
        Row: {
          audience: string | null
          benchmark: string | null
          budget_amount: number
          budget_pct: number
          campaign_type: string | null
          channel: string | null
          created_at: string
          funnel_stage: string | null
          id: string
          keywords: string[]
          main_kpi: string | null
          objective: string | null
          other_refs: string | null
          plan_id: string
          position: number
          product_service: string | null
          updated_at: string
        }
        Insert: {
          audience?: string | null
          benchmark?: string | null
          budget_amount?: number
          budget_pct?: number
          campaign_type?: string | null
          channel?: string | null
          created_at?: string
          funnel_stage?: string | null
          id?: string
          keywords?: string[]
          main_kpi?: string | null
          objective?: string | null
          other_refs?: string | null
          plan_id: string
          position?: number
          product_service?: string | null
          updated_at?: string
        }
        Update: {
          audience?: string | null
          benchmark?: string | null
          budget_amount?: number
          budget_pct?: number
          campaign_type?: string | null
          channel?: string | null
          created_at?: string
          funnel_stage?: string | null
          id?: string
          keywords?: string[]
          main_kpi?: string | null
          objective?: string | null
          other_refs?: string | null
          plan_id?: string
          position?: number
          product_service?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "media_plan_items_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "media_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      media_plans: {
        Row: {
          brand_id: string
          client_id: string
          created_at: string
          created_by: string | null
          id: string
          monthly_budget: number
          period_end: string | null
          period_start: string | null
          share_expires_at: string | null
          share_token: string | null
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          brand_id: string
          client_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          monthly_budget?: number
          period_end?: string | null
          period_start?: string | null
          share_expires_at?: string | null
          share_token?: string | null
          status?: string
          title?: string
          updated_at?: string
        }
        Update: {
          brand_id?: string
          client_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          monthly_budget?: number
          period_end?: string | null
          period_start?: string | null
          share_expires_at?: string | null
          share_token?: string | null
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "media_plans_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brain_stats_mv"
            referencedColumns: ["brand_id"]
          },
          {
            foreignKeyName: "media_plans_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "media_plans_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      message_logs: {
        Row: {
          brand_id: string
          channel: string
          created_at: string
          delivered_at: string | null
          error_message: string | null
          failed_at: string | null
          id: string
          metadata: Json
          provider_message_id: string | null
          recipient: string | null
          sent_at: string
          status: string
        }
        Insert: {
          brand_id: string
          channel: string
          created_at?: string
          delivered_at?: string | null
          error_message?: string | null
          failed_at?: string | null
          id?: string
          metadata?: Json
          provider_message_id?: string | null
          recipient?: string | null
          sent_at?: string
          status: string
        }
        Update: {
          brand_id?: string
          channel?: string
          created_at?: string
          delivered_at?: string | null
          error_message?: string | null
          failed_at?: string | null
          id?: string
          metadata?: Json
          provider_message_id?: string | null
          recipient?: string | null
          sent_at?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_logs_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brain_stats_mv"
            referencedColumns: ["brand_id"]
          },
          {
            foreignKeyName: "message_logs_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
      message_templates: {
        Row: {
          body: string
          brand_id: string
          channel: string
          created_at: string
          event_key: string
          id: string
          is_active: boolean
          subject: string | null
          updated_at: string
          updated_by: string | null
          variables_used: string[]
        }
        Insert: {
          body?: string
          brand_id: string
          channel: string
          created_at?: string
          event_key: string
          id?: string
          is_active?: boolean
          subject?: string | null
          updated_at?: string
          updated_by?: string | null
          variables_used?: string[]
        }
        Update: {
          body?: string
          brand_id?: string
          channel?: string
          created_at?: string
          event_key?: string
          id?: string
          is_active?: boolean
          subject?: string | null
          updated_at?: string
          updated_by?: string | null
          variables_used?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "message_templates_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brain_stats_mv"
            referencedColumns: ["brand_id"]
          },
          {
            foreignKeyName: "message_templates_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
      meta_compliance_events: {
        Row: {
          affected_connections: number
          confirmation_code: string
          created_at: string
          event_type: string
          id: string
          meta_user_id: string
          payload: Json
          status: string
          updated_at: string
        }
        Insert: {
          affected_connections?: number
          confirmation_code: string
          created_at?: string
          event_type: string
          id?: string
          meta_user_id: string
          payload?: Json
          status?: string
          updated_at?: string
        }
        Update: {
          affected_connections?: number
          confirmation_code?: string
          created_at?: string
          event_type?: string
          id?: string
          meta_user_id?: string
          payload?: Json
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      meta_oauth_sessions: {
        Row: {
          ad_accounts: Json
          brand_id: string
          consumed_at: string | null
          created_at: string
          expires_at: string
          id: string
          meta_user_email: string | null
          meta_user_id: string
          meta_user_name: string | null
          pages: Json
          portfolio_error: string | null
          portfolio_load_status: string
          portfolio_loaded_at: string | null
          portfolio_rate_limited_until: string | null
          portfolio_source_session_id: string | null
          requested_scopes: string[]
          scopes: string[]
          threads_accounts: Json
          user_id: string
          user_token_ciphertext: string
          user_token_expires_at: string | null
        }
        Insert: {
          ad_accounts?: Json
          brand_id: string
          consumed_at?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          meta_user_email?: string | null
          meta_user_id: string
          meta_user_name?: string | null
          pages?: Json
          portfolio_error?: string | null
          portfolio_load_status?: string
          portfolio_loaded_at?: string | null
          portfolio_rate_limited_until?: string | null
          portfolio_source_session_id?: string | null
          requested_scopes?: string[]
          scopes?: string[]
          threads_accounts?: Json
          user_id: string
          user_token_ciphertext: string
          user_token_expires_at?: string | null
        }
        Update: {
          ad_accounts?: Json
          brand_id?: string
          consumed_at?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          meta_user_email?: string | null
          meta_user_id?: string
          meta_user_name?: string | null
          pages?: Json
          portfolio_error?: string | null
          portfolio_load_status?: string
          portfolio_loaded_at?: string | null
          portfolio_rate_limited_until?: string | null
          portfolio_source_session_id?: string | null
          requested_scopes?: string[]
          scopes?: string[]
          threads_accounts?: Json
          user_id?: string
          user_token_ciphertext?: string
          user_token_expires_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "meta_oauth_sessions_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brain_stats_mv"
            referencedColumns: ["brand_id"]
          },
          {
            foreignKeyName: "meta_oauth_sessions_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meta_oauth_sessions_portfolio_source_session_id_fkey"
            columns: ["portfolio_source_session_id"]
            isOneToOne: false
            referencedRelation: "meta_oauth_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      monthly_plan_tokens: {
        Row: {
          brand_id: string
          client_id: string
          created_at: string
          created_by: string | null
          expires_at: string | null
          id: string
          monthly_plan_id: string
          revoked_at: string | null
          token: string
          updated_at: string
        }
        Insert: {
          brand_id: string
          client_id: string
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          monthly_plan_id: string
          revoked_at?: string | null
          token: string
          updated_at?: string
        }
        Update: {
          brand_id?: string
          client_id?: string
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          monthly_plan_id?: string
          revoked_at?: string | null
          token?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "monthly_plan_tokens_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brain_stats_mv"
            referencedColumns: ["brand_id"]
          },
          {
            foreignKeyName: "monthly_plan_tokens_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "monthly_plan_tokens_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "monthly_plan_tokens_monthly_plan_id_fkey"
            columns: ["monthly_plan_id"]
            isOneToOne: false
            referencedRelation: "monthly_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      monthly_plan_topics: {
        Row: {
          angle: string | null
          channel: string | null
          client_comment: string | null
          client_decision_at: string | null
          client_status: string
          content_format: string | null
          created_at: string
          id: string
          monthly_plan_id: string
          position: number
          previous_angle: string | null
          previous_title: string | null
          rationale: string | null
          status: string
          target_audience: string | null
          topic_title: string
          updated_at: string
        }
        Insert: {
          angle?: string | null
          channel?: string | null
          client_comment?: string | null
          client_decision_at?: string | null
          client_status?: string
          content_format?: string | null
          created_at?: string
          id?: string
          monthly_plan_id: string
          position?: number
          previous_angle?: string | null
          previous_title?: string | null
          rationale?: string | null
          status?: string
          target_audience?: string | null
          topic_title: string
          updated_at?: string
        }
        Update: {
          angle?: string | null
          channel?: string | null
          client_comment?: string | null
          client_decision_at?: string | null
          client_status?: string
          content_format?: string | null
          created_at?: string
          id?: string
          monthly_plan_id?: string
          position?: number
          previous_angle?: string | null
          previous_title?: string | null
          rationale?: string | null
          status?: string
          target_audience?: string | null
          topic_title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "monthly_plan_topics_monthly_plan_id_fkey"
            columns: ["monthly_plan_id"]
            isOneToOne: false
            referencedRelation: "monthly_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      monthly_plans: {
        Row: {
          brand_id: string
          client_decision_at: string | null
          client_decision_mode: string | null
          client_feedback: string | null
          client_id: string
          context_sources: Json
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          input_briefing_id: string | null
          input_theme: string | null
          internal_approved_at: string | null
          internal_approved_by: string | null
          objectives: string | null
          project_id: string | null
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          brand_id: string
          client_decision_at?: string | null
          client_decision_mode?: string | null
          client_feedback?: string | null
          client_id: string
          context_sources?: Json
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          input_briefing_id?: string | null
          input_theme?: string | null
          internal_approved_at?: string | null
          internal_approved_by?: string | null
          objectives?: string | null
          project_id?: string | null
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          brand_id?: string
          client_decision_at?: string | null
          client_decision_mode?: string | null
          client_feedback?: string | null
          client_id?: string
          context_sources?: Json
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          input_briefing_id?: string | null
          input_theme?: string | null
          internal_approved_at?: string | null
          internal_approved_by?: string | null
          objectives?: string | null
          project_id?: string | null
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "monthly_plans_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brain_stats_mv"
            referencedColumns: ["brand_id"]
          },
          {
            foreignKeyName: "monthly_plans_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "monthly_plans_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "monthly_plans_input_briefing_id_fkey"
            columns: ["input_briefing_id"]
            isOneToOne: false
            referencedRelation: "brand_briefings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "monthly_plans_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          brand_id: string
          created_at: string
          href: string | null
          id: string
          kind: Database["public"]["Enums"]["notification_kind"]
          payload: Json | null
          read_at: string | null
          title: string
          user_id: string
        }
        Insert: {
          body?: string | null
          brand_id: string
          created_at?: string
          href?: string | null
          id?: string
          kind: Database["public"]["Enums"]["notification_kind"]
          payload?: Json | null
          read_at?: string | null
          title: string
          user_id: string
        }
        Update: {
          body?: string | null
          brand_id?: string
          created_at?: string
          href?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["notification_kind"]
          payload?: Json | null
          read_at?: string | null
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brain_stats_mv"
            referencedColumns: ["brand_id"]
          },
          {
            foreignKeyName: "notifications_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
      portal_tokens: {
        Row: {
          client_id: string
          created_at: string
          created_by: string | null
          expires_at: string | null
          id: string
          label: string | null
          last_seen_at: string | null
          revoked_at: string | null
          token: string
        }
        Insert: {
          client_id: string
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          label?: string | null
          last_seen_at?: string | null
          revoked_at?: string | null
          token: string
        }
        Update: {
          client_id?: string
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          label?: string | null
          last_seen_at?: string | null
          revoked_at?: string | null
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "portal_tokens_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      post_approvals: {
        Row: {
          created_at: string
          decided_at: string | null
          decided_by: string | null
          decided_by_name: string | null
          id: string
          notes: string | null
          post_id: string
          status: Database["public"]["Enums"]["approval_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decided_by_name?: string | null
          id?: string
          notes?: string | null
          post_id: string
          status?: Database["public"]["Enums"]["approval_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decided_by_name?: string | null
          id?: string
          notes?: string | null
          post_id?: string
          status?: Database["public"]["Enums"]["approval_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "post_approvals_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      post_placements: {
        Row: {
          brand_id: string
          client_id: string
          copy_override: Json | null
          created_at: string
          external_ref: string | null
          format: string
          id: string
          is_primary: boolean
          media: Json
          post_id: string
          published_at: string | null
          scheduled_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          brand_id: string
          client_id: string
          copy_override?: Json | null
          created_at?: string
          external_ref?: string | null
          format: string
          id?: string
          is_primary?: boolean
          media?: Json
          post_id: string
          published_at?: string | null
          scheduled_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          brand_id?: string
          client_id?: string
          copy_override?: Json | null
          created_at?: string
          external_ref?: string | null
          format?: string
          id?: string
          is_primary?: boolean
          media?: Json
          post_id?: string
          published_at?: string | null
          scheduled_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "post_placements_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brain_stats_mv"
            referencedColumns: ["brand_id"]
          },
          {
            foreignKeyName: "post_placements_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_placements_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_placements_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      posts: {
        Row: {
          ai_phase: string
          approved_at: string | null
          approved_by: string | null
          assignee_id: string | null
          assignees: string[]
          brand_id: string
          channels: Database["public"]["Enums"]["post_channel"][]
          client_briefing: string | null
          client_id: string
          copy: string | null
          cover_url: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          design_brief: string | null
          format: string | null
          id: string
          internal_briefing: string | null
          monthly_plan_topic_id: string | null
          pipeline_id: string | null
          position: number
          priority: string | null
          project_id: string | null
          published_at: string | null
          recurrence: Json | null
          reference_media: Json
          references: Json
          remind_at: string | null
          review_status: string
          rework_notes: string | null
          scheduled_at: string | null
          script: Json | null
          stage: Database["public"]["Enums"]["post_stage"]
          stage_entered_at: string | null
          stage_id: string | null
          tags: string[]
          target_connection_ids: string[]
          title: string
          updated_at: string
          visible_in_portal: boolean
        }
        Insert: {
          ai_phase?: string
          approved_at?: string | null
          approved_by?: string | null
          assignee_id?: string | null
          assignees?: string[]
          brand_id: string
          channels?: Database["public"]["Enums"]["post_channel"][]
          client_briefing?: string | null
          client_id: string
          copy?: string | null
          cover_url?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          design_brief?: string | null
          format?: string | null
          id?: string
          internal_briefing?: string | null
          monthly_plan_topic_id?: string | null
          pipeline_id?: string | null
          position?: number
          priority?: string | null
          project_id?: string | null
          published_at?: string | null
          recurrence?: Json | null
          reference_media?: Json
          references?: Json
          remind_at?: string | null
          review_status?: string
          rework_notes?: string | null
          scheduled_at?: string | null
          script?: Json | null
          stage?: Database["public"]["Enums"]["post_stage"]
          stage_entered_at?: string | null
          stage_id?: string | null
          tags?: string[]
          target_connection_ids?: string[]
          title: string
          updated_at?: string
          visible_in_portal?: boolean
        }
        Update: {
          ai_phase?: string
          approved_at?: string | null
          approved_by?: string | null
          assignee_id?: string | null
          assignees?: string[]
          brand_id?: string
          channels?: Database["public"]["Enums"]["post_channel"][]
          client_briefing?: string | null
          client_id?: string
          copy?: string | null
          cover_url?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          design_brief?: string | null
          format?: string | null
          id?: string
          internal_briefing?: string | null
          monthly_plan_topic_id?: string | null
          pipeline_id?: string | null
          position?: number
          priority?: string | null
          project_id?: string | null
          published_at?: string | null
          recurrence?: Json | null
          reference_media?: Json
          references?: Json
          remind_at?: string | null
          review_status?: string
          rework_notes?: string | null
          scheduled_at?: string | null
          script?: Json | null
          stage?: Database["public"]["Enums"]["post_stage"]
          stage_entered_at?: string | null
          stage_id?: string | null
          tags?: string[]
          target_connection_ids?: string[]
          title?: string
          updated_at?: string
          visible_in_portal?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "posts_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brain_stats_mv"
            referencedColumns: ["brand_id"]
          },
          {
            foreignKeyName: "posts_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "posts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "posts_monthly_plan_topic_id_fkey"
            columns: ["monthly_plan_topic_id"]
            isOneToOne: false
            referencedRelation: "monthly_plan_topics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "posts_pipeline_id_fkey"
            columns: ["pipeline_id"]
            isOneToOne: false
            referencedRelation: "content_pipelines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "posts_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "posts_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "content_pipeline_stages"
            referencedColumns: ["id"]
          },
        ]
      }
      project_jobs: {
        Row: {
          brand_id: string
          color: string | null
          created_at: string
          description: string | null
          id: string
          name: string
          position: number
          project_id: string
          updated_at: string
        }
        Insert: {
          brand_id: string
          color?: string | null
          created_at?: string
          description?: string | null
          id?: string
          name: string
          position?: number
          project_id: string
          updated_at?: string
        }
        Update: {
          brand_id?: string
          color?: string | null
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          position?: number
          project_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_jobs_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brain_stats_mv"
            referencedColumns: ["brand_id"]
          },
          {
            foreignKeyName: "project_jobs_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_jobs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_template_jobs: {
        Row: {
          color: string | null
          created_at: string
          description: string | null
          id: string
          name: string
          position: number
          template_id: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          description?: string | null
          id?: string
          name: string
          position?: number
          template_id: string
        }
        Update: {
          color?: string | null
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          position?: number
          template_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_template_jobs_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "project_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      project_template_tasks: {
        Row: {
          created_at: string
          description: string | null
          estimated_minutes: number | null
          id: string
          position: number
          priority: string | null
          template_job_id: string
          title: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          estimated_minutes?: number | null
          id?: string
          position?: number
          priority?: string | null
          template_job_id: string
          title: string
        }
        Update: {
          created_at?: string
          description?: string | null
          estimated_minutes?: number | null
          id?: string
          position?: number
          priority?: string | null
          template_job_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_template_tasks_template_job_id_fkey"
            columns: ["template_job_id"]
            isOneToOne: false
            referencedRelation: "project_template_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      project_templates: {
        Row: {
          brand_id: string | null
          created_at: string
          created_by: string | null
          description: string | null
          icon: string | null
          id: string
          is_system: boolean
          name: string
          updated_at: string
        }
        Insert: {
          brand_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          icon?: string | null
          id?: string
          is_system?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          brand_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          icon?: string | null
          id?: string
          is_system?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_templates_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brain_stats_mv"
            referencedColumns: ["brand_id"]
          },
          {
            foreignKeyName: "project_templates_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          brand_id: string
          client_id: string | null
          color: string | null
          created_at: string
          description: string | null
          due_at: string | null
          goals: string | null
          id: string
          name: string
          owner_id: string | null
          progress: number
          start_date: string | null
          status: Database["public"]["Enums"]["project_status"]
          updated_at: string
        }
        Insert: {
          brand_id: string
          client_id?: string | null
          color?: string | null
          created_at?: string
          description?: string | null
          due_at?: string | null
          goals?: string | null
          id?: string
          name: string
          owner_id?: string | null
          progress?: number
          start_date?: string | null
          status?: Database["public"]["Enums"]["project_status"]
          updated_at?: string
        }
        Update: {
          brand_id?: string
          client_id?: string | null
          color?: string | null
          created_at?: string
          description?: string | null
          due_at?: string | null
          goals?: string | null
          id?: string
          name?: string
          owner_id?: string | null
          progress?: number
          start_date?: string | null
          status?: Database["public"]["Enums"]["project_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "projects_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brain_stats_mv"
            referencedColumns: ["brand_id"]
          },
          {
            foreignKeyName: "projects_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      sla_rules: {
        Row: {
          brand_id: string
          created_at: string
          id: string
          is_active: boolean
          project_id: string | null
          scope: string
          scope_ref: string | null
          target_hours: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          brand_id: string
          created_at?: string
          id?: string
          is_active?: boolean
          project_id?: string | null
          scope: string
          scope_ref?: string | null
          target_hours: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          brand_id?: string
          created_at?: string
          id?: string
          is_active?: boolean
          project_id?: string | null
          scope?: string
          scope_ref?: string | null
          target_hours?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sla_rules_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brain_stats_mv"
            referencedColumns: ["brand_id"]
          },
          {
            foreignKeyName: "sla_rules_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sla_rules_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      social_connections: {
        Row: {
          access_token_ciphertext: string
          account_id: string | null
          account_username: string | null
          brand_id: string
          channel: string
          client_id: string | null
          created_at: string
          created_by: string | null
          external_id: string
          external_name: string | null
          id: string
          last_error: string | null
          last_synced_at: string | null
          metadata: Json
          owner_external_id: string | null
          owner_name: string | null
          provider: string
          refresh_token_ciphertext: string | null
          scopes: string[]
          status: string
          token_expires_at: string | null
          updated_at: string
        }
        Insert: {
          access_token_ciphertext: string
          account_id?: string | null
          account_username?: string | null
          brand_id: string
          channel: string
          client_id?: string | null
          created_at?: string
          created_by?: string | null
          external_id: string
          external_name?: string | null
          id?: string
          last_error?: string | null
          last_synced_at?: string | null
          metadata?: Json
          owner_external_id?: string | null
          owner_name?: string | null
          provider: string
          refresh_token_ciphertext?: string | null
          scopes?: string[]
          status?: string
          token_expires_at?: string | null
          updated_at?: string
        }
        Update: {
          access_token_ciphertext?: string
          account_id?: string | null
          account_username?: string | null
          brand_id?: string
          channel?: string
          client_id?: string | null
          created_at?: string
          created_by?: string | null
          external_id?: string
          external_name?: string | null
          id?: string
          last_error?: string | null
          last_synced_at?: string | null
          metadata?: Json
          owner_external_id?: string | null
          owner_name?: string | null
          provider?: string
          refresh_token_ciphertext?: string | null
          scopes?: string[]
          status?: string
          token_expires_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "social_connections_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brain_stats_mv"
            referencedColumns: ["brand_id"]
          },
          {
            foreignKeyName: "social_connections_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "social_connections_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      social_posts: {
        Row: {
          brand_id: string
          caption: string | null
          client_id: string | null
          connection_id: string
          created_at: string
          created_by: string | null
          external_permalink: string | null
          external_post_id: string | null
          hashtags: string[]
          id: string
          last_error: string | null
          location_id: string | null
          media: Json
          mentions: string[]
          placement: string
          post_id: string | null
          provider: string
          provider_response: Json
          publish_attempts: number
          publish_locked_at: string | null
          published_at: string | null
          scheduled_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          brand_id: string
          caption?: string | null
          client_id?: string | null
          connection_id: string
          created_at?: string
          created_by?: string | null
          external_permalink?: string | null
          external_post_id?: string | null
          hashtags?: string[]
          id?: string
          last_error?: string | null
          location_id?: string | null
          media?: Json
          mentions?: string[]
          placement?: string
          post_id?: string | null
          provider: string
          provider_response?: Json
          publish_attempts?: number
          publish_locked_at?: string | null
          published_at?: string | null
          scheduled_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          brand_id?: string
          caption?: string | null
          client_id?: string | null
          connection_id?: string
          created_at?: string
          created_by?: string | null
          external_permalink?: string | null
          external_post_id?: string | null
          hashtags?: string[]
          id?: string
          last_error?: string | null
          location_id?: string | null
          media?: Json
          mentions?: string[]
          placement?: string
          post_id?: string | null
          provider?: string
          provider_response?: Json
          publish_attempts?: number
          publish_locked_at?: string | null
          published_at?: string | null
          scheduled_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "social_posts_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brain_stats_mv"
            referencedColumns: ["brand_id"]
          },
          {
            foreignKeyName: "social_posts_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "social_posts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "social_posts_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "social_connections"
            referencedColumns: ["id"]
          },
        ]
      }
      task_comments: {
        Row: {
          author_id: string
          body: string
          brand_id: string
          created_at: string
          id: string
          mentions: string[]
          task_id: string
          updated_at: string
        }
        Insert: {
          author_id: string
          body: string
          brand_id: string
          created_at?: string
          id?: string
          mentions?: string[]
          task_id: string
          updated_at?: string
        }
        Update: {
          author_id?: string
          body?: string
          brand_id?: string
          created_at?: string
          id?: string
          mentions?: string[]
          task_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_comments_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brain_stats_mv"
            referencedColumns: ["brand_id"]
          },
          {
            foreignKeyName: "task_comments_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_comments_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      task_subtasks: {
        Row: {
          brand_id: string
          created_at: string
          created_by: string | null
          done: boolean
          id: string
          position: number
          task_id: string
          title: string
          updated_at: string
        }
        Insert: {
          brand_id: string
          created_at?: string
          created_by?: string | null
          done?: boolean
          id?: string
          position?: number
          task_id: string
          title: string
          updated_at?: string
        }
        Update: {
          brand_id?: string
          created_at?: string
          created_by?: string | null
          done?: boolean
          id?: string
          position?: number
          task_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_subtasks_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brain_stats_mv"
            referencedColumns: ["brand_id"]
          },
          {
            foreignKeyName: "task_subtasks_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_subtasks_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      task_time_entries: {
        Row: {
          brand_id: string
          created_at: string
          description: string | null
          ended_at: string | null
          ended_reason: string | null
          id: string
          is_rework: boolean
          minutes: number | null
          seconds: number | null
          source: string
          started_at: string
          task_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          brand_id: string
          created_at?: string
          description?: string | null
          ended_at?: string | null
          ended_reason?: string | null
          id?: string
          is_rework?: boolean
          minutes?: number | null
          seconds?: number | null
          source?: string
          started_at?: string
          task_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          brand_id?: string
          created_at?: string
          description?: string | null
          ended_at?: string | null
          ended_reason?: string | null
          id?: string
          is_rework?: boolean
          minutes?: number | null
          seconds?: number | null
          source?: string
          started_at?: string
          task_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_time_entries_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brain_stats_mv"
            referencedColumns: ["brand_id"]
          },
          {
            foreignKeyName: "task_time_entries_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_time_entries_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          assignee_id: string | null
          brand_id: string
          client_id: string | null
          created_at: string
          created_by: string | null
          description: string | null
          done: boolean
          done_at: string | null
          due_at: string | null
          estimated_minutes: number | null
          id: string
          job_id: string | null
          position: number
          priority: Database["public"]["Enums"]["task_priority"]
          project_id: string | null
          status: Database["public"]["Enums"]["task_status"]
          title: string
          total_minutes: number
          updated_at: string
        }
        Insert: {
          assignee_id?: string | null
          brand_id: string
          client_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          done?: boolean
          done_at?: string | null
          due_at?: string | null
          estimated_minutes?: number | null
          id?: string
          job_id?: string | null
          position?: number
          priority?: Database["public"]["Enums"]["task_priority"]
          project_id?: string | null
          status?: Database["public"]["Enums"]["task_status"]
          title: string
          total_minutes?: number
          updated_at?: string
        }
        Update: {
          assignee_id?: string | null
          brand_id?: string
          client_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          done?: boolean
          done_at?: string | null
          due_at?: string | null
          estimated_minutes?: number | null
          id?: string
          job_id?: string | null
          position?: number
          priority?: Database["public"]["Enums"]["task_priority"]
          project_id?: string | null
          status?: Database["public"]["Enums"]["task_status"]
          title?: string
          total_minutes?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brain_stats_mv"
            referencedColumns: ["brand_id"]
          },
          {
            foreignKeyName: "tasks_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "project_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      user_profiles: {
        Row: {
          avatar_url: string | null
          bio: string | null
          created_at: string
          full_name: string
          id: string
          is_super_admin: boolean
          job_title: string | null
          locale: string
          notification_prefs: Json
          notify_whatsapp: boolean
          phone: string | null
          requires_password_change: boolean
          role: string
          timezone: string
          updated_at: string
          whatsapp: string | null
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          full_name: string
          id: string
          is_super_admin?: boolean
          job_title?: string | null
          locale?: string
          notification_prefs?: Json
          notify_whatsapp?: boolean
          phone?: string | null
          requires_password_change?: boolean
          role?: string
          timezone?: string
          updated_at?: string
          whatsapp?: string | null
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          full_name?: string
          id?: string
          is_super_admin?: boolean
          job_title?: string | null
          locale?: string
          notification_prefs?: Json
          notify_whatsapp?: boolean
          phone?: string | null
          requires_password_change?: boolean
          role?: string
          timezone?: string
          updated_at?: string
          whatsapp?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      brain_stats_mv: {
        Row: {
          brand_id: string | null
          posts: number | null
          projects: number | null
          refreshed_at: string | null
          tasks: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      _brain_cfg_days: {
        Args: { _default: number; _key: string }
        Returns: number
      }
      _portal_session: {
        Args: { _token: string }
        Returns: {
          brand_id: string
          client_id: string
          token_id: string
        }[]
      }
      accept_brand_invite: { Args: { _token: string }; Returns: string }
      brain_archive_and_prune_events: { Args: never; Returns: Json }
      brain_cleanup_ttl: { Args: never; Returns: Json }
      brain_ensure_event_partitions: {
        Args: { _months_back?: number; _months_forward?: number }
        Returns: number
      }
      brain_memory_decay_and_archive: { Args: never; Returns: number }
      brain_memory_evolve: {
        Args: {
          _brand_id: string
          _category: string
          _content?: Json
          _contradicts?: boolean
          _description?: string
          _entity_id: string
          _entity_type: string
          _evidence_confidence?: number
          _metadata?: Json
          _origin?: string
          _relations?: Json
          _source_event?: string
          _tags?: string[]
          _title: string
        }
        Returns: string
      }
      brain_memory_touch: { Args: { _ids: string[] }; Returns: number }
      brain_retention_run: { Args: never; Returns: Json }
      can_access_client: {
        Args: { _client_id: string; _user_id: string }
        Returns: boolean
      }
      can_manage_brand_ai_limits: {
        Args: { _brand_id: string; _user_id: string }
        Returns: boolean
      }
      check_ai_usage_budget: {
        Args: { _brand_id: string; _client_id: string; _user_id: string }
        Returns: Json
      }
      claim_scheduled_social_posts: {
        Args: { p_limit?: number }
        Returns: {
          brand_id: string
          caption: string
          client_id: string
          connection_id: string
          hashtags: string[]
          id: string
          media: Json
          mentions: string[]
          placement: string
          provider: string
          publish_attempts: number
        }[]
      }
      consolidate_brain_memory: {
        Args: { _brand_id?: string }
        Returns: number
      }
      derive_relationships_from_event: {
        Args: { _event_id: string }
        Returns: number
      }
      emit_brain_event: {
        Args: {
          p_action?: string
          p_actor_id?: string
          p_brand_id: string
          p_client_id?: string
          p_confidence?: number
          p_correlation_id?: string
          p_entity_id?: string
          p_entity_type?: string
          p_event_type: string
          p_payload?: Json
          p_project_id?: string
          p_source_module: string
        }
        Returns: string
      }
      enqueue_deadline_notifications: { Args: never; Returns: number }
      find_user_id_by_email: { Args: { _email: string }; Returns: string }
      get_brain_graph: {
        Args: { _brand_id?: string; _limit?: number }
        Returns: Json
      }
      get_brain_neighborhood: {
        Args: {
          _brand_id: string
          _depth?: number
          _entity_id: string
          _entity_type: string
        }
        Returns: Json
      }
      has_brand_role: {
        Args: {
          _brand_id: string
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      instantiate_project_template: {
        Args: {
          _brand_id: string
          _client_id: string
          _project_name: string
          _template_id: string
        }
        Returns: string
      }
      is_brand_member: {
        Args: { _brand_id: string; _user_id: string }
        Returns: boolean
      }
      is_super_admin:
        | { Args: never; Returns: boolean }
        | { Args: { _user_id: string }; Returns: boolean }
      link_existing_user_to_brand: {
        Args: {
          _brand_id: string
          _email: string
          _permissions?: Json
          _role: Database["public"]["Enums"]["app_role"]
        }
        Returns: {
          email: string
          full_name: string
          status: string
          user_id: string
        }[]
      }
      list_agent_catalog: {
        Args: never
        Returns: {
          agent_id: string
          agent_name: string
          required_fields: Json
          updated_at: string
        }[]
      }
      list_ai_usage_overview: {
        Args: {
          _brand_id: string
          _period_end?: string
          _period_start?: string
        }
        Returns: Json
      }
      mark_social_post_failed: {
        Args: { p_error: string; p_post_id: string }
        Returns: undefined
      }
      mark_social_post_published: {
        Args: { p_external_id: string; p_permalink: string; p_post_id: string }
        Returns: undefined
      }
      match_brain_events: {
        Args: { _brand_id: string; _match_count?: number; _query: string }
        Returns: {
          content_summary: string
          created_at: string
          event_id: string
          event_type: string
          payload: Json
          similarity: number
          source_module: string
        }[]
      }
      media_plan_public_items: { Args: { _token: string }; Returns: Json }
      media_plan_public_resolve: { Args: { _token: string }; Returns: Json }
      portal_approvals: {
        Args: { _status?: string; _token: string }
        Returns: Json
      }
      portal_briefings: { Args: { _token: string }; Returns: Json }
      portal_calendar: {
        Args: { _month?: string; _token: string }
        Returns: Json
      }
      portal_decide: {
        Args: {
          _decision: string
          _identity: string
          _note: string
          _post_id: string
          _token: string
        }
        Returns: Json
      }
      portal_feed: { Args: { _token: string }; Returns: Json }
      portal_files: {
        Args: { _search?: string; _token: string }
        Returns: Json
      }
      portal_metrics: { Args: { _token: string }; Returns: Json }
      portal_post: { Args: { _post_id: string; _token: string }; Returns: Json }
      portal_resolve: { Args: { _token: string }; Returns: Json }
      process_brain_learning_queue: { Args: { _limit?: number }; Returns: Json }
      reap_brain_learning_queue: { Args: never; Returns: number }
      reap_stuck_ai_jobs: { Args: never; Returns: number }
      refresh_brain_stats: { Args: never; Returns: undefined }
      refresh_task_total_minutes: {
        Args: { _task_id: string }
        Returns: number
      }
      start_timer: {
        Args: { _brand_id: string; _task_id: string }
        Returns: string
      }
      stop_timer: {
        Args: { _entry_id: string; _reason?: string }
        Returns: number
      }
      upsert_brain_relationship: {
        Args: {
          _bidirectional?: boolean
          _brand_id: string
          _from_id: string
          _from_type: string
          _metadata?: Json
          _rel_type: string
          _strength_delta?: number
          _to_id: string
          _to_type: string
        }
        Returns: string
      }
    }
    Enums: {
      alert_severity: "info" | "warning" | "critical"
      app_role: "owner" | "manager" | "editor" | "designer" | "client"
      approval_status:
        | "pending"
        | "approved"
        | "changes_requested"
        | "adjust"
        | "rejected"
      calendar_event_type: "appointment" | "seasonal"
      notification_kind:
        | "mention"
        | "assignment"
        | "approval_requested"
        | "approval_decision"
        | "deadline"
        | "system"
        | "sla_overdue"
        | "sla_overdue_manager"
      post_channel:
        | "instagram"
        | "tiktok"
        | "linkedin"
        | "x"
        | "youtube"
        | "blog"
      post_stage:
        | "idea"
        | "production"
        | "review"
        | "approved"
        | "scheduled"
        | "published"
      project_status:
        | "planning"
        | "in_progress"
        | "active"
        | "paused"
        | "done"
        | "archived"
      task_priority: "low" | "medium" | "high" | "urgent"
      task_status: "todo" | "in_progress" | "review" | "done"
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
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
      alert_severity: ["info", "warning", "critical"],
      app_role: ["owner", "manager", "editor", "designer", "client"],
      approval_status: [
        "pending",
        "approved",
        "changes_requested",
        "adjust",
        "rejected",
      ],
      calendar_event_type: ["appointment", "seasonal"],
      notification_kind: [
        "mention",
        "assignment",
        "approval_requested",
        "approval_decision",
        "deadline",
        "system",
        "sla_overdue",
        "sla_overdue_manager",
      ],
      post_channel: ["instagram", "tiktok", "linkedin", "x", "youtube", "blog"],
      post_stage: [
        "idea",
        "production",
        "review",
        "approved",
        "scheduled",
        "published",
      ],
      project_status: [
        "planning",
        "in_progress",
        "active",
        "paused",
        "done",
        "archived",
      ],
      task_priority: ["low", "medium", "high", "urgent"],
      task_status: ["todo", "in_progress", "review", "done"],
    },
  },
} as const
