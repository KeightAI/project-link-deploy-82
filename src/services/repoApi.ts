import { fetchUserRepositories as fetchGitHubRepos, GitHubRepo, writeFileToRepo as writeGitHub } from './githubApi';
import { fetchUserRepositories as fetchGitLabRepos, GitLabProject, writeFileToRepo as writeGitLab } from './gitlabApi';

export type GitProvider = 'github' | 'gitlab';

export interface NormalizedRepo {
  id: string;
  name: string;
  fullName: string;
  description: string | null;
  isPrivate: boolean;
  webUrl: string;
  defaultBranch: string;
  cloneUrl: string;
  provider: GitProvider;
}

export const fetchRepos = async (provider: GitProvider): Promise<NormalizedRepo[]> => {
  if (provider === 'github') {
    const repos = await fetchGitHubRepos();
    return repos.map((r) => ({
      id: r.id.toString(),
      name: r.name,
      fullName: r.full_name,
      description: r.description,
      isPrivate: r.private,
      webUrl: r.html_url,
      defaultBranch: r.default_branch,
      cloneUrl: r.clone_url,
      provider: 'github' as const,
    }));
  }

  const repos = await fetchGitLabRepos();
  return repos.map((r) => ({
    id: r.id.toString(),
    name: r.name,
    fullName: r.path_with_namespace,
    description: r.description,
    isPrivate: r.visibility === 'private',
    webUrl: r.web_url,
    defaultBranch: r.default_branch,
    cloneUrl: r.http_url_to_repo,
    provider: 'gitlab' as const,
  }));
};

export const writeFile = async (
  provider: GitProvider,
  repoIdentifier: string,
  content: string,
  token: string,
  branch: string
): Promise<void> => {
  if (provider === 'github') {
    return writeGitHub(repoIdentifier, content, token, branch);
  }
  return writeGitLab(repoIdentifier, content, token, branch);
};
