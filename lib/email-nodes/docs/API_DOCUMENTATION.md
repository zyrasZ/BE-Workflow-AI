# Email Processing Nodes - API Documentation

## Overview

This document provides comprehensive API documentation for the Email Processing Nodes feature, including all endpoints, request/response formats, authentication requirements, and error codes.

## Base URL

```
http://localhost:3000/api/email
```

For production:
```
https://your-domain.com/api/email
```

## Authentication

All API endpoints require authentication using Supabase Auth. Include the authentication token in the request headers:

```http
Authorization: Bearer <your-access-token>
```

### Getting an Access Token

Use Supabase client to get the access token:

```typescript
const { data: { session } } = await supabase.auth.getSession();
const accessToken = session?.access_token;
```

## Common Response Formats

### Success Response

```json
{
  "data": { ... },
  "message": "Operation successful"
}
```

### Error Response

```json
{
  "error": "Error category",
  "message": "Detailed error message"
}
```

## Error Codes

| HTTP Status | Error Category | Description |
|-------------|----------------|-------------|
| 400 | Validation error | Invalid request parameters or body |
| 401 | Unauthorized | Missing or invalid authentication token |
| 403 | Forbidden | User doesn't have permission for this resource |
| 404 | Not found | Resource doesn't exist |
| 409 | Conflict | Resource already exists (duplicate) |
| 500 | Internal server error | Server-side error |
| 500 | Database error | Database operation failed |
| 500 | Encryption error | Failed to encrypt/decrypt data |

---

## Email Accounts API

### List Email Accounts

Get all email accounts for the authenticated user.

**Endpoint:** `GET /api/email/accounts`

**Query Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| provider | string | No | Filter by provider (imap, pop3, gmail, outlook, smtp) |
| is_active | boolean | No | Filter by active status (true/false) |

**Example Request:**

```http
GET /api/email/accounts?provider=gmail&is_active=true
Authorization: Bearer <token>
```

**Example Response:**

```json
{
  "accounts": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "user_id": "123e4567-e89b-12d3-a456-426614174000",
      "name": "My Gmail Account",
      "email_address": "user@gmail.com",
      "provider": "gmail",
      "config": {
        "clientId": "***REDACTED***",
        "scopes": ["https://www.googleapis.com/auth/gmail.readonly"]
      },
      "is_active": true,
      "last_sync_at": "2024-01-15T10:30:00Z",
      "last_error": null,
      "created_at": "2024-01-01T00:00:00Z",
      "updated_at": "2024-01-15T10:30:00Z"
    }
  ],
  "count": 1
}
```

**Notes:**
- Sensitive fields in `config` (password, accessToken, refreshToken, clientSecret) are redacted in responses
- The `config` object structure varies by provider

---

### Create Email Account

Create a new email account with encrypted credentials.

**Endpoint:** `POST /api/email/accounts`

**Request Body:**

```json
{
  "name": "My Gmail Account",
  "email_address": "user@gmail.com",
  "provider": "gmail",
  "config": {
    "clientId": "your-client-id",
    "clientSecret": "your-client-secret",
    "accessToken": "your-access-token",
    "refreshToken": "your-refresh-token",
    "expiresAt": "2024-12-31T23:59:59Z",
    "scopes": ["https://www.googleapis.com/auth/gmail.readonly"]
  }
}
```

**Provider-Specific Config Formats:**

#### IMAP/POP3/SMTP

```json
{
  "username": "user@example.com",
  "password": "your-password",
  "host": "imap.gmail.com",
  "port": 993,
  "secure": true
}
```

#### Gmail (OAuth2)

```json
{
  "clientId": "your-client-id",
  "clientSecret": "your-client-secret",
  "accessToken": "your-access-token",
  "refreshToken": "your-refresh-token",
  "expiresAt": "2024-12-31T23:59:59Z",
  "scopes": ["https://www.googleapis.com/auth/gmail.readonly"]
}
```

#### Outlook (OAuth2)

```json
{
  "clientId": "your-client-id",
  "clientSecret": "your-client-secret",
  "accessToken": "your-access-token",
  "refreshToken": "your-refresh-token",
  "expiresAt": "2024-12-31T23:59:59Z",
  "scopes": ["https://graph.microsoft.com/Mail.Read"]
}
```

**Example Response:**

