require('dotenv').config();
const express = require('express');
const compression = require('compression');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');
const connectDB = require('./config/db');

// Connect to MongoDB
connectDB();

const app = express();

// Middlewares
app.use(helmet({ crossOriginResourcePolicy: false }));
app.use((req, res, next) => {
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()');
  next();
});
app.use(cors({
  origin: [
    'http://localhost:5173',
    'http://192.168.0.62:5173',
    'http://localhost:8080',
    'http://127.0.0.1:8080',
    'http://localhost:8081',
    'https://admin.mioandco.co',
    
    'https://mioandco.co',
    'https://amt-12-mio-nexus-orchestra.mioco.workers.dev'

  ],
  credentials: true,
}));
app.use(compression({
  threshold: 1024,
  filter: (req, res) => {
    if (req.headers['x-no-compression']) return false;
    return compression.filter(req, res);
  }
}));
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ limit: '100mb', extended: true }));
app.use(cookieParser());
app.use(morgan('dev'));
const path = require('path');
// Cache uploaded media for 30 days with immutable & etag to prevent repeated downloads
app.use('/uploads', express.static(path.join(__dirname, 'public/uploads'), {
  maxAge: '30d',
  etag: true,
  lastModified: true,
  setHeaders: (res) => {
    res.setHeader('Cache-Control', 'public, max-age=2592000, immutable');
  }
}));
// Cache other public assets for 1 day
app.use(express.static(path.join(__dirname, 'public'), {
  maxAge: '1d',
  etag: true,
  lastModified: true,
  setHeaders: (res) => {
    res.setHeader('Cache-Control', 'public, max-age=86400');
  }
}));

// Route files
const apiRoutes = require('./routes/api');
const notFoundHandler = require('./routes/api/notFound');
const errorHandler = require('./middlewares/errorMiddleware');

// Mount API routes
app.use('/api', apiRoutes);

// Catch-all for unhandled non-API routes (Route Not Found)
app.use(notFoundHandler);

// Error Handling Middleware
app.use(errorHandler);

const http = require('http');
const { Server } = require('socket.io');

const PORT = process.env.PORT || 5000;

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: [
      'http://localhost:5173',
      'http://192.168.0.62:5173',
      'http://localhost:8080',
      'http://127.0.0.1:8080',
      'http://localhost:8081',
      'https://admin.mioandco.co',
      'https://mioandco.co',
      'https://amt-12-mio-nexus-orchestra.mioco.workers.dev'
    ],
    credentials: true
  },
  transports: ['websocket', 'polling'],
  pingTimeout: 20000,
  pingInterval: 25000
});

// Make io accessible to our router and global scope
app.set('io', io);
global.io = io;

io.on('connection', (socket) => {
  // Join a room for a specific floor to receive scoped updates
  socket.on('join_floor', (floorId) => {
    socket.join(`floor_${floorId}`);
  });

  socket.on('leave_floor', (floorId) => {
    socket.leave(`floor_${floorId}`);
  });

  // Join a room for a specific table to receive scoped updates
  socket.on('join_table', (tableId) => {
    if (tableId) socket.join(`table_${tableId}`);
  });

  socket.on('leave_table', (tableId) => {
    if (tableId) socket.leave(`table_${tableId}`);
  });

  socket.on('disconnect', () => {});
});

server.listen(PORT, () => {
  console.log(`Server running in ${process.env.NODE_ENV} mode on port ${PORT}`);
});

