# Invitations

An admin types a name, an email and a role in **Admin → Users → Invites**. The
person gets an email, picks their own password, and lands in the portal with
that role. Nobody is created by hand in the Firebase console any more.

## What happens, in order

1. The server writes the invite and a one-time token. Only the token's **hash**
   is stored, so this database cannot be read to let someone in.
2. It emails the link: `https://franchise.tropicaljuicebar.com/invite/<token>`.
3. The person opens it, sets a password. **Firebase** takes the password; it
   never reaches this server, which has no way to store one.
4. The page hands the server the token from the link and the token Firebase just
   issued. Both must name the same address. Only then is the `users` row written,
   and that row is what every other screen checks.

The link works once and expires in **7 days**. Accepting clears the stored hash,
so a forwarded email is worth nothing afterwards.

## Nothing in DNS changes

Mail goes out over SMTP as a Google Workspace user that already exists. No SPF,
DKIM or MX record is added or edited, which matters because those records carry
the company's email. See the warning in `deploy.md`.

## The one setting to make

Google refuses a plain password over SMTP, so the account needs an **app
password** — a 16-character code that works for this one purpose and can be
revoked on its own.

1. Pick the Workspace account the mail should come from. A shared address such
   as `portal@tropicaljuicebar.com` is better than a person's: it survives them
   leaving, and the replies go somewhere sensible.
2. That account needs **2-Step Verification** on: myaccount.google.com →
   Security. Without it there is no app password option.
3. Same page → **App passwords** → name it "franchise portal" → copy the code.
4. On the VPS, in `/opt/portal/.env`:

   ```
   PORTAL_SMTP_HOST=smtp.gmail.com
   PORTAL_SMTP_PORT=465
   PORTAL_SMTP_USER=portal@tropicaljuicebar.com
   PORTAL_SMTP_PASSWORD=<the 16 characters, no spaces>
   PORTAL_MAIL_FROM=portal@tropicaljuicebar.com
   ```

5. `docker compose up -d` to pick it up.

If **App passwords** is missing from that page, a Workspace admin has turned off
"Less secure app access" for the organisation. admin.google.com → Security →
Access and data control → **Less secure apps**, allow it for that one account's
organisational unit, not for everyone.

## If mail is not set up

Nothing breaks. The invite is still created and the portal shows the admin the
link with a **Copy link** button, to send however they like. That is also what
happens if Google is down or the password is wrong, so an outage never blocks
adding a person.

## Turning someone off

Admin → Users → set them inactive. Their Firebase login still exists but the
portal refuses it, which is the same line every other route checks. Deleting the
Firebase account is a separate step in the Firebase console, and only matters if
you want the address freed up.

## What this does not do

- **No TOTP enrolment.** If `PORTAL_REQUIRE_TOTP` is ever turned on, a newly
  invited person will be asked to enrol on their first sign-in. Accepting an
  invite is deliberately exempt: the account is minutes old and cannot have
  enrolled yet.
- **No password reset.** If someone forgets theirs, the Firebase console sends a
  reset email: Authentication → Users → ⋮ → Reset password.
