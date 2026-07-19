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
const LogManager = require('./api/logManager');
const mongoose = require('mongoose');

let httpServer;

const app = express();
const PORT = 4000; // Enforced port 3000 for AI Studio environment

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const cors = require('cors');

const isProduction = process.env.NODE_ENV === 'production';
let allowedOrigins = [];

if (process.env.CORS_ALLOWED_ORIGINS) {
  allowedOrigins = process.env.CORS_ALLOWED_ORIGINS
    .split(',')
    .map(origin => origin.trim())
    .filter(Boolean);
}

if (allowedOrigins.length === 0) {
  if (isProduction) {
    console.error('FATAL: CORS_ALLOWED_ORIGINS is required in production environment.');
    process.exit(1);
  } else {
    console.warn('WARNING: CORS_ALLOWED_ORIGINS is not set. Defaulting to allow localhost in development.');
    allowedOrigins = ['http://localhost:5173', 'http://localhost:3000', 'http://localhost:4000'];
  }
}

// CORS Middleware to support configured web panels, mobile apps, and bot servers
app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps, curl, or backend bots)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.includes(origin) || allowedOrigins.includes('*')) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Origin', 'X-Requested-With', 'Content-Type', 'Accept', 'Authorization']
}));

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

app.get('/edit', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'edit.html'));
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
    httpServer = app.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
      console.log('Available endpoints:');
      console.log(`- GET  /              - Main page`);
      console.log(`- GET  /create        - Create server page`);
      console.log(`- GET  /edit          - Edit server page (Mini App)`);
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

let isShuttingDown = false;

async function gracefulShutdown(signal, code = 0) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log(`\\nReceived ${signal}. Shutting down gracefully...`);

  // Force shutdown after 10 seconds if graceful cleanup hangs
  setTimeout(() => {
    console.error('Shutdown timeout reached. Forcing exit.');
    process.exit(code || 1);
  }, 10000).unref();

  try {
    if (httpServer) {
      await new Promise((resolve) => httpServer.close(resolve));
      console.log('HTTP server closed.');
    }

    // Flush and close all open bot log WriteStreams before exiting
    // so in-flight log lines are not lost and file descriptors are released.
    await LogManager.closeAll();

    if (mongoose.connection.readyState === 1) {
      await mongoose.connection.close();
      console.log('MongoDB connection closed.');
    }
    
    console.log('Graceful shutdown complete.');
    process.exit(code);
  } catch (err) {
    console.error('Error during graceful shutdown:', err);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGTERM', () => gracefulShutdown('SIGTERM', 0));
process.on('SIGINT', () => gracefulShutdown('SIGINT', 0));

process.on('uncaughtException', (err) => {
  console.error('FATAL: Uncaught Exception:', err);
  gracefulShutdown('uncaughtException', 1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('FATAL: Unhandled Rejection at:', promise, 'reason:', reason);
  gracefulShutdown('unhandledRejection', 1);
});

// Start the application
startServer();