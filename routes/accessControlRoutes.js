const express = require('express');
const {
  getModules,
  getMyNavigation,
  getStaffUsers,
  getUserPermissions,
  updateUserPermissions
} = require('../controllers/accessControlController');
const { protect } = require('../middlewares/authMiddleware');

const router = express.Router();

router.use(protect);

router.get('/modules', getModules);
router.get('/my-navigation', getMyNavigation);
router.get('/users', getStaffUsers);
router.get('/users/:userId', getUserPermissions);
router.put('/users/:userId', updateUserPermissions);

module.exports = router;
