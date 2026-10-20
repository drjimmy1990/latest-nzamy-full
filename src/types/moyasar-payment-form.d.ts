/**
 * moyasar-payment-form 2.3.0 ships a .d.ts that names an undeclared
 * `MoyasarJS` namespace, and its package `exports` map has no `types`
 * condition, so TypeScript cannot type the import. This declares the part
 * the checkout screen uses (src/components/payments/MoyasarCheckout.tsx);
 * the config itself is typed by MoyasarInitConfig in
 * src/lib/payments/checkoutView.ts.
 */
declare module "moyasar-payment-form" {
  const Moyasar: {
    init(config: object): void;
    setAmount(newAmount: number): void;
  };
  export default Moyasar;
}

declare module "moyasar-payment-form/dist/moyasar.css";
