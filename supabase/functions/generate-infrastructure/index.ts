import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getSystemPrompt } from './prompts.ts';

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

    console.log('Checking for OpenAI API key...');
    const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
    if (!OPENAI_API_KEY) {
      console.error('OpenAI API key not found in environment');
      throw new Error('OpenAI API key not found');
    }
    console.log('OpenAI API key found');

    // Build repo context with detailed analysis
    let repoContext = `- Repository: ${repoName} (${repoUrl})`;
    if (repoAnalysis) {
      // Framework
      if (repoAnalysis.framework) {
        repoContext += `\n- Framework: ${repoAnalysis.framework}`;
      }

      // Build tool
      if (repoAnalysis.buildTool) {
        repoContext += `\n- Build Tool: ${repoAnalysis.buildTool}`;
      }

      // Build command
      if (repoAnalysis.buildCommand) {
        repoContext += `\n- Build Command: ${repoAnalysis.buildCommand}`;
      }

      // Output directory
      if (repoAnalysis.outputDir) {
        repoContext += `\n- Output Directory: ${repoAnalysis.outputDir}`;
      }

      // Dependencies (limit to top 15 to avoid overwhelming the prompt)
      if (repoAnalysis.dependencies && repoAnalysis.dependencies.length > 0) {
        const topDeps = repoAnalysis.dependencies.slice(0, 15);
        repoContext += `\n- Key Dependencies (${topDeps.length}/${repoAnalysis.dependencies.length}): ${topDeps.join(', ')}`;
        if (repoAnalysis.dependencies.length > 15) {
          repoContext += ` ...and ${repoAnalysis.dependencies.length - 15} more`;
        }
      }

      // Analysis timestamp
      if (repoAnalysis.analyzedAt) {
        repoContext += `\n- Last analyzed: ${repoAnalysis.analyzedAt}`;
      }
    }

    // Determine if this is first message or a follow-up
    const isFirstMessage = !conversationHistory || conversationHistory.length <= 1;

    // Get the system prompt from the prompts module
    const systemPrompt = getSystemPrompt({
      repoContext,
      isFirstMessage
    });

    console.log('Generating infrastructure...');

    // Build messages for the AI API
    const messages: any[] = [];

    // Add conversation history if available
    if (conversationHistory && conversationHistory.length > 0) {
      conversationHistory.forEach((msg: any) => {
        messages.push({
          role: msg.role === 'assistant' ? 'assistant' : 'user',
          content: msg.content,
        });
      });
    } else {
      // Single user message
      const userText = selectedServices && selectedServices.length > 0
        ? `Selected AWS Services: ${selectedServices.join(', ')}\n\n${currentMessage}`
        : currentMessage;
      messages.push({ role: 'user', content: userText });
    }

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        max_tokens: 4096,
        temperature: 0.7,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: systemPrompt },
          ...messages,
        ],
      }),
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.error('AI engine error:', errorData);
      throw new Error(`AI engine error: ${response.status}`);
    }

    const data = await response.json();
    const generatedContent = data.choices[0].message.content;

    // Parse the JSON response
    let parsedContent;
    try {
      parsedContent = JSON.parse(generatedContent);

      // Validate required fields exist
      if (!parsedContent.message || !parsedContent.sstConfig || !parsedContent.suggestedChanges || !parsedContent.iamPolicy) {
        throw new Error('Missing required fields in response');
      }

      console.log('AI response structure:', {
        hasMessage: !!parsedContent.message,
        hasSstConfig: !!parsedContent.sstConfig,
        hasSuggestedChanges: !!parsedContent.suggestedChanges,
        hasIamPolicy: !!parsedContent.iamPolicy,
      });
    } catch (parseError: any) {
      console.error('Failed to parse AI engine response:', parseError);
      console.error('Raw content was:', generatedContent);

      // Return user-friendly error
      parsedContent = {
        message: "I encountered an error generating your infrastructure. The response format was unexpected.",
        sstConfig: "// Error generating configuration",
        suggestedChanges: `# Error\n\nFailed to parse AI response. Please try again.\n\nError: ${parseError.message || 'Unknown error'}`,
        iamPolicy: "{}"
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
      sstConfig: "// Error generating configuration",
      suggestedChanges: "# Error\n\nFailed to generate suggested changes.",
      iamPolicy: "# Error generating IAM policy"
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});