// Shared setup for API tests. They run against a separate database whose name ends in "_test", and refuse
// anything else so a test run can never touch real data. Import this before the app.
import fs from "fs";
import os from "os";
import path from "path";

const url = process.env.DATABASE_URL ?? "";
if (!/_test(\?|$)/.test(url)) {
  throw new Error(`Refusing to run: DATABASE_URL must point at a database ending in "_test" (got "${url.replace(/\/\/[^@]*@/, "//***@")}")`);
}

// A stand-in client build, so static serving and deep links are exercised too.
export const clientDist = fs.mkdtempSync(path.join(os.tmpdir(), "portal-client-"));
fs.writeFileSync(path.join(clientDist, "index.html"), "<!doctype html><title>portal</title>");
process.env.CLIENT_DIST = clientDist;

import { EmailEvent } from "@prisma/client";
import { prisma } from "../lib/prisma";

export async function resetDb() {
  await prisma.$executeRawUnsafe('TRUNCATE "Application" RESTART IDENTITY CASCADE');
  for (const number of [1, 2, 3, 4]) {
    await prisma.wave.upsert({ where: { number }, update: { targetStartDate: null, targetDate: null, proposedTargetDate: null }, create: { number } });
  }
  for (const event of Object.values(EmailEvent)) {
    await prisma.emailTemplate.upsert({
      where: { event },
      update: { subject: `[{{appName}}] ${event}`, bodyHtml: "<p>{{stage}} {{reason}}</p>" },
      create: { event, subject: `[{{appName}}] ${event}`, bodyHtml: "<p>{{stage}} {{reason}}</p>" },
    });
  }
}

export const days = (n: number) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