```json
{
  "account": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "user_id": "123e4567-e89b-12d3-a456-426614174000",
    "name": "My Gmail Account",
    "email_address": "user@gmail.com",
    "provider": "gmail",
    "config": {
      "clientId": "***REDACTED***",
      "scopes": ["https://www.googleapis.com/auth/gmail.readonly"]
    },
    "is_active": true,
    "last_sync_at": null,
    "last_error": null,
    "created_at": "2024-01-15T10:30:00Z",
    "updated_at": "2024-01-15T10:30:00Z"
  },
  "message": "Email account created successfully"
}
```

**Status Codes:**
- `201 Created` - Account created successfully
- `400 Bad Request` - Invalid request body or missing required fields
- `401 Unauthorized` - Authentication required
- `409 Conflict` - Account with this email and provider already exists
- `500 Internal Server Error` - Server error or encryption failure

---

### Get Email Account

Get a single email account by ID.

**Endpoint:** `GET /api/email/accounts/:id`

**Path Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| id | UUID | Yes | Email account ID |

**Example Request:**

```http
GET /api/email/accounts/550e8400-e29b-41d4-a716-446655440000
Authorization: Bearer <token>
```

**Example Response:**

```json
{
  "account": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "user_id": "123e4567-e89b-12d3-a456-426614174000",
    "name": "My Gmail Account",
    "email_address": "user@gmail.com",
    "provider": "gmail",
    "config": {
      "clientId": "***REDACTED***",
      "scopes": ["https://www.googleapis.com/auth/gmail.readonly"]
    },
    "is_active": true,
    "last_sync_at": "2024-01-15T10:30:00Z",
    "last_error": null,
    "created_at": "2024-01-01T00:00:00Z",
    "updated_at": "2024-01-15T10:30:00Z"
  }
}
```

**Status Codes:**
- `200 OK` - Account retrieved successfully
- `400 Bad Request` - Invalid account ID format
- `401 Unauthorized` - Authentication required
- `404 Not Found` - Account not found
- `500 Internal Server Error` - Server error or decryption failure

---

### Update Email Account

Update an existing email account.

**Endpoint:** `PATCH /api/email/accounts/:id`

**Path Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| id | UUID | Yes | Email account ID |

**Request Body:**

All fields are optional. Only include fields you want to update.

```json
{
  "name": "Updated Account Name",
  "email_address": "newemail@gmail.com",
  "config": {
    "accessToken": "new-access-token",
    "refreshToken": "new-refresh-token",
    "expiresAt": "2024-12-31T23:59:59Z"
  },
  "is_active": false,
  "last_sync_at": "2024-01-15T12:00:00Z",
  "last_error": "Connection timeout"
}
```

**Example Response:**

```json
{
  "account": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "user_id": "123e4567-e89b-12d3-a456-426614174000",
    "name": "Updated Account Name",
    "email_address": "newemail@gmail.com",
    "provider": "gmail",
    "config": {
      "clientId": "***REDACTED***",
      "scopes": ["https://www.googleapis.com/auth/gmail.readonly"]
    },
    "is_active": false,
    "last_sync_at": "2024-01-15T12:00:00Z",
    "last_error": "Connection timeout",
    "created_at": "2024-01-01T00:00:00Z",
    "updated_at": "2024-01-15T12:00:00Z"
  },
  "message": "Email account updated successfully"
}
```

**Status Codes:**
- `200 OK` - Account updated successfully
- `400 Bad Request` - Invalid request body or account ID
- `401 Unauthorized` - Authentication required
- `404 Not Found` - Account not found
- `409 Conflict` - Email address and provider combination already exists
- `500 Internal Server Error` - Server error or encryption failure

---

### Delete Email Account

Delete an email account.

**Endpoint:** `DELETE /api/email/accounts/:id`

**Path Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| id | UUID | Yes | Email account ID |

**Example Request:**

```http
DELETE /api/email/accounts/550e8400-e29b-41d4-a716-446655440000
Authorization: Bearer <token>
```

**Example Response:**

```json
{
  "message": "Email account deleted successfully"
}
```

**Status Codes:**
- `200 OK` - Account deleted successfully
- `400 Bad Request` - Invalid account ID format
- `401 Unauthorized` - Authentication required
- `500 Internal Server Error` - Server error

**Notes:**
- Deleting an account will also delete all associated email logs (cascade delete)
- This operation cannot be undone

---

## Email Templates API

### List Email Templates

Get all email templates for the authenticated user.

**Endpoint:** `GET /api/email/templates`

**Query Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| category | string | No | Filter by category |
| is_active | boolean | No | Filter by active status (true/false) |
| search | string | No | Search in name and description |

