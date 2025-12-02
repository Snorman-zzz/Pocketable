import { Router, Request, Response } from 'express';
import { supabaseIntegrationService } from '../services/supabase-integration';
import { databaseService } from '../services/database';
import { authenticateToken } from '../middleware/auth';

const router = Router();

// Initiate OAuth flow
router.post('/auth', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { projectId } = req.body;
    const userId = req.user!.id;

    if (!projectId) {
      return res.status(400).json({ error: 'Project ID is required' });
    }

    // Verify project ownership
    const project = await databaseService.query(
      'SELECT * FROM projects WHERE id = $1 AND user_id = $2',
      [projectId, userId]
    );

    if (project.rows.length === 0) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // Generate OAuth authorization URL
    const authUrl = supabaseIntegrationService.getAuthorizationUrl(projectId, userId);

    res.json({ authUrl });
  } catch (error) {
    console.error('Supabase auth initiation error:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to initiate Supabase connection',
    });
  }
});

// OAuth callback handler (no auth required - comes from external browser)
router.get('/callback', async (req: Request, res: Response) => {
  try {
    const { code, state } = req.query;

    if (!code || !state) {
      return res.status(400).send('Invalid OAuth callback');
    }

    // Decode state to get project ID, user ID, and code verifier
    let stateData: any;
    try {
      stateData = JSON.parse(
        Buffer.from(state as string, 'base64url').toString()
      );
    } catch (parseError) {
      console.error('Failed to parse state:', parseError);
      return res.status(400).send('Invalid state parameter');
    }

    const { projectId, userId, codeVerifier } = stateData;

    if (!projectId || !userId) {
      return res.status(400).send('Missing projectId or userId in state');
    }

    try {
      // Exchange code for tokens
      console.log('Attempting token exchange with code:', {
        codePreview: (code as string).substring(0, 20) + '...',
        hasCodeVerifier: !!codeVerifier,
        timestamp: new Date().toISOString()
      });

      const tokens = await supabaseIntegrationService.exchangeCodeForTokens(
        code as string,
        codeVerifier
      );

      // Use normalized token fields (already normalized in exchangeCodeForTokens)
      const accessToken = tokens.access_token || tokens.accessToken;
      const refreshToken = tokens.refresh_token || tokens.refreshToken;

      // Debug: Log the received tokens (without exposing the full token)
      console.log('OAuth tokens received:', {
        has_access_token: !!accessToken,
        access_token_length: accessToken?.length,
        access_token_preview: accessToken ? accessToken.substring(0, 20) + '...' : 'none',
        has_refresh_token: !!refreshToken,
        token_type: tokens.token_type || tokens.tokenType,
        expires_in: tokens.expires_in || tokens.expiresIn,
      });

      if (!accessToken) {
        throw new Error('No access token received from OAuth provider');
      }

      // Get the list of projects from Supabase
      const supabaseProjects = await supabaseIntegrationService.getProjects(accessToken);

      if (supabaseProjects.length > 0) {
        // For now, use the first project
        // In a full implementation, you'd let the user select which project to connect
        const firstProject = supabaseProjects[0];

        const projectDetails = {
          id: firstProject.id,
          name: firstProject.name,
          api_url: `https://${firstProject.ref}.supabase.co`,
          anon_key: firstProject.anon_key || '',
          service_role_key: firstProject.service_role_key,
        };

        // Save connection to database
        await supabaseIntegrationService.saveConnection(
          projectId,
          firstProject.ref || firstProject.id,
          tokens,
          projectDetails
        );

        // No longer saving credentials to knowledge field - they're securely stored in supabase_connections table
        // The generate-daytona.ts route will fetch them from there and inject as environment variables

        console.log(`Successfully connected Supabase project ${firstProject.name} for project ${projectId}`);
      } else {
        // No projects available - DO NOT mark as connected
        // User will need to create a Supabase project first and reconnect
        console.log('Supabase OAuth successful but no projects available yet');

        // Return a different message indicating they need to create a project first
        return res.send(`
          <!DOCTYPE html>
          <html>
            <head>
              <title>Setup Required</title>
              <style>
                body {
                  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                  display: flex;
                  justify-content: center;
                  align-items: center;
                  height: 100vh;
                  margin: 0;
                  background: #0F0F0F;
                  color: white;
                }
                .container {
                  text-align: center;
                  padding: 2rem;
                  max-width: 500px;
                }
                .icon {
                  font-size: 48px;
                  color: #FFA500;
                  margin-bottom: 1rem;
                }
                h1 {
                  font-size: 24px;
                  margin-bottom: 0.5rem;
                }
                p {
                  color: #A1A1AA;
                  margin-top: 0.5rem;
                  line-height: 1.5;
                }
              </style>
            </head>
            <body>
              <div class="container">
                <div class="icon">⚠</div>
                <h1>Supabase Project Required</h1>
                <p>Authentication successful, but you don't have any Supabase projects yet.</p>
                <p>Please create a project in your Supabase dashboard first, then reconnect.</p>
              </div>
              <script>
                // Auto-close after 5 seconds
                setTimeout(() => {
                  window.close();
                }, 5000);
              </script>
            </body>
          </html>
        `);
      }
    } catch (tokenError) {
      // Log the error and DO NOT mark as connected
      console.error('OAuth flow error:', tokenError);

      // Return error page instead of success
      return res.status(500).send(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>Connection Failed</title>
            <style>
              body {
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                display: flex;
                justify-content: center;
                align-items: center;
                height: 100vh;
                margin: 0;
                background: #0F0F0F;
                color: white;
              }
              .container {
                text-align: center;
                padding: 2rem;
              }
              .icon {
                font-size: 48px;
                color: #EF4444;
                margin-bottom: 1rem;
              }
              h1 {
                font-size: 24px;
                margin-bottom: 0.5rem;
              }
              p {
                color: #A1A1AA;
                margin-top: 0.5rem;
              }
              .error-details {
                margin-top: 2rem;
                padding: 1rem;
                background: #1A1A1A;
                border-radius: 8px;
                font-family: monospace;
                font-size: 12px;
                color: #EF4444;
                text-align: left;
              }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="icon">✗</div>
              <h1>Connection Failed</h1>
              <p>Unable to connect to Supabase. Please try again.</p>
              <div class="error-details">${tokenError instanceof Error ? tokenError.message : 'Unknown error occurred'}</div>
            </div>
          </body>
        </html>
      `);
    }

    // Success page
    res.send(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Connection Successful</title>
          <style>
            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
              display: flex;
              justify-content: center;
              align-items: center;
              height: 100vh;
              margin: 0;
              background: #0F0F0F;
              color: white;
            }
            .container {
              text-align: center;
              padding: 2rem;
            }
            .icon {
              font-size: 48px;
              color: #22C55E;
              margin-bottom: 1rem;
            }
            h1 {
              font-size: 24px;
              margin-bottom: 0.5rem;
            }
            p {
              color: #A1A1AA;
              margin-top: 0.5rem;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="icon">✓</div>
            <h1>Connection Successful</h1>
            <p>Your Supabase organization has been linked. You can close this tab and return to the app.</p>
          </div>
          <script>
            // Auto-close after 3 seconds
            setTimeout(() => {
              window.close();
            }, 3000);
          </script>
        </body>
      </html>
    `);
  } catch (error) {
    console.error('Supabase OAuth callback error:', error);

    // Error page
    res.status(500).send(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Connection Failed</title>
          <style>
            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
              display: flex;
              justify-content: center;
              align-items: center;
              height: 100vh;
              margin: 0;
              background: #0F0F0F;
              color: white;
            }
            .container {
              text-align: center;
              padding: 2rem;
            }
            .icon {
              font-size: 48px;
              color: #EF4444;
              margin-bottom: 1rem;
            }
            h1 {
              font-size: 24px;
              margin-bottom: 0.5rem;
            }
            p {
              color: #A1A1AA;
              margin-top: 0.5rem;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="icon">✗</div>
            <h1>Connection Failed</h1>
            <p>Unable to connect your Supabase organization. Please try again.</p>
          </div>
        </body>
      </html>
    `);
  }
});

// Get connection status
router.get('/status/:projectId', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    const userId = req.user!.id;

    // Verify project ownership
    const project = await databaseService.query(
      'SELECT has_supabase FROM projects WHERE id = $1 AND user_id = $2',
      [projectId, userId]
    );

    if (project.rows.length === 0) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const hasSupabase = project.rows[0].has_supabase || false;

    if (hasSupabase) {
      const connection = await supabaseIntegrationService.getConnection(projectId);

      res.json({
        connected: true,
        projectRef: connection?.supabase_project_ref,
        apiUrl: connection?.api_url,
      });
    } else {
      res.json({ connected: false });
    }
  } catch (error) {
    console.error('Supabase status check error:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to check Supabase status',
    });
  }
});

// Disconnect Supabase
router.delete('/disconnect/:projectId', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    const userId = req.user!.id;

    // Verify project ownership
    const project = await databaseService.query(
      'SELECT * FROM projects WHERE id = $1 AND user_id = $2',
      [projectId, userId]
    );

    if (project.rows.length === 0) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // Disconnect Supabase
    await supabaseIntegrationService.disconnectProject(projectId);

    res.json({ success: true, message: 'Supabase disconnected successfully' });
  } catch (error) {
    console.error('Supabase disconnect error:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to disconnect Supabase',
    });
  }
});

// Get Supabase client code for injection
router.get('/client-code/:projectId', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    const userId = req.user!.id;

    // Verify project ownership
    const project = await databaseService.query(
      'SELECT has_supabase FROM projects WHERE id = $1 AND user_id = $2',
      [projectId, userId]
    );

    if (project.rows.length === 0) {
      return res.status(404).json({ error: 'Project not found' });
    }

    if (!project.rows[0].has_supabase) {
      return res.status(400).json({ error: 'Project does not have Supabase connected' });
    }

    // Get connection details
    const connection = await supabaseIntegrationService.getConnection(projectId);

    if (!connection) {
      return res.status(404).json({ error: 'Supabase connection not found' });
    }

    // Generate client code
    const clientCode = supabaseIntegrationService.generateSupabaseClientCode(
      connection.api_url,
      connection.anon_key
    );

    res.json({ code: clientCode });
  } catch (error) {
    console.error('Get client code error:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to generate client code',
    });
  }
});

export default router;