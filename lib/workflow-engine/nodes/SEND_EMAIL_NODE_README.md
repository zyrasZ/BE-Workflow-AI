# SendEmailNode Implementation

## Overview

The `SendEmailNode` is an action node that sends emails via configured email providers (SMTP, Gmail, Outlook) with support for template rendering, attachments, and dynamic content from the execution context.

**Requirement:** 13 - Action Node: Email Send

## Features

✅ **Multiple Email Providers**
- SMTP (with username/password authentication)
- Gmail (with OAuth2 authentication)
- Outlook (with OAuth2 authentication)

✅ **Email Content**
- Plain text emails
- HTML emails
- Both text and HTML (dual format)
- Template rendering with variable substitution

✅ **Recipients**
- To, CC, BCC support
- Multiple recipients per field
- Dynamic recipient resolution from context

✅ **Advanced Features**
- File attachments from execution context
- Email threading (inReplyTo, references)
- Expression resolution for dynamic content
- Template data merging

✅ **Error Handling**
- Connection failure handling
- Send failure handling
- Adapter initialization error handling
- Graceful disconnect on errors

## Configuration Schema

```typescript
{
  provider: 'smtp' | 'gmail' | 'outlook',  // Required
  config: {                                 // Required
    provider: string,
    credentials: {
      type: 'password' | 'oauth2',
      // For password auth:
      username?: string,
      password?: string,
      // For OAuth2 auth:
      accessToken?: string,
      refreshToken?: string
    },
    // For SMTP only:
    host?: string,
    port?: number,
    secure?: boolean
  },
  to: EmailAddress[] | string,             // Required
  cc?: EmailAddress[] | string,            // Optional
  bcc?: EmailAddress[] | string,           // Optional
  subject?: string,                        // Required if no template
  body?: {                                 // Required if no template
    text?: string,
    html?: string
  },
  template?: {                             // Optional (alternative to subject/body)
    subject: string,
    body: string,
    bodyType: 'text' | 'html' | 'both',
    data?: Record<string, any>
  },
  attachments?: Array<{                    // Optional
    filename: string,
    contentType: string,
    content: string,                       // Base64 encoded
    encoding?: 'base64' | 'utf8',
    contentId?: string
  }>,
  inReplyTo?: string,                      // Optional
  references?: string[]                    // Optional
}
```

## Usage Examples

### Example 1: Simple Plain Text Email

```typescript
const config = {
  provider: 'smtp',
  config: {
    provider: 'smtp',
    credentials: {
      type: 'password',
      username: 'sender@example.com',
      password: 'your-password'
    },
    host: 'smtp.example.com',
    port: 587
  },
  to: [{ address: 'recipient@example.com', name: 'John Doe' }],
  subject: 'Hello from Workflow',
  body: {
    text: 'This is a plain text email.'
  }
};
```

### Example 2: HTML Email with Template

```typescript
const config = {
  provider: 'smtp',
  config: { /* ... */ },
  to: [{ address: 'customer@example.com' }],
  template: {
    subject: 'Order Confirmation - {{orderNumber}}',
    body: `
      <html>
        <body>
          <h1>Order Confirmation</h1>
          <p>Dear {{customerName}},</p>
          <p>Order Number: {{orderNumber}}</p>
          <p>Total: ${{totalAmount}}</p>
        </body>
      </html>
    `,
    bodyType: 'both',
    data: {
      customerName: 'John Doe',
      orderNumber: 'ORD-12345',
      totalAmount: '99.99'
    }
  }
};
```

### Example 3: Dynamic Content from Context

```typescript
// Set variables in context (from previous nodes)
context.setVariable('customerEmail', 'customer@example.com');
context.setVariable('invoiceNumber', 'INV-2024-001');

const config = {
  provider: 'smtp',
  config: { /* ... */ },
  to: '{{variables.customerEmail}}',  // Dynamic recipient
  subject: 'Invoice {{variables.invoiceNumber}}',
  body: {
    html: '<p>Invoice Number: {{variables.invoiceNumber}}</p>'
  }
};
```

### Example 4: Email with Attachments

```typescript
const config = {
  provider: 'smtp',
  config: { /* ... */ },
  to: [{ address: 'recipient@example.com' }],
  subject: 'Monthly Report',
  body: {
    html: '<p>Please find attached the monthly report.</p>'
  },
  attachments: [
    {
      filename: 'report.pdf',
      contentType: 'application/pdf',
      content: 'base64-encoded-content',
      encoding: 'base64'
    }
  ]
};
```

### Example 5: Reply to Email Thread

