/** @type {import('next').NextConfig} */
const nextConfig = {
    eslint: {
      ignoreDuringBuilds: true,
    },
    typescript: {
      ignoreBuildErrors: true, // solo afecta al build en Vercel
    },
  }
  
  export default nextConfig
  