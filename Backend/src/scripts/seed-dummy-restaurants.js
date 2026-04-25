import dotenv from "dotenv";
import mongoose from "mongoose";
import { connectDB, disconnectDB } from "../config/db.js";
import { FoodRestaurant } from "../modules/food/restaurant/models/restaurant.model.js";
import { FoodItem } from "../modules/food/admin/models/food.model.js";
import { FoodCategory } from "../modules/food/admin/models/category.model.js";

dotenv.config();

const image = (file) => `/food/${file}`;

const categoryImageMap = {
  Biryani: image("chicken_biryani_deluxe.png"),
  Curries: image("fish_curry_kerala.png"),
  Rice: image("chicken_fried_rice.png"),
  Starters: image("chicken_65_crispy.png"),
  Tandoor: image("paneer_tikka_masala.png"),
  Breads: image("masala_kulcha.png"),
  Seafood: image("prawns_biryani_spicy.png"),
  Veg: image("veg_biryani_aromatic.png"),
};

const restaurants = [
  {
    restaurantName: "Tastizo Biryani Junction",
    ownerName: "Arjun Reddy",
    ownerEmail: "arjun.biryanijunction@tastizo.test",
    ownerPhone: "9100001101",
    primaryContactNumber: "9100001101",
    cuisines: ["Biryani", "North Indian", "Mughlai"],
    pureVegRestaurant: false,
    area: "Banjara Hills",
    city: "Hyderabad",
    state: "Telangana",
    pincode: "500034",
    landmark: "Road No. 12",
    addressLine1: "Plot 18, Banjara Hills Main Road",
    openingTime: "10:00 AM",
    closingTime: "11:30 PM",
    openDays: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
    estimatedDeliveryTime: "25-30 mins",
    featuredDish: "Chicken Biryani Deluxe",
    featuredPrice: 249,
    offer: "Flat 20% OFF",
    rating: 4.5,
    totalRatings: 420,
    profileImage: image("chicken_biryani_deluxe.png"),
    coverImages: [image("chicken_biryani_deluxe.png"), image("mutton_biryani_royal.png")],
    menuImages: [image("chicken_biryani_sp_1.png"), image("chicken_biryani_sp_2.png")],
    menu: [
      {
        categoryName: "Biryani",
        name: "Chicken Biryani Deluxe",
        description: "Long-grain basmati layered with spicy chicken and house masala.",
        price: 249,
        image: image("chicken_biryani_deluxe.png"),
        foodType: "Non-Veg",
        preparationTime: "20 mins",
      },
      {
        categoryName: "Biryani",
        name: "Mutton Biryani Royal",
        description: "Slow-cooked mutton dum biryani with aromatic saffron rice.",
        price: 329,
        image: image("mutton_biryani_royal.png"),
        foodType: "Non-Veg",
        preparationTime: "30 mins",
      },
      {
        categoryName: "Biryani",
        name: "Natu Kodi Biryani",
        description: "Spicy country chicken biryani with rustic Andhra flavors.",
        price: 299,
        image: image("natu_kodi_biryani_1.png"),
        foodType: "Non-Veg",
        preparationTime: "28 mins",
      },
      {
        categoryName: "Starters",
        name: "Chicken 65 Crispy",
        description: "Hot and crispy chicken starter tossed in curry leaves.",
        price: 189,
        image: image("chicken_65_crispy.png"),
        foodType: "Non-Veg",
        preparationTime: "15 mins",
      },
    ],
  },
  {
    restaurantName: "Tastizo Coastal Bowl",
    ownerName: "Neha Nair",
    ownerEmail: "neha.coastalbowl@tastizo.test",
    ownerPhone: "9100001102",
    primaryContactNumber: "9100001102",
    cuisines: ["Seafood", "South Indian", "Coastal"],
    pureVegRestaurant: false,
    area: "Madhapur",
    city: "Hyderabad",
    state: "Telangana",
    pincode: "500081",
    landmark: "Near Inorbit Mall",
    addressLine1: "3rd Floor, Food Street, Madhapur",
    openingTime: "11:00 AM",
    closingTime: "11:00 PM",
    openDays: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
    estimatedDeliveryTime: "30-35 mins",
    featuredDish: "Fish Curry Kerala",
    featuredPrice: 289,
    offer: "Buy 1 Get 1 on Rice Bowls",
    rating: 4.3,
    totalRatings: 268,
    profileImage: image("fish_curry_kerala.png"),
    coverImages: [image("fish_curry_kerala.png"), image("prawns_biryani_spicy.png")],
    menuImages: [image("fish_curry_kerala.png"), image("chicken_fried_rice.png")],
    menu: [
      {
        categoryName: "Seafood",
        name: "Fish Curry Kerala",
        description: "Tangy coconut fish curry served with house spices.",
        price: 289,
        image: image("fish_curry_kerala.png"),
        foodType: "Non-Veg",
        preparationTime: "22 mins",
      },
      {
        categoryName: "Seafood",
        name: "Prawns Biryani Spicy",
        description: "Juicy prawns cooked in a fiery masala dum biryani.",
        price: 339,
        image: image("prawns_biryani_spicy.png"),
        foodType: "Non-Veg",
        preparationTime: "28 mins",
      },
      {
        categoryName: "Rice",
        name: "Chicken Fried Rice",
        description: "Wok-tossed fried rice with chicken, vegetables, and sauces.",
        price: 199,
        image: image("chicken_fried_rice.png"),
        foodType: "Non-Veg",
        preparationTime: "16 mins",
      },
      {
        categoryName: "Starters",
        name: "Chicken Snack Chilly",
        description: "Street-style spicy chicken bites with peppers and onions.",
        price: 179,
        image: image("chicken_snack_chilly_1.png"),
        foodType: "Non-Veg",
        preparationTime: "14 mins",
      },
    ],
  },
  {
    restaurantName: "Tastizo Veggie Tandoor",
    ownerName: "Ritika Sharma",
    ownerEmail: "ritika.veggietandoor@tastizo.test",
    ownerPhone: "9100001103",
    primaryContactNumber: "9100001103",
    cuisines: ["Pure Veg", "North Indian", "Tandoor"],
    pureVegRestaurant: true,
    area: "Kukatpally",
    city: "Hyderabad",
    state: "Telangana",
    pincode: "500072",
    landmark: "Near Forum Mall",
    addressLine1: "Unit 7, Green Plaza, Kukatpally",
    openingTime: "10:30 AM",
    closingTime: "10:45 PM",
    openDays: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
    estimatedDeliveryTime: "20-25 mins",
    featuredDish: "Paneer Tikka Masala",
    featuredPrice: 229,
    offer: "15% OFF on all veg combos",
    rating: 4.4,
    totalRatings: 315,
    profileImage: image("paneer_tikka_masala.png"),
    coverImages: [image("paneer_tikka_masala.png"), image("veg_biryani_aromatic.png")],
    menuImages: [image("paneer_tikka_masala.png"), image("masala_kulcha.png")],
    menu: [
      {
        categoryName: "Veg",
        name: "Paneer Tikka Masala",
        description: "Paneer cubes in creamy tomato gravy with tandoor spices.",
        price: 229,
        image: image("paneer_tikka_masala.png"),
        foodType: "Veg",
        preparationTime: "18 mins",
      },
      {
        categoryName: "Veg",
        name: "Veg Biryani Aromatic",
        description: "Fragrant dum biryani with garden vegetables and herbs.",
        price: 189,
        image: image("veg_biryani_aromatic.png"),
        foodType: "Veg",
        preparationTime: "20 mins",
      },
      {
        categoryName: "Starters",
        name: "Mushroom Manchurian",
        description: "Crispy mushrooms tossed in Indo-Chinese sauce.",
        price: 169,
        image: image("mushroom_manchurian.png"),
        foodType: "Veg",
        preparationTime: "15 mins",
      },
      {
        categoryName: "Breads",
        name: "Masala Kulcha",
        description: "Soft tandoori kulcha stuffed with spiced potato masala.",
        price: 79,
        image: image("masala_kulcha.png"),
        foodType: "Veg",
        preparationTime: "10 mins",
      },
    ],
  },
  {
    restaurantName: "Tastizo Spice Route",
    ownerName: "Faizan Ali",
    ownerEmail: "faizan.spiceroute@tastizo.test",
    ownerPhone: "9100001104",
    primaryContactNumber: "9100001104",
    cuisines: ["Andhra", "Chinese", "Biryani"],
    pureVegRestaurant: false,
    area: "Gachibowli",
    city: "Hyderabad",
    state: "Telangana",
    pincode: "500032",
    landmark: "Financial District Road",
    addressLine1: "Skyline Arcade, Gachibowli Junction",
    openingTime: "11:00 AM",
    closingTime: "12:00 AM",
    openDays: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
    estimatedDeliveryTime: "25-30 mins",
    featuredDish: "Rambo Biryani",
    featuredPrice: 279,
    offer: "Free starter above 499",
    rating: 4.2,
    totalRatings: 198,
    profileImage: image("rambo_biryani_1.png"),
    coverImages: [image("rambo_biryani_1.png"), image("kamju_biryani_1.png")],
    menuImages: [image("chicken_snack_chilly_1.png"), image("chicken_biryani_sp_1.png")],
    menu: [
      {
        categoryName: "Biryani",
        name: "Rambo Biryani",
        description: "Loaded party biryani with generous chicken pieces and masala.",
        price: 279,
        image: image("rambo_biryani_1.png"),
        foodType: "Non-Veg",
        preparationTime: "24 mins",
      },
      {
        categoryName: "Biryani",
        name: "Kamju Biryani",
        description: "A spicy signature biryani with bold masala notes.",
        price: 259,
        image: image("kamju_biryani_1.png"),
        foodType: "Non-Veg",
        preparationTime: "24 mins",
      },
      {
        categoryName: "Starters",
        name: "Chicken Snack Chilly",
        description: "Spicy wok-fried chicken snack with chillies and onions.",
        price: 179,
        image: image("chicken_snack_chilly_1.png"),
        foodType: "Non-Veg",
        preparationTime: "14 mins",
      },
      {
        categoryName: "Rice",
        name: "Chicken Fried Rice",
        description: "Comforting wok rice with chicken, egg and sauces.",
        price: 209,
        image: image("chicken_fried_rice.png"),
        foodType: "Non-Veg",
        preparationTime: "15 mins",
      },
    ],
  },
  {
    restaurantName: "Tastizo Wings & Woks",
    ownerName: "Sonal Gupta",
    ownerEmail: "sonal.wingsandwoks@tastizo.test",
    ownerPhone: "9100001105",
    primaryContactNumber: "9100001105",
    cuisines: ["Biryani", "Chinese", "Fast Food"],
    pureVegRestaurant: false,
    area: "Ameerpet",
    city: "Hyderabad",
    state: "Telangana",
    pincode: "500016",
    landmark: "Metro Station Lane",
    addressLine1: "Shop 11, Ameerpet Central",
    openingTime: "10:00 AM",
    closingTime: "11:45 PM",
    openDays: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
    estimatedDeliveryTime: "20-25 mins",
    featuredDish: "Wings Biryani",
    featuredPrice: 239,
    offer: "Up to 25% OFF",
    rating: 4.1,
    totalRatings: 174,
    profileImage: image("wings_biryani_1.png"),
    coverImages: [image("wings_biryani_1.png"), image("chicken_65_crispy.png")],
    menuImages: [image("wings_biryani_1.png"), image("mushroom_manchurian.png")],
    menu: [
      {
        categoryName: "Biryani",
        name: "Wings Biryani",
        description: "Smoky hot wings served over masala biryani rice.",
        price: 239,
        image: image("wings_biryani_1.png"),
        foodType: "Non-Veg",
        preparationTime: "20 mins",
      },
      {
        categoryName: "Starters",
        name: "Chicken 65 Crispy",
        description: "Crunchy fried chicken with classic spicy seasoning.",
        price: 189,
        image: image("chicken_65_crispy.png"),
        foodType: "Non-Veg",
        preparationTime: "15 mins",
      },
      {
        categoryName: "Veg",
        name: "Mushroom Manchurian",
        description: "A saucy Indo-Chinese favorite with crispy mushrooms.",
        price: 169,
        image: image("mushroom_manchurian.png"),
        foodType: "Veg",
        preparationTime: "14 mins",
      },
      {
        categoryName: "Biryani",
        name: "Chicken Biryani Special",
        description: "House-special dum biryani with balanced spice and aroma.",
        price: 229,
        image: image("chicken_biryani_sp_2.png"),
        foodType: "Non-Veg",
        preparationTime: "22 mins",
      },
    ],
  },
];

