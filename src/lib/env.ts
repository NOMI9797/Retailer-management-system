import { z } from "zod";

// Fails the build/boot immediately with a clear message when a
// required env var is missing or malformed, instead of surfacing as
// a confusing runtime error later (e.g. a cryptic Prisma connection
// failure, or session.ts throwing deep inside a request). Imported
// once from a server-only entry point — see instrumentation.ts.
const envSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  SESSION_SECRET: z.string().min(32, "SESSION_SECRET must be at least 32 characters"),
});

export const env = envSchema.parse(process.env);
