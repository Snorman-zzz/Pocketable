const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const PORT = process.env.PORT || 8080;

// MIME type mapping
const mimeTypes = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'text/javascript',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon'
};

// Create HTTP server
const server = http.createServer((req, res) => {
    const parsedUrl = url.parse(req.url);
    let pathname = parsedUrl.pathname;

    // Default to index.html
    if (pathname === '/') {
        pathname = '/index.html';
    }

    const filePath = path.join(__dirname, pathname);
    const ext = path.extname(filePath);
    const contentType = mimeTypes[ext] || 'text/plain';

    // Check if file exists
    fs.access(filePath, fs.constants.F_OK, (err) => {
        if (err) {
            // File not found
            res.writeHead(404, { 'Content-Type': 'text/html' });
            res.end(`
                <!DOCTYPE html>
                <html>
                <head>
                    <title>404 - Not Found</title>
                    <style>
                        body {
                            font-family: Arial, sans-serif;
                            text-align: center;
                            padding: 50px;
                            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                            color: white;
                            margin: 0;
                            min-height: 100vh;
                            display: flex;
                            align-items: center;
                            justify-content: center;
                            flex-direction: column;
                        }
                        h1 { font-size: 4rem; margin: 0; }
                        p { font-size: 1.2rem; margin: 20px 0; }
                        a { color: #fff; text-decoration: underline; }
                    </style>
                </head>
                <body>
                    <h1>404</h1>
                    <p>Page not found</p>
                    <p><a href="/">Go back to Todo List</a></p>
                </body>
                </html>
            `);
            return;
        }

        // Read and serve the file
        fs.readFile(filePath, (err, data) => {
            if (err) {
                res.writeHead(500, { 'Content-Type': 'text/plain' });
                res.end('Internal Server Error');
                return;
            }

            res.writeHead(200, {
                'Content-Type': contentType,
                'Cache-Control': 'no-cache'
            });
            res.end(data);
        });
    });
});

// Start server
server.listen(PORT, () => {
    console.log(`✅ Static file server running at http://localhost:${PORT}`);
    console.log(`📝 Todo List app available at http://localhost:${PORT}`);
    console.log(`Press Ctrl+C to stop the server`);
});

// Handle server errors
server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
        console.error(`❌ Port ${PORT} is already in use. Try a different port:`);
        console.error(`   PORT=8081 node server.js`);
    } else {
        console.error('❌ Server error:', err.message);
    }
    process.exit(1);
});

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\n👋 Shutting down server...');
    server.close(() => {
        console.log('✅ Server closed successfully');
        process.exit(0);
    });
});