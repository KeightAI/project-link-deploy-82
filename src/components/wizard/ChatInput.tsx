import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Send } from 'lucide-react';

interface ChatInputProps {
  onSend: (message: string, selectedServices: string[]) => void;
  disabled?: boolean;
}

const AWS_SERVICES = [
  'EC2',
  'S3',
  'RDS',
  'Lambda',
  'CloudFront',
  'Route 53',
  'ELB',
  'CloudWatch',
  'IAM',
  'API Gateway',
  'DynamoDB',
  'ElastiCache',
  'SQS',
  'SNS',
];

const ChatInput = ({ onSend, disabled }: ChatInputProps) => {
  const [message, setMessage] = useState('');
  const [selectedServices, setSelectedServices] = useState<string[]>([]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (message.trim() && !disabled) {
      onSend(message, selectedServices);
      setMessage('');
      setSelectedServices([]);
    }
  };

  const toggleService = (service: string) => {
    setSelectedServices((prev) =>
      prev.includes(service) ? prev.filter((s) => s !== service) : [...prev, service]
    );
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e as any);
    }
  };

  return (
    <div className="border-t bg-white p-4">
      {/* AWS Service Tags */}
      <div className="mb-3">
        <label className="text-xs font-medium text-gray-600 mb-2 block">
          AWS Services (optional):
        </label>
        <div className="flex flex-wrap gap-1">
          {AWS_SERVICES.map((service) => (
            <Button
              key={service}
              type="button"
              variant="outline"
              size="sm"
              onClick={() => toggleService(service)}
              disabled={disabled}
              className={`text-xs h-7 ${
                selectedServices.includes(service)
                  ? 'bg-blue-100 border-blue-300 text-blue-800 hover:bg-blue-200'
                  : 'hover:bg-gray-50'
              }`}
            >
              {service}
            </Button>
          ))}
        </div>
      </div>

      {/* Message Input */}
      <form onSubmit={handleSubmit} className="flex gap-2">
        <Textarea
          placeholder="Describe your infrastructure needs... (e.g., 'Deploy a React app with Node.js API and PostgreSQL database')"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          className="resize-none min-h-[80px]"
          rows={3}
        />
        <Button
          type="submit"
          disabled={disabled || !message.trim()}
          size="lg"
          className="h-auto px-4"
        >
          <Send className="h-4 w-4" />
        </Button>
      </form>
      <p className="text-xs text-gray-500 mt-2">
        Press <kbd className="px-1 py-0.5 bg-gray-100 border border-gray-300 rounded text-xs">Enter</kbd> to send, <kbd className="px-1 py-0.5 bg-gray-100 border border-gray-300 rounded text-xs">Shift+Enter</kbd> for new line
      </p>
    </div>
  );
};

export default ChatInput;
