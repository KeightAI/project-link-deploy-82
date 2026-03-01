export type MessageRole = 'user' | 'assistant' | 'system';

export interface GeneratedArtifacts {
  sstConfig: string;
  suggestedChanges: string;
  iamPolicy?: string;
}

export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  timestamp: Date;

  // Optional: Generated artifacts (only for assistant messages)
  artifacts?: GeneratedArtifacts;

  // Optional: User's selected AWS services (only for user messages)
  selectedServices?: string[];
}

export interface RepoAnalysis {
  framework: string | null;
  buildTool: string | null;
  dependencies: string[];
  buildCommand?: string;
  outputDir?: string;
  analyzedAt: Date;
}

export interface ConversationState {
  conversationId: string;
  projectId: string;
  messages: ChatMessage[];

  // Latest generated code (for easy access)
  latestArtifacts?: GeneratedArtifacts;

  // Repository analysis result (stored on first generation)
  repoAnalysis?: RepoAnalysis;

  // Metadata
  createdAt: Date;
  updatedAt: Date;
}

// Helper function to create a new conversation
export function createEmptyConversation(projectId: string): ConversationState {
  return {
    conversationId: crypto.randomUUID(),
    projectId,
    messages: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

// Helper function to create a user message
export function createUserMessage(
  content: string,
  selectedServices?: string[]
): ChatMessage {
  return {
    id: crypto.randomUUID(),
    role: 'user',
    content,
    timestamp: new Date(),
    selectedServices,
  };
}

// Helper function to create an assistant message
export function createAssistantMessage(
  content: string,
  artifacts?: GeneratedArtifacts
): ChatMessage {
  return {
    id: crypto.randomUUID(),
    role: 'assistant',
    content,
    timestamp: new Date(),
    artifacts,
  };
}

// Helper function to create a system message
export function createSystemMessage(content: string): ChatMessage {
  return {
    id: crypto.randomUUID(),
    role: 'system',
    content,
    timestamp: new Date(),
  };
}
