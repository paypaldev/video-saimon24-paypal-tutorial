"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button, ButtonLink } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const STATUS_MESSAGES = [
  "Building prompt…",
  "Calling the model…",
  "Saving your asset…",
];

type QuotaInfo = { plan: string; limit: number };

export function GenerateForm() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [statusIndex, setStatusIndex] = useState(0);
  const [quotaHit, setQuotaHit] = useState<QuotaInfo | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!pending) return;
    const interval = setInterval(() => {
      setStatusIndex((i) => Math.min(i + 1, STATUS_MESSAGES.length - 1));
    }, 8000);
    return () => clearInterval(interval);
  }, [pending]);

  useEffect(() => () => abortRef.current?.abort(), []);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const title = String(formData.get("title") ?? "").trim();
    const description = String(formData.get("description") ?? "").trim();
    if (!title) return;

    setStatusIndex(0);
    setPending(true);
    abortRef.current = new AbortController();
    try {
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          description: description || undefined,
        }),
        signal: abortRef.current.signal,
      });
      const payload = await response.json();

      if (response.ok) {
        toast.success("Asset generated");
        router.push(`/app/assets/${payload.id}`);
        router.refresh();
        return;
      }

      if (payload?.error?.code === "quota_exceeded") {
        setQuotaHit({
          plan: String(payload.error.plan ?? "free"),
          limit: Number(payload.error.limit ?? 0),
        });
        return;
      }

      toast.error(payload?.error?.message ?? "Generation failed. Try again.");
    } catch {
      toast.error("Generation failed. Check your connection and try again.");
    } finally {
      setPending(false);
    }
  }

  if (quotaHit) {
    return (
      <Card className="border-warning/40">
        <CardHeader>
          <CardTitle>You&apos;re out of generations</CardTitle>
          <CardDescription>
            The {quotaHit.plan} plan includes {quotaHit.limit} generations.
            Upgrade to keep creating assets.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex gap-3">
          <ButtonLink href="/pricing">See plans</ButtonLink>
          <ButtonLink variant="ghost" href="/app">
            Back to library
          </ButtonLink>
        </CardContent>
      </Card>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <Label htmlFor="title">Title</Label>
        <Input
          id="title"
          name="title"
          required
          maxLength={120}
          placeholder="Health potion"
          disabled={pending}
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="description">Description</Label>
        <Textarea
          id="description"
          name="description"
          rows={4}
          maxLength={2000}
          placeholder="A small round glass bottle with glowing red liquid and a cork stopper"
          disabled={pending}
        />
        <p className="text-xs text-muted-foreground">
          Optional, but more detail gives the model more to work with.
        </p>
      </div>
      <Button type="submit" size="lg" disabled={pending}>
        {pending ? (
          <>
            <Loader2 className="size-4 animate-spin" />
            {STATUS_MESSAGES[statusIndex]}
          </>
        ) : (
          <>
            <Sparkles className="size-4" />
            Generate
          </>
        )}
      </Button>
    </form>
  );
}
