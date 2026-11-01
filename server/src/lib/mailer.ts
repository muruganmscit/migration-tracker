import nodemailer from "nodemailer";

const port = Number(process.env.SMTP_PORT || 587);

export const transport = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port,
  secure: port === 465,
  // Credentials must never travel unencrypted, so a mail server that won't upgrade the connection is refused.
  requireTLS: !!process.env.SMTP_USER && port !== 465,
  auth: process.env.SMTP_USER
    ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
    : undefined,
});

export async function sendMail(to: string[], subject: string, html: string) {
  if (to.length === 0) {
    throw new Error("No recipients configured for this application");
  }
  // Test mode: everything goes to one address, and the subject says who would have received it.
  const redirect = process.env.EMAIL_REDIRECT_TO?.trim();
  await transport.sendMail({
    from: process.env.EMAIL_FROM,
    to: redirect || to,
    subject: redirect ? `[TEST for ${to.join(", ")}] ${subject}` : subject,
    html,
  });
}
