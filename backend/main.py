import ipaddress
import socket
import time
from datetime import datetime, timezone
from urllib.parse import urlparse

import httpx
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

app = FastAPI(
    title="DEVIL Ethical Security Toolkit",
    description="Local security utilities and ESP32 Wi-Fi dashboard",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)

START_TIME = time.monotonic()
LAST_HEARTBEAT = None
DEVICE_INFO = {
    "connected": False,
    "name": "DEVIL ESP32",
    "ip": None,
    "uptime": 0,
    "oled": "Unknown",
}
WIFI_RESULTS = []
LAST_SCAN_TIME = None


class WiFiNetwork(BaseModel):
    ssid: str = Field(default="", max_length=128)
    rssi: int = Field(ge=-120, le=0)
    channel: int = Field(default=0, ge=0, le=196)
    security: str = Field(default="Unknown", max_length=64)


class WiFiScanPayload(BaseModel):
    device_name: str = Field(default="DEVIL ESP32", max_length=64)
    device_ip: str = Field(default="", max_length=64)
    networks: list[WiFiNetwork] = Field(default_factory=list, max_length=100)


class HeartbeatPayload(BaseModel):
    device_name: str = Field(default="DEVIL ESP32", max_length=64)
    device_ip: str = Field(default="", max_length=64)
    uptime: int = Field(default=0, ge=0)
    oled: str = Field(default="Unknown", max_length=32)


class HTTPSCheckPayload(BaseModel):
    url: str = Field(min_length=1, max_length=2048)


@app.get("/")
async def root():
    return {
        "app": "DEVIL Ethical Security Toolkit",
        "status": "running",
        "docs": "/docs",
    }


@app.get("/api/health")
async def health():
    return {
        "status": "online",
        "app": "DEVIL",
        "uptime_seconds": int(time.monotonic() - START_TIME),
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


@app.get("/api/device/status")
async def device_status():
    connected = (
        LAST_HEARTBEAT is not None
        and time.monotonic() - LAST_HEARTBEAT <= 30
    )
    DEVICE_INFO["connected"] = connected

    return {
        **DEVICE_INFO,
        "last_heartbeat": (
            datetime.now(timezone.utc).isoformat()
            if connected
            else None
        ),
    }


@app.post("/api/device/heartbeat")
async def device_heartbeat(payload: HeartbeatPayload):
    global LAST_HEARTBEAT

    DEVICE_INFO["name"] = payload.device_name
    DEVICE_INFO["ip"] = payload.device_ip or None
    DEVICE_INFO["uptime"] = payload.uptime
    DEVICE_INFO["oled"] = payload.oled
    DEVICE_INFO["connected"] = True
    LAST_HEARTBEAT = time.monotonic()

    return {
        "success": True,
        "message": "ESP32 heartbeat received",
    }


@app.get("/api/wifi/results")
async def wifi_results():
    return {
        "success": True,
        "source": "ESP32",
        "count": len(WIFI_RESULTS),
        "last_scan": LAST_SCAN_TIME,
        "networks": WIFI_RESULTS,
    }


@app.post("/api/wifi/scan")
async def request_wifi_scan():
    return {
        "success": False,
        "message": (
            "ESP32 scan trigger requires firmware integration. "
            "The ESP32 can upload results to /api/wifi/upload."
        ),
        "esp32_connected": DEVICE_INFO["connected"],
    }


@app.post("/api/wifi/upload")
async def upload_wifi_results(payload: WiFiScanPayload):
    global WIFI_RESULTS, LAST_SCAN_TIME, LAST_HEARTBEAT

    WIFI_RESULTS = [
        network.model_dump()
        for network in payload.networks
    ]
    LAST_SCAN_TIME = datetime.now(timezone.utc).isoformat()
    LAST_HEARTBEAT = time.monotonic()

    DEVICE_INFO["connected"] = True
    DEVICE_INFO["name"] = payload.device_name
    DEVICE_INFO["ip"] = payload.device_ip or None

    return {
        "success": True,
        "message": "Wi-Fi scan results received",
        "count": len(WIFI_RESULTS),
    }


def validate_public_https_url(url):
    parsed = urlparse(url)

    if parsed.scheme.lower() != "https":
        raise HTTPException(
            status_code=400,
            detail="Only HTTPS URLs are supported.",
        )

    if not parsed.hostname:
        raise HTTPException(
            status_code=400,
            detail="Please provide a valid hostname.",
        )

    if parsed.username or parsed.password:
        raise HTTPException(
            status_code=400,
            detail="URLs containing credentials are not allowed.",
        )

    hostname = parsed.hostname.rstrip(".").lower()

    if hostname == "localhost" or hostname.endswith(".localhost"):
        raise HTTPException(
            status_code=400,
            detail="Localhost targets are not allowed.",
        )

    try:
        target_ip = ipaddress.ip_address(hostname)
    except ValueError:
        try:
            addresses = socket.getaddrinfo(
                hostname,
                443,
                type=socket.SOCK_STREAM,
            )
        except socket.gaierror:
            raise HTTPException(
                status_code=400,
                detail="Hostname could not be resolved.",
            )

        if not addresses:
            raise HTTPException(
                status_code=400,
                detail="Hostname could not be resolved.",
            )

        for item in addresses:
            resolved_ip = ipaddress.ip_address(item[4][0])
            if not resolved_ip.is_global:
                raise HTTPException(
                    status_code=400,
                    detail="Hostname resolves to a non-public IP.",
                )
    else:
        if not target_ip.is_global:
            raise HTTPException(
                status_code=400,
                detail="Private IP addresses are not allowed.",
            )

    return parsed


@app.post("/api/security/https-check")
async def https_check(payload: HTTPSCheckPayload):
    url = payload.url.strip()
    parsed = validate_public_https_url(url)

    try:
        async with httpx.AsyncClient(
            timeout=8.0,
            follow_redirects=False,
            verify=True,
            trust_env=False,
        ) as client:
            response = await client.get(
                url,
                headers={
                    "User-Agent": "DEVIL-Security-Checker/1.0"
                },
            )

        return {
            "success": True,
            "url": parsed.hostname,
            "https": True,
            "certificate_valid": True,
            "status_code": response.status_code,
            "redirect_followed": False,
            "message": (
                "TLS certificate validation succeeded. "
                "This does not guarantee that the website is safe."
            ),
        }

    except httpx.TimeoutException:
        raise HTTPException(
            status_code=504,
            detail="The website took too long to respond.",
        )
    except httpx.ConnectError:
        raise HTTPException(
            status_code=502,
            detail="Connection failed or TLS validation failed.",
        )
    except httpx.HTTPError:
        raise HTTPException(
            status_code=502,
            detail="HTTPS request failed.",
        )


@app.get("/api/security/info")
async def security_info():
    return {
        "https_checker": "available",
        "password_checker": "browser-side",
        "wifi_scanner": "waiting_for_esp32_upload",
        "authorized_testing_only": True,
    }