const test = require('node:test');
const assert = require('node:assert');
const { _cryptoForTest } = require('../bot/store');
const { encryptPassword, decryptPassword } = _cryptoForTest;

test('AES-GCM Encryption', async (t) => {
  
  await t.test('encrypt -> decrypt returns original plaintext', () => {
    const plaintext = 'superSecretPassword123!';
    const encObj = encryptPassword(plaintext);
    
    assert.ok(encObj.iv, 'Should generate an IV');
    assert.ok(encObj.ciphertext, 'Should generate ciphertext');
    assert.ok(encObj.authTag, 'Should generate an authTag');
    
    const decrypted = decryptPassword(encObj);
    assert.strictEqual(decrypted, plaintext, 'Decrypted text should match original plaintext');
  });

  await t.test('tampered ciphertext fails authentication', () => {
    const plaintext = 'superSecretPassword123!';
    const encObj = encryptPassword(plaintext);
    
    // Tamper with the ciphertext (flip a character)
    const tamperedCiphertext = encObj.ciphertext.replace(/0/g, '1').replace(/a/g, 'b');
    // If it didn't actually change, manually change the first char
    const finalTampered = tamperedCiphertext === encObj.ciphertext 
      ? (encObj.ciphertext.startsWith('0') ? '1' + encObj.ciphertext.slice(1) : '0' + encObj.ciphertext.slice(1))
      : tamperedCiphertext;
      
    const tamperedObj = { ...encObj, ciphertext: finalTampered };
    
    const decrypted = decryptPassword(tamperedObj);
    assert.strictEqual(decrypted, null, 'Tampered ciphertext should return null (auth tag mismatch)');
  });

  await t.test('empty string handles correctly', () => {
    const plaintext = '';
    const encObj = encryptPassword(plaintext);
    const decrypted = decryptPassword(encObj);
    assert.strictEqual(decrypted, plaintext, 'Should handle empty string correctly');
  });

  await t.test('unicode strings are handled correctly', () => {
    const plaintext = '🚀 𐍈 👨‍👩‍👧‍👦 Hello ПРИВЕТ';
    const encObj = encryptPassword(plaintext);
    const decrypted = decryptPassword(encObj);
    assert.strictEqual(decrypted, plaintext, 'Should encrypt and decrypt Unicode characters properly');
  });

  await t.test('missing properties gracefully fail', () => {
    const encObj = encryptPassword('test');
    
    const missingIv = { ...encObj };
    delete missingIv.iv;
    assert.strictEqual(decryptPassword(missingIv), null, 'Missing IV should return null');

    const missingAuthTag = { ...encObj };
    delete missingAuthTag.authTag;
    assert.strictEqual(decryptPassword(missingAuthTag), null, 'Missing Auth Tag should return null');
  });
});
