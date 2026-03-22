
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
  deployed_url: string | null;
  created_at: string;
  git_provider?: string | null;
}

const GitLabIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M22.65 14.39L12 22.13 1.35 14.39a.84.84 0 0 1-.3-.94l1.22-3.78 2.44-7.51A.42.42 0 0 1 4.82 2a.43.43 0 0 1 .58 0 .42.42 0 0 1 .11.18l2.44 7.49h8.1l2.44-7.51A.42.42 0 0 1 18.6 2a.43.43 0 0 1 .58 0 .42.42 0 0 1 .11.18l2.44 7.51L23 13.45a.84.84 0 0 1-.35.94z"/>
  </svg>
);

interface ProjectCardProps {
  project: Project;
  onEdit: (project: Project) => void;
  onDelete: (id: string) => void;
  onDeploy: (project: Project) => void;
  deploymentStatus?: string | null;
}

const ProjectCard = ({ project, onEdit, onDelete, onDeploy, deploymentStatus }: ProjectCardProps) => {
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

  // Get deployment status badge
  const getDeploymentStatusBadge = () => {
    if (!deploymentStatus) return null;

    // Map all statuses to simplified ones
    let simplifiedStatus = deploymentStatus;
    if (['cloning', 'installing', 'preparing', 'deploying'].includes(deploymentStatus)) {
      simplifiedStatus = 'deploying';
    }

    const statusConfig = {
      deploying: { color: 'bg-blue-100 text-blue-800', emoji: '🚀', label: 'Deploying' },
      completed: { color: 'bg-green-100 text-green-800', emoji: '✅', label: 'Completed' },
      failed: { color: 'bg-red-100 text-red-800', emoji: '❌', label: 'Failed' }
    };

    const config = statusConfig[simplifiedStatus as keyof typeof statusConfig];
    if (!config) return null;

    // Make completed status clickable if deployed_url exists
    if (simplifiedStatus === 'completed' && project.deployed_url) {
      return (
        <a
          href={project.deployed_url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block"
        >
          <Badge variant="secondary" className={`${config.color} flex items-center gap-1 text-xs hover:opacity-80 cursor-pointer transition-opacity`}>
            <span>{config.emoji}</span>
            {config.label}
          </Badge>
        </a>
      );
    }

    return (
      <Badge variant="secondary" className={`${config.color} flex items-center gap-1 text-xs`}>
        <span>{config.emoji}</span>
        {config.label}
      </Badge>
    );
  };

  return (
    <Card className="hover:shadow-lg transition-shadow h-full flex flex-col">
      <CardHeader className="pb-4">
        <div className="flex justify-between items-start mb-2">
          <div className="flex items-center gap-2">
            {project.git_provider === 'gitlab' ? <GitLabIcon className="h-5 w-5 text-gray-600" /> : <Github className="h-5 w-5 text-gray-600" />}
            <CardTitle className="text-xl">{getRepoName()}</CardTitle>
            {isPrivateRepo() ? (
              <Badge variant="secondary" className="bg-red-100 text-red-800 flex items-center gap-1 text-xs">
                <Lock className="h-3 w-3" />
                Private
              </Badge>
            ) : (
              <Badge variant="secondary" className="bg-green-100 text-green-800 flex items-center gap-1 text-xs">
                <Unlock className="h-3 w-3" />
                Public
              </Badge>
            )}
          </div>
          <div className="flex gap-1">
            <Button variant="ghost" size="sm" onClick={() => onEdit(project)}>
              <Edit className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="sm" onClick={() => onDelete(project.id)}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
        
        <CardDescription className="text-sm leading-relaxed">
          {project.description || 'No description provided'}
        </CardDescription>
        
        <div className="flex flex-wrap gap-2 mt-2">
          {project.branch_name && (
            <Badge variant="outline" className="text-xs">
              Branch: {project.branch_name}
            </Badge>
          )}
          {getDeploymentStatusBadge()}
        </div>
      </CardHeader>
      
      <CardContent className="pt-0 flex-1 flex flex-col justify-between">
        <div className="flex flex-wrap items-center gap-2 mb-4">
          {project.is_deployed && (
            <Badge variant="secondary" className="bg-green-100 text-green-800 text-xs">
              Deployed
            </Badge>
          )}
          {project.github_repo_url && (
            <a
              href={project.github_repo_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-gray-600 hover:text-gray-900 flex items-center gap-1 text-sm"
            >
              <ExternalLink className="h-4 w-4" />
              <span>View Repo</span>
            </a>
          )}
          {project.deployed_url && (
            <a
              href={project.deployed_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:text-blue-900 flex items-center gap-1 text-sm font-medium"
            >
              <ExternalLink className="h-4 w-4" />
              <span>Live App</span>
            </a>
          )}
        </div>
        
        <div className="flex justify-between items-center">
          <div className="text-sm text-gray-500">
            {new Date(project.created_at).toLocaleDateString()}
          </div>
          <Button 
            variant="secondary" 
            size="sm" 
            className="bg-blue-600 text-white hover:bg-blue-700" 
            onClick={() => onDeploy(project)}
          >
            Deploy
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

export default ProjectCard;
