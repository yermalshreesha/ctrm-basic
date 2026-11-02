-- AlterEnum
ALTER TYPE "TradeStatus" ADD VALUE 'PENDING_APPROVAL';

-- AlterTable
ALTER TABLE "Trade" ADD COLUMN     "approvedAt" TIMESTAMP(3);
