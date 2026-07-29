const EmployeeProfile = require('../models/EmployeeProfile');
const User = require('../models/User');

// @desc    Get HR Dashboard Analytics
// @route   GET /api/v1/hr/dashboard
// @access  Private
exports.getDashboardAnalytics = async (req, res) => {
    try {
        const totalEmployees = await EmployeeProfile.countDocuments();
        const activeEmployees = await EmployeeProfile.countDocuments({ onboardingStatus: 'Active' });
        const pendingOnboarding = await EmployeeProfile.countDocuments({ 
            onboardingStatus: { $in: ['Draft', 'Pending Documents', 'Pending Verification', 'Pending Approval'] } 
        });

        // Basic department breakdown
        const deptBreakdown = await EmployeeProfile.aggregate([
            { $group: { _id: '$employmentDetails.department', count: { $sum: 1 } } }
        ]);

        res.status(200).json({
            success: true,
            data: {
                totalEmployees,
                activeEmployees,
                pendingOnboarding,
                deptBreakdown
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Get all employees
// @route   GET /api/v1/hr/employees
// @access  Private
exports.getEmployees = async (req, res) => {
    try {
        const employees = await EmployeeProfile.find().sort({ createdAt: -1 });
        res.status(200).json({ success: true, data: employees });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Get single employee
// @route   GET /api/v1/hr/employees/:id
// @access  Private
exports.getEmployee = async (req, res) => {
    try {
        const employee = await EmployeeProfile.findById(req.params.id)
            .populate('employmentDetails.reportingManager', 'name email')
            .populate('userAccount', 'email status');
            
        if (!employee) return res.status(404).json({ success: false, message: 'Employee not found' });
        res.status(200).json({ success: true, data: employee });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Create draft employee (Step 1 of Wizard)
// @route   POST /api/v1/hr/employees
// @access  Private
exports.createEmployee = async (req, res) => {
    try {
        // Generate pseudo employee ID if not provided
        if (!req.body.employeeId) {
            const count = await EmployeeProfile.countDocuments();
            req.body.employeeId = `MIO-EMP-${(count + 1).toString().padStart(3, '0')}`;
        }
        
        const employee = await EmployeeProfile.create(req.body);
        res.status(201).json({ success: true, data: employee });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Update employee profile (Subsequent Wizard steps)
// @route   PUT /api/v1/hr/employees/:id
// @access  Private
exports.updateEmployee = async (req, res) => {
    try {
        const employee = await EmployeeProfile.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
        if (!employee) return res.status(404).json({ success: false, message: 'Employee not found' });
        res.status(200).json({ success: true, data: employee });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Verify Employee Document
// @route   PUT /api/v1/hr/employees/:id/documents/verify
// @access  Private
exports.verifyDocument = async (req, res) => {
    try {
        const { docId, status, remarks } = req.body;
        const employee = await EmployeeProfile.findOneAndUpdate(
            { _id: req.params.id, "documents._id": docId },
            { 
                $set: { 
                    "documents.$.status": status,
                    "documents.$.remarks": remarks
                }
            },
            { new: true }
        );
        res.status(200).json({ success: true, data: employee });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Activate Employee Account (Generates User)
// @route   POST /api/v1/hr/employees/:id/activate
// @access  Private
exports.activateEmployee = async (req, res) => {
    try {
        const employee = await EmployeeProfile.findById(req.params.id);
        if (!employee) return res.status(404).json({ success: false, message: 'Employee not found' });

        if (employee.userAccount) {
            return res.status(400).json({ success: false, message: 'Employee is already activated with a user account' });
        }

        // 1. Create the User account using staff Phone Number as initial password
        const staffPassword = employee.phoneNumber ? employee.phoneNumber.toString().trim() : 'MioPassword123!';
        
        // Ensure role exists in userSchema
        let role = employee.employmentDetails?.designation || 'Reception Staff';
        
        const newUser = await User.create({
            name: `${employee.firstName} ${employee.lastName}`,
            email: employee.email,
            password: staffPassword,
            role: role,
            phoneNumber: employee.phoneNumber,
            status: 'Active'
        });

        // 2. Link back to EmployeeProfile and update status
        employee.userAccount = newUser._id;
        employee.onboardingStatus = 'Active';
        await employee.save();

        // Optional: Trigger welcome notification here if integrated

        res.status(200).json({ 
            success: true, 
            message: 'Employee activated successfully. User account generated.',
            data: employee 
        });

    } catch (error) {
        console.error('Activation Error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Delete employee profile and linked user account
// @route   DELETE /api/v1/hr/employees/:id
// @access  Private (Super Admin / Admin / HR Manager)
exports.deleteEmployee = async (req, res) => {
    try {
        const employee = await EmployeeProfile.findById(req.params.id);
        if (!employee) return res.status(404).json({ success: false, message: 'Employee not found' });

        if (employee.userAccount) {
            await User.findByIdAndDelete(employee.userAccount);
        }

        await EmployeeProfile.findByIdAndDelete(req.params.id);

        res.status(200).json({ success: true, message: 'Employee deleted successfully' });
    } catch (error) {
        console.error('Delete Employee Error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};
