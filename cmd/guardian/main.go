package main

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"github.com/guardian-us/guardian/internal/config"
	"github.com/guardian-us/guardian/internal/incidents"
	"github.com/guardian-us/guardian/internal/replay"
	"log/slog"
	"os"
	"os/signal"
	"path/filepath"
	"syscall"
	"time"
)

func main() {
	if len(os.Args) < 2 {
		usage()
		os.Exit(2)
	}
	switch os.Args[1] {
	case "test-config":
		withConfig(os.Args[2:], func(c config.Config) { fmt.Println("configuration valid") })
	case "health":
		fmt.Println(`{"status":"ok","component":"guardian"}`)
	case "status":
		withConfig(os.Args[2:], status)
	case "incidents":
		withConfig(os.Args[2:], list)
	case "diagnostics":
		withConfig(os.Args[2:], diag)
	case "replay":
		replayCmd(os.Args[2:])
	case "run":
		run(os.Args[2:])
	case "protection":
		fmt.Println("protection disabled (Phase 1 safe default)")
	default:
		usage()
		os.Exit(2)
	}
}
func usage() {
	fmt.Fprintln(os.Stderr, "guardian run|status|health|test-config|incidents|diagnostics|replay <apache-log>")
}
func withConfig(a []string, fn func(config.Config)) {
	f := flag.NewFlagSet("config", flag.ExitOnError)
	p := f.String("config", "configs/config.example.yaml", "config path")
	_ = f.Parse(a)
	c, e := config.Load(*p)
	if e != nil {
		fatal(e)
	}
	fn(c)
}
func status(c config.Config) {
	ids, e := incidents.List(c.Storage.StateDir)
	if e != nil {
		fatal(e)
	}
	fmt.Printf("server=%s tenant=%s protection_enabled=%t dry_run=%t incidents=%d\n", c.Server.ID, c.Server.Tenant, c.Protection.Enabled, c.Protection.DryRun, len(ids))
}
func list(c config.Config) {
	ids, e := incidents.List(c.Storage.StateDir)
	if e != nil {
		fatal(e)
	}
	for _, x := range ids {
		fmt.Println(x)
	}
}
func diag(c config.Config) {
	for _, p := range []string{c.Logs.ApacheAccess, c.Logs.ApacheError, c.Logs.PHPError, c.Logs.PHPSlow} {
		if p == "" {
			continue
		}
		_, e := os.Stat(p)
		fmt.Printf("%s: %v\n", p, e == nil)
	}
}
func replayCmd(a []string) {
	f := flag.NewFlagSet("replay", flag.ExitOnError)
	p := f.String("config", "configs/config.example.yaml", "config")
	slow := f.String("php-slow", "", "PHP slow log")
	out := f.String("output", "", "state dir override")
	_ = f.Parse(a)
	if f.NArg() != 1 {
		fatal(fmt.Errorf("replay requires an Apache log"))
	}
	c, e := config.Load(*p)
	if e != nil {
		fatal(e)
	}
	if *out != "" {
		c.Storage.StateDir = *out
	}
	r, e := replay.Run(f.Arg(0), *slow, c)
	if e != nil {
		fatal(e)
	}
	enc := json.NewEncoder(os.Stdout)
	enc.SetIndent("", "  ")
	_ = enc.Encode(r.Findings)
	st := incidents.StateFor(r.Findings)
	if st != incidents.Normal && st != incidents.Watch {
		in := incidents.New(c.Server.ID, c.Server.Tenant, r.Findings, time.Now().UTC())
		dir, e := incidents.WriteBundle(c.Storage.StateDir, in, r.Requests, r.PHP, c.Storage.MaxEvidenceLines)
		if e != nil {
			fatal(e)
		}
		fmt.Fprintln(os.Stderr, "incident bundle:", dir)
	}
}
func run(a []string) {
	withConfig(a, func(c config.Config) {
		ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
		defer stop()
		slog.Info("guardian started", "server_id", c.Server.ID)
		<-ctx.Done()
		slog.Info("guardian stopped")
	})
}
func fatal(e error) { fmt.Fprintln(os.Stderr, "guardian:", e); os.Exit(1) }

var _ = context.Background
var _ = filepath.Join
