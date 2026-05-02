const fs = require('fs');
const path = 'c:/Users/Shailendra Rajpoot/Desktop/company-projects/New folder/tastizo/Backend/src/modules/food/restaurant/services/restaurant.service.js';
let content = fs.readFileSync(path, 'utf8');

// Relax zone check in getApprovedRestaurantByIdOrSlug
content = content.replace(
    /if \(!resolvedZone\?._id\) return null;/,
    "// Note: For direct lookups, we don't strictly block if zone resolution fails,\n    // but we will still validate against the resolved zone if it exists."
);

content = content.replace(
    /if \(!restaurantMatchesResolvedZone\(doc, resolvedZone\)\) return null;/,
    "if (resolvedZone?._id && !restaurantMatchesResolvedZone(doc, resolvedZone)) return null;"
);

fs.writeFileSync(path, content);
console.log('Relaxed zone check in restaurant.service.js');
