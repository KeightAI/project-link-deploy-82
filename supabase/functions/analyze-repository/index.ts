import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { repoUrl, githubToken, token, provider = 'github' } = await req.json();
    const authToken = token || githubToken; // backward compat

    console.log('Analyzing repository:', repoUrl, 'provider:', provider);

    let response: Response;

    if (provider === 'gitlab') {
      // Extract GitLab project path from URL
      const glMatch = repoUrl.match(/gitlab\.com\/(.+?)(?:\.git)?$/);
      if (!glMatch) {
        throw new Error('Invalid GitLab URL format');
      }
      const projectPath = encodeURIComponent(glMatch[1]);
      console.log(`Fetching package.json from GitLab project: ${glMatch[1]}`);

      response = await fetch(
        `https://gitlab.com/api/v4/projects/${projectPath}/repository/files/package.json?ref=HEAD`,
        {
          headers: {
            Authorization: `Bearer ${authToken}`,
          },
        }
      );
    } else {
      // GitHub
      const urlMatch = repoUrl.match(/github\.com\/([^\/]+)\/([^\/]+)/);
      if (!urlMatch) {
        throw new Error('Invalid GitHub URL format');
      }

      const [, owner, repo] = urlMatch;
      const cleanRepo = repo.replace(/\.git$/, '');
      console.log(`Fetching package.json for ${owner}/${cleanRepo}`);

      response = await fetch(
        `https://api.github.com/repos/${owner}/${cleanRepo}/contents/package.json`,
        {
          headers: {
            Authorization: `token ${authToken}`,
            Accept: 'application/vnd.github.v3+json',
          },
        }
      );
    }

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`${provider} API error (${response.status}):`, errorText);

      if (response.status === 404) {
        return new Response(
          JSON.stringify({
            framework: null,
            buildTool: null,
            dependencies: [],
            buildCommand: null,
            outputDir: null,
            analyzedAt: new Date().toISOString(),
            error: 'package.json not found'
          }),
          {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }

      throw new Error(`Failed to fetch package.json: ${response.statusText}`);
    }

    const data = await response.json();

    // Both GitHub and GitLab return base64 content in data.content
    const content = atob(data.content.replace(/\n/g, ''));
    const packageJson = JSON.parse(content);

    console.log('Successfully parsed package.json');

    // Analyze package.json
    const analysis = {
      framework: detectFramework(packageJson),
      buildTool: detectBuildTool(packageJson),
      dependencies: Object.keys(packageJson.dependencies || {}),
      buildCommand: packageJson.scripts?.build || null,
      outputDir: detectOutputDir(packageJson),
      analyzedAt: new Date().toISOString(),
    };

    console.log('Analysis complete:', {
      framework: analysis.framework,
      buildTool: analysis.buildTool,
      depCount: analysis.dependencies.length
    });

    return new Response(JSON.stringify(analysis), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    console.error('Repository analysis error:', error);

    return new Response(
      JSON.stringify({
        error: error.message || 'Unknown error during analysis',
        framework: null,
        buildTool: null,
        dependencies: [],
        buildCommand: null,
        outputDir: null,
        analyzedAt: new Date().toISOString(),
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});

/**
 * Detect framework from package.json dependencies
 */
function detectFramework(packageJson: any): string | null {
  const deps = {
    ...packageJson.dependencies,
    ...packageJson.devDependencies,
  };

  // Check for frameworks in order of specificity
  if (deps['next']) return 'Next.js';
  if (deps['@remix-run/react'] || deps['@remix-run/node']) return 'Remix';
  if (deps['astro']) return 'Astro';
  if (deps['nuxt']) return 'Nuxt';
  if (deps['@angular/core']) return 'Angular';
  if (deps['vue']) return 'Vue';
  if (deps['svelte']) return 'Svelte';
  if (deps['solid-js']) return 'SolidJS';
  if (deps['react']) return 'React';
  if (deps['preact']) return 'Preact';

  return null;
}

/**
 * Detect build tool from package.json
 */
function detectBuildTool(packageJson: any): string | null {
  const deps = {
    ...packageJson.dependencies,
    ...packageJson.devDependencies,
  };

  const scripts = packageJson.scripts || {};
  const buildScript = scripts.build || '';

  // Check for build tools in dependencies and build scripts
  if (deps['vite'] || deps['@vitejs/plugin-react'] || buildScript.includes('vite')) {
    return 'Vite';
  }

  if (deps['webpack'] || deps['webpack-cli'] || buildScript.includes('webpack')) {
    return 'Webpack';
  }

  if (deps['esbuild'] || buildScript.includes('esbuild')) {
    return 'esbuild';
  }

  if (deps['rollup'] || buildScript.includes('rollup')) {
    return 'Rollup';
  }

  if (deps['parcel'] || buildScript.includes('parcel')) {
    return 'Parcel';
  }

  if (deps['turbopack'] || buildScript.includes('turbo')) {
    return 'Turbopack';
  }

  // Framework-specific build tools
  if (deps['next']) return 'Next.js (built-in)';
  if (deps['@remix-run/dev']) return 'Remix (built-in)';
  if (deps['astro']) return 'Astro (built-in)';
  if (deps['@angular/cli']) return 'Angular CLI';

  return null;
}

/**
 * Detect output directory from package.json and build scripts
 */
function detectOutputDir(packageJson: any): string | null {
  const scripts = packageJson.scripts || {};
  const buildScript = scripts.build || '';

  // Check build script for explicit output directory flags
  if (buildScript.includes('--outDir dist')) return 'dist';
  if (buildScript.includes('--outDir build')) return 'build';
  if (buildScript.includes('--outDir public')) return 'public';
  if (buildScript.includes('--out-dir dist')) return 'dist';
  if (buildScript.includes('--out-dir build')) return 'build';

  // Framework-specific defaults
  const deps = {
    ...packageJson.dependencies,
    ...packageJson.devDependencies,
  };

  if (deps['next']) return '.next';
  if (deps['astro']) return 'dist';
  if (deps['@remix-run/react']) return 'build';
  if (deps['vite']) return 'dist';
  if (deps['@angular/core']) return 'dist';

  // Default for most build tools
  return 'dist';
}
