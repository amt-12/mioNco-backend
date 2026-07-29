const jwt = require('jsonwebtoken');
const User = require('../models/User');

// Protect routes
exports.protect = async (req, res, next) => {
    let token;

    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
        // Set token from Bearer token in header
        token = req.headers.authorization.split(' ')[1];
    } else if (req.cookies && req.cookies.token) {
        // Set token from cookie
        token = req.cookies.token;
    }

    // Make sure token exists
    if (!token) {
        return res.status(401).json({ success: false, message: 'Not authorized to access this route' });
    }

    try {
        // Verify token
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        req.user = await User.findById(decoded.id);
        
        if (!req.user) {
             return res.status(401).json({ success: false, message: 'User not found' });
        }

        if (req.user.status !== 'Active') {
            return res.status(403).json({ success: false, message: 'User account is not active' });
        }

        next();
    } catch (err) {
        return res.status(401).json({ success: false, message: 'Not authorized to access this route' });
    }
};
