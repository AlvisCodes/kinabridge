import fetch from 'node-fetch';

const API_KEY = '76bd4b6a-3b0e-4b58-b539-45e3e5f6f860';
const API_SECRET = 'tueirVPEyAWQejUYdNOlFaiFbHgwb47Y1mZ1I/apTEsgTy4II1qdr8LBjdmhVNdnGONnK9QlBjErDfdVwAVyZQ==';
const KINABASE_BASE_URL = 'http://10.127.26.199:5272/api/v1';

async function generateToken() {
  console.log('Generating Kinabase JWT token...\n');
  
  const url = `${KINABASE_BASE_URL}/auth/token`;
  
  try {
    // Try with Basic Auth
    const basicAuth = Buffer.from(`${API_KEY}:${API_SECRET}`).toString('base64');
    
    console.log('Attempting authentication with Basic Auth...');
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${basicAuth}`,
      },
      body: JSON.stringify({
        apiKey: API_KEY,
        apiSecret: API_SECRET,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Error ${response.status}: ${errorText}\n`);
      
      // Try alternative approach - just POST credentials
      console.log('Trying alternative authentication method...');
      const altResponse = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          apiKey: API_KEY,
          apiSecret: API_SECRET,
        }),
      });
      
      if (!altResponse.ok) {
        const altErrorText = await altResponse.text();
        throw new Error(`Failed to obtain token (${altResponse.status}): ${altErrorText}`);
      }
      
      const altData = await altResponse.json();
      const token = altData.token || altData.jwt || altData.accessToken;
      
      console.log('✓ Token generated successfully!\n');
      console.log('Token:', token);
      console.log('\nAdd this to your .env file as:');
      console.log(`KINABASE_JWT=${token}`);
      
      if (altData.expiresIn) {
        console.log(`\nToken expires in: ${altData.expiresIn} seconds`);
      }
      
      return;
    }

    const data = await response.json();
    const token = data.token || data.jwt || data.accessToken;
    
    if (!token) {
      console.error('Response data:', JSON.stringify(data, null, 2));
      throw new Error('Token not found in response');
    }
    
    console.log('✓ Token generated successfully!\n');
    console.log('Token:', token);
    console.log('\nAdd this to your .env file as:');
    console.log(`KINABASE_JWT=${token}`);
    
    if (data.expiresIn || data.expires_in) {
      const expiresIn = data.expiresIn || data.expires_in;
      console.log(`\nToken expires in: ${expiresIn} seconds`);
    }
    
  } catch (error) {
    console.error('Error generating token:', error.message);
    process.exit(1);
  }
}

generateToken();
