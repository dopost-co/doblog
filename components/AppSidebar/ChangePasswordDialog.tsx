"use client";

import { useEffect, useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { changePassword, hasPassword } from "@/src/server/services/users/mutations";

/** Change (or, for GitHub accounts, set) the signed-in user's password. */
export function ChangePasswordDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [hasCurrent, setHasCurrent] = useState(true);
  const [form, setForm] = useState({ currentPassword: "", newPassword: "", confirm: "" });
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!open) return;
    let active = true;
    hasPassword().then((value) => { if (active) setHasCurrent(value); });
    return () => { active = false; };
  }, [open]);

  function close(next: boolean) {
    if (!next) { setForm({ currentPassword: "", newPassword: "", confirm: "" }); setError(""); }
    onOpenChange(next);
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    if (form.newPassword !== form.confirm) { setError("The new passwords don’t match"); return; }
    startTransition(async () => {
      const result = await changePassword({ currentPassword: hasCurrent ? form.currentPassword : undefined, newPassword: form.newPassword });
      if (result.error) { setError(result.error); return; }
      toast.success(hasCurrent ? "Password changed" : "Password set");
      close(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={submit} className="space-y-5">
          <DialogHeader>
            <DialogTitle>{hasCurrent ? "Change password" : "Set a password"}</DialogTitle>
            <DialogDescription>{hasCurrent ? "You’ll use the new one the next time you sign in." : "Then you can also sign in with your email and this password."}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            {hasCurrent && (
              <div className="grid gap-2">
                <Label htmlFor="current-password">Current password</Label>
                <Input id="current-password" type="password" autoComplete="current-password" required value={form.currentPassword} onChange={(event) => setForm({ ...form, currentPassword: event.target.value })} disabled={pending} />
              </div>
            )}
            <div className="grid gap-2">
              <Label htmlFor="new-password">New password</Label>
              <Input id="new-password" type="password" autoComplete="new-password" required minLength={8} value={form.newPassword} onChange={(event) => setForm({ ...form, newPassword: event.target.value })} disabled={pending} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="confirm-password">Repeat the new password</Label>
              <Input id="confirm-password" type="password" autoComplete="new-password" required minLength={8} value={form.confirm} onChange={(event) => setForm({ ...form, confirm: event.target.value })} disabled={pending} />
            </div>
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => close(false)} disabled={pending}>Cancel</Button>
            <Button type="submit" disabled={pending}>{pending ? <><Loader2 className="animate-spin" /> Saving…</> : "Save password"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
