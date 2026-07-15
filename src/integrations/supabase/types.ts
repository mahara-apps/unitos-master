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
      agent_prompts: {
        Row: {
          agent_id: string
          agent_name: string
          created_at: string
          default_prompt: string
          required_fields: Json
          system_prompt: string
          updated_at: string
        }
        Insert: {
          agent_id: string
          agent_name: string
          created_at?: string
          default_prompt: string
          required_fields?: Json
          system_prompt: string
          updated_at?: string
        }
        Update: {
          agent_id?: string
          agent_name?: string
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
            referencedRelation: "brands"
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
            referencedRelation: "brands"
            referencedColumns: ["id"]
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
            referencedRelation: "brands"
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
          color: string | null
          created_at: string
          created_by: string
          id: string
          logo_url: string | null
          name: string
          slug: string
          updated_at: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          created_by: string
          id?: string
          logo_url?: string | null
          name: string
          slug: string
          updated_at?: string
        }
        Update: {
          color?: string | null
          created_at?: string
          created_by?: string
          id?: string
          logo_url?: string | null
          name?: string
          slug?: string
          updated_at?: string
        }
        Relationships: []
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
          brand_id: string
          client_id: string
          created_at: string
          id: string
          mime_type: string | null
          name: string
          size_bytes: number | null
          storage_path: string
          updated_at: string
          uploaded_by: string | null
        }
        Insert: {
          brand_id: string
          client_id: string
          created_at?: string
          id?: string
          mime_type?: string | null
          name: string
          size_bytes?: number | null
          storage_path: string
          updated_at?: string
          uploaded_by?: string | null
        }
        Update: {
          brand_id?: string
          client_id?: string
          created_at?: string
          id?: string
          mime_type?: string | null
          name?: string
          size_bytes?: number | null
          storage_path?: string
          updated_at?: string
          uploaded_by?: string | null
        }
        Relationships: [
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
      clients: {
        Row: {
          archived_at: string | null
          brand_hub: Json
          brand_id: string
          color: string | null
          contact_email: string | null
          contact_name: string | null
          contact_phone: string | null
          created_at: string
          favicon_url: string | null
          id: string
          is_active: boolean
          logo_secondary_url: string | null
          logo_url: string | null
          name: string
          niche: string | null
          owner_user_id: string | null
          palette: Json | null
          socials: Json | null
          tone_of_voice: string | null
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          brand_hub?: Json
          brand_id: string
          color?: string | null
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          favicon_url?: string | null
          id?: string
          is_active?: boolean
          logo_secondary_url?: string | null
          logo_url?: string | null
          name: string
          niche?: string | null
          owner_user_id?: string | null
          palette?: Json | null
          socials?: Json | null
          tone_of_voice?: string | null
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          brand_hub?: Json
          brand_id?: string
          color?: string | null
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          favicon_url?: string | null
          id?: string
          is_active?: boolean
          logo_secondary_url?: string | null
          logo_url?: string | null
          name?: string
          niche?: string | null
          owner_user_id?: string | null
          palette?: Json | null
          socials?: Json | null
          tone_of_voice?: string | null
          updated_at?: string
        }
        Relationships: [
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
          stage_id: string | null
          tags: string[]
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
          stage_id?: string | null
          tags?: string[]
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
          stage_id?: string | null
          tags?: string[]
          title?: string
          updated_at?: string
          visible_in_portal?: boolean
        }
        Relationships: [
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
          id: string
          priority: Database["public"]["Enums"]["task_priority"]
          project_id: string | null
          status: Database["public"]["Enums"]["task_status"]
          title: string
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
          id?: string
          priority?: Database["public"]["Enums"]["task_priority"]
          project_id?: string | null
          status?: Database["public"]["Enums"]["task_status"]
          title: string
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
          id?: string
          priority?: Database["public"]["Enums"]["task_priority"]
          project_id?: string | null
          status?: Database["public"]["Enums"]["task_status"]
          title?: string
          updated_at?: string
        }
        Relationships: [
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
          phone: string | null
          requires_password_change: boolean
          role: string
          timezone: string
          updated_at: string
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
          phone?: string | null
          requires_password_change?: boolean
          role?: string
          timezone?: string
          updated_at?: string
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
          phone?: string | null
          requires_password_change?: boolean
          role?: string
          timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_brand_invite: { Args: { _token: string }; Returns: string }
      has_brand_role: {
        Args: {
          _brand_id: string
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_brand_member: {
        Args: { _brand_id: string; _user_id: string }
        Returns: boolean
      }
      is_super_admin:
        | { Args: never; Returns: boolean }
        | { Args: { _user_id: string }; Returns: boolean }
      reap_stuck_ai_jobs: { Args: never; Returns: number }
    }
    Enums: {
      alert_severity: "info" | "warning" | "critical"
      app_role: "owner" | "manager" | "editor" | "designer" | "client"
      approval_status: "pending" | "approved" | "changes_requested"
      notification_kind:
        | "mention"
        | "assignment"
        | "approval_requested"
        | "approval_decision"
        | "deadline"
        | "system"
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
      approval_status: ["pending", "approved", "changes_requested"],
      notification_kind: [
        "mention",
        "assignment",
        "approval_requested",
        "approval_decision",
        "deadline",
        "system",
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
