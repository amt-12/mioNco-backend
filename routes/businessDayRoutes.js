const express = require('express');
const {
  getActiveBusinessDay,
  startBusinessDay,
  getCurrentDaySummary,
  endBusinessDay,
  getBusinessDayHistory
} = require('../controllers/businessDayController');

const { protect } = require('../middlewares/authMiddleware');
const { authorize } = require('../middlewares/rbacMiddleware');

const router = express.Router();

router.use(protect);

router.get('/active', getActiveBusinessDay);
router.post('/start', authorize('Super Admin', 'super_admin', 'admin', 'Restaurant Manager'), startBusinessDay);
router.get('/current-summary', getCurrentDaySummary);
router.post('/end', authorize('Super Admin', 'super_admin', 'admin', 'Restaurant Manager'), endBusinessDay);
router.get('/history', getBusinessDayHistory);

module.exports = router;
