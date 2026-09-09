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
      activity_log: {
        Row: {
          action: string
          actor_email: string | null
          actor_id: string | null
          changes: Json | null
          created_at: string
          id: string
          record_id: string | null
          table_name: string
        }
        Insert: {
          action: string
          actor_email?: string | null
          actor_id?: string | null
          changes?: Json | null
          created_at?: string
          id?: string
          record_id?: string | null
          table_name: string
        }
        Update: {
          action?: string
          actor_email?: string | null
          actor_id?: string | null
          changes?: Json | null
          created_at?: string
          id?: string
          record_id?: string | null
          table_name?: string
        }
        Relationships: []
      }
      announcements: {
        Row: {
          body: string | null
          created_at: string
          created_by: string | null
          ends_at: string | null
          id: string
          is_active: boolean
          level: string
          starts_at: string | null
          title: string
          updated_at: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          created_by?: string | null
          ends_at?: string | null
          id?: string
          is_active?: boolean
          level?: string
          starts_at?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          body?: string | null
          created_at?: string
          created_by?: string | null
          ends_at?: string | null
          id?: string
          is_active?: boolean
          level?: string
          starts_at?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      assets: {
        Row: {
          asset_condition:
            | Database["public"]["Enums"]["asset_condition_t"]
            | null
          asset_description: string | null
          asset_id: string
          assigned_to: string | null
          barcode: string | null
          created_at: string
          department: Database["public"]["Enums"]["department_t"] | null
          is_deleted: boolean
          last_verified_date: string | null
          location: string | null
          reallocated_to: string | null
          registration_date: string
          returned_date: string | null
          serial_number: string | null
          verified_by: string | null
        }
        Insert: {
          asset_condition?:
            | Database["public"]["Enums"]["asset_condition_t"]
            | null
          asset_description?: string | null
          asset_id: string
          assigned_to?: string | null
          barcode?: string | null
          created_at?: string
          department?: Database["public"]["Enums"]["department_t"] | null
          is_deleted?: boolean
          last_verified_date?: string | null
          location?: string | null
          reallocated_to?: string | null
          registration_date?: string
          returned_date?: string | null
          serial_number?: string | null
          verified_by?: string | null
        }
        Update: {
          asset_condition?:
            | Database["public"]["Enums"]["asset_condition_t"]
            | null
          asset_description?: string | null
          asset_id?: string
          assigned_to?: string | null
          barcode?: string | null
          created_at?: string
          department?: Database["public"]["Enums"]["department_t"] | null
          is_deleted?: boolean
          last_verified_date?: string | null
          location?: string | null
          reallocated_to?: string | null
          registration_date?: string
          returned_date?: string | null
          serial_number?: string | null
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "assets_reallocated_to_fkey"
            columns: ["reallocated_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      helpdesk_settings: {
        Row: {
          agent_notify_emails: string | null
          allow_attachments: boolean
          auto_close_days: number
          business_end: string
          business_start: string
          default_assignee: string | null
          id: boolean
          notify_agents: boolean
          notify_requestor: boolean
          organisation_name: string
          require_category: boolean
          support_email: string | null
          ticket_footer: string | null
          timezone: string
          updated_at: string
          updated_by: string | null
          working_days: number[]
        }
        Insert: {
          agent_notify_emails?: string | null
          allow_attachments?: boolean
          auto_close_days?: number
          business_end?: string
          business_start?: string
          default_assignee?: string | null
          id?: boolean
          notify_agents?: boolean
          notify_requestor?: boolean
          organisation_name?: string
          require_category?: boolean
          support_email?: string | null
          ticket_footer?: string | null
          timezone?: string
          updated_at?: string
          updated_by?: string | null
          working_days?: number[]
        }
        Update: {
          agent_notify_emails?: string | null
          allow_attachments?: boolean
          auto_close_days?: number
          business_end?: string
          business_start?: string
          default_assignee?: string | null
          id?: boolean
          notify_agents?: boolean
          notify_requestor?: boolean
          organisation_name?: string
          require_category?: boolean
          support_email?: string | null
          ticket_footer?: string | null
          timezone?: string
          updated_at?: string
          updated_by?: string | null
          working_days?: number[]
        }
        Relationships: [
          {
            foreignKeyName: "helpdesk_settings_default_assignee_fkey"
            columns: ["default_assignee"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      holidays: {
        Row: {
          created_at: string
          holiday_date: string
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          holiday_date: string
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          holiday_date?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          id: string
          is_read: boolean
          link: string | null
          title: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          is_read?: boolean
          link?: string | null
          title: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          is_read?: boolean
          link?: string | null
          title?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          department: string | null
          email: string
          full_name: string | null
          id: string
        }
        Insert: {
          created_at?: string
          department?: string | null
          email: string
          full_name?: string | null
          id: string
        }
        Update: {
          created_at?: string
          department?: string | null
          email?: string
          full_name?: string | null
          id?: string
        }
        Relationships: []
      }
      sla_policies: {
        Row: {
          business_hours_only: boolean
          notes: string | null
          priority: Database["public"]["Enums"]["ticket_priority_t"]
          resolution_minutes: number
          response_minutes: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          business_hours_only?: boolean
          notes?: string | null
          priority: Database["public"]["Enums"]["ticket_priority_t"]
          resolution_minutes: number
          response_minutes: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          business_hours_only?: boolean
          notes?: string | null
          priority?: Database["public"]["Enums"]["ticket_priority_t"]
          resolution_minutes?: number
          response_minutes?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      ticket_categories: {
        Row: {
          created_at: string
          default_priority: Database["public"]["Enums"]["ticket_priority_t"]
          description: string | null
          id: string
          is_active: boolean
          name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          default_priority?: Database["public"]["Enums"]["ticket_priority_t"]
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          default_priority?: Database["public"]["Enums"]["ticket_priority_t"]
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      ticket_comments: {
        Row: {
          author_id: string
          body: string
          created_at: string
          id: string
          is_internal: boolean
          ticket_id: string
        }
        Insert: {
          author_id: string
          body: string
          created_at?: string
          id?: string
          is_internal?: boolean
          ticket_id: string
        }
        Update: {
          author_id?: string
          body?: string
          created_at?: string
          id?: string
          is_internal?: boolean
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_comments_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_comments_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      tickets: {
        Row: {
          assigned_to: string | null
          attachment_url: string | null
          category: string
          created_at: string
          department: Database["public"]["Enums"]["department_t"] | null
          description: string | null
          id: string
          priority: Database["public"]["Enums"]["ticket_priority_t"]
          resolved_at: string | null
          status: Database["public"]["Enums"]["ticket_status_t"]
          submitted_by: string
          ticket_number: number
          title: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          attachment_url?: string | null
          category?: string
          created_at?: string
          department?: Database["public"]["Enums"]["department_t"] | null
          description?: string | null
          id?: string
          priority?: Database["public"]["Enums"]["ticket_priority_t"]
          resolved_at?: string | null
          status?: Database["public"]["Enums"]["ticket_status_t"]
          submitted_by: string
          ticket_number?: number
          title: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          attachment_url?: string | null
          category?: string
          created_at?: string
          department?: Database["public"]["Enums"]["department_t"] | null
          description?: string | null
          id?: string
          priority?: Database["public"]["Enums"]["ticket_priority_t"]
          resolved_at?: string | null
          status?: Database["public"]["Enums"]["ticket_status_t"]
          submitted_by?: string
          ticket_number?: number
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tickets_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_submitted_by_fkey"
            columns: ["submitted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
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
      verifications: {
        Row: {
          asset_id: string
          condition_at_verification:
            | Database["public"]["Enums"]["asset_condition_t"]
            | null
          id: string
          method: Database["public"]["Enums"]["verification_method_t"]
          notes: string | null
          verified_at: string
          verified_by: string
        }
        Insert: {
          asset_id: string
          condition_at_verification?:
            | Database["public"]["Enums"]["asset_condition_t"]
            | null
          id?: string
          method?: Database["public"]["Enums"]["verification_method_t"]
          notes?: string | null
          verified_at?: string
          verified_by: string
        }
        Update: {
          asset_id?: string
          condition_at_verification?:
            | Database["public"]["Enums"]["asset_condition_t"]
            | null
          id?: string
          method?: Database["public"]["Enums"]["verification_method_t"]
          notes?: string | null
          verified_at?: string
          verified_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "verifications_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["asset_id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      admin_list_users: {
        Args: never
        Returns: {
          department: string
          email: string
          full_name: string
          id: string
          last_sign_in_at: string
          role: Database["public"]["Enums"]["app_role"]
          user_created_at: string
        }[]
      }
      admin_set_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: undefined
      }
      current_role: {
        Args: never
        Returns: Database["public"]["Enums"]["app_role"]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role:
        | "admin"
        | "technician"
        | "viewer"
        | "asset_manager"
        | "asset_viewer"
        | "helpdesk_agent"
        | "requestor"
      asset_condition_t: "Good" | "Fair" | "Poor" | "Damaged"
      department_t: "CSS" | "Finance" | "IT" | "Facilities" | "Tipp Con"
      ticket_category_t:
        | "Hardware"
        | "Software"
        | "Network"
        | "Access"
        | "Other"
      ticket_priority_t: "Low" | "Medium" | "High" | "Critical"
      ticket_status_t:
        | "Open"
        | "In Progress"
        | "On Hold"
        | "Resolved"
        | "Closed"
      verification_method_t: "barcode" | "manual"
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
      app_role: [
        "admin",
        "technician",
        "viewer",
        "asset_manager",
        "asset_viewer",
        "helpdesk_agent",
        "requestor",
      ],
      asset_condition_t: ["Good", "Fair", "Poor", "Damaged"],
      department_t: ["CSS", "Finance", "IT", "Facilities", "Tipp Con"],
      ticket_category_t: ["Hardware", "Software", "Network", "Access", "Other"],
      ticket_priority_t: ["Low", "Medium", "High", "Critical"],
      ticket_status_t: ["Open", "In Progress", "On Hold", "Resolved", "Closed"],
      verification_method_t: ["barcode", "manual"],
    },
  },
} as const
