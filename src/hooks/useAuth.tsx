
import { useState, useEffect, createContext, useContext, ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

export type GitProvider = 'github' | 'gitlab' | null;

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signOut: () => Promise<void>;
  provider: GitProvider;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const getSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    };

    getSession();

    const { data: listener } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log('Auth state change:', event, session);
      setSession(session);
      setUser(session?.user ?? null);

      // Handle session expiration or logout - only redirect from dashboard/protected pages
      if (event === 'SIGNED_OUT' || !session) {
        console.log('User signed out, checking if redirect needed');
        // Clear any cached data
        setUser(null);
        setSession(null);
        // Only redirect to auth page if we're on a protected route (dashboard)
        if (window.location.pathname === '/dashboard') {
          window.location.href = '/auth';
        }
      }

      // Check if provider token is still valid when session exists
      if (session?.provider_token && event === 'TOKEN_REFRESHED') {
        try {
          const identities = session.user?.identities || [];
          const latestIdentity = [...identities].sort((a, b) =>
            new Date(b.last_sign_in_at || 0).getTime() - new Date(a.last_sign_in_at || 0).getTime()
          )[0];
          const currentProvider = latestIdentity?.provider;
          let validateUrl = 'https://api.github.com/user';
          let authHeader: Record<string, string> = {
            Authorization: `token ${session.provider_token}`,
            Accept: 'application/vnd.github.v3+json',
          };

          if (currentProvider === 'gitlab') {
            validateUrl = 'https://gitlab.com/api/v4/user';
            authHeader = { Authorization: `Bearer ${session.provider_token}` };
          }

          const response = await fetch(validateUrl, { headers: authHeader });

          if (response.status === 401) {
            console.log('Provider token invalid after refresh, signing out');
            await supabase.auth.signOut();
          }
        } catch (error) {
          console.error('Error validating provider token:', error);
        }
      }
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
    setSession(null);
    setUser(null);
  };

  const identities = session?.user?.identities || [];
  const latestIdentity = [...identities].sort((a, b) =>
    new Date(b.last_sign_in_at || 0).getTime() - new Date(a.last_sign_in_at || 0).getTime()
  )[0];
  const provider: GitProvider = (latestIdentity?.provider as GitProvider) || null;

  return (
    <AuthContext.Provider value={{ user, session, loading, signOut, provider }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
