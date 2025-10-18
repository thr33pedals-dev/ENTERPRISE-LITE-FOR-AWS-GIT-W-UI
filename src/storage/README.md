# Storage Module
## Overview
The `storage` module provides a configurable storage abstraction so the application can save and read processed artifacts from either the local filesystem or remote backends such as Amazon S3 (or any S3-compatible service like MinIO).
## Environment Variables
- `STORAGE_BACKEND` – `local` (default) or `s3`.
- `LOCAL_STORAGE_DIR` – base directory for local storage (default `uploads/processed`).
- `STORAGE_PREFIX` – optional logical prefix (e.g., tenant namespace) added in front of every object key.
- `S3_BUCKET` – S3 bucket name used when `STORAGE_BACKEND=s3`.
- `S3_REGION` – AWS region of the bucket (defaults to AWS SDK configuration if omitted).
- `S3_ENDPOINT` – Optional custom endpoint for S3-compatible storage (e.g., MinIO `http://localhost:9000`).
- `S3_FORCE_PATH_STYLE` – Set to `true` for MinIO / custom endpoints requiring path-style addressing.
- Standard AWS credentials via `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` or IAM role.
## Usage
Import `createStorage` and call `storage.save`, `storage.read`, `storage.exists`, `storage.remove`, or `storage.getDownloadUrl`. The storage implementation is selected at runtime based on the environment variables above.
