const mongoose = require('mongoose');

const VariantSchema = new mongoose.Schema({
  name: String, // Small, Medium, Large, Half, Full
  price: Number,
  sku: String
});

const CustomizationGroupSchema = new mongoose.Schema({
  name: String, // Bread Selection, Spice Level
  minSelection: { type: Number, default: 0 },
  maxSelection: { type: Number, default: 1 },
  options: [{
    name: String,
    price: { type: Number, default: 0 }
  }]
});

const MenuItemSchema = new mongoose.Schema({
  // Basic Info
  foodName: { type: String, required: true },
  displayName: String,
  sku: { type: String, unique: true },
  internalCode: String,
  categories: [{ 
    type: String, 
    enum: [
      '(V) Vegetarian', 
      '(VE) Vegan', 
      '(GF) Gluten Free', 
      '(N) Contains Nuts', 
      '(G) Contains Meat – Chicken / Lamb', 
      '(S) Seafood', 
      '(P) Pork'
    ] 
  }],
  section: { type: mongoose.Schema.Types.ObjectId, ref: 'MenuSection' },
  cuisineType: String,
  dishType: String, // e.g., Appetizer, Main Course, Dessert
  shortDescription: String,
  detailedDescription: String,
  storyBehindDish: String,
  regionOfOrigin: String,
  chefInspiration: String,
  ingredients: [{
    name: { type: String, required: true },
    image: { type: String }
  }],
  preparationMethod: String,
  chefNotes: String,
  kitchenInstructions: String,
  customerNotes: String,
  
  allergens: [String],
  nutrition: {
    calories: Number,
    protein: Number,
    fat: Number,
    carbs: Number,
    sugar: Number,
    sodium: Number
  },
  kitchenStation: {
    type: String,
    enum: ['Tandoor', 'Grill', 'Curry', 'Wok', 'Dessert', 'Beverage', 'General'],
    default: 'General'
  },
  spiceLevel: { type: Number, min: 0, max: 5, default: 0 },
  sweetnessLevel: { type: Number, min: 0, max: 5, default: 0 },
  servingSize: String,
  portionSize: String,
  weight: String,
  prepTimeMins: Number,
  cookingTimeMins: Number,
  servingTemperature: String,
  shelfLife: String,
  
  // Pricing
  basePrice: { type: Number },
  discountedPrice: Number,
  taxInclusive: { type: Boolean, default: false },
  taxType: { type: String, enum: ['Inherit', 'GST', 'VAT', 'Exempt'], default: 'Inherit' },
  taxRate: { type: Number, default: null },
  variants: [VariantSchema],
  customizationGroups: [CustomizationGroupSchema],
  
  // Media
  media: {
    images: [String], // Array of URLs
    videos: [String],
    thumbnail: String
  },
  
  // Availability & Floors
  availableFloors: [{ type: String }],
  status: { 
    type: String, 
    enum: ['Available', 'Unavailable', 'Out of Stock', 'Temporarily Unavailable', 'Seasonal', 'Limited Edition', 'Coming Soon', 'Archived'],
    default: 'Available'
  },
  publishState: {
    type: String,
    enum: ['Draft', 'Pending Review', 'Published', 'Hidden', 'Scheduled', 'Archived', 'Expired'],
    default: 'Draft'
  },
  
  // Marketing & Visibility
  badges: [{
    type: String,
    enum: ['Today Special', 'Chef Recommendation', 'Best Seller', 'Signature Dish', 'New Arrival', 'Most Popular', 'Festival Special', 'Recommended Pairing', 'Hidden Item']
  }],
  recommendedPairings: [{ type: mongoose.Schema.Types.ObjectId, ref: 'MenuItem' }],
  similarDishes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'MenuItem' }],
  
  // SEO
  seo: {
    title: String,
    description: String,
    keywords: [String],
    slug: String
  },
  
  // Auditing
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

module.exports = mongoose.model('MenuItem', MenuItemSchema);
