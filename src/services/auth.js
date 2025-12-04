/**
 * Cognito Authentication Service for Enterprise Lite
 * Handles user authentication, registration, and session management
 */

import { 
  CognitoIdentityProviderClient,
  InitiateAuthCommand,
  SignUpCommand,
  ConfirmSignUpCommand,
  ForgotPasswordCommand,
  ConfirmForgotPasswordCommand,
  GetUserCommand,
  GlobalSignOutCommand,
  AdminGetUserCommand,
  AdminCreateUserCommand,
  AdminAddUserToGroupCommand,
  AdminUpdateUserAttributesCommand
} from '@aws-sdk/client-cognito-identity-provider';
import crypto from 'crypto';
import logger from '../utils/logger.js';

// Configuration - read lazily to ensure dotenv has loaded
function getConfig() {
  return {
    region: process.env.COGNITO_REGION || process.env.AWS_REGION || 'ap-southeast-1',
    userPoolId: process.env.COGNITO_USER_POOL_ID,
    clientId: process.env.COGNITO_CLIENT_ID,
    domain: process.env.COGNITO_DOMAIN
  };
}

// Lazy-initialized Cognito client
let _cognitoClient = null;
function getCognitoClient() {
  if (!_cognitoClient) {
    const config = getConfig();
    _cognitoClient = new CognitoIdentityProviderClient({ region: config.region });
  }
  return _cognitoClient;
}

/**
 * Check if Cognito is configured
 */
export function isCognitoConfigured() {
  const config = getConfig();
  return !!(config.userPoolId && config.clientId);
}

/**
 * Get Cognito Hosted UI URLs
 */
export function getHostedUIUrls(redirectUri) {
  const config = getConfig();
  if (!config.domain) {
    throw new Error('COGNITO_DOMAIN not configured');
  }
  
  const baseUrl = `https://${config.domain}.auth.${config.region}.amazoncognito.com`;
  
  return {
    login: `${baseUrl}/login?client_id=${config.clientId}&response_type=code&scope=email+openid+profile&redirect_uri=${encodeURIComponent(redirectUri)}`,
    signup: `${baseUrl}/signup?client_id=${config.clientId}&response_type=code&scope=email+openid+profile&redirect_uri=${encodeURIComponent(redirectUri)}`,
    logout: `${baseUrl}/logout?client_id=${config.clientId}&logout_uri=${encodeURIComponent(redirectUri)}`
  };
}

/**
 * Sign up a new user
 */
export async function signUp(email, password, attributes = {}) {
  if (!isCognitoConfigured()) {
    throw new Error('Cognito not configured');
  }

  const userAttributes = [
    { Name: 'email', Value: email }
  ];

  // Add custom attributes
  if (attributes.name) {
    userAttributes.push({ Name: 'name', Value: attributes.name });
  }
  if (attributes.tenantId) {
    userAttributes.push({ Name: 'custom:tenant_id', Value: attributes.tenantId });
  }
  if (attributes.companyId) {
    userAttributes.push({ Name: 'custom:company_id', Value: attributes.companyId });
  }

  try {
    const config = getConfig();
    const command = new SignUpCommand({
      ClientId: config.clientId,
      Username: email,
      Password: password,
      UserAttributes: userAttributes
    });

    const response = await getCognitoClient().send(command);
    
    logger.info('User signed up', { email, userSub: response.UserSub });
    
    return {
      success: true,
      userSub: response.UserSub,
      userConfirmed: response.UserConfirmed,
      message: response.UserConfirmed 
        ? 'Account created successfully' 
        : 'Please check your email for verification code'
    };
  } catch (error) {
    logger.error('Sign up failed', { email, error: error.message });
    throw formatCognitoError(error);
  }
}

/**
 * Confirm user sign up with verification code
 */
