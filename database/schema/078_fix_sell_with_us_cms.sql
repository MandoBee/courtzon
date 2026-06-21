-- Fix Sell With Us CTA link and How It Works step number styling
USE courtzon_v2;

UPDATE cms_section_blocks
SET content = JSON_SET(content, '$.buttonLink', '/register/seller')
WHERE block_key = 'sell_cta';

UPDATE cms_section_blocks
SET content = JSON_SET(
  content,
  '$.html',
  '<div class="cz-landing-steps"><div><div class="cz-landing-step-num">1</div><h4 class="font-bold text-lg mb-2">Create Your Account</h4><p>Sign up as a seller and complete your profile with business details and payment info.</p></div><div><div class="cz-landing-step-num">2</div><h4 class="font-bold text-lg mb-2">List Your Products</h4><p>Add products with photos, descriptions, and pricing. Manage your catalog easily.</p></div><div><div class="cz-landing-step-num">3</div><h4 class="font-bold text-lg mb-2">Start Selling</h4><p>Your products go live. Receive orders, ship products, and get paid directly.</p></div></div>'
)
WHERE block_key = 'sell_how';
