# Environment Variables Setup

Create a `.env.local` file in the root directory with the following variables:

```bash
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
```

## How to get these values:

### Supabase:
1. Go to your Supabase project dashboard
2. Navigate to Settings > API
3. Copy the Project URL for `NEXT_PUBLIC_SUPABASE_URL`
4. Copy the anon/public key for `NEXT_PUBLIC_SUPABASE_ANON_KEY`
5. Copy the service_role key for `SUPABASE_SERVICE_ROLE_KEY`
