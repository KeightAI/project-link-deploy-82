import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Github, Plus, CheckCircle } from 'lucide-react';

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

interface RepoSelectionProps {
  projects: Project[];
  selectedRepo?: Project;
  onSelectRepo: (repo: Project) => void;
  onAddNew: () => void;
}

const RepoSelection = ({ projects, selectedRepo, onSelectRepo, onAddNew }: RepoSelectionProps) => {
  const getRepoName = (project: Project) => {
    if (project.github_repo_url) {
      const parts = project.github_repo_url.split('/');
      return parts[parts.length - 1];
    }
    return project.name;
  };

  return (
    <div>
      <div className="text-center mb-8">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Select Repository</h2>
        <p className="text-gray-600">Choose a GitHub repository for deployment or add a new one</p>
      </div>

      {projects.length === 0 ? (
        <div className="text-center py-12">
          <Github className="h-16 w-16 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No repositories found</h3>
          <p className="text-gray-600 mb-6">You need to add a repository first to proceed with deployment</p>
          <Button onClick={onAddNew} className="bg-blue-600 hover:bg-blue-700">
            <Plus className="h-4 w-4 mr-2" />
            Add Repository
          </Button>
        </div>
      ) : (
        <div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            {projects.map((project) => (
              <Card 
                key={project.id} 
                className={`cursor-pointer transition-all duration-200 hover:shadow-md ${
                  selectedRepo?.id === project.id 
                    ? 'ring-2 ring-blue-500 bg-blue-50' 
                    : 'hover:shadow-lg'
                }`}
                onClick={() => onSelectRepo(project)}
              >
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Github className="h-5 w-5 text-gray-600" />
                      <CardTitle className="text-lg">{getRepoName(project)}</CardTitle>
                    </div>
                    {selectedRepo?.id === project.id && (
                      <CheckCircle className="h-5 w-5 text-blue-600" />
                    )}
                  </div>
                  <CardDescription className="text-sm">
                    {project.description || 'No description provided'}
                  </CardDescription>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="flex flex-wrap gap-2">
                    {project.branch_name && (
                      <Badge variant="outline" className="text-xs">
                        Branch: {project.branch_name}
                      </Badge>
                    )}
                    {project.is_deployed ? (
                      <Badge variant="secondary" className="bg-blue-100 text-blue-800 text-xs">
                        Already deployed
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="bg-green-100 text-green-800 text-xs">
                        Ready for deployment
                      </Badge>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Add New Repository Option */}
          <Card className="border-2 border-dashed border-gray-300 hover:border-gray-400 transition-colors cursor-pointer">
            <CardContent className="flex flex-col items-center justify-center py-8" onClick={onAddNew}>
              <Plus className="h-12 w-12 text-gray-400 mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">Add New Repository</h3>
              <p className="text-gray-600 text-center">
                Connect a new GitHub repository to deploy
              </p>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
};

export default RepoSelection;