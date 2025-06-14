
/// <reference lib="deno.ns" />
/// <reference lib="deno.unstable" />
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.9';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Max-Age': '86400'
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: corsHeaders
    });
  }
  try {
    const { repoUrl, branch = 'main', stage = 'production' } = await req.json();
    if (!repoUrl) {
      return new Response(JSON.stringify({
        error: 'Repository URL is required'
      }), {
        status: 400,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      });
    }

    const authorization = req.headers.get('Authorization');

    if (!authorization) {
      console.error('Authorization header is missing.');
      return new Response(JSON.stringify({ error: 'Authentication error: Missing authorization header.' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    // Create a Supabase client with the user's auth token to get user data
    const userSupabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authorization } } }
    );

    const { data: { user }, error: userError } = await userSupabaseClient.auth.getUser();

    if (userError || !user) {
        console.error('User auth error:', userError?.message);
        return new Response(JSON.stringify({ error: 'Authentication error: Could not get user.' }), {
            status: 401,
            headers: { 'Content-Type': 'application/json', ...corsHeaders },
        });
    }

    // Create Supabase client with service role key for admin access to insert data
    const supabase = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    console.log(`Inserting deployment record for user ${user.id}...`);
    
    // Insert deployment record with user_id
    const { data, error } = await supabase.from('deployments').insert([
      {
        repo_url: repoUrl,
        branch,
        stage,
        user_id: user.id, // Associate the deployment with the user
        status: 'pending',
        created_at: new Date().toISOString()
      }
    ]).select().single();
    
    if (error) {
      console.error('Database error:', error);
      throw error;
    }
    
    console.log('Deployment record created:', data);
    
    return new Response(JSON.stringify({
      deploymentId: data.id,
      status: 'pending',
      message: 'Deployment queued successfully'
    }), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      },
      status: 200
    });
  } catch (error) {
    console.error('Error in deploy function:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return new Response(JSON.stringify({
      error: errorMessage,
      status: 'error'
    }), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      },
      status: 500
    });
  }
});
