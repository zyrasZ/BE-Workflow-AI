/**
 * Email Configuration Encryption Utilities
 * 
 * Provides AES-256-GCM encryption/decryption for sensitive email credentials
 * and configuration data. Uses environment variable for encryption key.
 */

import crypto from 'crypto';

// Encryption configuration
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16; // 16 bytes for AES
const AUTH_TAG_LENGTH = 16; // 16 bytes for GCM auth tag
const KEY_LENGTH = 32; // 32 bytes for AES-256

/**
 * Get encryption key from environment variable
 * The key should be a 32-byte (256-bit) hex string
 */
function getEncryptionKey(): Buffer {
  const keyHex = process.env.EMAIL_ENCRYPTION_KEY;
  
  if (!keyHex) {
    throw new Error(
      'EMAIL_ENCRYPTION_KEY environment variable is not set. ' +
      'Generate a key using: node -e "console.log(crypto.randomBytes(32).toString(\'hex\'))"'
    );
  }
  
  const key = Buffer.from(keyHex, 'hex');
  
  if (key.length !== KEY_LENGTH) {
    throw new Error(
      `EMAIL_ENCRYPTION_KEY must be ${KEY_LENGTH} bytes (${KEY_LENGTH * 2} hex characters). ` +
      `Current length: ${key.length} bytes`
    );
  }
  
  return key;
}

/**
 * Encrypted data structure
 */
export interface EncryptedData {
  encrypted: string; // Base64 encoded encrypted data
  iv: string; // Base64 encoded initialization vector
  authTag: string; // Base64 encoded authentication tag
  algorithm: string; // Encryption algorithm used
}

/**
 * Encrypt sensitive configuration data
 * 
 * @param data - Plain text data to encrypt (will be JSON stringified)
 * @returns Encrypted data with IV and auth tag
 * 
 * @example
 * const config = {
 *   username: 'user@example.com',
 *   password: 'secret123',
 *   host: 'imap.gmail.com',
 *   port: 993
 * };
 * const encrypted = encryptConfig(config);
 */
export function encryptConfig(data: any): EncryptedData {
  try {
    // Convert data to JSON string
    const plaintext = JSON.stringify(data);
    
    // Get encryption key
    const key = getEncryptionKey();
    
    // Generate random IV
    const iv = crypto.randomBytes(IV_LENGTH);
    
    // Create cipher
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    
    // Encrypt data
    let encrypted = cipher.update(plaintext, 'utf8', 'base64');
    encrypted += cipher.final('base64');
    
    // Get authentication tag
    const authTag = cipher.getAuthTag();
    
    return {
      encrypted,
      iv: iv.toString('base64'),
      authTag: authTag.toString('base64'),
      algorithm: ALGORITHM
    };
  } catch (error) {
    throw new Error(`Encryption failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Decrypt encrypted configuration data
 * 
 * @param encryptedData - Encrypted data with IV and auth tag
 * @returns Decrypted and parsed data
 * 
 * @example
 * const decrypted = decryptConfig(encrypted);
 * console.log(decrypted.username); // 'user@example.com'
 */
export function decryptConfig(encryptedData: EncryptedData): any {
  try {
    // Validate algorithm
    if (encryptedData.algorithm !== ALGORITHM) {
      throw new Error(`Unsupported encryption algorithm: ${encryptedData.algorithm}`);
    }
    
    // Get encryption key
    const key = getEncryptionKey();
    
    // Convert base64 strings to buffers
    const iv = Buffer.from(encryptedData.iv, 'base64');
    const authTag = Buffer.from(encryptedData.authTag, 'base64');
    const encrypted = encryptedData.encrypted;
    
    // Validate IV length
    if (iv.length !== IV_LENGTH) {
      throw new Error(`Invalid IV length: ${iv.length} bytes (expected ${IV_LENGTH})`);
    }
    
    // Validate auth tag length
    if (authTag.length !== AUTH_TAG_LENGTH) {
      throw new Error(`Invalid auth tag length: ${authTag.length} bytes (expected ${AUTH_TAG_LENGTH})`);
    }
    
    // Create decipher
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    
    // Decrypt data
    let decrypted = decipher.update(encrypted, 'base64', 'utf8');
    decrypted += decipher.final('utf8');
    
    // Parse JSON
    return JSON.parse(decrypted);
  } catch (error) {
    if (error instanceof Error && error.message.includes('Unsupported state or unable to authenticate data')) {
      throw new Error('Decryption failed: Invalid authentication tag or corrupted data');
    }
    throw new Error(`Decryption failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Generate a new encryption key
 * This is a utility function for generating keys, not for production use
 * 
 * @returns Hex-encoded 256-bit encryption key
 * 
 * @example
 * const key = generateEncryptionKey();
 * console.log('Add this to your .env file:');
 * console.log(`EMAIL_ENCRYPTION_KEY=${key}`);
 */
export function generateEncryptionKey(): string {
  return crypto.randomBytes(KEY_LENGTH).toString('hex');
}

/**
 * Validate encryption key format
 * 
 * @param keyHex - Hex-encoded encryption key
 * @returns True if valid, false otherwise
 */
export function validateEncryptionKey(keyHex: string): boolean {
  try {
    const key = Buffer.from(keyHex, 'hex');
    return key.length === KEY_LENGTH;
  } catch {
    return false;
  }
}

/**
 * Encrypt a string value (for individual fields)
 * 
 * @param value - Plain text string to encrypt
 * @returns Encrypted data
 */
export function encryptString(value: string): EncryptedData {
  return encryptConfig({ value });
}

/**
 * Decrypt a string value (for individual fields)
 * 
 * @param encryptedData - Encrypted data
 * @returns Decrypted string
 */
export function decryptString(encryptedData: EncryptedData): string {
  const decrypted = decryptConfig(encryptedData);
  return decrypted.value;
}

/**
 * Redact sensitive fields from configuration for logging
 * 
 * @param config - Configuration object
 * @param sensitiveFields - Array of field names to redact
 * @returns Configuration with sensitive fields redacted
 * 
 * @example
 * const config = { username: 'user@example.com', password: 'secret123', host: 'imap.gmail.com' };
 * const redacted = redactSensitiveFields(config, ['password']);
 * // { username: 'user@example.com', password: '***REDACTED***', host: 'imap.gmail.com' }
 */
export function redactSensitiveFields(
  config: Record<string, any>,
  sensitiveFields: string[] = ['password', 'accessToken', 'refreshToken', 'clientSecret']
): Record<string, any> {
  const redacted = { ...config };
  
  for (const field of sensitiveFields) {
    if (field in redacted) {
      redacted[field] = '***REDACTED***';
    }
  }
  
  return redacted;
}

/**
 * Type guard to check if data is EncryptedData
 */
export function isEncryptedData(data: any): data is EncryptedData {
  return (
    typeof data === 'object' &&
    data !== null &&
    typeof data.encrypted === 'string' &&
    typeof data.iv === 'string' &&
    typeof data.authTag === 'string' &&
    typeof data.algorithm === 'string'
  );
}
