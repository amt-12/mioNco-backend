const express = require('express');
const { getSettings, updateSettings, getPublicSettings } = require('../controllers/settingsController');
const { protect } = require('../middlewares/authMiddleware');
const { authorize } = require('../middlewares/rbacMiddleware');

const router = express.Router();

// Public: Air Menu can read payment settings (UPI id, name etc) without auth
router.get('/public', getPublicSettings);

router.use(protect);
router.use(authorize('Super Admin', 'Restaurant Manager'));

router
  .route('/')
  .get(getSettings)
  .put(updateSettings);

module.exports = router;
