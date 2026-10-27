//go:build !linux

package agentupdate

import "errors"

func Lock(string) (func(), error) { return nil, errors.New("agent self-update requires Linux") }
