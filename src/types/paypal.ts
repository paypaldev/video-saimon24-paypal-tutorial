/**
 * Minimal hand-written types for the parts of the PayPal JS SDK this app uses.
 * Keeps the checkout button free of `any` without pulling in a dependency.
 */

export type PaypalSubscriptionActions = {
  subscription: {
    create(options: { plan_id: string; custom_id?: string }): Promise<string>;
  };
};

export type PaypalApproveData = {
  subscriptionID?: string | null;
  orderID?: string | null;
};

export type PaypalButtonsOptions = {
  style?: {
    layout?: "vertical" | "horizontal";
    color?: "gold" | "blue" | "silver" | "white" | "black";
    shape?: "rect" | "pill";
    label?: "paypal" | "subscribe" | "pay";
    height?: number;
  };
  createSubscription(
    data: unknown,
    actions: PaypalSubscriptionActions,
  ): Promise<string>;
  onApprove(data: PaypalApproveData): void | Promise<void>;
  onCancel?(): void;
  onError?(error: unknown): void;
};

export type PaypalButtonsInstance = {
  render(container: HTMLElement): Promise<void>;
  close(): void;
};

export type PaypalNamespace = {
  Buttons(options: PaypalButtonsOptions): PaypalButtonsInstance;
};

declare global {
  interface Window {
    paypal?: PaypalNamespace;
  }
}
