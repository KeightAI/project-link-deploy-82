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

    const DUST_API_KEY = Deno.env.get('DUST_API_KEY');
    if (!DUST_API_KEY) {
      throw new Error('Dust API key not found');
    }

    const DUST_WORKSPACE_ID = 'SydwFOh7Iq';
    const DUST_APP_ID = 'CLUlCI2i24';

    const systemPrompt = `You are an expert DevOps engineer and cloud architect specializing in modern infrastructure-as-code. Generate production-ready SST (Serverless Stack) configuration based on user requirements.

Analyze the user's requirements and generate EXACTLY 3 code sections:
1. SST Configuration (TypeScript) - Modern infrastructure as code using SST v3
2. Suggested Changes - Detailed markdown guide for implementation steps and best practices
3. IAM Policy JSON - Security policies for AWS services

Requirements:
- Repository: ${repoName} (${repoUrl})
- Selected AWS Services: ${selectedServices.join(', ')}
- User Requirements: ${prompt}

Generate practical, production-ready SST configuration that follows AWS best practices. Focus on:
- SST v3 syntax with TypeScript
- Proper resource naming and organization
- Environment-specific configurations
- Security best practices

Return ONLY a valid JSON response with this exact structure:
{
  "sstConfig": "// SST configuration TypeScript code here...",
  "suggestedChanges": "# Suggested Changes\\n\\nDetailed implementation guide here...",
  "iamPolicy": "# IAM policy JSON here..."
}`;

    console.log('Generating infrastructure with Dust.tt...');

    const response = await fetch(`https://dust.tt/api/v1/w/${DUST_WORKSPACE_ID}/apps/${DUST_APP_ID}/runs`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${DUST_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        specification_hash: 'latest',
        config: {
          ANALYER: {
            provider_id: 'openai',
            model_id: 'gpt-4o-mini'
          }
        },
        inputs: [{
          requirements: `${prompt}\n\nRepository: ${repoName} (${repoUrl})\nSelected AWS Services: ${selectedServices.join(', ')}`
        }]
      }),
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.error('Dust.tt API error:', errorData);
      throw new Error(`Dust.tt API error: ${response.status}`);
    }

    const data = await response.json();
    console.log('Dust.tt response:', JSON.stringify(data, null, 2));
    
    // Extract the generated content from Dust.tt response
    const generatedContent = data.run?.results?.[0]?.[0]?.value || 
                            data.run?.traces?.[0]?.[0]?.value ||
                            JSON.stringify(data);

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
        sstConfig: `// Error parsing response\n// Raw content:\n${generatedContent}`,
        suggestedChanges: "# Error\n\nCould not parse infrastructure generation response.",
        iamPolicy: "# Error parsing response"
      };
    }

    return new Response(JSON.stringify(parsedContent), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error in generate-infrastructure function:', error);
    return new Response(JSON.stringify({ 
      error: errorMessage,
      sstConfig: "// Error generating SST configuration",
      suggestedChanges: "# Error\n\nFailed to generate suggested changes.",
      iamPolicy: "# Error generating IAM policy"
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});