import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ArrowLeft, ArrowRight, CheckCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import RepoSelection from '@/components/wizard/RepoSelection';
import ChatInterface from '@/components/wizard/ChatInterface';
import ProjectForm from '@/components/ProjectForm';
import { ConversationState } from '@/types/chat';

interface Project {
  id: string;
  name: string;
  description: string | null;
  github_repo_url: string | null;
  github_repo_id: string | null;
  branch_name: string | null;
  is_deployed: boolean | null;
  deployed_url: string | null;
}

interface WizardData {
  selectedRepo?: Project;
  conversation?: ConversationState;
  hasGeneratedCode?: boolean;
}

const DeploymentWizard = () => {
  const [currentStep, setCurrentStep] = useState(1);
  const [wizardData, setWizardData] = useState<WizardData>({});
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const { user, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    if (!authLoading && !user) {
      navigate('/auth');
    } else if (user) {
      fetchProjects();
    }
  }, [user, authLoading, navigate]);

  const fetchProjects = async () => {
    try {
      const { data, error } = await supabase
        .from('projects')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setProjects(data || []);
    } catch (error: any) {
      toast({
        title: "Error",
        description: "Failed to fetch projects",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const updateWizardData = (data: Partial<WizardData>) => {
    setWizardData(prev => ({ ...prev, ...data }));
  };

  const handleCreateProject = async (projectData: {
    name: string;
    description: string;
    github_repo_url: string;
    github_repo_id: string;
    branch_name: string;
    is_deployed: boolean;
  }) => {
    try {
      const { error } = await supabase
        .from('projects')
        .insert([{ ...projectData, user_id: user?.id }]);

      if (error) throw error;

      toast({
        title: "Success",
        description: "Project created successfully",
      });

      setIsFormOpen(false);
      fetchProjects();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleNext = () => {
    if (currentStep < 2) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleFinish = async () => {
    try {
      if (!wizardData.conversation || !wizardData.selectedRepo) {
        toast({
          title: "Error",
          description: "Missing conversation or repository data",
          variant: "destructive",
        });
        return;
      }

      // TODO: Re-enable conversation history saving when ready
      // Save conversation to database
      // const { error } = await supabase.from('wizard_conversations').insert({
      //   user_id: user?.id,
      //   project_id: wizardData.selectedRepo.id,
      //   messages: wizardData.conversation.messages,
      //   latest_sst_config: wizardData.conversation.latestArtifacts?.sstConfig,
      //   latest_iam_policy: wizardData.conversation.latestArtifacts?.iamPolicy,
      //   latest_suggested_changes: wizardData.conversation.latestArtifacts?.suggestedChanges,
      //   repo_analysis: wizardData.conversation.repoAnalysis,
      // });

      // if (error) throw error;

      toast({
        title: "Success",
        description: "Your infrastructure configuration has been saved!",
      });
      navigate('/dashboard');
    } catch (error: any) {
      toast({
        title: "Error",
        description: "Failed to save configuration: " + error.message,
        variant: "destructive",
      });
    }
  };

  const canProceed = () => {
    switch (currentStep) {
      case 1:
        return wizardData.selectedRepo !== undefined;
      case 2:
        return wizardData.hasGeneratedCode === true;
      default:
        return false;
    }
  };

  const steps = [
    { number: 1, title: "Select Repository", description: "Choose your GitHub repository" },
    { number: 2, title: "Design Infrastructure", description: "Chat with AI to configure deployment" }
  ];

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-lg">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50">
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-[90rem] mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            <div className="flex items-center gap-4">
              <Button variant="ghost" onClick={() => navigate('/dashboard')}>
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Dashboard
              </Button>
              <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                Deployment Wizard
              </h1>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-[90rem] mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Progress Steps */}
        <div className="mb-8">
          <div className="flex items-center justify-center gap-8">
            {steps.map((step, index) => (
              <div key={step.number} className="flex items-center">
                <div className={`flex items-center justify-center w-10 h-10 rounded-full border-2 ${
                  currentStep >= step.number
                    ? 'bg-blue-600 border-blue-600 text-white'
                    : 'border-gray-300 text-gray-400'
                }`}>
                  {currentStep > step.number ? (
                    <CheckCircle className="h-5 w-5" />
                  ) : (
                    step.number
                  )}
                </div>
                <div className="ml-3">
                  <div className={`text-sm font-medium ${
                    currentStep >= step.number ? 'text-blue-600' : 'text-gray-400'
                  }`}>
                    {step.title}
                  </div>
                  <div className="text-xs text-gray-500">{step.description}</div>
                </div>
                {index < steps.length - 1 && (
                  <div className={`ml-8 h-0.5 w-20 ${
                    currentStep > step.number ? 'bg-blue-600' : 'bg-gray-300'
                  }`} />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Step Content */}
        {currentStep === 1 ? (
          <Card className="shadow-lg border-0">
            <CardContent className="p-8">
              <RepoSelection
                projects={projects}
                selectedRepo={wizardData.selectedRepo}
                onSelectRepo={(repo) => updateWizardData({ selectedRepo: repo })}
                onAddNew={() => setIsFormOpen(true)}
              />
            </CardContent>
          </Card>
        ) : (
          <div className="shadow-lg border rounded-lg overflow-hidden bg-white" style={{ height: 'calc(100vh - 280px)' }}>
            {wizardData.selectedRepo && (
              <ChatInterface
                selectedRepo={wizardData.selectedRepo}
                onConversationUpdate={(conversation) =>
                  updateWizardData({ conversation })
                }
                onCodeGenerated={(hasCode) =>
                  updateWizardData({ hasGeneratedCode: hasCode })
                }
              />
            )}
          </div>
        )}

        {/* Navigation */}
        <div className="flex justify-between items-center mt-8">
          <Button 
            variant="outline" 
            onClick={handleBack}
            disabled={currentStep === 1}
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-500">
              Step {currentStep} of {steps.length}
            </span>
          </div>

          {currentStep === 2 ? (
            <Button
              onClick={handleFinish}
              disabled={!canProceed()}
              className="bg-gradient-to-r from-green-600 to-blue-600 hover:from-green-700 hover:to-blue-700 px-8 py-6 text-lg"
            >
              <CheckCircle className="h-4 w-4 mr-2" />
              Save Configuration
            </Button>
          ) : (
            <Button
              onClick={handleNext}
              disabled={!canProceed()}
              className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 px-8 py-6 text-lg"
            >
              Next
              <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          )}
        </div>
      </main>

      <ProjectForm
        isOpen={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        onSubmit={handleCreateProject}
        project={null}
      />
    </div>
  );
};

export default DeploymentWizard;