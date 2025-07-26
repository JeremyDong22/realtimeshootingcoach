// Supabase Configuration Template
// This file will be processed during build to inject environment variables
// IMPORTANT: These credentials are exposed in the frontend code.
// The anon key is safe to use in browser as it only provides limited access
// based on your Row Level Security (RLS) policies.

// Your Supabase project URL and anon key (will be replaced during build)
const SUPABASE_URL = '__VITE_SUPABASE_URL__';
const SUPABASE_ANON_KEY = '__VITE_SUPABASE_ANON_KEY__';

// Check if we're using mock mode (for development without Supabase)
const USE_MOCK = false;

// Export configuration
export { SUPABASE_URL, SUPABASE_ANON_KEY, USE_MOCK };