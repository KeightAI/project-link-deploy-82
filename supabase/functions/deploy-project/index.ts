/// <reference lib="deno.ns" />
/// <reference lib="deno.unstable" />
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.31.0';
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Max-Age': '86400'
};
serve(async (req)=>{
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
    // Get environment variables
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Missing required environment variables');
    }
    // Create Supabase client with service role key for admin access
    const supabase = createClient(supabaseUrl, supabaseKey);
    console.log('Inserting deployment record...');
    // Insert deployment record
    const { data, error } = await supabase.from('deployments').insert([
      {
        repo_url: repoUrl,
        branch,
        stage,
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

