
import { useState, useEffect, createContext, useContext, ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signOut: () => Promise<void>;
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

      // Handle session expiration or logout
      if (event === 'SIGNED_OUT' || !session) {
        console.log('User signed out, redirecting to main page');
        // Clear any cached data
        setUser(null);
        setSession(null);
        // Redirect to main page when logged out
        if (window.location.pathname !== '/auth') {
          window.location.href = '/auth';
        }
      }

      // Check if GitHub token is still valid when session exists
      if (session?.provider_token && event === 'TOKEN_REFRESHED') {
        try {
          const response = await fetch('https://api.github.com/user', {
            headers: {
              'Authorization': `token ${session.provider_token}`,
              'Accept': 'application/vnd.github.v3+json',
            },
          });

          if (response.status === 401) {
            console.log('GitHub token invalid after refresh, signing out');
            await supabase.auth.signOut();
          }
        } catch (error) {
          console.error('Error validating GitHub token:', error);
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

  return (
    <AuthContext.Provider value={{ user, session, loading, signOut }}>
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
