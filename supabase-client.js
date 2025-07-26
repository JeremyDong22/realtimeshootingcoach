// Supabase Client
// This file provides the Supabase client for the application

import { SUPABASE_URL, SUPABASE_ANON_KEY, USE_MOCK } from './supabase-config.js';

// Create Supabase client or mock based on configuration
let supabaseInstance;

if (!USE_MOCK && window.supabase) {
    // Use real Supabase client
    const { createClient } = window.supabase;
    supabaseInstance = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
} else {
    // Fallback to mock client if Supabase SDK is not loaded or in mock mode
    console.warn('Using mock Supabase client. Real-time features will be limited.');
    
    supabaseInstance = {
        auth: {
            getUser: async () => {
                const user = localStorage.getItem('shootingCoachUser');
                return {
                    data: {
                        user: user ? JSON.parse(user) : null
                    },
                    error: null
                };
            },
            
            signUp: async ({ email, password, options }) => {
                const user = {
                    id: Date.now().toString(),
                    email,
                    user_metadata: options?.data || {},
                    created_at: new Date().toISOString()
                };
                
                localStorage.setItem('shootingCoachUser', JSON.stringify(user));
                return {
                    data: { user, session: { access_token: 'mock-token' } },
                    error: null
                };
            },
            
            signInWithPassword: async ({ email, password }) => {
                let user = localStorage.getItem('shootingCoachUser');
                if (!user) {
                    user = {
                        id: Date.now().toString(),
                        email,
                        created_at: new Date().toISOString()
                    };
                    localStorage.setItem('shootingCoachUser', JSON.stringify(user));
                } else {
                    user = JSON.parse(user);
                }
                
                return {
                    data: { user, session: { access_token: 'mock-token' } },
                    error: null
                };
            },
            
            signOut: async () => {
                localStorage.removeItem('shootingCoachUser');
                return { error: null };
            },
            
            onAuthStateChange: (callback) => {
                const user = localStorage.getItem('shootingCoachUser');
                if (user) {
                    callback('SIGNED_IN', { user: JSON.parse(user) });
                }
                
                return {
                    data: { subscription: { unsubscribe: () => {} } }
                };
            }
        },
        
        from: (table) => {
            return {
                select: () => ({
                    eq: () => ({
                        order: () => ({
                            data: [],
                            error: null
                        })
                    })
                }),
                
                insert: (data) => ({
                    select: () => ({
                        data: Array.isArray(data) ? data : [data],
                        error: null
                    })
                }),
                
                upsert: (data) => ({
                    select: () => ({
                        data: Array.isArray(data) ? data : [data],
                        error: null
                    })
                })
            };
        }
    };
}

// Export the client
export const supabase = supabaseInstance;
export const supabaseUrl = SUPABASE_URL;
export const supabaseAnonKey = SUPABASE_ANON_KEY;