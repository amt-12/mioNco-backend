const User = require('../models/User');
const { generateToken, generateRefreshToken } = require('../utils/generateToken');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

// Helper to send token response
const sendTokenResponse = (user, statusCode, res) => {
    const accessToken = generateToken(user._id, user.role);
    const refreshToken = generateRefreshToken(user._id);

    // Save refresh token to user
    user.refreshToken = refreshToken;
    user.lastLogin = Date.now();
    user.save({ validateBeforeSave: false });

    const options = {
        expires: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
        httpOnly: true,
    };

    if (process.env.NODE_ENV === 'production') {
        options.secure = true;
    }

    res
        .status(statusCode)
        .cookie('token', accessToken, options)
        .cookie('refreshToken', refreshToken, options)
        .json({
            success: true,
            accessToken,
            refreshToken,
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                role: user.role,
                profileImage: user.profileImage,
            }
        });
};

// @desc    Login user
// @route   POST /api/v1/auth/login
// @access  Public
exports.login = async (req, res, next) => {
    try {
        const { email, password } = req.body;

        // Validate email & password
        if (!email || !password) {
            return res.status(400).json({ success: false, message: 'Please provide an email and password' });
        }

        // Check for user
        const user = await User.findOne({ email }).select('+password');

        if (!user) {
            return res.status(401).json({ success: false, message: 'Invalid credentials' });
        }

        if (user.status !== 'Active') {
            return res.status(403).json({ success: false, message: 'Your account is disabled' });
        }

        // Check if password matches
        const isMatch = await user.matchPassword(password);

        if (!isMatch) {
            return res.status(401).json({ success: false, message: 'Invalid credentials' });
        }

        sendTokenResponse(user, 200, res);
    } catch (error) {
        next(error);
    }
};

// @desc    Logout user / clear cookie
// @route   GET /api/v1/auth/logout
// @access  Private
exports.logout = async (req, res, next) => {
    try {
        if (req.user) {
            req.user.refreshToken = null;
            await req.user.save({ validateBeforeSave: false });
        }

        res.cookie('token', 'none', {
            expires: new Date(Date.now() + 10 * 1000),
            httpOnly: true,
        });
        res.cookie('refreshToken', 'none', {
            expires: new Date(Date.now() + 10 * 1000),
            httpOnly: true,
        });

        res.status(200).json({
            success: true,
            data: {},
        });
    } catch (error) {
        next(error);
    }
};

// @desc    Refresh token
// @route   POST /api/v1/auth/refresh
// @access  Public
exports.refreshToken = async (req, res, next) => {
    try {
        const refreshToken = req.body.refreshToken || req.cookies.refreshToken;

        if (!refreshToken) {
            return res.status(401).json({ success: false, message: 'Refresh token not found' });
        }

        // Verify token
        const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
        
        const user = await User.findById(decoded.id);

        if (!user || user.refreshToken !== refreshToken || user.status !== 'Active') {
            return res.status(401).json({ success: false, message: 'Invalid refresh token' });
        }

        sendTokenResponse(user, 200, res);
    } catch (error) {
        return res.status(401).json({ success: false, message: 'Invalid refresh token' });
    }
};

// @desc    Get current logged in user
// @route   GET /api/v1/auth/me
// @access  Private
exports.getMe = async (req, res, next) => {
    try {
        const user = await User.findById(req.user.id);

        res.status(200).json({
            success: true,
            data: user,
        });
    } catch (error) {
        next(error);
    }
};
