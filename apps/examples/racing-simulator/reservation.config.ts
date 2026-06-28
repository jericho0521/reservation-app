const config = {
  apiBaseUrl: process.env.NEXT_PUBLIC_RESERVATION_PLATFORM_BASE_URL,
  serviceId: process.env.NEXT_PUBLIC_RESERVATION_SERVICE_ID,
  labels: {
    resource: "Simulator",
    quantity: "Drivers",
    purpose: "Session Notes",
  },
  theme: {
    brandName: "Racing Simulator",
    shell: "mx-auto grid max-w-5xl gap-4 rounded-lg border border-slate-700 bg-slate-900 p-4 text-slate-50 shadow-sm",
    panel: "rounded-md border border-slate-700 bg-slate-800 p-4",
    button: "rounded-md bg-amber-400 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-amber-300",
    buttonDisabled: "cursor-not-allowed rounded-md bg-slate-700 px-4 py-2 text-sm font-semibold text-slate-400",
    input: "w-full rounded-md border border-slate-600 bg-slate-950 px-3 py-2 text-sm text-slate-50 outline-none focus:border-amber-400",
    selected: "border-amber-400 bg-amber-400 text-slate-950",
    muted: "text-sm text-slate-400",
  },
};

export default config;
