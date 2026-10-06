"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, Loader2, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createUserByAdmin } from "@/src/server/services/admin/actions";

/** Administrators only: creates an account to hand to someone, who can change the password later. */
export function CreateUserDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ email: "", name: "", password: "", plan: "lifetime" });
  const [created, setCreated] = useState<{ email: string; password: string } | null>(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();

  function reset(next: boolean) {
    setOpen(next);
    if (!next) {
      setForm({ email: "", name: "", password: "", plan: "lifetime" });
      setCreated(null);
      setError("");
      setCopied(false);
    }
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    startTransition(async () => {
      const result = await createUserByAdmin(form);
      if ("error" in result && result.error) { setError(result.error); return; }
      if ("password" in result && result.email && result.password) setCreated({ email: result.email, password: result.password });
      router.refresh();
    });
  }

  const message = created ? `${window.location.origin}\nEmail: ${created.email}\nPassword: ${created.password}` : "";
  async function copy() {
    await navigator.clipboard.writeText(message);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  }

  return (
    <Dialog open={open} onOpenChange={reset}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm"><UserPlus /> Create account</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        {created ? (
          <div className="space-y-5">
            <DialogHeader>
              <DialogTitle>Account created</DialogTitle>
              <DialogDescription>
                Send these to them. The password is shown only now; they can change it from their account menu after signing in.
              </DialogDescription>
            </DialogHeader>
            <pre className="whitespace-pre-wrap rounded-md border bg-muted/40 p-3 font-mono text-xs">{message}</pre>
            <DialogFooter>
              <Button variant="outline" onClick={copy}>{copied ? <Check /> : <Copy />} {copied ? "Copied" : "Copy"}</Button>
              <Button onClick={() => reset(false)}>Done</Button>
            </DialogFooter>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-5">
            <DialogHeader>
              <DialogTitle>Create an account</DialogTitle>
              <DialogDescription>They sign in with this email and password and set up their first blog.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="new-user-email">Email</Label>
                <Input id="new-user-email" type="email" required autoFocus value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} disabled={pending} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="new-user-name">Name <span className="font-normal text-muted-foreground">(optional)</span></Label>
                <Input id="new-user-name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} maxLength={80} disabled={pending} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="new-user-password">Password <span className="font-normal text-muted-foreground">(optional)</span></Label>
                <Input id="new-user-password" type="text" autoComplete="off" spellCheck={false} placeholder="Leave empty to generate one" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} disabled={pending} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="new-user-plan">Plan</Label>
                <Select value={form.plan} onValueChange={(plan) => setForm({ ...form, plan })} disabled={pending}>
                  <SelectTrigger id="new-user-plan" className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="lifetime">Lifetime: their own API keys pay</SelectItem>
                    <SelectItem value="subscription">Subscription: the platform keys pay</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => reset(false)} disabled={pending}>Cancel</Button>
              <Button type="submit" disabled={pending}>{pending ? <><Loader2 className="animate-spin" /> Creating…</> : "Create account"}</Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
