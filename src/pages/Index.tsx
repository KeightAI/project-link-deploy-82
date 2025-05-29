
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { LogIn, Github, Cloud, Zap } from 'lucide-react';

const Index = () => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (user && !loading) {
      navigate('/dashboard');
    }
  }, [user, loading, navigate]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-lg">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 to-blue-100">
      <div className="container mx-auto px-4 py-16">
        <div className="text-center mb-16">
          <h1 className="text-5xl font-bold text-gray-900 mb-6">
            Keight AI
          </h1>
          <p className="text-xl text-gray-600 mb-8 max-w-2xl mx-auto">
            Connect your GitHub repositories, generate Infrastructure as Code, 
            and deploy directly to AWS with automated CI/CD pipelines.
          </p>
          <Button 
            size="lg" 
            onClick={() => navigate('/auth')}
            className="px-8 py-3 text-lg bg-orange-600 hover:bg-orange-700"
          >
            <LogIn className="mr-2 h-5 w-5" />
            Get Started
          </Button>
        </div>

        <div className="grid md:grid-cols-3 gap-8 max-w-4xl mx-auto">
          <Card className="text-center border-orange-200">
            <CardHeader>
              <Github className="h-12 w-12 mx-auto text-orange-600 mb-4" />
              <CardTitle>GitHub Integration</CardTitle>
              <CardDescription>
                Connect your repositories and automatically sync your codebase for deployment.
              </CardDescription>
            </CardHeader>
          </Card>

          <Card className="text-center border-blue-200">
            <CardHeader>
              <Cloud className="h-12 w-12 mx-auto text-blue-600 mb-4" />
              <CardTitle>Infrastructure as Code</CardTitle>
              <CardDescription>
                Generate Terraform and CloudFormation templates automatically from your projects.
              </CardDescription>
            </CardHeader>
          </Card>

          <Card className="text-center border-orange-200">
            <CardHeader>
              <Zap className="h-12 w-12 mx-auto text-orange-600 mb-4" />
              <CardTitle>AWS Deployment</CardTitle>
              <CardDescription>
                Deploy to AWS with automated pipelines and real-time deployment tracking.
              </CardDescription>
            </CardHeader>
          </Card>
        </div>

        <div className="text-center mt-16">
          <Card className="max-w-2xl mx-auto border-blue-200">
            <CardHeader>
              <CardTitle className="text-2xl text-blue-900">Ready to deploy?</CardTitle>
              <CardDescription className="text-lg">
                Start deploying your GitHub projects to AWS in minutes.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button 
                size="lg" 
                onClick={() => navigate('/auth')}
                className="px-8 py-3 bg-blue-600 hover:bg-blue-700"
              >
                Start Deploying
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default Index;
