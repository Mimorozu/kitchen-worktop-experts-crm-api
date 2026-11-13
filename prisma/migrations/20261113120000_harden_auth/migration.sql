-- Auth hardening: email verification, password reset, login lockout, session revocation.
ALTER TABLE "User"
  ADD COLUMN "emailVerified" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "verifyTokenHash" TEXT,
  ADD COLUMN "verifyExpiresAt" TIMESTAMP(3),
  ADD COLUMN "resetTokenHash" TEXT,
  ADD COLUMN "resetExpiresAt" TIMESTAMP(3),
  ADD COLUMN "failedLogins" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "lockedUntil" TIMESTAMP(3),
  ADD COLUMN "tokenVersion" INTEGER NOT NULL DEFAULT 0;

-- Accounts that already exist keep access; only new accounts need verification.
UPDATE "User" SET "emailVerified" = true;
