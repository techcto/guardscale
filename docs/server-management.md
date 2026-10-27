# Server groups, domains and live host metrics

On **Servers**, the picker at the right filters the fleet by a manual group,
reported stack name, application or website domain. Each server appears once.
Administrators can select the checkboxes on the left, choose/type a group name,
and apply it to the selected servers. **Ungroup** removes the manual Group tag;
an automatic stack/application grouping can remain. Partial failures stay selected
for retry. Grouping organizes the fleet; it does not combine different sources or
erase incident evidence.

The server detail page provides **Edit name and group**. Manual names and tags
survive future heartbeats and override discovered tags with the same key. Clear
the manual name to restore discovery. In **Websites**, enter exact URLs or plain
domain names (plain names use HTTPS). Those domains appear in the fleet picker;
only public eligible sites become uptime checks.

## CPU and memory

Updated Linux agents send small CPU and memory samples about every five seconds.
The server page polls every two seconds and shows utilization, used/total memory,
the age of the latest received sample and a stale indicator. The first CPU sample
is shown as sampling rather than an invented zero. Older agents show a waiting
message until upgraded. No process list, environment variables or raw memory
contents are collected.

CPU is computed from successive `/proc/stat` counters (idle includes I/O wait).
Memory usage is `MemTotal - MemAvailable`, with a free/buffer/cache fallback on
older Linux kernels. Values describe the agent's Linux host; a container can see
its underlying host/VM rather than its own cgroup allowance. These are not
per-process or per-container resource measurements.

In `/etc/guardscale/config.yaml`:

```yaml
control_plane:
  metrics_seconds: 5
```

Valid intervals are 5–300 seconds; use 0 to disable telemetry. Existing agent
configuration defaults to five seconds when the setting is absent. Configuration
changes require an agent restart. Offline samples are not replayed later as live
data. Latest metrics are kept on the enrolled server record and cannot be posted
by an agent enrolled under a different server identity.

See [agent updates](agent-updates.md) for version reporting, verified updates and
the optional daily update timer. Linux host updates use systemd; container and
application deployments continue through their CloudFormation release flow.
