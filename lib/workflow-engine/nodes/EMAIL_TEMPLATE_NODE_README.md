# Email Template Node

## Overview

The Email Template Node renders email templates with dynamic data using the Handlebars template engine. It supports variable substitution, conditionals, loops, and helper functions. Templates can be loaded from the database or defined inline.

**Requirement**: Requirement 16 - Action Node - Email Template

## Features

- ✅ Load templates from database by ID
- ✅ Use inline template definitions
- ✅ Variable substitution using `{{variableName}}` syntax
- ✅ Render both subject and body templates
- ✅ Support text, HTML, and both body types
- ✅ Expression resolution from execution context
- ✅ Optional missing variable validation
- ✅ Integration with existing email template API

## Configuration

### Option 1: Load Template from Database

```typescript
{
  templateId: "uuid-of-template",
  data: {
    name: "{{variables.customerName}}",
    score: "{{variables.score}}"
  },
  failOnMissingVariable: false
}
```

### Option 2: Inline Template Definition

```typescript
{
  template: {
    subject: "Hello {{name}}",
    body: "<p>Welcome {{name}}, your score is {{score}}</p>",
    bodyType: "html"  // "text" | "html" | "both"
  },
  data: {
    name: "John Doe",
    score: 95
  },
  failOnMissingVariable: false
}
```

### Option 3: Use Context Variables (No Data Provided)

```typescript
{
  template: {
    subject: "Hello {{name}}",
    body: "Your score is {{score}}",
    bodyType: "text"
  }
  // No data field - will use context.variables automatically
}
```

## Configuration Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `templateId` | string | Conditional* | UUID of template to load from database |
| `template` | object | Conditional* | Inline template definition |
| `template.subject` | string | Yes (if template) | Subject template with {{variables}} |
| `template.body` | string | Yes (if template) | Body template with {{variables}} |
| `template.bodyType` | string | Yes (if template) | Body type: "text", "html", or "both" |
| `data` | object | No | Data object with variable values. If not provided, uses context variables |
| `failOnMissingVariable` | boolean | No | Whether to fail when a variable is missing (default: false) |

\* Either `templateId` or `template` must be provided (mutually exclusive)

## Input

The node accepts any input from previous nodes. If `data` is not provided in config, the node will use:
- All context variables
- All input data
- All node outputs (accessible via `nodes` object)

## Output

```typescript
{
  subject: string;           // Rendered email subject
  text?: string;             // Rendered plain text body (if bodyType is text or both)
  html?: string;             // Rendered HTML body (if bodyType is html or both)
  bodyType: string;          // Body type of the rendered template
  timestamp: string;         // ISO timestamp of when template was rendered
  templateId?: string;       // Template ID if loaded from database
  variablesUsed: string[];   // List of variable names used in rendering
}
```

## Template Syntax

The node uses Handlebars template engine with the following features:

### Variable Substitution

```handlebars
Hello {{name}}, your score is {{score}}
```

### Nested Properties

```handlebars
{{user.email}}
{{order.items.0.name}}
```

### Conditionals

```handlebars
{{#if isPremium}}
  Premium content here
{{else}}
  Standard content
{{/if}}
```

### Loops

```handlebars
{{#each items}}
  - {{this.name}}: {{this.price}}
{{/each}}
```

### Helpers

#### formatDate
```handlebars
{{formatDate date "YYYY-MM-DD"}}
```

#### truncate
```handlebars
{{truncate description 100 "..."}}
```

#### ifEquals
```handlebars
{{#ifEquals status "active"}}
  Active content
{{/ifEquals}}
```

## Expression Resolution

The `data` field supports expression resolution from the execution context:

```typescript
{
  template: { ... },
  data: {
    customerName: "{{variables.name}}",
    totalAmount: "{{variables.price * variables.quantity}}",
    emailFrom: "{{node-1.output.sender}}",
    status: "{{variables.score > 80 ? 'Pass' : 'Fail'}}"
  }
}
```

## Database Template Schema

Templates loaded from the database must have the following structure:

```sql
email_templates (
  id UUID PRIMARY KEY,
  user_id UUID,
  subject TEXT,
  body_text TEXT,
  body_html TEXT,
  body_type TEXT,  -- 'text' | 'html' | 'both'
  ...
)
```

## Error Handling

### Missing Template
If neither `templateId` nor `template` is provided, the node fails with:
```
"Either templateId or template must be provided"
```

### Template Not Found
If `templateId` is provided but template doesn't exist in database:
```
"Template not found: {templateId}"
```

### Missing Variables
If `failOnMissingVariable` is `true` and variables are missing:
```
"Missing required variables: variableName1, variableName2"
```

