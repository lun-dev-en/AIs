export type LabMode = "normal" | "demo";
export type Formed = {
  formed_id: number;
  memory_id: number;
  formed_personality: string;
};
export type Memory = {
  memory_id: number;
  personality_id: number;
  past_memory: string;
  think: string;
  formed_personalities: Formed[];
};
export type Profile = {
  personality_id: number;
  personality_name: string;
  personality1: string;
  personality2: string | null;
  memories: Memory[];
};
export type Conditions = {
  basic: boolean;
  memories: boolean;
  thoughts: boolean;
  formed: boolean;
};
export type RunSettings = {
  conditions: Conditions;
  temperature: number;
  seed: number;
  model_name: string;
  num_ctx: number;
  num_predict: number;
};
export type Question = {
  question_id: number;
  question: string;
  created_at: string;
  status: "generating" | "complete" | "partial" | "failed";
  error: string | null;
  settings: RunSettings;
  parent_question_id: number | null;
};
export type Message = { role: string; content: string };
export type Response = {
  response_id: number;
  question_id: number;
  personality_id: number;
  response: string;
  prompt: string;
  model_name: string;
  temperature: number;
  seed: number;
  created_at: string;
  status: "pending" | "generating" | "complete" | "error";
  error: string | null;
  messages: Message[];
  metadata: {
    personality: Omit<Profile, "memories">;
    conditions: Conditions;
    included_memory_ids: number[];
    omitted_memory_ids: number[];
    used_information: unknown;
    num_ctx: number;
    num_predict: number;
  };
};
export type Run = { question: Question; responses: Response[] };
export type Health = {
  mode: LabMode | null;
  generation_busy: boolean;
  ready: boolean;
  model_name: string;
  error: string | null;
  active_question_id: number | null;
};
