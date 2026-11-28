/**
 * The invitation link, before anyone has an account.
 *
 * Everything else in the portal talks to the server with a signed-in token.
 * These two calls cannot: the first runs before sign-in, and the second runs
 * seconds after the account is created, to turn it into a portal account.
 */

async function body(response: Response) {
  const parsed = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error((parsed as { error?: string }).error || "That link did not work.");
  return parsed;
}

export type InviteDetails = { email: string; name: string };

/** Who the invitation is for, so the page can greet them and fill the address. */
export async function readInvite(token: string): Promise<InviteDetails> {
  return (await body(await fetch(`/api/invites/accept/${encodeURIComponent(token)}`))) as InviteDetails;
}

/** Exchanges the link plus a fresh Firebase token for portal access. */
export async function acceptInvite(token: string, idToken: string): Promise<void> {
  await body(
    await fetch("/api/invites/accept", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
      body: JSON.stringify({ token }),
    }),
  );
}