**Example Request:**

```http
GET /api/email/templates?category=customer_support&is_active=true
Authorization: Bearer <token>
```

**Example Response:**

```json
{
  "templates": [
    {
      "id": "660e8400-e29b-41d4-a716-446655440000",
      "user_id": "123e4567-e89b-12d3-a456-426614174000",
      "name": "Welcome Email",
      "description": "Welcome email for new customers",
      "subject": "Welcome to {{company_name}}!",
      "body_text": "Hello {{user_name}}, welcome to our platform!",
      "body_html": "<h1>Hello {{user_name}}</h1><p>Welcome to our platform!</p>",
      "body_type": "both",
      "variables": ["company_name", "user_name"],
      "category": "customer_support",
      "tags": ["welcome", "onboarding"],
      "usage_count": 42,
      "last_used_at": "2024-01-15T10:30:00Z",
      "is_active": true,
      "created_at": "2024-01-01T00:00:00Z",
      "updated_at": "2024-01-15T10:30:00Z"
    }
  ],
  "count": 1
}
```

**Status Codes:**
- `200 OK` - Templates retrieved successfully
- `401 Unauthorized` - Authentication required
- `500 Internal Server Error` - Server error

---

### Create Email Template

Create a new email template.

**Endpoint:** `POST /api/email/templates`

**Request Body:**

```json
{
  "name": "Welcome Email",
  "description": "Welcome email for new customers",
  "subject": "Welcome to {{company_name}}!",
  "body_text": "Hello {{user_name}}, welcome to our platform!",
  "body_html": "<h1>Hello {{user_name}}</h1><p>Welcome to our platform!</p>",
  "body_type": "both",
  "variables": ["company_name", "user_name"],
  "category": "customer_support",
  "tags": ["welcome", "onboarding"]
}
```

**Field Descriptions:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| name | string | Yes | Template name (must be unique per user) |
| description | string | No | Template description |
| subject | string | Yes | Email subject with variable placeholders |
| body_text | string | Conditional | Plain text body (required if body_type is "text" or "both") |
| body_html | string | Conditional | HTML body (required if body_type is "html" or "both") |
| body_type | string | Yes | "text", "html", or "both" |
| variables | string[] | No | Array of variable names used in template |
| category | string | No | Template category for organization |
| tags | string[] | No | Array of tags for organization |

**Example Response:**

```json
{
  "template": {
    "id": "660e8400-e29b-41d4-a716-446655440000",
    "user_id": "123e4567-e89b-12d3-a456-426614174000",
    "name": "Welcome Email",
    "description": "Welcome email for new customers",
    "subject": "Welcome to {{company_name}}!",
    "body_text": "Hello {{user_name}}, welcome to our platform!",
    "body_html": "<h1>Hello {{user_name}}</h1><p>Welcome to our platform!</p>",
    "body_type": "both",
    "variables": ["company_name", "user_name"],
    "category": "customer_support",
    "tags": ["welcome", "onboarding"],
    "usage_count": 0,
    "last_used_at": null,
    "is_active": true,
    "created_at": "2024-01-15T10:30:00Z",
    "updated_at": "2024-01-15T10:30:00Z"
  },
  "message": "Email template created successfully"
}
```

**Status Codes:**
- `201 Created` - Template created successfully
- `400 Bad Request` - Invalid request body or missing required fields
- `401 Unauthorized` - Authentication required
- `409 Conflict` - Template with this name already exists
- `500 Internal Server Error` - Server error

---

### Update Email Template

Update an existing email template.

**Endpoint:** `PATCH /api/email/templates/:id`

**Path Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| id | UUID | Yes | Email template ID |

**Request Body:**

All fields are optional. Only include fields you want to update.

```json
{
  "name": "Updated Welcome Email",
  "description": "Updated description",
  "subject": "Welcome to {{company_name}}, {{user_name}}!",
  "body_text": "Updated text body",
  "body_html": "<h1>Updated HTML body</h1>",
  "body_type": "both",
  "variables": ["company_name", "user_name"],
  "category": "onboarding",
  "tags": ["welcome", "onboarding", "new"],
  "is_active": true
}
```

**Example Response:**

