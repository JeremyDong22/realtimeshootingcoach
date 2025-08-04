// Supabase Client
// This file provides the Supabase client for database operations only
// No authentication - just database access

import { SUPABASE_URL, SUPABASE_ANON_KEY } from './supabase-config.js';

// Create Supabase client for database operations only
let supabaseInstance;

if (!window.supabase) {
    console.error('Supabase SDK not loaded. Please ensure the Supabase script is included in your HTML.');
    throw new Error('Supabase SDK is required but not loaded');
}

// Use real Supabase client but configure it to NOT use auth
const { createClient } = window.supabase;
supabaseInstance = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
        persistSession: false,      // Don't persist auth session
        autoRefreshToken: false,     // Don't auto refresh tokens
        detectSessionInUrl: false,   // Don't detect auth in URL
        storage: {                   // Use a dummy storage that does nothing
            getItem: () => null,
            setItem: () => {},
            removeItem: () => {}
        }
    }
});

// Export the client
export const supabase = supabaseInstance;
export const supabaseUrl = SUPABASE_URL;
export const supabaseAnonKey = SUPABASE_ANON_KEY;