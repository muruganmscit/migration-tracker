// Shared setup for API tests. They run against a separate database whose name ends in "_test", and refuse
// anything else so a test run can never touch real data. Import this before the app.
import fs from "fs";
import os from "os";
import path from "path";

// Tests never touch a real database or mail server: Prisma is replaced by an in-memory mock (prismock,
// built from schema.prisma), and email goes to a transport that only records messages.
process.env.EMAIL_TRANSPORT = "memory";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { PrismockClient } = require("prismock");
const mockPrisma = new PrismockClient();
require.cache[require.resolve("../lib/prisma")] = { exports: { prisma: mockPrisma } } as NodeModule;

// A stand-in client build, so static serving and deep links are exercised too.
export const clientDist = fs.mkdtempSync(path.join(os.tmpdir(), "portal-client-"));
fs.writeFileSync(path.join(clientDist, "index.html"), "<!doctype html><title>portal</title>");
process.env.CLIENT_DIST = clientDist;

import { EmailEvent } from "@prisma/client";
import { prisma } from "../lib/prisma";

// Stop before any test runs if the app would reach a real database instead of the mock.
if (prisma !== mockPrisma) throw new Error("Refusing to run: the Prisma mock is not in place");

export async function resetDb() {
  mockPrisma.reset();
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
