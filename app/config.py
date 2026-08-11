from __future__ import annotations

import os
from pydantic import BaseModel


class Settings(BaseModel):
    # LLM provider: "nvidia" (NIM, OpenAI-compatible) or "anthropic"
    llm_provider: str = os.getenv("LLM_PROVIDER", "nvidia")

    # NVIDIA NIM
    nvidia_api_key: str = os.getenv("NVIDIA_API_KEY", "")
    nvidia_base_url: str = os.getenv("NVIDIA_BASE_URL", "https://integrate.api.nvidia.com/v1")
    nvidia_model: str = os.getenv("NVIDIA_MODEL", "nvidia/nemotron-3.5-lightning-30b-a3b")
    nvidia_enable_thinking: bool = os.getenv("NVIDIA_ENABLE_THINKING", "true").lower() == "true"
    nvidia_reasoning_budget: int = int(os.getenv("NVIDIA_REASONING_BUDGET", "16384"))
    nvidia_temperature: float = float(os.getenv("NVIDIA_TEMPERATURE", "1"))
    nvidia_top_p: float = float(os.getenv("NVIDIA_TOP_P", "0.95"))

    # Anthropic (optional fallback provider)
    anthropic_api_key: str = os.getenv("ANTHROPIC_API_KEY", "")
    model: str = os.getenv("SPARK_MODEL", "claude-sonnet-4-6")

    max_tokens: int = int(os.getenv("SPARK_MAX_TOKENS", "16384"))
    max_agent_iterations: int = int(os.getenv("SPARK_MAX_ITERATIONS", "25"))

    # Rate cap for LLM API calls (one shared limiter per provider key).
    # The limiter queues and waits — it never drops requests.
    llm_max_rps: float = float(os.getenv("LLM_MAX_RPS", os.getenv("ANTHROPIC_MAX_RPS", "2")))

    # Database
    database_url: str = os.getenv("DATABASE_URL", "sqlite:///./spark.db")

    # SMTP notifications (optional)
    smtp_host: str = os.getenv("SMTP_HOST", "")
    smtp_port: int = int(os.getenv("SMTP_PORT", "587"))
    smtp_user: str = os.getenv("SMTP_USER", "")
    smtp_password: str = os.getenv("SMTP_PASSWORD", "")
    notify_email: str = os.getenv("NOTIFY_EMAIL", "")

    # IMAP inbox access (optional, powers the email tools)
    imap_host: str = os.getenv("IMAP_HOST", "")
    imap_user: str = os.getenv("IMAP_USER", "")
    imap_password: str = os.getenv("IMAP_PASSWORD", "")

    # Sandbox for code execution
    sandbox_timeout: int = int(os.getenv("SANDBOX_TIMEOUT", "60"))

    # Auth token for the dashboard/API (single-user product)
    api_token: str = os.getenv("SPARK_API_TOKEN", "change-me")

    # Google OAuth (Gmail + Drive). The redirect URL must be registered on the
    # OAuth client in Google Cloud Console; it points at the dashboard origin,
    # which proxies /auth/* to this backend.
    google_client_id: str = os.getenv("GOOGLE_CLIENT_ID", "")
    google_client_secret: str = os.getenv("GOOGLE_CLIENT_SECRET", "")
    oauth_redirect_url: str = os.getenv(
        "OAUTH_REDIRECT_URL", "http://localhost:3000/auth/google/callback")

    # Signs OAuth state values and encrypts stored refresh tokens.
    spark_secret_key: str = os.getenv("SPARK_SECRET_KEY", "dev-secret-change-me")


settings = Settings()
