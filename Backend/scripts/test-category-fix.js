import mongoose from 'mongoose';
import { config } from 'dotenv';
config();

async function testCategoryFix() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/tastizo');
    console.log('🔌 Connected to MongoDB');
    
    // Import models
    const categoryModule = await import('../src/modules/food/admin/models/category.model.js');
    const FoodCategory = categoryModule.default || categoryModule.FoodCategory;
    
    // Test 1: Check if admin categories exist
    console.log('\n=== 📋 TESTING ADMIN CATEGORIES ===');
    const allCategories = await FoodCategory.find({}).lean();
    console.log(`📊 Total categories in database: ${allCategories.length}`);
    
    const adminCategories = allCategories.filter(cat => cat.restaurantId || cat.createdByRestaurantId);
    const globalCategories = allCategories.filter(cat => !cat.restaurantId && !cat.createdByRestaurantId);
    
    console.log(`📊 Admin-created categories: ${adminCategories.length}`);
    console.log(`📊 Global categories: ${globalCategories.length}`);
    
    adminCategories.forEach(cat => {
      console.log(`  🏪 ${cat.name}: isActive=${cat.isActive}, isApproved=${cat.isApproved}, restaurantId=${!!cat.restaurantId}`);
    });
    
    globalCategories.forEach(cat => {
      console.log(`  🌍 ${cat.name}: isActive=${cat.isActive}, isApproved=${cat.isApproved}, restaurantId=${!!cat.restaurantId}`);
    });
    
    // Test 2: Check what the new API would return
    console.log('\n=== 🔍 TESTING NEW USER API ===');
    const userCategoryQuery = {
      isActive: true,
      isApproved: true,
      restaurantId: { $exists: false },
      createdByRestaurantId: { $exists: false }
    };
    
    const userCategories = await FoodCategory.find(userCategoryQuery)
      .sort({ sortOrder: 1, name: 1 })
      .select('name image type foodTypeScope sortOrder')
      .lean();
    
    console.log(`📊 Categories returned by new user API: ${userCategories.length}`);
    
    userCategories.forEach(cat => {
      console.log(`  ✅ ${cat.name}: type=${cat.type}, foodTypeScope=${cat.foodTypeScope}`);
    });
    
    // Test 3: Check for potential issues
    console.log('\n=== 🚨 CHECKING FOR ISSUES ===');
    
    if (userCategories.length === 0 && globalCategories.length > 0) {
      console.log('❌ ISSUE: User API returns 0 categories but global categories exist!');
      console.log('   This means the filter logic is wrong');
    }
    
    if (userCategories.length > 0) {
      console.log('✅ SUCCESS: User API is returning categories');
    } else {
      console.log('❌ ISSUE: User API is not returning any categories');
    }
    
    await mongoose.disconnect();
    console.log('\n✅ Test complete');
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

testCategoryFix();
