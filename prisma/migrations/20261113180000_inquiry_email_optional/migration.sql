-- Contact-reveal leads capture a phone number only.
ALTER TABLE "Inquiry" ALTER COLUMN "email" DROP NOT NULL;