```typescript
// Get data from previous "Read Email" node
const originalMessage = context.getNodeOutput('read-email-node');

const config = {
  provider: 'smtp',
  config: { /* ... */ },
  to: '{{read-email-node.from.address}}',
  subject: 'Re: Your Support Request',
  body: {
    html: '<p>Thank you for contacting us.</p>'
  },
  inReplyTo: '{{read-email-node.messageId}}',
  references: ['{{read-email-node.messageId}}']
};
```

## Output

On successful execution, the node returns:

```typescript
{
  success: true,
  output: {
    messageId: 'unique-message-id',
    threadId: 'thread-id',           // If supported by provider
    provider: 'smtp',
    timestamp: '2024-01-01T00:00:00Z',
    recipients: {
      to: 2,
      cc: 1,
      bcc: 0
    }
  }
}
```

On failure:

```typescript
{
  success: false,
  output: {
    provider: 'smtp',
    error: {
      code: 'SEND_ERROR',
      message: 'Failed to send email: Connection timeout',
      retryable: true
    }
  },
  error: 'Failed to send email: Connection timeout'
}
```

## Expression Resolution

The SendEmailNode supports expression resolution in the following fields:

- `to`, `cc`, `bcc` - Recipient addresses
- `subject` - Email subject
- `body.text`, `body.html` - Email body content
- `attachments` - Attachment data
- `inReplyTo`, `references` - Threading information

Expressions use the `{{...}}` syntax:

- `{{variables.name}}` - Access workflow variables
- `{{node-1.output.email}}` - Access output from previous nodes
- `{{variables.price * 1.1}}` - Arithmetic operations
- `{{variables.age > 18 ? "adult" : "minor"}}` - Conditional expressions

## Integration with Existing Email APIs

The SendEmailNode reuses the existing email infrastructure:

1. **Email Adapters** (`lib/email-nodes/adapters/`)
   - `IMAPAdapter` - For IMAP/POP3 providers
   - `SMTPAdapter` - For SMTP sending
   - `GmailAdapter` - For Gmail API

2. **Template Engine** (`lib/email-nodes/template.ts`)
   - Handlebars-based template rendering
   - Variable substitution
   - HTML to text conversion

3. **Type Definitions** (`lib/email-nodes/types.ts`)
   - `EmailAddress`, `OutgoingEmail`, `SendResult`
   - `ProviderConfig`, `EmailCredentials`

## Testing

The implementation includes comprehensive unit tests:

```bash
npm test -- send-email-node.test.ts
```

Test coverage includes:
- ✅ Configuration validation
- ✅ Basic email sending (text, HTML, both)
- ✅ Multiple recipients (to, cc, bcc)
- ✅ Template rendering
- ✅ Expression resolution
- ✅ Error handling (adapter, connection, send failures)

All 17 tests pass successfully.

## Node Registration

The SendEmailNode is automatically registered in the node registry:

```typescript
// lib/workflow-engine/nodes/index.ts
nodeRegistry.register('send-email', new SendEmailNode(), {
  type: 'send-email',
  name: 'Send Email',
  category: 'action',
  description: 'Send emails via configured email provider (SMTP/Gmail/Outlook)',
  configSchema: { /* ... */ },
  isSystem: true
});
```

## Files Created

1. **Implementation**
   - `sourse/Back-end/lib/workflow-engine/nodes/send-email-node.ts`

2. **Tests**
   - `sourse/Back-end/lib/workflow-engine/__tests__/send-email-node.test.ts`

3. **Examples**
   - `sourse/Back-end/lib/workflow-engine/nodes/__examples__/send-email-example.ts`

4. **Documentation**
   - `sourse/Back-end/lib/workflow-engine/nodes/SEND_EMAIL_NODE_README.md`

5. **Registry Update**
   - `sourse/Back-end/lib/workflow-engine/nodes/index.ts` (updated)

## Requirements Satisfied

✅ **Requirement 13.1** - Accept recipient addresses (to, cc, bcc), subject, and body as inputs  
✅ **Requirement 13.2** - Accept Email_Account configuration for SMTP connection  
✅ **Requirement 13.3** - Connect to SMTP server using configured account  
✅ **Requirement 13.4** - Send email with specified recipients, subject, and body  
✅ **Requirement 13.5** - Support both plain text and HTML email formats  
✅ **Requirement 13.6** - Support file attachments from Execution Context  
✅ **Requirement 13.7** - Support Email_Template rendering with variable substitution  
✅ **Requirement 13.8** - Return message ID on success  
✅ **Requirement 13.9** - Return descriptive error message on failure  

## Next Steps

The SendEmailNode is now ready for use in workflows. To use it:

1. Create a workflow with a send-email node
2. Configure the provider and credentials
3. Set recipients, subject, and body
4. Optionally use templates or expressions
5. Execute the workflow

The node will automatically:
- Connect to the email provider
- Send the email
- Disconnect from the provider
- Return the result to the workflow executor
