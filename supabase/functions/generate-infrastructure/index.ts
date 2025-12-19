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
    console.log('Function invoked, parsing request body...');
    const requestBody = await req.json();
    console.log('Request body received:', JSON.stringify(requestBody, null, 2));

    const {
      conversationHistory,
      userMessage,
      selectedServices,
      repoName,
      repoUrl,
      repoAnalysis,
      // Backward compatibility
      prompt
    } = requestBody;

    // Use new format or fall back to old format
    const currentMessage = userMessage || prompt;

    console.log('Checking for Gemini API key...');
    const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
    if (!GEMINI_API_KEY) {
      console.error('Gemini API key not found in environment');
      throw new Error('Gemini API key not found');
    }
    console.log('Gemini API key found');

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

    console.log('Generating infrastructure with Gemini...');

    // Build prompt for Gemini
    let geminiPrompt = systemPrompt + '\n\n';

    // Add conversation history if available
    if (conversationHistory && conversationHistory.length > 0) {
      conversationHistory.forEach((msg: any) => {
        if (msg.role === 'user') {
          geminiPrompt += `User: ${msg.content}\n\n`;
        } else if (msg.role === 'assistant') {
          geminiPrompt += `Assistant: ${msg.content}\n\n`;
        }
      });
    } else {
      // Old format - single message
      geminiPrompt += `User: ${selectedServices && selectedServices.length > 0 ? `Selected AWS Services: ${selectedServices.join(', ')}\n\n` : ''}${currentMessage}\n\n`;
    }

    geminiPrompt += 'Assistant: ';

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: geminiPrompt
            }]
          }],
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 4000,
            responseMimeType: "application/json",
          },
        }),
      }
    );

    if (!response.ok) {
      const errorData = await response.text();
      console.error('Gemini API error:', errorData);
      throw new Error(`Gemini API error: ${response.status}`);
    }

    const data = await response.json();
    const generatedContent = data.candidates[0].content.parts[0].text;

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