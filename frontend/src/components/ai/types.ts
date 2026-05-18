import type { AppRole } from '../../auth/types';

export interface AssistantActionNavigate {
  type: 'navigate';
  label: string;
  to: string;
}

export interface AssistantResponse {
  message: string;
  intent: string;
  confidence: number;
  actions: AssistantActionNavigate[];
  needsConfirmation: boolean;
  quickReplies: string[];
}

export interface AssistantRequestContext {
  route?: string;
  role?: AppRole | null;
  monthYear?: string;
}

export interface ChatMessage {
  id: string;
  role: 'assistant' | 'user';
  text: string;
  createdAt: number;
}
