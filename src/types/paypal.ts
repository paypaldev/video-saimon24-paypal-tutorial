/**
 * Minimal hand-written types for the parts of the PayPal Web SDK v6 this app
 * uses. Keeps the checkout button free of `any` without pulling in a
 * dependency. PayPal ships no types for v6 on npm.
 *
 * Shapes follow https://developer.paypal.com/sdk/js/reference — only the
 * subscription path is modelled; one-time payments, Venmo, card fields and
 * Fastlane are all omitted.
 */

/** Payment methods v6 knows about. Only "paypal" is used here. */
export type PaypalPaymentMethod = "paypal" | "venmo" | "paylater" | "credit";

export type PaypalEligibleMethods = {
  isEligible(method: PaypalPaymentMethod): boolean;
};

export type PaypalApproveData = {
  subscriptionId: string;
  payerId?: string;
};

export type PaypalCancelData = {
  subscriptionId?: string;
};

export type PaypalSdkError = {
  code?: string;
  message?: string;
};

export type PaypalSubscriptionSessionOptions = {
  onApprove(data: PaypalApproveData): void | Promise<void>;
  onCancel?(data: PaypalCancelData): void;
  onError?(error: PaypalSdkError): void;
};

/**
 * `start` takes the presentation options and a promise resolving to a
 * subscription that already exists at PayPal — created by /api/paypal/subscribe.
 */
export type PaypalSubscriptionSession = {
  start(
    options: { presentationMode?: "auto" | "modal" | "popup" | "payment-handler" },
    subscription: Promise<{ subscriptionId: string }>,
  ): Promise<void>;
};

export type PaypalSdkInstance = {
  findEligibleMethods(options: {
    currencyCode: string;
    countryCode?: string;
    amount?: string;
  }): Promise<PaypalEligibleMethods>;
  createPayPalSubscriptionSession(
    options: PaypalSubscriptionSessionOptions,
  ): PaypalSubscriptionSession;
};

/** In v6 the global exposes only `createInstance`. */
export type PaypalNamespace = {
  createInstance(options: {
    clientId: string;
    components?: string[];
    pageType?: "checkout" | "product-details" | "cart" | "mini-cart" | "home";
  }): Promise<PaypalSdkInstance>;
};

declare global {
  interface Window {
    paypal?: PaypalNamespace;
  }
}

/**
 * v6 renders its button as a custom element rather than into a container, so
 * React needs to know the tag. Attributes are strings, as on any DOM element.
 */
declare module "react" {
  // Augmenting JSX.IntrinsicElements means re-opening the namespace — there is
  // no module-syntax equivalent, so the rule cannot be satisfied here.
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace JSX {
    interface IntrinsicElements {
      "paypal-button": React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement>,
        HTMLElement
      > & {
        type?: "pay" | "paypal" | "subscribe" | "checkout";
        env?: "sandbox" | "production";
        color?: "gold" | "blue" | "silver" | "white" | "black";
        shape?: "rect" | "pill" | "sharp";
      };
    }
  }
}
