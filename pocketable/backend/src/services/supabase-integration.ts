import crypto from 'crypto';
import { databaseService } from './database';

// Supabase OAuth scopes we need for full functionality
const SUPABASE_OAUTH_SCOPES = [
  'projects.read',     // List and read projects
  'projects.write',    // Create/update projects
  'organizations.read' // Read organization info
].join(' '); // Space-delimited as per OAuth2 spec

interface SupabaseConnection {
  project_id: string;
  supabase_project_ref: string;
  access_token: string;
  refresh_token: string;
  api_url: string;
  anon_key: string;
  created_at?: string;
  updated_at?: string;
}

interface SupabaseOAuthTokens {
  // Support both camelCase and snake_case field names
  access_token?: string;
  accessToken?: string;
  refresh_token?: string;
  refreshToken?: string;
  expires_in?: number;
  expiresIn?: number;
  token_type?: string;
  tokenType?: string;
}

interface SupabaseProjectDetails {
  id: string;
  name: string;
  api_url: string;
  anon_key: string;
  service_role_key?: string;
}

export class SupabaseIntegrationService {
  private encryptionKey: string;

  constructor() {
    // Use environment variable or generate a key
    this.encryptionKey = process.env.ENCRYPTION_KEY || crypto.randomBytes(32).toString('hex');
  }

  // Encryption methods for storing sensitive tokens
  private encrypt(text: string): string {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(
      'aes-256-cbc',
      Buffer.from(this.encryptionKey.slice(0, 32)),
      iv
    );
    let encrypted = cipher.update(text);
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    return iv.toString('hex') + ':' + encrypted.toString('hex');
  }

  private decrypt(text: string): string {
    const parts = text.split(':');
    const iv = Buffer.from(parts.shift()!, 'hex');
    const encryptedText = Buffer.from(parts.join(':'), 'hex');
    const decipher = crypto.createDecipheriv(
      'aes-256-cbc',
      Buffer.from(this.encryptionKey.slice(0, 32)),
      iv
    );
    let decrypted = decipher.update(encryptedText);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString();
  }

  // Generate OAuth authorization URL
  getAuthorizationUrl(projectId: string, userId: string): string {
    const clientId = process.env.SUPABASE_OAUTH_CLIENT_ID;
    if (!clientId) {
      throw new Error('SUPABASE_OAUTH_CLIENT_ID not configured');
    }

    // Generate state parameter with project and user info
    const state = Buffer.from(JSON.stringify({ projectId, userId })).toString('base64');

    // Generate PKCE code verifier and challenge
    const codeVerifier = crypto.randomBytes(32).toString('base64url');
    const codeChallenge = crypto
      .createHash('sha256')
      .update(codeVerifier)
      .digest('base64url');

    // Store code verifier temporarily (in production, use Redis or similar)
    // For now, we'll include it in the state
    const stateWithVerifier = Buffer.from(
      JSON.stringify({ projectId, userId, codeVerifier })
    ).toString('base64url');

    const params = new URLSearchParams({
      client_id: clientId,
      response_type: 'code',
      redirect_uri: `${process.env.BACKEND_URL || 'http://localhost:3001'}/api/supabase/callback`,
      state: stateWithVerifier,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      scope: SUPABASE_OAUTH_SCOPES, // Request specific scopes (space-delimited)
    });

    // Log the authorization URL for debugging
    const authUrl = `https://api.supabase.com/v1/oauth/authorize?${params.toString()}`;
    console.log('OAuth Authorization URL:', {
      url: authUrl,
      scopes: params.get('scope'),
      client_id: params.get('client_id'),
      redirect_uri: params.get('redirect_uri')
    });

    return authUrl;
  }

  // Exchange authorization code for tokens
  async exchangeCodeForTokens(
    code: string,
    codeVerifier: string
  ): Promise<SupabaseOAuthTokens> {
    const clientId = process.env.SUPABASE_OAUTH_CLIENT_ID;
    const clientSecret = process.env.SUPABASE_OAUTH_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      throw new Error('Supabase OAuth credentials not configured');
    }

    // Use the correct Supabase OAuth token endpoint with Basic Auth
    // Per OAuth2 spec, client credentials must be sent as Basic Auth header
    const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

    // Debug: Log client ID (not the secret)
    console.log('OAuth token exchange:', {
      clientId,
      clientSecretLength: clientSecret?.length,
      clientSecretPrefix: clientSecret?.substring(0, 10) + '...',
      redirectUri: `${process.env.BACKEND_URL || 'http://localhost:3001'}/api/supabase/callback`,
    });

