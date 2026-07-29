const express = require('express');
const { 
    assignWaiter,
    getActiveWaiters,
    createServiceRequest,
    getTableRequests,
    updateRequestStatus,
    getMyTasks
} = require('../controllers/waiterController');
const { protect } = require('../middlewares/authMiddleware');
const { authorize } = require('../middlewares/rbacMiddleware');

const router = express.Router();

// Public / Semi-public route (for customer AIR menu in the future, currently accessible)
router.post('/requests', createServiceRequest);
router.get('/requests/public', getTableRequests);

// Protected routes
router.use(protect);

router.put('/assign', authorize('Super Admin', 'super_admin', 'admin', 'Restaurant Manager'), assignWaiter);
router.get('/active', authorize('Super Admin', 'super_admin', 'admin', 'Restaurant Manager'), getActiveWaiters);

router.get('/my-tasks', authorize('Super Admin', 'super_admin', 'admin', 'Restaurant Manager', 'Waiter'), getMyTasks);
router.put('/requests/:id/status', authorize('Super Admin', 'super_admin', 'admin', 'Restaurant Manager', 'Waiter'), updateRequestStatus);

module.exports = router;
