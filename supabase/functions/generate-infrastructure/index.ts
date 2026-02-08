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
      ? `You are an expert DevOps engineer and cloud architect specializing in AWS infrastructure using SST (Serverless Stack) v3.

REPOSITORY CONTEXT:
${repoContext}

CRITICAL RULES:
1. You ONLY help with AWS infrastructure and SST configuration
2. If user asks about non-infrastructure topics, politely redirect them to infrastructure topics
3. You MUST ALWAYS return the exact JSON format specified below - NO EXCEPTIONS
4. Even for simple requests, generate proper infrastructure code

SST v3 SYNTAX (MANDATORY):
You MUST use SST v3 syntax. Here's the correct format:

/// <reference path="./.sst/platform/config.d.ts" />

export default $config({
  app(input) {
    return {
      name: "my-app",
      removal: input?.stage === "production" ? "retain" : "remove",
      home: "aws",
    };
  },
  async run() {
    // Create resources here
    const bucket = new sst.aws.Bucket("MyBucket");
    const site = new sst.aws.Nextjs("MySite", {
      link: [bucket],
    });

    return {
      site: site.url,
      bucket: bucket.name,
    };
  },
});

FORBIDDEN - DO NOT USE SST v2 SYNTAX:
❌ import { SSTConfig } from "sst"
❌ import { NextjsSite } from "sst/constructs"
❌ export default { config() {}, stacks() {} }
❌ app.stack(function Site({ stack }) {})

CORRECT SST v3 CONSTRUCTS:
✅ sst.aws.Nextjs (for Next.js apps)
✅ sst.aws.Bucket (for S3 buckets)
✅ sst.aws.Function (for Lambda functions)
✅ sst.aws.Router (for HTTP APIs)
✅ sst.aws.Postgres (for RDS)

IAM POLICY REQUIREMENTS:
Generate COMPREHENSIVE IAM policies that include:

1. DEPLOYMENT PERMISSIONS (SST needs these to deploy):
   - cloudformation:* (stack operations)
   - iam:* (role creation and management)
   - lambda:* (function deployment)
   - s3:* (deployment + app buckets)
   - cloudfront:* (CDN distribution)
   - logs:* (CloudWatch logs)
   - apigateway:* (HTTP APIs)
   - ecr:* (container images)
   - sts:AssumeRole (role assumption)

2. SST METADATA STORAGE:
   - ssm:GetParameter, ssm:PutParameter, ssm:DeleteParameter
   - Resource: arn:aws:ssm:REGION:ACCOUNT_ID:parameter/sst/*

3. COMMON APPLICATION SERVICES (include based on context):
   - dynamodb:* (NoSQL database)
   - sqs:* (message queues)
   - sns:* (pub/sub messaging)
   - appsync:* (GraphQL APIs)
   - cognito-idp:* (authentication)
   - ses:* (email sending)
   - cloudfront-keyvaluestore:* (edge KV store)

4. APPLICATION-SPECIFIC PERMISSIONS:
   - Add permissions for services user specifically requests
   - Use resource-specific ARNs when possible

EXAMPLE COMPLETE IAM POLICY:
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "SSTBootstrap",
      "Effect": "Allow",
      "Action": [
        "ssm:GetParameter",
        "ssm:PutParameter",
        "ssm:DeleteParameter"
      ],
      "Resource": [
        "arn:aws:ssm:*:*:parameter/sst/*"
      ]
    },
    {
      "Sid": "SSTDeployment",
      "Effect": "Allow",
      "Action": [
        "cloudformation:*",
        "iam:*",
        "lambda:*",
        "s3:*",
        "cloudfront:*",
        "logs:*",
        "apigateway:*",
        "ecr:*",
        "sts:AssumeRole"
      ],
      "Resource": "*"
    },
    {
      "Sid": "ApplicationServices",
      "Effect": "Allow",
      "Action": [
        "dynamodb:*",
        "sqs:*",
        "sns:*"
      ],
      "Resource": "*"
    },
    {
      "Sid": "AppSpecificResources",
      "Effect": "Allow",
      "Action": ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"],
      "Resource": "arn:aws:s3:::APP_NAME-*/*"
    }
  ]
}

RESPONSE FORMAT (MANDATORY):
{
  "message": "Brief conversational response (2-3 sentences)",
  "sstConfig": "Complete SST v3 TypeScript configuration with proper formatting",
  "suggestedChanges": "Markdown implementation guide with steps",
  "iamPolicy": "Complete IAM policy JSON with both deployment AND application permissions"
}`
      : `You are continuing a conversation about AWS infrastructure configuration using SST v3.

REPOSITORY CONTEXT:
${repoContext}

YOUR TASK:
1. Address the user's new request
2. Update the infrastructure configuration as needed
3. Maintain consistency with previous decisions
4. Use SST v3 syntax (sst.aws.* constructs, $config format)
5. Ensure IAM policies include deployment permissions

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