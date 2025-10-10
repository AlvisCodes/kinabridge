import fetch from 'node-fetch';

const KINABASE_BASE_URL = 'https://beta.kinabase.com/api/v1';
const APP_ID = 'ff03d99d-df24-4f64-a922-f1486b0ecdfb';
const APP_SECRET = 'RzNygfnluStVLJ0QbrAT6btPRDbm0Xs8YCFTLd3r8Kw2Ndx/hoKUQqrDtIg/hpRrSq7jLUcWdVV/cNdfLClYOA==';

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
