import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { FoodPageContent } from '../modules/food/admin/models/pageContent.model.js';

dotenv.config();

const DEFAULT_TERMS = `
<h2><strong>1. Introduction</strong></h2>
<p>These Terms of Service govern your use of the Tastizo platform. By accessing or using our services, you agree to be bound by these terms.</p>
<h2><strong>2. User Obligations</strong></h2>
<ul>
  <li>Provide accurate information during registration.</li>
  <li>Comply with all applicable laws.</li>
  <li>Do not misuse the platform for illegal activities.</li>
</ul>
<h2><strong>3. Order Processing</strong></h2>
<p>All orders are subject to acceptance by the restaurant partner. Prices, availability, and delivery times may vary.</p>
<h2><strong>4. Intellectual Property</strong></h2>
<p>All content, logos, and trademarks on Tastizo are owned by Tastizo or its licensors.</p>
<h2><strong>5. Limitation of Liability</strong></h2>
<p>Tastizo is not liable for any indirect, incidental, or consequential damages arising from use of the platform.</p>
<h2><strong>6. Governing Law</strong></h2>
<p>These terms are governed by the laws of India, and any disputes shall be resolved in Indian courts.</p>
`;

const DEFAULT_PRIVACY = `
<h2><strong>1. Introduction</strong></h2>
<p>Tastizo ("we", "our", "us") is committed to protecting and respecting your privacy. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our website and mobile application (collectively, the "Platform").</p>
<h2><strong>2. Information We Collect</strong></h2>
<p>We may collect the following types of information:</p>
<ul>
  <li><strong>Personal Information:</strong> Name, email address, phone number, delivery address, date of birth, and gender when you create an account or place an order.</li>
  <li><strong>Payment Information:</strong> Payment method details are processed securely through our payment gateway partners (e.g., Razorpay). We do not store your full card details on our servers.</li>
  <li><strong>Location Data:</strong> Real-time location data to provide accurate delivery services and show nearby restaurants.</li>
  <li><strong>Device Information:</strong> Device type, operating system, unique device identifiers, and mobile network information.</li>
  <li><strong>Usage Data:</strong> Pages visited, features used, search queries, order history, and interaction patterns.</li>
</ul>
<h2><strong>3. How We Use Your Information</strong></h2>
<ul>
  <li>To process and deliver your food orders.</li>
  <li>To communicate order updates, promotions, and customer support.</li>
  <li>To improve our Platform, services, and user experience.</li>
  <li>To detect and prevent fraud and ensure platform security.</li>
  <li>To comply with legal obligations.</li>
</ul>
<h2><strong>4. Information Sharing</strong></h2>
<p>We may share your information with:</p>
<ul>
  <li><strong>Restaurant Partners:</strong> To fulfill your orders.</li>
  <li><strong>Delivery Partners:</strong> To deliver your orders to your specified address.</li>
  <li><strong>Payment Processors:</strong> To process payments securely.</li>
  <li><strong>Service Providers:</strong> Third-party vendors who assist with analytics, notifications, and customer support.</li>
</ul>
<p>We do not sell your personal information to third parties.</p>
<h2><strong>5. Data Security</strong></h2>
<p>We implement industry-standard security measures including encryption, secure servers, and access controls to protect your personal information.</p>
<h2><strong>6. Your Rights</strong></h2>
<p>You have the right to access, correct, or delete your personal data. You may also request data portability or restrict processing. To exercise these rights, contact us at <strong>support@tastizo.com</strong>.</p>
<h2><strong>7. Data Retention</strong></h2>
<p>We retain your data for as long as your account is active or as needed to provide services. You may request deletion of your account and data at any time.</p>
<h2><strong>8. Contact Us</strong></h2>
<p>If you have questions about this Privacy Policy, please contact us at <strong>support@tastizo.com</strong>.</p>
`;

