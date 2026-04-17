import os
import glob
import re

search_dir = 'c:/Users/Shailendra Rajpoot/Desktop/company-projects/New folder/tastizo/frontend/src/module/user'

def patch_file(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    original = content
    # Replace inline onError fallbacks to unsplash
    target1 = 'e.target.src = "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=800&h=600&fit=crop"'
    replacement1 = "e.target.style.display = 'none'; e.target.nextSibling.style.display = 'flex';"
    content = content.replace(target1, replacement1)

    target2 = '(restaurant.profileImage?.url || restaurant.image || "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=800&h=600&fit=crop")'
    replacement2 = '(restaurant.profileImage?.url || restaurant.image || null)'
    content = content.replace(target2, replacement2)

    # Add ImageOff logic 
    img_tag_regex = re.compile(
        r'<img([^>]+)src=\{restaurantImage\}([^>]+)onError=\{\(e\) => \{\s*e\.target\.style\.display = \'none\'; e\.target\.nextSibling\.style\.display = \'flex\';\s*\}\}([^>]*)/>',
        re.DOTALL
    )
    
    replacement_img = r'''{restaurantImage && !restaurantImage.includes('unsplash') ? (
                          <img\1src={restaurantImage}\2onError={(e) => {
                             e.target.style.display = 'none';
                             e.target.nextSibling.style.display = 'flex';
                          }}\3/>
                        ) : null}
                        <div className={`w-full h-full bg-gray-100 dark:bg-gray-800 flex-col items-center justify-center text-gray-400 dark:text-gray-500 ${!restaurantImage || restaurantImage.includes('unsplash') ? 'flex' : 'hidden'}`}>
                           <ImageOff className="w-8 h-8 mb-2 opacity-50" />
                           <span className="text-xs font-medium">No image</span>
                        </div>'''

    if 'e.target.style.display' in content:
        content = img_tag_regex.sub(replacement_img, content)

    # ensure ImageOff is imported
    if 'ImageOff' in content and 'import ' in content and 'lucide-react' in content:
        if 'ImageOff' not in content[:content.find('lucide-react')]:
            content = content.replace(' } from "lucide-react"', ', ImageOff } from "lucide-react"')
            
    if original != content:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(content)
        print('Patched', filepath)
        
for root, _, files in os.walk(search_dir):
    for fn in files:
        if fn.endswith('.jsx'):
            patch_file(os.path.join(root, fn))
