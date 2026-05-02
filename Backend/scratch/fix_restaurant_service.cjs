const fs = require('fs');
const path = 'c:/Users/Shailendra Rajpoot/Desktop/company-projects/New folder/tastizo/Backend/src/modules/food/restaurant/services/restaurant.service.js';
let content = fs.readFileSync(path, 'utf8');

// Fix registerRestaurant (line 378 area)
content = content.replace(
    /if \(closingMinutes < openingMinutes\) \{\s+throw new ValidationError\('Closing time cannot be less than opening time'\);\s+const estimatedDeliveryTimeText/m,
    "if (closingMinutes < openingMinutes) {\n            throw new ValidationError('Closing time cannot be less than opening time');\n        }\n    }\n    const estimatedDeliveryTimeText"
);

// Fix updateRestaurantById (line 930 area)
content = content.replace(
    /if \(openingMinutes === closingMinutes\) \{\s+throw new ValidationError\('Opening time and closing time cannot be same'\);\s+\}\s+\}\s+\}\s+if \(body\.menuImages/m,
    "if (openingMinutes === closingMinutes) {\n            throw new ValidationError('Opening time and closing time cannot be same');\n        }\n        if (closingMinutes < openingMinutes) {\n            throw new ValidationError('Closing time cannot be less than opening time');\n        }\n    }\n\n    if (body.menuImages"
);

fs.writeFileSync(path, content);
console.log('Fixed restaurant.service.js');
