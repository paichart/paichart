-- AlterTable
ALTER TABLE "User" ADD COLUMN     "avatar_url" TEXT,
ADD COLUMN     "last_login_at" TIMESTAMP(3),
ADD COLUMN     "oauth_provider" TEXT,
ADD COLUMN     "oauth_provider_id" TEXT,
ADD COLUMN     "organization_domain" TEXT,
ALTER COLUMN "password" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "User_oauth_provider_idx" ON "User"("oauth_provider", "oauth_provider_id");

-- CreateIndex
CREATE INDEX "User_org_domain_idx" ON "User"("organization_domain");

-- CreateIndex
CREATE INDEX "User_email_oauth_idx" ON "User"("email", "oauth_provider");
