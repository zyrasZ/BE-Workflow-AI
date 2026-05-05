# Email Provider Adapters

This directory contains adapter implementations for different email providers. Each adapter implements the `EmailProviderAdapter` interface to provide a unified API for email operations.

## Available Adapters

### IMAPAdapter

**Status**: ✅ Implemented

**Purpose**: Read emails from any IMAP-compatible email server.

**Supported Operations**:
- ✅ `connect()` - Connect to IMAP server with password authentication
- ✅ `disconnect()` - Disconnect from IMAP server
- ✅ `fetchEmails()` - Fetch multiple emails with filtering and pagination
- ✅ `fetchEmail()` - Fetch a single email by UID
- ❌ `sendEmail()` - Not supported (use SMTPAdapter)
- ✅ `getRateLimits()` - Returns rate limit info (no limits for IMAP)

**Configuration**:
```typescript
const config: ProviderConfig = {
  provider: 'imap',
  credentials: {
    type: 'password',
    username: 'user@example.com',
    password: 'your-password',
  },
  host: 'imap.example.com',
  port: 993,
  secure: true, // Use SSL/TLS
};
```

**Usage Example**:
```typescript
import { IMAPAdapter } from './adapters/imap-adapter';

const adapter = new IMAPAdapter();

// Connect
await adapter.connect(config);

// Fetch emails
const emails = await adapter.fetchEmails({
  folder: 'INBOX',
  unreadOnly: true,
  limit: 10,
});

// Process emails
for (const email of emails) {
  console.log('From:', email.headers.from.address);
  console.log('Subject:', email.headers.subject);
  console.log('Body:', email.body.text);
}

// Disconnect
await adapter.disconnect();
```

**Fetch Options**:
- `folder` - Mailbox folder to read from (default: 'INBOX')
- `unreadOnly` - Only fetch unread emails
- `dateRange` - Filter by date range (start/end)
- `sender` - Filter by sender email address (string or RegExp)
- `subject` - Filter by subject (string or RegExp)
- `hasAttachment` - Filter emails with attachments
- `limit` - Maximum number of emails to fetch (default: 50)
- `offset` - Pagination offset (default: 0)

**IMAP Search Criteria**:

The adapter automatically converts `FetchOptions` to IMAP search criteria:

| FetchOption | IMAP Criteria | Example |
|-------------|---------------|---------|
| `unreadOnly: true` | `UNSEEN` | Fetch only unread emails |
| `dateRange.start` | `SINCE DD-MMM-YYYY` | Emails after date |
| `dateRange.end` | `BEFORE DD-MMM-YYYY` | Emails before date |
| `sender: "user@example.com"` | `FROM "user@example.com"` | Emails from sender |
| `subject: "Invoice"` | `SUBJECT "Invoice"` | Emails with subject |

**Error Handling**:

The adapter handles various error scenarios:

1. **Connection Errors**: Invalid credentials, network issues, server unavailable
2. **Mailbox Errors**: Invalid folder name, permission denied
3. **Parsing Errors**: Malformed emails (returns partial data with errors)

**Testing**:

Unit tests: `npm test -- imap-adapter.test.ts`
Integration tests: `RUN_INTEGRATION_TESTS=true npm test -- imap-adapter.integration.test.ts`

---

### SMTPAdapter

**Status**: ✅ Implemented

**Purpose**: Send emails via SMTP protocol.

**Supported Operations**:
- ✅ `connect()` - Connect to SMTP server with password authentication
- ✅ `disconnect()` - Disconnect from SMTP server
- ✅ `sendEmail()` - Send an email with attachments
- ❌ `fetchEmails()` - Not supported (use IMAPAdapter)
- ❌ `fetchEmail()` - Not supported (use IMAPAdapter)
- ✅ `getRateLimits()` - Returns rate limit info (no limits for SMTP)

**Configuration**:
```typescript
const config: ProviderConfig = {
  provider: 'smtp',
  credentials: {
    type: 'password',
    username: 'user@example.com',
    password: 'your-password',
  },
  host: 'smtp.example.com',
  port: 587,
  secure: true, // Use SSL/TLS
};
```

---

### GmailAdapter

**Status**: ✅ Implemented

**Purpose**: Read and send emails via Gmail API with OAuth2 authentication.

**Supported Operations**:
- ✅ `connect()` - Authenticate with Gmail OAuth2
- ✅ `disconnect()` - Cleanup Gmail API client
- ✅ `fetchEmails()` - Fetch emails with Gmail-specific features (labels, threads, search operators)
- ✅ `fetchEmail()` - Fetch single email by message ID
- ✅ `sendEmail()` - Send email via Gmail API with labels and threading support
- ✅ `getRateLimits()` - Returns Gmail API rate limit info (250 quota units/user/second)

**Configuration**:
```typescript
const config: ProviderConfig = {
  provider: 'gmail',
  credentials: {
    type: 'oauth2',
    accessToken: 'your-access-token',
    refreshToken: 'your-refresh-token',
    expiresAt: new Date('2024-12-31'),
  },
  clientId: 'your-client-id.apps.googleusercontent.com',
  clientSecret: 'your-client-secret',
  redirectUri: 'http://localhost:3000/auth/callback',
};
```

**Usage Example**:
```typescript
import { GmailAdapter } from './adapters/gmail-adapter';

const adapter = new GmailAdapter();

// Connect with OAuth2
await adapter.connect(config);

// Fetch emails with Gmail search operators
const emails = await adapter.fetchEmails({
  folder: 'INBOX',
  unreadOnly: true,
  hasAttachment: true,
  dateRange: {
    start: new Date('2024-01-01'),
  },
  limit: 50,
});

// Send email with labels
const result = await adapter.sendEmail({
  to: [{ address: 'recipient@example.com', name: 'Recipient' }],
  subject: 'Test Email',
  body: {
    text: 'Plain text content',
    html: '<p>HTML content</p>',
  },
  labels: ['INBOX', 'IMPORTANT'],
});

// Disconnect
await adapter.disconnect();
```

