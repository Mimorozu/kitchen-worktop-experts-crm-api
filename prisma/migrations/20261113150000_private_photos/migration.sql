-- Lead photos: delivery type (legacy public or private) and detected file format.
ALTER TABLE "Photo"
  ADD COLUMN "delivery" TEXT NOT NULL DEFAULT 'upload',
  ADD COLUMN "format" TEXT;
