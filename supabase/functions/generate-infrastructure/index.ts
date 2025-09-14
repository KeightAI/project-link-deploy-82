import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { prompt, selectedServices, repoName, repoUrl } = await req.json();

    const OPENAI_API_KEY = Deno.env.get('OPEN_AI_KEY');
    if (!OPENAI_API_KEY) {
      throw new Error('OpenAI API key not found');
    }

    const systemPrompt = `You are an expert DevOps engineer and cloud architect. Generate production-ready infrastructure code based on user requirements.

Analyze the user's requirements and generate EXACTLY 4 code sections:
1. Terraform configuration for AWS infrastructure
2. Deployment script (bash/shell script)
3. Dockerfile for containerization
4. IAM policy JSON for security

Requirements:
- Repository: ${repoName} (${repoUrl})
- Selected AWS Services: ${selectedServices.join(', ')}
- User Requirements: ${prompt}

Generate practical, production-ready code that follows AWS best practices. Each section should be complete and functional.

Return ONLY a valid JSON response with this exact structure:
{
  "terraform": "# Terraform code here...",
  "deployScript": "#!/bin/bash\\n# Deploy script here...",
  "dockerfile": "# Dockerfile here...",
  "iamPolicy": "# IAM policy JSON here..."
}`;

    console.log('Generating infrastructure with OpenAI...');

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-5-2025-08-07',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Generate infrastructure for: ${prompt}` }
        ],
        max_completion_tokens: 4000,
      }),
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.error('OpenAI API error:', errorData);
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    const data = await response.json();
    const generatedContent = data.choices[0].message.content;

    console.log('Generated content:', generatedContent);

    // Parse the JSON response from GPT
    let parsedContent;
    try {
      // Extract JSON from the response (in case it's wrapped in markdown)
      const jsonMatch = generatedContent.match(/\{[\s\S]*\}/);
      const jsonString = jsonMatch ? jsonMatch[0] : generatedContent;
      parsedContent = JSON.parse(jsonString);
    } catch (parseError) {
      console.error('Failed to parse OpenAI response:', parseError);
      // Fallback with error message
      parsedContent = {
        terraform: `# Error parsing response\n# Raw content:\n${generatedContent}`,
        deployScript: "#!/bin/bash\necho 'Error: Could not parse infrastructure generation'",
        dockerfile: "# Error parsing response",
        iamPolicy: "# Error parsing response"
      };
    }

    return new Response(JSON.stringify(parsedContent), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in generate-infrastructure function:', error);
    return new Response(JSON.stringify({ 
      error: error.message,
      terraform: "# Error generating infrastructure",
      deployScript: "#!/bin/bash\necho 'Error generating deployment script'",
      dockerfile: "# Error generating Dockerfile", 
      iamPolicy: "# Error generating IAM policy"
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});