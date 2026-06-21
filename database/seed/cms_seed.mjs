import mysql from 'mysql2/promise';

const conn = await mysql.createConnection({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || 'CourtZon2026',
  database: process.env.DB_NAME || 'courtzon_v2',
});

// Clean existing
await conn.execute('DELETE FROM cms_section_blocks');
await conn.execute('DELETE FROM cms_sections');
await conn.execute('DELETE FROM cms_blogs');
await conn.execute('DELETE FROM cms_pages');

// PAGES
const pages = [
  { slug: 'home', title: 'CourtZon - Book, Play, Compete', isHomepage: 1, metaTitle: 'CourtZon | Sports Court Booking Platform', metaDescription: 'The ultimate platform for court booking, tournaments, and sports community management.' },
  { slug: 'about', title: 'About Us', isHomepage: 0, metaTitle: 'About CourtZon', metaDescription: 'Learn about CourtZon and our mission.' },
  { slug: 'mission', title: 'Mission & Vision', isHomepage: 0, metaTitle: 'Our Mission & Vision', metaDescription: 'CourtZon mission and vision.' },
  { slug: 'team', title: 'Our Team', isHomepage: 0, metaTitle: 'Meet the Team', metaDescription: 'The people behind CourtZon.' },
  { slug: 'contact', title: 'Contact Us', isHomepage: 0, metaTitle: 'Contact CourtZon', metaDescription: 'Get in touch.' },
  { slug: 'faq', title: 'Frequently Asked Questions', isHomepage: 0, metaTitle: 'FAQ | CourtZon', metaDescription: 'Common questions.' },
  { slug: 'privacy', title: 'Privacy Policy', isHomepage: 0, metaTitle: 'Privacy Policy', metaDescription: 'CourtZon privacy policy.' },
  { slug: 'terms', title: 'Terms of Service', isHomepage: 0, metaTitle: 'Terms of Service', metaDescription: 'CourtZon terms.' },
  { slug: 'sell-with-us', title: 'Sell With Us', isHomepage: 0, metaTitle: 'Sell With CourtZon', metaDescription: 'Join as a seller.' },
];

for (const p of pages) {
  await conn.execute(
    'INSERT INTO cms_pages (slug, title, meta_title, meta_description, is_homepage, is_published, published_at) VALUES (?, ?, ?, ?, ?, 1, NOW())',
    [p.slug, p.title, p.metaTitle, p.metaDescription, p.isHomepage]
  );
}
const [rows] = await conn.execute('SELECT id, slug FROM cms_pages');
const map = {};
rows.forEach(r => map[r.slug] = r.id);

function block(page, type, key, title, subtitle, content, sort) {
  return { pageId: map[page], type, key, title: title || null, subtitle: subtitle || null, content: JSON.stringify(content), sort };
}

