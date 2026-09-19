import AddServer from './add-server';

export default function Servers(){
  return <main>
    <section className="hero compact-hero">
      <div><div className="eyebrow">Fleet</div><h1>Servers</h1><p className="muted page-intro">Install a lightweight Guardian agent on each server. Agents connect outbound to Guardian.US; no inbound port is required.</p></div>
      <AddServer />
    </section>
    <section className="card">
      <div className="section-heading"><div><h2>Connected servers</h2><p className="muted">A server appears after its first authenticated heartbeat.</p></div><span className="status neutral">0 enrolled</span></div>
      <div className="table-wrap"><table><thead><tr><th>Server</th><th>Health</th><th>Last heartbeat</th></tr></thead><tbody><tr><td colSpan={3} className="empty-state"><strong>No agents connected yet.</strong><span>Choose Add server to generate an installation guide.</span></td></tr></tbody></table></div>
    </section>
  </main>
}
