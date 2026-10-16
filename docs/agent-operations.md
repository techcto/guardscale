# Stop or restart a Linux agent

In the console, open the server’s **Connection settings** and expand the separate
red **Stop or disable agent** section at the bottom, below the install steps.
The console provides commands to copy; it does not execute them remotely.

Run these commands on the enrolled Linux host (not the GuardScale web server):

```sh
# Stop until someone starts it or the enabled service starts at boot:
sudo systemctl stop guardscale
# Stop now and prevent startup at boot:
sudo systemctl disable --now guardscale
# Restore startup at boot and start now:
sudo systemctl enable --now guardscale
# Reload agent configuration by restarting:
sudo systemctl restart guardscale
# Inspect service state:
sudo systemctl --no-pager status guardscale
```

Stopping is not uninstalling or deleting. Saved history remains. Heartbeats and
log ingestion stop; console health becomes stale after the configured timeout.
Existing kernel-managed temporary blocks retain their original expiry, even if
the agent stops. No stop action is executed by displaying these commands.

The disposable localhost PHP fixture has no systemd. Its agent is supervised
alongside Apache. For the security fixture at ports 8185/8186, run from this repo:

```sh
docker compose -f devops/local/compose.yml -f devops/local/security.yml --profile local-fixture --profile local-security stop site
docker compose -f devops/local/compose.yml -f devops/local/security.yml --profile local-fixture --profile local-security start site
```

This stops/starts both the sample website and agent. For the non-security fixture,
omit `-f devops/local/security.yml --profile local-security` from those commands.