const DEFAULT_REFUND = `
<h2><strong>Refund Policy</strong></h2>
<p>Refunds are provided only for prepaid orders that are cancelled within 60 seconds of placement. After this window, the order is considered finalized and no refund will be issued.</p>
<h2><strong>Eligibility</strong></h2>
<ul>
  <li>Order must be cancelled within 60 seconds.</li>
  <li>Order must not have been accepted by the restaurant.</li>
</ul>
<h2><strong>Process</strong></h2>
<p>Refunds will be processed to the original payment method within 5-7 business days.</p>
<p>If you have any issues, contact support at <strong>support@tastizo.com</strong>.</p>
`;

const DEFAULT_SHIPPING = `
<h2><strong>Shipping Policy</strong></h2>
<p>All food deliveries are performed by our partner delivery personnel. Delivery times are estimates and may vary based on traffic, weather, and restaurant preparation times.</p>
<h2><strong>Charges</strong></h2>
<p>Shipping fees are displayed at checkout and are non-refundable once the order is placed.</p>
<h2><strong>Responsibility</strong></h2>
<p>Tastizo is not responsible for delays caused by external factors. If an order is undeliverable due to an incorrect address, additional charges may apply.</p>
<p>For any concerns, reach out to <strong>support@tastizo.com</strong>.</p>
`;

const DEFAULT_CANCELLATION = `
<h2><strong>1. Order Cancellation Policy</strong></h2>
<p>At Tastizo, we strive to deliver your orders as quickly as possible. Once an order is placed, it is sent immediately to our restaurant partner for preparation. Because of this, the following cancellation rules apply:</p>
<ul>
  <li><strong>Cancellation within 60 seconds:</strong> You may cancel your order within 60 seconds of placing it without any cancellation fee. You will receive a 100% refund for prepaid orders.</li>
  <li><strong>Cancellation after 60 seconds:</strong> Once 60 seconds have passed or the restaurant has accepted and started preparing your order, cancellation is not permitted. If you choose to cancel, a cancellation fee of up to 100% of the order value will be charged to compensate our restaurant and delivery partners.</li>
  <li><strong>Failure to deliver:</strong> If our delivery partner is unable to contact you or deliver the order due to incorrect address or lack of response at the door, the order will be cancelled, and no refund will be issued.</li>
</ul>

<h2><strong>2. Table Booking Cancellation Policy</strong></h2>
<p>If you book a dining table at any of our partner restaurants via Tastizo:</p>
<ul>
  <li><strong>Free Cancellation:</strong> You can cancel your table reservation up to 2 hours before your scheduled booking slot without any charges.</li>
  <li><strong>Late Cancellations & No-Shows:</strong> If you cancel within 2 hours of your slot or fail to arrive within 15 minutes of your scheduled time (no-show), your booking will be cancelled automatically, and any reservation fee paid will be non-refundable.</li>
</ul>

<h2><strong>3. Contact Us</strong></h2>
<p>If you have any questions regarding cancellations, please reach out to our customer support team at <strong>support@tastizo.com</strong> or via the Help Center in the app.</p>
`;

const pages = [
  { key: 'terms_and_conditions', title: 'Terms of Service', content: DEFAULT_TERMS },
  { key: 'privacy_policy', title: 'Privacy Policy', content: DEFAULT_PRIVACY },
  { key: 'refund_policy', title: 'Refund Policy', content: DEFAULT_REFUND },
  { key: 'shipping_policy', title: 'Shipping Policy', content: DEFAULT_SHIPPING },
  { key: 'cancellation_policy', title: 'Cancellation Policy', content: DEFAULT_CANCELLATION },
];

async function seedPages() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    for (const page of pages) {
      const existingPage = await FoodPageContent.findOne({ key: page.key });
      if (!existingPage) {
        await FoodPageContent.create({
          key: page.key,
          title: page.title,
          content: page.content,
          status: 'published',
          metaTitle: page.title,
          metaDescription: page.title
        });
        console.log(\`Created \${page.key}\`);
      } else {
        console.log(\`\${page.key} already exists, skipping.\`);
      }
    }

    console.log('Seeding complete.');
    process.exit(0);
  } catch (error) {
    console.error('Error seeding pages:', error);
    process.exit(1);
  }
}

seedPages();
