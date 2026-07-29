const express = require('express');
const { 
    getDashboardAnalytics,
    getTemplates,
    createTemplate,
    updateTemplate,
    getMyAlerts,
    getHistory,
    sendManualNotification
} = require('../controllers/notificationController');
const { protect } = require('../middlewares/authMiddleware');
const { authorize } = require('../middlewares/rbacMiddleware');

const router = express.Router();

router.use(protect);

router.get('/dashboard', authorize('Super Admin', 'super_admin', 'admin', 'Restaurant Manager'), getDashboardAnalytics);
router.get('/templates', authorize('Super Admin', 'super_admin', 'admin', 'Restaurant Manager'), getTemplates);
router.post('/templates', authorize('Super Admin', 'super_admin', 'admin'), createTemplate);
router.put('/templates/:id', authorize('Super Admin', 'super_admin', 'admin'), updateTemplate);
router.get('/history', authorize('Super Admin', 'super_admin', 'admin', 'Restaurant Manager'), getHistory);
router.post('/send', authorize('Super Admin', 'super_admin', 'admin', 'Restaurant Manager'), sendManualNotification);

// Global Staff Alerts
router.get('/my-alerts', getMyAlerts); // Accessible to all authenticated staff

module.exports = router;
