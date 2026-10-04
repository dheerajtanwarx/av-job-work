-- A retried "Record return" submit (e.g. after a network drop) must not create a second return.
ALTER TABLE "Return" ADD COLUMN "idempotencyKey" TEXT;
CREATE UNIQUE INDEX "Return_idempotencyKey_key" ON "Return"("idempotencyKey");
