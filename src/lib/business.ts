/**
 * Business profile + payment instructions used on outgoing invoices.
 * Single source of truth — edit here, not in template files.
 */

export const BUSINESS = {
  legalName: "LIYUAN CO., LTD.",
  contactName: "Raymond Yao",
  addressLines: ["Seestraße 68", "70174 Stuttgart", "Germany"],
  email: "raymond800108@gmail.com",
  phone: "+49 176 3770 7865",
  website: "convra.net",

  // Brand colors
  brand: {
    primary: "#7c7c7c", // gray (logo color)
    accent: "#d4a574", // tan dot (logo accent)
    text: "#1a1a1a",
    muted: "#888888",
    border: "#e5e3e0",
    softBg: "#faf8f5",
  },
} as const;

export const BANK = {
  beneficiary: "LIYUAN CO., LTD.",
  beneficiaryZh: "櫟元有限公司",
  bank: "E.SUN Commercial Bank, Ltd.",
  branch: "Dunnan Branch (敦南分行)",
  account: "0314-940-037728",
  bankCode: "808",
  swift: "ESUNTWTP",
  currency: "USD",
} as const;

export const INVOICE_DEFAULTS = {
  netDays: 14,
  numberPrefix: "INV",
  thankYou:
    "Thank you for your business. Please settle this invoice within the payment terms.",
  legal:
    "All amounts in US Dollars (USD). Costs are calculated based on metered API consumption during the billing period.",
} as const;
