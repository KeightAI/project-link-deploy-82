import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Bot, Sparkles, X } from 'lucide-react';

interface Project {
  id: string;
  name: string;
  description: string | null;
  github_repo_url: string | null;
}

interface AIConfigurationProps {
  prompt: string;
  selectedServices: string[];
  onPromptChange: (prompt: string) => void;
  onServicesChange: (services: string[]) => void;
  selectedRepo?: Project;
}

const AWS_SERVICES = [
  'EC2', 'S3', 'RDS', 'Lambda', 'CloudFront', 
  'Route 53', 'ELB', 'CloudWatch', 'IAM', 'API Gateway'
];

const AIConfiguration = ({ 
  prompt, 
  selectedServices, 
  onPromptChange, 
  onServicesChange, 
  selectedRepo 
}: AIConfigurationProps) => {
  const [isGenerating, setIsGenerating] = useState(false);

  const addService = (service: string) => {
    if (!selectedServices.includes(service)) {
      onServicesChange([...selectedServices, service]);
      // Add service to prompt
      const serviceText = ` ${service}`;
      onPromptChange(prompt + serviceText);
    }
  };

  const removeService = (service: string) => {
    onServicesChange(selectedServices.filter(s => s !== service));
    // Remove service from prompt
    const updatedPrompt = prompt.replace(new RegExp(`\\s*${service}\\s*`, 'gi'), ' ').trim();
    onPromptChange(updatedPrompt);
  };

  const getRepoName = () => {
    if (selectedRepo?.github_repo_url) {
      const parts = selectedRepo.github_repo_url.split('/');
      return parts[parts.length - 1];
    }
    return selectedRepo?.name || 'Selected Repository';
  };

  return (
    <div>
      <div className="text-center mb-8">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Configure Infrastructure</h2>
        <p className="text-gray-600">Describe your application and desired AWS infrastructure</p>
      </div>

      {/* Selected Repository Info */}
      {selectedRepo && (
        <Card className="mb-6 bg-blue-50 border-blue-200">
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Bot className="h-5 w-5 text-blue-600" />
              <span className="font-medium text-blue-900">Configuring deployment for:</span>
              <Badge variant="secondary" className="bg-blue-100 text-blue-800">
                {getRepoName()}
              </Badge>
            </div>
          </CardContent>
        </Card>
      )}

      {/* AI Prompt Input */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Describe your application and infrastructure needs
        </label>
        <Textarea
          placeholder="Example: I'm deploying a React frontend with a Node.js API backend. I need a database for user data, file storage for images, and CDN for global distribution. The app should handle up to 10,000 concurrent users..."
          value={prompt}
          onChange={(e) => onPromptChange(e.target.value)}
          className="min-h-[120px] resize-none"
        />
        <p className="text-xs text-gray-500 mt-2">
          Be specific about your requirements, expected traffic, and any special needs
        </p>
      </div>

      {/* AWS Services Tags */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-700 mb-3">
          Popular AWS Services (click to add)
        </label>
        <div className="flex flex-wrap gap-2 mb-4">
          {AWS_SERVICES.map((service) => (
            <Button
              key={service}
              variant="outline"
              size="sm"
              onClick={() => addService(service)}
              disabled={selectedServices.includes(service)}
              className={`${
                selectedServices.includes(service) 
                  ? 'opacity-50 cursor-not-allowed' 
                  : 'hover:bg-blue-50 hover:border-blue-300'
              }`}
            >
              {service}
            </Button>
          ))}
        </div>

        {/* Selected Services */}
        {selectedServices.length > 0 && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Selected Services
            </label>
            <div className="flex flex-wrap gap-2">
              {selectedServices.map((service) => (
                <Badge 
                  key={service} 
                  variant="secondary" 
                  className="bg-blue-100 text-blue-800 flex items-center gap-1"
                >
                  {service}
                  <X 
                    className="h-3 w-3 cursor-pointer hover:text-blue-600" 
                    onClick={() => removeService(service)}
                  />
                </Badge>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* AI Enhancement Suggestion */}
      <Card className="bg-gradient-to-r from-purple-50 to-blue-50 border-purple-200">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-purple-600" />
            AI-Powered Infrastructure Design
          </CardTitle>
        </CardHeader>
        <CardContent>
          <CardDescription className="text-sm">
            Our AI will analyze your requirements and generate optimized infrastructure code, 
            including Terraform configurations, deployment scripts, and IAM policies tailored 
            to your specific needs.
          </CardDescription>
          <div className="mt-3 flex items-center gap-2 text-xs text-purple-700">
            <div className="w-2 h-2 bg-purple-600 rounded-full"></div>
            <span>Cost optimization recommendations included</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default AIConfiguration;