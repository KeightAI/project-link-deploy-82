
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { LogIn, Folder, Github, Zap } from 'lucide-react';

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
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="container mx-auto px-4 py-16">
        <div className="text-center mb-16">
          <h1 className="text-5xl font-bold text-gray-900 mb-6">
            Project Manager
          </h1>
          <p className="text-xl text-gray-600 mb-8 max-w-2xl mx-auto">
            Organize, track, and showcase your development projects in one place. 
            Connect with GitHub and manage deployments effortlessly.
          </p>
          <Button 
            size="lg" 
            onClick={() => navigate('/auth')}
            className="px-8 py-3 text-lg"
          >
            <LogIn className="mr-2 h-5 w-5" />
            Get Started
          </Button>
        </div>

        <div className="grid md:grid-cols-3 gap-8 max-w-4xl mx-auto">
          <Card className="text-center">
            <CardHeader>
              <Folder className="h-12 w-12 mx-auto text-blue-600 mb-4" />
              <CardTitle>Organize Projects</CardTitle>
              <CardDescription>
                Keep all your projects organized with descriptions, status tracking, and more.
              </CardDescription>
            </CardHeader>
          </Card>

          <Card className="text-center">
            <CardHeader>
              <Github className="h-12 w-12 mx-auto text-blue-600 mb-4" />
              <CardTitle>GitHub Integration</CardTitle>
              <CardDescription>
                Link your projects to GitHub repositories for seamless version control.
              </CardDescription>
            </CardHeader>
          </Card>

          <Card className="text-center">
            <CardHeader>
              <Zap className="h-12 w-12 mx-auto text-blue-600 mb-4" />
              <CardTitle>Deployment Tracking</CardTitle>
              <CardDescription>
                Track which projects are live and deployed with status indicators.
              </CardDescription>
            </CardHeader>
          </Card>
        </div>

        <div className="text-center mt-16">
          <Card className="max-w-2xl mx-auto">
            <CardHeader>
              <CardTitle className="text-2xl">Ready to get organized?</CardTitle>
              <CardDescription className="text-lg">
                Sign up now and start managing your projects like a pro.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button 
                size="lg" 
                onClick={() => navigate('/auth')}
                className="px-8 py-3"
              >
                Create Account
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default Index;
