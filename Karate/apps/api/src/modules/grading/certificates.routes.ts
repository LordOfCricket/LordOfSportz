import { Router } from "express";
import { verificationCodeParamsSchema } from "@karate/validation";
import { validate } from "../../middleware/validate";
import { verifyCertificateHandler } from "./certificates.controller";

export const certificatesRouter = Router();

// Deliberately unauthenticated — QR/code verification must work for anyone holding the code.
certificatesRouter.get(
  "/verify/:code",
  validate(verificationCodeParamsSchema, "params"),
  verifyCertificateHandler,
);
