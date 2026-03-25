import { encrypt, decrypt } from './encryption.js';

const original = 'sk-test-secretkey1234567890abcdef';
const ciphertext = encrypt(original);
const decrypted = decrypt(ciphertext);

console.assert(decrypted === original, 'Round-trip failed');
console.assert(ciphertext !== original, 'Encrypt returned plaintext');
console.assert(ciphertext.split(':').length === 3, 'Format not iv:tag:ciphertext');
console.log('✅ Encryption round-trip passed');
console.log('  Format:', ciphertext.substring(0, 40) + '...');

const ct1 = encrypt(original);
const ct2 = encrypt(original);
console.assert(ct1 !== ct2, 'Same plaintext produced identical ciphertext — IV is not random');
console.log('✅ IV randomness confirmed');

const ct = encrypt(original);
const parts = ct.split(':');
parts[2] = parts[2].slice(0, -2) + 'ff'; // corrupt last byte of ciphertext
const tampered = parts.join(':');
try {
  decrypt(tampered);
  console.error('❌ Tampered ciphertext decrypted without error — auth tag not verified');
  process.exit(1);
} catch (e) {
  console.log('✅ Tampered ciphertext correctly threw:', (e as Error).message);
}
