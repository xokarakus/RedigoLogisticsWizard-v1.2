-- Refresh token storage for JWT rotation
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash VARCHAR(128) NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at TIMESTAMPTZ,
  ip_address VARCHAR(45),
  user_agent TEXT
);

CREATE INDEX IF NOT EXISTS idx_rt_user ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_rt_hash ON refresh_tokens(token_hash) WHERE revoked_at IS NULL;

-- Cleanup: eski revoke edilmis tokenları periyodik silmek icin
CREATE INDEX IF NOT EXISTS idx_rt_expired ON refresh_tokens(expires_at) WHERE revoked_at IS NOT NULL;
