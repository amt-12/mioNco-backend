const express = require('express');
const { 
    createOrder,
    getOrders,
    updateOrderStatus,
    updateOrderItemStatus,
    getDashboardAnalytics,
    rejectItem,
    recallItem,
    getKitchenAnalytics,
    checkoutOrder,
    removeOrderItem,
    addOrderItem,
    getOnRequestAuditLogs,
    getPopularItemsByFloor
} = require('../controllers/orderController');
const { protect } = require('../middlewares/authMiddleware');
const { authorize } = require('../middlewares/rbacMiddleware');

const router = express.Router();

// Allow public order creation from digital menu
router.post('/public', createOrder);
// Allow public order fetching for digital menu tracking
router.get('/public', getOrders);
// Allow checkout
router.post('/public/checkout', checkoutOrder);

router.use(protect);

router.get('/popular-by-floor', authorize('Super Admin', 'super_admin', 'admin', 'Restaurant Manager', 'Waiter', 'Kitchen Staff'), getPopularItemsByFloor);
router.get('/on-request-audit', authorize('Super Admin', 'super_admin', 'admin', 'Restaurant Manager', 'Waiter'), getOnRequestAuditLogs);

router.post('/', authorize('Super Admin', 'super_admin', 'admin', 'Restaurant Manager', 'Waiter', 'Receptionist'), createOrder);

router.get('/', authorize('Super Admin', 'super_admin', 'admin', 'Restaurant Manager', 'Kitchen Staff', 'Waiter', 'Receptionist'), getOrders);

router.get('/analytics/dashboard', authorize('Super Admin', 'super_admin', 'admin', 'Restaurant Manager'), getDashboardAnalytics);
router.get('/analytics/kitchen', authorize('Super Admin', 'super_admin', 'admin', 'Restaurant Manager', 'Kitchen Staff'), getKitchenAnalytics);

router.put('/:id/status', authorize('Super Admin', 'super_admin', 'admin', 'Restaurant Manager', 'Kitchen Staff', 'Waiter'), updateOrderStatus);

router.post('/:orderId/items', authorize('Super Admin', 'super_admin', 'admin', 'Restaurant Manager', 'Waiter'), addOrderItem);
router.delete('/:orderId/items/:itemId', authorize('Super Admin', 'super_admin', 'admin', 'Restaurant Manager', 'Waiter'), removeOrderItem);
router.put('/:orderId/items/:itemId/status', authorize('Super Admin', 'super_admin', 'admin', 'Restaurant Manager', 'Kitchen Staff', 'Waiter'), updateOrderItemStatus);
router.put('/:orderId/items/:itemId/reject', authorize('Super Admin', 'super_admin', 'admin', 'Restaurant Manager', 'Kitchen Staff', 'Waiter'), rejectItem);
router.put('/:orderId/items/:itemId/recall', authorize('Super Admin', 'super_admin', 'admin', 'Restaurant Manager', 'Kitchen Staff', 'Waiter'), recallItem);

module.exports = router;
