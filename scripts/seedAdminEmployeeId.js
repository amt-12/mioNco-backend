const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const User = require('../models/User');
const EmployeeProfile = require('../models/EmployeeProfile');

const seedAdminId = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('MongoDB Connected for Admin ID Seeding');

    // 1. Find the admin user
    let admin = await User.findOne({
      $or: [
        { role: 'Admin' },
        { email: 'admin@gmail.com' },
        { email: 'admin@mioandco.co' }
      ]
    });

    if (!admin) {
      // If no admin user found, find any admin/first user or create one
      admin = await User.findOne({});
    }

    if (!admin) {
      console.log('No user found in database. Creating default Admin user...');
      admin = await User.create({
        name: 'System Admin',
        email: 'admin@mioandco.co',
        employeeId: 'MIO-ADMIN-001',
        password: 'AdminPassword123!',
        role: 'Admin',
        status: 'Active',
        phoneNumber: '+919999999999'
      });
    } else {
      admin.employeeId = 'MIO-ADMIN-001';
      admin.status = 'Active';
      await admin.save({ validateBeforeSave: false });
      console.log(`Updated Admin user (${admin.email || admin.name}) with employeeId: MIO-ADMIN-001`);
    }

    // 2. Sync / Upsert EmployeeProfile for Admin
    let profile = await EmployeeProfile.findOne({ employeeId: 'MIO-ADMIN-001' });
    if (!profile) {
      profile = await EmployeeProfile.findOne({ userAccount: admin._id });
    }

    if (profile) {
      profile.employeeId = 'MIO-ADMIN-001';
      profile.userAccount = admin._id;
      profile.onboardingStatus = 'Active';
      await profile.save();
      console.log('Updated existing EmployeeProfile with employeeId: MIO-ADMIN-001');
    } else {
      profile = await EmployeeProfile.create({
        employeeId: 'MIO-ADMIN-001',
        firstName: 'System',
        lastName: 'Admin',
        email: admin.email || 'admin@mioandco.co',
        phoneNumber: admin.phoneNumber || '+919999999999',
        userAccount: admin._id,
        onboardingStatus: 'Active',
        employmentDetails: {
          department: 'Management',
          designation: 'Restaurant Manager'
        }
      });
      console.log('Created new EmployeeProfile for Admin with employeeId: MIO-ADMIN-001');
    }

    console.log(' Admin Employee ID MIO-ADMIN-001 seeded successfully!');
    process.exit(0);
  } catch (error) {
    console.error('Seeding error:', error);
    process.exit(1);
  }
};

seedAdminId();
