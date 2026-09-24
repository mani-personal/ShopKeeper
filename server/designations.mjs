export const DESIGNATIONS = {
  vendor: {
    cashier: ["dashboard", "sales", "customers"],
    stock_manager: ["dashboard", "inventory", "purchases", "returns"],
    accountant: ["dashboard", "payments", "reports", "returns"],
    manager: ["dashboard", "sales", "inventory", "purchases", "customers", "returns", "payments", "reports", "settings", "employees"],
  },
  wholesale: {
    order_fulfilment: ["dashboard", "purchases", "inventory"],
    stock_manager: ["dashboard", "inventory", "purchases", "returns"],
    accountant: ["dashboard", "customers", "payments", "returns", "reports"],
    manager: ["dashboard", "inventory", "purchases", "customers", "returns", "payments", "reports", "settings", "employees"],
  },
};

export function employeeAccess(type, designation, permissions, actor) {
  const presets = DESIGNATIONS[type];
  if (!presets || (designation !== "custom" && !presets[designation]))
    throw Object.assign(Error("Choose a valid employee designation."), { status: 400 });
  const allowed = presets[designation] || Object.values(presets).flat();
  if (!Array.isArray(permissions) || !permissions.length ||
      permissions.some((permission) => !allowed.includes(permission) || !actor.includes(permission)))
    throw Object.assign(Error("Choose access allowed by this designation and your account."), { status: 403 });
  return [...new Set(permissions)];
}
