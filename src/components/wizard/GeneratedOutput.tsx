import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Copy, Download, CheckCircle, Code, Shield, Sparkles, Edit3, RefreshCw } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

interface WizardData {
  selectedRepo?: {
    id: string;
    name: string;
    github_repo_url: string | null;
  };
  aiPrompt?: string;
  selectedServices?: string[];
  generatedCode?: string;
  iamRole?: string;
}

interface GeneratedOutputProps {
  wizardData: WizardData;
  onCodeGenerated: (code: string, iam: string) => void;
  onEditPrompt: () => void;
  iterationCount?: number;
}

const GeneratedOutput = ({ wizardData, onCodeGenerated, onEditPrompt, iterationCount = 1 }: GeneratedOutputProps) => {
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedContent, setGeneratedContent] = useState({
    sstConfig: '',
    suggestedChanges: '',
    iamPolicy: ''
  });
  const { toast } = useToast();

  useEffect(() => {
    generateInfrastructure();
  }, []);

  const generateInfrastructure = async () => {
    setIsGenerating(true);
    
    try {
      console.log('Calling OpenAI to generate infrastructure...');
      
      const response = await supabase.functions.invoke('generate-infrastructure', {
        body: {
          prompt: wizardData.aiPrompt,
          selectedServices: wizardData.selectedServices || [],
          repoName: wizardData.selectedRepo?.name || 'Unknown',
          repoUrl: wizardData.selectedRepo?.github_repo_url || ''
        }
      });

      if (response.error) {
        throw new Error(response.error.message || 'Failed to generate infrastructure');
      }

      const { data } = response;
      
      const generatedContent = {
        sstConfig: data.sstConfig || '// Error generating SST configuration',
        suggestedChanges: data.suggestedChanges || '# Error\n\nFailed to generate suggested changes.',
        iamPolicy: data.iamPolicy || '# Error generating IAM policy'
      };

      setGeneratedContent(generatedContent);
      onCodeGenerated(generatedContent.sstConfig, generatedContent.iamPolicy);
      
      console.log('Infrastructure generated successfully');
      toast({
        title: "Generation Complete",
        description: "Infrastructure code has been generated successfully!",
      });
      
    } catch (error) {
      console.error('Error generating infrastructure:', error);
      toast({
        title: "Generation Failed",
        description: error instanceof Error ? error.message : "Failed to generate infrastructure. Please try again.",
        variant: "destructive",
      });
      
      // Fallback to show error in UI
      setGeneratedContent({
        sstConfig: `// Error generating SST configuration\n// ${error instanceof Error ? error.message : 'Unknown error'}`,
        suggestedChanges: `# Error\n\nFailed to generate suggested changes.\n\n${error instanceof Error ? error.message : 'Unknown error'}`,
        iamPolicy: "# Error: Failed to generate IAM policy"
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const copyToClipboard = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({
        title: "Copied!",
        description: `${label} copied to clipboard`,
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to copy to clipboard",
        variant: "destructive",
      });
    }
  };

  const downloadFile = (content: string, filename: string) => {
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  if (isGenerating) {
    return (
      <div className="text-center py-12">
        <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-600 mx-auto mb-4"></div>
        <h3 className="text-lg font-medium text-gray-900 mb-2">Generating Infrastructure Code</h3>
        <p className="text-gray-600">Our AI is analyzing your requirements and creating optimized configurations...</p>
        <div className="mt-4 flex justify-center">
          <div className="flex items-center gap-2 text-sm text-blue-600">
            <Sparkles className="h-4 w-4 animate-pulse" />
            <span>Optimizing for cost and performance</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="text-center mb-8">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Review & Deploy</h2>
        <p className="text-gray-600">Generated infrastructure code and deployment configuration</p>
        {iterationCount > 1 && (
          <div className="flex items-center justify-center gap-2 mt-2">
            <RefreshCw className="h-4 w-4 text-blue-600" />
            <span className="text-sm text-blue-600">Configuration updated (Iteration {iterationCount})</span>
          </div>
        )}
      </div>

      {/* Summary Card */}
      <Card className="mb-6 bg-green-50 border-green-200">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-green-800">
                <CheckCircle className="h-5 w-5" />
                Configuration Generated Successfully
              </CardTitle>
              <CardDescription className="text-green-700">
                Based on your requirements for <strong>{wizardData.selectedRepo?.name}</strong> using{' '}
                {wizardData.selectedServices?.join(', ') || 'selected AWS services'}
              </CardDescription>
            </div>
            <Button 
              variant="outline" 
              size="sm"
              onClick={onEditPrompt}
              className="border-green-300 text-green-800 hover:bg-green-100"
            >
              <Edit3 className="h-4 w-4 mr-2" />
              Edit Prompt
            </Button>
          </div>
        </CardHeader>
      </Card>

      {/* Generated Code Tabs */}
      <Tabs defaultValue="sst" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="sst">SST Config</TabsTrigger>
          <TabsTrigger value="changes">Suggested Changes</TabsTrigger>
          <TabsTrigger value="iam">IAM Policy</TabsTrigger>
        </TabsList>

        <TabsContent value="sst">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Code className="h-5 w-5" />
                  <CardTitle>SST Configuration</CardTitle>
                </div>
                <div className="flex gap-2">
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => copyToClipboard(generatedContent.sstConfig, 'SST configuration')}
                  >
                    <Copy className="h-4 w-4 mr-2" />
                    Copy
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => downloadFile(generatedContent.sstConfig, 'sst.config.ts')}
                  >
                    <Download className="h-4 w-4 mr-2" />
                    Download
                  </Button>
                </div>
              </div>
              <CardDescription>Modern infrastructure as code using SST v3</CardDescription>
            </CardHeader>
            <CardContent>
              <pre className="bg-gray-50 p-4 rounded-lg text-sm overflow-x-auto">
                <code>{generatedContent.sstConfig}</code>
              </pre>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="changes">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-5 w-5" />
                  <CardTitle>Suggested Changes</CardTitle>
                </div>
                <div className="flex gap-2">
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => copyToClipboard(generatedContent.suggestedChanges, 'Suggested changes')}
                  >
                    <Copy className="h-4 w-4 mr-2" />
                    Copy
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => downloadFile(generatedContent.suggestedChanges, 'suggested-changes.md')}
                  >
                    <Download className="h-4 w-4 mr-2" />
                    Download
                  </Button>
                </div>
              </div>
              <CardDescription>Implementation guide and best practices</CardDescription>
            </CardHeader>
            <CardContent>
              <pre className="bg-gray-50 p-4 rounded-lg text-sm overflow-x-auto whitespace-pre-wrap">
                <code>{generatedContent.suggestedChanges}</code>
              </pre>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="iam">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Shield className="h-5 w-5" />
                  <CardTitle>IAM Policy</CardTitle>
                </div>
                <div className="flex gap-2">
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => copyToClipboard(generatedContent.iamPolicy, 'IAM policy')}
                  >
                    <Copy className="h-4 w-4 mr-2" />
                    Copy
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => downloadFile(generatedContent.iamPolicy, 'iam-policy.json')}
                  >
                    <Download className="h-4 w-4 mr-2" />
                    Download
                  </Button>
                </div>
              </div>
              <CardDescription>
                Add this IAM policy to your AWS Management Console for deployment permissions
              </CardDescription>
            </CardHeader>
            <CardContent>
              <pre className="bg-gray-50 p-4 rounded-lg text-sm overflow-x-auto">
                <code>{generatedContent.iamPolicy}</code>
              </pre>
              <div className="mt-4 p-4 bg-amber-50 border border-amber-200 rounded-lg">
                <div className="flex items-start gap-2">
                  <Shield className="h-5 w-5 text-amber-600 mt-0.5" />
                  <div>
                    <h4 className="font-medium text-amber-800">AWS Setup Required</h4>
                    <p className="text-sm text-amber-700 mt-1">
                      Create an IAM role in your AWS Management Console and attach this policy 
                      to enable the deployment process.
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default GeneratedOutput;