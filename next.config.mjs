// GitHub Pages serves the project under /<repo-name>/, so the build needs a
// matching basePath. GITHUB_ACTIONS is set automatically by GitHub Actions
// runners, so local `next dev` / `next build` are unaffected.
const repoName = 'Orbit'
const isGithubActions = process.env.GITHUB_ACTIONS === 'true'

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  agentRules: false,
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  ...(isGithubActions
    ? {
        basePath: `/${repoName}`,
        assetPrefix: `/${repoName}/`,
      }
    : {}),
}

export default nextConfig
