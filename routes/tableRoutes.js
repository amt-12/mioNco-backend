const express = require('express');
const { 
  getTables, createTable, updateTable, deleteTable, 
  updateTableStatus, updateTablePosition, getTableKPIs,
  verifyTable, occupyTablePublic, freeTablePublic, verifyReservedTablePhone
} = require('../controllers/tableController');
const { protect } = require('../middlewares/authMiddleware');
const { authorize } = require('../middlewares/rbacMiddleware');

const router = express.Router({ mergeParams: true }); // Important to access floorId from parent router

// Public endpoint for QR code scans
router.get('/:id/verify', verifyTable);

// Public endpoint for digital menu to list tables, confirm occupancy and verify reserved phone
router.get('/public', getTables);
router.post('/public/occupy', occupyTablePublic);
router.post('/public/free', freeTablePublic);
router.post('/public/verify-reserved-phone', verifyReservedTablePhone);

router.use(protect);

router.get('/kpis', authorize('Super Admin', 'super_admin', 'admin', 'Restaurant Manager'), getTableKPIs);

router
  .route('/')
  .get(getTables)
  .post(authorize('Super Admin', 'super_admin', 'admin', 'Restaurant Manager'), createTable);

router
  .route('/:id')
  .put(authorize('Super Admin', 'super_admin', 'admin', 'Restaurant Manager'), updateTable)
  .delete(authorize('Super Admin', 'super_admin'), deleteTable);

router.put('/:id/status', updateTableStatus);
router.put('/:id/position', authorize('Super Admin', 'super_admin', 'admin', 'Restaurant Manager'), updateTablePosition);

module.exports = router;
