const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'Please add a name'],
        trim: true,
    },
    email: {
        type: String,
        required: [true, 'Please add an email'],
        unique: true,
        match: [
            /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/,
            'Please add a valid email',
        ],
    },
    password: {
        type: String,
        required: [true, 'Please add a password'],
        minlength: 6,
        select: false, // Don't return password by default
    },
    role: {
        type: String,
        enum: [
            'Super Admin',
            'admin',
            'super_admin',
            'Restaurant Manager',
            'HR Manager',
            'Kitchen Manager',
            'Reservation Manager',
            'Waiter Manager',
            'Content Manager',
            'Reception Staff',
            'Waiter',
            'Chef',
            'Cashier',
            'Housekeeping',
            'Security'
        ],
        required: [true, 'Please specify a role'],
    },
    phoneNumber: {
        type: String,
        trim: true,
    },
    profileImage: {
        type: String,
        default: 'default.jpg',
    },
    status: {
        type: String,
        enum: ['Active', 'Inactive', 'Pending'],
        default: 'Active',
    },
    lastLogin: {
        type: Date,
    },
    refreshToken: {
        type: String,
    },
    createdBy: {
        type: mongoose.Schema.ObjectId,
        ref: 'User',
    },
    updatedBy: {
        type: mongoose.Schema.ObjectId,
        ref: 'User',
    },
    passwordResetToken: String,
    passwordResetExpire: Date,
    permissions: [{
        moduleKey: { type: String, required: true },
        read: { type: Boolean, default: false },
        write: { type: Boolean, default: false },
        delete: { type: Boolean, default: false },
        allAccess: { type: Boolean, default: false }
    }],
}, {
    timestamps: true, // Automatically adds createdAt and updatedAt
});

// Encrypt password using bcrypt
userSchema.pre('save', async function(next) {
    if (!this.isModified('password')) {
        next();
    }
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
});

// Match user entered password to hashed password in database
userSchema.methods.matchPassword = async function(enteredPassword) {
    return await bcrypt.compare(enteredPassword, this.password);
};

module.exports = mongoose.model('User', userSchema);
