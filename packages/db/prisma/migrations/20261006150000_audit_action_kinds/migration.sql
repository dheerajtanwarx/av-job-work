-- Automatic challan notes were logged as "update"; give them their own kinds so the change log's
-- "Edits & voids" view only shows changes a person made.
UPDATE "AuditLog" SET "action" = 'settlement'
  WHERE "entity" = 'Job' AND "action" = 'update'
    AND ("summary" ILIKE 'Final settlement % cancelled%' OR "summary" ILIKE 'Final settlement % re-issued%' OR "summary" ILIKE '%fully paid – final settlement%' OR "summary" ILIKE '%fully paid – main bill%' OR "summary" ILIKE 'Main bill %');
UPDATE "AuditLog" SET "action" = 'rate'
  WHERE "entity" = 'Job' AND "action" = 'update' AND "summary" ~ '^RET-[0-9]+: .* received at ₹[0-9.,]+ \(challan rate ₹[0-9.,]+\)$';
