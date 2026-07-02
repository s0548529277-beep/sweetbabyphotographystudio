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
      bookings: {
        Row: {
          balance_amount: number | null
          balance_method: string | null
          cancellation_charge: number | null
          created_at: string
          deposit_amount: number
          deposit_receipt_url: string | null
          deposit_status: string
          end_time: string
          id: string
          notes: string | null
          overtime_charge: number | null
          overtime_minutes: number | null
          package: string
          price: number
          session_date: string
          slots: number
          start_time: string
          status: string
          terms_accepted_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          balance_amount?: number | null
          balance_method?: string | null
          cancellation_charge?: number | null
          created_at?: string
          deposit_amount?: number
          deposit_receipt_url?: string | null
          deposit_status?: string
          end_time: string
          id?: string
          notes?: string | null
          overtime_charge?: number | null
          overtime_minutes?: number | null
          package?: string
          price: number
          session_date: string
          slots: number
          start_time: string
          status?: string
          terms_accepted_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          balance_amount?: number | null
          balance_method?: string | null
          cancellation_charge?: number | null
          created_at?: string
          deposit_amount?: number
          deposit_receipt_url?: string | null
          deposit_status?: string
          end_time?: string
          id?: string
          notes?: string | null
          overtime_charge?: number | null
          overtime_minutes?: number | null
          package?: string
          price?: number
          session_date?: string
          slots?: number
          start_time?: string
          status?: string
          terms_accepted_at?: string | null
          updated_at?: string
          user_id?: string
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
      item_availability: {
        Row: {
          created_at: string
          date: string
          id: string
          item_id: string
          order_id: string | null
          slot_index: number
        }
        Insert: {
          created_at?: string
          date: string
          id?: string
          item_id: string
          order_id?: string | null
          slot_index?: number
        }
        Update: {
          created_at?: string
          date?: string
          id?: string
          item_id?: string
          order_id?: string | null
          slot_index?: number
        }
        Relationships: [
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
          contact_name: string | null
          contact_phone: string | null
          created_at: string
          deposit_amount: number | null
          deposit_receipt_url: string | null
          deposit_status: string | null
          id: string
          notes: string | null
          overtime_charge: number | null
          overtime_minutes: number | null
          return_date: string | null
          scheduled_date: string | null
          session_date: string | null
          status: Database["public"]["Enums"]["order_status"]
          terms_accepted_at: string | null
          total: number
          track: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          balance_amount?: number | null
          balance_method?: string | null
          camera_model?: string | null
          cancellation_charge?: number | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          deposit_amount?: number | null
          deposit_receipt_url?: string | null
          deposit_status?: string | null
          id?: string
          notes?: string | null
          overtime_charge?: number | null
          overtime_minutes?: number | null
          return_date?: string | null
          scheduled_date?: string | null
          session_date?: string | null
          status?: Database["public"]["Enums"]["order_status"]
          terms_accepted_at?: string | null
          total?: number
          track?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          balance_amount?: number | null
          balance_method?: string | null
          camera_model?: string | null
          cancellation_charge?: number | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          deposit_amount?: number | null
          deposit_receipt_url?: string | null
          deposit_status?: string | null
          id?: string
          notes?: string | null
          overtime_charge?: number | null
          overtime_minutes?: number | null
          return_date?: string | null
          scheduled_date?: string | null
          session_date?: string | null
          status?: Database["public"]["Enums"]["order_status"]
          terms_accepted_at?: string | null
          total?: number
          track?: string | null
          updated_at?: string
          user_id?: string
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
      [_ in never]: never
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
