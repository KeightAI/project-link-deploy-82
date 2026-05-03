import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SOURCE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mts', '.mjs'];
const EXCLUDE_DIRS = ['node_modules', '.next', 'dist', 'build', '.git', '.sst', 'coverage', '.turbo'];
const MAX_FILES_TO_SCAN = 20;
const MAX_FILE_SIZE = 50000; // 50kb — skip large generated files

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { repoUrl, githubToken, token, provider = 'github' } = await req.json();
    const authToken = token || githubToken;

    console.log('Analyzing repository:', repoUrl, 'provider:', provider);

    // ── 1. Resolve owner/repo identifiers ──────────────────────────────────
    let githubOwner = '', githubRepo = '', gitlabProjectPath = '';

    if (provider === 'gitlab') {
      const glMatch = repoUrl.match(/gitlab\.com\/(.+?)(?:\.git)?$/);
      if (!glMatch) throw new Error('Invalid GitLab URL format');
      gitlabProjectPath = encodeURIComponent(glMatch[1]);
    } else {
      const urlMatch = repoUrl.match(/github\.com\/([^\/]+)\/([^\/]+)/);
      if (!urlMatch) throw new Error('Invalid GitHub URL format');
      githubOwner = urlMatch[1];
      githubRepo = urlMatch[2].replace(/\.git$/, '');
    }

    const ghHeaders = {
      Authorization: `token ${authToken}`,
      Accept: 'application/vnd.github.v3+json',
    };
    const glHeaders = { Authorization: `Bearer ${authToken}` };

    // ── 2. Fetch package.json ───────────────────────────────────────────────
    let packageJson: any = {};
    try {
      const pkgRes = provider === 'gitlab'
        ? await fetch(`https://gitlab.com/api/v4/projects/${gitlabProjectPath}/repository/files/package.json?ref=HEAD`, { headers: glHeaders })
        : await fetch(`https://api.github.com/repos/${githubOwner}/${githubRepo}/contents/package.json`, { headers: ghHeaders });

      if (pkgRes.ok) {
        const pkgData = await pkgRes.json();
        packageJson = JSON.parse(atob(pkgData.content.replace(/\n/g, '')));
      }
    } catch (e) {
      console.warn('Could not fetch package.json:', e);
    }

    // ── 3. Fetch file tree ─────────────────────────────────────────────────
    let allFiles: string[] = [];
    try {
      if (provider === 'github') {
        const treeRes = await fetch(
          `https://api.github.com/repos/${githubOwner}/${githubRepo}/git/trees/HEAD?recursive=1`,
          { headers: ghHeaders }
        );
        if (treeRes.ok) {
          const treeData = await treeRes.json();
          allFiles = (treeData.tree || [])
            .filter((f: any) => f.type === 'blob')
            .map((f: any) => f.path);
        }
      } else {
        // GitLab: fetch root tree then recurse one level
        const treeRes = await fetch(
          `https://gitlab.com/api/v4/projects/${gitlabProjectPath}/repository/tree?recursive=true&per_page=100&ref=HEAD`,
          { headers: glHeaders }
        );
        if (treeRes.ok) {
          const treeData = await treeRes.json();
          allFiles = (treeData || [])
            .filter((f: any) => f.type === 'blob')
            .map((f: any) => f.path);
        }
      }
    } catch (e) {
      console.warn('Could not fetch file tree:', e);
    }

    // ── 4. Pick source files to scan ───────────────────────────────────────
    const sourceFiles = allFiles
      .filter((p) => {
        const ext = '.' + p.split('.').pop();
        if (!SOURCE_EXTENSIONS.includes(ext)) return false;
        return !EXCLUDE_DIRS.some((d) => p.startsWith(d + '/') || p.includes('/' + d + '/'));
      })
      // Prioritise files in app/, src/, pages/, api/
      .sort((a, b) => {
        const priority = (p: string) =>
          p.startsWith('app/') || p.startsWith('src/') || p.startsWith('pages/') ? 0 : 1;
        return priority(a) - priority(b);
      })
      .slice(0, MAX_FILES_TO_SCAN);

    console.log(`Scanning ${sourceFiles.length} source files`);

    // ── 5. Fetch and scan source files concurrently ────────────────────────
    const fileContents = await Promise.all(
      sourceFiles.map(async (filePath) => {
        try {
          let content = '';
          if (provider === 'github') {
            const res = await fetch(
              `https://api.github.com/repos/${githubOwner}/${githubRepo}/contents/${filePath}`,
              { headers: ghHeaders }
            );
            if (res.ok) {
              const data = await res.json();
              if (data.size < MAX_FILE_SIZE) {
                content = atob(data.content.replace(/\n/g, ''));
              }
            }
          } else {
            const res = await fetch(
              `https://gitlab.com/api/v4/projects/${gitlabProjectPath}/repository/files/${encodeURIComponent(filePath)}?ref=HEAD`,
              { headers: glHeaders }
            );
            if (res.ok) {
              const data = await res.json();
              content = atob(data.content.replace(/\n/g, ''));
            }
          }
          return { path: filePath, content };
        } catch {
          return { path: filePath, content: '' };
        }
      })
    );

    // ── 6. Extract signals from source files ───────────────────────────────
    const awsSdkUsage = new Set<string>();
    const envVars = new Set<string>();
    const dbLibraries = new Set<string>();
    const externalServices = new Set<string>();
    let hasApiRoutes = false;

    const DB_PATTERNS = ['prisma', '@prisma/client', 'drizzle-orm', 'mongoose', 'pg', 'mysql2', 'better-sqlite3', '@planetscale/database', '@neondatabase/serverless'];
    const SERVICE_PATTERNS = ['stripe', '@stripe/stripe-js', 'resend', '@sendgrid/mail', 'nodemailer', 'clerk', '@clerk/nextjs', 'next-auth', 'lucia', 'pusher', 'uploadthing', 'cloudinary'];

    for (const { path, content } of fileContents) {
      if (!content) continue;

      // Detect Next.js API routes
      if (path.includes('/api/') || path.match(/\/route\.(ts|js)$/)) {
        hasApiRoutes = true;
      }

      // AWS SDK imports: from '@aws-sdk/client-s3'
      const awsMatches = content.matchAll(/from ['"](@aws-sdk\/[^'"]+)['"]/g);
      for (const m of awsMatches) awsSdkUsage.add(m[1]);

      // Also catch: require('@aws-sdk/...')
      const awsRequires = content.matchAll(/require\(['"](@aws-sdk\/[^'"]+)['"]\)/g);
      for (const m of awsRequires) awsSdkUsage.add(m[1]);

      // SST Resource usage
      if (content.includes("from 'sst'") || content.includes('Resource.')) {
        // Already using SST resources — note which ones
        const resourceMatches = content.matchAll(/Resource\.(\w+)/g);
        for (const m of resourceMatches) awsSdkUsage.add(`sst:Resource:${m[1]}`);
      }

      // Env vars: process.env.VAR_NAME
      const envMatches = content.matchAll(/process\.env\.([A-Z_][A-Z0-9_]+)/g);
      for (const m of envMatches) envVars.add(m[1]);

      // DB libraries
      for (const lib of DB_PATTERNS) {
        if (content.includes(`'${lib}'`) || content.includes(`"${lib}"`)) {
          dbLibraries.add(lib);
        }
      }

      // External services
      for (const lib of SERVICE_PATTERNS) {
        if (content.includes(`'${lib}'`) || content.includes(`"${lib}"`)) {
          externalServices.add(lib);
        }
      }
    }

    // ── 7. Build analysis result ───────────────────────────────────────────
    const analysis = {
      framework: detectFramework(packageJson),
      buildTool: detectBuildTool(packageJson),
      dependencies: Object.keys({ ...packageJson.dependencies, ...packageJson.devDependencies }),
      buildCommand: packageJson.scripts?.build || null,
      outputDir: detectOutputDir(packageJson),
      analyzedAt: new Date().toISOString(),
      // New fields
      awsSdkUsage: [...awsSdkUsage],
      envVars: [...envVars],
      hasApiRoutes,
      dbLibraries: [...dbLibraries],
      externalServices: [...externalServices],
      sourceFilesScanned: sourceFiles.length,
    };

    console.log('Analysis complete:', {
      framework: analysis.framework,
      awsSdkUsage: analysis.awsSdkUsage,
      envVars: analysis.envVars.length,
      dbLibraries: analysis.dbLibraries,
      externalServices: analysis.externalServices,
    });

    return new Response(JSON.stringify(analysis), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    console.error('Repository analysis error:', error);
    return new Response(
      JSON.stringify({
        error: error.message || 'Unknown error during analysis',
        framework: null, buildTool: null, dependencies: [],
        buildCommand: null, outputDir: null, analyzedAt: new Date().toISOString(),
        awsSdkUsage: [], envVars: [], hasApiRoutes: false,
        dbLibraries: [], externalServices: [], sourceFilesScanned: 0,
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

function detectFramework(pkg: any): string | null {
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  if (deps['next']) return 'Next.js';
  if (deps['@remix-run/react'] || deps['@remix-run/node']) return 'Remix';
  if (deps['astro']) return 'Astro';
  if (deps['nuxt']) return 'Nuxt';
  if (deps['@angular/core']) return 'Angular';
  if (deps['vue']) return 'Vue';
  if (deps['svelte']) return 'Svelte';
  if (deps['solid-js']) return 'SolidJS';
  if (deps['react']) return 'React';
  return null;
}

function detectBuildTool(pkg: any): string | null {
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  const build = pkg.scripts?.build || '';
  if (deps['vite'] || build.includes('vite')) return 'Vite';
  if (deps['webpack'] || build.includes('webpack')) return 'Webpack';
  if (deps['esbuild'] || build.includes('esbuild')) return 'esbuild';
  if (deps['rollup'] || build.includes('rollup')) return 'Rollup';
  if (deps['next']) return 'Next.js (built-in)';
  if (deps['@remix-run/dev']) return 'Remix (built-in)';
  if (deps['astro']) return 'Astro (built-in)';
  return null;
}

function detectOutputDir(pkg: any): string | null {
  const build = pkg.scripts?.build || '';
  if (build.includes('--outDir dist') || build.includes('--out-dir dist')) return 'dist';
  if (build.includes('--outDir build')) return 'build';
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  if (deps['next']) return '.next';
  if (deps['astro']) return 'dist';
  if (deps['vite']) return 'dist';
  return 'dist';
}
