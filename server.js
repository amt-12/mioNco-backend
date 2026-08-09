require('dotenv').config();
const express = require('express');
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
app.use(cors({
  origin: [
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'http://localhost:8080',
    'http://127.0.0.1:8080',
    'https://admin.mioandco.co',
    'https://amt-12-mio-nexus-orchestra.mioco.workers.dev'

  ],
  credentials: true,
}));
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ limit: '100mb', extended: true }));
app.use(cookieParser());
app.use(morgan('dev'));
const path = require('path');
app.use(express.static(path.join(__dirname, 'public')));

// Route files
const apiRoutes = require('./routes/api');
const notFoundHandler = require('./routes/api/notFound');
const errorHandler = require('./middlewares/errorMiddleware');

// Mount API routes
app.use('/api', apiRoutes);

// Catch-all for unhandled non-API routes (Route Not Found)
app.use('*', notFoundHandler);

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
      'http://127.0.0.1:5173',
      'http://localhost:8080',
      'http://127.0.0.1:8080',
      'https://admin.mioandco.co',
      'https://amt-12-mio-nexus-orchestra.mioco.workers.dev'
    ],
    credentials: true
  }
});

// Make io accessible to our router
app.set('io', io);

io.on('connection', (socket) => {
    console.log(`Socket connected: ${socket.id}`);
    
    // Join a room for a specific floor to receive scoped updates
    socket.on('join_floor', (floorId) => {
        socket.join(`floor_${floorId}`);
        console.log(`Socket ${socket.id} joined floor_${floorId}`);
    });

    socket.on('leave_floor', (floorId) => {
        socket.leave(`floor_${floorId}`);
    });

    // Table OTP verification handlers between Waiter POS and Air Menu
    socket.on('send_table_otp', (data) => {
        console.log('Sending table OTP to Air Menu:', data);
        io.emit('table_otp_prompt', data);
    });

    socket.on('verify_table_otp', (data) => {
        console.log('Verifying table OTP:', data);
        io.emit('table_otp_verified', data);
    });

    socket.on('disconnect', () => {
        console.log(`Socket disconnected: ${socket.id}`);
    });
});

server.listen(PORT, () => {
    console.log(`Server running in ${process.env.NODE_ENV} mode on port ${PORT}`);
});
