// A verified sender and API key are required in production. Tokens never appear in API responses.
export async function sendResetEmail({ to, link }) {
  const key = process.env.RESEND_API_KEY, from = process.env.RESET_FROM_EMAIL;
  if (!key || !from) throw Error("Password recovery email is not configured.");
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: [to], subject: "Reset your Shopkeeper password", text: `A password reset was requested for your Shopkeeper account. Open this link within 30 minutes: ${link}\n\nIf you did not request this, ignore this message.` }),
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw Error("Password recovery email could not be sent.");
}
