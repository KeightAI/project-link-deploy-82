
import { supabase } from '@/integrations/supabase/client';

export interface GitHubRepo {
  id: number;
  name: string;
  full_name: string;
  description: string | null;
  private: boolean;
  html_url: string;
  default_branch: string;
  clone_url: string;
}

const handleSessionExpired = async () => {
  console.log('GitHub session expired, logging out user');
  try {
    await supabase.auth.signOut();
    // Force immediate redirect
    window.location.href = '/';
  } catch (error) {
    console.error('Error during sign out:', error);
    // Force redirect even if sign out fails
    window.location.href = '/';
  }
};

export const fetchUserRepositories = async (): Promise<GitHubRepo[]> => {
  try {
    // Get the current session to access the GitHub token
    const { data: { session } } = await supabase.auth.getSession();
    
    if (!session?.provider_token) {
      console.log('No GitHub token found, redirecting to sign in');
      await handleSessionExpired();
      throw new Error('No GitHub token found. Please sign in with GitHub.');
    }

    const response = await fetch('https://api.github.com/user/repos?sort=updated&per_page=100', {
      headers: {
        'Authorization': `token ${session.provider_token}`,
        'Accept': 'application/vnd.github.v3+json',
      },
    });

    // Check if the token is invalid/expired
    if (response.status === 401) {
      console.error('GitHub token expired or invalid');
      await handleSessionExpired();
      throw new Error('GitHub session expired. Please sign in again.');
    }

    if (!response.ok) {
      throw new Error('Failed to fetch repositories');
    }

    const repos: GitHubRepo[] = await response.json();
    return repos;
  } catch (error) {
    console.error('Error fetching repositories:', error);
    
    // If it's a token-related error, make sure we handle session expiration
    if (error instanceof Error && 
        (error.message.includes('GitHub token') || error.message.includes('GitHub session'))) {
      // Don't re-throw the error, let the redirect happen
      return [];
    }
    
    throw error;
  }
};
