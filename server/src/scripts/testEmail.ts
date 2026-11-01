// Checks the mail settings and sends one message. Touches no application data.
//   docker compose exec server npm run email:test -- you@example.com
import { transport } from "../lib/mailer";

async function main() {
  const to = process.argv[2];
  if (!to) throw new Error("Usage: npm run email:test -- you@example.com");

  console.log(`Server: ${process.env.SMTP_HOST}:${process.env.SMTP_PORT}  User: ${process.env.SMTP_USER || "(none)"}  From: ${process.env.EMAIL_FROM}`);
  console.log(`Redirect: ${process.env.EMAIL_REDIRECT_TO?.trim() || "off"}`);
  await transport.verify();
  console.log("Connection and login OK.");
  const info = await transport.sendMail({
    from: process.env.EMAIL_FROM,
    to,
    subject: "Harness Migration Portal: test email",
    html: "<p>This is a test from the Harness Migration Portal. Email is working.</p>",
  });
  console.log(`Sent to ${to}. Accepted: ${info.accepted.join(", ") || "none"}. Rejected: ${info.rejected.join(", ") || "none"}.`);
}

main().catch((err) => {
  console.error(`FAILED: ${err.message}`);
  if (err.code === "EAUTH") console.error("Gmail needs an App Password (not your normal password), with 2-Step Verification on.");
  process.exit(1);
});
