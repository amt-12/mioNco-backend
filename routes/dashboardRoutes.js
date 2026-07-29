const express = require('express');
const { 
    getDashboardKPIs, 
    getRevenueAnalytics, 
    getFloorAnalytics, 
    getRecentActivities 
} = require('../controllers/dashboardController');
const { protect } = require('../middlewares/authMiddleware');
const { authorize } = require('../middlewares/rbacMiddleware');

const router = express.Router();

// All dashboard routes are protected
router.use(protect);

router.get('/kpis', getDashboardKPIs);
router.get('/revenue', getRevenueAnalytics);
router.get('/floors', getFloorAnalytics);
router.get('/activities', getRecentActivities);

module.exports = router;
