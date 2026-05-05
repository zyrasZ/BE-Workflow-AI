/**
 * Email Parser - Wrapper around mailparser's simpleParser
 * 
 * This module provides email parsing functionality using the mailparser library.
 * It converts raw email data into our standardized EmailMessage format.
 */

import { simpleParser, ParsedMail, AddressObject } from 'mailparser';
import { EmailMessage, EmailAddress, EmailHeaders, EmailBody, Attachment, EmailFlags, EmailMetadata, RawEmail } from './types';
import { randomUUID } from 'crypto';

/**
 * Convert mailparser AddressObject to our EmailAddress format
 * 
 * @param addressObj - mailparser AddressObject (can be single address or array)
 * @returns EmailAddress object with address and optional name
 */
export function mapAddress(addressObj: AddressObject | undefined): EmailAddress {
  if (!addressObj || !addressObj.value || addressObj.value.length === 0) {
    return { address: '', name: undefined };
  }

  const firstAddress = addressObj.value[0];
  if (!firstAddress) {
    return { address: '', name: undefined };
  }
  
  return {
    address: firstAddress.address || '',
    name: firstAddress.name || undefined
  };
}

/**
 * Convert mailparser AddressObject array to our EmailAddress array format
 * 
 * @param addressObj - mailparser AddressObject (can contain multiple addresses or be an array)
 * @returns Array of EmailAddress objects
 */
export function mapAddresses(addressObj: AddressObject | AddressObject[] | undefined): EmailAddress[] {
  if (!addressObj) {
    return [];
  }

  // Handle array of AddressObject
  if (Array.isArray(addressObj)) {
    return addressObj.flatMap(obj => 
      obj.value.map(addr => ({
        address: addr.address || '',
        name: addr.name || undefined
      }))
    );
  }

  // Handle single AddressObject
  if (!addressObj.value || addressObj.value.length === 0) {
    return [];
  }

  return addressObj.value.map(addr => ({
    address: addr.address || '',
    name: addr.name || undefined
  }));
}

/**
 * Generate a unique email ID
 * 
 * Uses UUID v4 for guaranteed uniqueness across distributed systems.
 * Format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
 * 
 * @returns Unique email ID string
 */
export function generateId(): string {
  return randomUUID();
}

/**
 * Parse raw email data into structured EmailMessage format
 * 
 * This is the main parsing function that wraps mailparser's simpleParser
 * and converts the result to our EmailMessage format.
 * 
 * @param rawEmail - Raw email data with MIME source
 * @param provider - Email provider type ('imap', 'pop3', 'gmail', 'outlook')
 * @returns Promise resolving to structured EmailMessage object
 */
export async function parseEmail(
  rawEmail: RawEmail,
  provider: 'imap' | 'pop3' | 'gmail' | 'outlook' = 'imap'
): Promise<EmailMessage> {
  const parsingErrors: string[] = [];

  try {
    // Parse the raw MIME content using mailparser
    const parsed: ParsedMail = await simpleParser(rawEmail.source);

    // Extract headers
    const headers: EmailHeaders = {
      from: mapAddress(parsed.from),
      to: mapAddresses(parsed.to),
      cc: mapAddresses(parsed.cc),
      bcc: mapAddresses(parsed.bcc),
      subject: parsed.subject || '',
      date: parsed.date || new Date(),
      messageId: parsed.messageId || generateId(),
      inReplyTo: parsed.inReplyTo || undefined,
      references: Array.isArray(parsed.references) 
        ? parsed.references 
        : (parsed.references ? [parsed.references] : undefined),
      replyTo: parsed.replyTo ? mapAddress(parsed.replyTo) : undefined,
      customHeaders: {}
    };

    // Extract body content
    const body: EmailBody = {
      text: parsed.text || undefined,
      html: parsed.html || undefined,
      encoding: parsed.textAsHtml ? 'html' : 'text',
      charset: 'utf-8' // mailparser handles charset conversion
    };

    // Extract attachments
    const attachments: Attachment[] = (parsed.attachments || []).map(att => ({
      id: generateId(),
      filename: att.filename || 'unnamed',
      contentType: att.contentType || 'application/octet-stream',
      size: att.size || 0,
      contentId: att.cid || undefined,
      content: att.content || undefined,
      url: undefined // Will be set by storage service if needed
    }));

    // Extract flags from raw email
    const flags: EmailFlags = {
      seen: rawEmail.flags?.includes('\\Seen') || false,
      flagged: rawEmail.flags?.includes('\\Flagged') || false,
      answered: rawEmail.flags?.includes('\\Answered') || false,
      draft: rawEmail.flags?.includes('\\Draft') || false,
      deleted: rawEmail.flags?.includes('\\Deleted') || false
    };

    // Build metadata
    const metadata: EmailMetadata = {
      receivedAt: rawEmail.internalDate || new Date(),
      processedAt: new Date()
    };

    // Construct the final EmailMessage
    const emailMessage: EmailMessage = {
      id: typeof rawEmail.uid === 'string' ? rawEmail.uid : String(rawEmail.uid),
      provider,
      headers,
      body,
      attachments,
      metadata,
      flags,
      parsingErrors: parsingErrors.length > 0 ? parsingErrors : undefined
    };

    return emailMessage;

  } catch (error) {
    // If parsing fails completely, return a partial EmailMessage with error info
    const errorMessage = error instanceof Error ? error.message : 'Unknown parsing error';
    parsingErrors.push(errorMessage);

    return {
      id: typeof rawEmail.uid === 'string' ? rawEmail.uid : String(rawEmail.uid),
      provider,
      headers: {
        from: { address: '' },
        to: [],
        subject: 'Parsing Failed',
        date: new Date(),
        messageId: generateId()
      },
      body: {
        text: undefined,
        html: undefined,
        encoding: 'text',
        charset: 'utf-8'
      },
      attachments: [],
      metadata: {
        receivedAt: rawEmail.internalDate || new Date(),
        processedAt: new Date()
      },
      flags: {
        seen: false,
        flagged: false,
        answered: false,
        draft: false,
        deleted: false
      },
      parsingErrors
    };
  }
}
