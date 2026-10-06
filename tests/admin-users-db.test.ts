import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const state = vi.hoisted(() => ({ db: null as unknown as PrismaClient, session: null as null | { user: { id: string; email: string } } }));
vi.mock("@/lib/prisma", () => ({ get prisma() { return state.db; } }));
vi.mock("@/lib/get-session", () => ({ getSession: async () => state.session }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn(), updateTag: vi.fn() }));

import { createUserByAdmin } from "@/src/server/services/admin/actions";
import { changePassword } from "@/src/server/services/users/mutations";

const connection = process.env.ZENEX_TEST_DATABASE_URL;
describe.runIf(!!connection)("accounts created by an administrator", () => {
  beforeAll(() => {
    const url = new URL(connection!);
    if (!["127.0.0.1", "localhost"].includes(url.hostname) || url.pathname !== "/zenex_integration_test") throw new Error("Tests require the dedicated local zenex_integration_test database");
    state.db = new PrismaClient({ adapter: new PrismaPg(new Pool({ connectionString: connection, max: 3 })) });
    process.env.ADMIN_EMAILS = "admin@zenex-admin.test";
  });
  beforeEach(async () => {
    await state.db.user.deleteMany({ where: { email: { endsWith: "@zenex-admin.test" } } });
    const admin = await state.db.user.create({ data: { email: "admin@zenex-admin.test" } });
    state.session = { user: { id: admin.id, email: admin.email } };
  });
  afterAll(async () => {
    if (state.db) {
      await state.db.user.deleteMany({ where: { email: { endsWith: "@zenex-admin.test" } } });
      await state.db.$disconnect();
    }
  });

  it("creates an account with a generated password the person can change", async () => {
    const created = await createUserByAdmin({ email: " Friend@Zenex-Admin.test ", name: "Friend", plan: "subscription" });
    expect(created).toMatchObject({ email: "friend@zenex-admin.test" });
    const password = "password" in created ? created.password! : "";
    expect(password).toMatch(/^[A-Za-z0-9]{5}-[A-Za-z0-9]{5}-[A-Za-z0-9]{5}$/);
    const user = await state.db.user.findUniqueOrThrow({ where: { email: "friend@zenex-admin.test" } });
    expect(user).toMatchObject({ name: "Friend", plan: "subscription", onboardingCompleted: false });
    expect(await bcrypt.compare(password, user.password!)).toBe(true);

    expect(await createUserByAdmin({ email: "FRIEND@zenex-admin.test" })).toMatchObject({ error: "An account with this email already exists" });
    expect(await createUserByAdmin({ email: "short@zenex-admin.test", password: "1234" })).toMatchObject({ error: "Use at least 8 characters" });

    state.session = { user: { id: user.id, email: user.email } };
    expect(await createUserByAdmin({ email: "other@zenex-admin.test" })).toMatchObject({ error: "Only administrators can do this" });
    expect(await changePassword({ currentPassword: "wrong-one", newPassword: "a-new-password" })).toMatchObject({ error: "Your current password isn’t right" });
    expect(await changePassword({ currentPassword: password, newPassword: "a-new-password" })).toEqual({ success: true });
    const changed = await state.db.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(await bcrypt.compare("a-new-password", changed.password!)).toBe(true);
  });

  it("lets an account without a password set its first one", async () => {
    const github = await state.db.user.create({ data: { email: "github@zenex-admin.test" } });
    state.session = { user: { id: github.id, email: github.email } };
    expect(await changePassword({ newPassword: "first-password" })).toEqual({ success: true });
  });
});
