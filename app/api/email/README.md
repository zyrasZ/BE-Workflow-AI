# Email Processing API Documentation

This document provides comprehensive documentation for the Email Processing API endpoints. These APIs enable email operations including sending, filtering, template rendering, and parsing.

## Table of Contents

- [Authentication](#authentication)
- [Common Response Format](#common-response-format)
- [Error Handling](#error-handling)
- [API Endpoints](#api-endpoints)
  - [POST /api/email/send](#post-apiemailsend)
  - [POST /api/email/filter](#post-apiemailfilter)
  - [POST /api/email/template](#post-apiemailtemplate)
  - [POST /api/email/parse](#post-apiemailparse)
  - [POST /api/email/read](#post-apiemailread)

---

## Authentication

All email API endpoints require authentication. Include a valid session token or Bearer token in your request:

```http
Authorization: Bearer <your-token>
```

Or use cookie-based authentication with Supabase session cookies.

**Unauthorized Response (401):**
```json
{
  "success": false,
  "error": "Unauthorized",
  "code": "UNAUTHORIZED"
}
```

---

## Common Response Format

All API responses follow a consistent format:

**Success Response:**
```json
{
  "success": true,
  "data": { ... }
}
```

**Error Response:**
```json
{
  "success": false,
  "error": "Error message",
  "code": "ERROR_CODE"
}
```

---

## Error Handling

### Common Error Codes

| Code | Description |
|------|-------------|
| `UNAUTHORIZED` | Missing or invalid authentication |
| `BAD_REQUEST` | Invalid request parameters |
| `ADAPTER_ERROR` | Failed to initialize email adapter |
| `CONNECTION_ERROR` | Failed to connect to email provider |
| `SEND_ERROR` | Failed to send email |
| `FETCH_ERROR` | Failed to fetch emails |
| `FILTER_ERROR` | Failed to filter emails |
| `TEMPLATE_ERROR` | Failed to render template |
| `PARSE_ERROR` | Failed to parse email |
| `VALIDATION_ERROR` | Template validation failed |

### Retry Logic

For retryable errors (connection timeouts, rate limits), the API will indicate this in the error response:

```json
{
  "success": false,
  "error": {
    "code": "ETIMEDOUT",
    "message": "Connection timeout",
    "retryable": true
  }
}
```

---

## API Endpoints

### POST /api/email/send

Send an email via configured email provider (SMTP/Gmail/Outlook) with optional template rendering.

**Endpoint:** `POST /api/email/send`

**Request Body:**

```typescript
{
  provider: 'smtp' | 'gmail' | 'outlook';
  config: {
    provider: 'smtp' | 'gmail' | 'outlook';
    credentials: {
      type: 'password' | 'oauth2';
      // For password auth:
      username?: string;
      password?: string;
      // For OAuth2:
      accessToken?: string;
      refreshToken?: string;
      expiresAt?: string;
      scopes?: string[];
    };
    // For SMTP:
    host?: string;
    port?: number;
    secure?: boolean;
  };
  email: {
    to: Array<{ address: string; name?: string }>;
    cc?: Array<{ address: string; name?: string }>;
    bcc?: Array<{ address: string; name?: string }>;
    subject: string;
    body?: {
      text?: string;
      html?: string;
    };
    attachments?: Array<{
      filename: string;
      contentType: string;
      content: string; // Base64 encoded
      encoding?: 'base64' | 'utf8';
      contentId?: string; // For inline attachments
    }>;
    inReplyTo?: string; // For threading
    references?: string[]; // For threading
  };
  template?: {
    subject: string; // Handlebars template
    body: string; // Handlebars template
    bodyType: 'text' | 'html' | 'both';
    data?: Record<string, any>; // Template variables
  };
}
```

**Response:**

```json
{
  "success": true,
  "data": {
    "success": true,
    "messageId": "abc123@example.com",
    "threadId": "thread-456",
    "provider": "smtp",
    "timestamp": "2024-01-15T10:30:00.000Z"
  }
}
```

**Example Request:**

```bash
curl -X POST https://api.example.com/api/email/send \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "smtp",
    "config": {
      "provider": "smtp",
      "host": "smtp.gmail.com",
      "port": 587,
      "secure": true,
      "credentials": {
        "type": "password",
        "username": "user@example.com",
        "password": "app-password"
      }
    },
    "email": {
      "to": [{ "address": "recipient@example.com", "name": "John Doe" }],
      "subject": "Test Email",
      "body": {
        "text": "Hello, this is a test email.",
        "html": "<p>Hello, this is a <strong>test</strong> email.</p>"
      }
    }
  }'
```

**Example with Template:**

```bash
curl -X POST https://api.example.com/api/email/send \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "smtp",
    "config": { ... },
    "email": {
      "to": [{ "address": "recipient@example.com" }]
    },
    "template": {
      "subject": "Welcome {{name}}!",
      "body": "<h1>Hello {{name}}</h1><p>Your order #{{orderId}} has been confirmed.</p>",
      "bodyType": "html",
      "data": {
        "name": "John Doe",
        "orderId": "12345"
      }
    }
  }'
```

---

### POST /api/email/filter

Filter emails based on various criteria with AND/OR logic support.

**Endpoint:** `POST /api/email/filter`

**Request Body:**

```typescript
{
  emails: EmailMessage[]; // Array of email objects
  config: {
    rules: Array<{
      field: 'from' | 'to' | 'subject' | 'body' | 'date' | 'attachment' | 'label' | 'category' | 'flag';
      operator: 'equals' | 'contains' | 'startsWith' | 'endsWith' | 'matches' | 'before' | 'after' | 'between';
      value: any;
    }>;
    logic: 'AND' | 'OR';
  };
}
```

**Response:**

```json
{
  "success": true,
  "data": {
    "matched": [ /* EmailMessage[] */ ],
    "unmatched": [ /* EmailMessage[] */ ],
    "matchedCount": 5,
    "unmatchedCount": 3,
    "totalCount": 8,
    "timestamp": "2024-01-15T10:30:00.000Z"
  }
}
```

**Example Request:**

```bash
curl -X POST https://api.example.com/api/email/filter \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "emails": [ /* array of email objects */ ],
    "config": {
      "rules": [
        {
          "field": "from",
          "operator": "contains",
          "value": "@example.com"
        },
        {
          "field": "subject",
          "operator": "contains",
          "value": "urgent"
        }
      ],
      "logic": "AND"
    }
  }'
```

**Filter Rule Examples:**

```javascript
// Filter by sender
{
  field: "from",
  operator: "equals",
  value: "sender@example.com"
}

// Filter by subject keyword
{
  field: "subject",
  operator: "contains",
  value: "invoice"
}

// Filter by date range
{
  field: "date",
  operator: "between",
  value: {
    start: "2024-01-01T00:00:00Z",
    end: "2024-01-31T23:59:59Z"
  }
}

// Filter by attachment presence
{
  field: "attachment",
  operator: "equals",
  value: true
}

// Filter by regex pattern
{
  field: "subject",
  operator: "matches",
  value: "^RE:.*"
}
```

---

### POST /api/email/template

Render email templates with dynamic data or validate template syntax.

**Endpoint:** `POST /api/email/template`

**Request Body:**

```typescript
{
  template: {
    subject: string; // Handlebars template
    body: string; // Handlebars template
    bodyType: 'text' | 'html' | 'both';
  };
  data: Record<string, any>; // Template variables
  validateOnly?: boolean; // If true, only validate syntax
}
```

**Response (Render Mode):**

```json
{
  "success": true,
  "data": {
    "subject": "Welcome John Doe!",
    "text": "Hello John Doe...",
    "html": "<h1>Hello John Doe</h1>...",
    "timestamp": "2024-01-15T10:30:00.000Z"
  }
}
```

**Response (Validation Mode):**

```json
{
  "success": true,
  "data": {
    "valid": true,
    "errors": [],
    "timestamp": "2024-01-15T10:30:00.000Z"
  }
}
```

**Example Request (Render):**

```bash
curl -X POST https://api.example.com/api/email/template \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "template": {
      "subject": "Order Confirmation - {{orderId}}",
      "body": "<h1>Hello {{customer.name}}</h1><p>Your order #{{orderId}} for {{#each items}}{{this.name}}{{#unless @last}}, {{/unless}}{{/each}} has been confirmed.</p><p>Total: ${{total}}</p>",
      "bodyType": "html"
    },
    "data": {
      "orderId": "12345",
      "customer": {
        "name": "John Doe",
        "email": "john@example.com"
      },
      "items": [
        { "name": "Product A" },
        { "name": "Product B" }
      ],
      "total": 99.99
    }
  }'
```

**Example Request (Validate):**

```bash
curl -X POST https://api.example.com/api/email/template \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "template": {
      "subject": "Welcome {{name}}!",
      "body": "Hello {{name}}, your account is ready.",
      "bodyType": "text"
    },
    "data": {},
    "validateOnly": true
  }'
```

**Template Syntax:**

The template engine uses Handlebars syntax:

```handlebars
{{!-- Variables --}}
Hello {{name}}!

{{!-- Nested properties --}}
{{user.email}}
{{order.items.0.price}}

{{!-- Conditionals --}}
{{#if isPremium}}
  <p>Premium features enabled</p>
{{else}}
  <p>Upgrade to premium</p>
{{/if}}

{{!-- Loops --}}
{{#each items}}
  <li>{{this.name}} - ${{this.price}}</li>
{{/each}}

{{!-- Helpers --}}
{{formatDate date "YYYY-MM-DD"}}
{{truncate description 100}}
{{#ifEquals status "active"}}Active{{/ifEquals}}
```

---

### POST /api/email/parse

Parse raw email content (MIME format) into structured EmailMessage format.

**Endpoint:** `POST /api/email/parse`

**Request Body:**

```typescript
{
  rawEmail: {
    uid: number | string;
    source: string; // Raw MIME content
    flags?: string[]; // e.g., ['\\Seen', '\\Flagged']
    internalDate?: string; // ISO date string
    size?: number;
  };
  provider?: 'imap' | 'pop3' | 'gmail' | 'outlook';
}
```

**Response:**

```json
{
  "success": true,
  "data": {
    "email": {
      "id": "12345",
      "provider": "imap",
      "headers": {
        "from": { "address": "sender@example.com", "name": "John Doe" },
        "to": [{ "address": "recipient@example.com" }],
        "subject": "Test Email",
        "date": "2024-01-15T10:30:00.000Z",
        "messageId": "abc123@example.com"
      },
      "body": {
        "text": "Plain text content",
        "html": "<p>HTML content</p>",
        "encoding": "utf-8",
        "charset": "utf-8"
      },
      "attachments": [
        {
          "id": "att-1",
          "filename": "document.pdf",
          "contentType": "application/pdf",
          "size": 12345,
          "contentId": "cid-123"
        }
      ],
      "metadata": {
        "receivedAt": "2024-01-15T10:30:00.000Z",
        "processedAt": "2024-01-15T10:30:05.000Z"
      },
      "flags": {
        "seen": true,
        "flagged": false,
        "answered": false,
        "draft": false,
        "deleted": false
      }
    },
    "timestamp": "2024-01-15T10:30:05.000Z"
  }
}
```

**Example Request:**

```bash
curl -X POST https://api.example.com/api/email/parse \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "rawEmail": {
      "uid": 12345,
      "source": "From: sender@example.com\r\nTo: recipient@example.com\r\nSubject: Test\r\n\r\nHello World",
      "flags": ["\\Seen"],
      "internalDate": "2024-01-15T10:30:00.000Z",
      "size": 1024
    },
    "provider": "imap"
  }'
```

---

### POST /api/email/read

Fetch emails from email provider (IMAP/POP3/Gmail/Outlook) with filtering and pagination.

**Endpoint:** `POST /api/email/read`

**Request Body:**

```typescript
{
  provider: 'imap' | 'pop3' | 'gmail' | 'outlook';
  config: {
    provider: 'imap' | 'pop3' | 'gmail' | 'outlook';
    credentials: {
      type: 'password' | 'oauth2';
      username?: string;
      password?: string;
      accessToken?: string;
      refreshToken?: string;
    };
    host?: string; // For IMAP/POP3
    port?: number; // For IMAP/POP3
    secure?: boolean; // For IMAP/POP3
  };
  options?: {
    folder?: string; // e.g., 'INBOX', 'Sent'
    unreadOnly?: boolean;
    dateRange?: {
      start?: string; // ISO date
      end?: string; // ISO date
    };
    sender?: string | RegExp;
    subject?: string | RegExp;
    hasAttachment?: boolean;
    labels?: string[]; // Gmail
    categories?: string[]; // Outlook
    limit?: number; // Max 1000
    offset?: number;
    batchSize?: number; // Max 100
  };
}
```

**Response:**

```json
{
  "success": true,
  "data": {
    "emails": [ /* EmailMessage[] */ ],
    "count": 10,
    "provider": "imap",
    "timestamp": "2024-01-15T10:30:00.000Z"
  }
}
```

**Example Request:**

```bash
curl -X POST https://api.example.com/api/email/read \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "imap",
    "config": {
      "provider": "imap",
      "host": "imap.gmail.com",
      "port": 993,
      "secure": true,
      "credentials": {
        "type": "password",
        "username": "user@example.com",
        "password": "app-password"
      }
    },
    "options": {
      "folder": "INBOX",
      "unreadOnly": true,
      "limit": 50
    }
  }'
```

---

## Rate Limits

Different email providers have different rate limits:

| Provider | Rate Limit |
|----------|------------|
| SMTP | Varies by server (typically 10-100 emails/minute) |
| Gmail API | 250 quota units/user/second |
| Outlook API | Varies by license (typically 10,000 requests/10 minutes) |

The API will automatically handle rate limiting and return appropriate error responses when limits are exceeded.

---

## Best Practices

1. **Use Templates**: For sending multiple similar emails, use templates to avoid code duplication
2. **Batch Processing**: When fetching many emails, use pagination with reasonable batch sizes
3. **Error Handling**: Always check the `success` field and handle errors appropriately
4. **Secure Credentials**: Never hardcode credentials; use environment variables or secure storage
5. **Connection Pooling**: Reuse connections when sending multiple emails
6. **Validate Before Sending**: Use the template validation endpoint before sending emails
7. **Monitor Rate Limits**: Track API usage to avoid hitting rate limits

---

## Support

For issues or questions, please refer to the main project documentation or contact support.
