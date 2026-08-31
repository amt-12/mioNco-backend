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
                employeeId: user.employeeId || null,
                role: user.role,
                phoneNumber: user.phoneNumber,
                profileImage: user.profileImage,
            }
        });
};

// @desc    Login user (via Employee ID or Email)
// @route   POST /api/v1/auth/login
// @access  Public
exports.login = async (req, res, next) => {
    try {
        const { email, employeeId, identifier, username, password } = req.body;
        const loginInput = (identifier || employeeId || email || username || '').trim();

        // Validate identifier
        if (!loginInput) {
            return res.status(400).json({ success: false, message: 'Please provide your Employee ID to sign in.' });
        }

        // Escape regex special chars for safe lookup
        const escaped = loginInput.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
        const loginRegex = new RegExp(`^${escaped}$`, 'i');

        // 1. Check for user by employeeId OR email directly
        let user = await User.findOne({
            $or: [
                { employeeId: loginRegex },
                { email: loginRegex }
            ]
        }).select('+password');

        // 2. If not found in User, check EmployeeProfile and link userAccount if available
        if (!user) {
            const EmployeeProfile = require('../models/EmployeeProfile');
            const emp = await EmployeeProfile.findOne({ employeeId: loginRegex });
            if (emp && emp.userAccount) {
                user = await User.findById(emp.userAccount).select('+password');
                if (user && !user.employeeId) {
                    user.employeeId = emp.employeeId;
                    await user.save({ validateBeforeSave: false });
                }
            } else if (emp && !emp.userAccount) {
                // If profile exists but userAccount not activated yet, auto-provision active user account
                const cleanId = emp.employeeId.toLowerCase().replace(/[^a-z0-9]/g, '');
                const staffEmail = emp.email || `${cleanId}@staff.mioandco.co`;
                const fullName = [emp.firstName, emp.lastName].filter(Boolean).join(' ').trim() || emp.firstName;
                
                user = await User.create({
                    name: fullName,
                    email: staffEmail,
                    employeeId: emp.employeeId,
                    password: emp.phoneNumber?.toString().trim() || 'MioPassword123!',
                    role: emp.employmentDetails?.designation || 'Waiter',
                    phoneNumber: emp.phoneNumber,
                    status: 'Active'
                });

                emp.userAccount = user._id;
                emp.onboardingStatus = 'Active';
                await emp.save();
            }
        }

        if (!user) {
            return res.status(401).json({ success: false, message: `No active staff member found with Employee ID "${loginInput}".` });
        }

        if (user.status !== 'Active') {
            return res.status(403).json({ success: false, message: 'Your account is disabled or pending activation.' });
        }

        // If password is provided, verify it; otherwise allow single-field Employee ID login
        if (password && password.trim()) {
            const isMatch = await user.matchPassword(password.trim());
            if (!isMatch) {
                return res.status(401).json({ success: false, message: 'Invalid password.' });
            }
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
        const EmployeeProfile = require('../models/EmployeeProfile');
        const emp = await EmployeeProfile.findOne({ userAccount: req.user.id });

        res.status(200).json({
            success: true,
            data: {
                id: user._id,
                name: user.name,
                email: user.email,
                employeeId: user.employeeId || emp?.employeeId || null,
                role: user.role,
                phoneNumber: user.phoneNumber,
                profileImage: user.profileImage,
                status: user.status,
                employeeProfile: emp ? {
                    _id: emp._id,
                    employeeId: emp.employeeId,
                    department: emp.employmentDetails?.department,
                    designation: emp.employmentDetails?.designation,
                    onboardingStatus: emp.onboardingStatus
                } : null
            },
        });
    } catch (error) {
        next(error);
    }
};

// @desc    Update current logged in user's profile (including changing Employee ID)
// @route   PUT /api/v1/auth/profile
// @access  Private
exports.updateMyProfile = async (req, res, next) => {
    try {
        const { name, phoneNumber, employeeId } = req.body;
        const user = await User.findById(req.user.id);
        if (!user) return res.status(404).json({ success: false, message: 'User not found' });

        const EmployeeProfile = require('../models/EmployeeProfile');
        const emp = await EmployeeProfile.findOne({ userAccount: req.user.id });

        if (employeeId && employeeId.trim() !== (user.employeeId || '')) {
            const formattedId = employeeId.trim();
            // Check uniqueness in User collection
            const existingUser = await User.findOne({ employeeId: formattedId, _id: { $ne: user._id } });
            if (existingUser) {
                return res.status(400).json({ success: false, message: `Employee ID "${formattedId}" is already in use by another user.` });
            }

            // Check uniqueness in EmployeeProfile collection
            const existingEmp = await EmployeeProfile.findOne({ employeeId: formattedId, ...(emp ? { _id: { $ne: emp._id } } : {}) });
            if (existingEmp) {
                return res.status(400).json({ success: false, message: `Employee ID "${formattedId}" is already in use by another staff profile.` });
            }

            user.employeeId = formattedId;
            if (emp) {
                emp.employeeId = formattedId;
                await emp.save();
            }
        }

        if (name) {
            user.name = name.trim();
            if (emp) {
                const parts = name.trim().split(' ');
                emp.firstName = parts[0] || emp.firstName;
                emp.lastName = parts.slice(1).join(' ') || emp.lastName;
                await emp.save();
            }
        }

        if (phoneNumber) {
            user.phoneNumber = phoneNumber.trim();
            if (emp) {
                emp.phoneNumber = phoneNumber.trim();
                await emp.save();
            }
        }

        await user.save({ validateBeforeSave: false });

        res.status(200).json({
            success: true,
            message: 'Profile updated successfully',
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                employeeId: user.employeeId,
                role: user.role,
                phoneNumber: user.phoneNumber,
                profileImage: user.profileImage,
            }
        });
    } catch (error) {
        next(error);
    }
};

// @desc    Update current logged in user's password
// @route   PUT /api/v1/auth/update-password
// @access  Private
exports.updateMyPassword = async (req, res, next) => {
    try {
        const { currentPassword, newPassword } = req.body;

        if (!currentPassword || !newPassword) {
            return res.status(400).json({ success: false, message: 'Please provide both current and new passwords' });
        }

        if (newPassword.length < 6) {
            return res.status(400).json({ success: false, message: 'New password must be at least 6 characters long' });
        }

        const user = await User.findById(req.user.id).select('+password');
        if (!user) return res.status(404).json({ success: false, message: 'User not found' });

        const isMatch = await user.matchPassword(currentPassword);
        if (!isMatch) {
            return res.status(400).json({ success: false, message: 'Current password is incorrect' });
        }

        user.password = newPassword;
        await user.save();

        res.status(200).json({
            success: true,
            message: 'Password updated successfully'
        });
    } catch (error) {
        next(error);
    }
};
