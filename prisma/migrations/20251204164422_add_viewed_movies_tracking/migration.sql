-- AlterTable
ALTER TABLE "User" ADD COLUMN     "dailyCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "lastResetDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateTable
CREATE TABLE "GuestUsage" (
    "id" TEXT NOT NULL,
    "ip" TEXT NOT NULL,
    "dailyCount" INTEGER NOT NULL DEFAULT 0,
    "lastResetDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GuestUsage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserViewedMovie" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "movieId" INTEGER NOT NULL,
    "viewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserViewedMovie_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GuestViewedMovie" (
    "id" TEXT NOT NULL,
    "guestId" TEXT NOT NULL,
    "movieId" INTEGER NOT NULL,
    "viewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GuestViewedMovie_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GuestUsage_ip_key" ON "GuestUsage"("ip");

-- CreateIndex
CREATE INDEX "UserViewedMovie_userId_idx" ON "UserViewedMovie"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "UserViewedMovie_userId_movieId_key" ON "UserViewedMovie"("userId", "movieId");

-- CreateIndex
CREATE INDEX "GuestViewedMovie_guestId_idx" ON "GuestViewedMovie"("guestId");

-- CreateIndex
CREATE UNIQUE INDEX "GuestViewedMovie_guestId_movieId_key" ON "GuestViewedMovie"("guestId", "movieId");

-- AddForeignKey
ALTER TABLE "UserViewedMovie" ADD CONSTRAINT "UserViewedMovie_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuestViewedMovie" ADD CONSTRAINT "GuestViewedMovie_guestId_fkey" FOREIGN KEY ("guestId") REFERENCES "GuestUsage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
