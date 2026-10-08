"""Advertise a private IPv4 address for the local H5 preview."""
import ipaddress
import os
import socket


def lan_access():
    host = os.getenv("HOST", "0.0.0.0")
    port = int(os.getenv("PORT", "5000"))
    candidates = []
    try:
        # A UDP connect selects the route without sending any packet.
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as route:
            route.connect(("192.0.2.1", 80))
            candidates.append(route.getsockname()[0])
    except OSError:
        pass
    if not candidates:
        try:
            candidates = [item[4][0] for item in socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET)]
        except OSError:
            pass
    private_ranges = [ipaddress.ip_network(value) for value in ("10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16")]
    addresses = list(dict.fromkeys(ip for ip in candidates if any(ipaddress.ip_address(ip) in block for block in private_ranges)))
    enabled = host in ("0.0.0.0", "::") or host in addresses
    return {"enabled": enabled, "urls": [f"http://{ip}:{port}" for ip in addresses] if enabled else [], "localUrl": f"http://127.0.0.1:{port}"}
