import { useState, useEffect, useRef } from 'react';
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@/components/ui/resizable';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Rocket, Info } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

import ChatMessage from './ChatMessage';
import ChatInput from './ChatInput';
import CodePreviewPanel from './CodePreviewPanel';

import {
  ConversationState,
  createEmptyConversation,
  createUserMessage,
  createAssistantMessage,
  createSystemMessage,
} from '@/types/chat';

interface Project {
  id: string;
  name: string;
  github_repo_url: string | null;
  branch_name: string | null;
}

interface ChatInterfaceProps {
  selectedRepo: Project;
  onConversationUpdate: (conversation: ConversationState) => void;
  onCodeGenerated: (hasCode: boolean) => void;
}

const ChatInterface = ({
  selectedRepo,
  onConversationUpdate,
  onCodeGenerated,
}: ChatInterfaceProps) => {
  const [conversation, setConversation] = useState<ConversationState>(
    createEmptyConversation(selectedRepo.id)
  );
  const [isGenerating, setIsGenerating] = useState(false);
  const [showCodePanel, setShowCodePanel] = useState(false);
  const { toast } = useToast();
  const scrollAreaRef = useRef<HTMLDivElement>(null);

  // Initialize with welcome message
  useEffect(() => {
    if (conversation.messages.length === 0) {
      const welcomeMessage = createSystemMessage(
        `Welcome! I'll help you configure AWS infrastructure for ${selectedRepo.name}.\n\nDescribe your application and infrastructure needs, and I'll generate a production-ready SST configuration for you.`
      );
      const updatedConversation = {
        ...conversation,
        messages: [welcomeMessage],
      };
      setConversation(updatedConversation);
      onConversationUpdate(updatedConversation);
    }
  }, []);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (scrollAreaRef.current) {
      const scrollElement = scrollAreaRef.current.querySelector('[data-radix-scroll-area-viewport]');
      if (scrollElement) {
        scrollElement.scrollTop = scrollElement.scrollHeight;
      }
    }
  }, [conversation.messages]);

  const handleSendMessage = async (content: string, selectedServices: string[]) => {
    // Add user message
    const userMessage = createUserMessage(content, selectedServices);
    const updatedMessages = [...conversation.messages, userMessage];

    setConversation((prev) => ({
      ...prev,
      messages: updatedMessages,
    }));

    setIsGenerating(true);

    try {
      // Call edge function
      const { data, error } = await supabase.functions.invoke('generate-infrastructure', {
        body: {
          conversationHistory: updatedMessages.map((msg) => ({
            role: msg.role,
            content: msg.content,
          })),
          userMessage: content,
          selectedServices,
          repoName: selectedRepo.name,
          repoUrl: selectedRepo.github_repo_url || '',
          repoAnalysis: conversation.repoAnalysis,
        },
      });

      if (error) {
        throw new Error(error.message || 'Failed to generate infrastructure');
      }

      // Create assistant message with artifacts
      const assistantMessage = createAssistantMessage(
        data.message || 'I\'ve generated your infrastructure configuration.',
        {
          sstConfig: data.sstConfig,
          suggestedChanges: data.suggestedChanges,
          iamPolicy: data.iamPolicy,
        }
      );

      // Update conversation
      const finalMessages = [...updatedMessages, assistantMessage];
      const updatedConversation: ConversationState = {
        ...conversation,
        messages: finalMessages,
        latestArtifacts: {
          sstConfig: data.sstConfig,
          suggestedChanges: data.suggestedChanges,
          iamPolicy: data.iamPolicy,
        },
        repoAnalysis: data.repoAnalysis || conversation.repoAnalysis,
        updatedAt: new Date(),
      };

      setConversation(updatedConversation);
      onConversationUpdate(updatedConversation);
      setShowCodePanel(true);
      onCodeGenerated(true);

      toast({
        title: 'Configuration Generated',
        description: 'Your infrastructure code is ready for review.',
      });
    } catch (error) {
      console.error('Error generating infrastructure:', error);
      toast({
        title: 'Generation Failed',
        description:
          error instanceof Error ? error.message : 'Failed to generate infrastructure. Please try again.',
        variant: 'destructive',
      });

      // Add error message to chat
      const errorMessage = createAssistantMessage(
        `I encountered an error while generating your infrastructure. Please try again or rephrase your request.`
      );
      setConversation((prev) => ({
        ...prev,
        messages: [...prev.messages, errorMessage],
      }));
    } finally {
      setIsGenerating(false);
    }
  };

  // Check if there's a latest message that's being generated
  const isLastMessageGenerating =
    isGenerating && conversation.messages[conversation.messages.length - 1]?.role === 'user';

  return (
    <ResizablePanelGroup direction="horizontal" className="h-full">
      {/* Chat Panel */}
      <ResizablePanel defaultSize={showCodePanel ? 55 : 100} minSize={40}>
        <div className="flex flex-col h-full bg-gradient-to-br from-blue-50 via-white to-purple-50">
          {/* Repo Info Header */}
          <div className="p-4 bg-white border-b">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-gray-900">{selectedRepo.name}</h3>
                <p className="text-xs text-gray-500">
                  {selectedRepo.branch_name || 'main'} branch
                </p>
              </div>
              {conversation.repoAnalysis && (
                <div className="flex gap-1 flex-wrap justify-end">
                  {conversation.repoAnalysis.framework && (
                    <Badge variant="secondary" className="text-xs">
                      {conversation.repoAnalysis.framework}
                    </Badge>
                  )}
                  {conversation.repoAnalysis.buildTool && (
                    <Badge variant="secondary" className="text-xs">
                      {conversation.repoAnalysis.buildTool}
                    </Badge>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Info Banner */}
          {!showCodePanel && (
            <div className="p-3 mx-4 mt-4 bg-blue-50 border border-blue-200 rounded-lg">
              <div className="flex items-start gap-2">
                <Info className="h-4 w-4 text-blue-600 mt-0.5 flex-shrink-0" />
                <div className="text-xs text-blue-800">
                  <p className="font-medium">How this works:</p>
                  <p className="mt-1">
                    Describe your infrastructure needs in natural language. I'll analyze your repository
                    and generate SST configurations, implementation guides, and IAM policies.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Messages */}
          <ScrollArea ref={scrollAreaRef} className="flex-1 p-4">
            {conversation.messages.map((message, index) => (
              <ChatMessage
                key={message.id}
                message={message}
                isGenerating={
                  isLastMessageGenerating && index === conversation.messages.length - 1
                }
              />
            ))}
          </ScrollArea>

          {/* Input */}
          <ChatInput onSend={handleSendMessage} disabled={isGenerating} />
        </div>
      </ResizablePanel>

      {/* Code Preview Panel */}
      {showCodePanel && conversation.latestArtifacts && (
        <>
          <ResizableHandle withHandle />
          <ResizablePanel defaultSize={45} minSize={30}>
            <CodePreviewPanel artifacts={conversation.latestArtifacts} />
          </ResizablePanel>
        </>
      )}

      {/* Placeholder when no code generated */}
      {!showCodePanel && (
        <>
          <ResizableHandle />
          <ResizablePanel defaultSize={45} minSize={30}>
            <div className="h-full flex items-center justify-center bg-gray-50 border-l">
              <div className="text-center px-8">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gray-100 mb-4">
                  <Rocket className="h-8 w-8 text-gray-400" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">No Code Generated Yet</h3>
                <p className="text-sm text-gray-500 max-w-sm">
                  Describe your infrastructure needs in the chat, and your generated configuration will
                  appear here.
                </p>
              </div>
            </div>
          </ResizablePanel>
        </>
      )}
    </ResizablePanelGroup>
  );
};

export default ChatInterface;
