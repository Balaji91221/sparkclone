"""REST API for connectors. Secret values never leave the server: the list
endpoint reports has_value per field, and connect verifies against the real
service before anything is stored."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from ..connectors import registry
from ..connectors.base import ConnectorError
from ..db import Connector, db_session, utcnow
from .deps import auth

router = APIRouter(prefix="/api/connectors", dependencies=[Depends(auth)])


class ConnectIn(BaseModel):
    config: dict[str, str] = {}
    notify: bool | None = None


def _kind(kind: str) -> str:
    if kind not in registry.SPECS:
        raise HTTPException(404, f"Unknown connector: {kind}")
    return kind


def _row(db, kind: str) -> Connector:
    row = db.get(Connector, kind)
    if row is None:
        raise HTTPException(404, f"{kind} is not connected")
    return row


@router.get("")
def list_connectors():
    return registry.list_status()


@router.post("/{kind}")
def connect(kind: str, body: ConnectIn):
    """Verify the credentials against the service, then save them encrypted.
    Re-saving with blank secret fields keeps the stored secrets."""
    kind = _kind(kind)
    try:
        config = registry.merge_config(kind, body.config)
        identity = registry.spec(kind).verify(config)
    except ConnectorError as e:
        raise HTTPException(422, str(e))
    registry.save(kind, config, identity, body.notify)
    return registry.status(kind)


@router.post("/{kind}/test")
def test_connector(kind: str):
    """Re-verify the stored credentials (and refresh discovered values)."""
    kind = _kind(kind)
    config = registry.load_config(kind)
    if config is None:
        raise HTTPException(404, f"{kind} is not connected")
    try:
        identity = registry.spec(kind).verify(config)
    except ConnectorError as e:
        raise HTTPException(422, str(e))
    registry.save(kind, config, identity)
    return {"ok": True, "identity": identity}


@router.post("/{kind}/toggle")
def toggle_enabled(kind: str):
    kind = _kind(kind)
    with db_session() as db:
        row = _row(db, kind)
        row.enabled = "false" if row.enabled == "true" else "true"
        row.updated_at = utcnow()
        db.commit()
    return registry.status(kind)


@router.post("/{kind}/notify")
def toggle_notify(kind: str):
    kind = _kind(kind)
    if not registry.spec(kind).supports_notify:
        raise HTTPException(400, f"{kind} cannot deliver notifications")
    with db_session() as db:
        row = _row(db, kind)
        row.notify = "false" if row.notify == "true" else "true"
        row.updated_at = utcnow()
        db.commit()
    return registry.status(kind)


@router.delete("/{kind}")
def disconnect(kind: str):
    kind = _kind(kind)
    with db_session() as db:
        db.delete(_row(db, kind))
        db.commit()
    return {"ok": True}
