
import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { fetchRepos, NormalizedRepo } from '@/services/repoApi';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { Github, Lock, Unlock, AlertTriangle } from 'lucide-react';

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

interface ProjectFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: {
    name: string;
    description: string;
    github_repo_url: string;
    github_repo_id: string;
    branch_name: string;
    is_deployed: boolean;
    git_provider: string;
  }) => void;
  project?: Project | null;
}

const NAME_MAX = 20;

const ProjectForm = ({ isOpen, onClose, onSubmit, project }: ProjectFormProps) => {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedRepo, setSelectedRepo] = useState<NormalizedRepo | null>(null);
  const [branchName, setBranchName] = useState('main');
  const [isDeployed, setIsDeployed] = useState(false);
  const [repositories, setRepositories] = useState<NormalizedRepo[]>([]);
  const [loadingRepos, setLoadingRepos] = useState(false);
  const { toast } = useToast();
  const { provider } = useAuth();

  useEffect(() => {
    if (project) {
      setName(project.name);
      setDescription(project.description || '');
      setBranchName(project.branch_name || 'main');
      setIsDeployed(project.is_deployed || false);
      // For editing, we'll need to find the repo if it exists
      if (project.github_repo_id) {
        // We could fetch the specific repo details here if needed
      }
    } else {
      setName('');
      setDescription('');
      setSelectedRepo(null);
      setBranchName('main');
      setIsDeployed(false);
    }
  }, [project]);

  useEffect(() => {
    if (isOpen && !project) {
      loadRepositories();
    }
  }, [isOpen, project]);

  const loadRepositories = async () => {
    setLoadingRepos(true);
    try {
      const repos = await fetchRepos(provider || 'github');
      setRepositories(repos);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to fetch repositories",
        variant: "destructive",
      });
    } finally {
      setLoadingRepos(false);
    }
  };

  const handleRepoSelect = (repoId: string) => {
    const repo = repositories.find(r => r.id.toString() === repoId);
    if (repo) {
      setSelectedRepo(repo);
      setName(repo.name);
      setDescription(repo.description || '');
      setBranchName(repo.defaultBranch);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedRepo && !project) {
      toast({
        title: "Error",
        description: "Please select a repository",
        variant: "destructive",
      });
      return;
    }

    if (name.length > NAME_MAX) {
      toast({
        title: "Name too long",
        description: `Project name must be ${NAME_MAX} characters or fewer (used for AWS resource naming).`,
        variant: "destructive",
      });
      return;
    }

    onSubmit({
      name,
      description,
      github_repo_url: selectedRepo?.webUrl || project?.github_repo_url || '',
      github_repo_id: selectedRepo?.id.toString() || project?.github_repo_id || '',
      branch_name: branchName,
      is_deployed: isDeployed,
      git_provider: selectedRepo?.provider || provider || 'github',
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{project ? 'Edit Project' : 'Create New Deployment'}</DialogTitle>
          <DialogDescription>
            {project ? 'Update your project details.' : 'Select a repository to deploy.'}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {!project && (
            <div>
              <Label htmlFor="repository">Repository</Label>
              <Select onValueChange={handleRepoSelect} disabled={loadingRepos}>
                <SelectTrigger>
                  <SelectValue placeholder={loadingRepos ? "Loading repositories..." : "Select a repository"} />
                </SelectTrigger>
                <SelectContent>
                  {repositories.map((repo) => (
                    <SelectItem key={repo.id} value={repo.id.toString()}>
                      <div className="flex items-center gap-2">
                        {repo.provider === 'gitlab' ? (
                          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M22.65 14.39L12 22.13 1.35 14.39a.84.84 0 0 1-.3-.94l1.22-3.78 2.44-7.51A.42.42 0 0 1 4.82 2a.43.43 0 0 1 .58 0 .42.42 0 0 1 .11.18l2.44 7.49h8.1l2.44-7.51A.42.42 0 0 1 18.6 2a.43.43 0 0 1 .58 0 .42.42 0 0 1 .11.18l2.44 7.51L23 13.45a.84.84 0 0 1-.35.94z"/>
                          </svg>
                        ) : (
                          <Github className="h-4 w-4" />
                        )}
                        <span>{repo.name}</span>
                        {repo.isPrivate ? (
                          <Lock className="h-3 w-3 text-gray-500" />
                        ) : (
                          <Unlock className="h-3 w-3 text-gray-500" />
                        )}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          
          <div>
            <Label htmlFor="name">Project Name</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={name.length > NAME_MAX ? 'border-red-400 focus-visible:ring-red-400' : ''}
              required
            />
            <p className={`text-xs mt-1 ${name.length > NAME_MAX ? 'text-red-500 font-medium' : 'text-gray-400'}`}>
              {name.length}/{NAME_MAX} characters
            </p>
            {name.length > NAME_MAX && (
              <div className="mt-2 p-3 bg-red-50 border border-red-200 rounded-md">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 text-red-500 mt-0.5 flex-shrink-0" />
                  <div className="text-sm text-red-700">
                    <p className="font-medium">Name is {name.length - NAME_MAX} character{name.length - NAME_MAX > 1 ? 's' : ''} over the limit</p>
                    <p className="mt-1 text-red-600">
                      This name is used to generate AWS resource names (Lambda functions, CloudFormation stacks, IAM roles).
                      AWS enforces strict character limits on these resources, and a long project name will cause deployment failures.
                    </p>
                    <p className="mt-1 text-red-600">
                      Please shorten it to {NAME_MAX} characters or fewer.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
          
          <div>
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />
          </div>
          
          <div>
            <Label htmlFor="branch">Branch Name</Label>
            <Input
              id="branch"
              value={branchName}
              onChange={(e) => setBranchName(e.target.value)}
              placeholder="main"
              required
            />
          </div>
          
          <div className="flex items-center space-x-2">
            <Checkbox
              id="deployed"
              checked={isDeployed}
              onCheckedChange={(checked) => setIsDeployed(checked as boolean)}
            />
            <Label htmlFor="deployed">Project is deployed</Label>
          </div>
          
          <div className="flex gap-3 pt-4">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit">
              {project ? 'Update Project' : 'Create Deployment'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default ProjectForm;
