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

    const systemPrompt = isFirstMessage
      ? `You are an expert DevOps engineer and cloud architect specializing in AWS infrastructure using SST (Serverless Stack).

REPOSITORY CONTEXT:
${repoContext}

CRITICAL RULES:
1. You ONLY help with AWS infrastructure and SST configuration
2. If user asks about non-infrastructure topics (recipes, general questions, etc.), politely redirect them to infrastructure topics
3. You MUST ALWAYS return the exact JSON format specified below - NO EXCEPTIONS
4. Even for simple requests like "test prompt", generate proper infrastructure code

YOUR TASK FOR EVERY REQUEST:
1. Interpret the user's request in the context of AWS infrastructure
2. Generate a complete, working SST v3 configuration
3. Provide step-by-step implementation guidance
4. Generate appropriate IAM policies

RESPONSE FORMAT (MANDATORY):
You MUST return ONLY valid JSON with these EXACT field names:
{
  "message": "Brief conversational response (2-3 sentences)",
  "sstConfig": "Complete SST v3 TypeScript configuration",
  "suggestedChanges": "Markdown implementation guide with steps",
  "iamPolicy": "Complete IAM policy JSON"
}

Example: If user says "cheap short test", create a minimal Lambda+API Gateway setup for testing.
Example: If user asks for a cupcake recipe, respond: "I only help with AWS infrastructure. Would you like me to create a serverless API for a recipe app instead?"`
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

    // Build contents for Gemini API (matching AI Studio structure)
    const contents = [];

    // Add conversation history if available
    if (conversationHistory && conversationHistory.length > 0) {
      conversationHistory.forEach((msg: any) => {
        contents.push({
          role: msg.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: msg.content }]
        });
      });
    } else {
      // Single user message
      const userText = selectedServices && selectedServices.length > 0
        ? `Selected AWS Services: ${selectedServices.join(', ')}\n\n${currentMessage}`
        : currentMessage;
      contents.push({
        role: 'user',
        parts: [{ text: userText }]
      });
    }

    const response = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': GEMINI_API_KEY,
        },
        body: JSON.stringify({
          systemInstruction: {
            parts: [{ text: systemPrompt }]
          },
          contents,
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 4000,
            responseMimeType: "application/json",
            responseSchema: {
              type: "OBJECT",
              properties: {
                message: { type: "STRING" },
                sstConfig: { type: "STRING" },
                suggestedChanges: { type: "STRING" },
                iamPolicy: { type: "STRING" }
              },
              required: ["message", "sstConfig", "suggestedChanges", "iamPolicy"]
            }
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

    console.log('Raw Gemini response:', generatedContent);

    // Parse the JSON response from Gemini
    let parsedContent;
    try {
      // Gemini with responseMimeType: "application/json" returns pure JSON
      parsedContent = JSON.parse(generatedContent);

      // Validate required fields exist
      if (!parsedContent.message || !parsedContent.sstConfig || !parsedContent.suggestedChanges || !parsedContent.iamPolicy) {
        throw new Error('Missing required fields in response');
      }

      console.log('Gemini response structure:', {
        hasMessage: !!parsedContent.message,
        hasSstConfig: !!parsedContent.sstConfig,
        hasSuggestedChanges: !!parsedContent.suggestedChanges,
        hasIamPolicy: !!parsedContent.iamPolicy,
      });
    } catch (parseError: any) {
      console.error('Failed to parse Gemini response:', parseError);
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
      sstConfig: "// Error generating SST configuration",
      suggestedChanges: "# Error\n\nFailed to generate suggested changes.",
      iamPolicy: "# Error generating IAM policy"
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});