/**
 * SEO Structured Data (JSON-LD) Generators for Tastizo
 */

const BASE_URL = 'https://www.tastizo.com';

/**
 * Organization Schema (Global fallback)
 */
export const getOrganizationSchema = () => ({
  '@context': 'https://schema.org',
  '@type': 'Organization',
  'name': 'Tastizo',
  'url': BASE_URL,
  'logo': `${BASE_URL}/logo.png`,
  'sameAs': [
    'https://www.facebook.com/tastizo',
    'https://twitter.com/tastizo',
    'https://www.instagram.com/tastizo'
  ]
});

/**
 * WebSite Schema with SearchAction (Homepage)
 */
export const getWebSiteSchema = () => ({
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  'name': 'Tastizo',
  'url': BASE_URL,
  'potentialAction': {
    '@type': 'SearchAction',
    'target': `${BASE_URL}/search?q={search_term_string}`,
    'query-input': 'required name=search_term_string'
  }
});

/**
 * DeliveryService Schema (/delivery)
 */
export const getDeliveryServiceSchema = () => ({
  '@context': 'https://schema.org',
  '@type': 'DeliveryService',
  'name': 'Tastizo Food Delivery',
  'image': `${BASE_URL}/tastizo_og_image.png`,
  'description': 'Deliver food and earn with Tastizo. Join as a rider, enjoy flexible hours, weekly payouts, and great incentives.',
  'provider': {
    '@type': 'Organization',
    'name': 'Tastizo',
    'url': BASE_URL
  },
  'areaServed': {
    '@type': 'Country',
    'name': 'India'
  },
  'serviceType': 'Food Delivery Service'
});

/**
 * Service Schema for Restaurant Partners (/restaurant/welcome)
 */
export const getRestaurantPartnerSchema = () => ({
  '@context': 'https://schema.org',
  '@type': 'Service',
  'name': 'Tastizo Restaurant Partner Program',
  'description': 'Partner with Tastizo to grow your restaurant business. List your menu, accept online orders, track earnings, and reach more customers.',
  'provider': {
    '@type': 'Organization',
    'name': 'Tastizo',
    'url': BASE_URL
  },
  'serviceType': 'Restaurant Ordering & Delivery Platform'
});

/**
 * FAQ Schema for Delivery Partners
 */
export const getDeliveryFAQSchema = () => ({
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  'mainEntity': [
    {
      '@type': 'Question',
      'name': 'How do I sign up as a Tastizo delivery partner?',
      'acceptedAnswer': {
        '@type': 'Answer',
        'text': 'To register as a delivery partner, go to the Tastizo delivery partner page, enter your phone number, submit the OTP, and fill in your details and document verification (Aadhaar, Driving License, PAN card, bank details).'
      }
    },
    {
      '@type': 'Question',
      'name': 'What documents are required for Tastizo delivery partner registration?',
      'acceptedAnswer': {
        '@type': 'Answer',
        'text': 'You will need a valid Aadhaar Card, Driving License, PAN Card, and a bank account/passbook to receive payments.'
      }
    },
    {
      '@type': 'Question',
      'name': 'How often are delivery partners paid?',
      'acceptedAnswer': {
        '@type': 'Answer',
        'text': 'Tastizo offers weekly payouts, directly credited to your registered bank account.'
      }
    }
  ]
});

/**
 * FAQ Schema for Restaurant Partners
 */
export const getRestaurantFAQSchema = () => ({
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  'mainEntity': [
    {
      '@type': 'Question',
      'name': 'How do I register my restaurant on Tastizo?',
      'acceptedAnswer': {
        '@type': 'Answer',
        'text': 'Simply visit the Tastizo Restaurant Partner welcome page, click signup, enter your restaurant details, upload your FSSAI license, restaurant menu, and bank details. Our team will review and activate your listing within 24 hours.'
      }
    },
    {
      '@type': 'Question',
      'name': 'What are the benefits of partnering with Tastizo?',
      'acceptedAnswer': {
        '@type': 'Answer',
        'text': 'Tastizo partners get access to thousands of local food lovers, a robust order management dashboard, analytics reports, marketing toolkits, and reliable delivery rider networks to grow their business.'
      }
    },
    {
      '@type': 'Question',
      'name': 'What documents are needed for restaurant onboarding?',
      'acceptedAnswer': {
        '@type': 'Answer',
        'text': 'You will need a valid FSSAI license, PAN card, GST details (if applicable), bank account details for payouts, and your restaurant menu with pricing.'
      }
    }
  ]
});

/**
 * BreadcrumbList Schema for navigation paths
 * @param {Array<{name: string, item: string}>} steps list of breadcrumb steps
 */
export const getBreadcrumbSchema = (steps) => ({
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  'itemListElement': steps.map((step, index) => ({
    '@type': 'ListItem',
    'position': index + 1,
    'name': step.name,
    'item': step.item.startsWith('http') ? step.item : `${BASE_URL}${step.item}`
  }))
});
