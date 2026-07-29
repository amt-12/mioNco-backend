const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const MenuSection = require('../models/MenuSection');
const MenuCategory = require('../models/MenuCategory');
const MenuItem = require('../models/MenuItem');

mongoose.connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log('MongoDB Connected for Seeding'))
  .catch(err => console.error(err));

const seedData = async () => {
  try {
    await MenuItem.deleteMany();
    await MenuCategory.deleteMany();
    await MenuSection.deleteMany();

    const sec1 = await MenuSection.create({ name: 'From The Fire', description: 'Wood-fired specialties', displayOrder: 1 });
    const sec2 = await MenuSection.create({ name: 'Sweet Finishes', description: 'Artisan desserts', displayOrder: 2 });
    const sec3 = await MenuSection.create({ name: 'Mio Originals', description: 'Our legacy dishes', displayOrder: 3 });

    const cat1 = await MenuCategory.create({ name: 'Steaks', slug: 'steaks', section: sec1._id, displayOrder: 1 });
    const cat2 = await MenuCategory.create({ name: 'Cakes', slug: 'cakes', section: sec2._id, displayOrder: 1 });
    const cat3 = await MenuCategory.create({ name: 'Signature Mains', slug: 'signature-mains', section: sec3._id, displayOrder: 1 });

    await MenuItem.create([
      {
        foodName: 'Wagyu Ribeye',
        sku: 'SKU-001',
        category: cat1._id,
        section: sec1._id,
        shortDescription: 'Premium A5 Wagyu',
        basePrice: 150,
        status: 'Available',
        publishState: 'Published',
        badges: ['Signature Dish', 'Best Seller']
      },
      {
        foodName: 'Truffle Filet Mignon',
        sku: 'SKU-002',
        category: cat1._id,
        section: sec1._id,
        shortDescription: 'Filet with truffle butter',
        basePrice: 95,
        status: 'Available',
        publishState: 'Published',
        badges: ['Chef Recommendation']
      },
      {
        foodName: 'Pistachio Basque Cheesecake',
        sku: 'SKU-003',
        category: cat2._id,
        section: sec2._id,
        shortDescription: 'Creamy pistachio center',
        basePrice: 18,
        status: 'Available',
        publishState: 'Published',
        badges: ['Most Popular']
      },
      {
        foodName: 'Draft Chocolate Lava',
        sku: 'SKU-004',
        category: cat2._id,
        section: sec2._id,
        shortDescription: 'Warm lava cake',
        basePrice: 15,
        status: 'Unavailable',
        publishState: 'Draft'
      },
      {
        foodName: 'Butter Chicken',
        sku: 'SKU-005',
        category: cat3._id,
        section: sec3._id,
        shortDescription: 'Classic creamy tomato curry',
        basePrice: 35,
        status: 'Available',
        publishState: 'Published',
        badges: ['Today Special', 'Best Seller']
      }
    ]);

    console.log('Seed successful');
    process.exit();
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
};
seedData();
