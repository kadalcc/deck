---
"@kadal/deck": patch
---

`kadal-deck relay` suggests an address a phone can reach. Its "point a build at it" line named the
last network address, which on a computer running virtual machines or containers (OrbStack,
Docker, VMware) is one of their bridges, not the Wi-Fi. It now names the first network address,
the one the dev server's QR code uses; every address is still listed above it.
