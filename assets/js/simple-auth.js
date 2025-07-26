// Simple Auth Service
// This file provides authentication functionality for the app

import { supabase } from './supabase-client.js';

// Mock authentication service
export const simpleAuth = {
    currentUser: null,
    
    async signUp(emailOrPhone, password, name, shootingHand = 'right') {
        // Mock signup
        const user = {
            id: Date.now().toString(),
            email_or_phone: emailOrPhone,
            full_name: name || 'User',
            shooting_hand: shootingHand,
            created_at: new Date().toISOString()
        };
        
        localStorage.setItem('shootingCoachUser', JSON.stringify(user));
        localStorage.setItem('shootingHand', shootingHand);
        this.currentUser = user;
        return { data: user, error: null };
    },
    
    async signIn(emailOrPhone, password) {
        // Mock signin
        const storedUser = localStorage.getItem('shootingCoachUser');
        if (storedUser && storedUser !== 'undefined' && storedUser !== 'null') {
            try {
                this.currentUser = JSON.parse(storedUser);
                return { data: this.currentUser, error: null };
            } catch (e) {
                console.error('Error parsing stored user:', e);
            }
        }
        
        // Create new user for demo
        const user = {
            id: Date.now().toString(),
            email_or_phone: emailOrPhone,
            full_name: emailOrPhone.includes('@') ? emailOrPhone.split('@')[0] : 'User',
            shooting_hand: localStorage.getItem('shootingHand') || 'right',
            created_at: new Date().toISOString()
        };
        
        localStorage.setItem('shootingCoachUser', JSON.stringify(user));
        this.currentUser = user;
        return { data: user, error: null };
    },
    
    async signOut() {
        this.currentUser = null;
        localStorage.removeItem('shootingCoachUser');
        return { error: null };
    },
    
    getUser() {
        if (!this.currentUser) {
            const storedUser = localStorage.getItem('shootingCoachUser');
            if (storedUser) {
                this.currentUser = JSON.parse(storedUser);
            }
        }
        return this.currentUser;
    }
};

// Mock shots service using IndexedDB
export const simpleShots = {
    async getAllShots() {
        // Use the getAllVideos function exposed by app-navigation.js
        if (typeof window.getAllVideos === 'function') {
            try {
                const videos = await window.getAllVideos();
                return videos || [];
            } catch (error) {
                console.error('Error getting videos from IndexedDB:', error);
                return [];
            }
        }
        return [];
    },
    
    async addShot(shotData) {
        // This is handled by app-navigation.js saveVideo function
        return { data: shotData, error: null };
    },
    
    async getSessionShots(sessionId) {
        const shots = await this.getAllShots();
        return shots.filter(shot => shot.sessionId === sessionId);
    },
    
    async getShots(limit) {
        const shots = await this.getAllShots();
        
        // Sort by timestamp (newest first)
        const sortedShots = shots.sort((a, b) => {
            const timeA = a.timestamp || 0;
            const timeB = b.timestamp || 0;
            return timeB - timeA;
        });
        
        return {
            data: limit ? sortedShots.slice(0, limit) : sortedShots,
            error: null
        };
    },
    
    async getStats() {
        const shots = await this.getAllShots();
        
        if (shots.length === 0) {
            return {
                data: {
                    total_shots: 0,
                    avg_duration: 0,
                    total_sessions: 0
                },
                error: null
            };
        }
        
        // Calculate total shots
        const totalShots = shots.length;
        
        // Calculate average duration - check both direct duration and shotData.duration
        const durations = shots
            .map(shot => {
                // Try to get duration from shotData first, then from shot directly
                const duration = shot.shotData?.duration || shot.duration;
                return duration;
            })
            .filter(duration => duration && duration > 0);
        
        const avgDuration = durations.length > 0 
            ? durations.reduce((a, b) => a + b, 0) / durations.length 
            : 0;
        
        // Count unique sessions
        const uniqueSessions = new Set(shots.map(shot => shot.sessionId).filter(id => id)).size;
        
        return {
            data: {
                total_shots: totalShots,
                avg_duration: avgDuration,
                total_sessions: uniqueSessions
            },
            error: null
        };
    },
    
    async deleteShot(shotId) {
        // This would need to be implemented in app-navigation.js
        // For now, return success
        return { error: null };
    },
    
    async updateStats(userId) {
        // This is a no-op for IndexedDB version
        // Stats are calculated on-demand from the shots array
        return { error: null };
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
        return 1; // Return 1 as fallback (at least the current user)
    }
}