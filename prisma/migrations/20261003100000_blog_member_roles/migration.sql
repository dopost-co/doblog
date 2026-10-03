-- Roles for people invited to a blog (lib/permissions.ts). Everyone already
-- invited keeps what they could do before: read and write content.
ALTER TABLE "BlogMember" ADD COLUMN "role" TEXT NOT NULL DEFAULT 'member';
ALTER TABLE "BlogMember" ADD CONSTRAINT "BlogMember_role_check" CHECK ("role" IN ('viewer', 'member', 'admin'));
