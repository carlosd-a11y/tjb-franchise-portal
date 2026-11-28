"""
Sending the invitation.

Plain SMTP against the company's Google Workspace account, so the message comes
from a real tropicaljuicebar.com address and no DNS record anywhere has to
change. See docs/invites.md.

Mail is best effort on purpose: if it is not configured, or the provider is
having a bad morning, the invite is still created and the portal shows the admin
the link to send by hand. An outage should not block adding a person.
"""

import os
import smtplib
import ssl
from email.message import EmailMessage
from email.utils import formataddr

SUBJECT = "Your Tropical Juice Bar location portal account"

BODY = """\
Hi {name},

You have been invited to the Tropical Juice Bar location portal, where we keep
the sites we are looking at for new stores.

Set your password and sign in here:

{link}

The link works once and expires in {days} days. If it has expired, reply to this
message and we will send another.

Tropical Juice Bar
"""


class MailNotConfigured(Exception):
    """No SMTP settings, so there is nothing to send with."""


def settings() -> dict:
    host = os.environ.get("PORTAL_SMTP_HOST", "").strip()
    user = os.environ.get("PORTAL_SMTP_USER", "").strip()
    password = os.environ.get("PORTAL_SMTP_PASSWORD", "").strip()
    if not (host and user and password):
        raise MailNotConfigured("Email is not set up on the server.")
    return {
        "host": host,
        "port": int(os.environ.get("PORTAL_SMTP_PORT", "465")),
        "user": user,
        "password": password,
        "sender": os.environ.get("PORTAL_MAIL_FROM", "").strip() or user,
        "sender_name": os.environ.get("PORTAL_MAIL_FROM_NAME", "").strip() or "Tropical Juice Bar",
    }


def configured() -> bool:
    try:
        settings()
    except MailNotConfigured:
        return False
    return True


def build(to_address: str, name: str, link: str, days: int, config: dict) -> EmailMessage:
    message = EmailMessage()
    message["Subject"] = SUBJECT
    message["From"] = formataddr((config["sender_name"], config["sender"]))
    message["To"] = to_address
    message.set_content(BODY.format(name=name, link=link, days=days))
    return message


def send_invite(to_address: str, name: str, link: str, days: int, sender=None) -> None:
    """Raises MailNotConfigured, or whatever smtplib raises, for the caller to report."""
    config = settings()
    message = build(to_address, name, link, days, config)
    (sender or _smtp)(message, config)


def _smtp(message: EmailMessage, config: dict) -> None:
    context = ssl.create_default_context()
    if config["port"] == 587:
        with smtplib.SMTP(config["host"], config["port"], timeout=20) as server:
            server.starttls(context=context)
            server.login(config["user"], config["password"])
            server.send_message(message)
        return
    with smtplib.SMTP_SSL(config["host"], config["port"], timeout=20, context=context) as server:
        server.login(config["user"], config["password"])
        server.send_message(message)
