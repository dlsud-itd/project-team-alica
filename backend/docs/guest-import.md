# Guest account import

## Endpoint

`POST /api/v1/events/:eventId/guests/import-users` (the application has the
`/api/v1` global prefix).

The caller must send a bearer token for an `ORGANIZER` who owns the event, or
an `ADMIN`. The request is `multipart/form-data`:

| Field                | Required | Description                                                       |
| -------------------- | -------- | ----------------------------------------------------------------- |
| `file`               | yes      | One `.csv` or `.xlsx` file, at most 5 MiB                         |
| `includeCredentials` | no       | `true` to request debug credentials; otherwise omitted or `false` |

The first worksheet (or CSV header row) must contain `First Name`, `Last Name`,
and `Email`. `Affiliation` is optional. Header matching ignores case and
surrounding whitespace. Empty rows are ignored; up to 5,000 data rows are
accepted. Names, affiliation, and emails are length-checked, and email syntax
is validated before insertion.

Emails are trimmed, lowercased, checked case-insensitively against existing
accounts, and de-duplicated within the upload. Invalid rows and duplicates are
returned in `data.skipped` with their 1-based source row and a reason. The
database unique constraint remains the final concurrency guard.

## Account and invitation behavior

Every created account is inserted into `users` with an `usr-guest-<UUID>` ID,
an individual 10-character cryptographically generated alphanumeric password,
its bcrypt hash (cost 10), role `ATTENDEE`, `studentId: null`, active status,
and `mustChangePassword: true`. Empty affiliation values become
`Guest / Imported Attendee`. Temporary passwords are distinct within one import. Creating a user and their
event ticket is a single nested database write, so an imported attendee is
registered for the selected event immediately. The ticket is a `REGULAR`
`REGISTERED` ticket with a unique ticket code and matching QR payload, and
capacity is checked before each account/ticket is created. The plaintext
password is held only in request memory for mail delivery and, when explicitly
enabled, the response; it is never logged or stored in PostgreSQL.

One invitation email is sent per inserted account, including their event
ticket code and the matching QR code as an inline PNG image attachment. The
email also preserves a plain-text copy of the credentials and ticket details.
A mail delivery failure does not undo the created account or its
registration; `emailStatus`, `emailFailures`, and the summary make partial
delivery explicit. An SMTP configuration check is
performed before inserts when there are new accounts to create.

Successful login returns `user.mustChangePassword`. While it is true, the JWT
guard denies other guarded API routes. The guest can only reach
`POST /api/v1/auth/change-password` until they submit their current and new
password; that endpoint stores a bcrypt hash and clears the flag.

## Debug credential response

Plaintext credentials are opt-in and intended only for controlled local
development/testing. Set `GUEST_IMPORT_DEBUG_CREDENTIALS=true`, set
`NODE_ENV` to `development` or `test`, and send `includeCredentials=true`.
Any other `NODE_ENV` (including production and staging) disables this
response. The endpoint sets `Cache-Control: no-store`.

Example success response (credentials are included only when requested and
both server safeguards pass):

```json
{
  "success": true,
  "data": {
    "created": [
      {
        "id": "usr-guest-<uuid>",
        "email": "guest@example.org",
        "fullName": "Alex Guest",
        "ticketId": "<ticket-uuid>",
        "ticketCode": "CHK-<uuid>",
        "emailStatus": "SENT"
      }
    ],
    "skipped": [
      {
        "row": 4,
        "email": "already@example.org",
        "reason": "email_already_registered"
      }
    ],
    "emailFailures": [],
    "summary": { "created": 1, "skipped": 1, "emailFailures": 0 },
    "credentials": [
      { "email": "guest@example.org", "temporaryPassword": "a1B2c3D4e5" }
    ]
  }
}
```

`credentials` is absent, not an empty secret-bearing placeholder, when debug
disclosure was not requested. Never enable the flag in shared, staging, or
production environments.

## Configuration and database rollout

For Gmail, enable 2-Step Verification on the sending Google account and create
a Google App Password from its Security settings. Use the generated app
password, not the account's normal password. Configure `backend/.env` using
the mail variable names supported by this project (never commit or paste the
app password):

```dotenv
MAIL_DRIVER=smtp
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-account@gmail.com
SMTP_PASS=your-16-character-app-password
SMTP_FROM=your-account@gmail.com
GUEST_IMPORT_DEBUG_CREDENTIALS=false
```

The mailer also accepts the aliases `SMTP_PASSWORD` and `MAIL_FROM`, and
supports Gmail's `MAIL_DRIVER=gmail` preset when host/port are not provided.
For other SMTP providers, set their host, port, user, and password. Use port
465 with `SMTP_SECURE=true` or port 587 with `SMTP_SECURE=false`. Before
writing any new accounts or tickets, the backend verifies the configured
server and credentials. If verification fails, the import is rejected without
creating records.

After updating `prisma/schema.prisma`, regenerate the client and apply the
schema using the project's existing Prisma workflow:

```bash
npm run db:generate --prefix backend
npm run db:push --prefix backend
```

## Validation and delivery checklist

1. Upload a CSV and an XLSX with the required headers; verify rows, normalized
   addresses, affiliation defaults, and `mustChangePassword`.
2. Include invalid addresses, missing names, duplicate rows, and existing
   accounts; verify each is reported and no duplicate account is inserted.
3. Verify created users contain distinct bcrypt hashes and that
   `bcrypt.compare(temporaryPassword, passwordHash)` succeeds.
4. Verify one personalized email is sent per inserted account and mail errors
   are reported without claiming successful delivery.
5. Verify the login response sets `mustChangePassword`, guarded routes reject
   that user, and the change-password endpoint clears the requirement.
6. Verify credentials are absent by default, available only in `development`
   or `test` when the opt-in flag is true, and denied for other environments.
