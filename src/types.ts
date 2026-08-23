// Design DNA — themes are open strings now (the generator defines the palette).
export type ThemeType = string;
export type LayoutType = 'Center' | 'Sidebar' | 'Focus' | 'Terminal';
export type MessageStyleType = 'Bubbles' | 'Cards' | 'Compact' | 'Terminal';
export type BackgroundStyleType = 'Solid' | 'Gradient' | 'Mesh' | 'Grid';

export interface DesignDNA {
  theme: ThemeType;
  mode?: 'dark' | 'light';
  layout: LayoutType;
  messageStyle: MessageStyleType;
  backgroundStyle: BackgroundStyleType;
  fontFamily: string;
  mono?: boolean;
  borderRadius: string;
  // Full palette (all optional so older records still parse)
  bg?: string;
  surface?: string;
  surface2?: string;
  text?: string;
  muted?: string;
  border?: string;
  primaryColor: string;
  accentColor?: string;
  secondaryColor?: string;
}

export interface DomainProfile {
  domain: string;
  specialty: string;
  description: string;
  allowedTopics: string[];
  relatedTopics: string[];
  synonyms: string[];
  commonIntents: string[];
  excludedTopics: string[];
}

export interface Bot {
  id: string;
  name: string;
  domain: string;
  subdomain: string;
  description: string;
  personality: string;
  systemPrompt: string;
  welcomeMessage: string;
  starterQuestions: string[];
  domainProfile?: DomainProfile | null;
  avatar: string; // URL or emoji (empty = render monogram)
  designDna: DesignDNA;
  favorite?: boolean;
  createdAt: number;
  updatedAt?: number;
  conversationCount?: number;
  creationMethod?: 'factory' | 'custom' | 'template';
}

export interface Conversation {
  id: string;
  botId?: string;
  title: string;
  createdAt?: number;
  updatedAt?: number;
}

export interface Message {
  id: string;
  conversationId?: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  provider?: string;
  sources?: string[] | null;
  createdAt?: number;
  pinned?: boolean;
  rating?: number; // 1 | -1 | 0 (thumbs)
  nlu?: {
    intent?: string;
    entities?: Array<{ type: string; value: string }>;
    sentiment?: string;
    language?: string;
    pii?: Array<{ type: string; value: string }>;
    toxicity?: { toxic: boolean; matched: string[] };
    injection?: { injected: boolean; matched: string[] };
    blocked?: string;
    approved?: boolean;
  };
}
