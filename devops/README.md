# DevOps

Guardian.US uses service-specific Dockerfiles, a root development composition, CloudFormation under `devops/cloudformation`, and tag-driven multi-image releases. Guardian uses `gaurdian-us` for versioned release artifacts by default. AWS account identity and credentials are supplied only through GitHub variables/secrets and are never committed.
