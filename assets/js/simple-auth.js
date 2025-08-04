// Simple Auth Service
// Simplified authentication using only sc_simple_users table
// Matches your existing database structure
// Updated: Modified shots service to use IndexedDB instead of Supabase for MVP
// - getAllShots, getShots, getSessionShots now read from IndexedDB
// - getStats calculates statistics from IndexedDB videos
// - addShot, deleteShot, updateStats kept for compatibility but don't use Supabase

import { supabase } from './supabase-client.js';

// Simplified authentication service
export const simpleAuth = {
    currentUser: null,
    
    async signUp(emailOrPhone, password, name, shootingHand = 'right') {
        try {
            // Validate input
            if (!emailOrPhone || !password || !name) {
                return { data: null, error: 'All fields are required' };
            }
            
            // Check if user already exists
            const { data: existingUser, error: checkError } = await supabase
                .from('sc_simple_users')
                .select('*')
                .eq('email_or_phone', emailOrPhone)
                .single();
            
            // Handle database connection errors
            if (checkError && checkError.code !== 'PGRST116') { // PGRST116 = no rows found
                console.error('Database error:', checkError);
                return { data: null, error: 'Database connection error. Please check your connection.' };
            }
            
            if (existingUser) {
                return { data: null, error: 'User already exists with this email/phone' };
            }
            
            // Get next ID (since your table uses integer IDs)
            const { data: maxIdResult } = await supabase
                .from('sc_simple_users')
                .select('id')
                .order('id', { ascending: false })
                .limit(1)
                .single();
            
            const nextId = (maxIdResult?.id || 0) + 1;
            
            // Create new user in sc_simple_users table
            const { data: newUser, error } = await supabase
                .from('sc_simple_users')
                .insert({
                    id: nextId,
                    email_or_phone: emailOrPhone,
                    password: password, // Store password directly (as your table does)
                    full_name: name,
                    created_at: new Date().toISOString()
                })
                .select()
                .single();
            
            if (error) {
                console.error('Error creating user:', error);
                return { data: null, error: error.message };
            }
            
            // Store user in session
            this.currentUser = newUser;
            sessionStorage.setItem('shootingCoachUser', JSON.stringify(newUser));
            
            return { data: newUser, error: null };
        } catch (error) {
            console.error('Sign up error:', error);
            return { data: null, error: error.message };
        }
    },
    
    async signIn(emailOrPhone, password) {
        try {
            // Validate input
            if (!emailOrPhone || !password) {
                return { data: null, error: 'Email/phone and password are required' };
            }
            
            // First check if user exists
            const { data: existingUser, error: checkError } = await supabase
                .from('sc_simple_users')
                .select('*')
                .eq('email_or_phone', emailOrPhone)
                .single();
            
            // If error or no user found
            if (checkError || !existingUser) {
                console.error('User not found:', checkError);
                return { data: null, error: 'Invalid email/phone or password' };
            }
            
            // Verify password matches
            if (existingUser.password !== password) {
                return { data: null, error: 'Invalid email/phone or password' };
            }
            
            // Store user in session
            this.currentUser = existingUser;
            sessionStorage.setItem('shootingCoachUser', JSON.stringify(existingUser));
            
            return { data: existingUser, error: null };
        } catch (error) {
            console.error('Sign in error:', error);
            // Always return authentication error, don't expose internal errors
            return { data: null, error: 'Invalid email/phone or password' };
        }
    },
    
    async signOut() {
        try {
            this.currentUser = null;
            sessionStorage.removeItem('shootingCoachUser');
            return { error: null };
        } catch (error) {
            console.error('Sign out error:', error);
            return { error: error.message };
        }
    },
    
    async getUser() {
        try {
            // Check session storage first
            if (!this.currentUser) {
                const savedUser = sessionStorage.getItem('shootingCoachUser');
                if (savedUser) {
                    this.currentUser = JSON.parse(savedUser);
                }
            }
            
            return this.currentUser;
        } catch (error) {
            console.error('Get user error:', error);
            return null;
        }
    }
};