### Template Rendering Error
If template syntax is invalid or rendering fails:
```
"Failed to render template: {error message}"
```

## Usage Examples

### Example 1: Welcome Email with Database Template

```typescript
// Node configuration
{
  templateId: "welcome-email-template-id",
  data: {
    customerName: "{{variables.name}}",
    accountType: "{{variables.type}}"
  }
}

// Context variables
{
  name: "John Doe",
  type: "Premium"
}

// Output
{
  subject: "Welcome to Our Service, John Doe!",
  html: "<p>Hello John Doe, thank you for joining as a Premium member...</p>",
  bodyType: "html",
  timestamp: "2024-01-15T10:30:00Z",
  templateId: "welcome-email-template-id",
  variablesUsed: ["customerName", "accountType"]
}
```

### Example 2: Order Confirmation with Inline Template

```typescript
// Node configuration
{
  template: {
    subject: "Order #{{orderNumber}} Confirmed",
    body: `
      <h1>Order Confirmation</h1>
      <p>Thank you {{customerName}}!</p>
      <p>Order #{{orderNumber}} - Total: ${{total}}</p>
      <h2>Items:</h2>
      <ul>
      {{#each items}}
        <li>{{this.name}} - ${{this.price}}</li>
      {{/each}}
      </ul>
    `,
    bodyType: "html"
  },
  data: {
    orderNumber: "{{node-1.output.orderId}}",
    customerName: "{{variables.customerName}}",
    total: "{{node-1.output.totalAmount}}",
    items: "{{node-1.output.items}}"
  }
}
```

### Example 3: Conditional Content Based on Score

```typescript
// Node configuration
{
  template: {
    subject: "Your Test Results",
    body: `
      Hello {{name}},
      
      Your score: {{score}}
      
      {{#if (ifEquals grade "A")}}
      Congratulations! You achieved an excellent score!
      {{else}}
      Keep practicing to improve your score.
      {{/if}}
    `,
    bodyType: "text"
  }
  // No data - uses context variables directly
}

// Context variables
{
  name: "Jane Smith",
  score: 95,
  grade: "A"
}
```

## Integration with Send Email Node

The Email Template Node output can be directly piped to the Send Email Node:

```typescript
// Email Template Node (node-1)
{
  template: { ... }
}

// Send Email Node (node-2)
{
  provider: "smtp",
  config: { ... },
  to: [{ email: "customer@example.com" }],
  subject: "{{node-1.output.subject}}",
  body: {
    html: "{{node-1.output.html}}",
    text: "{{node-1.output.text}}"
  }
}
```

## Testing

The node includes comprehensive unit tests covering:
- ✅ Configuration validation
- ✅ Inline template rendering
- ✅ Database template loading
- ✅ Variable substitution
- ✅ Expression resolution
- ✅ Missing variable handling
- ✅ Text, HTML, and both body types
- ✅ Error scenarios

Run tests:
```bash
npm test -- email-template-node.test.ts
```

## Implementation Details

### Files
- `sourse/Back-end/lib/workflow-engine/nodes/email-template-node.ts` - Node implementation
- `sourse/Back-end/lib/workflow-engine/nodes/__tests__/email-template-node.test.ts` - Unit tests
- `sourse/Back-end/lib/email-nodes/template.ts` - Template rendering engine
- `sourse/Back-end/lib/workflow-engine/expression.ts` - Expression resolver

### Dependencies
- Handlebars - Template engine
- Supabase - Database access for template loading
- Expression resolver - Context variable resolution

### Node Registry
The node is automatically registered in `sourse/Back-end/lib/workflow-engine/nodes/index.ts` with type `email-template`.

## Related Nodes

- **Send Email Node** - Sends rendered email content
- **Set Variable Node** - Sets variables used in templates
- **Data Mapper Node** - Transforms data before template rendering
- **Email Filter Node** - Filters emails before processing

## Requirements Satisfied

✅ **Requirement 16.1**: Email Template Node SHALL accept a template identifier or inline template definition  
✅ **Requirement 16.2**: Email Template Node SHALL accept a data object with variable values  
✅ **Requirement 16.3**: Email Template Node SHALL load the template from the database or use the inline definition  
✅ **Requirement 16.4**: Email Template Node SHALL replace all variable placeholders in the template with values from the data object  
✅ **Requirement 16.5**: Email Template Node SHALL support variable syntax using double curly braces ({{variableName}})  
✅ **Requirement 16.6**: Email Template Node SHALL render both subject and body templates  
✅ **Requirement 16.7**: Email Template Node SHALL return the rendered email content (subject and body)  
✅ **Requirement 16.8**: When a variable is missing from the data object, Email Template Node SHALL either use an empty string or fail based on configuration
