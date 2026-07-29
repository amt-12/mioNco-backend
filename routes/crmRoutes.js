const express = require('express');
const { 
    getDashboardAnalytics,
    getCustomers,
    getCustomer,
    getCustomerTimeline,
    addCustomerActivity,
    updateCustomerMetadata,
    getLoyaltyTiers,
    createLoyaltyTier
} = require('../controllers/crmController');
const { protect } = require('../middlewares/authMiddleware');
const { authorize } = require('../middlewares/rbacMiddleware');

const router = express.Router();

router.use(protect); // All CRM routes are protected

// Dashboard
router.get('/dashboard', authorize('Super Admin', 'super_admin', 'admin', 'Restaurant Manager'), getDashboardAnalytics);

// Customers
router.get('/customers', authorize('Super Admin', 'super_admin', 'admin', 'Restaurant Manager', 'Waiter'), getCustomers);
router.get('/customers/:id', authorize('Super Admin', 'super_admin', 'admin', 'Restaurant Manager', 'Waiter'), getCustomer);
router.put('/customers/:id/metadata', authorize('Super Admin', 'super_admin', 'admin', 'Restaurant Manager'), updateCustomerMetadata);

// Timeline
router.get('/customers/:id/timeline', authorize('Super Admin', 'super_admin', 'admin', 'Restaurant Manager', 'Waiter'), getCustomerTimeline);
router.post('/customers/:id/activity', authorize('Super Admin', 'super_admin', 'admin', 'Restaurant Manager', 'Waiter'), addCustomerActivity);

// Loyalty
router.get('/loyalty-tiers', authorize('Super Admin', 'super_admin', 'admin', 'Restaurant Manager'), getLoyaltyTiers);
router.post('/loyalty-tiers', authorize('Super Admin', 'super_admin', 'admin'), createLoyaltyTier);

module.exports = router;
