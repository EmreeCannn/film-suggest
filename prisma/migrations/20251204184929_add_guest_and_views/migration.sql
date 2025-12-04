/*
  Warnings:

  - You are about to drop the `GuestUsage` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "GuestViewedMovie" DROP CONSTRAINT "GuestViewedMovie_guestId_fkey";

-- DropForeignKey
ALTER TABLE "UserViewedMovie" DROP CONSTRAINT "UserViewedMovie_userId_fkey";

-- DropIndex
DROP INDEX "GuestViewedMovie_guestId_idx";

-- DropIndex
DROP INDEX "UserViewedMovie_userId_idx";

-- DropTable
DROP TABLE "GuestUsage";

-- CreateTable
CREATE TABLE "Guest" (
    "id" TEXT NOT NULL,
    "dailyCount" INTEGER NOT NULL DEFAULT 0,
    "lastReset" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Guest_pkey" PRIMARY KEY ("id")
);
