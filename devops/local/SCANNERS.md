# Local real-tool security tests

## Why these tools are included

GuardScale was developed after our team responded to a real attack involving
automated scanning tools including ffuf and Nuclei. AI helped us investigate the
incident and connect request activity with application and origin-server behavior.
We then built GuardScale around evidence collection, further inspection, operator
communication and bounded response.

The submodules let us reproduce relevant behavior on infrastructure we own and
are authorized to test. Their presence is for defensive development and evaluation;
the monitored-host agent does not install or run scanners. Tool identification
does not by itself prove intent or identify an attacker.

## Reproduce locally

For an isolated local target reporting into the production control plane, see
[production-connected local testing](../../docs/production-testing.md#local-target-production-control-plane).
The commands below use the independent local regression lab instead.

The ffuf and nuclei sources are Git submodules, pinned by the parent repository:

- `submodules/ffuf`: `8162f48742ff140cafd0d8eb4f071714befccef5`
- `submodules/nuclei`: `ce28f2028daad02d9b67b919e31a0ea2eba7c39e`

These are builds of the requested forks, not claims of certified upstream releases.
The optional tools image includes their license notices. Tools are excluded from
normal application build contexts and are not installed on protected servers.

```sh
git submodule update --init --recursive
npm run local:security -- --tools
```

Console: http://localhost:8185 (`root` / `test`).
Database-backed sample application: http://localhost:8186.
PHP, Apache, SQLite and the real GuardScale agent run together in the site container.
Only the optional probe container contains the scanner binaries. First build can
take several minutes; later builds reuse Go caches.

Interactive runs (you approve **Block source temporarily…** in the incident UI):

```sh
bash attack.sh --ffuf
bash attack.sh --nuclei
# Stop suspicious request generation, without altering firewall state:
bash attack.sh --stop
```

Re-run startup between interactive demos to reset the disposable agent's cooldown.
Automated Playwright approval/block/expiry/audit verification:

```sh
bash attack.sh --verify-ffuf
bash attack.sh --verify-nuclei
```

The automated tests restart only the disposable site/probe to reset cooldowns.
There is no external target argument. Both binaries receive the fixed `http://site`
target from a private Docker network. The probe is unprivileged, capability-free,
read-only except bounded ephemeral storage, has no published port/AWS keys, and
has no external network route. Only the disposable site has firewall capabilities.

ffuf uses 60 small read-only path candidates, one worker, 5 requests/second and a
20-second maximum. Nuclei uses only our 30-path informational enumeration template,
one template/payload worker, 5 requests/second, no retries and a 90-second process
timeout. Redirects, update checks and Interactsh callbacks are disabled. No public
exploit packs, code templates, headless browser, credentials or destructive payloads
are enabled. Cancellation terminates a running scanner process.

The test succeeds only if actual tool requests reach the normal Apache/agent
ingestion path, produce an incident, receive UI approval, become blocked, and
recover after expiry while the operator/control plane remains reachable.
A failed scan or unreachable website alone is not proof of a block. The interactive
wrapper checks kernel ipset membership and independent website reachability.
Template matches here are expected fixture responses, **not discovered vulnerabilities**.
Passing these bounded enumeration tests does not establish full CVE coverage,
distributed-attack resilience, proxy/CDN safety or production readiness.

## Real database fixture

The app executes real PDO SQLite queries with prepared statements. Browser tests
search products, add a cart item, store a demo order, submit a contact message,
verify row counts increase, and reject a form missing its CSRF token. It sends no
email and collects no payment details. `/?page=database` shows connection status;
`/?page=database&format=json` exposes bounded test health/counts.

SQLite is outside the web root at `/var/lib/guardscale-demo/app.sqlite`, using WAL
and a bounded busy timeout. Its named `sample_database` volume survives restarts
and normal `down`, separately from the in-memory GuardScale test database. Missing
routes use Apache's front controller fallback, so enumeration executes the real
PHP/SQLite workload before returning 404, like a CMS router. No
database port or credentials are required. This simulates a real database-backed
PHP workload, not MySQL-specific behavior or a production CMS installation.
Do not enter private customer data into the disposable demo.
