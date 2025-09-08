import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowLeft, ArrowRight, Github, CheckCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import RepoSelection from '@/components/wizard/RepoSelection';
import AIConfiguration from '@/components/wizard/AIConfiguration';
import GeneratedOutput from '@/components/wizard/GeneratedOutput';

interface Project {
  id: string;
  name: string;
  description: string | null;
  github_repo_url: string | null;
  github_repo_id: string | null;
  branch_name: string | null;
}

interface WizardData {
  selectedRepo?: Project;
  aiPrompt?: string;
  selectedServices?: string[];
  generatedCode?: string;
  iamRole?: string;
}

const DeploymentWizard = () => {
  const [currentStep, setCurrentStep] = useState(1);
  const [wizardData, setWizardData] = useState<WizardData>({});
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
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

  const handleNext = () => {
    if (currentStep < 3) {
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
      // Here you would typically save the deployment configuration
      // and trigger the deployment process
      toast({
        title: "Success",
        description: "Deployment wizard completed! Your configuration has been saved.",
      });
      navigate('/dashboard');
    } catch (error: any) {
      toast({
        title: "Error",
        description: "Failed to complete deployment wizard",
        variant: "destructive",
      });
    }
  };

  const canProceed = () => {
    switch (currentStep) {
      case 1:
        return wizardData.selectedRepo !== undefined;
      case 2:
        return wizardData.aiPrompt && wizardData.aiPrompt.trim().length > 0;
      case 3:
        return true;
      default:
        return false;
    }
  };

  const steps = [
    { number: 1, title: "Select Repository", description: "Choose your GitHub repository" },
    { number: 2, title: "Configure Infrastructure", description: "Describe your deployment needs" },
    { number: 3, title: "Review & Deploy", description: "Review generated configuration" }
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
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
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

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Progress Steps */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            {steps.map((step) => (
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
                {step.number < steps.length && (
                  <div className={`mx-8 h-0.5 w-20 ${
                    currentStep > step.number ? 'bg-blue-600' : 'bg-gray-300'
                  }`} />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Step Content */}
        <Card className="shadow-lg border-0">
          <CardContent className="p-8">
            {currentStep === 1 && (
              <RepoSelection
                projects={projects}
                selectedRepo={wizardData.selectedRepo}
                onSelectRepo={(repo) => updateWizardData({ selectedRepo: repo })}
                onAddNew={() => navigate('/dashboard')}
              />
            )}
            
            {currentStep === 2 && (
              <AIConfiguration
                prompt={wizardData.aiPrompt || ''}
                selectedServices={wizardData.selectedServices || []}
                onPromptChange={(prompt) => updateWizardData({ aiPrompt: prompt })}
                onServicesChange={(services) => updateWizardData({ selectedServices: services })}
                selectedRepo={wizardData.selectedRepo}
              />
            )}
            
            {currentStep === 3 && (
              <GeneratedOutput
                wizardData={wizardData}
                onCodeGenerated={(code, iam) => updateWizardData({ generatedCode: code, iamRole: iam })}
              />
            )}
          </CardContent>
        </Card>

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
          
          {currentStep === 3 ? (
            <Button 
              onClick={handleFinish}
              className="bg-gradient-to-r from-green-600 to-blue-600 hover:from-green-700 hover:to-blue-700"
            >
              <CheckCircle className="h-4 w-4 mr-2" />
              Finish
            </Button>
          ) : (
            <Button 
              onClick={handleNext}
              disabled={!canProceed()}
              className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700"
            >
              Next
              <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          )}
        </div>
      </main>
    </div>
  );
};

export default DeploymentWizard;