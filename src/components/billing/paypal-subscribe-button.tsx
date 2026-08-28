"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Script from "next/script";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { PaypalSdkInstance, PaypalSubscriptionSession } from "@/types/paypal";
// `window.paypal` and <paypal-button> are typed in src/types/paypal.ts.

type Props = {
  /** Public PayPal client id — it is browser-safe by design. */
  clientId: string;
  /**
   * v6 serves the SDK from a different host per environment, unlike v5 where
   * the client id alone decided which one you got.
   */
  env: "sandbox" | "live";
};

type Status = "loading" | "ready" | "processing" | "done" | "error";

/** The plan and the buyer's account id are no longer passed in: /api/paypal/subscribe
 *  derives both from the session when it creates the subscription. */
export function PaypalSubscribeButton({ clientId, env }: Props) {
  const router = useRouter();
  const sessionRef = useRef<PaypalSubscriptionSession | null>(null);
  const [sdkReady, setSdkReady] = useState(false);
  const [status, setStatus] = useState<Status>("loading");

  const sdkUrl =
    env === "live"
      ? "https://www.paypal.com/web-sdk/v6/core"
      : "https://www.sandbox.paypal.com/web-sdk/v6/core";

  const onApprove = useCallback(
    async (subscriptionId: string) => {
      setStatus("processing");
      try {
        // Server re-reads the subscription from PayPal before upgrading —
        // the approval alone is not proof of anything.
        const response = await fetch("/api/paypal/confirm", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ subscriptionId }),
        });
        const payload = await response.json();

        if (!response.ok) {
          setStatus("error");
          toast.error(payload?.error?.message ?? "We could not confirm your subscription.");
          return;
        }

        setStatus("done");
        if (payload?.status === "active") {
          toast.success("You're on Pro — your generations have been reset.");
        } else {
          toast.success("Payment approved. Your plan will switch over shortly.");
        }
        router.refresh();
      } catch {
        setStatus("error");
        toast.error("We could not reach the server to confirm your subscription.");
      }
    },
    [router],
  );

  useEffect(() => {
    if (!sdkReady || !window.paypal) return;
    let cancelled = false;

    (async () => {
      let sdk: PaypalSdkInstance;
      try {
        sdk = await window.paypal!.createInstance({
          clientId,
          // v6 lazily loads only the components you ask for, and subscriptions
          // ship as their own component — the SDK's constant table lists
          // "paypal-subscriptions" separately from "paypal-payments". Asking
          // for both keeps the PayPal branding/eligibility bits from
          // paypal-payments and the subscription session factory itself.
          components: ["paypal-payments", "paypal-subscriptions"],
          pageType: "checkout",
        });
      } catch {
        if (!cancelled) setStatus("error");
        return;
      }
      if (cancelled) return;

      // v6 dropped v5's implicit pre-render eligibility check, so we make it
      // ourselves. A failed *check* is not a failed checkout, though — if the
      // eligibility service is unreachable we still show the button rather
      // than hide the only way to pay.
      try {
        const methods = await sdk.findEligibleMethods({ currencyCode: "USD" });
        if (!cancelled && !methods.isEligible("paypal")) {
          setStatus("error");
          return;
        }
      } catch {
        // Fall through and render.
      }
      if (cancelled) return;

      sessionRef.current = sdk.createPayPalSubscriptionSession({
        onApprove: (data) => onApprove(data.subscriptionId),
        onCancel: () => {
          setStatus("ready");
          toast("Checkout cancelled — nothing was charged.");
        },
        onError: () => {
          setStatus("error");
          toast.error("PayPal checkout failed. Please try again.");
        },
      });
      setStatus("ready");
    })();

    return () => {
      cancelled = true;
      sessionRef.current = null;
    };
  }, [sdkReady, clientId, onApprove]);

  const handleClick = useCallback(() => {
    const session = sessionRef.current;
    if (!session || status === "processing" || status === "done") return;

    // start() consumes the promise directly, so PayPal opens its window on
    // this click rather than after an await — popup blockers care about that.
    session
      .start(
        { presentationMode: "auto" },
        (async () => {
          const response = await fetch("/api/paypal/subscribe", { method: "POST" });
          const payload = await response.json();
          if (!response.ok || !payload?.subscriptionId) {
            throw new Error(payload?.error?.message ?? "Could not start checkout.");
          }
          return { subscriptionId: payload.subscriptionId as string };
        })(),
      )
      .catch(() => {
        setStatus("error");
        toast.error("We could not start the PayPal checkout. Please try again.");
      });
  }, [status]);

  return (
    <div className="flex flex-col gap-2">
      <Script src={sdkUrl} strategy="afterInteractive" onReady={() => setSdkReady(true)} onError={() => setStatus("error")} />

      {status === "done" ? null : (
        <paypal-button
          type="subscribe"
          env={env === "live" ? "production" : "sandbox"}
          color="gold"
          shape="pill"
          onClick={handleClick}
          aria-disabled={status !== "ready"}
        />
      )}

      {status === "loading" && (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="size-3 animate-spin" />
          Loading PayPal…
        </p>
      )}
      {status === "processing" && (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="size-3 animate-spin" />
          Confirming your subscription…
        </p>
      )}
      {status === "done" && (
        <p className="text-xs text-success">Subscription approved. Refreshing your plan…</p>
      )}
      {status === "error" && (
        <p className="text-xs text-destructive">
          PayPal could not be loaded. Refresh the page and try again.
        </p>
      )}
    </div>
  );
}
