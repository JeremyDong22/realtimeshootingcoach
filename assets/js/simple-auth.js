// Simple Auth Service
// Simplified authentication using only sc_simple_users table
// Matches your existing database structure

import { supabase } from './supabase-client.js';

// Simplified authentication service
export const simpleAuth = {
    currentUser: null,
    
    async signUp(emailOrPhone, password, name, shootingHand = 'right') {
        try {
            // Check if user already exists
            const { data: existingUser } = await supabase
                .from('sc_simple_users')
                .select('*')
                .eq('email_or_phone', emailOrPhone)
                .single();
            
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
            // Find user by email/phone and password
            const { data: user, error } = await supabase
                .from('sc_simple_users')
                .select('*')
                .eq('email_or_phone', emailOrPhone)
                .eq('password', password)
                .single();
            
            if (error || !user) {
                return { data: null, error: 'Invalid email/phone or password' };
            }
            
            // Store user in session
            this.currentUser = user;
            sessionStorage.setItem('shootingCoachUser', JSON.stringify(user));
            
            return { data: user, error: null };
        } catch (error) {
            console.error('Sign in error:', error);
            return { data: null, error: error.message };
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

// Simplified shots service
export const simpleShots = {
    async getAllShots() {
        try {
            const user = await simpleAuth.getUser();
            if (!user) return [];
            
            const { data, error } = await supabase
                .from('sc_shots')
                .select('*')
                .eq('user_id', user.id)
                .order('created_at', { ascending: false });
            
            if (error) throw error;
            
            return data || [];
        } catch (error) {
            console.error('Error getting shots:', error);
            // Return empty array if table doesn't exist yet
            return [];
        }
    },
    
    async addShot(shotData) {
        try {
            const user = await simpleAuth.getUser();
            if (!user) return { data: null, error: 'User not authenticated' };
            
            const { data, error } = await supabase
                .from('sc_shots')
                .insert({
                    ...shotData,
                    user_id: user.id
                })
                .select()
                .single();
            
            if (error) throw error;
            
            return { data, error: null };
        } catch (error) {
            console.error('Error adding shot:', error);
            return { data: null, error: error.message };
        }
    },
    
    async getSessionShots(sessionId) {
        try {
            const user = await simpleAuth.getUser();
            if (!user) return [];
            
            const { data, error } = await supabase
                .from('sc_shots')
                .select('*')
                .eq('user_id', user.id)
                .eq('session_id', sessionId)
                .order('created_at', { ascending: false });
            
            if (error) throw error;
            
            return data || [];
        } catch (error) {
            console.error('Error getting session shots:', error);
            return [];
        }
    },
    
    async getShots(limit) {
        try {
            const user = await simpleAuth.getUser();
            if (!user) return { data: [], error: null };
            
            let query = supabase
                .from('sc_shots')
                .select('*')
                .eq('user_id', user.id)
                .order('created_at', { ascending: false });
            
            if (limit) {
                query = query.limit(limit);
            }
            
            const { data, error } = await query;
            
            if (error) throw error;
            
            return { data: data || [], error: null };
        } catch (error) {
            console.error('Error getting shots:', error);
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
            
            // Get user stats from database
            const { data: stats, error } = await supabase
                .from('sc_user_stats')
                .select('*')
                .eq('user_id', user.id)
                .single();
            
            if (error && error.code !== 'PGRST116') { // Ignore "no rows returned" error
                console.error('Stats error:', error);
            }
            
            return {
                data: stats || {
                    total_shots: 0,
                    avg_duration: 0,
                    total_sessions: 0
                },
                error: null
            };
        } catch (error) {
            console.error('Error getting stats:', error);
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
            
            const { error } = await supabase
                .from('sc_shots')
                .delete()
                .eq('id', shotId)
                .eq('user_id', user.id);
            
            if (error) throw error;
            
            return { error: null };
        } catch (error) {
            console.error('Error deleting shot:', error);
            return { error: error.message };
        }
    },
    
    async updateStats(userId) {
        try {
            // Calculate stats from shots table
            const { data: shots, error: shotsError } = await supabase
                .from('sc_shots')
                .select('duration, session_id')
                .eq('user_id', userId);
            
            if (shotsError) {
                console.error('Error fetching shots for stats:', shotsError);
                return { error: null }; // Don't fail, just skip
            }
            
            const totalShots = shots?.length || 0;
            const durations = (shots || []).map(s => s.duration).filter(d => d > 0);
            const avgDuration = durations.length > 0 
                ? durations.reduce((a, b) => a + b, 0) / durations.length 
                : 0;
            const uniqueSessions = new Set((shots || []).map(s => s.session_id).filter(id => id)).size;
            
            // Upsert stats
            const { error } = await supabase
                .from('sc_user_stats')
                .upsert({
                    user_id: userId,
                    total_shots: totalShots,
                    avg_duration: avgDuration,
                    total_sessions: uniqueSessions,
                    updated_at: new Date().toISOString()
                });
            
            if (error) {
                console.error('Error updating stats:', error);
            }
            
            return { error: null };
        } catch (error) {
            console.error('Error updating stats:', error);
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