// Simplified shots service - using IndexedDB for MVP
export const simpleShots = {
    async getAllShots() {
        try {
            const user = await simpleAuth.getUser();
            if (!user) return [];
            
            // Get shots from IndexedDB instead of Supabase
            if (window.getAllVideos) {
                const videos = await window.getAllVideos();
                // Filter videos for current user (if needed)
                return videos || [];
            }
            
            return [];
        } catch (error) {
            console.error('Error getting shots from IndexedDB:', error);
            return [];
        }
    },
    
    async addShot(shotData) {
        try {
            const user = await simpleAuth.getUser();
            if (!user) return { data: null, error: 'User not authenticated' };
            
            // For MVP, shots are saved directly to IndexedDB in app-navigation.js
            // This function is kept for compatibility but doesn't save to Supabase
            return { data: shotData, error: null };
        } catch (error) {
            console.error('Error in addShot:', error);
            return { data: null, error: error.message };
        }
    },
    
    async getSessionShots(sessionId) {
        try {
            const user = await simpleAuth.getUser();
            if (!user) return [];
            
            // Get shots from IndexedDB and filter by sessionId
            if (window.getAllVideos) {
                const videos = await window.getAllVideos();
                return videos.filter(video => video.sessionId === sessionId) || [];
            }
            
            return [];
        } catch (error) {
            console.error('Error getting session shots from IndexedDB:', error);
            return [];
        }
    },
    
    async getShots(limit) {
        try {
            const user = await simpleAuth.getUser();
            if (!user) return { data: [], error: null };
            
            // Get shots from IndexedDB
            if (window.getAllVideos) {
                let videos = await window.getAllVideos();
                
                // Apply limit if specified
                if (limit) {
                    videos = videos.slice(0, limit);
                }
                
                return { data: videos || [], error: null };
            }
            
            return { data: [], error: null };
        } catch (error) {
            console.error('Error getting shots from IndexedDB:', error);
            return { data: [], error: error.message };
        }
    },
    
    async getStats() {
        try {
            const user = await simpleAuth.getUser();
            if (!user) return {
                data: {
                    total_shots: 0,
                    avg_duration: 0,
                    total_sessions: 0
                },
                error: null
            };
            
            // Calculate stats from IndexedDB videos
            if (window.getAllVideos) {
                const videos = await window.getAllVideos();
                
                // Calculate total shots
                const totalShots = videos.length;
                
                // Calculate average duration
                const durations = videos
                    .map(v => v.shotData?.duration || 0)
                    .filter(d => d > 0);
                const avgDuration = durations.length > 0 
                    ? durations.reduce((a, b) => a + b, 0) / durations.length 
                    : 0;
                
                // Calculate unique sessions
                const uniqueSessions = new Set(
                    videos.map(v => v.sessionId || `session-${v.timestamp}`)
                ).size;
                
                return {
                    data: {
                        total_shots: totalShots,
                        avg_duration: avgDuration,
                        total_sessions: uniqueSessions
                    },
                    error: null
                };
            }
            
            return {
                data: {
                    total_shots: 0,
                    avg_duration: 0,
                    total_sessions: 0
                },
                error: null
            };
        } catch (error) {
            console.error('Error calculating stats from IndexedDB:', error);
            return {
                data: {
                    total_shots: 0,
                    avg_duration: 0,
                    total_sessions: 0
                },
                error: error.message
            };
        }
    },
    
    async deleteShot(shotId) {
        try {
            const user = await simpleAuth.getUser();
            if (!user) return { error: 'User not authenticated' };
            
            // For MVP, deletion is handled directly in IndexedDB by app-navigation.js
            // This function is kept for compatibility
            return { error: null };
        } catch (error) {
            console.error('Error in deleteShot:', error);
            return { error: error.message };
        }
    },
    
    async updateStats(userId) {
        try {
            // For MVP, stats are calculated on-the-fly from IndexedDB
            // This function is kept for compatibility but doesn't update Supabase
            return { error: null };
        } catch (error) {
            console.error('Error in updateStats:', error);
            return { error: error.message };
        }
    }
};

// Get actual user count from database
export async function getUserCount() {
    try {
        const { count, error } = await supabase
            .from('sc_simple_users')
            .select('*', { count: 'exact', head: true });
        
        if (error) throw error;
        
        return count || 1;
    } catch (error) {
        console.error('Error getting user count:', error);
        return 1; // Return 1 as fallback
    }
}