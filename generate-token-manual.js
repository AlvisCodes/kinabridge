import fetch from 'node-fetch';

const KINABASE_BASE_URL = 'https://smooth-liger-quietly.ngrok-free.app/api/v1';
const APP_ID = '76bd4b6a-3b0e-4b58-b539-45e3e5f6f860';
const APP_SECRET = 'tueirVPEyAWQejUYdNOlFaiFbHgwb47Y1mZ1I/apTEsgTy4II1qdr8LBjdmhVNdnGONnK9QlBjErDfdVwAVyZQ==';

async function generateToken() {
  try {
    const response = await fetch(`${KINABASE_BASE_URL}/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'ngrok-skip-browser-warning': 'true',
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
    console.error('\nMake sure your Kinabase server is running via ngrok at https://smooth-liger-quietly.ngrok-free.app');
  }
}

generateToken();
