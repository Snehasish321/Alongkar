-- CreateIndex
CREATE UNIQUE INDEX "SavedAddress_userId_default_key"
ON "SavedAddress" ("userId")
WHERE "isDefault" = true;
