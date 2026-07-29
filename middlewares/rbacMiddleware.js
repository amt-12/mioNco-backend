// Grant access to specific roles
exports.authorize = (...roles) => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ success: false, message: 'Not authorized' });
        }

        const userRole = String(req.user.role);

        // Super Admin has access to everything
        if (
            userRole === 'Super Admin' || 
            userRole === 'super_admin' || 
            userRole === 'admin' ||
            userRole === '6a5f16a3e03a39cf7f467eb7' // Role ID fallback
        ) {
            return next();
        }

        if (!roles.includes(userRole)) {
            return res.status(403).json({ 
                success: false, 
                message: `User role ${userRole} is not authorized to access this route` 
            });
        }
        next();
    };
};