async function ensureCategory(name) {
  const imageUrl = categoryImageMap[name] || image("chicken_biryani_deluxe.png");
  return FoodCategory.findOneAndUpdate(
    { name, restaurantId: { $exists: false } },
    {
      $set: {
        name,
        image: imageUrl,
        type: "food",
        foodTypeScope: "Both",
        approvalStatus: "approved",
        isApproved: true,
        isActive: true,
      },
    },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );
}

async function upsertRestaurant(seed) {
  const restaurant = await FoodRestaurant.findOneAndUpdate(
    { restaurantName: seed.restaurantName, ownerPhone: seed.ownerPhone },
    {
      $set: {
        restaurantName: seed.restaurantName,
        ownerName: seed.ownerName,
        ownerEmail: seed.ownerEmail,
        ownerPhone: seed.ownerPhone,
        primaryContactNumber: seed.primaryContactNumber,
        pureVegRestaurant: seed.pureVegRestaurant,
        cuisines: seed.cuisines,
        addressLine1: seed.addressLine1,
        area: seed.area,
        city: seed.city,
        state: seed.state,
        pincode: seed.pincode,
        landmark: seed.landmark,
        openingTime: seed.openingTime,
        closingTime: seed.closingTime,
        openDays: seed.openDays,
        profileImage: seed.profileImage,
        coverImages: seed.coverImages,
        menuImages: seed.menuImages,
        estimatedDeliveryTime: seed.estimatedDeliveryTime,
        featuredDish: seed.featuredDish,
        featuredPrice: seed.featuredPrice,
        offer: seed.offer,
        rating: seed.rating,
        totalRatings: seed.totalRatings,
        status: "approved",
        approvedAt: new Date(),
        isAcceptingOrders: true,
        diningSettings: {
          isEnabled: true,
          maxGuests: 6,
          diningType: ["family-dining"],
        },
      },
    },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );

  return restaurant;
}

