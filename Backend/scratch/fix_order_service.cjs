const fs = require('fs');
const path = 'c:/Users/Shailendra Rajpoot/Desktop/company-projects/New folder/tastizo/Backend/src/modules/food/orders/services/order.service.js';
let content = fs.readFileSync(path, 'utf8');

// The createOrder function starts around line 182
// We want to fix the first occurrence of coordinate extraction and remove the second.

// 1. Fix the mess at the top (around line 203)
// My previous edit replaced 'const restaurantCoords...' with '// Using coordinates already extracted.' which was WRONG.
content = content.replace(
    /\/\/ 1\.5\. Strict Distance Limit \(Prevent 781km orders\)\s+\/\/ Using coordinates already extracted\.\s+const deliveryCoords = extractLatLng\(dto\.address\) \|\| extractLatLng\(dto\.address\?\.location\);/,
    "// 1.5. Strict Distance Limit (Prevent 781km orders)\n  const restaurantCoords = extractLatLng(restaurant.location);\n  const deliveryCoords = extractLatLng(dto.address) || extractLatLng(dto.address?.location);"
);

// 2. Remove the redundant declarations further down (around line 298)
// We need to be careful to only replace the second occurrence.
const secondOccurrence = "const restaurantCoords = extractLatLng(restaurant.location);\n  const deliveryCoords = extractLatLng(dto.address) || extractLatLng(dto.address?.location);";
const firstIndex = content.indexOf(secondOccurrence);
if (firstIndex !== -1) {
    const secondIndex = content.indexOf(secondOccurrence, firstIndex + 1);
    if (secondIndex !== -1) {
        content = content.substring(0, secondIndex) + "// Coordinates already extracted at the top" + content.substring(secondIndex + secondOccurrence.length);
    }
}

fs.writeFileSync(path, content);
console.log('Fixed order.service.js');
