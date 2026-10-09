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
      agent_approvals: {
        Row: {
          created_at: string
          decided_at: string | null
          error: string | null
          executed_at: string | null
          expires_at: string | null
          id: string
          input: Json
          input_hash: string
          project_id: string
          reason: string | null
          result: Json | null
          risk: string
          status: string
          summary: string | null
          tool_name: string
          user_id: string
        }
        Insert: {
          created_at?: string
          decided_at?: string | null
          error?: string | null
          executed_at?: string | null
          expires_at?: string | null
          id?: string
          input?: Json
          input_hash: string
          project_id: string
          reason?: string | null
          result?: Json | null
          risk: string
          status?: string
          summary?: string | null
          tool_name: string
          user_id: string
        }
        Update: {
          created_at?: string
          decided_at?: string | null
          error?: string | null
          executed_at?: string | null
          expires_at?: string | null
          id?: string
          input?: Json
          input_hash?: string
          project_id?: string
          reason?: string | null
          result?: Json | null
          risk?: string
          status?: string
          summary?: string | null
          tool_name?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_approvals_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_goal_steps: {
        Row: {
          approval_id: string | null
          created_at: string
          error: string | null
          goal_id: string
          id: string
          input: Json
          project_id: string
          result: Json | null
          status: string
          tool_name: string
          user_id: string
        }
        Insert: {
          approval_id?: string | null
          created_at?: string
          error?: string | null
          goal_id: string
          id?: string
          input?: Json
          project_id: string
          result?: Json | null
          status?: string
          tool_name: string
          user_id: string
        }
        Update: {
          approval_id?: string | null
          created_at?: string
          error?: string | null
          goal_id?: string
          id?: string
          input?: Json
          project_id?: string
          result?: Json | null
          status?: string
          tool_name?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_goal_steps_approval_id_fkey"
            columns: ["approval_id"]
            isOneToOne: false
            referencedRelation: "agent_approvals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_goal_steps_goal_id_fkey"
            columns: ["goal_id"]
            isOneToOne: false
            referencedRelation: "agent_goals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_goal_steps_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_goals: {
        Row: {
          created_at: string
          goal: string
          id: string
          project_id: string
          status: string
          summary: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          goal: string
          id?: string
          project_id: string
          status?: string
          summary?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          goal?: string
          id?: string
          project_id?: string
          status?: string
          summary?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_goals_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_learnings: {
        Row: {
          created_at: string
          id: string
          insight: string
          project_id: string
          score: number
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          insight: string
          project_id: string
          score?: number
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          insight?: string
          project_id?: string
          score?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_learnings_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_posts: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          caption: string
          created_at: string
          external_post_id: string | null
          id: string
          media_path: string | null
          media_url: string | null
          meta: Json
          pillar: string | null
          platform: string
          project_id: string
          published_at: string | null
          reject_reason: string | null
          run_id: string | null
          scheduled_at: string | null
          scheduled_post_id: string | null
          status: string
          title: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          caption: string
          created_at?: string
          external_post_id?: string | null
          id?: string
          media_path?: string | null
          media_url?: string | null
          meta?: Json
          pillar?: string | null
          platform?: string
          project_id: string
          published_at?: string | null
          reject_reason?: string | null
          run_id?: string | null
          scheduled_at?: string | null
          scheduled_post_id?: string | null
          status?: string
          title?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          caption?: string
          created_at?: string
          external_post_id?: string | null
          id?: string
          media_path?: string | null
          media_url?: string | null
          meta?: Json
          pillar?: string | null
          platform?: string
          project_id?: string
          published_at?: string | null
          reject_reason?: string | null
          run_id?: string | null
          scheduled_at?: string | null
          scheduled_post_id?: string | null
          status?: string
          title?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_posts_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_posts_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "agent_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_posts_scheduled_post_id_fkey"
            columns: ["scheduled_post_id"]
            isOneToOne: false
            referencedRelation: "scheduled_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_runs: {
        Row: {
          created_at: string
          id: string
          kind: string
          post_ids: string[]
          project_id: string
          status: string
          summary: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          kind?: string
          post_ids?: string[]
          project_id: string
          status?: string
          summary?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          kind?: string
          post_ids?: string[]
          project_id?: string
          status?: string
          summary?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_runs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_settings: {
        Row: {
          active: boolean
          approval_email: string | null
          cadence: string
          created_at: string
          id: string
          last_run_at: string | null
          mode: string
          paused: boolean
          platforms: string[]
          posts_per_run: number
          project_id: string
          tone_override: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          active?: boolean
          approval_email?: string | null
          cadence?: string
          created_at?: string
          id?: string
          last_run_at?: string | null
          mode?: string
          paused?: boolean
          platforms?: string[]
          posts_per_run?: number
          project_id: string
          tone_override?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          active?: boolean
          approval_email?: string | null
          cadence?: string
          created_at?: string
          id?: string
          last_run_at?: string | null
          mode?: string
          paused?: boolean
          platforms?: string[]
          posts_per_run?: number
          project_id?: string
          tone_override?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_settings_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      brain_assets: {
        Row: {
          created_at: string
          id: string
          kind: string
          label: string | null
          project_id: string
          storage_path: string
        }
        Insert: {
          created_at?: string
          id?: string
          kind: string
          label?: string | null
          project_id: string
          storage_path: string
        }
        Update: {
          created_at?: string
          id?: string
          kind?: string
          label?: string | null
          project_id?: string
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "brain_assets_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      brand_brain: {
        Row: {
          brand_name: string | null
          brand_voice: string | null
          id: string
          logo_url: string | null
          primary_color: string | null
          secondary_color: string | null
          target_audience: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          brand_name?: string | null
          brand_voice?: string | null
          id?: string
          logo_url?: string | null
          primary_color?: string | null
          secondary_color?: string | null
          target_audience?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          brand_name?: string | null
          brand_voice?: string | null
          id?: string
          logo_url?: string | null
          primary_color?: string | null
          secondary_color?: string | null
          target_audience?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      business_brains: {
        Row: {
          created_at: string
          data: Json
          id: string
          project_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          data?: Json
          id?: string
          project_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          data?: Json
          id?: string
          project_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "business_brains_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: true
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      campaigns: {
        Row: {
          agent_brief: Json | null
          asset_status: Json
          campaign_duration: string
          campaign_theme: string
          campaign_title: string
          cart_closes_at: string | null
          checkout_url: string | null
          created_at: string
          current_phase: number
          guide_cover_url: string | null
          guide_intro: string | null
          guide_sections: Json | null
          guide_title: string | null
          has_blog: boolean
          has_email_sequence: boolean
          has_image_pack: boolean
          has_landing_page: boolean
          has_lead_magnet: boolean
          has_social_posts: boolean
          id: string
          is_default: boolean
          landing_page_headline: string | null
          landing_page_subheadline: string | null
          lead_magnet_content: Json | null
          phase_override: boolean
          phase_started_at: string | null
          plan_week_end: number | null
          plan_week_start: number | null
          project_id: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          agent_brief?: Json | null
          asset_status?: Json
          campaign_duration?: string
          campaign_theme: string
          campaign_title: string
          cart_closes_at?: string | null
          checkout_url?: string | null
          created_at?: string
          current_phase?: number
          guide_cover_url?: string | null
          guide_intro?: string | null
          guide_sections?: Json | null
          guide_title?: string | null
          has_blog?: boolean
          has_email_sequence?: boolean
          has_image_pack?: boolean
          has_landing_page?: boolean
          has_lead_magnet?: boolean
          has_social_posts?: boolean
          id?: string
          is_default?: boolean
          landing_page_headline?: string | null
          landing_page_subheadline?: string | null
          lead_magnet_content?: Json | null
          phase_override?: boolean
          phase_started_at?: string | null
          plan_week_end?: number | null
          plan_week_start?: number | null
          project_id?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          agent_brief?: Json | null
          asset_status?: Json
          campaign_duration?: string
          campaign_theme?: string
          campaign_title?: string
          cart_closes_at?: string | null
          checkout_url?: string | null
          created_at?: string
          current_phase?: number
          guide_cover_url?: string | null
          guide_intro?: string | null
          guide_sections?: Json | null
          guide_title?: string | null
          has_blog?: boolean
          has_email_sequence?: boolean
          has_image_pack?: boolean
          has_landing_page?: boolean
          has_lead_magnet?: boolean
          has_social_posts?: boolean
          id?: string
          is_default?: boolean
          landing_page_headline?: string | null
          landing_page_subheadline?: string | null
          lead_magnet_content?: Json | null
          phase_override?: boolean
          phase_started_at?: string | null
          plan_week_end?: number | null
          plan_week_start?: number | null
          project_id?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaigns_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      competitor_scans: {
        Row: {
          competitor_name: string
          competitor_url: string | null
          created_at: string
          id: string
          platform: string
          project_id: string | null
          results_json: Json
          user_id: string
        }
        Insert: {
          competitor_name: string
          competitor_url?: string | null
          created_at?: string
          id?: string
          platform?: string
          project_id?: string | null
          results_json?: Json
          user_id: string
        }
        Update: {
          competitor_name?: string
          competitor_url?: string | null
          created_at?: string
          id?: string
          platform?: string
          project_id?: string | null
          results_json?: Json
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "competitor_scans_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      competitor_signals: {
        Row: {
          angle_brief: string
          angle_title: string
          competitor_name: string
          created_at: string
          id: string
          pillar: string
          project_id: string
          status: string
          summary: string
          user_id: string
          watch_id: string
        }
        Insert: {
          angle_brief?: string
          angle_title?: string
          competitor_name?: string
          created_at?: string
          id?: string
          pillar?: string
          project_id: string
          status?: string
          summary?: string
          user_id: string
          watch_id: string
        }
        Update: {
          angle_brief?: string
          angle_title?: string
          competitor_name?: string
          created_at?: string
          id?: string
          pillar?: string
          project_id?: string
          status?: string
          summary?: string
          user_id?: string
          watch_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "competitor_signals_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "competitor_signals_watch_id_fkey"
            columns: ["watch_id"]
            isOneToOne: false
            referencedRelation: "competitor_watch"
            referencedColumns: ["id"]
          },
        ]
      }
      competitor_watch: {
        Row: {
          competitor_name: string
          competitor_url: string
          created_at: string
          enabled: boolean
          id: string
          last_checked_at: string | null
          last_fingerprint: string | null
          platform: string
          project_id: string
          user_id: string
        }
        Insert: {
          competitor_name: string
          competitor_url: string
          created_at?: string
          enabled?: boolean
          id?: string
          last_checked_at?: string | null
          last_fingerprint?: string | null
          platform?: string
          project_id: string
          user_id: string
        }
        Update: {
          competitor_name?: string
          competitor_url?: string
          created_at?: string
          enabled?: boolean
          id?: string
          last_checked_at?: string | null
          last_fingerprint?: string | null
          platform?: string
          project_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "competitor_watch_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      content_bank_items: {
        Row: {
          body: string | null
          campaign_id: string | null
          collection: string | null
          created_at: string
          id: string
          is_archived: boolean
          is_favourite: boolean
          kind: string
          meta: Json
          project_id: string
          source_history_id: string | null
          tags: string[]
          title: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          body?: string | null
          campaign_id?: string | null
          collection?: string | null
          created_at?: string
          id?: string
          is_archived?: boolean
          is_favourite?: boolean
          kind: string
          meta?: Json
          project_id: string
          source_history_id?: string | null
          tags?: string[]
          title?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          body?: string | null
          campaign_id?: string | null
          collection?: string | null
          created_at?: string
          id?: string
          is_archived?: boolean
          is_favourite?: boolean
          kind?: string
          meta?: Json
          project_id?: string
          source_history_id?: string | null
          tags?: string[]
          title?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "content_bank_items_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      content_posts: {
        Row: {
          campaign_id: string | null
          caption: string
          created_at: string
          hashtags: string[]
          id: string
          media_path: string | null
          media_url: string | null
          meta: Json
          paired_guide_campaign_id: string | null
          paired_landing_page_id: string | null
          pillar: string | null
          plan_slot: string | null
          platform: string
          project_id: string | null
          published_at: string | null
          scheduled_at: string | null
          scheduled_post_id: string | null
          source: string
          status: string
          title: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          campaign_id?: string | null
          caption?: string
          created_at?: string
          hashtags?: string[]
          id?: string
          media_path?: string | null
          media_url?: string | null
          meta?: Json
          paired_guide_campaign_id?: string | null
          paired_landing_page_id?: string | null
          pillar?: string | null
          plan_slot?: string | null
          platform?: string
          project_id?: string | null
          published_at?: string | null
          scheduled_at?: string | null
          scheduled_post_id?: string | null
          source?: string
          status?: string
          title?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          campaign_id?: string | null
          caption?: string
          created_at?: string
          hashtags?: string[]
          id?: string
          media_path?: string | null
          media_url?: string | null
          meta?: Json
          paired_guide_campaign_id?: string | null
          paired_landing_page_id?: string | null
          pillar?: string | null
          plan_slot?: string | null
          platform?: string
          project_id?: string | null
          published_at?: string | null
          scheduled_at?: string | null
          scheduled_post_id?: string | null
          source?: string
          status?: string
          title?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "content_posts_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_posts_paired_guide_campaign_id_fkey"
            columns: ["paired_guide_campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_posts_paired_landing_page_id_fkey"
            columns: ["paired_landing_page_id"]
            isOneToOne: false
            referencedRelation: "landing_pages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_posts_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_posts_scheduled_post_id_fkey"
            columns: ["scheduled_post_id"]
            isOneToOne: false
            referencedRelation: "scheduled_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      director_recommendations: {
        Row: {
          completed_keys: string[]
          dismissed_at: string | null
          generated_at: string
          id: string
          project_id: string
          recommendations: Json
        }
        Insert: {
          completed_keys?: string[]
          dismissed_at?: string | null
          generated_at?: string
          id?: string
          project_id: string
          recommendations: Json
        }
        Update: {
          completed_keys?: string[]
          dismissed_at?: string | null
          generated_at?: string
          id?: string
          project_id?: string
          recommendations?: Json
        }
        Relationships: [
          {
            foreignKeyName: "director_recommendations_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      email_send_log: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          message_id: string | null
          metadata: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email?: string
          status?: string
          template_name?: string
        }
        Relationships: []
      }
      email_send_state: {
        Row: {
          auth_email_ttl_minutes: number
          batch_size: number
          id: number
          retry_after_until: string | null
          send_delay_ms: number
          transactional_email_ttl_minutes: number
          updated_at: string
        }
        Insert: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Update: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Relationships: []
      }
      email_sequences: {
        Row: {
          audience_id: string | null
          audience_name: string | null
          campaign_id: string | null
          created_at: string
          email_body: string
          email_subject: string
          hero_image_path: string | null
          hero_image_url: string | null
          id: string
          phase: number
          planned_send_at: string | null
          preview_text: string | null
          project_id: string | null
          send_order: number
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          audience_id?: string | null
          audience_name?: string | null
          campaign_id?: string | null
          created_at?: string
          email_body?: string
          email_subject?: string
          hero_image_path?: string | null
          hero_image_url?: string | null
          id?: string
          phase?: number
          planned_send_at?: string | null
          preview_text?: string | null
          project_id?: string | null
          send_order?: number
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          audience_id?: string | null
          audience_name?: string | null
          campaign_id?: string | null
          created_at?: string
          email_body?: string
          email_subject?: string
          hero_image_path?: string | null
          hero_image_url?: string | null
          id?: string
          phase?: number
          planned_send_at?: string | null
          preview_text?: string | null
          project_id?: string | null
          send_order?: number
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_sequences_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_sequences_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      email_unsubscribe_tokens: {
        Row: {
          created_at: string
          email: string
          id: string
          token: string
          used_at: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          token: string
          used_at?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          token?: string
          used_at?: string | null
        }
        Relationships: []
      }
      engine_access: {
        Row: {
          amount_cents: number | null
          comp_access: boolean
          comp_tier: string | null
          created_at: string
          credits_limit: number
          credits_period_start: string
          credits_used: number
          currency: string | null
          email: string | null
          founding_member: boolean
          founding_until: string | null
          paid_at: string
          plan: string
          status: string
          stripe_session_id: string | null
          stripe_subscription_id: string | null
          tier: string | null
          user_id: string
        }
        Insert: {
          amount_cents?: number | null
          comp_access?: boolean
          comp_tier?: string | null
          created_at?: string
          credits_limit?: number
          credits_period_start?: string
          credits_used?: number
          currency?: string | null
          email?: string | null
          founding_member?: boolean
          founding_until?: string | null
          paid_at?: string
          plan?: string
          status?: string
          stripe_session_id?: string | null
          stripe_subscription_id?: string | null
          tier?: string | null
          user_id: string
        }
        Update: {
          amount_cents?: number | null
          comp_access?: boolean
          comp_tier?: string | null
          created_at?: string
          credits_limit?: number
          credits_period_start?: string
          credits_used?: number
          currency?: string | null
          email?: string | null
          founding_member?: boolean
          founding_until?: string | null
          paid_at?: string
          plan?: string
          status?: string
          stripe_session_id?: string | null
          stripe_subscription_id?: string | null
          tier?: string | null
          user_id?: string
        }
        Relationships: []
      }
      engine_usage: {
        Row: {
          created_at: string
          free_generation_used: boolean
          free_generations_used: number
          free_posts_used: boolean
          free_starter_used: boolean
          free_uses_remaining: number
          free_voice_used: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          free_generation_used?: boolean
          free_generations_used?: number
          free_posts_used?: boolean
          free_starter_used?: boolean
          free_uses_remaining?: number
          free_voice_used?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          free_generation_used?: boolean
          free_generations_used?: number
          free_posts_used?: boolean
          free_starter_used?: boolean
          free_uses_remaining?: number
          free_voice_used?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      funnels: {
        Row: {
          campaign_id: string | null
          created_at: string
          email_output: string
          id: string
          magnet_output: string
          magnet_type: string
          offer: string
          price: string
          problem: string
          project_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          campaign_id?: string | null
          created_at?: string
          email_output?: string
          id?: string
          magnet_output?: string
          magnet_type?: string
          offer?: string
          price?: string
          problem?: string
          project_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          campaign_id?: string | null
          created_at?: string
          email_output?: string
          id?: string
          magnet_output?: string
          magnet_type?: string
          offer?: string
          price?: string
          problem?: string
          project_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "funnels_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      inbound_webhook_tokens: {
        Row: {
          created_at: string
          id: string
          landing_page_id: string | null
          platform: string
          project_id: string
          token: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          landing_page_id?: string | null
          platform: string
          project_id: string
          token: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          landing_page_id?: string | null
          platform?: string
          project_id?: string
          token?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inbound_webhook_tokens_landing_page_id_fkey"
            columns: ["landing_page_id"]
            isOneToOne: false
            referencedRelation: "landing_pages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inbound_webhook_tokens_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      industry_insights: {
        Row: {
          created_at: string
          id: string
          industry_key: string
          insights: string
          period: string
        }
        Insert: {
          created_at?: string
          id?: string
          industry_key: string
          insights: string
          period: string
        }
        Update: {
          created_at?: string
          id?: string
          industry_key?: string
          insights?: string
          period?: string
        }
        Relationships: []
      }
      landing_page_leads: {
        Row: {
          campaign_id: string | null
          company: string | null
          created_at: string
          email: string
          first_name: string | null
          id: string
          last_name: string | null
          page_id: string
          phone: string | null
          source_platform: string | null
          source_slug: string | null
          status: string
          sync_error: string | null
          synced_at: string | null
        }
        Insert: {
          campaign_id?: string | null
          company?: string | null
          created_at?: string
          email: string
          first_name?: string | null
          id?: string
          last_name?: string | null
          page_id: string
          phone?: string | null
          source_platform?: string | null
          source_slug?: string | null
          status?: string
          sync_error?: string | null
          synced_at?: string | null
        }
        Update: {
          campaign_id?: string | null
          company?: string | null
          created_at?: string
          email?: string
          first_name?: string | null
          id?: string
          last_name?: string | null
          page_id?: string
          phone?: string | null
          source_platform?: string | null
          source_slug?: string | null
          status?: string
          sync_error?: string | null
          synced_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "landing_page_leads_page_id_fkey"
            columns: ["page_id"]
            isOneToOne: false
            referencedRelation: "landing_pages"
            referencedColumns: ["id"]
          },
        ]
      }
      landing_pages: {
        Row: {
          campaign_id: string | null
          content: Json
          created_at: string
          id: string
          project_id: string | null
          slug: string
          status: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          campaign_id?: string | null
          content?: Json
          created_at?: string
          id?: string
          project_id?: string | null
          slug: string
          status?: string
          title?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          campaign_id?: string | null
          content?: Json
          created_at?: string
          id?: string
          project_id?: string | null
          slug?: string
          status?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "landing_pages_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "landing_pages_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_automation_events: {
        Row: {
          automation_id: string | null
          capture_id: string | null
          created_at: string
          detail: string | null
          id: string
          kind: string
          ok: boolean
          user_id: string
        }
        Insert: {
          automation_id?: string | null
          capture_id?: string | null
          created_at?: string
          detail?: string | null
          id?: string
          kind: string
          ok?: boolean
          user_id: string
        }
        Update: {
          automation_id?: string | null
          capture_id?: string | null
          created_at?: string
          detail?: string | null
          id?: string
          kind?: string
          ok?: boolean
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_automation_events_automation_id_fkey"
            columns: ["automation_id"]
            isOneToOne: false
            referencedRelation: "lead_automations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_automation_events_capture_id_fkey"
            columns: ["capture_id"]
            isOneToOne: false
            referencedRelation: "lead_captures"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_automations: {
        Row: {
          active: boolean
          comment_reply_variants: string[]
          connection_id: string | null
          created_at: string
          dedupe_per_person: boolean
          dm_message: string
          followup_delay_hours: number
          followup_message: string | null
          handoff_delay_hours: number
          handoff_email: string | null
          handoff_enabled: boolean
          id: string
          ignore_handles: string[]
          keywords: string[]
          match_mode: string
          name: string
          project_id: string | null
          scope: string
          target_post_ids: string[]
          updated_at: string
          user_id: string
        }
        Insert: {
          active?: boolean
          comment_reply_variants?: string[]
          connection_id?: string | null
          created_at?: string
          dedupe_per_person?: boolean
          dm_message?: string
          followup_delay_hours?: number
          followup_message?: string | null
          handoff_delay_hours?: number
          handoff_email?: string | null
          handoff_enabled?: boolean
          id?: string
          ignore_handles?: string[]
          keywords?: string[]
          match_mode?: string
          name?: string
          project_id?: string | null
          scope?: string
          target_post_ids?: string[]
          updated_at?: string
          user_id: string
        }
        Update: {
          active?: boolean
          comment_reply_variants?: string[]
          connection_id?: string | null
          created_at?: string
          dedupe_per_person?: boolean
          dm_message?: string
          followup_delay_hours?: number
          followup_message?: string | null
          handoff_delay_hours?: number
          handoff_email?: string | null
          handoff_enabled?: boolean
          id?: string
          ignore_handles?: string[]
          keywords?: string[]
          match_mode?: string
          name?: string
          project_id?: string | null
          scope?: string
          target_post_ids?: string[]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_automations_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "social_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_automations_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_captures: {
        Row: {
          automation_id: string | null
          avatar_url: string | null
          comment_text: string
          commenter_external_id: string | null
          commenter_handle: string | null
          commenter_name: string | null
          created_at: string
          dm_status: string
          external_comment_id: string
          followup_status: string
          handoff_status: string
          id: string
          last_error: string | null
          matched_keyword: string | null
          notes: string | null
          platform: string
          post_external_id: string | null
          post_permalink: string | null
          reply_status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          automation_id?: string | null
          avatar_url?: string | null
          comment_text?: string
          commenter_external_id?: string | null
          commenter_handle?: string | null
          commenter_name?: string | null
          created_at?: string
          dm_status?: string
          external_comment_id: string
          followup_status?: string
          handoff_status?: string
          id?: string
          last_error?: string | null
          matched_keyword?: string | null
          notes?: string | null
          platform: string
          post_external_id?: string | null
          post_permalink?: string | null
          reply_status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          automation_id?: string | null
          avatar_url?: string | null
          comment_text?: string
          commenter_external_id?: string | null
          commenter_handle?: string | null
          commenter_name?: string | null
          created_at?: string
          dm_status?: string
          external_comment_id?: string
          followup_status?: string
          handoff_status?: string
          id?: string
          last_error?: string | null
          matched_keyword?: string | null
          notes?: string | null
          platform?: string
          post_external_id?: string | null
          post_permalink?: string | null
          reply_status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_captures_automation_id_fkey"
            columns: ["automation_id"]
            isOneToOne: false
            referencedRelation: "lead_automations"
            referencedColumns: ["id"]
          },
        ]
      }
      mailchimp_settings: {
        Row: {
          created_at: string
          id: string
          mailchimp_api_key: string | null
          mailchimp_server_prefix: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          mailchimp_api_key?: string | null
          mailchimp_server_prefix?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          mailchimp_api_key?: string | null
          mailchimp_server_prefix?: string | null
          user_id?: string
        }
        Relationships: []
      }
      marketing_history: {
        Row: {
          created_at: string
          id: string
          module: string
          output: string | null
          project_id: string
          prompt: Json | null
          title: string | null
          tokens: number | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          module: string
          output?: string | null
          project_id: string
          prompt?: Json | null
          title?: string | null
          tokens?: number | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          module?: string
          output?: string | null
          project_id?: string
          prompt?: Json | null
          title?: string | null
          tokens?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "marketing_history_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      orchestration_runs: {
        Row: {
          actions: Json
          analysis: Json
          campaign_id: string | null
          completed_at: string | null
          created_asset_ids: Json
          created_at: string
          first_post_at: string | null
          goal: string
          id: string
          inputs: Json
          placements: Json
          plan: Json
          project_id: string
          stage: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          actions?: Json
          analysis?: Json
          campaign_id?: string | null
          completed_at?: string | null
          created_asset_ids?: Json
          created_at?: string
          first_post_at?: string | null
          goal: string
          id?: string
          inputs?: Json
          placements?: Json
          plan?: Json
          project_id: string
          stage?: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          actions?: Json
          analysis?: Json
          campaign_id?: string | null
          completed_at?: string | null
          created_asset_ids?: Json
          created_at?: string
          first_post_at?: string | null
          goal?: string
          id?: string
          inputs?: Json
          placements?: Json
          plan?: Json
          project_id?: string
          stage?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "orchestration_runs_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orchestration_runs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      personas: {
        Row: {
          created_at: string
          id: string
          persona_data: Json
          persona_name: string
          project_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          persona_data?: Json
          persona_name: string
          project_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          persona_data?: Json
          persona_name?: string
          project_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "personas_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      post_targets: {
        Row: {
          connection_id: string
          created_at: string
          error_message: string | null
          external_post_id: string | null
          id: string
          permalink: string | null
          post_id: string
          published_at: string | null
          status: Database["public"]["Enums"]["target_status"]
          updated_at: string
        }
        Insert: {
          connection_id: string
          created_at?: string
          error_message?: string | null
          external_post_id?: string | null
          id?: string
          permalink?: string | null
          post_id: string
          published_at?: string | null
          status?: Database["public"]["Enums"]["target_status"]
          updated_at?: string
        }
        Update: {
          connection_id?: string
          created_at?: string
          error_message?: string | null
          external_post_id?: string | null
          id?: string
          permalink?: string | null
          post_id?: string
          published_at?: string | null
          status?: Database["public"]["Enums"]["target_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "post_targets_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "social_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_targets_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "scheduled_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          updated_at: string
          zernio_profile_id: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          updated_at?: string
          zernio_profile_id?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          updated_at?: string
          zernio_profile_id?: string | null
        }
        Relationships: []
      }
      projects: {
        Row: {
          created_at: string
          id: string
          is_default: boolean
          name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_default?: boolean
          name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_default?: boolean
          name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      publishing_preferences: {
        Row: {
          autopilot: boolean
          created_at: string
          posting_times: Json
          project_id: string
          timezone: string
          updated_at: string
          user_id: string
        }
        Insert: {
          autopilot?: boolean
          created_at?: string
          posting_times?: Json
          project_id: string
          timezone?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          autopilot?: boolean
          created_at?: string
          posting_times?: Json
          project_id?: string
          timezone?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "publishing_preferences_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: true
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      redemption_codes: {
        Row: {
          code: string
          created_at: string
          created_by: string | null
          expires_at: string | null
          id: string
          note: string | null
          redeemed_at: string | null
          redeemed_by: string | null
          single_use: boolean
          tier: string
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          note?: string | null
          redeemed_at?: string | null
          redeemed_by?: string | null
          single_use?: boolean
          tier: string
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          note?: string | null
          redeemed_at?: string | null
          redeemed_by?: string | null
          single_use?: boolean
          tier?: string
          updated_at?: string
        }
        Relationships: []
      }
      scheduled_posts: {
        Row: {
          caption: string
          created_at: string
          id: string
          last_error: string | null
          media_path: string | null
          media_url: string | null
          pillar: string | null
          platform: string | null
          scheduled_at: string | null
          status: Database["public"]["Enums"]["post_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          caption?: string
          created_at?: string
          id?: string
          last_error?: string | null
          media_path?: string | null
          media_url?: string | null
          pillar?: string | null
          platform?: string | null
          scheduled_at?: string | null
          status?: Database["public"]["Enums"]["post_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          caption?: string
          created_at?: string
          id?: string
          last_error?: string | null
          media_path?: string | null
          media_url?: string | null
          pillar?: string | null
          platform?: string | null
          scheduled_at?: string | null
          status?: Database["public"]["Enums"]["post_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      social_connections: {
        Row: {
          access_token_enc: string
          avatar_url: string | null
          created_at: string
          display_name: string | null
          external_id: string
          id: string
          last_error: string | null
          metadata: Json
          provider: Database["public"]["Enums"]["social_provider"]
          refresh_token_enc: string | null
          scopes: string | null
          status: string
          token_expires_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          access_token_enc: string
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          external_id: string
          id?: string
          last_error?: string | null
          metadata?: Json
          provider: Database["public"]["Enums"]["social_provider"]
          refresh_token_enc?: string | null
          scopes?: string | null
          status?: string
          token_expires_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          access_token_enc?: string
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          external_id?: string
          id?: string
          last_error?: string | null
          metadata?: Json
          provider?: Database["public"]["Enums"]["social_provider"]
          refresh_token_enc?: string | null
          scopes?: string | null
          status?: string
          token_expires_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      strategy_plans: {
        Row: {
          created_at: string
          id: string
          plan: Json
          project_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          plan?: Json
          project_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          plan?: Json
          project_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "strategy_plans_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      stripe_webhook_events: {
        Row: {
          event_id: string
          processed_at: string
          type: string
        }
        Insert: {
          event_id: string
          processed_at?: string
          type: string
        }
        Update: {
          event_id?: string
          processed_at?: string
          type?: string
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          cancel_at_period_end: boolean
          created_at: string
          current_period_end: string | null
          current_period_start: string | null
          founding_period_end: string | null
          founding_renewal_reminder_sent_at: string | null
          id: string
          membership_type: string | null
          status: string
          stripe_customer_id: string | null
          stripe_price_id: string | null
          stripe_schedule_id: string | null
          stripe_subscription_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          cancel_at_period_end?: boolean
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          founding_period_end?: string | null
          founding_renewal_reminder_sent_at?: string | null
          id?: string
          membership_type?: string | null
          status?: string
          stripe_customer_id?: string | null
          stripe_price_id?: string | null
          stripe_schedule_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          cancel_at_period_end?: boolean
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          founding_period_end?: string | null
          founding_renewal_reminder_sent_at?: string | null
          id?: string
          membership_type?: string | null
          status?: string
          stripe_customer_id?: string | null
          stripe_price_id?: string | null
          stripe_schedule_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      suppressed_emails: {
        Row: {
          created_at: string
          email: string
          id: string
          metadata: Json | null
          reason: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          metadata?: Json | null
          reason: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          metadata?: Json | null
          reason?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      waitlist_signups: {
        Row: {
          created_at: string
          email: string
          id: string
          notified: boolean
          notified_at: string | null
          source: string
          updated_at: string
          user_agent: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          notified?: boolean
          notified_at?: string | null
          source?: string
          updated_at?: string
          user_agent?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          notified?: boolean
          notified_at?: string | null
          source?: string
          updated_at?: string
          user_agent?: string | null
        }
        Relationships: []
      }
      work_package_items: {
        Row: {
          asset_id: string
          asset_type: string
          created_at: string
          id: string
          package_id: string
          position: number
          project_id: string
          section: string | null
          user_id: string
        }
        Insert: {
          asset_id: string
          asset_type: string
          created_at?: string
          id?: string
          package_id: string
          position?: number
          project_id: string
          section?: string | null
          user_id: string
        }
        Update: {
          asset_id?: string
          asset_type?: string
          created_at?: string
          id?: string
          package_id?: string
          position?: number
          project_id?: string
          section?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_package_items_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "work_packages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_package_items_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      work_packages: {
        Row: {
          archived: boolean
          created_at: string
          id: string
          meta: Json
          package_type: string
          parent_package_id: string | null
          project_id: string
          source: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          archived?: boolean
          created_at?: string
          id?: string
          meta?: Json
          package_type: string
          parent_package_id?: string | null
          project_id: string
          source?: string
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          archived?: boolean
          created_at?: string
          id?: string
          meta?: Json
          package_type?: string
          parent_package_id?: string | null
          project_id?: string
          source?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_packages_parent_package_id_fkey"
            columns: ["parent_package_id"]
            isOneToOne: false
            referencedRelation: "work_packages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_packages_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      claim_admin_bootstrap: { Args: never; Returns: Json }
      ensure_everyday_campaign: {
        Args: { _project: string; _user: string }
        Returns: string
      }
      get_engine_plan: {
        Args: { _user: string }
        Returns: {
          active: boolean
          brain_enabled: boolean
          credits_left: number
          credits_limit: number
          credits_period_start: string
          credits_used: number
          free_uses_remaining: number
          plan: string
        }[]
      }
      get_user_tier: { Args: { _user: string }; Returns: string }
      has_active_scheduler: { Args: { _user_id: string }; Returns: boolean }
      has_director_access: { Args: { _user_id: string }; Returns: boolean }
      has_membership: { Args: { _user_id: string }; Returns: boolean }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      orchestration_apply: {
        Args: {
          _action: Json
          _campaign: string
          _ids: Json
          _placements: Json
          _run: string
        }
        Returns: {
          actions: Json
          analysis: Json
          campaign_id: string | null
          completed_at: string | null
          created_asset_ids: Json
          created_at: string
          first_post_at: string | null
          goal: string
          id: string
          inputs: Json
          placements: Json
          plan: Json
          project_id: string
          stage: string
          status: string
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "orchestration_runs"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      orchestration_claim: {
        Args: { _key: string; _run: string }
        Returns: boolean
      }
      owns_project: { Args: { _project_id: string }; Returns: boolean }
      redeem_code: { Args: { _code: string }; Returns: Json }
    }
    Enums: {
      app_role: "admin" | "moderator" | "user"
      post_status:
        | "draft"
        | "scheduled"
        | "publishing"
        | "published"
        | "failed"
        | "canceled"
      social_provider:
        | "linkedin"
        | "linkedin_company"
        | "facebook_page"
        | "instagram"
      target_status:
        | "pending"
        | "publishing"
        | "published"
        | "failed"
        | "skipped"
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
      app_role: ["admin", "moderator", "user"],
      post_status: [
        "draft",
        "scheduled",
        "publishing",
        "published",
        "failed",
        "canceled",
      ],
      social_provider: [
        "linkedin",
        "linkedin_company",
        "facebook_page",
        "instagram",
      ],
      target_status: [
        "pending",
        "publishing",
        "published",
        "failed",
        "skipped",
      ],
    },
  },
} as const
