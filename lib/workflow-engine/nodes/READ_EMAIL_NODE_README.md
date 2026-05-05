# Read Email Node

## Overview

The **Read Email Node** fetches emails from configured email providers (IMAP, Gmail, Outlook) with comprehensive filtering and pagination support. It connects to email servers, retrieves emails matching specified criteria, and parses email headers, body content, and attachment metadata.

**Requirement 14: Action Node - Email Read**

## Features

- ✅ Multi-provider support (IMAP, Gmail API, Outlook API)
- ✅ Flexible filtering (unread only, date range, sender, subject pattern)
- ✅ Pagination support (limit, offset)
- ✅ Complete email parsing (headers, body, attachments)
- ✅ Expression support for dynamic configuration
- ✅ Comprehensive validation
- ✅ Error handling with descriptive messages

## Configuration

### Required Fields

| Field | Type | Description |
|-------|------|-------------|
| `provider` | `'imap' \| 'gmail' \| 'outlook'` | Email provider type |
| `config` | `ProviderConfig` | Provider configuration (credentials, host, port, etc.) |

### Optional Fields

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `folder` | `string` | `'INBOX'` | Mailbox folder name |
| `unreadOnly` | `boolean` | `undefined` | Fetch only unread emails |
| `dateRange` | `object` | `undefined` | Filter by date range (`{ start, end }`) |
| `sender` | `string \| RegExp` | `undefined` | Filter by sender address or pattern |
| `subject` | `string \| RegExp` | `undefined` | Filter by subject pattern |
| `hasAttachment` | `boolean` | `undefined` | Filter emails with attachments |
| `limit` | `number` | `10` | Maximum emails to retrieve (1-100) |
| `offset` | `number` | `0` | Number of emails to skip (pagination) |

### Provider Configuration

#### IMAP Configuration

```typescript
{
  provider: 'imap',
  config: {
    provider: 'imap',
    credentials: {
      type: 'password',
      username: 'user@example.com',
      password: 'your-password'
    },
    host: 'imap.example.com',
    port: 993,
    secure: true
  },
  folder: 'INBOX',
  unreadOnly: true,
  limit: 20
}
```

#### Gmail Configuration (OAuth2)

```typescript
{
  provider: 'gmail',
  config: {
    provider: 'gmail',
    credentials: {
      type: 'oauth2',
      accessToken: 'ya29.a0...',
      refreshToken: '1//0g...',
      expiresAt: new Date('2024-12-31T23:59:59Z')
    }
  },
  unreadOnly: true,
  limit: 10
}
```

#### Outlook Configuration (OAuth2)

```typescript
{
  provider: 'outlook',
  config: {
    provider: 'outlook',
    credentials: {
      type: 'oauth2',
      accessToken: 'EwB4A8l6...'
    }
  },
  folder: 'Inbox',
  limit: 15
}
```

## Output Format

The node returns an object with the following structure:

```typescript
{
  emails: [
    {
      id: string,
      provider: 'imap' | 'gmail' | 'outlook',
      from: {
        address: string,
        name?: string
      },
      to: Array<{
        address: string,
        name?: string
      }>,
      cc?: Array<{
        address: string,
        name?: string
      }>,
      subject: string,
      date: string, // ISO 8601 format
      messageId: string,
      inReplyTo?: string,
      references?: string[],
      body: {
        text?: string,
        html?: string,
        encoding: string,
        charset: string
      },
      attachments: Array<{
        id: string,
        filename: string,
        contentType: string,
        size: number,
        contentId?: string
      }>,
      flags: {
        seen: boolean,
        flagged: boolean,
        answered: boolean,
        draft: boolean
      },
      metadata: {
        threadId?: string,
        labels?: string[],
        categories?: string[],
        importance?: 'low' | 'normal' | 'high',
        snippet?: string,
        receivedAt: string // ISO 8601 format
      }
    }
  ],
  count: number,
  provider: string,
  folder: string,
  timestamp: string, // ISO 8601 format
  filters: {
    unreadOnly?: boolean,
    hasAttachment?: boolean,
    dateRange?: { start?: Date, end?: Date },
    sender?: string,
    subject?: string
  }
}
```