    const response = await fetch('https://api.supabase.com/v1/oauth/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${basicAuth}`,
        'Accept': 'application/json',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: `${process.env.BACKEND_URL || 'http://localhost:3001'}/api/supabase/callback`,
        code_verifier: codeVerifier,
      }).toString(),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('Token exchange failed - Response:', {
        status: response.status,
        statusText: response.statusText,
        error: error
      });
      throw new Error(`Token exchange failed: ${error}`);
    }

    const result = await response.json();

    // Debug: Log the structure of the response
    console.log('Token exchange response structure:', {
      keys: Object.keys(result),
      has_access_token: 'access_token' in result,
      has_accessToken: 'accessToken' in result,
      has_refresh_token: 'refresh_token' in result,
      has_refreshToken: 'refreshToken' in result,
      token_type: result.token_type || result.tokenType,
    });

    // Check if this is an error response even though status was 200
    if (result.error || result.message) {
      console.error('OAuth error in response body:', result);
      throw new Error(result.error_description || result.message || 'OAuth token exchange failed');
    }

    // Normalize field names - handle both camelCase and snake_case
    const normalizedResult: SupabaseOAuthTokens = {
      access_token: result.access_token || result.accessToken,
      refresh_token: result.refresh_token || result.refreshToken,
      expires_in: result.expires_in || result.expiresIn,
      token_type: result.token_type || result.tokenType,
    };

    // Validate that we got an access token
    const accessToken = normalizedResult.access_token;
    if (!accessToken) {
      console.error('No access token in response:', result);
      throw new Error('No access token received from OAuth provider');
    }

    // Validate token format
    // Supabase OAuth tokens start with 'sbp_oauth_' (platform tokens)
    // These are different from JWT tokens and are valid for the Management API
    if (typeof accessToken !== 'string') {
      console.error('Invalid token type:', {
        tokenType: typeof accessToken,
        tokenValue: accessToken
      });
      throw new Error('Access token must be a string');
    }

    // Check if it's a valid Supabase platform token (sbp_oauth_*) or a JWT (3 parts)
    const isSupabasePlatformToken = accessToken.startsWith('sbp_oauth_');
    const isJWT = accessToken.split('.').length === 3;

    if (!isSupabasePlatformToken && !isJWT) {
      console.error('Invalid token format:', {
        tokenPreview: accessToken.substring(0, 50) + '...',
        startsWithSbp: accessToken.startsWith('sbp_'),
        tokenParts: accessToken.split('.').length
      });
      throw new Error('Invalid token format - expected Supabase platform token (sbp_oauth_*) or JWT');
    }

    console.log('OAuth token validated successfully:', {
      hasAccessToken: true,
      hasRefreshToken: !!normalizedResult.refresh_token,
      tokenType: normalizedResult.token_type,
      expiresIn: normalizedResult.expires_in,
    });

    // Decode JWT to verify scopes (if it's a JWT)
    if (isJWT) {
      try {
        const tokenParts = accessToken.split('.');
        const payload = JSON.parse(Buffer.from(tokenParts[1], 'base64').toString());
        console.log('JWT Token payload:', {
          scopes: payload.scp || payload.scope || 'none',
          expires: payload.exp ? new Date(payload.exp * 1000).toISOString() : 'no expiry',
          issuer: payload.iss,
          subject: payload.sub
        });
      } catch (decodeError) {
        console.error('Failed to decode JWT:', decodeError);
      }
    } else if (isSupabasePlatformToken) {
      console.log('Supabase platform token received (sbp_oauth_*) - scopes embedded in token');
    }

    // Note: We'll test the token with the actual projects API call, not a test endpoint
    // The /v1/profile endpoint doesn't exist, so we removed that test

    return normalizedResult;
  }

  // Refresh access token
  async refreshAccessToken(refreshToken: string): Promise<SupabaseOAuthTokens> {
    const clientId = process.env.SUPABASE_OAUTH_CLIENT_ID;
    const clientSecret = process.env.SUPABASE_OAUTH_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      throw new Error('Supabase OAuth credentials not configured');
    }

    // Use Basic Auth for refresh token request as well
    const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

    const response = await fetch('https://api.supabase.com/v1/oauth/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${basicAuth}`,
        'Accept': 'application/json',
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      }).toString(),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Token refresh failed: ${error}`);
    }

    const result = await response.json();

    // Check if this is an error response
    if (result.error || result.message) {
      throw new Error(result.error_description || result.message || 'Token refresh failed');
    }

    // Normalize field names - handle both camelCase and snake_case
    const normalizedResult: SupabaseOAuthTokens = {
      access_token: result.access_token || result.accessToken,
      refresh_token: result.refresh_token || result.refreshToken,
      expires_in: result.expires_in || result.expiresIn,
      token_type: result.token_type || result.tokenType,
    };

    // Validate that we got an access token
    if (!normalizedResult.access_token) {
      throw new Error('No access token received from token refresh');
    }

    return normalizedResult;
  }

  // Get project list from Supabase Management API
  async getProjects(accessToken: string): Promise<any[]> {
    console.log('Fetching projects with access token:', {
      tokenPreview: accessToken.substring(0, 30) + '...',
      tokenLength: accessToken.length,
      isSupabasePlatformToken: accessToken.startsWith('sbp_oauth_'),
    });

    const response = await fetch(
      'https://api.supabase.com/v1/projects',
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    if (!response.ok) {
      const error = await response.text();
      console.error('Projects API error:', {
        status: response.status,
        statusText: response.statusText,
        error: error,
        tokenUsed: accessToken.substring(0, 30) + '...',
      });
      throw new Error(`Failed to fetch projects: ${error}`);
    }

    return response.json();
  }

  // Get project details from Supabase Management API
  async getProjectDetails(
    accessToken: string,
    projectRef: string
  ): Promise<SupabaseProjectDetails> {
    // First get the project details
    const response = await fetch(
      `https://api.supabase.com/v1/projects/${projectRef}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to fetch project details: ${error}`);
    }

    const project = await response.json();

    // Extract the necessary details
    return {
      id: project.id,
      name: project.name,
      api_url: `https://${project.ref}.supabase.co`,
      anon_key: project.anon_key || '', // These would need to be fetched separately
      service_role_key: project.service_role_key,
    };
  }

  // Save connection to database
  async saveConnection(
    projectId: string,
    supabaseProjectRef: string,
    tokens: SupabaseOAuthTokens,
    projectDetails: SupabaseProjectDetails
  ): Promise<void> {
    // Use normalized field names (we've already normalized in exchangeCodeForTokens)
    const accessToken = tokens.access_token || tokens.accessToken;
    const refreshToken = tokens.refresh_token || tokens.refreshToken;

    if (!accessToken || !refreshToken) {
      throw new Error('Missing access token or refresh token in saveConnection');
    }

    const encryptedAccessToken = this.encrypt(accessToken);
    const encryptedRefreshToken = this.encrypt(refreshToken);

    // Check if connection already exists
    const existing = await databaseService.query(
      'SELECT id FROM supabase_connections WHERE project_id = $1',
      [projectId]
    );

    if (existing.rows.length > 0) {
      // Update existing connection
      await databaseService.query(
        `UPDATE supabase_connections
         SET supabase_project_ref = $2,
             access_token = $3,
             refresh_token = $4,
             api_url = $5,
             anon_key = $6,
             updated_at = NOW()
         WHERE project_id = $1`,
        [
          projectId,
          supabaseProjectRef,
          encryptedAccessToken,
          encryptedRefreshToken,
          projectDetails.api_url,
          projectDetails.anon_key,
        ]
      );
    } else {
      // Insert new connection
      await databaseService.query(
        `INSERT INTO supabase_connections
         (project_id, supabase_project_ref, access_token, refresh_token, api_url, anon_key)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          projectId,
          supabaseProjectRef,
          encryptedAccessToken,
          encryptedRefreshToken,
          projectDetails.api_url,
          projectDetails.anon_key,
        ]
      );
    }

    // Update project to mark it as having Supabase
    await databaseService.query(
      'UPDATE projects SET has_supabase = true WHERE id = $1',
      [projectId]
    );
  }

  // Get connection for a project
  async getConnection(projectId: string): Promise<SupabaseConnection | null> {
    const result = await databaseService.query(
      'SELECT * FROM supabase_connections WHERE project_id = $1',
      [projectId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const connection = result.rows[0];

    // Decrypt tokens before returning
    return {
      ...connection,
      access_token: this.decrypt(connection.access_token),
      refresh_token: this.decrypt(connection.refresh_token),
    };
  }

  // Disconnect Supabase from project
  async disconnectProject(projectId: string): Promise<void> {
    await databaseService.query(
      'DELETE FROM supabase_connections WHERE project_id = $1',
      [projectId]
    );

    await databaseService.query(
      'UPDATE projects SET has_supabase = false WHERE id = $1',
      [projectId]
    );
  }

  // Generate Supabase client initialization code for injection
  generateSupabaseClientCode(apiUrl: string, anonKey: string): string {
    return `
// Supabase Configuration (Auto-generated by Pocketable)
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = '${apiUrl}';
const supabaseAnonKey = '${anonKey}';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Example: Authentication
export async function signUp(email, password) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
  });

  if (error) throw error;
  return data;
}

export async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) throw error;
  return data;
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

// Example: Database operations
export async function getTodos() {
  const { data, error } = await supabase
    .from('todos')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data;
}

export async function createTodo(text) {
  const { data, error } = await supabase
    .from('todos')
    .insert({ text, completed: false })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function updateTodo(id, updates) {
  const { data, error } = await supabase
    .from('todos')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function deleteTodo(id) {
  const { error } = await supabase
    .from('todos')
    .delete()
    .eq('id', id);

  if (error) throw error;
}
`;
  }
}

// Export singleton instance
export const supabaseIntegrationService = new SupabaseIntegrationService();