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
      audit_logs: {
        Row: {
          action: string
          actor_id: string | null
          business_id: string | null
          created_at: string
          entity_id: string | null
          entity_table: string
          id: number
          new_data: Json | null
          old_data: Json | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          business_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_table: string
          id?: never
          new_data?: Json | null
          old_data?: Json | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          business_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_table?: string
          id?: never
          new_data?: Json | null
          old_data?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      branch_memberships: {
        Row: {
          branch_id: string
          business_id: string
          created_at: string
          granted_by: string
          user_id: string
        }
        Insert: {
          branch_id: string
          business_id: string
          created_at?: string
          granted_by: string
          user_id: string
        }
        Update: {
          branch_id?: string
          business_id?: string
          created_at?: string
          granted_by?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "branch_memberships_business_id_branch_id_fkey"
            columns: ["business_id", "branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["business_id", "id"]
          },
          {
            foreignKeyName: "branch_memberships_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "branch_memberships_business_id_user_id_fkey"
            columns: ["business_id", "user_id"]
            isOneToOne: false
            referencedRelation: "business_memberships"
            referencedColumns: ["business_id", "user_id"]
          },
          {
            foreignKeyName: "branch_memberships_granted_by_fkey"
            columns: ["granted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      branches: {
        Row: {
          address: string | null
          business_id: string
          code: string
          created_at: string
          id: string
          is_active: boolean
          name: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          business_id: string
          code: string
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          business_id?: string
          code?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "branches_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      business_invitations: {
        Row: {
          accepted_at: string | null
          business_id: string
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by: string
          revoked_at: string | null
          role_code: string
          token_hash: string
        }
        Insert: {
          accepted_at?: string | null
          business_id: string
          created_at?: string
          email: string
          expires_at?: string
          id?: string
          invited_by: string
          revoked_at?: string | null
          role_code: string
          token_hash: string
        }
        Update: {
          accepted_at?: string | null
          business_id?: string
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string
          revoked_at?: string | null
          role_code?: string
          token_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "business_invitations_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "business_invitations_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "business_invitations_role_code_fkey"
            columns: ["role_code"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["code"]
          },
        ]
      }
      business_memberships: {
        Row: {
          business_id: string
          created_at: string
          id: string
          invited_by: string | null
          role_code: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          business_id: string
          created_at?: string
          id?: string
          invited_by?: string | null
          role_code: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          business_id?: string
          created_at?: string
          id?: string
          invited_by?: string | null
          role_code?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "business_memberships_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "business_memberships_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "business_memberships_role_code_fkey"
            columns: ["role_code"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "business_memberships_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      business_settings: {
        Row: {
          business_id: string
          calendar_system: string
          currency: string
          fiscal_year_start_month: number
          timezone: string
          updated_at: string
          vat_rate: number
          vat_registered: boolean
        }
        Insert: {
          business_id: string
          calendar_system?: string
          currency?: string
          fiscal_year_start_month?: number
          timezone?: string
          updated_at?: string
          vat_rate?: number
          vat_registered?: boolean
        }
        Update: {
          business_id?: string
          calendar_system?: string
          currency?: string
          fiscal_year_start_month?: number
          timezone?: string
          updated_at?: string
          vat_rate?: number
          vat_registered?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "business_settings_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: true
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      businesses: {
        Row: {
          archived_at: string | null
          created_at: string
          created_by: string
          id: string
          legal_name: string | null
          name: string
          pan_vat_number: string | null
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          created_by: string
          id?: string
          legal_name?: string | null
          name: string
          pan_vat_number?: string | null
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          created_by?: string
          id?: string
          legal_name?: string | null
          name?: string
          pan_vat_number?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "businesses_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      cash_counter_events: {
        Row: {
          actor_id: string
          amount: number
          branch_id: string
          business_id: string
          created_at: string
          difference: number | null
          event_date: string
          expected: number | null
          id: string
          kind: string
          period_id: string
          reference: string
          request: Json
          session_id: string
        }
        Insert: {
          actor_id: string
          amount: number
          branch_id: string
          business_id: string
          created_at?: string
          difference?: number | null
          event_date: string
          expected?: number | null
          id: string
          kind: string
          period_id: string
          reference: string
          request: Json
          session_id: string
        }
        Update: {
          actor_id?: string
          amount?: number
          branch_id?: string
          business_id?: string
          created_at?: string
          difference?: number | null
          event_date?: string
          expected?: number | null
          id?: string
          kind?: string
          period_id?: string
          reference?: string
          request?: Json
          session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cash_counter_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_counter_events_business_id_branch_id_fkey"
            columns: ["business_id", "branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["business_id", "id"]
          },
          {
            foreignKeyName: "cash_counter_events_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_counter_events_period_id_fkey"
            columns: ["period_id"]
            isOneToOne: false
            referencedRelation: "financial_periods"
            referencedColumns: ["id"]
          },
        ]
      }
      commerce_documents: {
        Row: {
          actor_id: string
          branch_id: string
          business_id: string
          created_at: string
          document_date: string
          id: string
          kind: string
          lines: Json
          party_id: string | null
          period_id: string
          reference: string
          request: Json
          source_id: string | null
          status: string
          subtotal: number
          tax: number
          total: number
        }
        Insert: {
          actor_id: string
          branch_id: string
          business_id: string
          created_at?: string
          document_date: string
          id: string
          kind: string
          lines: Json
          party_id?: string | null
          period_id: string
          reference: string
          request: Json
          source_id?: string | null
          status: string
          subtotal?: number
          tax?: number
          total?: number
        }
        Update: {
          actor_id?: string
          branch_id?: string
          business_id?: string
          created_at?: string
          document_date?: string
          id?: string
          kind?: string
          lines?: Json
          party_id?: string | null
          period_id?: string
          reference?: string
          request?: Json
          source_id?: string | null
          status?: string
          subtotal?: number
          tax?: number
          total?: number
        }
        Relationships: [
          {
            foreignKeyName: "commerce_documents_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commerce_documents_business_id_branch_id_fkey"
            columns: ["business_id", "branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["business_id", "id"]
          },
          {
            foreignKeyName: "commerce_documents_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commerce_documents_business_id_party_id_fkey"
            columns: ["business_id", "party_id"]
            isOneToOne: false
            referencedRelation: "parties"
            referencedColumns: ["business_id", "id"]
          },
          {
            foreignKeyName: "commerce_documents_business_id_source_id_fkey"
            columns: ["business_id", "source_id"]
            isOneToOne: false
            referencedRelation: "commerce_documents"
            referencedColumns: ["business_id", "id"]
          },
          {
            foreignKeyName: "commerce_documents_period_id_fkey"
            columns: ["period_id"]
            isOneToOne: false
            referencedRelation: "financial_periods"
            referencedColumns: ["id"]
          },
        ]
      }
      commerce_journal_entries: {
        Row: {
          account_code: string
          actor_id: string
          branch_id: string
          business_id: string
          created_at: string
          credit: number
          debit: number
          entry_date: string
          id: string
          period_id: string
          source_id: string
          source_type: string
        }
        Insert: {
          account_code: string
          actor_id: string
          branch_id: string
          business_id: string
          created_at?: string
          credit?: number
          debit?: number
          entry_date: string
          id?: string
          period_id: string
          source_id: string
          source_type: string
        }
        Update: {
          account_code?: string
          actor_id?: string
          branch_id?: string
          business_id?: string
          created_at?: string
          credit?: number
          debit?: number
          entry_date?: string
          id?: string
          period_id?: string
          source_id?: string
          source_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "commerce_journal_entries_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commerce_journal_entries_business_id_branch_id_fkey"
            columns: ["business_id", "branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["business_id", "id"]
          },
          {
            foreignKeyName: "commerce_journal_entries_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commerce_journal_entries_period_id_fkey"
            columns: ["period_id"]
            isOneToOne: false
            referencedRelation: "financial_periods"
            referencedColumns: ["id"]
          },
        ]
      }
      commerce_payments: {
        Row: {
          actor_id: string
          amount: number
          branch_id: string
          business_id: string
          created_at: string
          direction: string
          document_id: string
          id: string
          method: string
          payment_date: string
          period_id: string
          reference: string
          request: Json
          session_id: string | null
        }
        Insert: {
          actor_id: string
          amount: number
          branch_id: string
          business_id: string
          created_at?: string
          direction: string
          document_id: string
          id: string
          method: string
          payment_date: string
          period_id: string
          reference: string
          request: Json
          session_id?: string | null
        }
        Update: {
          actor_id?: string
          amount?: number
          branch_id?: string
          business_id?: string
          created_at?: string
          direction?: string
          document_id?: string
          id?: string
          method?: string
          payment_date?: string
          period_id?: string
          reference?: string
          request?: Json
          session_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "commerce_payments_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commerce_payments_business_id_branch_id_fkey"
            columns: ["business_id", "branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["business_id", "id"]
          },
          {
            foreignKeyName: "commerce_payments_business_id_document_id_fkey"
            columns: ["business_id", "document_id"]
            isOneToOne: false
            referencedRelation: "commerce_documents"
            referencedColumns: ["business_id", "id"]
          },
          {
            foreignKeyName: "commerce_payments_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commerce_payments_period_id_fkey"
            columns: ["period_id"]
            isOneToOne: false
            referencedRelation: "financial_periods"
            referencedColumns: ["id"]
          },
        ]
      }
      commerce_stock_movements: {
        Row: {
          actor_id: string
          branch_id: string
          business_id: string
          created_at: string
          document_id: string
          id: string
          kind: string
          quantity: number
          reason: string
          reference: string
          variant_id: string
        }
        Insert: {
          actor_id: string
          branch_id: string
          business_id: string
          created_at?: string
          document_id: string
          id?: string
          kind: string
          quantity: number
          reason: string
          reference: string
          variant_id: string
        }
        Update: {
          actor_id?: string
          branch_id?: string
          business_id?: string
          created_at?: string
          document_id?: string
          id?: string
          kind?: string
          quantity?: number
          reason?: string
          reference?: string
          variant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "commerce_stock_movements_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commerce_stock_movements_business_id_branch_id_fkey"
            columns: ["business_id", "branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["business_id", "id"]
          },
          {
            foreignKeyName: "commerce_stock_movements_business_id_document_id_fkey"
            columns: ["business_id", "document_id"]
            isOneToOne: false
            referencedRelation: "commerce_documents"
            referencedColumns: ["business_id", "id"]
          },
          {
            foreignKeyName: "commerce_stock_movements_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commerce_stock_movements_business_id_variant_id_fkey"
            columns: ["business_id", "variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["business_id", "id"]
          },
        ]
      }
      financial_periods: {
        Row: {
          business_id: string
          closed_at: string | null
          closed_by: string | null
          created_at: string
          end_date: string
          id: string
          name: string
          start_date: string
          status: string
          updated_at: string
        }
        Insert: {
          business_id: string
          closed_at?: string | null
          closed_by?: string | null
          created_at?: string
          end_date: string
          id?: string
          name: string
          start_date: string
          status?: string
          updated_at?: string
        }
        Update: {
          business_id?: string
          closed_at?: string | null
          closed_by?: string | null
          created_at?: string
          end_date?: string
          id?: string
          name?: string
          start_date?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "financial_periods_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_periods_closed_by_fkey"
            columns: ["closed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      parties: {
        Row: {
          address: string
          business_id: string
          created_at: string
          email: string
          id: string
          is_active: boolean
          kind: string
          name: string
          pan_vat_number: string
          phone: string
          updated_at: string
        }
        Insert: {
          address?: string
          business_id: string
          created_at?: string
          email?: string
          id?: string
          is_active?: boolean
          kind: string
          name: string
          pan_vat_number?: string
          phone?: string
          updated_at?: string
        }
        Update: {
          address?: string
          business_id?: string
          created_at?: string
          email?: string
          id?: string
          is_active?: boolean
          kind?: string
          name?: string
          pan_vat_number?: string
          phone?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "parties_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      product_variants: {
        Row: {
          barcode: string | null
          business_id: string
          created_at: string
          id: string
          is_active: boolean
          name: string
          product_id: string
          reorder_level: number
          selling_price: number
          sku: string
          unit: string
          updated_at: string
        }
        Insert: {
          barcode?: string | null
          business_id: string
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          product_id: string
          reorder_level?: number
          selling_price?: number
          sku: string
          unit?: string
          updated_at?: string
        }
        Update: {
          barcode?: string | null
          business_id?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          product_id?: string
          reorder_level?: number
          selling_price?: number
          sku?: string
          unit?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_variants_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_variants_business_id_product_id_fkey"
            columns: ["business_id", "product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["business_id", "id"]
          },
        ]
      }
      products: {
        Row: {
          business_id: string
          category: string
          created_at: string
          id: string
          is_active: boolean
          name: string
          updated_at: string
        }
        Insert: {
          business_id: string
          category?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          business_id?: string
          category?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          full_name: string | null
          id: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      roles: {
        Row: {
          code: string
          description: string | null
          name: string
          rank: number
        }
        Insert: {
          code: string
          description?: string | null
          name: string
          rank: number
        }
        Update: {
          code?: string
          description?: string | null
          name?: string
          rank?: number
        }
        Relationships: []
      }
      security_review_events: {
        Row: {
          actor_id: string
          business_id: string
          created_at: string
          details: string
          id: string
          kind: string
          payload: Json
          related_id: string | null
          title: string
        }
        Insert: {
          actor_id?: string
          business_id: string
          created_at?: string
          details: string
          id?: string
          kind: string
          payload?: Json
          related_id?: string | null
          title: string
        }
        Update: {
          actor_id?: string
          business_id?: string
          created_at?: string
          details?: string
          id?: string
          kind?: string
          payload?: Json
          related_id?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "security_review_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "security_review_events_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "security_review_events_business_id_related_id_fkey"
            columns: ["business_id", "related_id"]
            isOneToOne: false
            referencedRelation: "security_review_events"
            referencedColumns: ["business_id", "id"]
          },
        ]
      }
      stock_movements: {
        Row: {
          actor_id: string
          branch_id: string
          business_id: string
          created_at: string
          id: string
          kind: string
          operation_id: string
          quantity: number
          reason: string
          reference: string
          variant_id: string
        }
        Insert: {
          actor_id: string
          branch_id: string
          business_id: string
          created_at?: string
          id?: string
          kind: string
          operation_id: string
          quantity: number
          reason: string
          reference: string
          variant_id: string
        }
        Update: {
          actor_id?: string
          branch_id?: string
          business_id?: string
          created_at?: string
          id?: string
          kind?: string
          operation_id?: string
          quantity?: number
          reason?: string
          reference?: string
          variant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_movements_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_business_id_branch_id_fkey"
            columns: ["business_id", "branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["business_id", "id"]
          },
          {
            foreignKeyName: "stock_movements_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_business_id_operation_id_fkey"
            columns: ["business_id", "operation_id"]
            isOneToOne: false
            referencedRelation: "stock_operations"
            referencedColumns: ["business_id", "id"]
          },
          {
            foreignKeyName: "stock_movements_business_id_variant_id_fkey"
            columns: ["business_id", "variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["business_id", "id"]
          },
        ]
      }
      stock_operations: {
        Row: {
          actor_id: string
          branch_id: string
          business_id: string
          created_at: string
          destination_branch_id: string | null
          id: string
          kind: string
          quantity: number
          reason: string
          reference: string
          variant_id: string
        }
        Insert: {
          actor_id: string
          branch_id: string
          business_id: string
          created_at?: string
          destination_branch_id?: string | null
          id: string
          kind: string
          quantity: number
          reason: string
          reference: string
          variant_id: string
        }
        Update: {
          actor_id?: string
          branch_id?: string
          business_id?: string
          created_at?: string
          destination_branch_id?: string | null
          id?: string
          kind?: string
          quantity?: number
          reason?: string
          reference?: string
          variant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_operations_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_operations_business_id_branch_id_fkey"
            columns: ["business_id", "branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["business_id", "id"]
          },
          {
            foreignKeyName: "stock_operations_business_id_destination_branch_id_fkey"
            columns: ["business_id", "destination_branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["business_id", "id"]
          },
          {
            foreignKeyName: "stock_operations_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_operations_business_id_variant_id_fkey"
            columns: ["business_id", "variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["business_id", "id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_business_invitation: {
        Args: { _token_hash: string }
        Returns: string
      }
      add_business_member: {
        Args: { _business_id: string; _role: string; _user_id: string }
        Returns: string
      }
      archive_business: { Args: { _business_id: string }; Returns: undefined }
      business_role_rank: {
        Args: { _business_id: string; _user_id?: string }
        Returns: number
      }
      can_access_branch: {
        Args: { _branch_id: string; _business_id: string }
        Returns: boolean
      }
      commerce_open_period: {
        Args: { _business: string; _date: string; _period: string }
        Returns: undefined
      }
      commerce_stock_balance: {
        Args: { _branch: string; _business: string; _variant: string }
        Returns: number
      }
      create_business: {
        Args: { _legal_name?: string; _name: string; _pan_vat?: string }
        Returns: string
      }
      create_business_invitation: {
        Args: {
          _business_id: string
          _email: string
          _role: string
          _token_hash: string
        }
        Returns: string
      }
      has_business_role: {
        Args: { _business_id: string; _min_role: string }
        Returns: boolean
      }
      is_business_member: { Args: { _business_id: string }; Returns: boolean }
      post_stock_operation: {
        Args: {
          _branch_id: string
          _business_id: string
          _destination_branch_id: string
          _id: string
          _kind: string
          _quantity: number
          _reason: string
          _reference: string
          _variant_id: string
        }
        Returns: string
      }
      post_stock_request: { Args: { _request: Json }; Returns: string }
      remove_business_member: {
        Args: { _business_id: string; _user_id: string }
        Returns: undefined
      }
      revoke_business_invitation: {
        Args: { _business_id: string; _invitation_id: string }
        Returns: undefined
      }
      save_catalogue_variant: {
        Args: { _business_id: string; _rows: Json }
        Returns: number
      }
      set_branch_access: {
        Args: {
          _allowed: boolean
          _branch_id: string
          _business_id: string
          _user_id: string
        }
        Returns: undefined
      }
      set_financial_period_status: {
        Args: { _period_id: string; _status: string }
        Returns: undefined
      }
      shares_business_with: { Args: { _other: string }; Returns: boolean }
      transfer_business_ownership: {
        Args: { _business_id: string; _new_owner: string }
        Returns: undefined
      }
      update_business_member: {
        Args: {
          _business_id: string
          _role: string
          _status?: string
          _user_id: string
        }
        Returns: undefined
      }
      write_audit: {
        Args: {
          _action: string
          _business_id: string
          _entity: string
          _new: Json
          _old: Json
          _table: string
        }
        Returns: undefined
      }
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
