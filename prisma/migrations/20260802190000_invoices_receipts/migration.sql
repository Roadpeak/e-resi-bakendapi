-- New notification types. Added separately from their first use so the values
-- are committed before any row references them.
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'INVOICE_ISSUED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'INVOICE_REMINDER';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'RECEIPT_ISSUED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'PAYMENT_METHOD_UPDATED';