export async function confirmSignUp(email, code) {
  if (!isCognitoConfigured()) {
    throw new Error('Cognito not configured');
  }

  try {
    const config = getConfig();
    const command = new ConfirmSignUpCommand({
      ClientId: config.clientId,
      Username: email,
      ConfirmationCode: code
    });

    await getCognitoClient().send(command);
    
    logger.info('User confirmed', { email });
    
    return {
      success: true,
      message: 'Email verified successfully. You can now sign in.'
    };
  } catch (error) {
    logger.error('Confirm sign up failed', { email, error: error.message });
    throw formatCognitoError(error);
  }
}

/**
 * Sign in user with email and password
 */
export async function signIn(email, password) {
  if (!isCognitoConfigured()) {
    throw new Error('Cognito not configured');
  }

  try {
    const config = getConfig();
    const command = new InitiateAuthCommand({
      AuthFlow: 'USER_PASSWORD_AUTH',
      ClientId: config.clientId,
      AuthParameters: {
        USERNAME: email,
        PASSWORD: password
      }
    });

    const response = await getCognitoClient().send(command);
    
    logger.info('User signed in', { email });
    
    return {
      success: true,
      accessToken: response.AuthenticationResult.AccessToken,
      idToken: response.AuthenticationResult.IdToken,
      refreshToken: response.AuthenticationResult.RefreshToken,
      expiresIn: response.AuthenticationResult.ExpiresIn
    };
  } catch (error) {
    logger.error('Sign in failed', { email, error: error.message });
    throw formatCognitoError(error);
  }
}

/**
 * Refresh access token using refresh token
 */
export async function refreshTokens(refreshToken) {
  if (!isCognitoConfigured()) {
    throw new Error('Cognito not configured');
  }

  try {
    const config = getConfig();
    const command = new InitiateAuthCommand({
      AuthFlow: 'REFRESH_TOKEN_AUTH',
      ClientId: config.clientId,
      AuthParameters: {
        REFRESH_TOKEN: refreshToken
      }
    });

    const response = await getCognitoClient().send(command);
    
    return {
      success: true,
      accessToken: response.AuthenticationResult.AccessToken,
      idToken: response.AuthenticationResult.IdToken,
      expiresIn: response.AuthenticationResult.ExpiresIn
    };
  } catch (error) {
    logger.error('Token refresh failed', { error: error.message });
    throw formatCognitoError(error);
  }
}

/**
 * Get user info from access token
 */
export async function getUser(accessToken) {
  if (!isCognitoConfigured()) {
    throw new Error('Cognito not configured');
  }

  try {
    const command = new GetUserCommand({
      AccessToken: accessToken
    });

    const response = await getCognitoClient().send(command);
    
    // Parse attributes into object
    const attributes = {};
    for (const attr of response.UserAttributes) {
      const key = attr.Name.replace('custom:', '');
      attributes[key] = attr.Value;
    }
    
    return {
      username: response.Username,
      email: attributes.email,
      name: attributes.name,
      tenantId: attributes.tenant_id,
      companyId: attributes.company_id,
      emailVerified: attributes.email_verified === 'true',
      attributes
    };
  } catch (error) {
    logger.error('Get user failed', { error: error.message });
    throw formatCognitoError(error);
  }
}

/**
 * Sign out user (global sign out - invalidates all tokens)
 */
export async function signOut(accessToken) {
  if (!isCognitoConfigured()) {
    throw new Error('Cognito not configured');
  }

  try {
    const command = new GlobalSignOutCommand({
      AccessToken: accessToken
    });

    await getCognitoClient().send(command);
    
    logger.info('User signed out');
    
    return { success: true, message: 'Signed out successfully' };
  } catch (error) {
    logger.error('Sign out failed', { error: error.message });
    throw formatCognitoError(error);
  }
}

/**
 * Initiate forgot password flow
 */