**Gmail-Specific Features**:

1. **Gmail Search Operators**: The adapter supports Gmail's powerful search syntax:
   - `from:user@example.com` - Emails from specific sender
   - `to:user@example.com` - Emails to specific recipient
   - `subject:invoice` - Emails with subject containing "invoice"
   - `has:attachment` - Emails with attachments
   - `is:unread` - Unread emails
   - `after:2024/01/01` - Emails after date
   - `before:2024/12/31` - Emails before date

2. **Labels**: Gmail uses labels instead of folders. Common labels:
   - `INBOX` - Inbox
   - `SENT` - Sent emails
   - `DRAFT` - Drafts
   - `TRASH` - Trash
   - `SPAM` - Spam
   - `IMPORTANT` - Important emails
   - Custom labels are also supported

3. **Threading**: Gmail automatically groups emails into threads (conversations). The adapter preserves thread IDs and supports replying within threads.

4. **Rate Limiting**: Gmail API has a limit of 250 quota units per user per second. The adapter automatically handles rate limiting:
   - `messages.list`: 1 quota unit
   - `messages.get`: 5 quota units
   - `messages.send`: 100 quota units
   - `messages.modify`: 5 quota units

**OAuth2 Authentication**:

To use Gmail API, you need to:

1. Create a project in [Google Cloud Console](https://console.cloud.google.com/)
2. Enable Gmail API
3. Create OAuth2 credentials (Client ID and Client Secret)
4. Implement OAuth2 flow to get access token and refresh token
5. The adapter automatically handles token refresh

**Error Handling**:

The adapter handles Gmail-specific errors:

1. **Rate Limit Errors (429)**: Automatically waits and retries
2. **Authentication Errors (401)**: Token expired or invalid
3. **Permission Errors (403)**: Insufficient OAuth2 scopes
4. **Not Found Errors (404)**: Message or label doesn't exist

**Testing**:

Unit tests: `npm test -- gmail-adapter.test.ts`
Integration tests: `RUN_INTEGRATION_TESTS=true npm test -- gmail-adapter.integration.test.ts`

---

## Adapter Interface

All adapters implement the `EmailProviderAdapter` interface:

```typescript
interface EmailProviderAdapter {
  connect(config: ProviderConfig): Promise<void>;
  disconnect(): Promise<void>;
  fetchEmails(options: FetchOptions): Promise<EmailMessage[]>;
  fetchEmail(id: string): Promise<EmailMessage>;
  sendEmail(email: OutgoingEmail): Promise<SendResult>;
  getRateLimits(): RateLimitInfo;
}
```

## Creating a New Adapter

To create a new email provider adapter:

1. **Create adapter file**: `adapters/your-adapter.ts`

2. **Implement the interface**:
```typescript
import type { EmailProviderAdapter, ProviderConfig, ... } from '../types';

export class YourAdapter implements EmailProviderAdapter {
  async connect(config: ProviderConfig): Promise<void> {
    // Implementation
  }
  
  async fetchEmails(options: FetchOptions): Promise<EmailMessage[]> {
    // Implementation
  }
  
  // ... other methods
}
```

3. **Create tests**: `adapters/your-adapter.test.ts`

4. **Export from index**: Update `lib/email-nodes/index.ts`

5. **Document**: Add documentation to this README

## Best Practices

### Connection Management

- Always call `disconnect()` when done
- Use try-finally to ensure cleanup:
```typescript
const adapter = new IMAPAdapter();
try {
  await adapter.connect(config);
  const emails = await adapter.fetchEmails(options);
  // Process emails
} finally {
  await adapter.disconnect();
}
```

### Error Handling

- Catch and handle connection errors
- Log parsing errors but continue processing
- Implement retry logic for transient failures

### Performance

- Use pagination for large mailboxes
- Implement connection pooling for concurrent operations
- Cache frequently accessed data
- Use lazy loading for attachments

### Security

- Never log credentials
- Use secure connections (SSL/TLS)
- Validate certificates in production
- Encrypt credentials at rest

## Troubleshooting

### Connection Issues

**Problem**: "Failed to connect to IMAP server"

**Solutions**:
- Verify host and port are correct
- Check if firewall allows outbound connections
- Verify credentials are correct
- Enable "less secure apps" if using Gmail (or use App Password)

### Authentication Issues

**Problem**: "Authentication failed"

**Solutions**:
- Verify username and password
- For Gmail: Use App Password instead of account password
- For Office 365: Enable IMAP access in settings
- Check if 2FA is enabled (may require app-specific password)

### Parsing Issues

**Problem**: "Failed to parse email"

**Solutions**:
- Check email format (should be valid MIME)
- Look at `parsingErrors` field in EmailMessage
- Report malformed emails for investigation

### Performance Issues

**Problem**: Slow email fetching

**Solutions**:
- Reduce batch size
- Use more specific search criteria
- Implement pagination
- Consider caching frequently accessed emails

## References

- [IMAP Protocol (RFC 3501)](https://tools.ietf.org/html/rfc3501)
- [MIME Format (RFC 2045)](https://tools.ietf.org/html/rfc2045)
- [Email Message Format (RFC 5322)](https://tools.ietf.org/html/rfc5322)
- [imapflow Documentation](https://imapflow.com/)
- [mailparser Documentation](https://nodemailer.com/extras/mailparser/)
