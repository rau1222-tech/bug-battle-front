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
      banner_cards: {
        Row: {
          banner_id: string
          card_id: string
          peso_aparicion: number
        }
        Insert: {
          banner_id: string
          card_id: string
          peso_aparicion: number
        }
        Update: {
          banner_id?: string
          card_id?: string
          peso_aparicion?: number
        }
        Relationships: [
          {
            foreignKeyName: "banner_cards_banner_id_fkey"
            columns: ["banner_id"]
            isOneToOne: false
            referencedRelation: "banners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "banner_cards_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "cards"
            referencedColumns: ["id"]
          },
        ]
      }
      banners: {
        Row: {
          cartas_por_sobre: number
          coste: number
          created_at: string
          fecha_fin: string
          fecha_inicio: string
          id: string
          titulo: string
          updated_at: string
        }
        Insert: {
          cartas_por_sobre?: number
          coste?: number
          created_at?: string
          fecha_fin: string
          fecha_inicio: string
          id?: string
          titulo: string
          updated_at?: string
        }
        Update: {
          cartas_por_sobre?: number
          coste?: number
          created_at?: string
          fecha_fin?: string
          fecha_inicio?: string
          id?: string
          titulo?: string
          updated_at?: string
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
      match_actions: {
        Row: {
          action: Json
          created_at: string
          match_id: string
          player_id: string
          seq: number
        }
        Insert: {
          action: Json
          created_at?: string
          match_id: string
          player_id: string
          seq: number
        }
        Update: {
          action?: Json
          created_at?: string
          match_id?: string
          player_id?: string
          seq?: number
        }
        Relationships: [
          {
            foreignKeyName: "match_actions_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
        ]
      }
      match_states: {
        Row: {
          match_id: string
          state: Json
          updated_at: string
          version: number
        }
        Insert: {
          match_id: string
          state: Json
          updated_at?: string
          version?: number
        }
        Update: {
          match_id?: string
          state?: Json
          updated_at?: string
          version?: number
        }
        Relationships: []
      }
      match_views: {
        Row: {
          match_id: string
          player_id: string
          side: string
          updated_at: string
          version: number
          view: Json
        }
        Insert: {
          match_id: string
          player_id: string
          side: string
          updated_at?: string
          version: number
          view: Json
        }
        Update: {
          match_id?: string
          player_id?: string
          side?: string
          updated_at?: string
          version?: number
          view?: Json
        }
        Relationships: []
      }
      matches: {
        Row: {
          code: string
          created_at: string
          current_turn: string
          guest_deck: Json | null
          guest_id: string | null
          guest_name: string | null
          guest_result: string | null
          host_deck: Json
          host_id: string
          host_name: string
          host_result: string | null
          id: string
          last_seq: number
          seed: number
          status: string
          updated_at: string
          winner_id: string | null
        }
        Insert: {
          code: string
          created_at?: string
          current_turn?: string
          guest_deck?: Json | null
          guest_id?: string | null
          guest_name?: string | null
          guest_result?: string | null
          host_deck: Json
          host_id: string
          host_name: string
          host_result?: string | null
          id?: string
          last_seq?: number
          seed: number
          status?: string
          updated_at?: string
          winner_id?: string | null
        }
        Update: {
          code?: string
          created_at?: string
          current_turn?: string
          guest_deck?: Json | null
          guest_id?: string | null
          guest_name?: string | null
          guest_result?: string | null
          host_deck?: Json
          host_id?: string
          host_name?: string
          host_result?: string | null
          id?: string
          last_seq?: number
          seed?: number
          status?: string
          updated_at?: string
          winner_id?: string | null
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
          bot_losses: number
          bot_wins: number
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
          bot_losses?: number
          bot_wins?: number
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
          bot_losses?: number
          bot_wins?: number
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
      add_cards_to_collection: {
        Args: { p_card_ids: string[]; p_user_id: string }
        Returns: undefined
      }
      cancel_random_match: {
        Args: Record<PropertyKey, never>
        Returns: string | null
      }
      commit_match_action: {
        Args: {
          p_action: Json
          p_match_id: string
          p_player: string
          p_state: Json
          p_turn: string
          p_version: number
          p_view_p1: Json
          p_view_p2: Json
          p_winner: string | null
        }
        Returns: string
      }
      create_match: {
        Args: { p_deck_id: string }
        Returns: Json
      }
      delete_match: {
        Args: { p_match_id: string }
        Returns: boolean
      }
      earn_coins: {
        Args: { p_amount: number; p_user_id: string }
        Returns: number
      }

      open_banner_pack: {
        Args: { p_banner_id: string }
        Returns: Json
      }
      save_banner: {
        Args: {
          p_banner_id: string | null
          p_cards: Json
          p_cartas_por_sobre: number
          p_coste: number
          p_fecha_fin: string
          p_fecha_inicio: string
          p_titulo: string
        }

      finish_match_server: {
        Args: { p_match_id: string; p_winner: string }
        Returns: string
      }
      find_random_match: {
        Args: { p_deck_id: string }
        Returns: string | null
      }
      join_match: {
        Args: { p_code: string; p_deck_id: string }
        Returns: string
      }
      leave_match: {
        Args: { p_match_id: string }
        Returns: string
      }
      open_pack: {
        Args: Record<PropertyKey, never>
        Returns: Json
      }
      record_bot_result: {
        Args: { p_won: boolean }
        Returns: number
      }
      report_match_result: {
        Args: { p_match_id: string; p_winner: string }

        Returns: string
      }
      save_deck: {
        Args: {
          p_cards: Json
          p_cover_emoji: string
          p_deck_id: string | null
          p_name: string
        }
        Returns: string
      }
      spend_coins: {
        Args: { p_amount: number; p_user_id: string }
        Returns: number
      }
      submit_match_action: {
        Args: { p_action: Json; p_match_id: string; p_seq: number }
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
