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
    PostgrestVersion: "14.15"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      agent_actions: {
        Row: {
          action: string
          agent: string
          autonomous: boolean
          created_at: string
          entity_id: string | null
          entity_type: string | null
          id: number
          input: Json | null
          latency_ms: number | null
          output: Json | null
          reasoning: string | null
        }
        Insert: {
          action: string
          agent: string
          autonomous?: boolean
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: number
          input?: Json | null
          latency_ms?: number | null
          output?: Json | null
          reasoning?: string | null
        }
        Update: {
          action?: string
          agent?: string
          autonomous?: boolean
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: number
          input?: Json | null
          latency_ms?: number | null
          output?: Json | null
          reasoning?: string | null
        }
        Relationships: []
      }
      booking_guests: {
        Row: {
          booking_id: string
          created_at: string
          date_of_birth: string | null
          full_name: string | null
          id: string
          is_lead: boolean
        }
        Insert: {
          booking_id: string
          created_at?: string
          date_of_birth?: string | null
          full_name?: string | null
          id?: string
          is_lead?: boolean
        }
        Update: {
          booking_id?: string
          created_at?: string
          date_of_birth?: string | null
          full_name?: string | null
          id?: string
          is_lead?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "booking_guests_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      bookings: {
        Row: {
          amount_paid: number
          balance_due_date: string | null
          brand_id: string
          cancellation_reason: string | null
          cancelled_at: string | null
          check_in: string | null
          check_out: string | null
          confirmed_at: string | null
          created_at: string
          customer_id: string | null
          free_cancel_until: string | null
          id: string
          order_strategy: Database["public"]["Enums"]["booking_order_strategy"]
          payable_at_property: number
          payable_at_property_breakdown: Json | null
          property_id: string | null
          quote_id: string | null
          reference: string
          rounding_delta: number
          status: Database["public"]["Enums"]["booking_status"]
          total_cost: number
          total_sell: number
          updated_at: string
        }
        Insert: {
          amount_paid?: number
          balance_due_date?: string | null
          brand_id: string
          cancellation_reason?: string | null
          cancelled_at?: string | null
          check_in?: string | null
          check_out?: string | null
          confirmed_at?: string | null
          created_at?: string
          customer_id?: string | null
          free_cancel_until?: string | null
          id?: string
          order_strategy?: Database["public"]["Enums"]["booking_order_strategy"]
          payable_at_property?: number
          payable_at_property_breakdown?: Json | null
          property_id?: string | null
          quote_id?: string | null
          reference?: string
          rounding_delta?: number
          status?: Database["public"]["Enums"]["booking_status"]
          total_cost: number
          total_sell: number
          updated_at?: string
        }
        Update: {
          amount_paid?: number
          balance_due_date?: string | null
          brand_id?: string
          cancellation_reason?: string | null
          cancelled_at?: string | null
          check_in?: string | null
          check_out?: string | null
          confirmed_at?: string | null
          created_at?: string
          customer_id?: string | null
          free_cancel_until?: string | null
          id?: string
          order_strategy?: Database["public"]["Enums"]["booking_order_strategy"]
          payable_at_property?: number
          payable_at_property_breakdown?: Json | null
          property_id?: string | null
          quote_id?: string | null
          reference?: string
          rounding_delta?: number
          status?: Database["public"]["Enums"]["booking_status"]
          total_cost?: number
          total_sell?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bookings_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
        ]
      }
      brands: {
        Row: {
          created_at: string
          currency: string
          default_check_in_time: string
          domain: string
          from_email: string
          id: string
          margin_floor_pct: number
          name: string
          rounding_increment: number
          slug: string
          terms_url: string | null
          timezone: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          currency?: string
          default_check_in_time?: string
          domain: string
          from_email: string
          id?: string
          margin_floor_pct?: number
          name: string
          rounding_increment?: number
          slug: string
          terms_url?: string | null
          timezone?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          currency?: string
          default_check_in_time?: string
          domain?: string
          from_email?: string
          id?: string
          margin_floor_pct?: number
          name?: string
          rounding_increment?: number
          slug?: string
          terms_url?: string | null
          timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
      customers: {
        Row: {
          brand_id: string
          country: string | null
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          marketing_optin: boolean
          phone: string | null
          preferred_language: string
          updated_at: string
        }
        Insert: {
          brand_id: string
          country?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          marketing_optin?: boolean
          phone?: string | null
          preferred_language?: string
          updated_at?: string
        }
        Update: {
          brand_id?: string
          country?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          marketing_optin?: boolean
          phone?: string | null
          preferred_language?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customers_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
      enquiries: {
        Row: {
          adults: number | null
          brand_id: string
          budget_total: number | null
          children: number | null
          created_at: string
          customer_id: string | null
          emirate: Database["public"]["Enums"]["emirate"] | null
          flexible_dates: boolean
          id: string
          last_contact_at: string | null
          lead_score: number | null
          owner: string | null
          requirements: string | null
          rooms: number | null
          source: string | null
          status: Database["public"]["Enums"]["enquiry_status"]
          travel_end: string | null
          travel_start: string | null
        }
        Insert: {
          adults?: number | null
          brand_id: string
          budget_total?: number | null
          children?: number | null
          created_at?: string
          customer_id?: string | null
          emirate?: Database["public"]["Enums"]["emirate"] | null
          flexible_dates?: boolean
          id?: string
          last_contact_at?: string | null
          lead_score?: number | null
          owner?: string | null
          requirements?: string | null
          rooms?: number | null
          source?: string | null
          status?: Database["public"]["Enums"]["enquiry_status"]
          travel_end?: string | null
          travel_start?: string | null
        }
        Update: {
          adults?: number | null
          brand_id?: string
          budget_total?: number | null
          children?: number | null
          created_at?: string
          customer_id?: string | null
          emirate?: Database["public"]["Enums"]["emirate"] | null
          flexible_dates?: boolean
          id?: string
          last_contact_at?: string | null
          lead_score?: number | null
          owner?: string | null
          requirements?: string | null
          rooms?: number | null
          source?: string | null
          status?: Database["public"]["Enums"]["enquiry_status"]
          travel_end?: string | null
          travel_start?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "enquiries_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enquiries_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      external_bookings: {
        Row: {
          adapter: string
          attempt: number
          booking_id: string
          created_at: string
          currency: string
          failure_class:
            | Database["public"]["Enums"]["supplier_failure_class"]
            | null
          failure_detail: string | null
          free_cancel_until: string | null
          id: string
          idempotency_key: string
          net_cost: number
          net_rate_tax_inclusive: boolean | null
          quote_item_id: string | null
          raw_response: Json | null
          status: Database["public"]["Enums"]["external_booking_status"]
          supplier_ref: string
          taxes_included: Json | null
        }
        Insert: {
          adapter: string
          attempt?: number
          booking_id: string
          created_at?: string
          currency?: string
          failure_class?:
            | Database["public"]["Enums"]["supplier_failure_class"]
            | null
          failure_detail?: string | null
          free_cancel_until?: string | null
          id?: string
          idempotency_key: string
          net_cost: number
          net_rate_tax_inclusive?: boolean | null
          quote_item_id?: string | null
          raw_response?: Json | null
          status: Database["public"]["Enums"]["external_booking_status"]
          supplier_ref: string
          taxes_included?: Json | null
        }
        Update: {
          adapter?: string
          attempt?: number
          booking_id?: string
          created_at?: string
          currency?: string
          failure_class?:
            | Database["public"]["Enums"]["supplier_failure_class"]
            | null
          failure_detail?: string | null
          free_cancel_until?: string | null
          id?: string
          idempotency_key?: string
          net_cost?: number
          net_rate_tax_inclusive?: boolean | null
          quote_item_id?: string | null
          raw_response?: Json | null
          status?: Database["public"]["Enums"]["external_booking_status"]
          supplier_ref?: string
          taxes_included?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "external_bookings_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "external_bookings_quote_item_id_fkey"
            columns: ["quote_item_id"]
            isOneToOne: false
            referencedRelation: "quote_items"
            referencedColumns: ["id"]
          },
        ]
      }
      extra_eligibility: {
        Row: {
          area: string | null
          created_at: string
          emirate: Database["public"]["Enums"]["emirate"] | null
          external_property_id: string | null
          id: string
          priority: number
          product_id: string
          scope: Database["public"]["Enums"]["eligibility_scope"]
          valid_from: string | null
          valid_to: string | null
        }
        Insert: {
          area?: string | null
          created_at?: string
          emirate?: Database["public"]["Enums"]["emirate"] | null
          external_property_id?: string | null
          id?: string
          priority?: number
          product_id: string
          scope: Database["public"]["Enums"]["eligibility_scope"]
          valid_from?: string | null
          valid_to?: string | null
        }
        Update: {
          area?: string | null
          created_at?: string
          emirate?: Database["public"]["Enums"]["emirate"] | null
          external_property_id?: string | null
          id?: string
          priority?: number
          product_id?: string
          scope?: Database["public"]["Enums"]["eligibility_scope"]
          valid_from?: string | null
          valid_to?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "extra_eligibility_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      lpos: {
        Row: {
          booking_id: string | null
          created_at: string
          generated_by: string | null
          id: string
          issued_at: string | null
          issued_by: string | null
          line_items: Json
          lpo_number: string
          payment_terms: string | null
          pdf_url: string | null
          status: string
          supplier_id: string | null
          total_cost: number
        }
        Insert: {
          booking_id?: string | null
          created_at?: string
          generated_by?: string | null
          id?: string
          issued_at?: string | null
          issued_by?: string | null
          line_items: Json
          lpo_number: string
          payment_terms?: string | null
          pdf_url?: string | null
          status?: string
          supplier_id?: string | null
          total_cost: number
        }
        Update: {
          booking_id?: string | null
          created_at?: string
          generated_by?: string | null
          id?: string
          issued_at?: string | null
          issued_by?: string | null
          line_items?: Json
          lpo_number?: string
          payment_terms?: string | null
          pdf_url?: string | null
          status?: string
          supplier_id?: string | null
          total_cost?: number
        }
        Relationships: [
          {
            foreignKeyName: "lpos_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lpos_issued_by_fkey"
            columns: ["issued_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lpos_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      markup_rules: {
        Row: {
          brand_id: string
          created_at: string
          created_by: string | null
          effective_from: string
          effective_to: string | null
          id: string
          markup_pct: number
          min_margin_pct: number | null
          product_type: Database["public"]["Enums"]["product_type"] | null
          sourcing: Database["public"]["Enums"]["sourcing_type"]
        }
        Insert: {
          brand_id: string
          created_at?: string
          created_by?: string | null
          effective_from?: string
          effective_to?: string | null
          id?: string
          markup_pct: number
          min_margin_pct?: number | null
          product_type?: Database["public"]["Enums"]["product_type"] | null
          sourcing: Database["public"]["Enums"]["sourcing_type"]
        }
        Update: {
          brand_id?: string
          created_at?: string
          created_by?: string | null
          effective_from?: string
          effective_to?: string | null
          id?: string
          markup_pct?: number
          min_margin_pct?: number | null
          product_type?: Database["public"]["Enums"]["product_type"] | null
          sourcing?: Database["public"]["Enums"]["sourcing_type"]
        }
        Relationships: [
          {
            foreignKeyName: "markup_rules_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "markup_rules_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          approved_by: string | null
          body: string | null
          booking_id: string | null
          brand_id: string
          channel: Database["public"]["Enums"]["message_channel"]
          created_at: string
          direction: Database["public"]["Enums"]["message_direction"]
          enquiry_id: string | null
          from_address: string | null
          id: string
          language: string
          requires_approval: boolean
          sent_at: string | null
          sent_by: string | null
          subject: string | null
          thread_key: string
          to_address: string | null
        }
        Insert: {
          approved_by?: string | null
          body?: string | null
          booking_id?: string | null
          brand_id: string
          channel: Database["public"]["Enums"]["message_channel"]
          created_at?: string
          direction: Database["public"]["Enums"]["message_direction"]
          enquiry_id?: string | null
          from_address?: string | null
          id?: string
          language?: string
          requires_approval?: boolean
          sent_at?: string | null
          sent_by?: string | null
          subject?: string | null
          thread_key: string
          to_address?: string | null
        }
        Update: {
          approved_by?: string | null
          body?: string | null
          booking_id?: string | null
          brand_id?: string
          channel?: Database["public"]["Enums"]["message_channel"]
          created_at?: string
          direction?: Database["public"]["Enums"]["message_direction"]
          enquiry_id?: string | null
          from_address?: string | null
          id?: string
          language?: string
          requires_approval?: boolean
          sent_at?: string | null
          sent_by?: string | null
          subject?: string | null
          thread_key?: string
          to_address?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "messages_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_enquiry_id_fkey"
            columns: ["enquiry_id"]
            isOneToOne: false
            referencedRelation: "enquiries"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          bank_ref: string | null
          booking_id: string | null
          created_at: string
          currency: string
          direction: Database["public"]["Enums"]["payment_direction"]
          gateway_ref: string | null
          id: string
          method: Database["public"]["Enums"]["payment_method"]
          notes: string | null
          received_at: string | null
          reconciled: boolean
          reconciled_at: string | null
          reconciled_by: string | null
        }
        Insert: {
          amount: number
          bank_ref?: string | null
          booking_id?: string | null
          created_at?: string
          currency?: string
          direction: Database["public"]["Enums"]["payment_direction"]
          gateway_ref?: string | null
          id?: string
          method: Database["public"]["Enums"]["payment_method"]
          notes?: string | null
          received_at?: string | null
          reconciled?: boolean
          reconciled_at?: string | null
          reconciled_by?: string | null
        }
        Update: {
          amount?: number
          bank_ref?: string | null
          booking_id?: string | null
          created_at?: string
          currency?: string
          direction?: Database["public"]["Enums"]["payment_direction"]
          gateway_ref?: string | null
          id?: string
          method?: Database["public"]["Enums"]["payment_method"]
          notes?: string | null
          received_at?: string | null
          reconciled?: boolean
          reconciled_at?: string | null
          reconciled_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payments_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      product_rate_child_bands: {
        Row: {
          age_max: number
          age_min: number
          cost_net: number
          created_at: string
          id: string
          label: string | null
          rate_id: string
          sell_price: number | null
        }
        Insert: {
          age_max: number
          age_min: number
          cost_net?: number
          created_at?: string
          id?: string
          label?: string | null
          rate_id: string
          sell_price?: number | null
        }
        Update: {
          age_max?: number
          age_min?: number
          cost_net?: number
          created_at?: string
          id?: string
          label?: string | null
          rate_id?: string
          sell_price?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "product_rate_child_bands_rate_id_fkey"
            columns: ["rate_id"]
            isOneToOne: false
            referencedRelation: "product_rates"
            referencedColumns: ["id"]
          },
        ]
      }
      product_rates: {
        Row: {
          allocation: number | null
          allocation_used: number
          blackout_dates: unknown[] | null
          cost_net: number
          created_at: string
          id: string
          min_nights: number | null
          notes: string | null
          pricing_basis: Database["public"]["Enums"]["pricing_basis"]
          product_id: string
          season_name: string | null
          sell_price: number | null
          updated_at: string
          valid_from: string
          valid_to: string
        }
        Insert: {
          allocation?: number | null
          allocation_used?: number
          blackout_dates?: unknown[] | null
          cost_net: number
          created_at?: string
          id?: string
          min_nights?: number | null
          notes?: string | null
          pricing_basis?: Database["public"]["Enums"]["pricing_basis"]
          product_id: string
          season_name?: string | null
          sell_price?: number | null
          updated_at?: string
          valid_from: string
          valid_to: string
        }
        Update: {
          allocation?: number | null
          allocation_used?: number
          blackout_dates?: unknown[] | null
          cost_net?: number
          created_at?: string
          id?: string
          min_nights?: number | null
          notes?: string | null
          pricing_basis?: Database["public"]["Enums"]["pricing_basis"]
          product_id?: string
          season_name?: string | null
          sell_price?: number | null
          updated_at?: string
          valid_from?: string
          valid_to?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_rates_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          active: boolean
          brand_id: string
          created_at: string
          description: string | null
          description_ar: string | null
          freesale: boolean
          id: string
          images: Json | null
          inclusions: Json | null
          min_lead_time_hours: number
          name: string
          name_ar: string | null
          redemption_method:
            | Database["public"]["Enums"]["redemption_method"]
            | null
          sourcing: Database["public"]["Enums"]["sourcing_type"]
          supplier_id: string | null
          type: Database["public"]["Enums"]["product_type"]
          updated_at: string
        }
        Insert: {
          active?: boolean
          brand_id: string
          created_at?: string
          description?: string | null
          description_ar?: string | null
          freesale?: boolean
          id?: string
          images?: Json | null
          inclusions?: Json | null
          min_lead_time_hours?: number
          name: string
          name_ar?: string | null
          redemption_method?:
            | Database["public"]["Enums"]["redemption_method"]
            | null
          sourcing?: Database["public"]["Enums"]["sourcing_type"]
          supplier_id?: string | null
          type: Database["public"]["Enums"]["product_type"]
          updated_at?: string
        }
        Update: {
          active?: boolean
          brand_id?: string
          created_at?: string
          description?: string | null
          description_ar?: string | null
          freesale?: boolean
          id?: string
          images?: Json | null
          inclusions?: Json | null
          min_lead_time_hours?: number
          name?: string
          name_ar?: string | null
          redemption_method?:
            | Database["public"]["Enums"]["redemption_method"]
            | null
          sourcing?: Database["public"]["Enums"]["sourcing_type"]
          supplier_id?: string | null
          type?: Database["public"]["Enums"]["product_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          active: boolean
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          role: Database["public"]["Enums"]["user_role"]
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
        }
        Relationships: []
      }
      properties: {
        Row: {
          adapter: string
          area: string | null
          cached_at: string
          check_in_time: string | null
          check_out_time: string | null
          content: Json | null
          created_at: string
          emirate: Database["public"]["Enums"]["emirate"]
          external_property_id: string
          id: string
          latitude: number | null
          longitude: number | null
          name: string
          star_rating: number | null
        }
        Insert: {
          adapter: string
          area?: string | null
          cached_at?: string
          check_in_time?: string | null
          check_out_time?: string | null
          content?: Json | null
          created_at?: string
          emirate: Database["public"]["Enums"]["emirate"]
          external_property_id: string
          id?: string
          latitude?: number | null
          longitude?: number | null
          name: string
          star_rating?: number | null
        }
        Update: {
          adapter?: string
          area?: string | null
          cached_at?: string
          check_in_time?: string | null
          check_out_time?: string | null
          content?: Json | null
          created_at?: string
          emirate?: Database["public"]["Enums"]["emirate"]
          external_property_id?: string
          id?: string
          latitude?: number | null
          longitude?: number | null
          name?: string
          star_rating?: number | null
        }
        Relationships: []
      }
      property_fees: {
        Row: {
          amount: number
          basis: Database["public"]["Enums"]["fee_basis"]
          created_at: string
          effective_from: string
          effective_to: string | null
          emirate: Database["public"]["Enums"]["emirate"]
          fee_type: Database["public"]["Enums"]["fee_type"]
          id: string
          max_nights: number | null
          prepayable: boolean
          source_note: string | null
          star_rating: number | null
        }
        Insert: {
          amount: number
          basis: Database["public"]["Enums"]["fee_basis"]
          created_at?: string
          effective_from: string
          effective_to?: string | null
          emirate: Database["public"]["Enums"]["emirate"]
          fee_type: Database["public"]["Enums"]["fee_type"]
          id?: string
          max_nights?: number | null
          prepayable: boolean
          source_note?: string | null
          star_rating?: number | null
        }
        Update: {
          amount?: number
          basis?: Database["public"]["Enums"]["fee_basis"]
          created_at?: string
          effective_from?: string
          effective_to?: string | null
          emirate?: Database["public"]["Enums"]["emirate"]
          fee_type?: Database["public"]["Enums"]["fee_type"]
          id?: string
          max_nights?: number | null
          prepayable?: boolean
          source_note?: string | null
          star_rating?: number | null
        }
        Relationships: []
      }
      property_overrides: {
        Row: {
          created_at: string
          description: string | null
          description_ar: string | null
          name_ar: string | null
          notes: string | null
          property_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          description_ar?: string | null
          name_ar?: string | null
          notes?: string | null
          property_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          description?: string | null
          description_ar?: string | null
          name_ar?: string | null
          notes?: string | null
          property_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "property_overrides_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: true
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "property_overrides_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      quote_items: {
        Row: {
          created_at: string
          date_from: string | null
          date_to: string | null
          description: string
          description_ar: string | null
          free_cancel_until: string | null
          id: string
          is_refundable: boolean | null
          pricing_detail: Json | null
          product_id: string | null
          property_id: string | null
          quantity: number
          quote_id: string
          rate_id: string | null
          sourcing: Database["public"]["Enums"]["sourcing_type"]
          supplier_id: string | null
          unit_cost: number
          unit_sell: number
        }
        Insert: {
          created_at?: string
          date_from?: string | null
          date_to?: string | null
          description: string
          description_ar?: string | null
          free_cancel_until?: string | null
          id?: string
          is_refundable?: boolean | null
          pricing_detail?: Json | null
          product_id?: string | null
          property_id?: string | null
          quantity?: number
          quote_id: string
          rate_id?: string | null
          sourcing?: Database["public"]["Enums"]["sourcing_type"]
          supplier_id?: string | null
          unit_cost: number
          unit_sell: number
        }
        Update: {
          created_at?: string
          date_from?: string | null
          date_to?: string | null
          description?: string
          description_ar?: string | null
          free_cancel_until?: string | null
          id?: string
          is_refundable?: boolean | null
          pricing_detail?: Json | null
          product_id?: string | null
          property_id?: string | null
          quantity?: number
          quote_id?: string
          rate_id?: string | null
          sourcing?: Database["public"]["Enums"]["sourcing_type"]
          supplier_id?: string | null
          unit_cost?: number
          unit_sell?: number
        }
        Relationships: [
          {
            foreignKeyName: "quote_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_items_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_items_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_items_rate_id_fkey"
            columns: ["rate_id"]
            isOneToOne: false
            referencedRelation: "product_rates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_items_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      quotes: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          brand_id: string
          created_at: string
          currency: string
          enquiry_id: string | null
          id: string
          margin_pct: number | null
          payable_at_property: number
          payable_at_property_breakdown: Json | null
          rounding_delta: number
          sent_at: string | null
          status: Database["public"]["Enums"]["quote_status"]
          total_cost: number | null
          total_sell: number | null
          updated_at: string
          valid_until: string
          version: number
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          brand_id: string
          created_at?: string
          currency?: string
          enquiry_id?: string | null
          id?: string
          margin_pct?: number | null
          payable_at_property?: number
          payable_at_property_breakdown?: Json | null
          rounding_delta?: number
          sent_at?: string | null
          status?: Database["public"]["Enums"]["quote_status"]
          total_cost?: number | null
          total_sell?: number | null
          updated_at?: string
          valid_until: string
          version?: number
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          brand_id?: string
          created_at?: string
          currency?: string
          enquiry_id?: string | null
          id?: string
          margin_pct?: number | null
          payable_at_property?: number
          payable_at_property_breakdown?: Json | null
          rounding_delta?: number
          sent_at?: string | null
          status?: Database["public"]["Enums"]["quote_status"]
          total_cost?: number | null
          total_sell?: number | null
          updated_at?: string
          valid_until?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "quotes_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_enquiry_id_fkey"
            columns: ["enquiry_id"]
            isOneToOne: false
            referencedRelation: "enquiries"
            referencedColumns: ["id"]
          },
        ]
      }
      strings: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          ar: string | null
          context: string | null
          created_at: string
          en: string
          key: string
          locked: boolean
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          ar?: string | null
          context?: string | null
          created_at?: string
          en: string
          key: string
          locked?: boolean
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          ar?: string | null
          context?: string | null
          created_at?: string
          en?: string
          key?: string
          locked?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      supplier_confirmations: {
        Row: {
          booking_id: string | null
          created_at: string
          discrepancies: Json | null
          id: string
          lpo_id: string | null
          parsed_by: string | null
          raw_document: string | null
          received_at: string
          source: string | null
          supplier_ref: string
          verified_by: string | null
        }
        Insert: {
          booking_id?: string | null
          created_at?: string
          discrepancies?: Json | null
          id?: string
          lpo_id?: string | null
          parsed_by?: string | null
          raw_document?: string | null
          received_at: string
          source?: string | null
          supplier_ref: string
          verified_by?: string | null
        }
        Update: {
          booking_id?: string | null
          created_at?: string
          discrepancies?: Json | null
          id?: string
          lpo_id?: string | null
          parsed_by?: string | null
          raw_document?: string | null
          received_at?: string
          source?: string | null
          supplier_ref?: string
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "supplier_confirmations_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_confirmations_lpo_id_fkey"
            columns: ["lpo_id"]
            isOneToOne: false
            referencedRelation: "lpos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_confirmations_verified_by_fkey"
            columns: ["verified_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      suppliers: {
        Row: {
          active: boolean
          cancellation_policy: string | null
          city: string | null
          contact_email: string
          contact_phone: string | null
          country: string | null
          created_at: string
          id: string
          name: string
          payment_terms: string | null
          type: Database["public"]["Enums"]["supplier_type"]
          updated_at: string
        }
        Insert: {
          active?: boolean
          cancellation_policy?: string | null
          city?: string | null
          contact_email: string
          contact_phone?: string | null
          country?: string | null
          created_at?: string
          id?: string
          name: string
          payment_terms?: string | null
          type: Database["public"]["Enums"]["supplier_type"]
          updated_at?: string
        }
        Update: {
          active?: boolean
          cancellation_policy?: string | null
          city?: string | null
          contact_email?: string
          contact_phone?: string | null
          country?: string | null
          created_at?: string
          id?: string
          name?: string
          payment_terms?: string | null
          type?: Database["public"]["Enums"]["supplier_type"]
          updated_at?: string
        }
        Relationships: []
      }
      tasks: {
        Row: {
          booking_id: string | null
          context: Json | null
          created_at: string
          due_at: string | null
          id: string
          payment_id: string | null
          priority: Database["public"]["Enums"]["task_priority"]
          quote_id: string | null
          raised_by: string | null
          resolution_note: string | null
          resolved_at: string | null
          resolved_by: string | null
          status: Database["public"]["Enums"]["task_status"]
          summary: string
          type: Database["public"]["Enums"]["task_type"]
        }
        Insert: {
          booking_id?: string | null
          context?: Json | null
          created_at?: string
          due_at?: string | null
          id?: string
          payment_id?: string | null
          priority?: Database["public"]["Enums"]["task_priority"]
          quote_id?: string | null
          raised_by?: string | null
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: Database["public"]["Enums"]["task_status"]
          summary: string
          type: Database["public"]["Enums"]["task_type"]
        }
        Update: {
          booking_id?: string | null
          context?: Json | null
          created_at?: string
          due_at?: string | null
          id?: string
          payment_id?: string | null
          priority?: Database["public"]["Enums"]["task_priority"]
          quote_id?: string | null
          raised_by?: string | null
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: Database["public"]["Enums"]["task_status"]
          summary?: string
          type?: Database["public"]["Enums"]["task_type"]
        }
        Relationships: [
          {
            foreignKeyName: "tasks_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      vouchers: {
        Row: {
          booking_id: string
          code: string
          created_at: string
          id: string
          pdf_url: string | null
          product_id: string | null
          quote_item_id: string | null
          redeemed_at: string | null
          redemption_method: Database["public"]["Enums"]["redemption_method"]
          reissued_from: string | null
          superseded_at: string | null
          valid_from: string | null
          valid_to: string | null
        }
        Insert: {
          booking_id: string
          code?: string
          created_at?: string
          id?: string
          pdf_url?: string | null
          product_id?: string | null
          quote_item_id?: string | null
          redeemed_at?: string | null
          redemption_method: Database["public"]["Enums"]["redemption_method"]
          reissued_from?: string | null
          superseded_at?: string | null
          valid_from?: string | null
          valid_to?: string | null
        }
        Update: {
          booking_id?: string
          code?: string
          created_at?: string
          id?: string
          pdf_url?: string | null
          product_id?: string | null
          quote_item_id?: string | null
          redeemed_at?: string | null
          redemption_method?: Database["public"]["Enums"]["redemption_method"]
          reissued_from?: string | null
          superseded_at?: string | null
          valid_from?: string | null
          valid_to?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vouchers_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vouchers_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vouchers_quote_item_id_fkey"
            columns: ["quote_item_id"]
            isOneToOne: false
            referencedRelation: "quote_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vouchers_reissued_from_fkey"
            columns: ["reissued_from"]
            isOneToOne: false
            referencedRelation: "vouchers"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      admin_update_locked_string: {
        Args: {
          p_approved_by?: string
          p_ar?: string
          p_context?: string
          p_en: string
          p_key: string
        }
        Returns: {
          approved_at: string | null
          approved_by: string | null
          ar: string | null
          context: string | null
          created_at: string
          en: string
          key: string
          locked: boolean
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "strings"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      booking_guest_ages: {
        Args: { p_booking_id: string }
        Returns: {
          age: number
          full_name: string
          guest_id: string
        }[]
      }
      booking_transition_allowed: {
        Args: {
          p_from: Database["public"]["Enums"]["booking_status"]
          p_to: Database["public"]["Enums"]["booking_status"]
        }
        Returns: boolean
      }
      escalate_stuck_bookings: {
        Args: { p_stuck_minutes?: number }
        Returns: number
      }
      fees_for_property: {
        Args: { p_on_date: string; p_property_id: string }
        Returns: {
          amount: number
          basis: Database["public"]["Enums"]["fee_basis"]
          created_at: string
          effective_from: string
          effective_to: string | null
          emirate: Database["public"]["Enums"]["emirate"]
          fee_type: Database["public"]["Enums"]["fee_type"]
          id: string
          max_nights: number | null
          prepayable: boolean
          source_note: string | null
          star_rating: number | null
        }[]
        SetofOptions: {
          from: "*"
          to: "property_fees"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      generate_booking_reference: { Args: never; Returns: string }
      generate_voucher_code: { Args: never; Returns: string }
      guest_age_at: {
        Args: { p_date_of_birth: string; p_on_date: string }
        Returns: number
      }
      has_role: {
        Args: { p_role: Database["public"]["Enums"]["user_role"] }
        Returns: boolean
      }
      is_admin: { Args: never; Returns: boolean }
      is_staff: { Args: never; Returns: boolean }
      property_check_in_time: {
        Args: { p_brand_id: string; p_property_id: string }
        Returns: string
      }
      reissue_voucher: {
        Args: { p_reason?: string; p_voucher_id: string }
        Returns: {
          booking_id: string
          code: string
          created_at: string
          id: string
          pdf_url: string | null
          product_id: string | null
          quote_item_id: string | null
          redeemed_at: string | null
          redemption_method: Database["public"]["Enums"]["redemption_method"]
          reissued_from: string | null
          superseded_at: string | null
          valid_from: string | null
          valid_to: string | null
        }
        SetofOptions: {
          from: "*"
          to: "vouchers"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      resolve_markup_pct: {
        Args: {
          p_brand_id: string
          p_on_date?: string
          p_product_type: Database["public"]["Enums"]["product_type"]
          p_sourcing: Database["public"]["Enums"]["sourcing_type"]
        }
        Returns: number
      }
    }
    Enums: {
      booking_order_strategy: "payment_first" | "booking_first"
      booking_status:
        | "draft"
        | "payment_pending"
        | "payment_received"
        | "supplier_booking"
        | "confirmed"
        | "travelling"
        | "completed"
        | "failed_rollback"
        | "cancelled"
        | "refunded"
      eligibility_scope: "emirate" | "area" | "property" | "any"
      emirate:
        | "dubai"
        | "abu_dhabi"
        | "sharjah"
        | "ajman"
        | "umm_al_quwain"
        | "rak"
        | "fujairah"
      enquiry_status:
        | "new"
        | "qualifying"
        | "quoting"
        | "quoted"
        | "negotiating"
        | "won"
        | "lost"
        | "expired"
      external_booking_status: "confirmed" | "cancelled" | "failed"
      fee_basis: "per_room_night" | "pct_of_bill"
      fee_type: "tourism_dirham" | "municipality" | "service" | "vat"
      message_channel: "email" | "whatsapp" | "web_chat"
      message_direction: "inbound" | "outbound"
      payment_direction: "in" | "out"
      payment_method: "card" | "bank_transfer" | "link" | "refund"
      pricing_basis:
        | "per_person"
        | "per_booking"
        | "per_night"
        | "per_unit"
        | "per_room_night"
      product_type:
        | "accommodation"
        | "attraction"
        | "dining"
        | "experience"
        | "wellness"
        | "transfer"
        | "room_extra"
        | "package"
      quote_status:
        | "draft"
        | "pending_approval"
        | "approved"
        | "auto_approved"
        | "sent"
        | "expired"
      redemption_method: "voucher_code" | "name_list" | "qr"
      sourcing_type: "api" | "contracted"
      supplier_failure_class: "deterministic" | "indeterminate"
      supplier_type:
        | "hotel"
        | "attraction"
        | "dining"
        | "experience"
        | "wellness"
        | "transfer"
        | "dmc"
      task_priority: "urgent" | "normal" | "low"
      task_status: "open" | "done" | "dismissed"
      task_type:
        | "approve_quote"
        | "refund"
        | "rollback_manual_cancel"
        | "booking_stuck"
        | "discrepancy"
        | "unmatched_payment"
        | "tax_treatment_unknown"
        | "missing_fee_rules"
        | "missing_arabic"
        | "other"
      user_role: "admin" | "operator"
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      booking_order_strategy: ["payment_first", "booking_first"],
      booking_status: [
        "draft",
        "payment_pending",
        "payment_received",
        "supplier_booking",
        "confirmed",
        "travelling",
        "completed",
        "failed_rollback",
        "cancelled",
        "refunded",
      ],
      eligibility_scope: ["emirate", "area", "property", "any"],
      emirate: [
        "dubai",
        "abu_dhabi",
        "sharjah",
        "ajman",
        "umm_al_quwain",
        "rak",
        "fujairah",
      ],
      enquiry_status: [
        "new",
        "qualifying",
        "quoting",
        "quoted",
        "negotiating",
        "won",
        "lost",
        "expired",
      ],
      external_booking_status: ["confirmed", "cancelled", "failed"],
      fee_basis: ["per_room_night", "pct_of_bill"],
      fee_type: ["tourism_dirham", "municipality", "service", "vat"],
      message_channel: ["email", "whatsapp", "web_chat"],
      message_direction: ["inbound", "outbound"],
      payment_direction: ["in", "out"],
      payment_method: ["card", "bank_transfer", "link", "refund"],
      pricing_basis: [
        "per_person",
        "per_booking",
        "per_night",
        "per_unit",
        "per_room_night",
      ],
      product_type: [
        "accommodation",
        "attraction",
        "dining",
        "experience",
        "wellness",
        "transfer",
        "room_extra",
        "package",
      ],
      quote_status: [
        "draft",
        "pending_approval",
        "approved",
        "auto_approved",
        "sent",
        "expired",
      ],
      redemption_method: ["voucher_code", "name_list", "qr"],
      sourcing_type: ["api", "contracted"],
      supplier_failure_class: ["deterministic", "indeterminate"],
      supplier_type: [
        "hotel",
        "attraction",
        "dining",
        "experience",
        "wellness",
        "transfer",
        "dmc",
      ],
      task_priority: ["urgent", "normal", "low"],
      task_status: ["open", "done", "dismissed"],
      task_type: [
        "approve_quote",
        "refund",
        "rollback_manual_cancel",
        "booking_stuck",
        "discrepancy",
        "unmatched_payment",
        "tax_treatment_unknown",
        "missing_fee_rules",
        "missing_arabic",
        "other",
      ],
      user_role: ["admin", "operator"],
    },
  },
} as const
