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
    'https://admin.mioandco.co'
  ],
  credentials: true,
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(morgan('dev'));
const path = require('path');
app.use(express.static(path.join(__dirname, 'public')));

// Route files
const authRoutes = require('./routes/authRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');
const settingsRoutes = require('./routes/settingsRoutes');
const floorRoutes = require('./routes/floorRoutes');
const tableRoutes = require('./routes/tableRoutes');
const menuRoutes = require('./routes/menuRoutes');
const qrRoutes = require('./routes/qrRoutes');
const reservationRoutes = require('./routes/reservationRoutes');
const orderRoutes = require('./routes/orderRoutes');
const waiterRoutes = require('./routes/waiterRoutes');
const crmRoutes = require('./routes/crmRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const hrRoutes = require('./routes/hrRoutes');
const feedbackRoutes = require('./routes/feedbackRoutes');
const uploadRoutes = require('./routes/uploadRoutes');
const accessControlRoutes = require('./routes/accessControlRoutes');
const errorHandler = require('./middlewares/errorMiddleware');

// Mount routes
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/dashboard', dashboardRoutes);
app.use('/api/v1/users', authRoutes);
app.use('/api/v1/settings', settingsRoutes);
app.use('/api/v1/floors', floorRoutes);
app.use('/api/v1/tables', tableRoutes);
app.use('/api/v1/qr', qrRoutes);
app.use('/api/v1/menu', menuRoutes);
app.use('/api/v1/reservations', reservationRoutes);
app.use('/api/v1/orders', orderRoutes);
app.use('/api/v1/waiters', waiterRoutes);
app.use('/api/v1/crm', crmRoutes);
app.use('/api/v1/notifications', notificationRoutes);
app.use('/api/v1/hr', hrRoutes);
app.use('/api/v1/feedback', feedbackRoutes);
app.use('/api/v1/upload', uploadRoutes);
app.use('/api/v1/access-control', accessControlRoutes);

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
      'https://admin.mioandco.co'
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