const blocks = [
  // HOME
  block('home', 'hero', 'hero_main', 'Transform Your Court Experience', 'The all-in-one platform for players and organizations', { heading: 'Transform Your Court Experience', subheading: 'Book courts, join tournaments, build your sports community — all in one place. CourtZon empowers players to find and book the perfect court, and gives organizations the tools to manage facilities, grow revenue, and engage their community.', ctaText: 'Get Started Free', ctaLink: '/register', secondaryCtaText: 'Learn More', secondaryCtaLink: '#features', backgroundImage: '' }, 0),
  block('home', 'features', 'feat_players', 'For Players', 'Everything you need to play your favorite sports', { columns: 3, features: [{ icon: 'booking', title: 'Easy Court Booking', description: 'Find and book tennis, padel, football, basketball courts near you. Real-time availability and instant confirmation.' }, { icon: 'compete', title: 'Tournaments & Leagues', description: 'Join competitive and social tournaments. Create brackets, track scores, and compete with players at your level.' }, { icon: 'coach', title: 'Find Coaches & Academies', description: 'Connect with qualified coaches for private sessions or enroll in academies to improve your game.' }, { icon: 'community', title: 'Build Your Community', description: 'Make friends, join groups, attend events. CourtZon is more than booking — it is your sports social network.' }, { icon: 'marketplace', title: 'Sports Marketplace', description: 'Buy and sell sports equipment, gear, and accessories from trusted sellers.' }, { icon: 'star', title: 'Track Your Progress', description: 'Monitor your match history, rankings, and statistics. Level up your game with insights.' }] }, 1),
  block('home', 'features', 'feat_orgs', 'For Organizations', 'Powerful tools to manage and grow your facility', { columns: 3, features: [{ icon: 'calendar', title: 'Schedule Management', description: 'Manage all your courts and resources with an intuitive calendar. Set pricing, availability, and booking rules.' }, { icon: 'chart', title: 'Revenue & Analytics', description: 'Track revenue, bookings, and utilization. Get real-time reports and business insights.' }, { icon: 'shield', title: 'Access Control', description: 'Control who accesses your facilities. Manage memberships, guest passes, and branch-level permissions.' }, { icon: 'bolt', title: 'Sell Memberships', description: 'Create subscription plans with recurring billing. Offer monthly, quarterly, or annual memberships.' }, { icon: 'community', title: 'Engage Your Players', description: 'Run tournaments, post events, send notifications. Build a loyal community around your facility.' }, { icon: 'star', title: 'Multi-Branch Ready', description: 'Manage multiple branches under one organization with independent pricing and staff.' }] }, 2),
  block('home', 'stats', 'stats_home', 'Trusted across the region', null, { stats: [{ label: 'Courts Listed', value: '500+' }, { label: 'Active Players', value: '10,000+' }, { label: 'Organizations', value: '150+' }, { label: 'Tournaments', value: '1,200+' }] }, 3),
  block('home', 'testimonials', 'test_home', 'What Our Users Say', null, { testimonials: [{ name: 'Ahmed K.', role: 'Tennis Player', quote: 'CourtZon made it so easy to find courts near me. I book in seconds and never miss a game.' }, { name: 'Sarah M.', role: 'Club Owner', quote: 'Since switching to CourtZon, our court utilization went up 40%. The analytics helped us grow faster.' }, { name: 'Omar R.', role: 'Padel Enthusiast', quote: 'I love the community features. Met so many great players through CourtZon events.' }] }, 4),
  block('home', 'blog_preview', 'blog_home', 'Latest from Our Blog', 'Tips, news, and updates from the CourtZon community.', {}, 5),
  block('home', 'cta', 'cta_home', 'Ready to transform your court experience?', 'Join thousands of players and organizations already on CourtZon.', { buttonText: 'Sign Up Free', buttonLink: '/register' }, 6),

  // ABOUT
  block('about', 'hero', 'about_hero', 'About CourtZon', 'Revolutionizing sports court management', { heading: 'About CourtZon', subheading: 'We are on a mission to make sports accessible, organized, and enjoyable for everyone.' }, 0),
  block('about', 'text', 'about_text', 'Our Story', null, { html: '<p>CourtZon was founded with a simple idea: booking a sports court should be as easy as booking a hotel room. We saw players struggling to find available courts, organizations losing revenue to inefficient scheduling, and a fragmented sports community with no central hub.</p><p>Today, CourtZon serves thousands of players and hundreds of organizations. Our platform handles everything from real-time booking and payments to tournament management and community engagement.</p><p>We believe that sports bring people together. Our mission is to remove every barrier between a player and their next game.</p>' }, 1),
  block('about', 'stats', 'about_stats', 'CourtZon by the Numbers', null, { stats: [{ label: 'Years Active', value: '3+' }, { label: 'Cities', value: '25+' }, { label: 'Team Members', value: '30+' }, { label: 'Happy Users', value: '15k+' }] }, 2),

  // MISSION & VISION
  block('mission', 'hero', 'miss_hero', 'Mission & Vision', 'What drives us forward every day', { heading: 'Our Mission & Vision', subheading: 'Building the future of sports, one court at a time.' }, 0),
  block('mission', 'text', 'miss_text', 'Our Mission', 'To make every court accessible, every game bookable, and every player connected.', { html: '<p>CourtZon exists to democratize access to sports facilities. We believe that finding and booking a court should be instant, transparent, and frictionless.</p><h3>Our Vision</h3><p>We envision a world where every sports facility is digitized, every court is discoverable, and every player can find the perfect place to play.</p><h3>Our Values</h3><div class="grid grid-cols-1 md:grid-cols-2 gap-6"><div class="bg-gray-50 p-6 rounded-xl"><h4 class="font-bold text-lg mb-2">Player First</h4><p>Every decision starts with the player experience.</p></div><div class="bg-gray-50 p-6 rounded-xl"><h4 class="font-bold text-lg mb-2">Partner Success</h4><p>When our partners grow, we grow.</p></div><div class="bg-gray-50 p-6 rounded-xl"><h4 class="font-bold text-lg mb-2">Relentless Innovation</h4><p>We never settle. We constantly push boundaries.</p></div><div class="bg-gray-50 p-6 rounded-xl"><h4 class="font-bold text-lg mb-2">Integrity Always</h4><p>Transparency and honesty in every interaction.</p></div></div>' }, 1),

  // TEAM
  block('team', 'hero', 'team_hero', 'Meet Our Team', 'The passionate people behind CourtZon', { heading: 'Our Team', subheading: 'A diverse team united by a love for sports and technology.' }, 0),
  block('team', 'team', 'team_grid', 'Leadership', null, { columns: 3, members: [{ name: 'Mohamed Niazy', role: 'Founder & CEO', bio: 'Visionary leader with 15+ years in sports tech.' }, { name: 'Ahmed Hassan', role: 'CTO', bio: 'Full-stack architect passionate about scalable systems.' }, { name: 'Layla Ibrahim', role: 'Head of Product', bio: 'UX specialist creating intuitive sports experiences.' }, { name: 'Karim Adel', role: 'Head of Operations', bio: 'Operations expert ensuring smooth facility onboarding.' }, { name: 'Nour El-Din', role: 'Head of Marketing', bio: 'Growth strategist connecting players with the platform.' }, { name: 'Mona Salah', role: 'Head of Partnerships', bio: 'Building relationships with sports organizations.' }] }, 1),

  // CONTACT
  block('contact', 'hero', 'cont_hero', 'Contact Us', 'We would love to hear from you', { heading: 'Get in Touch', subheading: 'Have questions, feedback, or want to partner with us? Reach out!' }, 0),
  block('contact', 'contact_form', 'cont_form', 'Send Us a Message', 'Fill out the form and we will get back to you within 24 hours.', {}, 1),

  // FAQ
  block('faq', 'hero', 'faq_hero', 'Frequently Asked Questions', 'Quick answers to common questions', { heading: 'FAQ', subheading: 'Find answers to the most common questions about CourtZon.' }, 0),
  block('faq', 'faq', 'faq_items', 'Common Questions', null, { items: [{ question: 'How do I book a court?', answer: 'Simply browse courts near you, select your preferred sport and time slot, and confirm your booking. You can pay securely online and receive instant confirmation.' }, { question: 'Is CourtZon free for players?', answer: 'Yes! Creating an account and browsing courts is completely free. You only pay for the court bookings you make at rates set by the facility.' }, { question: 'How do I join a tournament?', answer: 'Visit the Tournaments section, browse upcoming events, and click Join on any tournament that matches your skill level.' }, { question: 'Can I cancel a booking?', answer: 'Yes, you can cancel a booking up to the cancellation deadline set by the facility. Check the booking details for the specific policy.' }, { question: 'How do I list my facility on CourtZon?', answer: 'Visit our Sell With Us page or contact our partnerships team. We will guide you through the onboarding process.' }, { question: 'What sports are supported?', answer: 'Tennis, padel, football, basketball, volleyball, squash, badminton, and many more. If your sport needs a court, we support it.' }, { question: 'Is my payment secure?', answer: 'Absolutely. We use industry-standard encryption and never store your full credit card details. All payments are PCI-compliant.' }, { question: 'How do I become a coach?', answer: 'Create your profile, add your qualifications, set your availability and rates. Players will be able to find and book sessions with you.' }, { question: 'Can I sell products on CourtZon?', answer: 'Yes! Visit the Sell With Us section to learn about becoming a seller. List sports equipment, gear, and accessories.' }, { question: 'How do I contact support?', answer: 'You can reach us through the Contact page, email support@courtzon.com, or use the live chat when logged in.' }] }, 1),

  // PRIVACY
  block('privacy', 'hero', 'priv_hero', 'Privacy Policy', null, { heading: 'Privacy Policy', subheading: 'Last updated: January 2026' }, 0),
  block('privacy', 'text', 'priv_text', null, null, { html: '<h3>1. Information We Collect</h3><p>We collect information you provide directly, such as your name, email, phone number, and payment information when you create an account or make a booking. We also collect technical information including device info and usage data.</p><h3>2. How We Use Your Information</h3><p>We use your information to provide and improve our services, process transactions, send notifications, and comply with legal obligations.</p><h3>3. Information Sharing</h3><p>We share your information with facility owners when you book, with payment processors to complete transactions, and as required by law. We do not sell your personal information.</p><h3>4. Data Security</h3><p>We implement appropriate technical and organizational measures to protect your personal information against unauthorized access or disclosure.</p><h3>5. Your Rights</h3><p>You have the right to access, correct, or delete your personal information. Contact privacy@courtzon.com to exercise these rights.</p><h3>6. Cookies</h3><p>We use cookies to improve your experience and analyze usage. You can control cookie settings through your browser.</p><h3>7. Contact</h3><p>For privacy inquiries: privacy@courtzon.com.</p>' }, 1),

  // TERMS
  block('terms', 'hero', 'term_hero', 'Terms of Service', null, { heading: 'Terms of Service', subheading: 'Last updated: January 2026' }, 0),
  block('terms', 'text', 'term_text', null, null, { html: '<h3>1. Acceptance of Terms</h3><p>By using CourtZon, you agree to these Terms of Service. If you do not agree, please do not use our platform.</p><h3>2. Account Registration</h3><p>You must provide accurate information when creating an account. You are responsible for all activities under your account.</p><h3>3. Booking and Payments</h3><p>All bookings are subject to availability and facility cancellation policies. Payments are processed securely through our partners.</p><h3>4. User Conduct</h3><p>You agree not to misuse our platform, violate laws, harass other users, or submit false information.</p><h3>5. Facility Partners</h3><p>Facility partners are independent entities. CourtZon is not responsible for facility quality or disputes.</p><h3>6. Intellectual Property</h3><p>All content and trademarks on CourtZon are owned by or licensed to us. Do not copy or modify without permission.</p><h3>7. Limitation of Liability</h3><p>CourtZon is provided as is. We are not liable for indirect or consequential damages.</p><h3>8. Changes</h3><p>We may update these terms. Continued use constitutes acceptance.</p><h3>9. Contact</h3><p>For questions: legal@courtzon.com.</p>' }, 1),

  // SELL WITH US
  block('sell-with-us', 'hero', 'sell_hero', 'Sell With CourtZon', 'Join our marketplace and reach thousands of sports enthusiasts', { heading: 'Sell With Us', subheading: 'List your products on CourtZon Marketplace and reach thousands of active sports players looking for equipment and gear.' }, 0),
  block('sell-with-us', 'features', 'sell_feat', 'Why Sell on CourtZon?', null, { columns: 3, features: [{ icon: 'chart', title: 'Reach Active Buyers', description: 'Access thousands of sports players actively looking for equipment, gear, and accessories.' }, { icon: 'shield', title: 'Secure Payments', description: 'All transactions processed through our secure payment gateway with seller protection.' }, { icon: 'bolt', title: 'Easy Setup', description: 'Create your seller profile in minutes. List products, manage inventory, and track orders from one dashboard.' }, { icon: 'star', title: 'Low Commission', description: 'Competitive commission rates so you keep more. Transparent fee structure with no hidden costs.' }, { icon: 'community', title: 'Seller Community', description: 'Join a growing community of sports equipment sellers. Share tips and grow together.' }, { icon: 'chart', title: 'Analytics Dashboard', description: 'Track your sales, revenue, and product performance with detailed reports.' }] }, 1),
  block('sell-with-us', 'cta', 'sell_cta', 'Ready to start selling?', 'Join hundreds of sellers already growing their business on CourtZon.', { buttonText: 'Become a Seller', buttonLink: '/register/seller' }, 2),
  block('sell-with-us', 'text', 'sell_how', 'How It Works', 'Get started in three simple steps', { html: '<div class="cz-landing-steps"><div><div class="cz-landing-step-num">1</div><h4 class="font-bold text-lg mb-2">Create Your Account</h4><p>Sign up as a seller and complete your profile with business details and payment info.</p></div><div><div class="cz-landing-step-num">2</div><h4 class="font-bold text-lg mb-2">List Your Products</h4><p>Add products with photos, descriptions, and pricing. Manage your catalog easily.</p></div><div><div class="cz-landing-step-num">3</div><h4 class="font-bold text-lg mb-2">Start Selling</h4><p>Your products go live. Receive orders, ship products, and get paid directly.</p></div></div>' }, 3),
];

