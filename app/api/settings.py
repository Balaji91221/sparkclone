from __future__ import annotations

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from .. import notifications
from ..config import settings as app_config
from .deps import auth

router = APIRouter(prefix="/api/settings", dependencies=[Depends(auth)])


class NotificationSettingsIn(BaseModel):
    notify_on_final_failure: bool = True
    notify_on_pending_approval: bool = True
    notify_on_chat_approval: bool = False
    failure_cooldown_minutes: int = Field(default=60, ge=0, le=1440)


def _out(prefs: dict) -> dict:
    # delivery tells the UI whether notifications actually reach the user.
    return {**prefs,
            "delivery": "email" if app_config.notify_email else "stdout"}


@router.get("/notifications")
def get_notification_settings():
    return _out(notifications.get_settings())


@router.put("/notifications")
def update_notification_settings(body: NotificationSettingsIn):
    return _out(notifications.update_settings(body.model_dump()))
