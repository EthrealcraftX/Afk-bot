require('dotenv').config();

if (!process.env.JWT_SECRET) {
  console.error('JWT_SECRET environment variable is required. Exiting.');
  process.exit(1);
}

const express = require('express');
const path = require('path');
const apiRoutes = require('./api/routes');
const connectDB = require('./api/db');
const { initialize } = require('./api/api');

const app = express();
const PORT = 3000; // Enforced port 3000 for AI Studio environment

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// CORS Middleware to support Mobile Apps, External Websites, or Telegram Bot Servers
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  next();
});

app.use(express.static(path.join(__dirname, 'public')));

// API Routes
app.use('/api', apiRoutes);

// Frontend Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/create', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'create.html'));
});

// Auth Routes
app.get('/auth/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'auth', 'login.html'));
});

app.get('/auth/signup', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'auth', 'signup.html'));
});

// 404 Handler
app.use((req, res) => {
  res.status(404).sendFile(path.join(__dirname, 'public', '404.html'));
});

// Error Handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ 
    success: false, 
    error: 'Internal Server Error' 
  });
});

// Initialize and start server
async function startServer() {
  try {
    // Connect to MongoDB
    await connectDB();

    // Initialize database and directories
    await initialize();

    // Start the server
    app.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
      console.log('Available endpoints:');
      console.log(`- GET  /              - Main page`);
      console.log(`- GET  /create        - Create server page`);
      console.log(`- GET  /auth/login    - Login page`);
      console.log(`- GET  /auth/signup   - Signup page`);
      console.log(`- POST /api/auth/login - Login endpoint`);
      console.log(`- POST /api/auth/signup - Signup endpoint`);
      console.log(`- GET  /api/projects  - List user's servers`);
      console.log(`- POST /api/projects  - Create new server`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGTERM', () => {
  console.log('Shutting down gracefully...');
  process.exit(0);
});

// Start the application
startServer();