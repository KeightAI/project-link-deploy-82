import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ExternalLink, Github, Trash2, Edit, Lock, Unlock } from 'lucide-react';

interface Project {
  id: string;
  name: string;
  description: string | null;
  github_repo_url: string | null;
  github_repo_id: string | null;
  branch_name: string | null;
  is_deployed: boolean | null;
  created_at: string;
}

interface ProjectCardProps {
  project: Project;
  onEdit: (project: Project) => void;
  onDelete: (id: string) => void;
  onDeploy: (project: Project) => void; // Add deploy handler
}

const ProjectCard = ({ project, onEdit, onDelete, onDeploy }: ProjectCardProps) => {
  // Extract repo name from URL if available
  const getRepoName = () => {
    if (project.github_repo_url) {
      const parts = project.github_repo_url.split('/');
      return parts[parts.length - 1];
    }
    return project.name;
  };

  // Check if repo is private based on the URL pattern or repo data
  const isPrivateRepo = () => {
    // This is a simplified check - in a real implementation, 
    // you might store this information in the database
    return false; // Default to public for now
  };

  return (
    <Card className="hover:shadow-2xl transition-shadow min-h-[320px] min-w-[340px] p-4 text-lg">
      <CardHeader className="pb-3">
        <div className="flex justify-between items-start">
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-3">
              <Github className="h-6 w-6 text-gray-600" />
              <CardTitle className="text-2xl">{getRepoName()}</CardTitle>
              {isPrivateRepo() ? (
                <Badge variant="secondary" className="bg-red-100 text-red-800 flex items-center gap-1">
                  <Lock className="h-4 w-4" />
                  Private
                </Badge>
              ) : (
                <Badge variant="secondary" className="bg-green-100 text-green-800 flex items-center gap-1">
                  <Unlock className="h-4 w-4" />
                  Public
                </Badge>
              )}
            </div>
            <CardDescription className="mt-3 text-base">
              {project.description || 'No description provided'}
            </CardDescription>
            {project.branch_name && (
              <div className="mt-3">
                <Badge variant="outline" className="text-base">
                  Branch: {project.branch_name}
                </Badge>
              </div>
            )}
          </div>
          <div className="flex flex-col gap-2">
            <Button variant="ghost" size="sm" onClick={() => onEdit(project)}>
              <Edit className="h-5 w-5" />
            </Button>
            <Button variant="ghost" size="sm" onClick={() => onDelete(project.id)}>
              <Trash2 className="h-5 w-5" />
            </Button>
            <Button variant="secondary" size="sm" className="mt-2 bg-blue-600 text-white hover:bg-blue-700" onClick={() => onDeploy(project)}>
              Deploy
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between">
          <div className="flex gap-3">
            {project.is_deployed && (
              <Badge variant="secondary" className="bg-green-100 text-green-800">
                Deployed
              </Badge>
            )}
            {project.github_repo_url && (
              <a
                href={project.github_repo_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-gray-600 hover:text-gray-900 flex items-center gap-1"
              >
                <ExternalLink className="h-5 w-5" />
                <span className="text-base">View Repo</span>
              </a>
            )}
          </div>
          <div className="text-base text-gray-500">
            {new Date(project.created_at).toLocaleDateString()}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default ProjectCard;
