# Agent versions and updates

Linux systemd agents support:

```sh
guardscale version
guardscale version --json
guardscale update --check
sudo guardscale update
```

`--check` reports the installed version, the available stable release and whether
an update exists, without root access or changing files. Installing requires root.
The server detail page also shows the version reported in authenticated heartbeats.

## Enable automatic updates

Fresh installs include a separate update service and timer, disabled by default.
After reviewing the policy, enable it with:

```sh
sudo systemctl enable --now guardscale-update.timer
systemctl list-timers guardscale-update.timer
```

It checks after boot and daily, with up to one hour of randomized delay so a fleet
does not restart simultaneously. The timer service skips installation if the monitoring service was deliberately
stopped. It does not restart a stopped agent just because a new release exists.

Check immediately using:

```sh
sudo systemctl start guardscale-update.service
sudo journalctl -u guardscale-update.service -n 30 --no-pager
```

Disable scheduled updates with `sudo systemctl disable --now guardscale-update.timer`.
For fresh enrollment, `GUARDSCALE_AUTO_UPDATE=1` explicitly enables the timer;
the default preserves administrator control. Do not enable an automatic timer
when a maintenance window or pinned enterprise release is required.

## One-time upgrade for older agents

Agents installed before version reporting/self-update cannot run the new update
command. Once the first supporting release is published, bootstrap them with:

```sh
curl -fsSLo /tmp/guardscale-update.sh \
  https://guardscale.s3.us-east-1.amazonaws.com/agent/latest/update-agent.sh
sudo bash /tmp/guardscale-update.sh
```

The bootstrap preserves the current configuration, enrollment token and main
service definition, installs the verified binary and update timer/service, and
backs up the previous executable. It does not enable automatic updates unless
explicitly invoked with `sudo env GUARDSCALE_AUTO_UPDATE=1 bash /tmp/guardscale-update.sh`.
The script is available starting with the first updater-enabled release; older
published releases do not contain it.

## Verification, rollback and deployment boundaries

The release build stamps the agent version and publishes an atomic `release.json`
pointer **after** uploading immutable, versioned artifacts. The updater follows
that pointer once, verifies the architecture-specific executable against the
release's SHA-256 manifest over HTTPS, then checks its embedded version,
architecture and existing configuration before replacement. It never accepts an
artifact URL, executable name or shell command from events, logs or chat replies.
Checksums protect artifact integrity within the trusted HTTPS release origin;
they are not a separate cryptographic publisher signature.

Updates are serialized with a host-local lock. The binary is replaced atomically;
the old executable is retained as `/usr/local/bin/guardscale.previous`. If restart
fails or the service does not remain active during the ten-second startup window,
the updater restores and restarts the previous executable. This checks local
startup, not successful delivery of a remote heartbeat or every later failure.
Remote network outages alone do not trigger rollback. Failed checks/downloads
leave the installed executable unchanged. Automatic downgrades are not performed.

The monitoring daemon retains its existing read-only system protection. A separate
root-owned updater service can write the agent binary directory and its own state;
configuration and enrollment stay read-only. These commands are for Linux hosts
managed by systemd. Container agents continue to update through versioned images
and the normal CloudFormation change-set deployment flow. No AWS resource or
additional secret is needed for a public agent update.