## Usage Examples

### Example 1: Fetch Unread Emails from INBOX

```typescript
{
  provider: 'imap',
  config: {
    provider: 'imap',
    credentials: {
      type: 'password',
      username: 'support@company.com',
      password: 'secure-password'
    },
    host: 'imap.company.com',
    port: 993,
    secure: true
  },
  folder: 'INBOX',
  unreadOnly: true,
  limit: 50
}
```

### Example 2: Fetch Emails from Specific Sender

```typescript
{
  provider: 'gmail',
  config: {
    provider: 'gmail',
    credentials: {
      type: 'oauth2',
      accessToken: '{{variables.gmailAccessToken}}'
    }
  },
  sender: 'customer@example.com',
  limit: 10
}
```

### Example 3: Fetch Emails with Date Range Filter

```typescript
{
  provider: 'imap',
  config: {
    provider: 'imap',
    credentials: {
      type: 'password',
      username: 'user@example.com',
      password: 'password'
    },
    host: 'imap.example.com',
    port: 993
  },
  dateRange: {
    start: '2024-01-01T00:00:00Z',
    end: '2024-01-31T23:59:59Z'
  },
  limit: 100
}
```

### Example 4: Fetch Emails with Subject Pattern

```typescript
{
  provider: 'gmail',
  config: {
    provider: 'gmail',
    credentials: {
      type: 'oauth2',
      accessToken: '{{variables.accessToken}}'
    }
  },
  subject: '/Invoice #\\d+/',  // Regex pattern
  hasAttachment: true,
  limit: 20
}
```

### Example 5: Pagination

```typescript
// First page
{
  provider: 'imap',
  config: { /* ... */ },
  limit: 10,
  offset: 0
}

// Second page
{
  provider: 'imap',
  config: { /* ... */ },
  limit: 10,
  offset: 10
}
```

## Expression Support

All configuration fields support expression syntax for dynamic values:

```typescript
{
  provider: 'imap',
  config: {
    provider: 'imap',
    credentials: {
      type: 'password',
      username: '{{variables.emailUsername}}',
      password: '{{variables.emailPassword}}'
    },
    host: '{{variables.imapHost}}',
    port: '{{variables.imapPort}}'
  },
  folder: '{{variables.folderName}}',
  unreadOnly: '{{variables.unreadOnly}}',
  limit: '{{variables.pageSize}}',
  sender: '{{variables.filterSender}}'
}
```

## Filtering

### Date Range Filter

Filter emails by date range:

```typescript
{
  dateRange: {
    start: '2024-01-01T00:00:00Z',  // ISO 8601 format
    end: '2024-01-31T23:59:59Z'
  }
}
```

### Sender Filter

Filter by sender address (exact match or regex):

```typescript
// Exact match
{ sender: 'customer@example.com' }

// Regex pattern (wrap in /.../)
{ sender: '/.*@example\\.com/' }
```

### Subject Filter

Filter by subject pattern (exact match or regex):

```typescript
// Contains text
{ subject: 'Invoice' }

// Regex pattern
{ subject: '/^RE:.*/' }
```

### Attachment Filter

Filter emails with attachments:

```typescript
{ hasAttachment: true }
```

### Unread Only

Fetch only unread emails:

```typescript
{ unreadOnly: true }
```

## Error Handling

The node provides descriptive error messages for common issues:

### Connection Errors

```
Failed to connect to imap: Connection timeout
Failed to connect to gmail: Invalid credentials
```

### Fetch Errors

```
Failed to fetch emails: IMAP server error
Failed to fetch emails: Rate limit exceeded
```

### Validation Errors

```
provider is required
provider must be one of: imap, gmail, outlook
limit must be between 1 and 100
offset must be non-negative
config.credentials.username is required for password authentication
config.host is required for IMAP provider
```

