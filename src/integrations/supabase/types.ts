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
      corporate_quote_requests: {
        Row: {
          additional_requirements: string | null
          company_name: string
          created_at: string
          customer_name: string
          delivery_location: string
          id: string
          logo_filename: string | null
          logo_flip_horizontal: boolean
          logo_flip_vertical: boolean
          logo_position_x: number | null
          logo_position_y: number | null
          logo_rotation: number | null
          logo_scale: number | null
          logo_storage_path: string | null
          phone: string
          preview_image_path: string | null
          printing_method: string | null
          product_id: string
          product_name: string
          product_variant: string | null
          quantity: number
          required_delivery_date: string | null
          status: string
          updated_at: string
          work_email: string
        }
        Insert: {
          additional_requirements?: string | null
          company_name: string
          created_at?: string
          customer_name: string
          delivery_location: string
          id?: string
          logo_filename?: string | null
          logo_flip_horizontal?: boolean
          logo_flip_vertical?: boolean
          logo_position_x?: number | null
          logo_position_y?: number | null
          logo_rotation?: number | null
          logo_scale?: number | null
          logo_storage_path?: string | null
          phone: string
          preview_image_path?: string | null
          printing_method?: string | null
          product_id: string
          product_name: string
          product_variant?: string | null
          quantity: number
          required_delivery_date?: string | null
          status?: string
          updated_at?: string
          work_email: string
        }
        Update: {
          additional_requirements?: string | null
          company_name?: string
          created_at?: string
          customer_name?: string
          delivery_location?: string
          id?: string
          logo_filename?: string | null
          logo_flip_horizontal?: boolean
          logo_flip_vertical?: boolean
          logo_position_x?: number | null
          logo_position_y?: number | null
          logo_rotation?: number | null
          logo_scale?: number | null
          logo_storage_path?: string | null
          phone?: string
          preview_image_path?: string | null
          printing_method?: string | null
          product_id?: string
          product_name?: string
          product_variant?: string | null
          quantity?: number
          required_delivery_date?: string | null
          status?: string
          updated_at?: string
          work_email?: string
        }
        Relationships: []
      }
      product_enquiries: {
        Row: {
          category: string
          company: string | null
          created_at: string
          email: string
          id: string
          message: string
          name: string
          product_name: string
          product_slug: string
          quantity: number | null
          status: string
        }
        Insert: {
          category: string
          company?: string | null
          created_at?: string
          email: string
          id?: string
          message: string
          name: string
          product_name: string
          product_slug: string
          quantity?: number | null
          status?: string
        }
        Update: {
          category?: string
          company?: string | null
          created_at?: string
          email?: string
          id?: string
          message?: string
          name?: string
          product_name?: string
          product_slug?: string
          quantity?: number | null
          status?: string
        }
        Relationships: []
      }
      product_enquiry_attachments: {
        Row: {
          created_at: string
          enquiry_id: string
          file_name: string
          file_size: number | null
          id: string
          mime_type: string | null
          storage_path: string
          upload_status: string
        }
        Insert: {
          created_at?: string
          enquiry_id: string
          file_name: string
          file_size?: number | null
          id?: string
          mime_type?: string | null
          storage_path: string
          upload_status?: string
        }
        Update: {
          created_at?: string
          enquiry_id?: string
          file_name?: string
          file_size?: number | null
          id?: string
          mime_type?: string | null
          storage_path?: string
          upload_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_enquiry_attachments_enquiry_id_fkey"
            columns: ["enquiry_id"]
            isOneToOne: false
            referencedRelation: "product_enquiries"
            referencedColumns: ["id"]
          },
        ]
      }
      product_reviews: {
        Row: {
          author_email: string
          author_name: string
          body: string
          created_at: string
          id: string
          is_verified_buyer: boolean
          product_handle: string
          rating: number
          status: string
          title: string
        }
        Insert: {
          author_email: string
          author_name: string
          body: string
          created_at?: string
          id?: string
          is_verified_buyer?: boolean
          product_handle: string
          rating: number
          status?: string
          title: string
        }
        Update: {
          author_email?: string
          author_name?: string
          body?: string
          created_at?: string
          id?: string
          is_verified_buyer?: boolean
          product_handle?: string
          rating?: number
          status?: string
          title?: string
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
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "moderator" | "user"
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
    },
  },
} as const
