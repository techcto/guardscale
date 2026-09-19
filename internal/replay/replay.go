package replay

import (
	"bufio"
	"github.com/guardian-us/guardian/internal/apache"
	"github.com/guardian-us/guardian/internal/config"
	"github.com/guardian-us/guardian/internal/detection"
	"github.com/guardian-us/guardian/internal/phpfpm"
	"os"
	"time"
)

type Result struct {
	Requests []apache.Request
	PHP      []phpfpm.Event
	Findings []detection.Finding
}

func Run(access, slow string, c config.Config) (Result, error) {
	p, e := apache.New(c.Proxy.TrustedCIDRs, c.Origin.ProtectedHosts)
	if e != nil {
		return Result{}, e
	}
	var r Result
	f, e := os.Open(access)
	if e != nil {
		return r, e
	}
	s := bufio.NewScanner(f)
	for s.Scan() {
		q, e := p.ParseGuardian(s.Text())
		if e != nil {
			q, e = p.ParseCombined(s.Text())
		}
		if e == nil {
			r.Requests = append(r.Requests, q)
		}
	}
	f.Close()
	if e = s.Err(); e != nil {
		return r, e
	}
	if slow != "" {
		if f, e = os.Open(slow); e == nil {
			s = bufio.NewScanner(f)
			for s.Scan() {
				r.PHP = append(r.PHP, phpfpm.Parse(s.Text(), time.Now()))
			}
			f.Close()
		}
	}
	r.Findings = detection.Evaluate(detection.Snapshot{Requests: r.Requests, PHP: r.PHP, BaselineRPM: 60}, c)
	return r, nil
}
