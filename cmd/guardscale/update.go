package main

import (
	"context"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"os"
	"os/exec"
	"runtime"
	"time"

	"github.com/techcto/guardscale/internal/agentupdate"
	"github.com/techcto/guardscale/internal/buildinfo"
)

func versionCmd(args []string) {
	flags := flag.NewFlagSet("version", flag.ExitOnError)
	asJSON := flags.Bool("json", false, "JSON output")
	_ = flags.Parse(args)
	if *asJSON {
		_ = json.NewEncoder(os.Stdout).Encode(map[string]string{"version": buildinfo.Version, "os": runtime.GOOS, "arch": runtime.GOARCH})
		return
	}
	fmt.Printf("GuardScale %s (%s/%s)\n", buildinfo.Version, runtime.GOOS, runtime.GOARCH)
}
func updateCmd(args []string) {
	flags := flag.NewFlagSet("update", flag.ExitOnError)
	version := flags.String("version", "latest", "stable release version or latest")
	check := flags.Bool("check", false, "check without installing")
	ifRunning := flags.Bool("if-running", false, "skip installation when the monitoring service is stopped")
	config := flags.String("config", "/etc/guardscale/config.yaml", "existing config to validate")
	_ = flags.Parse(args)
	if flags.NArg() != 0 {
		fatal(errors.New("unexpected update argument"))
	}
	if runtime.GOOS != "linux" {
		fatal(errors.New("agent updates require Linux"))
	}
	if !*check {
		if os.Geteuid() != 0 {
			fatal(errors.New("run sudo guardscale update to install; --check does not require root"))
		}
		if _, err := os.Stat("/run/systemd/system"); err != nil {
			fatal(errors.New("self-update requires a systemd host; update container agents through their deployment"))
		}
		if *ifRunning && exec.Command("systemctl", "is-active", "--quiet", "guardscale.service").Run() != nil {
			fmt.Println(`{"skipped":true,"reason":"monitoring_service_stopped"}`)
			return
		}
		if err := os.MkdirAll("/var/lib/guardscale-updater", 0750); err != nil {
			fatal(err)
		}
		unlock, err := agentupdate.Lock("/var/lib/guardscale-updater/update.lock")
		if err != nil {
			fatal(errors.New("another agent update is running"))
		}
		defer unlock()
	}
	ctx, cancel := context.WithTimeout(context.Background(), 4*time.Minute)
	defer cancel()
	manager := agentupdate.Manager{Base: agentupdate.ReleaseBase, Current: buildinfo.Version, Arch: runtime.GOARCH, Binary: "/usr/local/bin/guardscale",
		Validate: func(ctx context.Context, path, target string) error {
			raw, err := exec.CommandContext(ctx, path, "version", "--json").Output()
			if err != nil {
				return errors.New("candidate version command failed")
			}
			var value struct {
				Version string `json:"version"`
				Arch    string `json:"arch"`
				OS      string `json:"os"`
			}
			if json.Unmarshal(raw, &value) != nil || value.Version != target || value.Arch != runtime.GOARCH || value.OS != "linux" {
				return errors.New("candidate version or architecture mismatch")
			}
			if exec.CommandContext(ctx, path, "test-config", "--config", *config).Run() != nil {
				return errors.New("candidate could not validate the existing configuration")
			}
			return nil
		},
		Restart: func(ctx context.Context) error {
			return exec.CommandContext(ctx, "systemctl", "restart", "guardscale.service").Run()
		},
		Healthy: func(ctx context.Context) error {
			for i := 0; i < 10; i++ {
				select {
				case <-ctx.Done():
					return ctx.Err()
				case <-time.After(time.Second):
				}
				if exec.CommandContext(ctx, "systemctl", "is-active", "--quiet", "guardscale.service").Run() != nil {
					return errors.New("agent service is not active")
				}
			}
			return nil
		},
	}
	result, err := manager.Run(ctx, *version, *check)
	if err != nil {
		fatal(err)
	}
	_ = json.NewEncoder(os.Stdout).Encode(result)
}
