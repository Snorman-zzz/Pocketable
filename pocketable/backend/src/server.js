"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv_1 = __importDefault(require("dotenv"));
// Load environment variables FIRST (before any other imports)
// This ensures env vars are available when modules are evaluated
if (process.env.NODE_ENV !== 'production') {
    dotenv_1.default.config();
}
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const media_1 = __importDefault(require("./routes/media"));
const projects_1 = __importDefault(require("./routes/projects"));
const files_1 = __importDefault(require("./routes/files"));
const generate_daytona_1 = __importDefault(require("./routes/generate-daytona"));
const snapshots_1 = __importDefault(require("./routes/snapshots"));
const messages_1 = __importDefault(require("./routes/messages"));
const database_1 = require("./services/database");
// Debug: Log environment info
console.log('Environment:', process.env.NODE_ENV);
console.log('DATABASE_URL present:', !!process.env.DATABASE_URL);
console.log('DATABASE_URL value:', process.env.DATABASE_URL?.substring(0, 30) + '...');
console.log('ROUTING_ENABLED:', process.env.ROUTING_ENABLED);
console.log('All env vars:', Object.keys(process.env).filter(k => k.includes('ROUTING')));
// Initialize Express app
const app = (0, express_1.default)();
const PORT = process.env.PORT || 3000;
// Middleware
app.use((0, cors_1.default)());
app.use(express_1.default.json({ limit: '50mb' }));
app.use(express_1.default.urlencoded({ extended: true, limit: '50mb' }));
// API Routes
app.use('/api/media', media_1.default);
app.use('/api/projects', projects_1.default);
app.use('/api', files_1.default);
app.use('/api/generate-daytona', generate_daytona_1.default);
app.use('/api/snapshots', snapshots_1.default);
app.use('/api/messages', messages_1.default);
// Health check endpoint
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        daytona: !!process.env.DAYTONA_API_KEY,
        anthropic: !!process.env.ANTHROPIC_API_KEY,
        openai: !!process.env.OPENAI_API_KEY,
        database: database_1.databaseService.isAvailable(),
    });
});
// Initialize database and start server
async function startServer() {
    try {
        // Initialize database connection
        await database_1.databaseService.initialize();
        // Start HTTP server
        app.listen(PORT, () => {
            console.log(`🚀 Backend server running on port ${PORT}`);
            console.log(`🔑 Claude API Key: ${process.env.ANTHROPIC_API_KEY ? '✓ Set' : '✗ Missing'}`);
            console.log(`🔑 OpenAI API Key: ${process.env.OPENAI_API_KEY ? '✓ Set' : '✗ Missing'}`);
            console.log(`🔑 Daytona API Key: ${process.env.DAYTONA_API_KEY ? '✓ Set' : '✗ Missing'}`);
            console.log();
        });
    }
    catch (error) {
        console.error('❌ Failed to start server:', error);
        process.exit(1);
    }
}
// Start the server
startServer();
//# sourceMappingURL=server.js.map