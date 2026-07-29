const path = require('path');
const fs = require('fs');

// @desc    Upload single file
// @route   POST /api/v1/upload
// @access  Private
exports.uploadFile = async (req, res, next) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, message: 'Please upload a file' });
        }
        
        // Return the relative URL to the uploaded file
        // The file is saved in public/uploads by multer
        const fileUrl = `/uploads/${req.file.filename}`;
        
        res.status(200).json({ 
            success: true, 
            data: {
                url: fileUrl,
                filename: req.file.filename,
                mimetype: req.file.mimetype,
                size: req.file.size
            }
        });
    } catch (error) {
        next(error);
    }
};
