const mongoose = require('mongoose');

const employeeProfileSchema = new mongoose.Schema({
    employeeId: {
        type: String,
        unique: true,
        required: [true, 'Please provide an employee ID']
    },
    firstName: {
        type: String,
        required: [true, 'Please provide first name'],
        trim: true
    },
    lastName: {
        type: String,
        required: [true, 'Please provide last name'],
        trim: true
    },
    email: {
        type: String,
        required: [true, 'Please provide an email'],
        unique: true,
        match: [
            /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/,
            'Please add a valid email'
        ]
    },
    phoneNumber: {
        type: String,
        required: [true, 'Please provide a phone number']
    },
    personalInfo: {
        dob: Date,
        gender: {
            type: String,
            enum: ['Male', 'Female', 'Other', 'Prefer not to say']
        },
        bloodGroup: String,
        maritalStatus: String
    },
    contactInfo: {
        address: String,
        emergencyContacts: [{
            name: String,
            relation: String,
            phone: String
        }]
    },
    employmentDetails: {
        department: String,
        designation: String, // E.g., Waiter, Chef, Manager
        joinDate: Date,
        probationPeriodDays: {
            type: Number,
            default: 90
        },
        salary: Number,
        reportingManager: {
            type: mongoose.Schema.ObjectId,
            ref: 'User'
        }
    },
    onboardingStatus: {
        type: String,
        enum: ['Draft', 'Pending Documents', 'Pending Verification', 'Pending Approval', 'Active', 'Rejected', 'Terminated'],
        default: 'Draft'
    },
    userAccount: {
        type: mongoose.Schema.ObjectId,
        ref: 'User'
    },
    documents: [{
        docType: {
            type: String, // Aadhaar, PAN, Resume
            required: true
        },
        url: String, // Simulated URL for now
        status: {
            type: String,
            enum: ['Pending', 'Verified', 'Rejected'],
            default: 'Pending'
        },
        remarks: String
    }],
    assets: [{
        item: String, // Uniform, POS Tablet, Name Badge
        issueDate: Date,
        returnStatus: {
            type: String,
            enum: ['Issued', 'Returned', 'Lost'],
            default: 'Issued'
        }
    }],
    training: [{
        moduleName: String, // Orientation, Menu Training, Safety
        status: {
            type: String,
            enum: ['Pending', 'In Progress', 'Completed', 'Failed'],
            default: 'Pending'
        },
        completedDate: Date
    }]
}, {
    timestamps: true
});

module.exports = mongoose.model('EmployeeProfile', employeeProfileSchema);
