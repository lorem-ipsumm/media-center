// to import: import type { Message } from "@shared/interfaces/mock";
export interface Message {
  role: "assistant" | "user" | "system";
  content: string;
}
