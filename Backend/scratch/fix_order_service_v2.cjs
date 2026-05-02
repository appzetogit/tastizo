const fs = require('fs');
const path = 'c:/Users/Shailendra Rajpoot/Desktop/company-projects/New folder/tastizo/Backend/src/modules/food/orders/services/order.service.js';
let content = fs.readFileSync(path, 'utf8');

// Declare them once at the top of the function
const startOfFunction = "export async function createOrder(userId, dto) {";
const insertionPoint = content.indexOf(startOfFunction) + startOfFunction.length;

content = content.substring(0, insertionPoint) + "\n  let restaurantCoords, deliveryCoords;" + content.substring(insertionPoint);

// Remove 'const ' from all occurrences of these variables
content = content.replace(/const restaurantCoords = /g, "restaurantCoords = ");
content = content.replace(/const deliveryCoords = /g, "deliveryCoords = ");

fs.writeFileSync(path, content);
console.log('Fixed order.service.js with let hoisting');
