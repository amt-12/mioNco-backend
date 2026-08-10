const express = require('express');
const router = express.Router();

// Import route modules
const authRoutes = require('../authRoutes');
const dashboardRoutes = require('../dashboardRoutes');
const settingsRoutes = require('../settingsRoutes');
const floorRoutes = require('../floorRoutes');
const tableRoutes = require('../tableRoutes');
const menuRoutes = require('../menuRoutes');
const qrRoutes = require('../qrRoutes');
const reservationRoutes = require('../reservationRoutes');
const orderRoutes = require('../orderRoutes');
const waiterRoutes = require('../waiterRoutes');
const crmRoutes = require('../crmRoutes');
const notificationRoutes = require('../notificationRoutes');
const hrRoutes = require('../hrRoutes');
const feedbackRoutes = require('../feedbackRoutes');
const uploadRoutes = require('../uploadRoutes');
const accessControlRoutes = require('../accessControlRoutes');
const billingRoutes = require('../billingRoutes');
const inventoryRoutes = require('../inventoryRoutes');
const notFoundHandler = require('./notFound');

// Mount v1 API routes
router.use('/v1/auth', authRoutes);
router.use('/v1/dashboard', dashboardRoutes);
router.use('/v1/users', authRoutes);
router.use('/v1/settings', settingsRoutes);
router.use('/v1/floors', floorRoutes);
router.use('/v1/tables', tableRoutes);
router.use('/v1/qr', qrRoutes);
router.use('/v1/menu', menuRoutes);
router.use('/v1/reservations', reservationRoutes);
router.use('/v1/orders', orderRoutes);
router.use('/v1/billing', billingRoutes);
router.use('/v1/inventory', inventoryRoutes);
router.use('/v1/waiters', waiterRoutes);
router.use('/v1/crm', crmRoutes);
router.use('/v1/notifications', notificationRoutes);
router.use('/v1/hr', hrRoutes);
router.use('/v1/feedback', feedbackRoutes);
router.use('/v1/upload', uploadRoutes);
router.use('/v1/access-control', accessControlRoutes);

// Fallback for unhandled API routes under /api
router.use(notFoundHandler);

module.exports = router;