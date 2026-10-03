"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { addBlogMember, removeBlogMember, updateBlogMemberRole } from "@/src/server/services/blogs/members/mutations";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BLOG_ROLES, DEFAULT_BLOG_ROLE, ROLE_DETAILS, type BlogRole } from "@/lib/permissions";
import Link from "next/link";
import { Check, Copy, Loader2, Trash2, UserPlus } from "lucide-react";
import { toast } from "sonner";

interface BlogMember {
  id: string;
  userEmail: string;
  role: BlogRole;
  createdAt: Date;
  user?: {
    id: string;
    name: string | null;
    email: string;
  } | null;
}

interface BlogMembersProps {
  blogId: string;
  members: BlogMember[];
  ownerEmail: string;
  ownerUser?: {
    id: string;
    name: string | null;
    email: string;
  } | null;
  /** Owners and admins invite, change roles and remove people. */
  canManage: boolean;
  /** The signed-in user's email, so they can't demote themselves here. */
  currentEmail: string;
}

function RoleSelect({ value, onChange, disabled, label }: { value: BlogRole; onChange: (role: BlogRole) => void; disabled?: boolean; label: string }) {
  return (
    <Select value={value} onValueChange={(next) => onChange(next as BlogRole)} disabled={disabled}>
      <SelectTrigger size="sm" className="w-28" aria-label={label}><SelectValue /></SelectTrigger>
      <SelectContent align="end">
        {BLOG_ROLES.map((role) => (
          <SelectItem key={role} value={role}>{ROLE_DETAILS[role].label}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function BlogMembers({ blogId, members: initialMembers, ownerEmail, ownerUser, canManage, currentEmail }: BlogMembersProps) {
  const router = useRouter();
  const [members, setMembers] = useState(initialMembers);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<BlogRole>(DEFAULT_BLOG_ROLE);
  const [changingId, setChangingId] = useState<string | null>(null);
  const [copiedEmail, setCopiedEmail] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);

  async function handleAddMember(e: React.FormEvent) {
    e.preventDefault();
    setIsAdding(true);

    try {
      const result = await addBlogMember(blogId, email, role);

      if (result.error) {
        toast.error(result.error);
        setIsAdding(false);
      } else {
        const addedEmail = email.trim().toLowerCase();
        if (result.member) {
          setMembers((current) => [...current, result.member]);
        }
        setEmail("");
        toast.success(`${addedEmail} can now access this blog`, {
          action: { label: "Copy invite link", onClick: () => copyInvitation(addedEmail) },
        });
        setIsAdding(false);
        router.refresh();
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add member");
      setIsAdding(false);
    }
  }

  function invitationUrl(invitedEmail: string) {
    const url = new URL("/", window.location.origin);
    url.searchParams.set("callbackUrl", `/dashboard/blogs/${blogId}`);
    url.searchParams.set("email", invitedEmail);
    return url.toString();
  }

  async function copyInvitation(invitedEmail: string) {
    try {
      await navigator.clipboard.writeText(invitationUrl(invitedEmail));
      setCopiedEmail(invitedEmail);
      toast.success("Invitation link copied");
      window.setTimeout(() => setCopiedEmail((current) => current === invitedEmail ? "" : current), 2000);
    } catch {
      toast.error("Could not copy the invitation link");
    }
  }

  async function handleRemoveMember(memberId: string, memberEmail: string) {
    if (!confirm(`Are you sure you want to remove ${memberEmail} from this blog?`)) {
      return;
    }

    setRemovingId(memberId);

    try {
      const result = await removeBlogMember(blogId, memberId);

      if (result.error) {
        toast.error(result.error);
        setRemovingId(null);
      } else {
        setMembers(members.filter((m) => m.id !== memberId));
        toast.success(`${memberEmail} removed from this blog`);
        setRemovingId(null);
        router.refresh();
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to remove member");
      setRemovingId(null);
    }
  }

  async function handleRoleChange(memberId: string, memberEmail: string, next: BlogRole) {
    setChangingId(memberId);
    const result = await updateBlogMemberRole(blogId, memberId, next);
    setChangingId(null);
    if (result.error) { toast.error(result.error); return; }
    setMembers((current) => current.map((member) => member.id === memberId ? { ...member, role: next } : member));
    toast.success(`${memberEmail} is now ${ROLE_DETAILS[next].label.toLowerCase()}`);
    router.refresh();
  }

  // Combine owner and members for display
  const allMembers = [
    {
      id: "owner",
      userEmail: ownerEmail,
      createdAt: new Date(),
      user: ownerUser || null,
      role: "admin" as BlogRole,
      isOwner: true,
    },
    ...members.map((m) => ({ ...m, isOwner: false })),
  ];

  return (
    <div className="space-y-6">
      {canManage && (
        <form onSubmit={handleAddMember} className="space-y-2">
          <Label htmlFor="email">Invite by email</Label>
          <div className="flex gap-2">
            <Input
              id="email"
              type="email"
              placeholder="user@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={isAdding}
              className="flex-1"
            />
            <Select value={role} onValueChange={(next) => setRole(next as BlogRole)} disabled={isAdding}>
              <SelectTrigger className="w-28" aria-label="Role"><SelectValue /></SelectTrigger>
              <SelectContent align="end">
                {BLOG_ROLES.map((option) => <SelectItem key={option} value={option}>{ROLE_DETAILS[option].label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button type="submit" disabled={isAdding || !email.trim()}>
              {isAdding ? <Loader2 className="animate-spin" /> : <UserPlus />}
              {isAdding ? "Adding..." : "Add"}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            {ROLE_DETAILS[role].description} <Link href="/docs/members#roles" className="underline underline-offset-4">Compare roles</Link>
          </p>
        </form>
      )}

      <div className="divide-y rounded-lg border bg-card">
        {allMembers.map((member) => (
          <div key={member.id} className="flex items-center gap-3 px-4 py-3">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-medium">
              {member.userEmail.charAt(0).toUpperCase()}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">
                {member.user?.name || member.userEmail}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {member.user?.name ? member.userEmail : member.user ? "Registered user" : "Pending, not registered yet"}
              </p>
            </div>
            {!member.isOwner && !member.user && (
              <span className="rounded-full border border-dashed px-2 py-0.5 text-xs text-muted-foreground">Pending</span>
            )}
            {member.isOwner ? (
              <span className="rounded-full border px-2 py-0.5 text-xs text-muted-foreground">Owner</span>
            ) : canManage ? (
              <RoleSelect
                value={member.role}
                label={`Role of ${member.userEmail}`}
                disabled={changingId === member.id || member.userEmail.toLowerCase() === currentEmail}
                onChange={(next) => handleRoleChange(member.id, member.userEmail, next)}
              />
            ) : (
              <span className="rounded-full border px-2 py-0.5 text-xs text-muted-foreground">{ROLE_DETAILS[member.role].label}</span>
            )}
            {canManage && !member.isOwner && <div className="flex shrink-0 items-center gap-1">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-label={`Copy invitation link for ${member.userEmail}`}
                onClick={() => copyInvitation(member.userEmail)}
              >
                {copiedEmail === member.userEmail ? <Check /> : <Copy />}
                <span className="hidden sm:inline">{copiedEmail === member.userEmail ? "Copied" : "Copy invite"}</span>
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={`Remove ${member.userEmail}`}
                onClick={() => handleRemoveMember(member.id, member.userEmail)}
                disabled={removingId === member.id}
              >
                {removingId === member.id ? <Loader2 className="animate-spin" /> : <Trash2 />}
              </Button>
            </div>}
          </div>
        ))}
      </div>


    </div>
  );
}
