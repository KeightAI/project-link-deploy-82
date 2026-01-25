import { GeneratedArtifacts } from '@/types/chat';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Copy, Download, Code, Sparkles, Shield, ExternalLink } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface CodePreviewPanelProps {
  artifacts: GeneratedArtifacts;
}

const CodePreviewPanel = ({ artifacts }: CodePreviewPanelProps) => {
  const { toast } = useToast();

  // Format JSON with proper indentation
  const formatJson = (jsonString: string): string => {
    try {
      const parsed = JSON.parse(jsonString);
      return JSON.stringify(parsed, null, 2);
    } catch {
      return jsonString;
    }
  };

  // Format TypeScript/JavaScript code by adding line breaks
  const formatCode = (code: string): string => {
    // Add line breaks after common code patterns for better readability
    return code
      .replace(/;/g, ';\n')
      .replace(/\{/g, '{\n')
      .replace(/\}/g, '\n}\n')
      .replace(/,(?!\s)/g, ',\n')
      .replace(/\n\s*\n\s*\n/g, '\n\n') // Remove excessive blank lines
      .trim();
  };

  const copyToClipboard = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({
        title: 'Copied!',
        description: `${label} copied to clipboard`,
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to copy to clipboard',
        variant: 'destructive',
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

  return (
    <div className="h-full flex flex-col bg-gray-50">
      {/* Header */}
      <div className="p-4 border-b bg-white">
        <h3 className="font-semibold flex items-center gap-2 text-gray-900">
          <Code className="h-5 w-5 text-blue-600" />
          Generated Infrastructure
        </h3>
        <p className="text-sm text-gray-500 mt-1">Review and deploy your configuration</p>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="sst" className="flex-1 flex flex-col overflow-hidden">
        <TabsList className="w-full justify-start px-4 bg-white border-b rounded-none">
          <TabsTrigger value="sst">SST Config</TabsTrigger>
          <TabsTrigger value="changes">Implementation Guide</TabsTrigger>
          <TabsTrigger value="iam">IAM Policy</TabsTrigger>
        </TabsList>

        {/* SST Config Tab */}
        <TabsContent value="sst" className="flex-1 overflow-auto m-0 p-4">
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base">SST Configuration</CardTitle>
                  <CardDescription className="text-xs">
                    Infrastructure as code using SST v3
                  </CardDescription>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => copyToClipboard(artifacts.sstConfig, 'SST configuration')}
                  >
                    <Copy className="h-3 w-3 mr-1" />
                    Copy
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => downloadFile(artifacts.sstConfig, 'sst.config.ts')}
                  >
                    <Download className="h-3 w-3 mr-1" />
                    Download
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <pre className="bg-gray-900 text-gray-100 p-4 rounded-lg text-xs overflow-auto font-mono max-h-[500px]">
                <code>{formatCode(artifacts.sstConfig)}</code>
              </pre>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Implementation Guide Tab */}
        <TabsContent value="changes" className="flex-1 overflow-auto m-0 p-4">
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Sparkles className="h-4 w-4" />
                    Implementation Guide
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Step-by-step instructions and best practices
                  </CardDescription>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      copyToClipboard(artifacts.suggestedChanges, 'Implementation guide')
                    }
                  >
                    <Copy className="h-3 w-3 mr-1" />
                    Copy
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => downloadFile(artifacts.suggestedChanges, 'implementation-guide.md')}
                  >
                    <Download className="h-3 w-3 mr-1" />
                    Download
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <pre className="bg-gray-50 p-4 rounded-lg text-xs overflow-x-auto whitespace-pre-wrap font-sans">
                {artifacts.suggestedChanges}
              </pre>
            </CardContent>
          </Card>
        </TabsContent>

        {/* IAM Policy Tab */}
        <TabsContent value="iam" className="flex-1 overflow-auto m-0 p-4">
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Shield className="h-4 w-4" />
                    IAM Policy
                  </CardTitle>
                  <CardDescription className="text-xs">
                    AWS permissions required for deployment
                  </CardDescription>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => copyToClipboard(artifacts.iamPolicy, 'IAM policy')}
                  >
                    <Copy className="h-3 w-3 mr-1" />
                    Copy
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => downloadFile(artifacts.iamPolicy, 'iam-policy.json')}
                  >
                    <Download className="h-3 w-3 mr-1" />
                    Download
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                <div className="flex items-start gap-2">
                  <Shield className="h-4 w-4 text-amber-600 mt-0.5 flex-shrink-0" />
                  <div className="flex-1">
                    <h4 className="font-medium text-amber-800 text-sm">AWS Setup Required</h4>
                    <p className="text-xs text-amber-700 mt-1">
                      Add this IAM policy to your AWS account to enable the deployment process.
                    </p>
                    <a
                      href="https://docs.aws.amazon.com/IAM/latest/UserGuide/access_policies_create-console.html#access_policies_create-json-editor"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-amber-800 hover:text-amber-900 underline mt-2"
                    >
                      View AWS IAM Documentation
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                </div>
              </div>
              <pre className="bg-gray-900 text-gray-100 p-4 rounded-lg text-xs overflow-auto font-mono max-h-[500px]">
                <code>{formatJson(artifacts.iamPolicy)}</code>
              </pre>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default CodePreviewPanel;