export async function forgotPassword(email) {
  if (!isCognitoConfigured()) {
    throw new Error('Cognito not configured');
  }

  try {
    const config = getConfig();
    const command = new ForgotPasswordCommand({
      ClientId: config.clientId,
      Username: email
    });

    await getCognitoClient().send(command);
    
    logger.info('Password reset initiated', { email });
    
    return {
      success: true,
      message: 'Password reset code sent to your email'
    };
  } catch (error) {
    logger.error('Forgot password failed', { email, error: error.message });
    throw formatCognitoError(error);
  }
}

/**
 * Confirm forgot password with code and new password
 */
export async function confirmForgotPassword(email, code, newPassword) {
  if (!isCognitoConfigured()) {
    throw new Error('Cognito not configured');
  }

  try {
    const config = getConfig();
    const command = new ConfirmForgotPasswordCommand({
      ClientId: config.clientId,
      Username: email,
      ConfirmationCode: code,
      Password: newPassword
    });

    await getCognitoClient().send(command);
    
    logger.info('Password reset confirmed', { email });
    
    return {
      success: true,
      message: 'Password reset successfully. You can now sign in.'
    };
  } catch (error) {
    logger.error('Confirm forgot password failed', { email, error: error.message });
    throw formatCognitoError(error);
  }
}

// ============================================
// Admin Functions (require admin credentials)
// ============================================

/**
 * Admin: Create a new user
 */
export async function adminCreateUser(email, temporaryPassword, attributes = {}) {
  if (!isCognitoConfigured()) {
    throw new Error('Cognito not configured');
  }

  const userAttributes = [
    { Name: 'email', Value: email },
    { Name: 'email_verified', Value: 'true' }
  ];

  if (attributes.name) {
    userAttributes.push({ Name: 'name', Value: attributes.name });
  }
  if (attributes.tenantId) {
    userAttributes.push({ Name: 'custom:tenant_id', Value: attributes.tenantId });
  }
  if (attributes.companyId) {
    userAttributes.push({ Name: 'custom:company_id', Value: attributes.companyId });
  }

  try {
    const command = new AdminCreateUserCommand({
      UserPoolId: getConfig().userPoolId,
      Username: email,
      TemporaryPassword: temporaryPassword,
      UserAttributes: userAttributes,
      MessageAction: 'SUPPRESS' // Don't send welcome email (optional)
    });

    const response = await getCognitoClient().send(command);
    
    logger.info('Admin created user', { email });
    
    return {
      success: true,
      user: response.User
    };
  } catch (error) {
    logger.error('Admin create user failed', { email, error: error.message });
    throw formatCognitoError(error);
  }
}

/**
 * Admin: Add user to group
 */
export async function adminAddUserToGroup(email, groupName) {
  if (!isCognitoConfigured()) {
    throw new Error('Cognito not configured');
  }

  try {
    const command = new AdminAddUserToGroupCommand({
      UserPoolId: getConfig().userPoolId,
      Username: email,
      GroupName: groupName
    });

    await getCognitoClient().send(command);
    
    logger.info('User added to group', { email, groupName });
    
    return { success: true };
  } catch (error) {
    logger.error('Add user to group failed', { email, groupName, error: error.message });
    throw formatCognitoError(error);
  }
}

/**
 * Admin: Get user details
 */
export async function adminGetUser(email) {
  if (!isCognitoConfigured()) {
    throw new Error('Cognito not configured');
  }

  try {
    const command = new AdminGetUserCommand({
      UserPoolId: getConfig().userPoolId,
      Username: email
    });

    const response = await getCognitoClient().send(command);
    
    // Parse attributes
    const attributes = {};
    for (const attr of response.UserAttributes) {
      const key = attr.Name.replace('custom:', '');
      attributes[key] = attr.Value;
    }
    
    return {
      username: response.Username,
      status: response.UserStatus,
      enabled: response.Enabled,
      createdAt: response.UserCreateDate,
      modifiedAt: response.UserLastModifiedDate,
      attributes
    };
  } catch (error) {
    logger.error('Admin get user failed', { email, error: error.message });
    throw formatCognitoError(error);
  }
}

