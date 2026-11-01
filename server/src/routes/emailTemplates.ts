import { Router } from "express";
import { EmailEvent } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { ACTIVE_EMAIL_EVENTS } from "../lib/workflow";

export const emailTemplatesRouter = Router();

// Workflow order: the enum's declaration order, which keeps cards stable after a save.
const ORDER = Object.values(EmailEvent);

emailTemplatesRouter.get("/", async (_req, res) => {
  // Only templates the workflow sends. Others stay stored, with any custom wording, in case they return.
  const templates = await prisma.emailTemplate.findMany({ where: { event: { in: ACTIVE_EMAIL_EVENTS } } });
  res.json(templates.sort((a, b) => ORDER.indexOf(a.event) - ORDER.indexOf(b.event)));
});

emailTemplatesRouter.patch("/:event", async (req, res) => {
  const event = req.params.event as EmailEvent;
  if (!ORDER.includes(event)) return res.status(404).json({ error: "Unknown email event" });
  const { subject, bodyHtml } = req.body;
  const template = await prisma.emailTemplate.update({ where: { event }, data: { subject, bodyHtml } });
  res.json(template);
});