// INSERT BLOCKS
for (const b of blocks) {
  await conn.execute(
    'INSERT INTO cms_section_blocks (page_id, block_type, block_key, title, subtitle, content, sort_order, is_active) VALUES (?, ?, ?, ?, ?, ?, ?, 1)',
    [b.pageId, b.type, b.key, b.title, b.subtitle, b.content, b.sort]
  );
}

// BLOG POSTS
const blogs = [
  { slug: 'summer-fitness-2026', title: 'Summer Fitness Guide 2026', excerpt: 'Stay active this summer with our complete fitness guide for tennis, padel, and more.', content: '<p>Summer is here and it is the perfect time to get active! Whether you are a seasoned athlete or just starting, our guide covers everything you need about staying fit through sports this summer.</p><h3>Pick Your Sport</h3><p>Tennis and padel are fantastic full-body workouts that improve cardiovascular health, coordination, and mental focus.</p><h3>Stay Hydrated</h3><p>Always bring water to your sessions. For intense matches, consider sports drinks to replenish electrolytes.</p><h3>Book Smart</h3><p>Use CourtZon to book courts during cooler morning or evening hours. Our real-time availability makes it easy.</p>', coverImage: '', authorId: 1 },
  { slug: 'benefits-of-playing-padel', title: 'Why Padel is the Fastest Growing Sport', excerpt: 'Discover why padel tennis is taking the world by storm and how you can get started.', content: '<p>Padel tennis has exploded in popularity across the Middle East, Europe, and beyond. But what makes this racket sport so addictive?</p><h3>Easy to Learn</h3><p>Unlike tennis, padel has a shorter learning curve. The enclosed court and underhand serve make it accessible to all ages and skill levels.</p><h3>Social Sport</h3><p>Padel is always played in doubles, making it a highly social activity. Perfect for spending time with friends while getting a great workout.</p><h3>Fast-Paced Action</h3><p>The smaller court and wall bounces create exciting, fast-paced rallies that keep every player engaged.</p><p>Ready to try? Browse padel courts near you on CourtZon and book your first game today!</p>', coverImage: '', authorId: 1 },
  { slug: 'tournament-guide-for-beginners', title: 'Your First Tournament: A Beginner Guide', excerpt: 'Everything you need to know before signing up for your first sports tournament.', content: '<p>Signing up for your first tournament can be intimidating. This guide will help you prepare and make the most of your competitive debut.</p><h3>Choose the Right Level</h3><p>Be honest about your skill level. Tournaments are divided into categories for a reason. Starting at the right level ensures competitive, enjoyable matches.</p><h3>Prepare Your Gear</h3><p>Bring extra equipment: spare rackets, grip tape, water, snacks, and a towel. Check the tournament rules for specific requirements.</p><h3>Arrive Early</h3><p>Give yourself at least 30 minutes to warm up, check in, and get familiar with the venue.</p><h3>Enjoy the Experience</h3><p>Win or lose, tournaments are about the experience. Meet new players, learn from your matches, and have fun!</p>', coverImage: '', authorId: 1 },
];

for (const b of blogs) {
  await conn.execute(
    'INSERT INTO cms_blogs (slug, title, excerpt, content, cover_image, author_id, is_published, published_at) VALUES (?, ?, ?, ?, ?, ?, 1, NOW())',
    [b.slug, b.title, b.excerpt, b.content, b.coverImage, b.authorId]
  );
}

console.log(`CMS seeded: ${blocks.length} blocks, ${blogs.length} blogs, ${pages.length} pages`);
await conn.end();