## Validation Rules

The node validates configuration before execution:

1. **Provider**: Must be 'imap', 'gmail', or 'outlook'
2. **Config**: Must include provider and credentials
3. **Credentials**: Must match type (password or oauth2)
4. **IMAP**: Must include host and port
5. **Limit**: Must be between 1 and 100
6. **Offset**: Must be non-negative

## Integration with Workflow

### Typical Workflow Pattern

```
Manual Trigger
    ↓
Read Email Node (fetch unread emails)
    ↓
Loop Node (iterate through emails)
    ↓
    ├─→ If/Else Node (check sender)
    │       ├─→ AI Chat Node (generate reply)
    │       │       ↓
    │       │   Send Email Node (send reply)
    │       │
    │       └─→ Set Variable Node (log skipped)
    │
    └─→ Merge Node (collect results)
```

### Accessing Email Data in Downstream Nodes

```typescript
// Access email array
{{node-1.output.emails}}

// Access first email subject
{{node-1.output.emails[0].subject}}

// Access sender address
{{node-1.output.emails[0].from.address}}

// Access email body
{{node-1.output.emails[0].body.text}}

// Access attachment count
{{node-1.output.emails[0].attachments.length}}

// Access total count
{{node-1.output.count}}
```

## Performance Considerations

1. **Limit**: Default is 10, maximum is 100 per request
2. **Pagination**: Use offset for large mailboxes
3. **Filtering**: Apply filters to reduce data transfer
4. **Connection**: Node connects and disconnects for each execution
5. **Timeout**: Inherits from workflow executor timeout settings

## Security

1. **Credentials**: Stored securely in provider config
2. **OAuth2**: Preferred for Gmail and Outlook
3. **SSL/TLS**: Enabled by default for IMAP
4. **Validation**: All inputs validated before execution
5. **Error Messages**: No credential leakage in errors

## Limitations

1. **Batch Size**: Maximum 100 emails per request
2. **Attachment Content**: Only metadata returned (not full content)
3. **Provider Support**: IMAP, Gmail API, Outlook API only
4. **Folder Names**: Provider-specific (e.g., 'INBOX' vs 'Inbox')
5. **Regex Patterns**: Must be wrapped in `/pattern/` format

## Related Nodes

- **Send Email Node**: Send emails via SMTP/Gmail/Outlook
- **Email Filter Node**: Filter emails based on criteria
- **Email Template Node**: Render email templates
- **Loop Node**: Iterate through fetched emails
- **If/Else Node**: Conditional email processing

## Requirements Mapping

| Requirement | Implementation |
|-------------|----------------|
| 14.1 Accept Email_Account configuration and folder name | ✅ `config` and `folder` fields |
| 14.2 Accept filter criteria | ✅ `unreadOnly`, `dateRange`, `sender`, `subject`, `hasAttachment` |
| 14.3 Connect to email server via IMAP | ✅ Uses `getAdapter()` and `connect()` |
| 14.4 Retrieve emails matching filter criteria | ✅ `fetchEmails()` with `FetchOptions` |
| 14.5 Parse email headers | ✅ Returns `from`, `to`, `subject`, `date`, etc. |
| 14.6 Parse email body | ✅ Returns `body.text` and `body.html` |
| 14.7 Extract attachment metadata | ✅ Returns `attachments` array with metadata |
| 14.8 Return array of email objects | ✅ Returns `emails` array |
| 14.9 Support limiting number of emails | ✅ `limit` field (default 10, max 100) |
| 14.10 Use existing email reading logic | ✅ Uses `/api/email/read` adapters |

## Testing

Run tests with:

```bash
npm test -- read-email-node.test.ts
```

Test coverage includes:
- ✅ Configuration validation
- ✅ Required field validation
- ✅ Provider type validation
- ✅ Limit range validation
- ✅ Offset validation
- ✅ Credential validation
- ✅ IMAP-specific validation
- ✅ OAuth2 validation
- ✅ Type identifier verification
