import { supabase } from '@/integrations/supabase/client';

export interface GitLabProject {
  id: number;
  name: string;
  path_with_namespace: string;
  description: string | null;
  visibility: string;
  web_url: string;
  default_branch: string;
  http_url_to_repo: string;
}

const handleSessionExpired = async () => {
  console.log('GitLab session expired, logging out user');
  try {
    await supabase.auth.signOut();
    window.location.href = '/auth';
  } catch (error) {
    console.error('Error during sign out:', error);
    window.location.href = '/auth';
  }
};

export const fetchUserRepositories = async (): Promise<GitLabProject[]> => {
  try {
    const { data: { session } } = await supabase.auth.getSession();

    if (!session?.provider_token) {
      console.log('No GitLab token found, redirecting to sign in');
      await handleSessionExpired();
      throw new Error('No GitLab token found. Please sign in with GitLab.');
    }

    const response = await fetch(
      'https://gitlab.com/api/v4/projects?membership=true&order_by=updated_at&per_page=100',
      {
        headers: {
          Authorization: `Bearer ${session.provider_token}`,
        },
      }
    );

    if (response.status === 401) {
      console.error('GitLab token expired or invalid');
      await handleSessionExpired();
      throw new Error('GitLab session expired. Please sign in again.');
    }

    if (!response.ok) {
      throw new Error('Failed to fetch repositories');
    }

    const projects: GitLabProject[] = await response.json();
    return projects;
  } catch (error) {
    console.error('Error fetching GitLab repositories:', error);

    if (error instanceof Error &&
        (error.message.includes('GitLab token') || error.message.includes('GitLab session'))) {
      return [];
    }

    throw error;
  }
};

export const readFileFromRepo = async (
  projectId: string,
  filePath: string,
  token: string,
  branch: string = 'main'
): Promise<string | null> => {
  const encodedPath = encodeURIComponent(filePath);
  const apiBase = `https://gitlab.com/api/v4/projects/${projectId}/repository/files/${encodedPath}?ref=${branch}`;
  const res = await fetch(apiBase, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) return null;
  const data = await res.json();
  return atob(data.content.replace(/\n/g, ''));
};

export const writeFileToRepo = async (
  projectId: string,
  content: string,
  token: string,
  branch: string = 'main',
  filePath: string = 'sst.config.ts'
): Promise<void> => {
  const apiBase = `https://gitlab.com/api/v4/projects/${projectId}/repository/files/${encodeURIComponent(filePath)}`;
  const headers = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };

  // Check if file exists
  const getRes = await fetch(`${apiBase}?ref=${branch}`, { headers });
  const fileExists = getRes.ok;

  const body = JSON.stringify({
    branch,
    content,
    commit_message: fileExists
      ? `chore: update ${filePath} via Keight`
      : `chore: add ${filePath} via Keight`,
    encoding: 'text',
  });

  const res = await fetch(apiBase, {
    method: fileExists ? 'PUT' : 'POST',
    headers,
    body,
  });

  if (!res.ok) {
    const err = await res.json();
    if (res.status === 404 || res.status === 403) {
      throw new Error(
        'GitLab push failed: your token may not have write access. Sign out and sign back in, then try again.'
      );
    }
    throw new Error(err.message || `GitLab API error: ${res.status}`);
  }
};
