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
      album_examples: {
        Row: {
          category: string | null
          created_at: string
          id: string
          note: string | null
          sort_order: number
          title: string
          url: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          id?: string
          note?: string | null
          sort_order?: number
          title: string
          url: string
        }
        Update: {
          category?: string | null
          created_at?: string
          id?: string
          note?: string | null
          sort_order?: number
          title?: string
          url?: string
        }
        Relationships: []
      }
      album_orders: {
        Row: {
          admin_notes: string | null
          contact_email: string | null
          contact_name: string | null
          contact_phone: string | null
          created_at: string
          customer_notes: string | null
          design_json: Json
          id: string
          newborn_order_id: string | null
          pages: number
          price: number
          shape_id: string | null
          size_id: string | null
          status: string
          summary: string | null
          template_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          admin_notes?: string | null
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          customer_notes?: string | null
          design_json: Json
          id?: string
          newborn_order_id?: string | null
          pages: number
          price?: number
          shape_id?: string | null
          size_id?: string | null
          status?: string
          summary?: string | null
          template_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          admin_notes?: string | null
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          customer_notes?: string | null
          design_json?: Json
          id?: string
          newborn_order_id?: string | null
          pages?: number
          price?: number
          shape_id?: string | null
          size_id?: string | null
          status?: string
          summary?: string | null
          template_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "album_orders_newborn_order_id_fkey"
            columns: ["newborn_order_id"]
            isOneToOne: false
            referencedRelation: "newborn_package_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "album_orders_shape_id_fkey"
            columns: ["shape_id"]
            isOneToOne: false
            referencedRelation: "album_shapes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "album_orders_size_id_fkey"
            columns: ["size_id"]
            isOneToOne: false
            referencedRelation: "album_sizes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "album_orders_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "album_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      album_shapes: {
        Row: {
          id: string
          is_active: boolean
          name_en: string
          name_he: string
          slug: string
          sort_order: number
        }
        Insert: {
          id?: string
          is_active?: boolean
          name_en: string
          name_he: string
          slug: string
          sort_order?: number
        }
        Update: {
          id?: string
          is_active?: boolean
          name_en?: string
          name_he?: string
          slug?: string
          sort_order?: number
        }
        Relationships: []
      }
      album_sizes: {
        Row: {
          base_price: number
          height_cm: number
          id: string
          is_active: boolean
          label_he: string
          max_pages: number
          min_pages: number
          price_per_extra_page: number
          shape_id: string
          sort_order: number
          width_cm: number
        }
        Insert: {
          base_price?: number
          height_cm: number
          id?: string
          is_active?: boolean
          label_he: string
          max_pages?: number
          min_pages?: number
          price_per_extra_page?: number
          shape_id: string
          sort_order?: number
          width_cm: number
        }
        Update: {
          base_price?: number
          height_cm?: number
          id?: string
          is_active?: boolean
          label_he?: string
          max_pages?: number
          min_pages?: number
          price_per_extra_page?: number
          shape_id?: string
          sort_order?: number
          width_cm?: number
        }
        Relationships: [
          {
            foreignKeyName: "album_sizes_shape_id_fkey"
            columns: ["shape_id"]
            isOneToOne: false
            referencedRelation: "album_shapes"
            referencedColumns: ["id"]
          },
        ]
      }
      album_templates: {
        Row: {
          category: string | null
          created_at: string
          id: string
          is_active: boolean
          max_pages: number | null
          min_pages: number | null
          name: string
          shape_id: string
          sort_order: number
          template_data: Json
          thumbnail_url: string | null
          updated_at: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          max_pages?: number | null
          min_pages?: number | null
          name: string
          shape_id: string
          sort_order?: number
          template_data: Json
          thumbnail_url?: string | null
          updated_at?: string
        }
        Update: {
          category?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          max_pages?: number | null
          min_pages?: number | null
          name?: string
          shape_id?: string
          sort_order?: number
          template_data?: Json
          thumbnail_url?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "album_templates_shape_id_fkey"
            columns: ["shape_id"]
            isOneToOne: false
            referencedRelation: "album_shapes"
            referencedColumns: ["id"]
          },
        ]
      }
      analytics_events: {
        Row: {
          created_at: string
          id: string
          path: string
          session_id: string
          type: string
        }
        Insert: {
          created_at?: string
          id?: string
          path: string
          session_id: string
          type: string
        }
        Update: {
          created_at?: string
          id?: string
          path?: string
          session_id?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "analytics_events_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "analytics_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      analytics_sessions: {
        Row: {
          created_at: string
          entry_path: string | null
          first_seen: string
          id: string
          last_seen: string
          referrer: string | null
          source: string
          user_agent: string | null
        }
        Insert: {
          created_at?: string
          entry_path?: string | null
          first_seen?: string
          id: string
          last_seen?: string
          referrer?: string | null
          source?: string
          user_agent?: string | null
        }
        Update: {
          created_at?: string
          entry_path?: string | null
          first_seen?: string
          id?: string
          last_seen?: string
          referrer?: string | null
          source?: string
          user_agent?: string | null
        }
        Relationships: []
      }
      app_settings: {
        Row: {
          key: string
          updated_at: string
          updated_by: string | null
          value: string | null
        }
        Insert: {
          key: string
          updated_at?: string
          updated_by?: string | null
          value?: string | null
        }
        Update: {
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: string | null
        }
        Relationships: []
      }
      bookings: {
        Row: {
          abandoned_hold_reminder_sent_at: string | null
          balance_amount: number | null
          balance_method: string | null
          balance_paid: boolean
          cancellation_charge: number | null
          cashback_awarded: number
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
          wheel_prize: string | null
          wheel_prize_won_at: string | null
        }
        Insert: {
          abandoned_hold_reminder_sent_at?: string | null
          balance_amount?: number | null
          balance_method?: string | null
          balance_paid?: boolean
          cancellation_charge?: number | null
          cashback_awarded?: number
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
          wheel_prize?: string | null
          wheel_prize_won_at?: string | null
        }
        Update: {
          abandoned_hold_reminder_sent_at?: string | null
          balance_amount?: number | null
          balance_method?: string | null
          balance_paid?: boolean
          cancellation_charge?: number | null
          cashback_awarded?: number
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
          wheel_prize?: string | null
          wheel_prize_won_at?: string | null
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
      cm_clients: {
        Row: {
          baby_name: string | null
          birth_date: string | null
          created_at: string
          email: string | null
          full_name: string
          id: string
          notes: string | null
          phone: string | null
          source: string | null
          updated_at: string
        }
        Insert: {
          baby_name?: string | null
          birth_date?: string | null
          created_at?: string
          email?: string | null
          full_name: string
          id?: string
          notes?: string | null
          phone?: string | null
          source?: string | null
          updated_at?: string
        }
        Update: {
          baby_name?: string | null
          birth_date?: string | null
          created_at?: string
          email?: string | null
          full_name?: string
          id?: string
          notes?: string | null
          phone?: string | null
          source?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      cm_payment_accounts: {
        Row: {
          client_id: string
          created_at: string
          due_date: string | null
          id: string
          notes: string | null
          paid_amount: number
          session_id: string | null
          title: string
          total_amount: number
          updated_at: string
        }
        Insert: {
          client_id: string
          created_at?: string
          due_date?: string | null
          id?: string
          notes?: string | null
          paid_amount?: number
          session_id?: string | null
          title?: string
          total_amount?: number
          updated_at?: string
        }
        Update: {
          client_id?: string
          created_at?: string
          due_date?: string | null
          id?: string
          notes?: string | null
          paid_amount?: number
          session_id?: string | null
          title?: string
          total_amount?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cm_payment_accounts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "cm_clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cm_payment_accounts_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "cm_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      cm_sessions: {
        Row: {
          client_id: string
          created_at: string
          id: string
          notes: string | null
          part_label: string | null
          reminder_sent_at: string | null
          session_date: string
          session_type: string
          start_time: string
          status: string
          time_slot: string | null
          updated_at: string
        }
        Insert: {
          client_id: string
          created_at?: string
          id?: string
          notes?: string | null
          part_label?: string | null
          reminder_sent_at?: string | null
          session_date: string
          session_type?: string
          start_time?: string
          status?: string
          time_slot?: string | null
          updated_at?: string
        }
        Update: {
          client_id?: string
          created_at?: string
          id?: string
          notes?: string | null
          part_label?: string | null
          reminder_sent_at?: string | null
          session_date?: string
          session_type?: string
          start_time?: string
          status?: string
          time_slot?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cm_sessions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "cm_clients"
            referencedColumns: ["id"]
          },
        ]
      }
      collage_creations: {
        Row: {
          caption: string | null
          created_at: string
          format_id: string | null
          id: string
          photo_count: number | null
          session_id: string | null
          size_id: string | null
          storage_path: string
          style_id: string | null
          subtitle: string | null
        }
        Insert: {
          caption?: string | null
          created_at?: string
          format_id?: string | null
          id?: string
          photo_count?: number | null
          session_id?: string | null
          size_id?: string | null
          storage_path: string
          style_id?: string | null
          subtitle?: string | null
        }
        Update: {
          caption?: string | null
          created_at?: string
          format_id?: string | null
          id?: string
          photo_count?: number | null
          session_id?: string | null
          size_id?: string | null
          storage_path?: string
          style_id?: string | null
          subtitle?: string | null
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
          fixed_discount_percent: number
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
          fixed_discount_percent?: number
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
          fixed_discount_percent?: number
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
          due_date: string | null
          id: string
          is_paid: boolean
          is_personal: boolean
          notes: string | null
          spent_on: string
          title: string
          updated_at: string
          vendor_email: string | null
          vendor_name: string | null
          vendor_phone: string | null
        }
        Insert: {
          amount?: number
          category?: string
          created_at?: string
          due_date?: string | null
          id?: string
          is_paid?: boolean
          is_personal?: boolean
          notes?: string | null
          spent_on?: string
          title: string
          updated_at?: string
          vendor_email?: string | null
          vendor_name?: string | null
          vendor_phone?: string | null
        }
        Update: {
          amount?: number
          category?: string
          created_at?: string
          due_date?: string | null
          id?: string
          is_paid?: boolean
          is_personal?: boolean
          notes?: string | null
          spent_on?: string
          title?: string
          updated_at?: string
          vendor_email?: string | null
          vendor_name?: string | null
          vendor_phone?: string | null
        }
        Relationships: []
      }
      inquiry_leads: {
        Row: {
          created_at: string
          email: string | null
          first_contact_at: string
          follow_up_sent_at: string | null
          gmail_thread_id: string | null
          id: string
          last_contact_at: string | null
          message: string | null
          name: string | null
          notes: string | null
          phone: string | null
          referred_to_shulamit: boolean
          source: string
          status: string
          topic: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          first_contact_at?: string
          follow_up_sent_at?: string | null
          gmail_thread_id?: string | null
          id?: string
          last_contact_at?: string | null
          message?: string | null
          name?: string | null
          notes?: string | null
          phone?: string | null
          referred_to_shulamit?: boolean
          source?: string
          status?: string
          topic?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          first_contact_at?: string
          follow_up_sent_at?: string | null
          gmail_thread_id?: string | null
          id?: string
          last_contact_at?: string | null
          message?: string | null
          name?: string | null
          notes?: string | null
          phone?: string | null
          referred_to_shulamit?: boolean
          source?: string
          status?: string
          topic?: string
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
          image_hash: string | null
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
          image_hash?: string | null
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
          image_hash?: string | null
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
          is_personal: boolean
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
          is_personal?: boolean
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
          is_personal?: boolean
          notes?: string | null
          received_on?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      newborn_order_images: {
        Row: {
          client_note: string | null
          created_at: string
          file_name: string | null
          id: string
          image_url: string
          kind: string
          order_id: string
          original_image_url: string | null
          original_storage_path: string | null
          selected: boolean
          sort_order: number
          storage_path: string | null
          watermarked: boolean
        }
        Insert: {
          client_note?: string | null
          created_at?: string
          file_name?: string | null
          id?: string
          image_url: string
          kind: string
          order_id: string
          original_image_url?: string | null
          original_storage_path?: string | null
          selected?: boolean
          sort_order?: number
          storage_path?: string | null
          watermarked?: boolean
        }
        Update: {
          client_note?: string | null
          created_at?: string
          file_name?: string | null
          id?: string
          image_url?: string
          kind?: string
          order_id?: string
          original_image_url?: string | null
          original_storage_path?: string | null
          selected?: boolean
          sort_order?: number
          storage_path?: string | null
          watermarked?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "newborn_order_images_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "newborn_package_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      newborn_package_orders: {
        Row: {
          access_token: string | null
          addons: Json
          addons_price: number
          album_birth_date: string | null
          album_birth_time: string | null
          album_birth_weight: string | null
          album_caption_language: string | null
          album_child_name: string | null
          album_design_done_at: string | null
          album_details_submitted_at: string | null
          album_hospital: string | null
          album_notes: string | null
          all_photos_unlocked: boolean
          amount_paid: number
          base_price: number
          birth_basket_used: boolean
          blocking_booking_id: string | null
          client_step: number
          client_viewed_at: string | null
          contact_email: string | null
          contact_name: string
          contact_phone: string
          contract_answers: Json | null
          contract_confirmed_at: string | null
          contract_sent_at: string | null
          created_at: string
          date_deposit_at: string | null
          delivered_at: string | null
          drive_folder_url: string | null
          drive_synced_at: string | null
          edited_zip_downloads: number
          editing_done_at: string | null
          extra_photos_count: number
          gallery_opened_at: string | null
          gallery_sent_at: string | null
          google_event_id: string | null
          guided_selection_enabled: boolean
          id: string
          last_payment_at: string | null
          max_proof_selections: number | null
          notes: string | null
          package_id: string
          payment_done_at: string | null
          photos_sent_at: string | null
          printing_done_at: string | null
          production_step: number
          proofs_selected_at: string | null
          proofs_zip_downloads: number
          reminder_sent_at: string | null
          session_date: string | null
          session_time: string | null
          shoot_done_at: string | null
          total_price: number
          unlock_receipt_path: string | null
          unlock_receipt_submitted_at: string | null
          view_nudge_sent_at: string | null
        }
        Insert: {
          access_token?: string | null
          addons?: Json
          addons_price?: number
          album_birth_date?: string | null
          album_birth_time?: string | null
          album_birth_weight?: string | null
          album_caption_language?: string | null
          album_child_name?: string | null
          album_design_done_at?: string | null
          album_details_submitted_at?: string | null
          album_hospital?: string | null
          album_notes?: string | null
          all_photos_unlocked?: boolean
          amount_paid?: number
          base_price?: number
          birth_basket_used?: boolean
          blocking_booking_id?: string | null
          client_step?: number
          client_viewed_at?: string | null
          contact_email?: string | null
          contact_name: string
          contact_phone: string
          contract_answers?: Json | null
          contract_confirmed_at?: string | null
          contract_sent_at?: string | null
          created_at?: string
          date_deposit_at?: string | null
          delivered_at?: string | null
          drive_folder_url?: string | null
          drive_synced_at?: string | null
          edited_zip_downloads?: number
          editing_done_at?: string | null
          extra_photos_count?: number
          gallery_opened_at?: string | null
          gallery_sent_at?: string | null
          google_event_id?: string | null
          guided_selection_enabled?: boolean
          id?: string
          last_payment_at?: string | null
          max_proof_selections?: number | null
          notes?: string | null
          package_id: string
          payment_done_at?: string | null
          photos_sent_at?: string | null
          printing_done_at?: string | null
          production_step?: number
          proofs_selected_at?: string | null
          proofs_zip_downloads?: number
          reminder_sent_at?: string | null
          session_date?: string | null
          session_time?: string | null
          shoot_done_at?: string | null
          total_price?: number
          unlock_receipt_path?: string | null
          unlock_receipt_submitted_at?: string | null
          view_nudge_sent_at?: string | null
        }
        Update: {
          access_token?: string | null
          addons?: Json
          addons_price?: number
          album_birth_date?: string | null
          album_birth_time?: string | null
          album_birth_weight?: string | null
          album_caption_language?: string | null
          album_child_name?: string | null
          album_design_done_at?: string | null
          album_details_submitted_at?: string | null
          album_hospital?: string | null
          album_notes?: string | null
          all_photos_unlocked?: boolean
          amount_paid?: number
          base_price?: number
          birth_basket_used?: boolean
          blocking_booking_id?: string | null
          client_step?: number
          client_viewed_at?: string | null
          contact_email?: string | null
          contact_name?: string
          contact_phone?: string
          contract_answers?: Json | null
          contract_confirmed_at?: string | null
          contract_sent_at?: string | null
          created_at?: string
          date_deposit_at?: string | null
          delivered_at?: string | null
          drive_folder_url?: string | null
          drive_synced_at?: string | null
          edited_zip_downloads?: number
          editing_done_at?: string | null
          extra_photos_count?: number
          gallery_opened_at?: string | null
          gallery_sent_at?: string | null
          google_event_id?: string | null
          guided_selection_enabled?: boolean
          id?: string
          last_payment_at?: string | null
          max_proof_selections?: number | null
          notes?: string | null
          package_id?: string
          payment_done_at?: string | null
          photos_sent_at?: string | null
          printing_done_at?: string | null
          production_step?: number
          proofs_selected_at?: string | null
          proofs_zip_downloads?: number
          reminder_sent_at?: string | null
          session_date?: string | null
          session_time?: string | null
          shoot_done_at?: string | null
          total_price?: number
          unlock_receipt_path?: string | null
          unlock_receipt_submitted_at?: string | null
          view_nudge_sent_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "newborn_package_orders_blocking_booking_id_fkey"
            columns: ["blocking_booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      newborn_package_types: {
        Row: {
          active: boolean
          created_at: string
          description: string
          id: string
          name: string
          price: number
          sort_order: number
        }
        Insert: {
          active?: boolean
          created_at?: string
          description?: string
          id?: string
          name: string
          price?: number
          sort_order?: number
        }
        Update: {
          active?: boolean
          created_at?: string
          description?: string
          id?: string
          name?: string
          price?: number
          sort_order?: number
        }
        Relationships: []
      }
      newsletter_signups: {
        Row: {
          created_at: string
          email: string
          id: string
          source: string | null
          wheel_coupon_code: string | null
          wheel_prize_sequence: Json | null
          wheel_spun_at: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          source?: string | null
          wheel_coupon_code?: string | null
          wheel_prize_sequence?: Json | null
          wheel_spun_at?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          source?: string | null
          wheel_coupon_code?: string | null
          wheel_prize_sequence?: Json | null
          wheel_spun_at?: string | null
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
          cashback_awarded: number
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
          cashback_awarded?: number
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
          cashback_awarded?: number
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
      outdoor_package_orders: {
        Row: {
          children_count: number | null
          children_names: string | null
          contact_email: string | null
          contact_name: string
          contact_phone: string
          contract_answers: Json | null
          contract_confirmed_at: string | null
          contract_sent_at: string | null
          contract_token: string | null
          created_at: string
          deposit_paid: boolean
          id: string
          notes: string | null
          package_description: string | null
          package_name: string | null
          package_type_id: string | null
          session_date: string | null
          session_time: string | null
          styling_call_date: string | null
          styling_call_reminder_sent_at: string | null
          total_price: number | null
        }
        Insert: {
          children_count?: number | null
          children_names?: string | null
          contact_email?: string | null
          contact_name: string
          contact_phone: string
          contract_answers?: Json | null
          contract_confirmed_at?: string | null
          contract_sent_at?: string | null
          contract_token?: string | null
          created_at?: string
          deposit_paid?: boolean
          id?: string
          notes?: string | null
          package_description?: string | null
          package_name?: string | null
          package_type_id?: string | null
          session_date?: string | null
          session_time?: string | null
          styling_call_date?: string | null
          styling_call_reminder_sent_at?: string | null
          total_price?: number | null
        }
        Update: {
          children_count?: number | null
          children_names?: string | null
          contact_email?: string | null
          contact_name?: string
          contact_phone?: string
          contract_answers?: Json | null
          contract_confirmed_at?: string | null
          contract_sent_at?: string | null
          contract_token?: string | null
          created_at?: string
          deposit_paid?: boolean
          id?: string
          notes?: string | null
          package_description?: string | null
          package_name?: string | null
          package_type_id?: string | null
          session_date?: string | null
          session_time?: string | null
          styling_call_date?: string | null
          styling_call_reminder_sent_at?: string | null
          total_price?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "outdoor_package_orders_package_type_id_fkey"
            columns: ["package_type_id"]
            isOneToOne: false
            referencedRelation: "outdoor_package_types"
            referencedColumns: ["id"]
          },
        ]
      }
      outdoor_package_types: {
        Row: {
          active: boolean
          created_at: string
          description: string
          id: string
          name: string
          price: number
          sort_order: number
        }
        Insert: {
          active?: boolean
          created_at?: string
          description?: string
          id?: string
          name: string
          price?: number
          sort_order?: number
        }
        Update: {
          active?: boolean
          created_at?: string
          description?: string
          id?: string
          name?: string
          price?: number
          sort_order?: number
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
          original_image_url: string | null
          original_storage_path: string | null
          selected: boolean
          sort_order: number
          storage_path: string
          watermarked: boolean
          workflow_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          image_url: string
          kind: string
          original_image_url?: string | null
          original_storage_path?: string | null
          selected?: boolean
          sort_order?: number
          storage_path: string
          watermarked?: boolean
          workflow_id: string
        }
        Update: {
          created_at?: string
          id?: string
          image_url?: string
          kind?: string
          original_image_url?: string | null
          original_storage_path?: string | null
          selected?: boolean
          sort_order?: number
          storage_path?: string
          watermarked?: boolean
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
          all_photos_unlocked: boolean
          amount_paid: number
          balance: number | null
          booking_id: string | null
          client_step: number
          contract_answers: Json | null
          contract_confirmed_at: string | null
          contract_sent_at: string | null
          contract_token: string | null
          created_at: string
          drive_folder_url: string | null
          drive_synced_at: string | null
          guided_selection_enabled: boolean
          has_package: boolean
          id: string
          location: string | null
          max_proof_selections: number | null
          package_type: string | null
          photos_to_edit: number | null
          production_step: number
          proof_reminder_sent_at: string | null
          proof_selection_submitted_at: string | null
          session_date: string | null
          session_time: string | null
          stage: string
          total_price: number | null
          unlock_receipt_path: string | null
          unlock_receipt_submitted_at: string | null
          updated_at: string
          user_id: string
          wants_editing: boolean | null
        }
        Insert: {
          album_upgrades?: string | null
          all_photos_unlocked?: boolean
          amount_paid?: number
          balance?: number | null
          booking_id?: string | null
          client_step?: number
          contract_answers?: Json | null
          contract_confirmed_at?: string | null
          contract_sent_at?: string | null
          contract_token?: string | null
          created_at?: string
          drive_folder_url?: string | null
          drive_synced_at?: string | null
          guided_selection_enabled?: boolean
          has_package?: boolean
          id?: string
          location?: string | null
          max_proof_selections?: number | null
          package_type?: string | null
          photos_to_edit?: number | null
          production_step?: number
          proof_reminder_sent_at?: string | null
          proof_selection_submitted_at?: string | null
          session_date?: string | null
          session_time?: string | null
          stage?: string
          total_price?: number | null
          unlock_receipt_path?: string | null
          unlock_receipt_submitted_at?: string | null
          updated_at?: string
          user_id: string
          wants_editing?: boolean | null
        }
        Update: {
          album_upgrades?: string | null
          all_photos_unlocked?: boolean
          amount_paid?: number
          balance?: number | null
          booking_id?: string | null
          client_step?: number
          contract_answers?: Json | null
          contract_confirmed_at?: string | null
          contract_sent_at?: string | null
          contract_token?: string | null
          created_at?: string
          drive_folder_url?: string | null
          drive_synced_at?: string | null
          guided_selection_enabled?: boolean
          has_package?: boolean
          id?: string
          location?: string | null
          max_proof_selections?: number | null
          package_type?: string | null
          photos_to_edit?: number | null
          production_step?: number
          proof_reminder_sent_at?: string | null
          proof_selection_submitted_at?: string | null
          session_date?: string | null
          session_time?: string | null
          stage?: string
          total_price?: number | null
          unlock_receipt_path?: string | null
          unlock_receipt_submitted_at?: string | null
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
      recurring_expenses: {
        Row: {
          active: boolean
          amount: number
          category: string
          created_at: string
          day_of_month: number
          id: string
          is_personal: boolean
          last_generated_month: string | null
          title: string
        }
        Insert: {
          active?: boolean
          amount: number
          category?: string
          created_at?: string
          day_of_month?: number
          id?: string
          is_personal?: boolean
          last_generated_month?: string | null
          title: string
        }
        Update: {
          active?: boolean
          amount?: number
          category?: string
          created_at?: string
          day_of_month?: number
          id?: string
          is_personal?: boolean
          last_generated_month?: string | null
          title?: string
        }
        Relationships: []
      }
      retouch_allowed_clients: {
        Row: {
          created_at: string
          email: string
          granted_by: string | null
        }
        Insert: {
          created_at?: string
          email: string
          granted_by?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          granted_by?: string | null
        }
        Relationships: []
      }
      retouch_presets: {
        Row: {
          after_path: string
          after_url: string
          before_path: string
          before_url: string
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          prompt: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          after_path: string
          after_url: string
          before_path: string
          before_url: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          prompt: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          after_path?: string
          after_url?: string
          before_path?: string
          before_url?: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          prompt?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      retouch_usage_log: {
        Row: {
          created_at: string
          error: string | null
          id: string
          preset_id: string | null
          session_id: string
          success: boolean
          user_id: string | null
        }
        Insert: {
          created_at?: string
          error?: string | null
          id?: string
          preset_id?: string | null
          session_id: string
          success: boolean
          user_id?: string | null
        }
        Update: {
          created_at?: string
          error?: string | null
          id?: string
          preset_id?: string | null
          session_id?: string
          success?: boolean
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "retouch_usage_log_preset_id_fkey"
            columns: ["preset_id"]
            isOneToOne: false
            referencedRelation: "retouch_presets"
            referencedColumns: ["id"]
          },
        ]
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
      site_texts: {
        Row: {
          new_text: string
          original_text: string
          updated_at: string
        }
        Insert: {
          new_text: string
          original_text: string
          updated_at?: string
        }
        Update: {
          new_text?: string
          original_text?: string
          updated_at?: string
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
      subscription_pass_adjustments: {
        Row: {
          created_at: string
          created_by: string | null
          delta: number
          id: string
          note: string
          pass_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          delta: number
          id?: string
          note: string
          pass_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          delta?: number
          id?: string
          note?: string
          pass_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscription_pass_adjustments_pass_id_fkey"
            columns: ["pass_id"]
            isOneToOne: false
            referencedRelation: "subscription_passes"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_passes: {
        Row: {
          approval_nudge_count: number
          approval_nudge_sent_at: string | null
          approved_at: string | null
          created_by: string | null
          entries_used: number
          expires_at: string
          id: string
          notes: string | null
          plan_id: string | null
          plan_name: string
          price_paid: number
          purchase_source: string
          purchased_at: string
          status: string
          total_entries: number
          user_id: string
        }
        Insert: {
          approval_nudge_count?: number
          approval_nudge_sent_at?: string | null
          approved_at?: string | null
          created_by?: string | null
          entries_used?: number
          expires_at: string
          id?: string
          notes?: string | null
          plan_id?: string | null
          plan_name: string
          price_paid?: number
          purchase_source?: string
          purchased_at?: string
          status?: string
          total_entries: number
          user_id: string
        }
        Update: {
          approval_nudge_count?: number
          approval_nudge_sent_at?: string | null
          approved_at?: string | null
          created_by?: string | null
          entries_used?: number
          expires_at?: string
          id?: string
          notes?: string | null
          plan_id?: string | null
          plan_name?: string
          price_paid?: number
          purchase_source?: string
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
          validity_months: number
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          name: string
          price?: number
          total_entries: number
          validity_months?: number
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          name?: string
          price?: number
          total_entries?: number
          validity_months?: number
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
      waitlist_entries: {
        Row: {
          created_at: string
          email: string | null
          full_name: string
          id: string
          notes: string | null
          notified_at: string | null
          phone: string
          session_date: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name: string
          id?: string
          notes?: string | null
          notified_at?: string | null
          phone: string
          session_date: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string
          id?: string
          notes?: string | null
          notified_at?: string | null
          phone?: string
          session_date?: string
          user_id?: string | null
        }
        Relationships: []
      }
      whatsapp_bot_sessions: {
        Row: {
          handoff_requested_at: string | null
          messages: Json
          phone: string
          updated_at: string
        }
        Insert: {
          handoff_requested_at?: string | null
          messages?: Json
          phone: string
          updated_at?: string
        }
        Update: {
          handoff_requested_at?: string | null
          messages?: Json
          phone?: string
          updated_at?: string
        }
        Relationships: []
      }
      whatsapp_messages: {
        Row: {
          body: string | null
          business_phone: string | null
          contact_name: string | null
          created_at: string
          direction: string
          error: string | null
          id: string
          media_type: string | null
          media_url: string | null
          phone: string
          status: string
          wa_message_id: string | null
        }
        Insert: {
          body?: string | null
          business_phone?: string | null
          contact_name?: string | null
          created_at?: string
          direction: string
          error?: string | null
          id?: string
          media_type?: string | null
          media_url?: string | null
          phone: string
          status?: string
          wa_message_id?: string | null
        }
        Update: {
          body?: string | null
          business_phone?: string | null
          contact_name?: string | null
          created_at?: string
          direction?: string
          error?: string | null
          id?: string
          media_type?: string | null
          media_url?: string | null
          phone?: string
          status?: string
          wa_message_id?: string | null
        }
        Relationships: []
      }
      whatsapp_webhook_events: {
        Row: {
          delivery_id: string
          event: string
          id: string
          payload: Json
          processed_at: string | null
          processing_error: string | null
          received_at: string
        }
        Insert: {
          delivery_id: string
          event: string
          id?: string
          payload: Json
          processed_at?: string | null
          processing_error?: string | null
          received_at?: string
        }
        Update: {
          delivery_id?: string
          event?: string
          id?: string
          payload?: Json
          processed_at?: string | null
          processing_error?: string | null
          received_at?: string
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
      adjust_subscription_pass_entries: {
        Args: { p_delta: number; p_pass_id: string }
        Returns: number
      }
      count_item_reservations: {
        Args: { _from: string; _item_id: string; _to: string }
        Returns: number
      }
      redeem_subscription_pass_entry: {
        Args: { p_pass_id: string; p_session_date: string }
        Returns: boolean
      }
      reload_pgrst_schema: { Args: never; Returns: undefined }
      run_readonly_query: { Args: { q: string }; Returns: Json }
      spend_loyalty_credit: {
        Args: { p_amount: number; p_user_id: string }
        Returns: {
          spent_cashback: number
          spent_manual: number
        }[]
      }
      upsert_lead_from_assistant: {
        Args: { p: Json; p_token: string }
        Returns: string
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
      app_role: ["admin", "client"],
      order_status: ["pending", "confirmed", "active", "returned", "cancelled"],
    },
  },
} as const
