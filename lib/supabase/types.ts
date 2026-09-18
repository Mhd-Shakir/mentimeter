export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: { id: string; email: string; created_at: string };
        Insert: { id: string; email: string; created_at?: string };
        Update: { id?: string; email?: string; created_at?: string };
        Relationships: [];
      };
      presentations: {
        Row: {
          id: string;
          user_id: string | null;
          title: string;
          room_code: string;
          is_live: boolean;
          current_slide_index: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string | null;
          title?: string;
          room_code: string;
          is_live?: boolean;
          current_slide_index?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["presentations"]["Insert"]>;
        Relationships: [];
      };
      questions: {
        Row: { id: string; presentation_id: string; question_text: string; time_limit: number; order_index: number; created_at: string };
        Insert: { id?: string; presentation_id: string; question_text: string; time_limit?: number; order_index?: number; created_at?: string };
        Update: Partial<Database["public"]["Tables"]["questions"]["Insert"]>;
        Relationships: [];
      };
      options: {
        Row: { id: string; question_id: string; option_text: string; is_correct: boolean; created_at: string };
        Insert: { id?: string; question_id: string; option_text: string; is_correct?: boolean; created_at?: string };
        Update: Partial<Database["public"]["Tables"]["options"]["Insert"]>;
        Relationships: [];
      };
      responses: {
        Row: { id: string; room_code: string; user_nickname: string; question_id: string; option_id: string; points_earned: number; time_taken: number; created_at: string };
        Insert: { id?: string; room_code: string; user_nickname: string; question_id: string; option_id: string; points_earned?: number; time_taken?: number; created_at?: string };
        Update: Partial<Database["public"]["Tables"]["responses"]["Insert"]>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

export type Presentation = Database["public"]["Tables"]["presentations"]["Row"];
export type Question = Database["public"]["Tables"]["questions"]["Row"];
export type Option = Database["public"]["Tables"]["options"]["Row"];
export type Response = Database["public"]["Tables"]["responses"]["Row"];

export type QuestionWithOptions = Question & {
  options: Option[];
};

export type RoomEvent =
  | { type: "slide-change"; slideIndex: number; startedAt: string }
  | { type: "options-show"; slideIndex: number; startedAt: string }
  | { type: "leaderboard-show"; slideIndex: number }
  | { type: "quiz-ended"; endedAt: string };