async function seedFoodsForRestaurant(restaurant, foodSeeds) {
  await FoodItem.deleteMany({ restaurantId: restaurant._id });

  const docs = [];
  for (const item of foodSeeds) {
    const category = await ensureCategory(item.categoryName);
    docs.push({
      restaurantId: restaurant._id,
      categoryId: category?._id,
      categoryName: item.categoryName,
      name: item.name,
      description: item.description,
      price: item.price,
      image: item.image,
      foodType: item.foodType,
      preparationTime: item.preparationTime,
      isAvailable: true,
      approvalStatus: "approved",
      approvedAt: new Date(),
      variants: [],
    });
  }

  if (docs.length) {
    await FoodItem.insertMany(docs);
  }
}

async function run() {
  await connectDB();

  for (const seed of restaurants) {
    const restaurant = await upsertRestaurant(seed);
    await seedFoodsForRestaurant(restaurant, seed.menu);
    console.log(`Seeded restaurant: ${seed.restaurantName}`);
  }

  console.log(`Done. Seeded ${restaurants.length} dummy restaurants with menu items.`);
}

run()
  .catch((error) => {
    console.error("Failed to seed dummy restaurants:", error?.message || error);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (mongoose.connection.readyState !== 0) {
      await disconnectDB();
    }
  });
