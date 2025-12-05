/**
 * Frontend Authentication Helper
 * Handles Cognito auth flows and token management
 */

class AuthManager {
  constructor() {
    this.tokenKey = 'enterprise_lite_tokens';
    this.userKey = 'enterprise_lite_user';
  }

  /**
   * Get stored tokens
   */
  getTokens() {
    try {
      const stored = localStorage.getItem(this.tokenKey);
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  }

  /**
   * Store tokens
   */
  setTokens(tokens) {
    localStorage.setItem(this.tokenKey, JSON.stringify(tokens));
  }

  /**
   * Clear tokens
   */
  clearTokens() {
    localStorage.removeItem(this.tokenKey);
    localStorage.removeItem(this.userKey);
  }

  /**
   * Get stored user
   */
  getUser() {
    try {
      const stored = localStorage.getItem(this.userKey);
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  }

  /**
   * Store user info
   */
  setUser(user) {
    localStorage.setItem(this.userKey, JSON.stringify(user));
  }

  /**
   * Check if user is logged in
   */
  isLoggedIn() {
    const tokens = this.getTokens();
    return !!(tokens?.accessToken);
  }

  /**
   * Get access token for API calls
   */
  getAccessToken() {
    const tokens = this.getTokens();
    return tokens?.accessToken || null;
  }

  /**
   * Get authorization header for API calls
   */
  getAuthHeader() {
    const token = this.getAccessToken();
    return token ? { 'Authorization': `Bearer ${token}` } : {};
  }

  /**
   * Sign up new user
   */
  async signUp({ email, password, name, companyName, phone, address }) {
    const response = await fetch('/api/auth/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, name, companyName, phone, address })
    });

    const data = await response.json();
    if (!data.success) {
      throw new Error(data.error || 'Signup failed');
    }
    return data;
  }

  /**
   * Confirm signup with verification code
   */
  async confirmSignUp(email, code) {
    const response = await fetch('/api/auth/confirm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, code })
    });

    const data = await response.json();
    if (!data.success) {
      throw new Error(data.error || 'Confirmation failed');
    }
    return data;
  }

  /**
   * Sign in
   */
  async signIn(email, password) {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });

    const data = await response.json();
    if (!data.success) {
      throw new Error(data.error || 'Login failed');
    }

    // Store tokens
    this.setTokens({
      accessToken: data.accessToken,
      idToken: data.idToken,
      refreshToken: data.refreshToken,
      expiresAt: Date.now() + (data.expiresIn * 1000)
    });

    // Store user info
    if (data.user) {
      this.setUser(data.user);
    }

    return data;
  }

  /**
   * Sign out
   */
  async signOut() {
    try {
      const token = this.getAccessToken();
      if (token) {
        await fetch('/api/auth/logout', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          }
        });
      }
    } catch (e) {
      console.warn('Logout request failed:', e);
    }
    this.clearTokens();
  }

  /**
   * Refresh tokens
   */
  async refreshTokens() {
    const tokens = this.getTokens();
    if (!tokens?.refreshToken) {
      throw new Error('No refresh token available');
    }

    const response = await fetch('/api/auth/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: tokens.refreshToken })
    });

    const data = await response.json();
    if (!data.success) {
      this.clearTokens();
      throw new Error(data.error || 'Token refresh failed');
    }

    // Update stored tokens
    this.setTokens({
      ...tokens,
      accessToken: data.accessToken,
      idToken: data.idToken,
      expiresAt: Date.now() + (data.expiresIn * 1000)
    });

    return data;
  }

  /**
   * Get current user from server
   */
  async fetchCurrentUser() {
    const token = this.getAccessToken();
    if (!token) {
      return null;
    }

    const response = await fetch('/api/auth/me', {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!response.ok) {
      if (response.status === 401) {
        // Try to refresh tokens
        try {
          await this.refreshTokens();
          return this.fetchCurrentUser();
        } catch {
          this.clearTokens();
          return null;
        }
      }
      return null;
    }

    const data = await response.json();
    if (data.success && data.user) {
      this.setUser(data.user);
      return data.user;
    }
    return null;
  }

  /**
   * Forgot password
   */
  async forgotPassword(email) {
    const response = await fetch('/api/auth/forgot-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email })
    });

    const data = await response.json();
    if (!data.success) {
      throw new Error(data.error || 'Failed to send reset email');
    }
    return data;
  }

  /**
   * Reset password
   */
  async resetPassword(email, code, newPassword) {
    const response = await fetch('/api/auth/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, code, newPassword })
    });

    const data = await response.json();
    if (!data.success) {
      throw new Error(data.error || 'Failed to reset password');
    }
    return data;
  }

  /**
   * Create Stripe checkout session
   */
  async createCheckout({ email, companyName, plan = 'complete' }) {
    const response = await fetch('/api/billing/checkout', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...this.getAuthHeader()
      },
      body: JSON.stringify({ email, companyName, plan })
    });

    const data = await response.json();
    if (!data.success) {
      throw new Error(data.error || 'Failed to create checkout');
    }
    return data;
  }

  /**
   * Get subscription status
   */
  async getSubscription() {
    const response = await fetch('/api/billing/subscription', {
      headers: this.getAuthHeader()
    });

    const data = await response.json();
    return data.subscription || null;
  }
}

// Global instance
window.authManager = new AuthManager();

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
  module.exports = AuthManager;
}




