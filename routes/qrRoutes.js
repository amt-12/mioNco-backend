const express = require('express');
const { 
    generateQRCode, 
    bulkGenerateQRCodes, 
    getQRCodes, 
    updateQRStatus, 
    logScan, 
    getQRDashboardKPIs 
} = require('../controllers/qrController');
const { protect } = require('../middlewares/authMiddleware');
const { authorize } = require('../middlewares/rbacMiddleware');

const router = express.Router();

// Public endpoint
router.post('/scan/:qrId', logScan);

// Protected endpoints
router.use(protect);

router.get('/dashboard/kpis', authorize('Super Admin', 'super_admin', 'admin'), getQRDashboardKPIs);

router
    .route('/')
    .get(authorize('Super Admin', 'super_admin', 'admin', 'Restaurant Manager'), getQRCodes)
    .post(authorize('Super Admin', 'super_admin', 'admin'), generateQRCode);

router.post('/bulk', authorize('Super Admin', 'super_admin', 'admin'), bulkGenerateQRCodes);

router.put('/:id/status', authorize('Super Admin', 'super_admin', 'admin'), updateQRStatus);

module.exports = router;
