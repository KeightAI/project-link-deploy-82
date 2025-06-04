
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
import { fetchUserRepositories, GitHubRepo } from '@/services/githubApi';
import { useToast } from '@/hooks/use-toast';
import { Github, Lock, Unlock } from 'lucide-react';

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
  }) => void;
  project?: Project | null;
}

const ProjectForm = ({ isOpen, onClose, onSubmit, project }: ProjectFormProps) => {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedRepo, setSelectedRepo] = useState<GitHubRepo | null>(null);
  const [branchName, setBranchName] = useState('main');
  const [isDeployed, setIsDeployed] = useState(false);
  const [repositories, setRepositories] = useState<GitHubRepo[]>([]);
  const [loadingRepos, setLoadingRepos] = useState(false);
  const { toast } = useToast();

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
      const repos = await fetchUserRepositories();
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
      setBranchName(repo.default_branch);
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

    onSubmit({
      name,
      description,
      github_repo_url: selectedRepo?.html_url || project?.github_repo_url || '',
      github_repo_id: selectedRepo?.id.toString() || project?.github_repo_id || '',
      branch_name: branchName,
      is_deployed: isDeployed,
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{project ? 'Edit Project' : 'Create New Deployment'}</DialogTitle>
          <DialogDescription>
            {project ? 'Update your project details.' : 'Select a GitHub repository to deploy.'}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {!project && (
            <div>
              <Label htmlFor="repository">GitHub Repository</Label>
              <Select onValueChange={handleRepoSelect} disabled={loadingRepos}>
                <SelectTrigger>
                  <SelectValue placeholder={loadingRepos ? "Loading repositories..." : "Select a repository"} />
                </SelectTrigger>
                <SelectContent>
                  {repositories.map((repo) => (
                    <SelectItem key={repo.id} value={repo.id.toString()}>
                      <div className="flex items-center gap-2">
                        <Github className="h-4 w-4" />
                        <span>{repo.name}</span>
                        {repo.private ? (
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
              required
            />
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