```json
{
  "template": {
    "id": "660e8400-e29b-41d4-a716-446655440000",
    "user_id": "123e4567-e89b-12d3-a456-426614174000",
    "name": "Updated Welcome Email",
    "description": "Updated description",
    "subject": "Welcome to {{company_name}}, {{user_name}}!",
    "body_text": "Updated text body",
    "body_html": "<h1>Updated HTML body</h1>",
    "body_type": "both",
    "variables": ["company_name", "user_name"],
    "category": "onboarding",
    "tags": ["welcome", "onboarding", "new"],
    "usage_count": 42,
    "last_used_at": "2024-01-15T10:30:00Z",
    "is_active": true,
    "created_at": "2024-01-01T00:00:00Z",
    "updated_at": "2024-01-15T12:00:00Z"
  },
  "message": "Email template updated successfully"
}
```

**Status Codes:**
- `200 OK` - Template updated successfully
- `400 Bad Request` - Invalid request body or template ID
- `401 Unauthorized` - Authentication required
- `404 Not Found` - Template not found
- `409 Conflict` - Template name already exists
- `500 Internal Server Error` - Server error

---

### Delete Email Template

Delete an email template.

**Endpoint:** `DELETE /api/email/templates/:id`

**Path Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| id | UUID | Yes | Email template ID |

**Example Request:**

```http
DELETE /api/email/templates/660e8400-e29b-41d4-a716-446655440000
Authorization: Bearer <token>
```

**Example Response:**

```json
{
  "message": "Email template deleted successfully"
}
```

**Status Codes:**
- `200 OK` - Template deleted successfully
- `400 Bad Request` - Invalid template ID format
- `401 Unauthorized` - Authentication required
- `500 Internal Server Error` - Server error

**Notes:**
- Deleting a template will set `template_id` to NULL in associated email logs
- This operation cannot be undone

---

## Rate Limiting

API endpoints are rate-limited to prevent abuse:

- **Email Accounts API**: 100 requests per minute per user
- **Email Templates API**: 100 requests per minute per user

When rate limit is exceeded, the API returns:

```json
{
  "error": "Rate limit exceeded",
  "message": "Too many requests. Please try again later.",
  "retry_after": 60
}
```

**Status Code:** `429 Too Many Requests`

---

## Security Considerations

### Credential Encryption

- All email account credentials are encrypted using AES-256-GCM before storage
- Encryption keys are stored securely in environment variables
- Sensitive fields are redacted in API responses

### Authentication

- All endpoints require valid Supabase authentication
- Row Level Security (RLS) ensures users can only access their own data
- Tokens should be kept secure and never exposed in client-side code

### HTTPS

- Always use HTTPS in production to protect data in transit
- Never send credentials over unencrypted connections

---

## Code Examples

### JavaScript/TypeScript

```typescript
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// Get access token
const { data: { session } } = await supabase.auth.getSession();
const accessToken = session?.access_token;

// Create email account
const response = await fetch('/api/email/accounts', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${accessToken}`
  },
  body: JSON.stringify({
    name: 'My Gmail Account',
    email_address: 'user@gmail.com',
    provider: 'gmail',
    config: {
      clientId: 'your-client-id',
      clientSecret: 'your-client-secret',
      accessToken: 'your-access-token',
      refreshToken: 'your-refresh-token',
      expiresAt: '2024-12-31T23:59:59Z',
      scopes: ['https://www.googleapis.com/auth/gmail.readonly']
    }
  })
});

const data = await response.json();
console.log(data);
```

### cURL

```bash
# List email accounts
curl -X GET "http://localhost:3000/api/email/accounts" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"

# Create email account
curl -X POST "http://localhost:3000/api/email/accounts" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -d '{
    "name": "My Gmail Account",
    "email_address": "user@gmail.com",
    "provider": "gmail",
    "config": {
      "clientId": "your-client-id",
      "clientSecret": "your-client-secret",
      "accessToken": "your-access-token",
      "refreshToken": "your-refresh-token",
      "expiresAt": "2024-12-31T23:59:59Z",
      "scopes": ["https://www.googleapis.com/auth/gmail.readonly"]
    }
  }'

# Update email account
curl -X PATCH "http://localhost:3000/api/email/accounts/550e8400-e29b-41d4-a716-446655440000" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -d '{
    "name": "Updated Account Name",
    "is_active": false
  }'

# Delete email account
curl -X DELETE "http://localhost:3000/api/email/accounts/550e8400-e29b-41d4-a716-446655440000" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

---

## Support

For issues or questions:
- Check the [User Guide](./USER_GUIDE.md) for usage instructions
- Check the [Developer Documentation](./DEVELOPER_GUIDE.md) for implementation details
- Report bugs in the project issue tracker
