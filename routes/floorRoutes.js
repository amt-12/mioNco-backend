const express = require('express');
const { getFloors, createFloor, updateFloor, deleteFloor, getFloorFootfallAnalytics } = require('../controllers/floorController');
const { protect } = require('../middlewares/authMiddleware');
const { authorize } = require('../middlewares/rbacMiddleware');

// Include other resource routers
const tableRouter = require('./tableRoutes');

const router = express.Router();

// Re-route into other resource routers
router.use('/:floorId/tables', tableRouter);

// Public route for website reservations & floor selection
router.get('/public', getFloors);

router.use(protect);

router.get('/footfall', getFloorFootfallAnalytics);

router
  .route('/')
  .get(getFloors)
  .post(authorize('Super Admin', 'Restaurant Manager'), createFloor);

router
  .route('/:id')
  .put(authorize('Super Admin', 'Restaurant Manager'), updateFloor)
  .delete(authorize('Super Admin'), deleteFloor);

module.exports = router;
