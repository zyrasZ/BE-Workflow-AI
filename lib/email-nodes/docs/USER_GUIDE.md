# Email Processing Nodes - User Guide

## Table of Contents

1. [Introduction](#introduction)
2. [Getting Started](#getting-started)
3. [Connecting Email Accounts](#connecting-email-accounts)
4. [Gmail OAuth2 Setup](#gmail-oauth2-setup)
5. [Outlook OAuth2 Setup](#outlook-oauth2-setup)
6. [Creating Email Templates](#creating-email-templates)
7. [Using Filter Rules](#using-filter-rules)
8. [Best Practices](#best-practices)
9. [Troubleshooting](#troubleshooting)

---

## Introduction

Email Processing Nodes is a powerful feature that allows you to automate email workflows in the Office Automation Platform. You can:

- **Read emails** from multiple providers (IMAP, POP3, Gmail, Outlook)
- **Send emails** using templates with dynamic content
- **Filter emails** based on various criteria
- **Parse email content** to extract information
- **Process attachments** automatically

This guide will help you set up and use these features effectively.

---

## Getting Started

### Prerequisites

Before you begin, ensure you have:

1. An active account on the Office Automation Platform
2. Access to the email account you want to connect
3. For Gmail/Outlook: OAuth2 credentials (see setup sections below)
4. For IMAP/SMTP: Server details and credentials from your email provider

### Quick Start

1. **Log in** to the Office Automation Platform
2. Navigate to **Settings** > **Email Accounts**
3. Click **Add Email Account**
4. Choose your email provider
5. Enter the required credentials
6. Click **Save**

Your email account is now connected and ready to use in workflows!

---

## Connecting Email Accounts

### IMAP/POP3 Connection

IMAP and POP3 are standard email protocols supported by most email providers.

#### Step 1: Get Server Details

Contact your email provider or check their documentation for:
- **Server address** (e.g., `imap.gmail.com`)
- **Port number** (e.g., `993` for IMAP with SSL)
- **Security settings** (SSL/TLS recommended)

#### Step 2: Enable IMAP/POP3

Some providers require you to enable IMAP/POP3 access:

**Gmail:**
1. Go to Gmail Settings > Forwarding and POP/IMAP
2. Enable IMAP access
3. Save changes

**Outlook:**
1. Go to Outlook Settings > Mail > Sync email
2. Enable POP and IMAP
3. Save changes

#### Step 3: Create App Password (if required)

For accounts with 2-factor authentication:

**Gmail:**
1. Go to Google Account > Security
2. Enable 2-Step Verification
3. Go to App passwords
4. Generate a new app password for "Mail"
5. Use this password instead of your regular password

**Outlook:**
1. Go to Microsoft Account > Security
2. Enable two-step verification
3. Generate an app password
4. Use this password for IMAP/SMTP access

#### Step 4: Add Account in Platform

1. Click **Add Email Account**
2. Select **IMAP** or **POP3**
3. Fill in the form:
   - **Name**: A friendly name for this account
   - **Email Address**: Your email address
   - **Username**: Usually your email address
   - **Password**: Your password or app password
   - **Host**: Server address (e.g., `imap.gmail.com`)
   - **Port**: Port number (e.g., `993`)
   - **Secure**: Enable for SSL/TLS (recommended)
4. Click **Test Connection** to verify
5. Click **Save**

#### Common IMAP/SMTP Settings

**Gmail:**
- IMAP Host: `imap.gmail.com`, Port: `993`, SSL: Yes
- SMTP Host: `smtp.gmail.com`, Port: `587`, TLS: Yes

**Outlook/Hotmail:**
- IMAP Host: `outlook.office365.com`, Port: `993`, SSL: Yes
- SMTP Host: `smtp.office365.com`, Port: `587`, TLS: Yes

**Yahoo:**
- IMAP Host: `imap.mail.yahoo.com`, Port: `993`, SSL: Yes
- SMTP Host: `smtp.mail.yahoo.com`, Port: `587`, TLS: Yes

---

## Gmail OAuth2 Setup

OAuth2 is the recommended method for connecting Gmail accounts as it's more secure and doesn't require app passwords.

### Step 1: Create Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Click **Create Project**
3. Enter project name (e.g., "Email Automation")
4. Click **Create**

### Step 2: Enable Gmail API

1. In your project, go to **APIs & Services** > **Library**
2. Search for "Gmail API"
3. Click **Gmail API**
4. Click **Enable**

### Step 3: Create OAuth2 Credentials

1. Go to **APIs & Services** > **Credentials**
2. Click **Create Credentials** > **OAuth client ID**
3. If prompted, configure the OAuth consent screen:
   - User Type: **External**
   - App name: Your app name
   - User support email: Your email
   - Developer contact: Your email
   - Click **Save and Continue**
4. Add scopes:
   - Click **Add or Remove Scopes**
   - Add `https://www.googleapis.com/auth/gmail.readonly` (for reading)
   - Add `https://www.googleapis.com/auth/gmail.send` (for sending)
   - Click **Update**
5. Add test users (your email address)
6. Click **Save and Continue**

### Step 4: Create OAuth Client

1. Go back to **Credentials**
2. Click **Create Credentials** > **OAuth client ID**
3. Application type: **Web application**
4. Name: "Email Automation Client"
5. Authorized redirect URIs:
   - Add `http://localhost:3000/api/auth/google/callback` (for development)
   - Add your production callback URL
6. Click **Create**
7. **Save the Client ID and Client Secret** - you'll need these!

### Step 5: Get Access Token

You have two options:

#### Option A: Use OAuth Playground

1. Go to [OAuth 2.0 Playground](https://developers.google.com/oauthplayground/)
2. Click settings (gear icon)
3. Check "Use your own OAuth credentials"
4. Enter your Client ID and Client Secret
5. In Step 1, select Gmail API v1 scopes
6. Click **Authorize APIs**
7. Sign in with your Google account
8. Click **Exchange authorization code for tokens**
9. Copy the **Access Token** and **Refresh Token**

#### Option B: Implement OAuth Flow

Implement the OAuth2 flow in your application (see Developer Guide for details).

### Step 6: Add Gmail Account in Platform

1. Click **Add Email Account**
2. Select **Gmail**
3. Fill in the form:
   - **Name**: A friendly name
   - **Email Address**: Your Gmail address
   - **Client ID**: From Step 4
   - **Client Secret**: From Step 4
   - **Access Token**: From Step 5
   - **Refresh Token**: From Step 5
   - **Expires At**: Token expiration time
   - **Scopes**: The scopes you authorized
4. Click **Save**

### Troubleshooting Gmail OAuth2

**Error: "Access blocked: This app's request is invalid"**
- Make sure you added your email as a test user in the OAuth consent screen

**Error: "invalid_grant"**
- Your refresh token may have expired
- Generate a new token using OAuth Playground

**Error: "insufficient_permissions"**
- Make sure you authorized the correct scopes
- Re-authorize with the required scopes

---

## Outlook OAuth2 Setup

OAuth2 is the recommended method for connecting Outlook/Microsoft 365 accounts.

### Step 1: Register Application in Azure

1. Go to [Azure Portal](https://portal.azure.com/)
2. Navigate to **Azure Active Directory** > **App registrations**
3. Click **New registration**
4. Enter application name (e.g., "Email Automation")
5. Supported account types: **Accounts in any organizational directory and personal Microsoft accounts**
6. Redirect URI:
   - Platform: **Web**
   - URI: `http://localhost:3000/api/auth/microsoft/callback` (for development)
7. Click **Register**

### Step 2: Configure API Permissions

1. In your app, go to **API permissions**
2. Click **Add a permission**
3. Select **Microsoft Graph**
4. Select **Delegated permissions**
5. Add these permissions:
   - `Mail.Read` - Read user mail
   - `Mail.Send` - Send mail as user
   - `Mail.ReadWrite` - Read and write user mail
   - `offline_access` - Maintain access to data
6. Click **Add permissions**
7. Click **Grant admin consent** (if you're an admin)

### Step 3: Create Client Secret

1. Go to **Certificates & secrets**
2. Click **New client secret**
3. Description: "Email Automation Secret"
4. Expires: Choose expiration period
5. Click **Add**
6. **Copy the secret value immediately** - you won't be able to see it again!

### Step 4: Get Application Details

From the **Overview** page, copy:
- **Application (client) ID**
- **Directory (tenant) ID**

### Step 5: Get Access Token

You have two options:

#### Option A: Use Microsoft Graph Explorer

1. Go to [Graph Explorer](https://developer.microsoft.com/en-us/graph/graph-explorer)
2. Sign in with your Microsoft account
3. Run a query to get tokens
4. Copy the access token and refresh token

#### Option B: Implement OAuth Flow

Implement the OAuth2 flow in your application (see Developer Guide for details).

### Step 6: Add Outlook Account in Platform

1. Click **Add Email Account**
2. Select **Outlook**
3. Fill in the form:
   - **Name**: A friendly name
   - **Email Address**: Your Outlook/Microsoft 365 address
   - **Client ID**: Application (client) ID from Step 4
   - **Client Secret**: Secret value from Step 3
   - **Access Token**: From Step 5
   - **Refresh Token**: From Step 5
   - **Expires At**: Token expiration time
   - **Scopes**: The permissions you configured
4. Click **Save**

### Troubleshooting Outlook OAuth2

**Error: "AADSTS50011: The reply URL specified in the request does not match"**
- Make sure the redirect URI in your app registration matches exactly

**Error: "AADSTS65001: The user or administrator has not consented"**
- Grant admin consent for the required permissions

**Error: "invalid_client"**
- Check that your Client ID and Client Secret are correct
- Make sure the client secret hasn't expired

---

## Creating Email Templates

Email templates allow you to send personalized emails with dynamic content.

### Step 1: Create a Template

1. Navigate to **Settings** > **Email Templates**
2. Click **Create Template**
3. Fill in the form:
   - **Name**: A unique name for the template
   - **Description**: What this template is for
   - **Category**: Organize templates by category
   - **Tags**: Add tags for easy searching

### Step 2: Write Template Content

#### Subject Line

Use variables in double curly braces:

```
Welcome to {{company_name}}, {{user_name}}!
```

#### Body Content

You can create plain text, HTML, or both versions.

**Plain Text Example:**

```
Hello {{user_name}},

Welcome to {{company_name}}! We're excited to have you on board.

Your account details:
- Email: {{user_email}}
- Account ID: {{account_id}}

Best regards,
The {{company_name}} Team
```

**HTML Example:**

```html
<html>
<body>
  <h1>Hello {{user_name}}!</h1>
  <p>Welcome to <strong>{{company_name}}</strong>! We're excited to have you on board.</p>
  
  <h2>Your account details:</h2>
  <ul>
    <li>Email: {{user_email}}</li>
    <li>Account ID: {{account_id}}</li>
  </ul>
  
  <p>Best regards,<br>
  The {{company_name}} Team</p>
</body>
</html>
```

### Step 3: Define Variables

List all variables used in your template:

```
company_name
user_name
user_email
account_id
```

### Template Syntax

#### Variables

```
{{variable_name}}
```

#### Nested Variables

```
{{user.name}}
{{order.items.0.price}}
```

#### Conditionals

```
{{#if premium_user}}
  You have access to premium features!
{{/if}}
```

#### Loops

```
{{#each items}}
  - {{this.name}}: ${{this.price}}
{{/each}}
```

#### Helper Functions

```
{{formatDate order_date "MMMM DD, YYYY"}}
{{formatNumber total_amount "currency"}}
{{uppercase user_name}}
```

### Step 4: Test Your Template

1. Click **Preview**
2. Enter sample data for variables
3. Review the rendered output
4. Make adjustments as needed

### Step 5: Save Template

Click **Save** to store your template. You can now use it in email workflows!

---

## Using Filter Rules

Filter rules help you process only relevant emails in your workflows.

### Creating Filter Rules

1. In your workflow, add an **Email Filter Node**
2. Click **Configure Filters**
3. Add filter criteria

### Filter Types

#### Sender Filter

Match emails from specific senders:

```
Exact match: john@example.com
Domain match: @example.com
Regex pattern: .*@(gmail|yahoo)\.com
```

#### Subject Filter

Match emails by subject:

```
Contains: "invoice"
Starts with: "RE:"
Regex pattern: Invoice #\d+
```

#### Date Filter

Match emails by date:

```
After: 2024-01-01
Before: 2024-12-31
Between: 2024-01-01 and 2024-06-30
Last 7 days
Last 30 days
```

#### Attachment Filter

Match emails with attachments:

```
Has attachment: true
File type: .pdf
Filename pattern: invoice-*.pdf
Size range: 1MB - 10MB
```

#### Content Filter

Match emails by body content:

```
Contains: "urgent"
Regex pattern: \b(urgent|important|asap)\b
```

#### Label/Category Filter

**Gmail:**
```
Labels: INBOX, IMPORTANT, CATEGORY_PERSONAL
```

**Outlook:**
```
Categories: Red category, Work, Personal
```

### Combining Filters

Use AND/OR logic to combine multiple filters:

**AND Logic** (all conditions must match):
```
Sender: @example.com
AND Subject contains: "invoice"
AND Has attachment: true
```

**OR Logic** (any condition can match):
```
Subject contains: "urgent"
OR Subject contains: "important"
OR Sender: boss@example.com
```

### Filter Examples

#### Example 1: Customer Support Emails

```
Sender domain: @customer.com
OR Subject contains: "support"
OR Subject contains: "help"
AND NOT Subject contains: "unsubscribe"
```

#### Example 2: Invoice Processing

```
Subject matches: Invoice #\d+
AND Has attachment: true
AND Attachment type: .pdf
AND Date: Last 30 days
```

#### Example 3: High Priority Emails

```
(Sender: boss@example.com OR Sender: client@example.com)
AND (Subject contains: "urgent" OR Importance: High)
AND Date: Last 7 days
```

---

## Best Practices

### Security

1. **Use OAuth2** when possible instead of passwords
2. **Enable 2-factor authentication** on your email accounts
3. **Use app passwords** for IMAP/SMTP with 2FA enabled
4. **Rotate credentials** regularly
5. **Don't share** email account credentials

### Performance

1. **Use filters** to process only relevant emails
2. **Set batch sizes** appropriately (50-100 emails per batch)
3. **Use date ranges** to limit email retrieval
4. **Enable lazy loading** for attachments
5. **Monitor rate limits** to avoid API throttling

### Organization

1. **Name accounts clearly** (e.g., "Support Gmail", "Sales Outlook")
2. **Categorize templates** for easy finding
3. **Use tags** to organize templates
4. **Document workflows** with comments
5. **Test workflows** before production use

### Reliability

1. **Handle errors gracefully** in workflows
2. **Set up retry logic** for failed operations
3. **Monitor email logs** for issues
4. **Keep OAuth tokens fresh** with automatic refresh
5. **Test with sample data** before live use

---

## Troubleshooting

### Connection Issues

**Problem:** "Connection timeout" or "Unable to connect"

**Solutions:**
- Check server address and port number
- Verify firewall isn't blocking the connection
- Ensure SSL/TLS settings are correct
- Try using a different network

**Problem:** "Authentication failed"

**Solutions:**
- Verify username and password are correct
- Use app password if 2FA is enabled
- Check if IMAP/POP3 is enabled in email settings
- Ensure account isn't locked or suspended

### OAuth2 Issues

**Problem:** "Token expired" or "invalid_grant"

**Solutions:**
- Refresh the access token using the refresh token
- Re-authorize the application
- Check token expiration time
- Verify OAuth credentials are correct

**Problem:** "Insufficient permissions"

**Solutions:**
- Check required scopes are authorized
- Re-authorize with correct scopes
- Verify API is enabled (Gmail API, Microsoft Graph)
- Check admin consent is granted (for Outlook)

### Email Retrieval Issues

**Problem:** "No emails found"

**Solutions:**
- Check filter criteria aren't too restrictive
- Verify folder/mailbox name is correct
- Check date range includes expected emails
- Ensure account has emails in the specified folder

**Problem:** "Rate limit exceeded"

**Solutions:**
- Reduce batch size
- Add delays between requests
- Use date filters to limit email count
- Check provider's rate limits

### Template Issues

**Problem:** "Variable not found" or empty values

**Solutions:**
- Check variable names match exactly (case-sensitive)
- Verify input data contains all required variables
- Use fallback values for optional variables
- Test template with sample data

**Problem:** "Template rendering failed"

**Solutions:**
- Check template syntax is correct
- Verify conditional blocks are properly closed
- Test with simple template first
- Check for special characters that need escaping

### General Issues

**Problem:** "Decryption failed"

**Solutions:**
- Check EMAIL_ENCRYPTION_KEY environment variable is set
- Verify encryption key hasn't changed
- Re-create the email account if key was rotated
- Contact administrator for key issues

**Problem:** "Database error"

**Solutions:**
- Check internet connection
- Verify Supabase project is active
- Check database tables exist
- Review error logs for details

---

## Getting Help

If you need additional assistance:

1. **Check the API Documentation** for technical details
2. **Review the Developer Guide** for implementation help
3. **Search the knowledge base** for common issues
4. **Contact support** with error logs and details
5. **Join the community forum** for peer help

---

## Next Steps

Now that you know how to use Email Processing Nodes:

1. **Connect your first email account**
2. **Create a simple template**
3. **Build a basic workflow** to test
4. **Explore advanced features** like filters and parsing
5. **Automate your email processes**!

Happy automating! 🚀
