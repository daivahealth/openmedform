-- CreateTable
CREATE TABLE "form_ai_message" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "form_id" UUID NOT NULL,
    "role" VARCHAR(20) NOT NULL,
    "content" TEXT NOT NULL,
    "provider" VARCHAR(50),
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "form_ai_message_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "form_ai_message_tenant_id_form_id_idx" ON "form_ai_message"("tenant_id", "form_id");

-- AddForeignKey
ALTER TABLE "form_ai_message" ADD CONSTRAINT "form_ai_message_form_id_fkey" FOREIGN KEY ("form_id") REFERENCES "form"("id") ON DELETE CASCADE ON UPDATE CASCADE;
