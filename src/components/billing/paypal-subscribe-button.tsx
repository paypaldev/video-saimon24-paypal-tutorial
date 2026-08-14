"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Script from "next/script";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
// `window.paypal` is typed by the global augmentation in src/types/paypal.ts.

type Props = {
  /** Public PayPal client id — it ships in the SDK script URL by design. */
  clientId: string;
  /** PAYPAL_PLAN_ID_PRO, passed down from the server component. */
  planId: string;
  /** Becomes `custom_id` on the subscription: the only link back to the account. */
  userId: string;
};

type Status = "loading" | "ready" | "processing" | "done" | "error";

export function PaypalSubscribeButton({ clientId, planId, userId }: Props) {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);
  const [sdkReady, setSdkReady] = useState(false);
  const [status, setStatus] = useState<Status>("loading");

  const sdkUrl =
    "https://www.paypal.com/sdk/js" +
    `?client-id=${encodeURIComponent(clientId)}` +
    "&vault=true&intent=subscription&currency=USD";

  useEffect(() => {
    const container = containerRef.current;
    if (!sdkReady || !container || !window.paypal) return;

    const buttons = window.paypal.Buttons({
      style: { layout: "vertical", color: "gold", shape: "pill", label: "subscribe" },

      createSubscription(_data, actions) {
        // custom_id travels with the subscription all the way into the
        // webhook payload. Nothing else in that payload identifies the user.
        return actions.subscription.create({ plan_id: planId, custom_id: userId });
      },

      async onApprove(data) {
        const subscriptionId = data.subscriptionID;
        if (!subscriptionId) {
          setStatus("error");
          toast.error("PayPal did not return a subscription id.");
          return;
        }

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

      onCancel() {
        toast("Checkout cancelled — nothing was charged.");
      },

      onError() {
        setStatus("error");
        toast.error("PayPal checkout failed. Please try again.");
      },
    });

    buttons
      .render(container)
      .then(() => setStatus((current) => (current === "loading" ? "ready" : current)))
      .catch(() => setStatus("error"));

    return () => {
      try {
        buttons.close();
      } catch {
        // Already torn down by the SDK.
      }
    };
  }, [sdkReady, planId, userId, router]);

  return (
    <div className="flex flex-col gap-2">
      <Script
        src={sdkUrl}
        strategy="afterInteractive"
        onReady={() => setSdkReady(true)}
        onError={() => setStatus("error")}
      />

      {/* PayPal renders its iframe here. */}
      <div ref={containerRef} className={status === "done" ? "hidden" : undefined} />

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
