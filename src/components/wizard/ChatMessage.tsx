import { ChatMessage as ChatMessageType } from '@/types/chat';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Bot, Sparkles, User, Code } from 'lucide-react';
import { format } from 'date-fns';

interface ChatMessageProps {
  message: ChatMessageType;
  isGenerating?: boolean;
}

const ChatMessage = ({ message, isGenerating }: ChatMessageProps) => {
  const isUser = message.role === 'user';
  const isSystem = message.role === 'system';

  const formatTime = (date: Date) => {
    return format(date, 'h:mm a');
  };

  const getAvatarIcon = () => {
    if (isUser) return <User className="h-4 w-4" />;
    if (isSystem) return <Bot className="h-4 w-4" />;
    return <Sparkles className="h-4 w-4" />;
  };

  const getAvatarBg = () => {
    if (isUser) return 'bg-blue-600';
    if (isSystem) return 'bg-purple-600';
    return 'bg-green-600';
  };

  return (
    <div className={`mb-4 flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[80%] flex gap-3 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
        {/* Avatar */}
        <Avatar className={`h-8 w-8 ${getAvatarBg()}`}>
          <AvatarFallback className={`${getAvatarBg()} text-white`}>
            {getAvatarIcon()}
          </AvatarFallback>
        </Avatar>

        {/* Message Content */}
        <div className="flex flex-col gap-1">
          <Card
            className={`${
              isUser
                ? 'bg-blue-600 text-white border-blue-600'
                : isSystem
                ? 'bg-purple-50 border-purple-200'
                : 'bg-white border-gray-200'
            }`}
          >
            <CardContent className="p-4">
              {/* Message text */}
              <p className={`text-sm whitespace-pre-wrap ${isUser ? 'text-white' : 'text-gray-900'}`}>
                {message.content}
              </p>

              {/* Show selected services for user messages */}
              {isUser && message.selectedServices && message.selectedServices.length > 0 && (
                <div className="mt-2 flex gap-1 flex-wrap">
                  {message.selectedServices.map((service) => (
                    <Badge
                      key={service}
                      variant="secondary"
                      className="text-xs bg-blue-500 text-white border-blue-400"
                    >
                      {service}
                    </Badge>
                  ))}
                </div>
              )}

              {/* Show code indicator for assistant messages with artifacts */}
              {!isUser && message.artifacts && (
                <div className="mt-3 pt-3 border-t border-gray-200">
                  <div className="flex items-center gap-2 text-xs text-gray-500">
                    <Code className="h-3 w-3" />
                    <span>Generated infrastructure code →</span>
                  </div>
                </div>
              )}

              {/* Loading state */}
              {isGenerating && (
                <div className="mt-2 flex items-center gap-2 text-xs text-gray-500">
                  <div className="animate-spin h-3 w-3 border-2 border-blue-600 border-t-transparent rounded-full" />
                  <span>Generating configuration...</span>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Timestamp */}
          <p className={`text-xs text-gray-400 ${isUser ? 'text-right' : 'text-left'} px-1`}>
            {formatTime(message.timestamp)}
          </p>
        </div>
      </div>
    </div>
  );
};

export default ChatMessage;
