const fs = require('fs');
const path = 'c:/Users/Shailendra Rajpoot/Desktop/company-projects/New folder/tastizo/Backend/src/modules/food/admin/services/admin.service.js';
let content = fs.readFileSync(path, 'utf8');

// Find the start of updateRestaurantLocation
const startStr = "export async function updateRestaurantLocation(id, body = {}) {";
const startIndex = content.indexOf(startStr);

if (startIndex !== -1) {
    // Find where the corruption starts (around line 2642 in the previous view)
    // We want to replace everything from the corruption point until the next proper function or where we can recover.
    
    // The corruption seems to start after 'throw new ValidationError(...);'
    const errorMsg = "throw new ValidationError('Location is outside all active zones. Please select a valid location inside a service zone.');";
    const errorIndex = content.indexOf(errorMsg, startIndex);
    
    if (errorIndex !== -1) {
        const afterErrorIndex = errorIndex + errorMsg.length + 1; // +1 for the closing brace '}' that should be there
        
        // We want to insert the correct ending of updateRestaurantLocation
        const correctEnd = `\n    }\n\n    doc.zoneId = new mongoose.Types.ObjectId(String(resolvedZone._id));\n    preserveRestaurantReviewState(doc, 'admin-location-update');\n    await doc.save();\n\n    return FoodRestaurant.findById(id)\n        .select('-__v')\n        .populate('zoneId', 'name zoneName serviceLocation isActive')\n        .lean();\n}\n`;
        
        // Now find where the corruption ends. It seems to have merged into some category logic.
        // Let's search for the next 'export async function' after the corruption.
        const nextFunctionStr = "export async function ";
        const nextFunctionIndex = content.indexOf(nextFunctionStr, afterErrorIndex + 500); // skip some chars to be sure
        
        if (nextFunctionIndex !== -1) {
             content = content.substring(0, errorIndex + errorMsg.length) + correctEnd + content.substring(nextFunctionIndex);
        }
    }
}

fs.writeFileSync(path, content);
console.log('Fixed corrupted updateRestaurantLocation in admin.service.js');
