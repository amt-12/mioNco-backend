const express = require('express');
const { 
    getDashboardAnalytics,
    getEmployees,
    getEmployee,
    createEmployee,
    updateEmployee,
    deleteEmployee,
    verifyDocument,
    activateEmployee
} = require('../controllers/hrController');
const { protect } = require('../middlewares/authMiddleware');
const { authorize } = require('../middlewares/rbacMiddleware');

const router = express.Router();

router.use(protect); // All HR routes are protected

router.get('/dashboard', authorize('Super Admin', 'super_admin', 'admin', 'HR Manager', 'Restaurant Manager'), getDashboardAnalytics);
router.get('/employees', authorize('Super Admin', 'super_admin', 'admin', 'HR Manager', 'Restaurant Manager'), getEmployees);
router.post('/employees', authorize('Super Admin', 'super_admin', 'admin', 'HR Manager'), createEmployee);
router.get('/employees/:id', authorize('Super Admin', 'super_admin', 'admin', 'HR Manager', 'Restaurant Manager'), getEmployee);
router.put('/employees/:id', authorize('Super Admin', 'super_admin', 'admin', 'HR Manager'), updateEmployee);
router.delete('/employees/:id', authorize('Super Admin', 'super_admin', 'admin', 'HR Manager'), deleteEmployee);

router.put('/employees/:id/documents/verify', authorize('Super Admin', 'super_admin', 'admin', 'HR Manager'), verifyDocument);
router.post('/employees/:id/activate', authorize('Super Admin', 'super_admin', 'admin', 'HR Manager', 'Restaurant Manager'), activateEmployee);

module.exports = router;
