package agentruntime

import (
	"context"
	"github.com/techcto/guardscale/internal/config"
)

// Run collects real configured log sources and delivers bounded, retryable batches.
func Run(ctx context.Context, c config.Config) error { return collect(ctx, c) }
