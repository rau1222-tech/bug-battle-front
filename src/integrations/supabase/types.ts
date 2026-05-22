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
      cards: {
        Row: {
          ataque_coste: number | null
          audio_url: string | null
          cordura_max: number | null
          coste: number
          descripcion: string | null
          gacha_peso: number
          id: string
          image_url: string | null
          nombre: string
          potencia: number | null
          tipo: string
        }
        Insert: {
          ataque_coste?: number | null
          audio_url?: string | null
          cordura_max?: number | null
          coste: number
          descripcion?: string | null
          gacha_peso?: number
          id: string
          image_url?: string | null
          nombre: string
          potencia?: number | null
          tipo: string
        }
        Update: {
          ataque_coste?: number | null
          audio_url?: string | null
          cordura_max?: number | null
          coste?: number
          descripcion?: string | null
          gacha_peso?: number
          id?: string
          image_url?: string | null
          nombre?: string
          potencia?: number | null
          tipo?: string
        }
        Relationships: []
      }
      card_skills: {
        Row: {
          card_id: string
          coste: number
          duracion: number
          orden: number
          potencia: number
          skill_id: number
        }
        Insert: {
          card_id: string
          coste?: number
          duracion?: number
          orden?: number
          potencia?: number
          skill_id: number
        }
        Update: {
          card_id?: string
          coste?: number
          duracion?: number
          orden?: number
          potencia?: number
          skill_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "card_skills_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "card_skills_skill_id_fkey"
            columns: ["skill_id"]
            isOneToOne: false
            referencedRelation: "skills"
            referencedColumns: ["id"]
          },
        ]
      }
      deck_cards: {
        Row: {
          card_id: string
          deck_id: string
          quantity: number
        }
        Insert: {
          card_id: string
          deck_id: string
          quantity: number
        }
        Update: {
          card_id?: string
          deck_id?: string
          quantity?: number
        }
        Relationships: [
          {
            foreignKeyName: "deck_cards_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deck_cards_deck_id_fkey"
            columns: ["deck_id"]
            isOneToOne: false
            referencedRelation: "decks"
            referencedColumns: ["id"]
          },
        ]
      }
      decks: {
        Row: {
          cover_emoji: string
          created_at: string
          id: string
          is_preset: boolean
          name: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          cover_emoji?: string
          created_at?: string
          id?: string
          is_preset?: boolean
          name: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          cover_emoji?: string
          created_at?: string
          id?: string
          is_preset?: boolean
          name?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      player_collection: {
        Row: {
          card_id: string
          player_id: string
          quantity: number
        }
        Insert: {
          card_id: string
          player_id: string
          quantity?: number
        }
        Update: {
          card_id?: string
          player_id?: string
          quantity?: number
        }
        Relationships: [
          {
            foreignKeyName: "player_collection_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_collection_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      players: {
        Row: {
          active_deck_id: string | null
          admin: boolean
          avatar_url: string | null
          created_at: string
          display_name: string
          gold: number
          id: string
          losses: number
          updated_at: string
          wins: number
        }
        Insert: {
          active_deck_id?: string | null
          admin?: boolean
          avatar_url?: string | null
          created_at?: string
          display_name: string
          gold?: number
          id: string
          losses?: number
          updated_at?: string
          wins?: number
        }
        Update: {
          active_deck_id?: string | null
          admin?: boolean
          avatar_url?: string | null
          created_at?: string
          display_name?: string
          gold?: number
          id?: string
          losses?: number
          updated_at?: string
          wins?: number
        }
        Relationships: [
          {
            foreignKeyName: "players_active_deck_id_fkey"
            columns: ["active_deck_id"]
            isOneToOne: false
            referencedRelation: "decks"
            referencedColumns: ["id"]
          },
        ]
      }
      skills: {
        Row: {
          accion_tipo: string
          descripcion: string | null
          efecto_tipo: string | null
          id: number
          nombre: string
          objetivo: string
        }
        Insert: {
          accion_tipo: string
          descripcion?: string | null
          efecto_tipo?: string | null
          id: number
          nombre: string
          objetivo: string
        }
        Update: {
          accion_tipo?: string
          descripcion?: string | null
          efecto_tipo?: string | null
          id?: number
          nombre?: string
          objetivo?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
