const express = require('express');
const {
  generateBill,
  getBills,
  getBillById,
  splitBill,
  mergeBills,
  applyDiscount,
  applyComplimentary,
  applyNonChargeable,
  toggleTaxAndServiceCharge,
  modifyBill,
  cancelBill,
  voidBill,
  reprintBill,
  recordPayment,
  getBillingAnalytics,
  getDailySalesReport
} = require('../controllers/billingController');
const { protect } = require('../middlewares/authMiddleware');
const { authorize } = require('../middlewares/rbacMiddleware');

const router = express.Router();

router.use(protect);

router.get('/daily-sales-report', authorize('Super Admin', 'super_admin', 'admin', 'Restaurant Manager', 'Waiter'), getDailySalesReport);
router.post('/generate', authorize('Super Admin', 'super_admin', 'admin', 'Restaurant Manager', 'Waiter', 'Receptionist'), generateBill);
router.get('/', authorize('Super Admin', 'super_admin', 'admin', 'Restaurant Manager', 'Waiter', 'Receptionist'), getBills);
router.get('/analytics/summary', authorize('Super Admin', 'super_admin', 'admin', 'Restaurant Manager', 'Waiter'), getBillingAnalytics);
router.get('/:id', authorize('Super Admin', 'super_admin', 'admin', 'Restaurant Manager', 'Waiter', 'Receptionist'), getBillById);

router.post('/:id/split', authorize('Super Admin', 'super_admin', 'admin', 'Restaurant Manager', 'Waiter'), splitBill);
router.post('/merge', authorize('Super Admin', 'super_admin', 'admin', 'Restaurant Manager', 'Waiter'), mergeBills);

router.put('/:id/discount', authorize('Super Admin', 'super_admin', 'admin', 'Restaurant Manager', 'Waiter'), applyDiscount);
router.put('/:id/complimentary', authorize('Super Admin', 'super_admin', 'admin', 'Restaurant Manager', 'Waiter'), applyComplimentary);
router.put('/:id/non-chargeable', authorize('Super Admin', 'super_admin', 'admin', 'Restaurant Manager', 'Waiter'), applyNonChargeable);
router.put('/:id/toggle-charges', authorize('Super Admin', 'super_admin', 'admin', 'Restaurant Manager', 'Waiter'), toggleTaxAndServiceCharge);

router.put('/:id/modify', authorize('Super Admin', 'super_admin', 'admin', 'Restaurant Manager', 'Waiter'), modifyBill);
router.post('/:id/cancel', authorize('Super Admin', 'super_admin', 'admin', 'Restaurant Manager', 'Waiter'), cancelBill);
router.post('/:id/void', authorize('Super Admin', 'super_admin', 'admin', 'Restaurant Manager', 'Waiter'), voidBill);
router.post('/:id/reprint', authorize('Super Admin', 'super_admin', 'admin', 'Restaurant Manager', 'Waiter', 'Receptionist'), reprintBill);
router.post('/:id/payment', authorize('Super Admin', 'super_admin', 'admin', 'Restaurant Manager', 'Waiter', 'Receptionist'), recordPayment);

module.exports = router;
