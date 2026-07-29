const express = require('express');
const { login, logout, refreshToken, getMe } = require('../controllers/authController');
const { protect } = require('../middlewares/authMiddleware');

const router = express.Router();

router.post('/login', login);
router.post('/refresh', refreshToken);
router.get('/logout', protect, logout);
router.get('/me', protect, getMe);

module.exports = router;
