CREATE TABLE auth_revoked_tokens (
  jti UUID PRIMARY KEY,
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX auth_revoked_tokens_expires_at_idx ON auth_revoked_tokens (expires_at);