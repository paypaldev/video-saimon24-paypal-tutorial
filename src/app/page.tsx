import Image from "next/image";
import Link from "next/link";
import { PenLine, Sparkles, Download } from "lucide-react";
import { MarketingNav } from "@/components/layout/marketing-nav";
import { ButtonLink } from "@/components/ui/button";
import { PLANS } from "@/lib/billing/plans";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const SAMPLES = [
  { src: "/marketing/health-potion.svg", alt: "Health potion game asset" },
  { src: "/marketing/iron-sword.svg", alt: "Iron sword game asset" },
  { src: "/marketing/tower-shield.svg", alt: "Tower shield game asset" },
  { src: "/marketing/mana-crystal.svg", alt: "Mana crystal game asset" },
  { src: "/marketing/elven-bow.svg", alt: "Elven bow game asset" },
  { src: "/marketing/golden-crown.svg", alt: "Golden crown game asset" },
  { src: "/marketing/dragon-egg.svg", alt: "Dragon egg game asset" },
  { src: "/marketing/wizard-tome.svg", alt: "Wizard tome game asset" },
];

const STEPS = [
  {
    icon: PenLine,
    title: "Describe it",
    text: "A title and a short description — 'Health potion, glowing red liquid in a corked bottle'.",
  },
  {
    icon: Sparkles,
    title: "Generate",
    text: "Your personal style JSON is folded into the prompt so every asset matches your game.",
  },
  {
    icon: Download,
    title: "Download",
    text: "A transparent PNG lands in your library, ready to drop into your engine.",
  },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen">
      <MarketingNav />
      <main>
        {/* Hero */}
        <section className="mx-auto max-w-4xl px-4 pt-20 pb-16 text-center">
          <h1 className="text-4xl font-bold tracking-tight text-balance sm:text-5xl">
            Game assets in <span className="text-primary">your</span> art style,
            from a sentence.
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-muted-foreground">
            Describe an asset, hit Generate, and get a consistent, game-ready
            image every time — your style, not the model&apos;s.
          </p>
          <div className="mt-8 flex justify-center gap-3">
            <ButtonLink size="lg" href="/signup">
              Start free — {PLANS.free.generations} generations
            </ButtonLink>
            <ButtonLink size="lg" variant="outline" href="/pricing">
              Pricing
            </ButtonLink>
          </div>
        </section>

        {/* The loop */}
        <section className="mx-auto max-w-5xl px-4 pb-16">
          <div className="grid gap-4 sm:grid-cols-3">
            {STEPS.map((step) => (
              <Card key={step.title}>
                <CardHeader>
                  <step.icon className="size-6 text-primary" />
                  <CardTitle>{step.title}</CardTitle>
                  <CardDescription>{step.text}</CardDescription>
                </CardHeader>
              </Card>
            ))}
          </div>
        </section>

        {/* Sample grid */}
        <section className="mx-auto max-w-5xl px-4 pb-16">
          <h2 className="mb-6 text-center text-2xl font-bold tracking-tight">
            One style JSON, endless assets
          </h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {SAMPLES.map((sample) => (
              <div
                key={sample.src}
                className="overflow-hidden rounded-xl border border-border"
              >
                <Image
                  src={sample.src}
                  alt={sample.alt}
                  width={256}
                  height={256}
                  className="h-auto w-full"
                />
              </div>
            ))}
          </div>
        </section>

        {/* Pricing teaser */}
        <section className="mx-auto max-w-3xl px-4 pb-20 text-center">
          <Card>
            <CardContent className="flex flex-col items-center gap-4 py-10">
              <h2 className="text-2xl font-bold tracking-tight">
                Free to try. {PLANS.free.generations} generations on us.
              </h2>
              <p className="text-muted-foreground">
                Upgrade to {PLANS.pro.name} for {PLANS.pro.generations}{" "}
                generations a month when you&apos;re ready.
              </p>
              <ButtonLink size="lg" href="/signup">
                Create your account
              </ButtonLink>
            </CardContent>
          </Card>
        </section>
      </main>

      <footer className="border-t border-border py-8">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 text-sm text-muted-foreground">
          <span>
            Asset<span className="text-primary">Forge</span>
          </span>
          <div className="flex gap-4">
            <Link href="/pricing" className="hover:text-foreground">
              Pricing
            </Link>
            <Link href="/login" className="hover:text-foreground">
              Sign in
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
