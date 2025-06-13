import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.31.0'

interface DeploymentRequest {
  repoUrl: string
  branch?: string
  stage?: string
}

serve(async (req) => {
  try {
    const { repoUrl, branch = 'main', stage = 'production' } = await req.json() as DeploymentRequest

    if (!repoUrl) {
      return new Response(
        JSON.stringify({ error: 'Repository URL is required' }), 
        { status: 400 }
      )
    }

    // Create Supabase client
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    )

    // Insert deployment record
    const { data, error } = await supabase
      .from('deployments')
      .insert([
        {
          repo_url: repoUrl,
          branch,
          stage,
          status: 'pending',
          created_at: new Date().toISOString()
        }
      ])
      .select()
      .single()

    if (error) throw error

    return new Response(
      JSON.stringify({
        deploymentId: data.id,
        status: 'pending',
        message: 'Deployment queued successfully'
      }),
      { 
        headers: { 'Content-Type': 'application/json' },
        status: 200 
      }
    )
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500 }
    )
  }
})