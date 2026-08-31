const express = require('express');
const { 
    assignWaiter,
    getActiveWaiters,
    createServiceRequest,
    getTableRequests,
    updateRequestStatus,
    getMyTasks,
    getRequestHistory,
    getWaiterPunchStats
} = require('../controllers/waiterController');
const { protect } = require('../middlewares/authMiddleware');
const { authorize } = require('../middlewares/rbacMiddleware');

const router = express.Router();

// Public / Semi-public route (for customer AIR menu in the future, currently accessible)
router.post('/requests', createServiceRequest);
router.get('/requests/public', getTableRequests);

// Protected routes
router.use(protect);

router.put('/assign', authorize('Super Admin', 'super_admin', 'admin', 'Restaurant Manager', 'Waiter Manager', 'Waiter'), assignWaiter);
router.get('/active', authorize('Super Admin', 'super_admin', 'admin', 'Restaurant Manager', 'Waiter Manager', 'Waiter'), getActiveWaiters);
router.get('/punch-stats', authorize('Super Admin', 'super_admin', 'admin', 'Restaurant Manager', 'Waiter Manager', 'Waiter'), getWaiterPunchStats);

router.get('/my-tasks', authorize('Super Admin', 'super_admin', 'admin', 'Restaurant Manager', 'Waiter'), getMyTasks);
router.get('/requests/history', authorize('Super Admin', 'super_admin', 'admin', 'Restaurant Manager', 'Waiter'), getRequestHistory);
router.put('/requests/:id/status', authorize('Super Admin', 'super_admin', 'admin', 'Restaurant Manager', 'Waiter'), updateRequestStatus);

module.exports = router;
