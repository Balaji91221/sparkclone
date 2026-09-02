"""Connectors: saved connections to outside services (Slack, Telegram, Mail,
Discord, outbound webhooks). One module per service; registry.py is the only
reader of stored credentials and hands ready-to-call tools to the agent loops.
"""
