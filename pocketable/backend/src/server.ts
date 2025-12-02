import dotenv from 'dotenv';

// Load environment variables FIRST (before any other imports)
// This ensures env vars are available when modules are evaluated
if (process.env.NODE_ENV !== 'production') {
  dotenv.config();
}

import express from 'express';
import cors from 'cors';
import authRoutes from './routes/auth';
import mediaRoutes from './routes/media';
import projectsRoutes from './routes/projects';
import filesRoutes from './routes/files';
import generateDaytonaRoutes from './routes/generate-daytona';
import snapshotsRoutes from './routes/snapshots';
import messagesRoutes from './routes/messages';
import supabaseRoutes from './routes/supabase-integration';
import suggestionsRoutes from './routes/suggestions';
import { databaseService } from './services/database';

// Debug: Log environment info
console.log('Environment:', process.env.NODE_ENV);
console.log('DATABASE_URL present:', !!process.env.DATABASE_URL);
console.log('DATABASE_URL value:', process.env.DATABASE_URL?.substring(0, 30) + '...');
console.log('ROUTING_ENABLED:', process.env.ROUTING_ENABLED);
console.log('All env vars:', Object.keys(process.env).filter(k => k.includes('ROUTING')));
console.log('OAuth Client ID:', process.env.SUPABASE_OAUTH_CLIENT_ID);

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// API Routes
app.use('/api/auth', authRoutes); // Auth routes (public)
app.use('/api/media', mediaRoutes);
app.use('/api/projects', projectsRoutes);
app.use('/api', filesRoutes);
app.use('/api/generate-daytona', generateDaytonaRoutes);
app.use('/api/snapshots', snapshotsRoutes);
app.use('/api/messages', messagesRoutes);
app.use('/api/supabase', supabaseRoutes); // Supabase integration routes
app.use('/api/suggestions', suggestionsRoutes); // Smart suggestions routes

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    daytona: !!process.env.DAYTONA_API_KEY,
    anthropic: !!process.env.ANTHROPIC_API_KEY,
    openai: !!process.env.OPENAI_API_KEY,
    database: databaseService.isAvailable(),
  });
});

// Initialize database and start server
async function startServer() {
  try {
    // Initialize database connection
    await databaseService.initialize();

    // Start HTTP server with extended timeout for long-running operations
    // Listen on 0.0.0.0 to allow connections from mobile devices/simulators
    const server = app.listen(PORT, '0.0.0.0', () => {
      console.log(`🚀 Backend server running on port ${PORT}`);
      console.log(`🔑 Claude API Key: ${process.env.ANTHROPIC_API_KEY ? '✓ Set' : '✗ Missing'}`);
      console.log(`🔑 OpenAI API Key: ${process.env.OPENAI_API_KEY ? '✓ Set' : '✗ Missing'}`);
      console.log(`🔑 Daytona API Key: ${process.env.DAYTONA_API_KEY ? '✓ Set' : '✗ Missing'}`);
      console.log();
    });

    // Remove all timeout limits for long-running Daytona generations
    // This prevents 504 Gateway Timeout errors during code generation
    server.timeout = 0; // No timeout limit
    server.keepAliveTimeout = 0; // No timeout limit
    server.headersTimeout = 0; // No timeout limit

    console.log(`⏱️  Server timeout disabled (unlimited) for long-running operations`);
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

// Start the server
startServer();
