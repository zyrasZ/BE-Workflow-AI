/**
 * Unit Tests for Email Parser Helper Functions
 * 
 * Tests for mapAddress(), mapAddresses(), and generateId() functions
 */

import { mapAddress, mapAddresses, generateId, parseEmail } from '../parser';
import { AddressObject } from 'mailparser';
import { RawEmail } from '../types';

describe('Email Parser Helper Functions', () => {
  describe('mapAddress', () => {
    it('should convert AddressObject with name to EmailAddress', () => {
      const addressObj: AddressObject = {
        value: [
          {
            address: 'john.doe@example.com',
            name: 'John Doe'
          }
        ],
        html: '',
        text: ''
      };

      const result = mapAddress(addressObj);

      expect(result).toEqual({
        address: 'john.doe@example.com',
        name: 'John Doe'
      });
    });

    it('should convert AddressObject without name to EmailAddress', () => {
      const addressObj: AddressObject = {
        value: [
          {
            address: 'jane@example.com',
            name: ''
          }
        ],
        html: '',
        text: ''
      };

      const result = mapAddress(addressObj);

      expect(result).toEqual({
        address: 'jane@example.com',
        name: undefined
      });
    });

    it('should handle undefined AddressObject', () => {
      const result = mapAddress(undefined);

      expect(result).toEqual({
        address: '',
        name: undefined
      });
    });

    it('should handle empty AddressObject', () => {
      const addressObj: AddressObject = {
        value: [],
        html: '',
        text: ''
      };

      const result = mapAddress(addressObj);

      expect(result).toEqual({
        address: '',
        name: undefined
      });
    });

    it('should handle AddressObject with missing address field', () => {
      const addressObj: AddressObject = {
        value: [
          {
            address: undefined as any,
            name: 'No Address'
          }
        ],
        html: '',
        text: ''
      };

      const result = mapAddress(addressObj);

      expect(result).toEqual({
        address: '',
        name: 'No Address'
      });
    });

    it('should take only the first address when multiple are present', () => {
      const addressObj: AddressObject = {
        value: [
          {
            address: 'first@example.com',
            name: 'First User'
          },
          {
            address: 'second@example.com',
            name: 'Second User'
          }
        ],
        html: '',
        text: ''
      };

      const result = mapAddress(addressObj);

      expect(result).toEqual({
        address: 'first@example.com',
        name: 'First User'
      });
    });
  });

  describe('mapAddresses', () => {
    it('should convert AddressObject with multiple addresses to EmailAddress array', () => {
      const addressObj: AddressObject = {
        value: [
          {
            address: 'alice@example.com',
            name: 'Alice'
          },
          {
            address: 'bob@example.com',
            name: 'Bob'
          },
          {
            address: 'charlie@example.com',
            name: ''
          }
        ],
        html: '',
        text: ''
      };

      const result = mapAddresses(addressObj);

      expect(result).toEqual([
        { address: 'alice@example.com', name: 'Alice' },
        { address: 'bob@example.com', name: 'Bob' },
        { address: 'charlie@example.com', name: undefined }
      ]);
    });

    it('should convert AddressObject with single address to array', () => {
      const addressObj: AddressObject = {
        value: [
          {
            address: 'single@example.com',
            name: 'Single User'
          }
        ],
        html: '',
        text: ''
      };

      const result = mapAddresses(addressObj);

      expect(result).toEqual([
        { address: 'single@example.com', name: 'Single User' }
      ]);
    });

    it('should handle undefined AddressObject', () => {
      const result = mapAddresses(undefined);

      expect(result).toEqual([]);
    });

    it('should handle empty AddressObject', () => {
      const addressObj: AddressObject = {
        value: [],
        html: '',
        text: ''
      };

      const result = mapAddresses(addressObj);

      expect(result).toEqual([]);
    });

    it('should handle addresses with missing fields', () => {
      const addressObj: AddressObject = {
        value: [
          {
            address: undefined as any,
            name: 'No Address'
          },
          {
            address: 'valid@example.com',
            name: undefined as any
          }
        ],
        html: '',
        text: ''
      };

      const result = mapAddresses(addressObj);

      expect(result).toEqual([
        { address: '', name: 'No Address' },
        { address: 'valid@example.com', name: undefined }
      ]);
    });
  });

  describe('generateId', () => {
    it('should generate a valid UUID v4', () => {
      const id = generateId();

      // UUID v4 format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
      const uuidV4Regex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      expect(id).toMatch(uuidV4Regex);
    });

    it('should generate unique IDs', () => {
      const id1 = generateId();
      const id2 = generateId();
      const id3 = generateId();

      expect(id1).not.toBe(id2);
      expect(id2).not.toBe(id3);
      expect(id1).not.toBe(id3);
    });

    it('should generate IDs with correct length', () => {
      const id = generateId();

      // UUID format is 36 characters (32 hex + 4 hyphens)
      expect(id).toHaveLength(36);
    });

    it('should generate 1000 unique IDs without collision', () => {
      const ids = new Set<string>();
      const count = 1000;

      for (let i = 0; i < count; i++) {
        ids.add(generateId());
      }

      expect(ids.size).toBe(count);
    });
  });

  describe('parseEmail integration', () => {
    it('should use helper functions correctly when parsing email', async () => {
      const rawEmail: RawEmail = {
        uid: 12345,
        source: `From: John Doe <john@example.com>
To: Jane Smith <jane@example.com>, Bob <bob@example.com>
Subject: Test Email
Date: Mon, 1 Jan 2024 12:00:00 +0000
Message-ID: <test@example.com>

This is a test email body.`,
        flags: ['\\Seen'],
        internalDate: new Date('2024-01-01T12:00:00Z'),
        size: 200
      };

      const result = await parseEmail(rawEmail, 'imap');

      // Verify mapAddress was used for 'from'
      expect(result.headers.from).toEqual({
        address: 'john@example.com',
        name: 'John Doe'
      });

      // Verify mapAddresses was used for 'to'
      expect(result.headers.to).toEqual([
        { address: 'jane@example.com', name: 'Jane Smith' },
        { address: 'bob@example.com', name: 'Bob' }
      ]);

      // Verify generateId was used for attachment IDs (if any)
      // In this case, no attachments, but ID should be set
      expect(result.id).toBe('12345');
      expect(result.headers.messageId).toBe('<test@example.com>');
    });

    it('should generate ID when messageId is missing', async () => {
      const rawEmail: RawEmail = {
        uid: 99999,
        source: `From: sender@example.com
To: receiver@example.com
Subject: No Message ID

Body content.`,
        flags: [],
        internalDate: new Date(),
        size: 100
      };

      const result = await parseEmail(rawEmail, 'imap');

      // Should have generated a UUID for messageId
      const uuidV4Regex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      expect(result.headers.messageId).toMatch(uuidV4Regex);
    });
  });
});
