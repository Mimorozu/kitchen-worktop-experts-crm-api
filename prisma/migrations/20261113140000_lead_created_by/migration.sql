-- Leads record the staff member who created them. Website leads have no creator, so userId may be null.
ALTER TABLE "Lead" ALTER COLUMN "userId" DROP NOT NULL;
