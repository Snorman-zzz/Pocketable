const crypto = require('crypto');
const { execSync } = require('child_process');

// Generate a new API key
const randomBytes = crypto.randomBytes(32).toString('hex');
const apiKey = `dtn_${randomBytes}`;

console.log('🔑 Generated new Daytona API key:');
console.log('   Key:', apiKey);
console.log('');

// Extract prefix and suffix
const keyPrefix = apiKey.substring(0, 3); // "dtn"
const keySuffix = apiKey.substring(apiKey.length - 6); // last 6 chars

console.log('   Prefix:', keyPrefix);
console.log('   Suffix:', keySuffix);
console.log('');

// Generate bcrypt hash using docker exec
console.log('🔐 Generating bcrypt hash...');
const hashCommand = `docker exec daytona-db-1 bash -c "apt-get update -qq && apt-get install -y -qq python3 python3-bcrypt > /dev/null 2>&1 && python3 -c \\"import bcrypt; print(bcrypt.hashpw('${apiKey}'.encode('utf-8'), bcrypt.gensalt()).decode('utf-8'))\\""`;

try {
  const keyHash = execSync(hashCommand, { encoding: 'utf-8' }).trim();

  // Get the last line (the actual hash)
  const lines = keyHash.split('\n').filter(l => l.trim());
  const hash = lines[lines.length - 1];

  console.log('   Hash:', hash.substring(0, 40) + '...');
  console.log('');

  // Insert into database
  console.log('💾 Inserting API key into database...');
  const insertSQL = `
    INSERT INTO api_key (
      "userId",
      name,
      "organizationId",
      permissions,
      "keyHash",
      "keyPrefix",
      "keySuffix",
      "createdAt"
    ) VALUES (
      'daytona-admin',
      'pocketable-local-dev',
      'd9aa2d44-0dd1-4882-a037-6afa5e388f21',
      ARRAY['*']::api_key_permissions_enum[],
      '${hash}',
      '${keyPrefix}',
      '${keySuffix}',
      NOW()
    )
    ON CONFLICT ("userId", name, "organizationId")
    DO UPDATE SET
      "keyHash" = EXCLUDED."keyHash",
      "keyPrefix" = EXCLUDED."keyPrefix",
      "keySuffix" = EXCLUDED."keySuffix",
      "updatedAt" = NOW();
  `;

  const result = execSync(
    `docker exec daytona-db-1 psql -U user -d daytona -c "${insertSQL.replace(/\n/g, ' ')}"`,
    { encoding: 'utf-8' }
  );

  console.log('✅ API key created successfully!');
  console.log('');
  console.log('📝 Update your .env file with:');
  console.log(`   DAYTONA_API_KEY=${apiKey}`);
  console.log('');
  console.log('🔄 Restart the backend to use the new key.');

} catch (error) {
  console.error('❌ Error:', error.message);
  console.error('');
  console.error('Try running this manually:');
  console.error('1. Hash the key:');
  console.error(`   python3 -c "import bcrypt; print(bcrypt.hashpw('${apiKey}'.encode('utf-8'), bcrypt.gensalt()).decode('utf-8'))"`);
  console.error('');
  console.error('2. Insert into database with the hash');
}
