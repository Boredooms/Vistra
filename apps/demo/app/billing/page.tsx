export default function Billing() {
  return (
    <div>
      <h1 className="page-title">Billing</h1>
      <p className="page-sub">Your plan, seats and invoices.</p>
      <section className="surface mt-6 flex flex-wrap items-center justify-between gap-4 px-5 py-4" data-vistra-target="billing.plan">
        <div>
          <div className="text-[13px] text-muted">Current plan</div>
          <div className="mt-0.5 text-[17px] font-semibold">Starter</div>
          <p className="mt-0.5 text-[13px] text-muted">$12 per month, up to 5 team members.</p>
        </div>
        <a href="/docs#acme-workspace-pricing--top" className="btn">Compare plans</a>
      </section>
      <h2 className="mt-8 text-[15px] font-semibold">Invoices</h2>
      <div className="surface mt-3 overflow-hidden">
        <table className="tbl">
          <caption className="sr-only">Invoices</caption>
          <thead>
            <tr><th>Invoice</th><th>Amount</th><th>Status</th><th className="text-right">Action</th></tr>
          </thead>
          <tbody>
            <tr>
              <td className="font-medium">INV-1042</td>
              <td>$12.00</td>
              <td><span role="status" aria-label="Invoice status: Overdue" className="badge badge-danger">Overdue</span></td>
              <td className="text-right"><button data-vistra-target="billing.pay" className="btn btn-sm">Pay invoice</button></td>
            </tr>
            <tr>
              <td className="font-medium">INV-1031</td>
              <td>$12.00</td>
              <td><span role="status" aria-label="Invoice status: Paid" className="badge badge-ok">Paid</span></td>
              <td />
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
