/**
 * Handler for API Route Not Found (404)
 */
const notFound = (req, res, next) => {
    res.status(404).json({
        success: false,
        message: `API route not found: ${req.method} ${req.originalUrl}`
    });
};

module.exports = notFound;
