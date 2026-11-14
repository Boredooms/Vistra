import Link from "next/link";

export default function Settings() {
  return (
    <div>
      <h1 className="page-title">Settings</h1>
      <p className="page-sub">Workspace security and payment details.</p>
      <section className="surface mt-6 max-w-xl p-5">
        <h2 className="font-semibold">Security</h2>
        <label className="mt-3 flex items-center gap-2.5 text-[13.5px]">
          <input type="checkbox" data-vistra-target="settings.2fa" className="h-4 w-4 accent-[var(--accent)]" /> Require two-factor authentication
        </label>
      </section>
      <section className="surface mt-4 max-w-xl p-5">
        <h2 className="font-semibold">Payment card</h2>
        <label htmlFor="cc" className="field mt-4">Card number</label>
        <input id="cc" autoComplete="cc-number" placeholder="4242 4242 4242 4242" className="input" />
        <label htmlFor="pw" className="field mt-4">New password</label>
        <input id="pw" type="password" className="input" />
        <p className="hint">VISTRA never captures these two fields: password and cc-* inputs are redacted before anything leaves the page.</p>
      </section>
      <section className="surface mt-4 max-w-xl p-5">
        <h2 className="font-semibold">Assistant</h2>
        <p className="mt-1 text-[13px] text-muted">Change the VISTRA app or API key this workspace uses.</p>
        <Link href="/setup" className="btn mt-3">Open VISTRA setup</Link>
      </section>
    </div>
  );
}
