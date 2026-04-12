const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const NETWORKS = {
  testnet: {
    rpc: 'https://testnet.hsk.xyz',
    chainId: '133'
  },
  mainnet: {
    rpc: 'https://mainnet.hsk.xyz',
    chainId: '177' // Same chain ID for HashKey
  }
};

function loadEnv() {
  const envPath = path.join(__dirname, '..', '.env');
  if (!fs.existsSync(envPath)) {
    console.error('Error: .env file not found. Copy .env.example to .env and fill in the values.');
    process.exit(1);
  }

  const env = {};
  fs.readFileSync(envPath, 'utf8')
    .split('\n')
    .forEach(line => {
      line = line.trim();
      if (!line || line.startsWith('#')) return;
      const [key, ...valueParts] = line.split('=');
      if (key) env[key.trim()] = valueParts.join('=').trim();
    });

  return env;
}

function main() {
  const args = process.argv.slice(2);
  const networkName = args[0] || 'testnet';
  const network = NETWORKS[networkName];

  if (!network) {
    console.error(`Unknown network: ${networkName}. Use 'testnet' or 'mainnet'.`);
    process.exit(1);
  }

  const env = loadEnv();

  if (!env.PRIVATE_KEY) {
    console.error('Error: PRIVATE_KEY not set in .env file.');
    process.exit(1);
  }

  // Remove 0x prefix if present (forge expects key without 0x)
  let privateKey = env.PRIVATE_KEY.trim();
  if (privateKey.startsWith('0x')) {
    privateKey = privateKey.substring(2);
  }
  
  if (privateKey.length !== 64 || !/^[0-9a-fA-F]+$/.test(privateKey)) {
    console.error('Error: PRIVATE_KEY is missing or invalid.');
    console.error('');
    console.error('To fix:');
    console.error('1. Open hashflow/.env');
    console.error('2. Replace YOUR_PRIVATE_KEY_HERE with your actual private key');
    console.error('3. The key should be 64 hex characters (32 bytes), WITHOUT the 0x prefix');
    console.error('4. Example: PRIVATE_KEY=6b195a8d80239d39c03c7c65cdef77309c19c8f631f50bd78bcce7f42c4c525e1987');
    process.exit(1);
  }
  
  console.log('Using key starting with:', privateKey.substring(0, 8) + '...');

  if (!env.PLATFORM_ADDRESS) {
    console.error('Error: PLATFORM_ADDRESS not set in .env file.');
    process.exit(1);
  }

  console.log(`Deploying to HashKey ${networkName}...`);
  console.log(`Platform: ${env.PLATFORM_ADDRESS}`);
  console.log('');

  const child = spawn('forge', [
    'script', 'script/Deploy.s.sol:Deploy',
    '--rpc-url', network.rpc,
    '--broadcast',
    '--private-key', privateKey
  ], {
    cwd: path.join(__dirname, '..', 'contracts'),
    stdio: 'inherit'
  });

  child.on('error', err => {
    console.error('Failed to start forge:', err.message);
    process.exit(1);
  });

  child.on('close', code => {
    process.exit(code);
  });
}

main();