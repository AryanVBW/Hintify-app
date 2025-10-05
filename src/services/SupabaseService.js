const { createClient } = require('@supabase/supabase-js');
const path = require('path');

// Load environment variables
require('dotenv').config({ 
  path: path.resolve(__dirname, '../../.env.local')
});

class SupabaseService {
  constructor() {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
    
    if (!supabaseUrl || !supabaseAnonKey) {
      console.error('❌ Missing Supabase configuration');
      console.log('Available env vars:', Object.keys(process.env).filter(key => key.includes('SUPABASE')));
      throw new Error('SUPABASE_URL and SUPABASE_ANON_KEY environment variables are required');
    }
    
    this.supabase = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        autoRefreshToken: true,
        persistSession: false, // We'll handle session persistence manually
        detectSessionInUrl: false // Not needed in Electron
      }
    });
    
    console.log('✅ SupabaseService initialized');
  }
  
  // Set session from tokens (used for deep link authentication)
  async setSession(accessToken, refreshToken) {
    try {
      const { data, error } = await this.supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken
      });
      
      if (error) {
        console.error('Error setting Supabase session:', error);
        throw error;
      }
      
      console.log('✅ Supabase session set successfully');
      return data;
    } catch (error) {
      console.error('Failed to set Supabase session:', error);
      throw error;
    }
  }
  
  // Get current user
  async getCurrentUser() {
    try {
      const { data: { user }, error } = await this.supabase.auth.getUser();
      
      if (error) {
        console.error('Error getting current user:', error);
        return null;
      }
      
      return user;
    } catch (error) {
      console.error('Failed to get current user:', error);
      return null;
    }
  }
  
  // Get current session
  async getCurrentSession() {
    try {
      const { data: { session }, error } = await this.supabase.auth.getSession();
      
      if (error) {
        console.error('Error getting current session:', error);
        return null;
      }
      
      return session;
    } catch (error) {
      console.error('Failed to get current session:', error);
      return null;
    }
  }
  
  // Refresh session
  async refreshSession() {
    try {
      const { data, error } = await this.supabase.auth.refreshSession();
      
      if (error) {
        console.error('Error refreshing session:', error);
        throw error;
      }
      
      return data;
    } catch (error) {
      console.error('Failed to refresh session:', error);
      throw error;
    }
  }
  
  // Sign out
  async signOut() {
    try {
      const { error } = await this.supabase.auth.signOut();
      
      if (error) {
        console.error('Error signing out:', error);
        throw error;
      }
      
      console.log('✅ Signed out successfully');
    } catch (error) {
      console.error('Failed to sign out:', error);
      throw error;
    }
  }
  
  // Validate JWT token
  async validateToken(token) {
    try {
      // Set the token temporarily to validate it
      const { data: { user }, error } = await this.supabase.auth.getUser(token);
      
      if (error) {
        console.error('Token validation failed:', error);
        return false;
      }
      
      return !!user;
    } catch (error) {
      console.error('Failed to validate token:', error);
      return false;
    }
  }
  
  // Extract user data from Supabase user object
  extractUserData(user, session = null) {
    if (!user) return null;
    
    return {
      id: user.id,
      email: user.email,
      name: user.user_metadata?.full_name || user.user_metadata?.name || user.email,
      firstName: user.user_metadata?.first_name || '',
      lastName: user.user_metadata?.last_name || '',
      imageUrl: user.user_metadata?.avatar_url || user.user_metadata?.picture || null,
      provider: user.app_metadata?.provider || 'supabase',
      supabase_user_id: user.id,
      access_token: session?.access_token || null,
      refresh_token: session?.refresh_token || null,
      expires_in: session?.expires_in || null
    };
  }
  
  // Listen for auth state changes
  onAuthStateChange(callback) {
    return this.supabase.auth.onAuthStateChange((event, session) => {
      console.log('🔄 Supabase auth state changed:', event);
      callback(event, session);
    });
  }
}

module.exports = SupabaseService;
