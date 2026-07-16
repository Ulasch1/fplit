-- CreateEnum
CREATE TYPE "InviteLinkStatus" AS ENUM ('PENDING', 'ACTIVE', 'EXPIRED');

-- CreateTable
CREATE TABLE "invite_links" (
    "id" TEXT NOT NULL,
    "group_id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "status" "InviteLinkStatus" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "activated_at" TIMESTAMP(3),

    CONSTRAINT "invite_links_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "invite_links_token_key" ON "invite_links"("token");

-- AddForeignKey
ALTER TABLE "invite_links" ADD CONSTRAINT "invite_links_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;
