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
      account_movements: {
        Row: {
          account_id: string
          amount: number
          business_id: string
          created_at: string
          entry_date: string
          id: number
          memo: string
          source_id: string
          source_type: string
        }
        Insert: {
          account_id: string
          amount: number
          business_id: string
          created_at?: string
          entry_date: string
          id?: never
          memo?: string
          source_id: string
          source_type: string
        }
        Update: {
          account_id?: string
          amount?: number
          business_id?: string
          created_at?: string
          entry_date?: string
          id?: never
          memo?: string
          source_id?: string
          source_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "account_movements_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "payment_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "account_movements_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      accounting_vouchers: {
        Row: {
          actor_id: string
          branch_id: string
          business_id: string
          created_at: string
          id: string
          kind: string
          period_id: string
          reason: string
          reference: string
          request: Json
          request_id: string
          reverses_id: string | null
          voucher_date: string
        }
        Insert: {
          actor_id: string
          branch_id: string
          business_id: string
          created_at?: string
          id?: string
          kind: string
          period_id: string
          reason: string
          reference: string
          request: Json
          request_id: string
          reverses_id?: string | null
          voucher_date: string
        }
        Update: {
          actor_id?: string
          branch_id?: string
          business_id?: string
          created_at?: string
          id?: string
          kind?: string
          period_id?: string
          reason?: string
          reference?: string
          request?: Json
          request_id?: string
          reverses_id?: string | null
          voucher_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "accounting_vouchers_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounting_vouchers_business_id_branch_id_fkey"
            columns: ["business_id", "branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["business_id", "id"]
          },
          {
            foreignKeyName: "accounting_vouchers_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounting_vouchers_business_id_period_id_fkey"
            columns: ["business_id", "period_id"]
            isOneToOne: false
            referencedRelation: "financial_periods"
            referencedColumns: ["business_id", "id"]
          },
          {
            foreignKeyName: "accounting_vouchers_business_id_reverses_id_fkey"
            columns: ["business_id", "reverses_id"]
            isOneToOne: false
            referencedRelation: "accounting_vouchers"
            referencedColumns: ["business_id", "id"]
          },
        ]
      }
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
          branch_id: string | null
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
          branch_id?: string | null
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
          branch_id?: string | null
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
      business_access_role_permissions: {
        Row: {
          business_id: string
          created_at: string
          permission: string
          role_id: string
        }
        Insert: {
          business_id: string
          created_at?: string
          permission: string
          role_id: string
        }
        Update: {
          business_id?: string
          created_at?: string
          permission?: string
          role_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "business_access_role_permissions_business_id_role_id_fkey"
            columns: ["business_id", "role_id"]
            isOneToOne: false
            referencedRelation: "business_access_roles"
            referencedColumns: ["business_id", "id"]
          },
          {
            foreignKeyName: "business_access_role_permissions_permission_fkey"
            columns: ["permission"]
            isOneToOne: false
            referencedRelation: "business_permission_catalog"
            referencedColumns: ["permission"]
          },
        ]
      }
      business_access_roles: {
        Row: {
          authority_rank: number
          business_id: string
          code: string
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_active: boolean
          is_system: boolean
          name: string
          updated_at: string
        }
        Insert: {
          authority_rank: number
          business_id: string
          code: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          is_system?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          authority_rank?: number
          business_id?: string
          code?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          is_system?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "business_access_roles_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "business_access_roles_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "business_access_roles_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      business_bills: {
        Row: {
          bill_date: string
          business_id: string
          caption: string
          created_at: string
          created_by: string
          id: string
          mime_type: string
          size_bytes: number
          storage_path: string
        }
        Insert: {
          bill_date?: string
          business_id: string
          caption?: string
          created_at?: string
          created_by?: string
          id?: string
          mime_type: string
          size_bytes: number
          storage_path: string
        }
        Update: {
          bill_date?: string
          business_id?: string
          caption?: string
          created_at?: string
          created_by?: string
          id?: string
          mime_type?: string
          size_bytes?: number
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "business_bills_business_id_fkey"
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
          email: string | null
          expires_at: string
          id: string
          invited_by: string
          invitee_name: string | null
          job_title: string | null
          mobile: string | null
          revoked_at: string | null
          role_code: string
          token_hash: string
        }
        Insert: {
          accepted_at?: string | null
          business_id: string
          created_at?: string
          email?: string | null
          expires_at?: string
          id?: string
          invited_by: string
          invitee_name?: string | null
          job_title?: string | null
          mobile?: string | null
          revoked_at?: string | null
          role_code: string
          token_hash: string
        }
        Update: {
          accepted_at?: string | null
          business_id?: string
          created_at?: string
          email?: string | null
          expires_at?: string
          id?: string
          invited_by?: string
          invitee_name?: string | null
          job_title?: string | null
          mobile?: string | null
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
      business_member_access_roles: {
        Row: {
          assigned_at: string
          assigned_by: string | null
          business_id: string
          is_default: boolean
          role_id: string
          user_id: string
        }
        Insert: {
          assigned_at?: string
          assigned_by?: string | null
          business_id: string
          is_default?: boolean
          role_id: string
          user_id: string
        }
        Update: {
          assigned_at?: string
          assigned_by?: string | null
          business_id?: string
          is_default?: boolean
          role_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "business_member_access_roles_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "business_member_access_roles_business_id_role_id_fkey"
            columns: ["business_id", "role_id"]
            isOneToOne: false
            referencedRelation: "business_access_roles"
            referencedColumns: ["business_id", "id"]
          },
          {
            foreignKeyName: "business_member_access_roles_business_id_user_id_fkey"
            columns: ["business_id", "user_id"]
            isOneToOne: false
            referencedRelation: "business_memberships"
            referencedColumns: ["business_id", "user_id"]
          },
        ]
      }
      business_memberships: {
        Row: {
          business_id: string
          created_at: string
          id: string
          invited_by: string | null
          job_title: string | null
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
          job_title?: string | null
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
          job_title?: string | null
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
      business_notes: {
        Row: {
          body: string
          business_id: string
          created_at: string
          created_by: string
          id: string
          pinned: boolean
          title: string
          updated_at: string
        }
        Insert: {
          body?: string
          business_id: string
          created_at?: string
          created_by?: string
          id?: string
          pinned?: boolean
          title: string
          updated_at?: string
        }
        Update: {
          body?: string
          business_id?: string
          created_at?: string
          created_by?: string
          id?: string
          pinned?: boolean
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "business_notes_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      business_permission_catalog: {
        Row: {
          action: string
          created_at: string
          label: string
          module: string
          permission: string
        }
        Insert: {
          action: string
          created_at?: string
          label: string
          module: string
          permission: string
        }
        Update: {
          action?: string
          created_at?: string
          label?: string
          module?: string
          permission?: string
        }
        Relationships: []
      }
      business_role_template_denials: {
        Row: {
          business_id: string
          job_title: string
          permission: string
        }
        Insert: {
          business_id: string
          job_title: string
          permission: string
        }
        Update: {
          business_id?: string
          job_title?: string
          permission?: string
        }
        Relationships: [
          {
            foreignKeyName: "business_role_template_denials_business_id_job_title_fkey"
            columns: ["business_id", "job_title"]
            isOneToOne: false
            referencedRelation: "business_role_templates"
            referencedColumns: ["business_id", "job_title"]
          },
        ]
      }
      business_role_templates: {
        Row: {
          business_id: string
          job_title: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          business_id: string
          job_title: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          business_id?: string
          job_title?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "business_role_templates_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
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
          invoice_footer: string
          invoice_signature_label: string
          invoice_terms: string
          payment_instructions: string
          payment_payee: string
          payment_provider: string
          payment_qr_path: string | null
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
          invoice_footer?: string
          invoice_signature_label?: string
          invoice_terms?: string
          payment_instructions?: string
          payment_payee?: string
          payment_provider?: string
          payment_qr_path?: string | null
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
          invoice_footer?: string
          invoice_signature_label?: string
          invoice_terms?: string
          payment_instructions?: string
          payment_payee?: string
          payment_provider?: string
          payment_qr_path?: string | null
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
          quotation_id: string | null
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
          quotation_id?: string | null
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
          quotation_id?: string | null
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
          {
            foreignKeyName: "commerce_quotation_fk"
            columns: ["business_id", "quotation_id"]
            isOneToOne: false
            referencedRelation: "quotations"
            referencedColumns: ["business_id", "id"]
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
      customer_memberships: {
        Row: {
          business_id: string
          created_at: string
          id: string
          membership_number: string | null
          mobile: string
        }
        Insert: {
          business_id: string
          created_at?: string
          id?: string
          membership_number?: string | null
          mobile: string
        }
        Update: {
          business_id?: string
          created_at?: string
          id?: string
          membership_number?: string | null
          mobile?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_memberships_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      delegation_grants: {
        Row: {
          allowed_role_codes: string[]
          branch_id: string
          business_id: string
          can_invite: boolean
          created_at: string
          granted_by: string
          id: string
          manager_user_id: string
          max_invite_days: number
          max_invite_uses: number
          revoked_at: string | null
          revoked_by: string | null
        }
        Insert: {
          allowed_role_codes: string[]
          branch_id: string
          business_id: string
          can_invite?: boolean
          created_at?: string
          granted_by: string
          id?: string
          manager_user_id: string
          max_invite_days?: number
          max_invite_uses?: number
          revoked_at?: string | null
          revoked_by?: string | null
        }
        Update: {
          allowed_role_codes?: string[]
          branch_id?: string
          business_id?: string
          can_invite?: boolean
          created_at?: string
          granted_by?: string
          id?: string
          manager_user_id?: string
          max_invite_days?: number
          max_invite_uses?: number
          revoked_at?: string | null
          revoked_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "delegation_grants_business_id_branch_id_fkey"
            columns: ["business_id", "branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["business_id", "id"]
          },
          {
            foreignKeyName: "delegation_grants_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delegation_grants_business_id_manager_user_id_fkey"
            columns: ["business_id", "manager_user_id"]
            isOneToOne: false
            referencedRelation: "business_memberships"
            referencedColumns: ["business_id", "user_id"]
          },
          {
            foreignKeyName: "delegation_grants_granted_by_fkey"
            columns: ["granted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delegation_grants_revoked_by_fkey"
            columns: ["revoked_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      expense_receipts: {
        Row: {
          ai_error: string | null
          ai_extraction: Json | null
          ai_model: string | null
          business_id: string
          created_at: string
          file_name: string
          file_path: string
          id: string
          mime_type: string
          review_note: string | null
          reviewed: Json | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          uploaded_by: string
          voucher_id: string | null
        }
        Insert: {
          ai_error?: string | null
          ai_extraction?: Json | null
          ai_model?: string | null
          business_id: string
          created_at?: string
          file_name: string
          file_path: string
          id?: string
          mime_type: string
          review_note?: string | null
          reviewed?: Json | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          uploaded_by: string
          voucher_id?: string | null
        }
        Update: {
          ai_error?: string | null
          ai_extraction?: Json | null
          ai_model?: string | null
          business_id?: string
          created_at?: string
          file_name?: string
          file_path?: string
          id?: string
          mime_type?: string
          review_note?: string | null
          reviewed?: Json | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          uploaded_by?: string
          voucher_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "expense_receipts_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expense_receipts_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expense_receipts_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expense_receipts_voucher_id_fkey"
            columns: ["voucher_id"]
            isOneToOne: false
            referencedRelation: "accounting_vouchers"
            referencedColumns: ["id"]
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
      hr_attendance: {
        Row: {
          attendance_date: string
          attendance_status: string
          branch_id: string | null
          business_id: string
          check_in: string | null
          check_out: string | null
          created_at: string
          id: string
          notes: string | null
          recorded_by: string
          updated_at: string
          user_id: string
        }
        Insert: {
          attendance_date: string
          attendance_status?: string
          branch_id?: string | null
          business_id: string
          check_in?: string | null
          check_out?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          recorded_by: string
          updated_at?: string
          user_id: string
        }
        Update: {
          attendance_date?: string
          attendance_status?: string
          branch_id?: string | null
          business_id?: string
          check_in?: string | null
          check_out?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          recorded_by?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "hr_attendance_business_id_branch_id_fkey"
            columns: ["business_id", "branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["business_id", "id"]
          },
          {
            foreignKeyName: "hr_attendance_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_attendance_business_id_user_id_fkey"
            columns: ["business_id", "user_id"]
            isOneToOne: false
            referencedRelation: "hr_employee_records"
            referencedColumns: ["business_id", "user_id"]
          },
          {
            foreignKeyName: "hr_attendance_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_attendance_policies: {
        Row: {
          business_id: string
          created_at: string
          grace_minutes: number
          overtime_after_minutes: number
          overtime_multiplier: number
          unpaid_break_minutes: number
          updated_at: string
          updated_by: string | null
          workday_minutes: number
        }
        Insert: {
          business_id: string
          created_at?: string
          grace_minutes?: number
          overtime_after_minutes?: number
          overtime_multiplier?: number
          unpaid_break_minutes?: number
          updated_at?: string
          updated_by?: string | null
          workday_minutes?: number
        }
        Update: {
          business_id?: string
          created_at?: string
          grace_minutes?: number
          overtime_after_minutes?: number
          overtime_multiplier?: number
          unpaid_break_minutes?: number
          updated_at?: string
          updated_by?: string | null
          workday_minutes?: number
        }
        Relationships: [
          {
            foreignKeyName: "hr_attendance_policies_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: true
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_attendance_policies_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_employee_drafts: {
        Row: {
          branch_id: string | null
          business_id: string
          created_at: string
          created_by: string
          department: string | null
          designation: string | null
          email: string | null
          employee_number: string
          full_name: string
          id: string
          joining_date: string | null
          notes: string | null
          phone: string | null
          profile_status: string
          responsibilities: string[]
          updated_at: string
        }
        Insert: {
          branch_id?: string | null
          business_id: string
          created_at?: string
          created_by: string
          department?: string | null
          designation?: string | null
          email?: string | null
          employee_number: string
          full_name: string
          id?: string
          joining_date?: string | null
          notes?: string | null
          phone?: string | null
          profile_status?: string
          responsibilities?: string[]
          updated_at?: string
        }
        Update: {
          branch_id?: string | null
          business_id?: string
          created_at?: string
          created_by?: string
          department?: string | null
          designation?: string | null
          email?: string | null
          employee_number?: string
          full_name?: string
          id?: string
          joining_date?: string | null
          notes?: string | null
          phone?: string | null
          profile_status?: string
          responsibilities?: string[]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "hr_employee_drafts_business_id_branch_id_fkey"
            columns: ["business_id", "branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["business_id", "id"]
          },
          {
            foreignKeyName: "hr_employee_drafts_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_employee_drafts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_employee_records: {
        Row: {
          address: string | null
          branch_id: string | null
          business_id: string
          confirmation_date: string | null
          created_at: string
          created_by: string
          department: string | null
          designation: string | null
          emergency_contact_name: string | null
          emergency_contact_phone: string | null
          employee_number: string
          employment_status: string
          employment_type: string
          exit_date: string | null
          exit_reason: string | null
          exit_type: string | null
          final_settlement_date: string | null
          joining_date: string
          last_working_date: string | null
          notes: string | null
          rehire_eligible: boolean
          responsibilities: string[]
          updated_at: string
          user_id: string
        }
        Insert: {
          address?: string | null
          branch_id?: string | null
          business_id: string
          confirmation_date?: string | null
          created_at?: string
          created_by: string
          department?: string | null
          designation?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          employee_number: string
          employment_status?: string
          employment_type?: string
          exit_date?: string | null
          exit_reason?: string | null
          exit_type?: string | null
          final_settlement_date?: string | null
          joining_date: string
          last_working_date?: string | null
          notes?: string | null
          rehire_eligible?: boolean
          responsibilities?: string[]
          updated_at?: string
          user_id: string
        }
        Update: {
          address?: string | null
          branch_id?: string | null
          business_id?: string
          confirmation_date?: string | null
          created_at?: string
          created_by?: string
          department?: string | null
          designation?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          employee_number?: string
          employment_status?: string
          employment_type?: string
          exit_date?: string | null
          exit_reason?: string | null
          exit_type?: string | null
          final_settlement_date?: string | null
          joining_date?: string
          last_working_date?: string | null
          notes?: string | null
          rehire_eligible?: boolean
          responsibilities?: string[]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "hr_employee_records_business_id_branch_id_fkey"
            columns: ["business_id", "branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["business_id", "id"]
          },
          {
            foreignKeyName: "hr_employee_records_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_employee_records_business_id_user_id_fkey"
            columns: ["business_id", "user_id"]
            isOneToOne: true
            referencedRelation: "business_memberships"
            referencedColumns: ["business_id", "user_id"]
          },
          {
            foreignKeyName: "hr_employee_records_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_leave_balance_entries: {
        Row: {
          business_id: string
          created_at: string
          created_by: string
          delta_days: number
          entry_type: string
          id: string
          leave_type_id: string
          leave_year: number
          notes: string | null
          source_request_id: string | null
          user_id: string
        }
        Insert: {
          business_id: string
          created_at?: string
          created_by: string
          delta_days: number
          entry_type: string
          id?: string
          leave_type_id: string
          leave_year: number
          notes?: string | null
          source_request_id?: string | null
          user_id: string
        }
        Update: {
          business_id?: string
          created_at?: string
          created_by?: string
          delta_days?: number
          entry_type?: string
          id?: string
          leave_type_id?: string
          leave_year?: number
          notes?: string | null
          source_request_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "hr_leave_balance_entries_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_leave_balance_entries_business_id_leave_type_id_fkey"
            columns: ["business_id", "leave_type_id"]
            isOneToOne: false
            referencedRelation: "hr_leave_types"
            referencedColumns: ["business_id", "id"]
          },
          {
            foreignKeyName: "hr_leave_balance_entries_business_id_user_id_fkey"
            columns: ["business_id", "user_id"]
            isOneToOne: false
            referencedRelation: "hr_employee_records"
            referencedColumns: ["business_id", "user_id"]
          },
          {
            foreignKeyName: "hr_leave_balance_entries_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_leave_balance_entries_source_request_id_fkey"
            columns: ["source_request_id"]
            isOneToOne: false
            referencedRelation: "hr_leave_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_leave_balance_overrides: {
        Row: {
          approved_by: string
          available_days: number
          business_id: string
          created_at: string
          id: string
          leave_type_id: string
          reason: string
          request_id: string
          requested_days: number
          user_id: string
        }
        Insert: {
          approved_by: string
          available_days: number
          business_id: string
          created_at?: string
          id?: string
          leave_type_id: string
          reason: string
          request_id: string
          requested_days: number
          user_id: string
        }
        Update: {
          approved_by?: string
          available_days?: number
          business_id?: string
          created_at?: string
          id?: string
          leave_type_id?: string
          reason?: string
          request_id?: string
          requested_days?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "hr_leave_balance_overrides_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_leave_balance_overrides_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_leave_balance_overrides_business_id_leave_type_id_fkey"
            columns: ["business_id", "leave_type_id"]
            isOneToOne: false
            referencedRelation: "hr_leave_types"
            referencedColumns: ["business_id", "id"]
          },
          {
            foreignKeyName: "hr_leave_balance_overrides_business_id_user_id_fkey"
            columns: ["business_id", "user_id"]
            isOneToOne: false
            referencedRelation: "hr_employee_records"
            referencedColumns: ["business_id", "user_id"]
          },
          {
            foreignKeyName: "hr_leave_balance_overrides_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: true
            referencedRelation: "hr_leave_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_leave_requests: {
        Row: {
          business_id: string
          created_at: string
          days: number
          end_date: string
          id: string
          leave_type_id: string
          reason: string | null
          request_status: string
          review_note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          start_date: string
          updated_at: string
          user_id: string
        }
        Insert: {
          business_id: string
          created_at?: string
          days: number
          end_date: string
          id?: string
          leave_type_id: string
          reason?: string | null
          request_status?: string
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          start_date: string
          updated_at?: string
          user_id: string
        }
        Update: {
          business_id?: string
          created_at?: string
          days?: number
          end_date?: string
          id?: string
          leave_type_id?: string
          reason?: string | null
          request_status?: string
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          start_date?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "hr_leave_requests_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_leave_requests_business_id_leave_type_id_fkey"
            columns: ["business_id", "leave_type_id"]
            isOneToOne: false
            referencedRelation: "hr_leave_types"
            referencedColumns: ["business_id", "id"]
          },
          {
            foreignKeyName: "hr_leave_requests_business_id_user_id_fkey"
            columns: ["business_id", "user_id"]
            isOneToOne: false
            referencedRelation: "hr_employee_records"
            referencedColumns: ["business_id", "user_id"]
          },
          {
            foreignKeyName: "hr_leave_requests_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_leave_types: {
        Row: {
          accrual_method: string
          annual_quota: number
          business_id: string
          created_at: string
          id: string
          is_active: boolean
          is_paid: boolean
          name: string
        }
        Insert: {
          accrual_method?: string
          annual_quota?: number
          business_id: string
          created_at?: string
          id?: string
          is_active?: boolean
          is_paid?: boolean
          name: string
        }
        Update: {
          accrual_method?: string
          annual_quota?: number
          business_id?: string
          created_at?: string
          id?: string
          is_active?: boolean
          is_paid?: boolean
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "hr_leave_types_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_payroll_items: {
        Row: {
          allowances: number
          basic_salary: number
          business_id: string
          created_at: string
          employee_name: string
          employee_number: string
          gross_pay: number
          id: string
          insurance_deduction: number
          net_pay: number
          other_deduction: number
          payroll_run_id: string
          period_end: string
          period_label: string
          period_start: string
          provident_fund: number
          tax_deduction: number
          total_deductions: number
          unpaid_leave_days: number
          unpaid_leave_deduction: number
          user_id: string
        }
        Insert: {
          allowances: number
          basic_salary: number
          business_id: string
          created_at?: string
          employee_name: string
          employee_number: string
          gross_pay: number
          id?: string
          insurance_deduction: number
          net_pay: number
          other_deduction: number
          payroll_run_id: string
          period_end: string
          period_label: string
          period_start: string
          provident_fund: number
          tax_deduction: number
          total_deductions: number
          unpaid_leave_days?: number
          unpaid_leave_deduction?: number
          user_id: string
        }
        Update: {
          allowances?: number
          basic_salary?: number
          business_id?: string
          created_at?: string
          employee_name?: string
          employee_number?: string
          gross_pay?: number
          id?: string
          insurance_deduction?: number
          net_pay?: number
          other_deduction?: number
          payroll_run_id?: string
          period_end?: string
          period_label?: string
          period_start?: string
          provident_fund?: number
          tax_deduction?: number
          total_deductions?: number
          unpaid_leave_days?: number
          unpaid_leave_deduction?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "hr_payroll_items_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_payroll_items_business_id_payroll_run_id_fkey"
            columns: ["business_id", "payroll_run_id"]
            isOneToOne: false
            referencedRelation: "hr_payroll_runs"
            referencedColumns: ["business_id", "id"]
          },
          {
            foreignKeyName: "hr_payroll_items_business_id_user_id_fkey"
            columns: ["business_id", "user_id"]
            isOneToOne: false
            referencedRelation: "hr_employee_records"
            referencedColumns: ["business_id", "user_id"]
          },
        ]
      }
      hr_payroll_runs: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          business_id: string
          created_at: string
          created_by: string
          deduction_total: number
          employee_count: number
          gross_total: number
          id: string
          net_total: number
          paid_at: string | null
          paid_by: string | null
          period_end: string
          period_label: string
          period_start: string
          run_status: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          business_id: string
          created_at?: string
          created_by: string
          deduction_total?: number
          employee_count?: number
          gross_total?: number
          id?: string
          net_total?: number
          paid_at?: string | null
          paid_by?: string | null
          period_end: string
          period_label: string
          period_start: string
          run_status?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          business_id?: string
          created_at?: string
          created_by?: string
          deduction_total?: number
          employee_count?: number
          gross_total?: number
          id?: string
          net_total?: number
          paid_at?: string | null
          paid_by?: string | null
          period_end?: string
          period_label?: string
          period_start?: string
          run_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "hr_payroll_runs_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_payroll_runs_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_payroll_runs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_payroll_runs_paid_by_fkey"
            columns: ["paid_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_salary_structures: {
        Row: {
          basic_salary: number
          business_id: string
          created_at: string
          created_by: string
          effective_from: string
          house_allowance: number
          id: string
          insurance_deduction: number
          other_allowance: number
          other_deduction: number
          provident_fund: number
          tax_deduction: number
          transport_allowance: number
          user_id: string
        }
        Insert: {
          basic_salary: number
          business_id: string
          created_at?: string
          created_by: string
          effective_from: string
          house_allowance?: number
          id?: string
          insurance_deduction?: number
          other_allowance?: number
          other_deduction?: number
          provident_fund?: number
          tax_deduction?: number
          transport_allowance?: number
          user_id: string
        }
        Update: {
          basic_salary?: number
          business_id?: string
          created_at?: string
          created_by?: string
          effective_from?: string
          house_allowance?: number
          id?: string
          insurance_deduction?: number
          other_allowance?: number
          other_deduction?: number
          provident_fund?: number
          tax_deduction?: number
          transport_allowance?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "hr_salary_structures_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_salary_structures_business_id_user_id_fkey"
            columns: ["business_id", "user_id"]
            isOneToOne: false
            referencedRelation: "hr_employee_records"
            referencedColumns: ["business_id", "user_id"]
          },
          {
            foreignKeyName: "hr_salary_structures_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_shift_assignments: {
        Row: {
          assigned_by: string
          branch_id: string | null
          business_id: string
          created_at: string
          id: string
          shift_date: string
          shift_id: string
          user_id: string
        }
        Insert: {
          assigned_by: string
          branch_id?: string | null
          business_id: string
          created_at?: string
          id?: string
          shift_date: string
          shift_id: string
          user_id: string
        }
        Update: {
          assigned_by?: string
          branch_id?: string | null
          business_id?: string
          created_at?: string
          id?: string
          shift_date?: string
          shift_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "hr_shift_assignments_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_shift_assignments_business_id_branch_id_fkey"
            columns: ["business_id", "branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["business_id", "id"]
          },
          {
            foreignKeyName: "hr_shift_assignments_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_shift_assignments_business_id_shift_id_fkey"
            columns: ["business_id", "shift_id"]
            isOneToOne: false
            referencedRelation: "hr_shifts"
            referencedColumns: ["business_id", "id"]
          },
          {
            foreignKeyName: "hr_shift_assignments_business_id_user_id_fkey"
            columns: ["business_id", "user_id"]
            isOneToOne: false
            referencedRelation: "hr_employee_records"
            referencedColumns: ["business_id", "user_id"]
          },
        ]
      }
      hr_shifts: {
        Row: {
          break_minutes: number
          business_id: string
          created_at: string
          end_time: string
          id: string
          is_active: boolean
          name: string
          start_time: string
        }
        Insert: {
          break_minutes?: number
          business_id: string
          created_at?: string
          end_time: string
          id?: string
          is_active?: boolean
          name: string
          start_time: string
        }
        Update: {
          break_minutes?: number
          business_id?: string
          created_at?: string
          end_time?: string
          id?: string
          is_active?: boolean
          name?: string
          start_time?: string
        }
        Relationships: [
          {
            foreignKeyName: "hr_shifts_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_count_lines: {
        Row: {
          business_id: string
          cost_price: number | null
          created_at: string
          id: string
          note: string | null
          physical_quantity: number | null
          product_name_snapshot: string
          session_id: string
          sku_snapshot: string
          system_quantity: number
          unit_snapshot: string
          variant_id: string
          variant_name_snapshot: string
        }
        Insert: {
          business_id: string
          cost_price?: number | null
          created_at?: string
          id?: string
          note?: string | null
          physical_quantity?: number | null
          product_name_snapshot: string
          session_id: string
          sku_snapshot: string
          system_quantity: number
          unit_snapshot: string
          variant_id: string
          variant_name_snapshot: string
        }
        Update: {
          business_id?: string
          cost_price?: number | null
          created_at?: string
          id?: string
          note?: string | null
          physical_quantity?: number | null
          product_name_snapshot?: string
          session_id?: string
          sku_snapshot?: string
          system_quantity?: number
          unit_snapshot?: string
          variant_id?: string
          variant_name_snapshot?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_count_lines_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_count_lines_business_id_session_id_fkey"
            columns: ["business_id", "session_id"]
            isOneToOne: false
            referencedRelation: "inventory_count_sessions"
            referencedColumns: ["business_id", "id"]
          },
          {
            foreignKeyName: "inventory_count_lines_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "inventory_count_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_count_lines_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_count_sessions: {
        Row: {
          branch_id: string
          business_id: string
          count_date: string
          counted_by: string
          created_at: string
          created_by: string
          id: string
          review_note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          submitted_at: string | null
          updated_at: string
        }
        Insert: {
          branch_id: string
          business_id: string
          count_date: string
          counted_by: string
          created_at?: string
          created_by: string
          id?: string
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          submitted_at?: string | null
          updated_at?: string
        }
        Update: {
          branch_id?: string
          business_id?: string
          count_date?: string
          counted_by?: string
          created_at?: string
          created_by?: string
          id?: string
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          submitted_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_count_sessions_business_id_branch_id_fkey"
            columns: ["business_id", "branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["business_id", "id"]
          },
          {
            foreignKeyName: "inventory_count_sessions_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_count_sessions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_count_sessions_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      job_title_denials: {
        Row: {
          job_title: string
          permission: string
        }
        Insert: {
          job_title: string
          permission: string
        }
        Update: {
          job_title?: string
          permission?: string
        }
        Relationships: []
      }
      login_failures: {
        Row: {
          bucket: string
          created_at: string
          id: number
        }
        Insert: {
          bucket: string
          created_at?: string
          id?: number
        }
        Update: {
          bucket?: string
          created_at?: string
          id?: number
        }
        Relationships: []
      }
      loyalty_point_events: {
        Row: {
          actor_id: string
          branch_id: string
          business_id: string
          created_at: string
          document_id: string
          id: string
          membership_id: string
          points: number
          points_per_100: number
          sale_id: string
        }
        Insert: {
          actor_id: string
          branch_id: string
          business_id: string
          created_at?: string
          document_id: string
          id?: string
          membership_id: string
          points: number
          points_per_100?: number
          sale_id: string
        }
        Update: {
          actor_id?: string
          branch_id?: string
          business_id?: string
          created_at?: string
          document_id?: string
          id?: string
          membership_id?: string
          points?: number
          points_per_100?: number
          sale_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "loyalty_point_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loyalty_point_events_business_id_branch_id_fkey"
            columns: ["business_id", "branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["business_id", "id"]
          },
          {
            foreignKeyName: "loyalty_point_events_business_id_document_id_fkey"
            columns: ["business_id", "document_id"]
            isOneToOne: true
            referencedRelation: "commerce_documents"
            referencedColumns: ["business_id", "id"]
          },
          {
            foreignKeyName: "loyalty_point_events_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loyalty_point_events_business_id_membership_id_fkey"
            columns: ["business_id", "membership_id"]
            isOneToOne: false
            referencedRelation: "customer_memberships"
            referencedColumns: ["business_id", "id"]
          },
          {
            foreignKeyName: "loyalty_point_events_business_id_sale_id_fkey"
            columns: ["business_id", "sale_id"]
            isOneToOne: false
            referencedRelation: "commerce_documents"
            referencedColumns: ["business_id", "id"]
          },
        ]
      }
      loyalty_redemptions: {
        Row: {
          actor_id: string
          branch_id: string
          business_id: string
          created_at: string
          discount: number
          document_id: string
          id: string
          kind: string
          membership_id: string
          points: number
          sale_id: string
        }
        Insert: {
          actor_id: string
          branch_id: string
          business_id: string
          created_at?: string
          discount: number
          document_id: string
          id?: string
          kind: string
          membership_id: string
          points: number
          sale_id: string
        }
        Update: {
          actor_id?: string
          branch_id?: string
          business_id?: string
          created_at?: string
          discount?: number
          document_id?: string
          id?: string
          kind?: string
          membership_id?: string
          points?: number
          sale_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "loyalty_redemptions_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loyalty_redemptions_business_id_branch_id_fkey"
            columns: ["business_id", "branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["business_id", "id"]
          },
          {
            foreignKeyName: "loyalty_redemptions_business_id_document_id_fkey"
            columns: ["business_id", "document_id"]
            isOneToOne: true
            referencedRelation: "commerce_documents"
            referencedColumns: ["business_id", "id"]
          },
          {
            foreignKeyName: "loyalty_redemptions_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loyalty_redemptions_business_id_membership_id_fkey"
            columns: ["business_id", "membership_id"]
            isOneToOne: false
            referencedRelation: "customer_memberships"
            referencedColumns: ["business_id", "id"]
          },
          {
            foreignKeyName: "loyalty_redemptions_business_id_sale_id_fkey"
            columns: ["business_id", "sale_id"]
            isOneToOne: false
            referencedRelation: "commerce_documents"
            referencedColumns: ["business_id", "id"]
          },
        ]
      }
      member_permission_denials: {
        Row: {
          business_id: string
          created_at: string
          granted_by: string
          permission: string
          user_id: string
        }
        Insert: {
          business_id: string
          created_at?: string
          granted_by: string
          permission: string
          user_id: string
        }
        Update: {
          business_id?: string
          created_at?: string
          granted_by?: string
          permission?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "member_permission_denials_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_permission_denials_granted_by_fkey"
            columns: ["granted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_permission_denials_user_id_fkey"
            columns: ["user_id"]
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
          category: string
          created_at: string
          credit_limit: number | null
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
          category?: string
          created_at?: string
          credit_limit?: number | null
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
          category?: string
          created_at?: string
          credit_limit?: number | null
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
      payment_accounts: {
        Row: {
          business_id: string
          created_at: string
          created_by: string
          id: string
          is_active: boolean
          kind: string
          name: string
        }
        Insert: {
          business_id: string
          created_at?: string
          created_by?: string
          id: string
          is_active?: boolean
          kind: string
          name: string
        }
        Update: {
          business_id?: string
          created_at?: string
          created_by?: string
          id?: string
          is_active?: boolean
          kind?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_accounts_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_owners: {
        Row: {
          created_at: string
          is_active: boolean
          note: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          is_active?: boolean
          note?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          is_active?: boolean
          note?: string | null
          user_id?: string
        }
        Relationships: []
      }
      product_variants: {
        Row: {
          barcode: string | null
          business_id: string
          created_at: string
          id: string
          is_active: boolean
          model_code: string | null
          mrp: number
          name: string
          product_id: string
          purchase_price: number
          reorder_level: number
          selling_price: number
          sku: string
          unit: string
          updated_at: string
          wholesale_price: number
        }
        Insert: {
          barcode?: string | null
          business_id: string
          created_at?: string
          id?: string
          is_active?: boolean
          model_code?: string | null
          mrp?: number
          name?: string
          product_id: string
          purchase_price?: number
          reorder_level?: number
          selling_price?: number
          sku: string
          unit?: string
          updated_at?: string
          wholesale_price?: number
        }
        Update: {
          barcode?: string | null
          business_id?: string
          created_at?: string
          id?: string
          is_active?: boolean
          model_code?: string | null
          mrp?: number
          name?: string
          product_id?: string
          purchase_price?: number
          reorder_level?: number
          selling_price?: number
          sku?: string
          unit?: string
          updated_at?: string
          wholesale_price?: number
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
          image_path: string | null
          is_active: boolean
          name: string
          updated_at: string
        }
        Insert: {
          business_id: string
          category?: string
          created_at?: string
          id?: string
          image_path?: string | null
          is_active?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          business_id?: string
          category?: string
          created_at?: string
          id?: string
          image_path?: string | null
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
      quotations: {
        Row: {
          actor_id: string
          branch_id: string
          business_id: string
          created_at: string
          customer: Json
          expires_on: string | null
          id: string
          lines: Json
          party_id: string
          quotation_date: string
          reference: string
          request: Json
          revision: number
          sale_id: string | null
          status: string
          total: number
          updated_at: string
        }
        Insert: {
          actor_id: string
          branch_id: string
          business_id: string
          created_at?: string
          customer: Json
          expires_on?: string | null
          id: string
          lines: Json
          party_id: string
          quotation_date: string
          reference: string
          request: Json
          revision?: number
          sale_id?: string | null
          status?: string
          total: number
          updated_at?: string
        }
        Update: {
          actor_id?: string
          branch_id?: string
          business_id?: string
          created_at?: string
          customer?: Json
          expires_on?: string | null
          id?: string
          lines?: Json
          party_id?: string
          quotation_date?: string
          reference?: string
          request?: Json
          revision?: number
          sale_id?: string | null
          status?: string
          total?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "quotations_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotations_business_id_branch_id_fkey"
            columns: ["business_id", "branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["business_id", "id"]
          },
          {
            foreignKeyName: "quotations_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotations_business_id_party_id_fkey"
            columns: ["business_id", "party_id"]
            isOneToOne: false
            referencedRelation: "parties"
            referencedColumns: ["business_id", "id"]
          },
          {
            foreignKeyName: "quotations_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "commerce_documents"
            referencedColumns: ["id"]
          },
        ]
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
      team_invitation_uses: {
        Row: {
          accepted_at: string
          business_id: string
          email_verified_at: string
          id: string
          invitation_id: string
          phone_verified_at: string
          user_id: string
        }
        Insert: {
          accepted_at?: string
          business_id: string
          email_verified_at: string
          id?: string
          invitation_id: string
          phone_verified_at: string
          user_id: string
        }
        Update: {
          accepted_at?: string
          business_id?: string
          email_verified_at?: string
          id?: string
          invitation_id?: string
          phone_verified_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_invitation_uses_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_invitation_uses_invitation_id_fkey"
            columns: ["invitation_id"]
            isOneToOne: false
            referencedRelation: "team_invitations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_invitation_uses_invitation_id_fkey"
            columns: ["invitation_id"]
            isOneToOne: false
            referencedRelation: "team_invitations_status"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_invitation_uses_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      team_invitations: {
        Row: {
          branch_id: string
          business_id: string
          created_at: string
          denied_permissions: string[]
          expires_at: string
          id: string
          invited_by: string
          job_title: string | null
          label: string | null
          max_uses: number
          revoked_at: string | null
          revoked_by: string | null
          role_code: string
          token_hash: string
          use_count: number
        }
        Insert: {
          branch_id: string
          business_id: string
          created_at?: string
          denied_permissions?: string[]
          expires_at: string
          id?: string
          invited_by: string
          job_title?: string | null
          label?: string | null
          max_uses?: number
          revoked_at?: string | null
          revoked_by?: string | null
          role_code: string
          token_hash: string
          use_count?: number
        }
        Update: {
          branch_id?: string
          business_id?: string
          created_at?: string
          denied_permissions?: string[]
          expires_at?: string
          id?: string
          invited_by?: string
          job_title?: string | null
          label?: string | null
          max_uses?: number
          revoked_at?: string | null
          revoked_by?: string | null
          role_code?: string
          token_hash?: string
          use_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "team_invitations_business_id_branch_id_fkey"
            columns: ["business_id", "branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["business_id", "id"]
          },
          {
            foreignKeyName: "team_invitations_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_invitations_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_invitations_revoked_by_fkey"
            columns: ["revoked_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_invitations_role_code_fkey"
            columns: ["role_code"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["code"]
          },
        ]
      }
      website_stock_acknowledgements: {
        Row: {
          actor_id: string
          branch_id: string
          business_id: string
          created_at: string
          delta: number
          id: string
          operation_id: string
          sku: string
          variant_id: string
        }
        Insert: {
          actor_id: string
          branch_id: string
          business_id: string
          created_at?: string
          delta: number
          id: string
          operation_id: string
          sku: string
          variant_id: string
        }
        Update: {
          actor_id?: string
          branch_id?: string
          business_id?: string
          created_at?: string
          delta?: number
          id?: string
          operation_id?: string
          sku?: string
          variant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "website_stock_acknowledgements_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "website_stock_acknowledgements_business_id_branch_id_fkey"
            columns: ["business_id", "branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["business_id", "id"]
          },
          {
            foreignKeyName: "website_stock_acknowledgements_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "website_stock_acknowledgements_business_id_operation_id_fkey"
            columns: ["business_id", "operation_id"]
            isOneToOne: false
            referencedRelation: "stock_operations"
            referencedColumns: ["business_id", "id"]
          },
          {
            foreignKeyName: "website_stock_acknowledgements_business_id_variant_id_fkey"
            columns: ["business_id", "variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["business_id", "id"]
          },
        ]
      }
      website_stock_sync: {
        Row: {
          branch_id: string
          business_id: string
          connection: string
          created_at: string
          lease_id: string | null
          lease_until: string | null
        }
        Insert: {
          branch_id: string
          business_id: string
          connection?: string
          created_at?: string
          lease_id?: string | null
          lease_until?: string | null
        }
        Update: {
          branch_id?: string
          business_id?: string
          connection?: string
          created_at?: string
          lease_id?: string | null
          lease_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "website_stock_sync_business_id_branch_id_fkey"
            columns: ["business_id", "branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["business_id", "id"]
          },
          {
            foreignKeyName: "website_stock_sync_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: true
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      team_invitations_status: {
        Row: {
          branch_id: string | null
          business_id: string | null
          created_at: string | null
          expires_at: string | null
          id: string | null
          invited_by: string | null
          job_title: string | null
          label: string | null
          max_uses: number | null
          revoked_at: string | null
          role_code: string | null
          status: string | null
          use_count: number | null
        }
        Insert: {
          branch_id?: string | null
          business_id?: string | null
          created_at?: string | null
          expires_at?: string | null
          id?: string | null
          invited_by?: string | null
          job_title?: string | null
          label?: string | null
          max_uses?: number | null
          revoked_at?: string | null
          role_code?: string | null
          status?: never
          use_count?: number | null
        }
        Update: {
          branch_id?: string | null
          business_id?: string | null
          created_at?: string | null
          expires_at?: string | null
          id?: string | null
          invited_by?: string | null
          job_title?: string | null
          label?: string | null
          max_uses?: number | null
          revoked_at?: string | null
          role_code?: string | null
          status?: never
          use_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "team_invitations_business_id_branch_id_fkey"
            columns: ["business_id", "branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["business_id", "id"]
          },
          {
            foreignKeyName: "team_invitations_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_invitations_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_invitations_role_code_fkey"
            columns: ["role_code"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["code"]
          },
        ]
      }
    }
    Functions: {
      accept_business_invitation: {
        Args: { _token_hash: string }
        Returns: string
      }
      accept_team_invitation: { Args: { _token_hash: string }; Returns: string }
      account_balances: { Args: { _business: string }; Returns: Json }
      add_business_member: {
        Args: { _business_id: string; _role: string; _user_id: string }
        Returns: string
      }
      adjust_payment_account: { Args: { _request: Json }; Returns: string }
      archive_business: { Args: { _business_id: string }; Returns: undefined }
      assign_business_access_role: {
        Args: { _business: string; _role: string; _user: string }
        Returns: undefined
      }
      begin_website_stock_sync: {
        Args: { _branch_id: string; _business_id: string; _lease_id: string }
        Returns: undefined
      }
      bill_object_business: { Args: { _name: string }; Returns: string }
      business_role_rank: {
        Args: { _business_id: string; _user_id?: string }
        Returns: number
      }
      can_access_branch: {
        Args: { _branch_id: string; _business_id: string }
        Returns: boolean
      }
      can_approve_inventory_count: {
        Args: { _branch_id: string; _business_id: string }
        Returns: boolean
      }
      can_read_cash_counter_session: {
        Args: { _branch_id: string; _business_id: string; _session_id: string }
        Returns: boolean
      }
      change_invitation_role: {
        Args: { _business: string; _invitation: string; _title: string }
        Returns: undefined
      }
      commerce_journal: {
        Args: {
          _account: string
          _branch: string
          _business: string
          _credit: number
          _date: string
          _debit: number
          _period: string
          _source: string
          _type: string
        }
        Returns: undefined
      }
      commerce_open_period: {
        Args: { _business: string; _date: string; _period: string }
        Returns: undefined
      }
      commerce_stock_balance: {
        Args: { _branch: string; _business: string; _variant: string }
        Returns: number
      }
      confirm_expense_receipt: {
        Args: { _receipt_id: string; _request: Json }
        Returns: string
      }
      confirm_expense_receipt_with_account: {
        Args: { _account: string; _receipt: string; _request: Json }
        Returns: string
      }
      convert_quotation: {
        Args: { _business: string; _date: string; _id: string; _period: string }
        Returns: string
      }
      create_business: {
        Args: { _legal_name?: string; _name: string; _pan_vat?: string }
        Returns: string
      }
      create_business_access_role: {
        Args: {
          _authority_rank: number
          _business: string
          _description: string
          _name: string
          _permissions: string[]
        }
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
      create_business_invitation_v2: {
        Args: {
          _business_id: string
          _mobile: string
          _name: string
          _title: string
          _token_hash: string
        }
        Returns: string
      }
      create_inventory_count_session: {
        Args: {
          _branch_id: string
          _business_id: string
          _count_date: string
          _counted_by: string
          _lines: Json
        }
        Returns: string
      }
      create_payment_account: {
        Args: {
          _branch: string
          _business: string
          _date: string
          _id: string
          _kind: string
          _name: string
          _opening: number
          _period: string
        }
        Returns: string
      }
      create_team_invitation:
        | {
            Args: {
              _branch_id: string
              _business_id: string
              _denied: string[]
              _expires_at: string
              _invitee_email: string
              _invitee_mobile: string
              _job_title: string
              _label?: string
              _max_uses: number
              _role: string
              _token_hash: string
            }
            Returns: string
          }
        | {
            Args: {
              _branch_id: string
              _business_id: string
              _denied: string[]
              _expires_at: string
              _job_title: string
              _label?: string
              _max_uses: number
              _role: string
              _token_hash: string
            }
            Returns: string
          }
      end_website_stock_sync: {
        Args: { _business_id: string; _lease_id: string }
        Returns: undefined
      }
      get_business_access_roles: { Args: { _business: string }; Returns: Json }
      get_business_member_access_roles: {
        Args: { _business: string }
        Returns: Json
      }
      get_my_business_permissions: {
        Args: { _business: string }
        Returns: {
          permission: string
        }[]
      }
      get_role_templates: { Args: { _business: string }; Returns: Json }
      grant_branch_delegation: {
        Args: {
          _branch_id: string
          _business_id: string
          _manager: string
          _max_days?: number
          _max_uses?: number
          _roles: string[]
        }
        Returns: string
      }
      has_business_access_role: {
        Args: { _business: string; _role_code: string }
        Returns: boolean
      }
      has_business_job_title: {
        Args: { _business_id: string; _job_title: string }
        Returns: boolean
      }
      has_business_role: {
        Args: { _business_id: string; _min_role: string }
        Returns: boolean
      }
      has_permission: {
        Args: { _business: string; _perm: string }
        Returns: boolean
      }
      hr_adjust_leave_balance: {
        Args: {
          _business_id: string
          _delta_days: number
          _entry_type: string
          _leave_type_id: string
          _leave_year: number
          _notes?: string
          _user_id: string
        }
        Returns: string
      }
      hr_approve_payroll: { Args: { _run_id: string }; Returns: undefined }
      hr_can_manage_payroll: {
        Args: { _business_id: string }
        Returns: boolean
      }
      hr_can_read_own_payslip: {
        Args: { _business_id: string; _run_id: string }
        Returns: boolean
      }
      hr_clock_attendance: {
        Args: {
          _attendance_date: string
          _business_id: string
          _direction: string
        }
        Returns: string
      }
      hr_generate_payroll: {
        Args: {
          _business_id: string
          _period_end: string
          _period_label: string
          _period_start: string
        }
        Returns: string
      }
      hr_is_manager: { Args: { _business_id: string }; Returns: boolean }
      hr_list_payroll_employees: {
        Args: { _business_id: string }
        Returns: {
          branch_id: string
          department: string
          designation: string
          employee_number: string
          employment_status: string
          full_name: string
          joining_date: string
          user_id: string
        }[]
      }
      hr_mark_payroll_paid: {
        Args: { _paid_date?: string; _run_id: string }
        Returns: undefined
      }
      hr_review_leave_request: {
        Args: {
          _business_id: string
          _decision: string
          _override_reason?: string
          _request_id: string
          _review_note?: string
        }
        Returns: string
      }
      import_catalogue_branch_stock: {
        Args: { _branch_id: string; _business_id: string; _rows: Json }
        Returns: Json
      }
      inv_sync_push: { Args: { _items: Json }; Returns: Json }
      is_business_member: { Args: { _business_id: string }; Returns: boolean }
      is_cashier_sale_or_return: {
        Args: { _branch_id: string; _business_id: string; _document_id: string }
        Returns: boolean
      }
      is_platform_owner: { Args: never; Returns: boolean }
      job_title_role: { Args: { _title: string }; Returns: string }
      list_inventory_count_sessions: {
        Args: { _business_id: string }
        Returns: {
          branch_id: string
          branch_name: string
          count_date: string
          counted_by: string
          counted_line_count: number
          created_at: string
          created_by: string
          id: string
          line_count: number
          review_note: string
          reviewed_at: string
          reviewed_by: string
          status: string
          submitted_at: string
        }[]
      }
      login_clear_failures: { Args: { _bucket: string }; Returns: undefined }
      login_email_for_mobile: { Args: { _mobile: string }; Returns: string }
      login_record_failure: { Args: { _bucket: string }; Returns: undefined }
      login_throttle_blocked: {
        Args: { _bucket: string; _max: number; _window_seconds: number }
        Returns: boolean
      }
      loyalty_available_points: {
        Args: { _business: string; _mobile: string }
        Returns: number
      }
      loyalty_balance: {
        Args: { _business: string; _membership: string }
        Returns: number
      }
      loyalty_earned_points: {
        Args: { _rate?: number; _total: number }
        Returns: number
      }
      member_role_denials: {
        Args: { _business: string }
        Returns: {
          permission: string
          user_id: string
        }[]
      }
      normalize_member_mobile: { Args: { _mobile: string }; Returns: string }
      pa_balance: { Args: { _account: string }; Returns: number }
      pa_journal: {
        Args: {
          _amount: number
          _b: string
          _br: string
          _credit: string
          _date: string
          _debit: string
          _per: string
          _reason: string
          _ref: string
          _req: string
        }
        Returns: string
      }
      pa_load: {
        Args: { _account: string; _business: string; _need_active?: boolean }
        Returns: {
          business_id: string
          created_at: string
          created_by: string
          id: string
          is_active: boolean
          kind: string
          name: string
        }
        SetofOptions: {
          from: "*"
          to: "payment_accounts"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      pa_tag_expense: {
        Args: { _account: string; _b: string; _voucher: string }
        Returns: undefined
      }
      pa_tag_payment: {
        Args: { _account: string; _b: string; _payment: string }
        Returns: undefined
      }
      platform_owner_check: { Args: { _user_id: string }; Returns: boolean }
      post_accounting_voucher: { Args: { _request: Json }; Returns: string }
      post_accounting_voucher_with_account: {
        Args: { _account: string; _request: Json }
        Returns: string
      }
      post_cash_counter_event: { Args: { _request: Json }; Returns: string }
      post_commerce_document: { Args: { _request: Json }; Returns: string }
      post_commerce_document_with_accounts: {
        Args: { _accounts: Json; _request: Json }
        Returns: string
      }
      post_commerce_payment: { Args: { _request: Json }; Returns: string }
      post_commerce_payment_with_account: {
        Args: { _account: string; _request: Json }
        Returns: string
      }
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
      preview_team_invitation: {
        Args: { _token_hash: string }
        Returns: {
          branch_name: string
          business_name: string
          expires_at: string
          inviter_name: string
          job_title: string
          role_name: string
          seats_left: number
        }[]
      }
      product_image_business: { Args: { _name: string }; Returns: string }
      read_accounting_snapshot: {
        Args: { _branch_id?: string; _business_id: string; _through?: string }
        Returns: Json
      }
      read_business_report_snapshot: {
        Args: { _branch_id?: string; _business_id: string; _through?: string }
        Returns: Json
      }
      read_customer_loyalty: {
        Args: { _business_id: string }
        Returns: {
          membership_number: string
          mobile: string
          points: string
          purchase_count: string
        }[]
      }
      read_inventory_count_session: {
        Args: { _session_id: string }
        Returns: Json
      }
      read_website_stock_snapshot: {
        Args: { _branch_id: string; _business_id: string }
        Returns: Json
      }
      record_website_stock_ack: {
        Args: {
          _ack_id: string
          _branch_id: string
          _business_id: string
          _delta: number
          _lease_id: string
          _sku: string
        }
        Returns: boolean
      }
      reissue_invitation: {
        Args: { _business: string; _invitation: string; _token_hash: string }
        Returns: string
      }
      reject_expense_receipt: {
        Args: { _note: string; _receipt_id: string }
        Returns: undefined
      }
      remove_business_member: {
        Args: { _business_id: string; _user_id: string }
        Returns: undefined
      }
      request_sale_return: {
        Args: {
          _business_id: string
          _lines: Json
          _reason: string
          _source_sale_id: string
        }
        Returns: string
      }
      reset_role_template: {
        Args: { _business: string; _title: string }
        Returns: undefined
      }
      review_inventory_count_session: {
        Args: { _decision: string; _note?: string; _session_id: string }
        Returns: boolean
      }
      revoke_branch_delegation: {
        Args: { _grant_id: string }
        Returns: undefined
      }
      revoke_business_invitation: {
        Args: { _business_id: string; _invitation_id: string }
        Returns: undefined
      }
      revoke_team_invitation: {
        Args: { _invitation_id: string }
        Returns: undefined
      }
      role_template_denials: {
        Args: { _business: string; _title: string }
        Returns: string[]
      }
      save_catalogue_variant: {
        Args: { _business_id: string; _rows: Json }
        Returns: number
      }
      save_quotation: { Args: { _request: Json }; Returns: string }
      seed_business_access_roles: {
        Args: { _business_id: string }
        Returns: undefined
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
      set_invitation_job_title: {
        Args: { _business: string; _invitation: string; _title: string }
        Returns: undefined
      }
      set_member_job_title: {
        Args: { _business: string; _title: string; _user: string }
        Returns: undefined
      }
      set_member_permissions: {
        Args: { _business: string; _denied: string[]; _user: string }
        Returns: undefined
      }
      set_role_template: {
        Args: { _business: string; _denied: string[]; _title: string }
        Returns: undefined
      }
      shares_business_with: { Args: { _other: string }; Returns: boolean }
      submit_inventory_count_session: {
        Args: { _session_id: string }
        Returns: boolean
      }
      team_invite_authority: {
        Args: {
          _actor: string
          _branch_id: string
          _business_id: string
          _role: string
        }
        Returns: boolean
      }
      transfer_between_accounts: { Args: { _request: Json }; Returns: string }
      transfer_business_ownership: {
        Args: { _business_id: string; _new_owner: string }
        Returns: undefined
      }
      unassign_business_access_role: {
        Args: { _business: string; _role: string; _user: string }
        Returns: undefined
      }
      update_business_access_role: {
        Args: {
          _business: string
          _description: string
          _name: string
          _permissions: string[]
          _role: string
        }
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
      update_inventory_count_session: {
        Args: {
          _count_date: string
          _counted_by: string
          _lines: Json
          _session_id: string
        }
        Returns: boolean
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
