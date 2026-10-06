"use server";

import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { hashPassword } from "@/lib/auth";
import { getSession } from "@/lib/get-session";
import { z } from "zod";

const signUpSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().optional(),
});

export async function signUp(data: {
  email: string;
  password: string;
  name?: string;
}) {
  try {
    const validated = signUpSchema.parse(data);

    const existingUser = await prisma.user.findUnique({
      where: { email: validated.email },
    });

    if (existingUser) {
      return { error: "User already exists" };
    }

    const hashedPassword = await hashPassword(validated.password);

    const user = await prisma.user.create({
      data: {
        email: validated.email,
        password: hashedPassword,
        name: validated.name,
      },
    });

    return { success: true, userId: user.id };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { error: error.issues[0].message };
    }
    return { error: "Failed to create user" };
  }
}


const changePasswordSchema = z.object({
  currentPassword: z.string().max(200).optional(),
  newPassword: z.string().min(8, "Use at least 8 characters").max(200),
}).strict();

/** Changes the signed-in user's password. Accounts created with GitHub can set a first one. */
export async function changePassword(input: unknown) {
  try {
    const session = await getSession();
    if (!session?.user?.id) return { error: "Sign in to continue" };
    const { currentPassword, newPassword } = changePasswordSchema.parse(input);
    const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { password: true } });
    if (!user) return { error: "Account not found" };
    if (user.password && !(currentPassword && await bcrypt.compare(currentPassword, user.password))) {
      return { error: "Your current password isn’t right" };
    }
    await prisma.user.update({ where: { id: session.user.id }, data: { password: await hashPassword(newPassword) } });
    return { success: true };
  } catch (error) {
    if (error instanceof z.ZodError) return { error: error.issues[0]?.message ?? "Check the password" };
    return { error: "Couldn’t change the password" };
  }
}

/** Whether the signed-in user has a password yet (GitHub accounts may not). */
export async function hasPassword() {
  const session = await getSession();
  if (!session?.user?.id) return false;
  const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { password: true } });
  return Boolean(user?.password);
}
