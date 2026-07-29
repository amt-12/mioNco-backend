const express = require('express');
const { 
    checkAvailability,
    createReservation,
    getReservations,
    updateReservationStatus,
    updateReservation,
    deleteReservation,
    getDashboardAnalytics
} = require('../controllers/reservationController');
const { protect } = require('../middlewares/authMiddleware');
const { authorize } = require('../middlewares/rbacMiddleware');

const router = express.Router();

// Public / Reception Endpoints
router.post('/availability', checkAvailability);
router.post('/', createReservation);

// Protected Management Endpoints
router.use(protect);

router.get('/analytics/dashboard', authorize('Super Admin', 'super_admin', 'admin', 'Restaurant Manager', 'Receptionist'), getDashboardAnalytics);

router.get('/', authorize('Super Admin', 'super_admin', 'admin', 'Restaurant Manager', 'Receptionist', 'Waiter'), getReservations);

router.put('/:id/status', authorize('Super Admin', 'super_admin', 'admin', 'Restaurant Manager', 'Receptionist'), updateReservationStatus);

router
  .route('/:id')
  .put(authorize('Super Admin', 'super_admin', 'admin', 'Restaurant Manager', 'Receptionist'), updateReservation)
  .delete(authorize('Super Admin', 'super_admin', 'admin', 'Restaurant Manager', 'Receptionist'), deleteReservation);

module.exports = router;
