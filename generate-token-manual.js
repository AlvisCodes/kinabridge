import fetch from 'node-fetch';

const KINABASE_BASE_URL = 'http://localhost:3000/api/v1';
const APP_ID = '354adc8f-a41c-4d8e-b3a5-6c37fe99bbe1';
const APP_SECRET = 'MKtGJ9Z8vI++DbLLmenUUp9qSai+PKl/nD2q2I7GJCz8KwFcXFTh83WBRTT5PJjLBBedu/VHfWYkODS1ebj4gg==';

async function generateToken() {
  try {
    const response = await fetch(`${KINABASE_BASE_URL}/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        appId: APP_ID,
        secret: APP_SECRET,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('❌ Failed to generate token:', error);
      process.exit(1);
    }

    const data = await response.json();
    const token = data.token || data.jwt;
    
    console.log('✓ Token generated successfully!\n');
    console.log('Add this to your .env file:\n');
    console.log(`KINABASE_JWT=${token}\n`);
    console.log('(Token will auto-generate if you leave this out and keep API_KEY/API_SECRET)');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error('\nMake sure your local Kinabase server is running at http://localhost:3000');
  }
}

generateToken();
