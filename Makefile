.PHONY: check build web-build
check:
	gofmt -w .
	go vet ./...
	go test ./...
	npm run typecheck
	npm run lint
build:
	CGO_ENABLED=0 go build -trimpath -o bin/guardian ./cmd/guardian
web-build:
	npm run build
