// Supabase Configuration
// IMPORTANT: These credentials are exposed in the frontend code.
// The anon key is safe to use in browser as it only provides limited access
// based on your Row Level Security (RLS) policies.

// Your Supabase project URL and anon key
const SUPABASE_URL = 'https://wdpeoyugsxqnpwwtkqsl.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndkcGVveXVnc3hxbnB3d3RrcXNsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDQxNDgwNzgsImV4cCI6MjA1OTcyNDA3OH0.9bUpuZCOZxDSH3KsIu6FwWZyAvnV5xPJGNpO3luxWOE';

// Check if we're using mock mode (for development without Supabase)
const USE_MOCK = false;

// Export configuration
export { SUPABASE_URL, SUPABASE_ANON_KEY, USE_MOCK };