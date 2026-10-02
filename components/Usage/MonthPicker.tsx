"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

/** Chooses the month shown, kept in the URL as ?month=2026-10. */
export function MonthPicker({ months, value }: { months: { key: string; label: string }[]; value: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function choose(month: string) {
    const params = new URLSearchParams(searchParams);
    if (month === months[0]?.key) params.delete("month");
    else params.set("month", month);
    const query = params.toString();
    router.push(query ? `${pathname}?${query}` : pathname);
  }

  return (
    <Select value={value} onValueChange={choose}>
      <SelectTrigger className="w-44" aria-label="Month"><SelectValue /></SelectTrigger>
      <SelectContent>
        {months.map((month) => <SelectItem key={month.key} value={month.key}>{month.label}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}
