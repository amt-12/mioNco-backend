const express = require('express');
const {
  getInventoryItems,
  getInventoryItemById,
  createInventoryItem,
  updateInventoryItem,
  recordTransaction,
  getInventoryTransactions,
  getInventoryReport,
  deleteInventoryItem,
  assignStockToFloor,
  getFloorAssignments,
  returnFloorStock,
  recordStationConsumption
} = require('../controllers/inventoryController');
const { protect } = require('../middlewares/authMiddleware');
const { authorize } = require('../middlewares/rbacMiddleware');

const router = express.Router();

router.use(protect);

router.get('/report', authorize('Super Admin', 'super_admin', 'admin', 'Restaurant Manager', 'Inventory Manager', 'Chef'), getInventoryReport);
router.get('/transactions', authorize('Super Admin', 'super_admin', 'admin', 'Restaurant Manager', 'Inventory Manager', 'Chef'), getInventoryTransactions);
router.post('/transaction', authorize('Super Admin', 'super_admin', 'admin', 'Restaurant Manager', 'Inventory Manager', 'Chef'), recordTransaction);

router.post('/assign-floor', authorize('Super Admin', 'super_admin', 'admin', 'Restaurant Manager', 'Inventory Manager', 'Chef'), assignStockToFloor);
router.get('/floor-assignments', authorize('Super Admin', 'super_admin', 'admin', 'Restaurant Manager', 'Inventory Manager', 'Chef'), getFloorAssignments);
router.post('/floor-assignments/:id/consume', authorize('Super Admin', 'super_admin', 'admin', 'Restaurant Manager', 'Inventory Manager', 'Chef'), recordStationConsumption);
router.delete('/floor-assignments/:id', authorize('Super Admin', 'super_admin', 'admin', 'Restaurant Manager'), returnFloorStock);

router.route('/')
  .get(authorize('Super Admin', 'super_admin', 'admin', 'Restaurant Manager', 'Inventory Manager', 'Chef'), getInventoryItems)
  .post(authorize('Super Admin', 'super_admin', 'admin', 'Restaurant Manager', 'Inventory Manager'), createInventoryItem);

router.route('/:id')
  .get(authorize('Super Admin', 'super_admin', 'admin', 'Restaurant Manager', 'Inventory Manager', 'Chef'), getInventoryItemById)
  .put(authorize('Super Admin', 'super_admin', 'admin', 'Restaurant Manager', 'Inventory Manager'), updateInventoryItem)
  .delete(authorize('Super Admin', 'super_admin', 'admin', 'Restaurant Manager'), deleteInventoryItem);

module.exports = router;
