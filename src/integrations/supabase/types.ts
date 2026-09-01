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
      admin_notifications: {
        Row: {
          body: Json
          created_at: string
          id: string
          read_at: string | null
          title: string
          type: string
        }
        Insert: {
          body?: Json
          created_at?: string
          id?: string
          read_at?: string | null
          title: string
          type: string
        }
        Update: {
          body?: Json
          created_at?: string
          id?: string
          read_at?: string | null
          title?: string
          type?: string
        }
        Relationships: []
      }
      ai_provider_status: {
        Row: {
          id: boolean
          model: string | null
          provider: string | null
          updated_at: string
        }
        Insert: {
          id?: boolean
          model?: string | null
          provider?: string | null
          updated_at?: string
        }
        Update: {
          id?: boolean
          model?: string | null
          provider?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      bookings: {
        Row: {
          balance_amount: number | null
          balance_method: string | null
          cancellation_charge: number | null
          contact_name: string | null
          contact_phone: string | null
          coupon_code: string | null
          coupon_discount: number
          created_at: string
          credit_used: number | null
          credit_used_cashback: number
          credit_used_manual: number
          deposit_amount: number
          deposit_receipt_url: string | null
          deposit_status: string
          door_code: string | null
          end_time: string
          google_event_id: string | null
          id: string
          notes: string | null
          overtime_charge: number | null
          overtime_minutes: number | null
          package: string
          price: number
          recurring_series_id: string | null
          reminder_4h_sent_at: string | null
          reminder_hours_before: number | null
          reminder_sent_at: string | null
          reserved_items: Json
          session_date: string
          slots: number
          start_time: string
          status: string
          subscription_pass_id: string | null
          terms_accepted_at: string | null
          ttlock_keyboard_pwd_id: number | null
          ttlock_lock_id: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          balance_amount?: number | null
          balance_method?: string | null
          cancellation_charge?: number | null
          contact_name?: string | null
          contact_phone?: string | null
          coupon_code?: string | null
          coupon_discount?: number
          created_at?: string
          credit_used?: number | null
          credit_used_cashback?: number
          credit_used_manual?: number
          deposit_amount?: number
          deposit_receipt_url?: string | null
          deposit_status?: string
          door_code?: string | null
          end_time: string
          google_event_id?: string | null
          id?: string
          notes?: string | null
          overtime_charge?: number | null
          overtime_minutes?: number | null
          package?: string
          price: number
          recurring_series_id?: string | null
          reminder_4h_sent_at?: string | null
          reminder_hours_before?: number | null
          reminder_sent_at?: string | null
          reserved_items?: Json
          session_date: string
          slots: number
          start_time: string
          status?: string
          subscription_pass_id?: string | null
          terms_accepted_at?: string | null
          ttlock_keyboard_pwd_id?: number | null
          ttlock_lock_id?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          balance_amount?: number | null
          balance_method?: string | null
          cancellation_charge?: number | null
          contact_name?: string | null
          contact_phone?: string | null
          coupon_code?: string | null
          coupon_discount?: number
          created_at?: string
          credit_used?: number | null
          credit_used_cashback?: number
          credit_used_manual?: number
          deposit_amount?: number
          deposit_receipt_url?: string | null
          deposit_status?: string
          door_code?: string | null
          end_time?: string
          google_event_id?: string | null
          id?: string
          notes?: string | null
          overtime_charge?: number | null
          overtime_minutes?: number | null
          package?: string
          price?: number
          recurring_series_id?: string | null
          reminder_4h_sent_at?: string | null
          reminder_hours_before?: number | null
          reminder_sent_at?: string | null
          reserved_items?: Json
          session_date?: string
          slots?: number
          start_time?: string
          status?: string
          subscription_pass_id?: string | null
          terms_accepted_at?: string | null
          ttlock_keyboard_pwd_id?: number | null
          ttlock_lock_id?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bookings_subscription_pass_id_fkey"
            columns: ["subscription_pass_id"]
            isOneToOne: false
            referencedRelation: "subscription_passes"
            referencedColumns: ["id"]
          },
        ]
      }
      bot_knowledge_notes: {
        Row: {
          content: string
          created_at: string
          id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
        }
        Relationships: []
      }
      categories: {
        Row: {
          created_at: string
          id: string
          name: string
          slug: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          slug: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          slug?: string
          sort_order?: number
        }
        Relationships: []
      }
      coupons: {
        Row: {
          active: boolean
          code: string
          created_at: string
          discount_amount: number
          discount_percent: number
          expires_at: string | null
          id: string
          issued_to_email: string | null
          newsletter_default: boolean
          redeemed_at: string | null
          single_use: boolean
        }
        Insert: {
          active?: boolean
          code: string
          created_at?: string
          discount_amount?: number
          discount_percent?: number
          expires_at?: string | null
          id?: string
          issued_to_email?: string | null
          newsletter_default?: boolean
          redeemed_at?: string | null
          single_use?: boolean
        }
        Update: {
          active?: boolean
          code?: string
          created_at?: string
          discount_amount?: number
          discount_percent?: number
          expires_at?: string | null
          id?: string
          issued_to_email?: string | null
          newsletter_default?: boolean
          redeemed_at?: string | null
          single_use?: boolean
        }
        Relationships: []
      }
      customer_chat_logs: {
        Row: {
          created_at: string
          id: string
          messages: Json
          session_id: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          messages?: Json
          session_id: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          messages?: Json
          session_id?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      customer_loyalty: {
        Row: {
          can_book_recurring: boolean
          cashback_credit_balance: number
          cashback_expires_at: string | null
          cashback_percent: number
          credit_balance: number | null
          custom_hourly_rate: number | null
          manual_credit_balance: number
          updated_at: string
          user_id: string
        }
        Insert: {
          can_book_recurring?: boolean
          cashback_credit_balance?: number
          cashback_expires_at?: string | null
          cashback_percent?: number
          credit_balance?: number | null
          custom_hourly_rate?: number | null
          manual_credit_balance?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          can_book_recurring?: boolean
          cashback_credit_balance?: number
          cashback_expires_at?: string | null
          cashback_percent?: number
          credit_balance?: number | null
          custom_hourly_rate?: number | null
          manual_credit_balance?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      expenses: {
        Row: {
          amount: number
          category: string
          created_at: string
          id: string
          notes: string | null
          spent_on: string
          title: string
          updated_at: string
        }
        Insert: {
          amount?: number
          category?: string
          created_at?: string
          id?: string
          notes?: string | null
          spent_on?: string
          title: string
          updated_at?: string
        }
        Update: {
          amount?: number
          category?: string
          created_at?: string
          id?: string
          notes?: string | null
          spent_on?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      item_availability: {
        Row: {
          booking_id: string | null
          created_at: string
          date: string
          end_at: string | null
          end_date: string
          id: string
          item_id: string
          order_id: string | null
          slot_index: number
          start_at: string | null
          start_date: string
        }
        Insert: {
          booking_id?: string | null
          created_at?: string
          date: string
          end_at?: string | null
          end_date: string
          id?: string
          item_id: string
          order_id?: string | null
          slot_index?: number
          start_at?: string | null
          start_date: string
        }
        Update: {
          booking_id?: string | null
          created_at?: string
          date?: string
          end_at?: string | null
          end_date?: string
          id?: string
          item_id?: string
          order_id?: string | null
          slot_index?: number
          start_at?: string | null
          start_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "item_availability_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "item_availability_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "item_availability_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      item_inspiration_images: {
        Row: {
          caption: string | null
          created_at: string
          id: string
          sku: string
          sort_order: number
          source: string
          storage_path: string | null
          url: string
        }
        Insert: {
          caption?: string | null
          created_at?: string
          id?: string
          sku: string
          sort_order?: number
          source?: string
          storage_path?: string | null
          url: string
        }
        Update: {
          caption?: string | null
          created_at?: string
          id?: string
          sku?: string
          sort_order?: number
          source?: string
          storage_path?: string | null
          url?: string
        }
        Relationships: []
      }
      items: {
        Row: {
          active: boolean
          category_id: string | null
          created_at: string
          description: string | null
          id: string
          image_url: string | null
          name: string
          price: number
          sku: string
          sort_order: number
          stock_quantity: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          category_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          name: string
          price?: number
          sku: string
          sort_order?: number
          stock_quantity?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          category_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          name?: string
          price?: number
          sku?: string
          sort_order?: number
          stock_quantity?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "items_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          created_at: string
          email: string
          full_name: string
          id: string
          phone: string
          referral_source: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          email: string
          full_name: string
          id?: string
          phone: string
          referral_source: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          phone?: string
          referral_source?: string
          user_id?: string | null
        }
        Relationships: []
      }
      manual_income: {
        Row: {
          amount: number
          category: string
          created_at: string
          id: string
          notes: string | null
          received_on: string
          title: string
          updated_at: string
        }
        Insert: {
          amount: number
          category?: string
          created_at?: string
          id?: string
          notes?: string | null
          received_on?: string
          title: string
          updated_at?: string
        }
        Update: {
          amount?: number
          category?: string
          created_at?: string
          id?: string
          notes?: string | null
          received_on?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      newsletter_signups: {
        Row: {
          created_at: string
          email: string
          id: string
          source: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          source?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          source?: string | null
        }
        Relationships: []
      }
      order_items: {
        Row: {
          created_at: string
          id: string
          item_id: string | null
          item_name: string
          item_sku: string | null
          order_id: string
          price: number
          quantity: number
        }
        Insert: {
          created_at?: string
          id?: string
          item_id?: string | null
          item_name: string
          item_sku?: string | null
          order_id: string
          price?: number
          quantity?: number
        }
        Update: {
          created_at?: string
          id?: string
          item_id?: string | null
          item_name?: string
          item_sku?: string | null
          order_id?: string
          price?: number
          quantity?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_items_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          balance_amount: number | null
          balance_method: string | null
          camera_model: string | null
          cancellation_charge: number | null
          confirmation_sent_at: string | null
          contact_name: string | null
          contact_phone: string | null
          coupon_code: string | null
          coupon_discount: number
          created_at: string
          credit_used: number | null
          credit_used_cashback: number
          credit_used_manual: number
          deposit_amount: number | null
          deposit_receipt_url: string | null
          deposit_status: string | null
          door_code: string | null
          google_event_id: string | null
          id: string
          notes: string | null
          overtime_charge: number | null
          overtime_minutes: number | null
          pickup_at: string | null
          reminder_4h_sent_at: string | null
          reminder_hours_before: number | null
          reminder_sent_at: string | null
          return_at: string | null
          return_date: string | null
          scheduled_date: string | null
          session_date: string | null
          status: Database["public"]["Enums"]["order_status"]
          terms_accepted_at: string | null
          total: number
          track: string | null
          ttlock_keyboard_pwd_id: number | null
          ttlock_lock_id: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          balance_amount?: number | null
          balance_method?: string | null
          camera_model?: string | null
          cancellation_charge?: number | null
          confirmation_sent_at?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          coupon_code?: string | null
          coupon_discount?: number
          created_at?: string
          credit_used?: number | null
          credit_used_cashback?: number
          credit_used_manual?: number
          deposit_amount?: number | null
          deposit_receipt_url?: string | null
          deposit_status?: string | null
          door_code?: string | null
          google_event_id?: string | null
          id?: string
          notes?: string | null
          overtime_charge?: number | null
          overtime_minutes?: number | null
          pickup_at?: string | null
          reminder_4h_sent_at?: string | null
          reminder_hours_before?: number | null
          reminder_sent_at?: string | null
          return_at?: string | null
          return_date?: string | null
          scheduled_date?: string | null
          session_date?: string | null
          status?: Database["public"]["Enums"]["order_status"]
          terms_accepted_at?: string | null
          total?: number
          track?: string | null
          ttlock_keyboard_pwd_id?: number | null
          ttlock_lock_id?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          balance_amount?: number | null
          balance_method?: string | null
          camera_model?: string | null
          cancellation_charge?: number | null
          confirmation_sent_at?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          coupon_code?: string | null
          coupon_discount?: number
          created_at?: string
          credit_used?: number | null
          credit_used_cashback?: number
          credit_used_manual?: number
          deposit_amount?: number | null
          deposit_receipt_url?: string | null
          deposit_status?: string | null
          door_code?: string | null
          google_event_id?: string | null
          id?: string
          notes?: string | null
          overtime_charge?: number | null
          overtime_minutes?: number | null
          pickup_at?: string | null
          reminder_4h_sent_at?: string | null
          reminder_hours_before?: number | null
          reminder_sent_at?: string | null
          return_at?: string | null
          return_date?: string | null
          scheduled_date?: string | null
          session_date?: string | null
          status?: Database["public"]["Enums"]["order_status"]
          terms_accepted_at?: string | null
          total?: number
          track?: string | null
          ttlock_keyboard_pwd_id?: number | null
          ttlock_lock_id?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      page_images: {
        Row: {
          caption: string | null
          created_at: string
          hidden: boolean
          id: string
          page: string
          sort_order: number
          source: string
          storage_path: string | null
          url: string
        }
        Insert: {
          caption?: string | null
          created_at?: string
          hidden?: boolean
          id?: string
          page: string
          sort_order?: number
          source?: string
          storage_path?: string | null
          url: string
        }
        Update: {
          caption?: string | null
          created_at?: string
          hidden?: boolean
          id?: string
          page?: string
          sort_order?: number
          source?: string
          storage_path?: string | null
          url?: string
        }
        Relationships: []
      }
      pending_voice_notifications: {
        Row: {
          created_at: string
          message: string
          phone: string
        }
        Insert: {
          created_at?: string
          message: string
          phone: string
        }
        Update: {
          created_at?: string
          message?: string
          phone?: string
        }
        Relationships: []
      }
      photo_client_images: {
        Row: {
          created_at: string
          id: string
          image_url: string
          kind: string
          selected: boolean
          sort_order: number
          storage_path: string
          workflow_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          image_url: string
          kind: string
          selected?: boolean
          sort_order?: number
          storage_path: string
          workflow_id: string
        }
        Update: {
          created_at?: string
          id?: string
          image_url?: string
          kind?: string
          selected?: boolean
          sort_order?: number
          storage_path?: string
          workflow_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "photo_client_images_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "photo_client_workflows"
            referencedColumns: ["id"]
          },
        ]
      }
      photo_client_workflows: {
        Row: {
          album_upgrades: string | null
          amount_paid: number
          balance: number | null
          booking_id: string | null
          created_at: string
          has_package: boolean
          id: string
          location: string | null
          package_type: string | null
          photos_to_edit: number | null
          session_date: string | null
          session_time: string | null
          stage: string
          total_price: number | null
          updated_at: string
          user_id: string
          wants_editing: boolean | null
        }
        Insert: {
          album_upgrades?: string | null
          amount_paid?: number
          balance?: number | null
          booking_id?: string | null
          created_at?: string
          has_package?: boolean
          id?: string
          location?: string | null
          package_type?: string | null
          photos_to_edit?: number | null
          session_date?: string | null
          session_time?: string | null
          stage?: string
          total_price?: number | null
          updated_at?: string
          user_id: string
          wants_editing?: boolean | null
        }
        Update: {
          album_upgrades?: string | null
          amount_paid?: number
          balance?: number | null
          booking_id?: string | null
          created_at?: string
          has_package?: boolean
          id?: string
          location?: string | null
          package_type?: string | null
          photos_to_edit?: number | null
          session_date?: string | null
          session_time?: string | null
          stage?: string
          total_price?: number | null
          updated_at?: string
          user_id?: string
          wants_editing?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "photo_client_workflows_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      photo_edit_history: {
        Row: {
          admin_user_id: string | null
          created_at: string
          custom_instructions: string | null
          edited_url: string | null
          error_message: string | null
          id: string
          include_face: boolean
          intensity: string
          original_url: string
          status: string
          style: string
        }
        Insert: {
          admin_user_id?: string | null
          created_at?: string
          custom_instructions?: string | null
          edited_url?: string | null
          error_message?: string | null
          id?: string
          include_face?: boolean
          intensity?: string
          original_url: string
          status?: string
          style: string
        }
        Update: {
          admin_user_id?: string | null
          created_at?: string
          custom_instructions?: string | null
          edited_url?: string | null
          error_message?: string | null
          id?: string
          include_face?: boolean
          intensity?: string
          original_url?: string
          status?: string
          style?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          address: string | null
          city: string | null
          created_at: string
          discount_code: string | null
          full_name: string | null
          id: string
          notes: string | null
          phone: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          city?: string | null
          created_at?: string
          discount_code?: string | null
          full_name?: string | null
          id: string
          notes?: string | null
          phone?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          city?: string | null
          created_at?: string
          discount_code?: string | null
          full_name?: string | null
          id?: string
          notes?: string | null
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      site_bot_questions: {
        Row: {
          answer: string | null
          created_at: string
          created_by: string | null
          error: string | null
          id: string
          question: string
          sql_used: string | null
        }
        Insert: {
          answer?: string | null
          created_at?: string
          created_by?: string | null
          error?: string | null
          id?: string
          question: string
          sql_used?: string | null
        }
        Update: {
          answer?: string | null
          created_at?: string
          created_by?: string | null
          error?: string | null
          id?: string
          question?: string
          sql_used?: string | null
        }
        Relationships: []
      }
      site_bot_requests: {
        Row: {
          branch_name: string | null
          created_at: string
          created_by: string | null
          error: string | null
          id: string
          instruction: string
          merged_at: string | null
          messages: Json
          pr_number: number | null
          pr_url: string | null
          status: string
          summary: string | null
          target_path: string
        }
        Insert: {
          branch_name?: string | null
          created_at?: string
          created_by?: string | null
          error?: string | null
          id?: string
          instruction: string
          merged_at?: string | null
          messages?: Json
          pr_number?: number | null
          pr_url?: string | null
          status?: string
          summary?: string | null
          target_path: string
        }
        Update: {
          branch_name?: string | null
          created_at?: string
          created_by?: string | null
          error?: string | null
          id?: string
          instruction?: string
          merged_at?: string | null
          messages?: Json
          pr_number?: number | null
          pr_url?: string | null
          status?: string
          summary?: string | null
          target_path?: string
        }
        Relationships: []
      }
      studio_closures: {
        Row: {
          close_time: string | null
          closed: boolean
          created_at: string
          date: string
          id: string
          note: string | null
          open_time: string | null
        }
        Insert: {
          close_time?: string | null
          closed?: boolean
          created_at?: string
          date: string
          id?: string
          note?: string | null
          open_time?: string | null
        }
        Update: {
          close_time?: string | null
          closed?: boolean
          created_at?: string
          date?: string
          id?: string
          note?: string | null
          open_time?: string | null
        }
        Relationships: []
      }
      studio_intake_forms: {
        Row: {
          booking_id: string | null
          created_at: string
          id: string
          payload: Json
          user_id: string | null
        }
        Insert: {
          booking_id?: string | null
          created_at?: string
          id?: string
          payload: Json
          user_id?: string | null
        }
        Update: {
          booking_id?: string | null
          created_at?: string
          id?: string
          payload?: Json
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "studio_intake_forms_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_passes: {
        Row: {
          created_by: string | null
          entries_used: number
          id: string
          notes: string | null
          plan_id: string | null
          plan_name: string
          price_paid: number
          purchased_at: string
          status: string
          total_entries: number
          user_id: string
        }
        Insert: {
          created_by?: string | null
          entries_used?: number
          id?: string
          notes?: string | null
          plan_id?: string | null
          plan_name: string
          price_paid?: number
          purchased_at?: string
          status?: string
          total_entries: number
          user_id: string
        }
        Update: {
          created_by?: string | null
          entries_used?: number
          id?: string
          notes?: string | null
          plan_id?: string | null
          plan_name?: string
          price_paid?: number
          purchased_at?: string
          status?: string
          total_entries?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscription_passes_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "subscription_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_plans: {
        Row: {
          active: boolean
          created_at: string
          id: string
          name: string
          price: number
          total_entries: number
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          name: string
          price?: number
          total_entries: number
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          name?: string
          price?: number
          total_entries?: number
        }
        Relationships: []
      }
      subscription_requests: {
        Row: {
          created_at: string
          email: string | null
          full_name: string
          id: string
          notes: string | null
          phone: string
          plan: string
          status: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name: string
          id?: string
          notes?: string | null
          phone: string
          plan?: string
          status?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string
          id?: string
          notes?: string | null
          phone?: string
          plan?: string
          status?: string
          user_id?: string | null
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
      voice_bot_phrases: {
        Row: {
          key: string
          updated_at: string
          value: string
        }
        Insert: {
          key: string
          updated_at?: string
          value: string
        }
        Update: {
          key?: string
          updated_at?: string
          value?: string
        }
        Relationships: []
      }
      voice_call_sessions: {
        Row: {
          call_sid: string
          created_at: string
          draft_booking: Json | null
          from_number: string | null
          messages: Json
          stage: string
          updated_at: string
        }
        Insert: {
          call_sid: string
          created_at?: string
          draft_booking?: Json | null
          from_number?: string | null
          messages?: Json
          stage?: string
          updated_at?: string
        }
        Update: {
          call_sid?: string
          created_at?: string
          draft_booking?: Json | null
          from_number?: string | null
          messages?: Json
          stage?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      booking_busy_slots: {
        Row: {
          end_time: string | null
          session_date: string | null
          start_time: string | null
        }
        Insert: {
          end_time?: string | null
          session_date?: string | null
          start_time?: string | null
        }
        Update: {
          end_time?: string | null
          session_date?: string | null
          start_time?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      adjust_loyalty_credit: {
        Args: { p_delta: number; p_source?: string; p_user_id: string }
        Returns: {
          cashback_credit_balance: number
          credit_balance: number
          manual_credit_balance: number
        }[]
      }
      count_item_reservations: {
        Args: { _from: string; _item_id: string; _to: string }
        Returns: number
      }
      run_readonly_query: { Args: { q: string }; Returns: Json }
      spend_loyalty_credit: {
        Args: { p_amount: number; p_user_id: string }
        Returns: {
          spent_cashback: number
          spent_manual: number
        }[]
      }
    }
    Enums: {
      app_role: "admin" | "client"
      order_status:
        | "pending"
        | "confirmed"
        | "active"
        | "returned"
        | "cancelled"
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
      app_role: ["admin", "client"],
      order_status: ["pending", "confirmed", "active", "returned", "cancelled"],
    },
  },
} as const
