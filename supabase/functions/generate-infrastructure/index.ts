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
    const {
      conversationHistory,
      userMessage,
      selectedServices,
      repoName,
      repoUrl,
      repoAnalysis,
      // Backward compatibility
      prompt
    } = await req.json();

    // Use new format or fall back to old format
    const currentMessage = userMessage || prompt;

    const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
    if (!OPENAI_API_KEY) {
      throw new Error('OpenAI API key not found');
    }

    // Build repo context
    let repoContext = `- Repository: ${repoName} (${repoUrl})`;
    if (repoAnalysis) {
      repoContext += `\n- Framework: ${repoAnalysis.framework || 'Unknown'}`;
      if (repoAnalysis.dependencies && repoAnalysis.dependencies.length > 0) {
        repoContext += `\n- Dependencies: ${repoAnalysis.dependencies.join(', ')}`;
      }
    }

    // Determine if this is first message or a follow-up
    const isFirstMessage = !conversationHistory || conversationHistory.length <= 1;

    const systemPrompt = isFirstMessage
      ? `You are an expert DevOps engineer and cloud architect specializing in modern infrastructure-as-code. You're helping configure AWS infrastructure using SST (Serverless Stack).

REPOSITORY CONTEXT:
${repoContext}

YOUR TASK:
1. Respond conversationally to acknowledge the user's requirements
2. Generate production-ready SST v3 configuration
3. Provide implementation guidance
4. Generate IAM policy

CONVERSATION STYLE:
- Be friendly and conversational
- Explain your infrastructure decisions briefly
- Ask clarifying questions if requirements are vague
- Use technical language but keep it accessible

RESPONSE FORMAT:
Return ONLY a valid JSON response with this exact structure:
{
  "message": "Your conversational response here (2-3 sentences explaining what you've created)...",
  "sstConfig": "// SST TypeScript configuration...",
  "suggestedChanges": "# Implementation Guide\\n\\nDetailed steps...",
  "iamPolicy": "# IAM policy JSON..."
}`
      : `You are continuing a conversation about AWS infrastructure configuration using SST.

REPOSITORY CONTEXT:
${repoContext}

YOUR TASK:
1. Address the user's new request
2. Update the infrastructure configuration as needed
3. Maintain consistency with previous decisions
4. Explain what changed and why

Return the same JSON format as before.`;

    console.log('Generating infrastructure with OpenAI...');

    // Build messages array for OpenAI
    const messages = [{ role: 'system', content: systemPrompt }];

    // Add conversation history if available
    if (conversationHistory && conversationHistory.length > 0) {
      // Skip system messages, only include user/assistant
      conversationHistory.forEach((msg: any) => {
        if (msg.role !== 'system') {
          messages.push({
            role: msg.role,
            content: msg.content
          });
        }
      });
    } else {
      // Old format - single message
      messages.push({
        role: 'user',
        content: `${selectedServices && selectedServices.length > 0 ? `Selected AWS Services: ${selectedServices.join(', ')}\n\n` : ''}${currentMessage}`
      });
    }

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-5-2025-08-07',
        messages,
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

      // Ensure message field exists for backward compatibility
      if (!parsedContent.message) {
        parsedContent.message = "I've generated your infrastructure configuration based on your requirements.";
      }
    } catch (parseError) {
      console.error('Failed to parse OpenAI response:', parseError);
      // Fallback with error message
      parsedContent = {
        message: "I encountered an error generating your infrastructure. Please try again.",
        sstConfig: `// Error parsing response\n// Raw content:\n${generatedContent}`,
        suggestedChanges: "# Error\n\nCould not parse infrastructure generation response.",
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
      message: "I encountered an error while generating your infrastructure. Please try again.",
      sstConfig: "// Error generating SST configuration",
      suggestedChanges: "# Error\n\nFailed to generate suggested changes.",
      iamPolicy: "# Error generating IAM policy"
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});