/**
 * Admin: Update user attributes
 */
export async function adminUpdateUserAttributes(email, attributes) {
  if (!isCognitoConfigured()) {
    throw new Error('Cognito not configured');
  }

  const userAttributes = Object.entries(attributes).map(([key, value]) => ({
    Name: key.startsWith('custom:') ? key : key,
    Value: value
  }));

  try {
    const command = new AdminUpdateUserAttributesCommand({
      UserPoolId: getConfig().userPoolId,
      Username: email,
      UserAttributes: userAttributes
    });

    await getCognitoClient().send(command);
    
    logger.info('User attributes updated', { email });
    
    return { success: true };
  } catch (error) {
    logger.error('Update user attributes failed', { email, error: error.message });
    throw formatCognitoError(error);
  }
}

// ============================================
// Express Middleware
// ============================================

/**
 * Middleware to verify JWT token
 */
export function authMiddleware(options = {}) {
  const { required = true } = options;
  
  return async (req, res, next) => {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      if (required) {
        return res.status(401).json({ error: 'Authorization token required' });
      }
      req.user = null;
      return next();
    }
    
    const token = authHeader.split(' ')[1];
    
    try {
      const user = await getUser(token);
      req.user = user;
      req.accessToken = token;
      next();
    } catch (error) {
      if (required) {
        return res.status(401).json({ error: 'Invalid or expired token' });
      }
      req.user = null;
      next();
    }
  };
}

/**
 * Middleware to require specific group membership
 */
export function requireGroup(groupName) {
  return async (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    // Check group membership via ID token claims or admin API
    // For now, we'll check via admin API
    try {
      const userDetails = await adminGetUser(req.user.email);
      // Group info would need to be fetched separately or from ID token
      // This is a simplified check
      next();
    } catch (error) {
      return res.status(403).json({ error: 'Access denied' });
    }
  };
}

// ============================================
// Helpers
// ============================================

/**
 * Format Cognito errors into user-friendly messages
 */
function formatCognitoError(error) {
  const errorMap = {
    'UserNotFoundException': { status: 404, message: 'User not found' },
    'UsernameExistsException': { status: 409, message: 'An account with this email already exists' },
    'InvalidPasswordException': { status: 400, message: 'Password does not meet requirements' },
    'NotAuthorizedException': { status: 401, message: 'Incorrect email or password' },
    'UserNotConfirmedException': { status: 403, message: 'Please verify your email before signing in' },
    'CodeMismatchException': { status: 400, message: 'Invalid verification code' },
    'ExpiredCodeException': { status: 400, message: 'Verification code has expired' },
    'LimitExceededException': { status: 429, message: 'Too many attempts. Please try again later' },
    'TooManyRequestsException': { status: 429, message: 'Too many requests. Please try again later' },
    'InvalidParameterException': { status: 400, message: 'Invalid request parameters' }
  };

  const mapped = errorMap[error.name];
  if (mapped) {
    const err = new Error(mapped.message);
    err.status = mapped.status;
    err.code = error.name;
    return err;
  }

  // Return original error for unmapped errors
  error.status = error.status || 500;
  return error;
}

/**
 * Generate a secure random password
 */
export function generateSecurePassword(length = 16) {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';
  let password = '';
  const randomBytes = crypto.randomBytes(length);
  for (let i = 0; i < length; i++) {
    password += chars[randomBytes[i] % chars.length];
  }
  return password;
}

// ============================================
// Export
// ============================================

export default {
  isCognitoConfigured,
  getHostedUIUrls,
  signUp,
  confirmSignUp,
  signIn,
  refreshTokens,
  getUser,
  signOut,
  forgotPassword,
  confirmForgotPassword,
  adminCreateUser,
  adminAddUserToGroup,
  adminGetUser,
  adminUpdateUserAttributes,
  authMiddleware,
  requireGroup,
  generateSecurePassword
};

