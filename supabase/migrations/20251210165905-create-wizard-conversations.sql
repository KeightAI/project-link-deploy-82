-- Create wizard_conversations table for storing chat-based infrastructure configurations
CREATE TABLE IF NOT EXISTS public.wizard_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  project_id UUID NOT NULL,

  -- Conversation data stored as JSONB
  messages JSONB NOT NULL DEFAULT '[]'::jsonb,

  -- Latest artifacts (denormalized for quick access)
  latest_sst_config TEXT,
  latest_iam_policy TEXT,
  latest_suggested_changes TEXT,

  -- Repository analysis result
  repo_analysis JSONB,

  -- Metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Foreign key constraints
  CONSTRAINT wizard_conversations_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE,
  CONSTRAINT wizard_conversations_project_id_fkey
    FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_wizard_conversations_user_id
  ON public.wizard_conversations(user_id);

CREATE INDEX IF NOT EXISTS idx_wizard_conversations_project_id
  ON public.wizard_conversations(project_id);

CREATE INDEX IF NOT EXISTS idx_wizard_conversations_created_at
  ON public.wizard_conversations(created_at DESC);

-- Enable Row Level Security
ALTER TABLE public.wizard_conversations ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own conversations"
  ON public.wizard_conversations
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own conversations"
  ON public.wizard_conversations
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own conversations"
  ON public.wizard_conversations
  FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own conversations"
  ON public.wizard_conversations
  FOR DELETE
  USING (auth.uid() = user_id);

-- Trigger to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_wizard_conversations_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_wizard_conversations_updated_at_trigger
  BEFORE UPDATE ON public.wizard_conversations
  FOR EACH ROW
  EXECUTE FUNCTION public.update_wizard_conversations_updated_at();
