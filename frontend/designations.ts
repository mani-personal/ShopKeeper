export const designationOptions = {
  vendor: {
    cashier: { label: "Cashier", access: ["dashboard", "sales", "customers"] },
    stock_manager: { label: "Stock manager", access: ["dashboard", "inventory", "purchases", "returns"] },
    accountant: { label: "Accounts", access: ["dashboard", "payments", "reports", "returns"] },
    manager: { label: "Store manager", access: ["dashboard", "sales", "inventory", "purchases", "customers", "returns", "payments", "reports", "settings", "employees"] },
  },
  wholesale: {
    order_fulfilment: { label: "Order fulfilment", access: ["dashboard", "purchases", "inventory"] },
    stock_manager: { label: "Stock manager", access: ["dashboard", "inventory", "purchases", "returns"] },
    accountant: { label: "Accounts", access: ["dashboard", "customers", "payments", "returns", "reports"] },
    manager: { label: "Wholesale manager", access: ["dashboard", "inventory", "purchases", "customers", "returns", "payments", "reports", "settings", "employees"] },
  },
} as const;

export function optionsFor(type: "vendor" | "wholesale") {
  return Object.entries(designationOptions[type]) as Array<[string, { label: string; access: readonly string[] }]>;
}

export function presetFor(type: "vendor" | "wholesale", designation: string): readonly string[] {
  return optionsFor(type).find(([name]) => name === designation)?.[1].access ||
    (designation === "custom" ? (type === "wholesale" ? designationOptions.wholesale.manager.access : designationOptions.vendor.manager.access) : []);
}
