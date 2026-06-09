@@ name: RakNet
@@ desc: Packet-level network API for intercepting, filtering, and sending raw Roblox multiplayer traffic.
@@ accent: #e05c5c

>>> Overview
>>> Introduction
RakNet (abbreviated `rnet`) is the UDP-based protocol Roblox uses for all real-time multiplayer communication. The `rnet` library exposes hooks into this layer, letting you capture outgoing packets, block specific packet types, spoof physics positions, and replay or forge arbitrary packet data.

Every packet begins with a one-byte opcode that identifies its type. The table below maps the opcodes Roblox uses.

>>> Overview
>>> Packet Opcodes
| Opcode | Identifier |
|--------|-----------|
| `0x00` | `ID_CONNECTED_PING` |
| `0x01` | `ID_UNCONNECTED_PING` |
| `0x03` | `ID_CONNECTED_PONG` |
| `0x04` | `ID_DETECT_LOST_CONNECTIONS` |
| `0x05` | `ID_OPEN_CONNECTION_REQUEST_1` |
| `0x06` | `ID_OPEN_CONNECTION_REPLY_1` |
| `0x07` | `ID_OPEN_CONNECTION_REQUEST_2` |
| `0x08` | `ID_OPEN_CONNECTION_REPLY_2` |
| `0x09` | `ID_CONNECTION_REQUEST` |
| `0x10` | `ID_CONNECTION_REQUEST_ACCEPTED` |
| `0x11` | `ID_CONNECTION_ATTEMPT_FAILED` |
| `0x13` | `ID_NEW_INCOMING_CONNECTION` |
| `0x15` | `ID_DISCONNECTION_NOTIFICATION` |
| `0x18` | `ID_INVALID_PASSWORD` |
| `0x1B` | `ID_TIMESTAMP` |
| `0x1C` | `ID_UNCONNECTED_PONG` |
| `0x81` | `ID_SET_GLOBALS` |
| `0x82` | `ID_TEACH_DESCRIPTOR_DICTIONARIES` |
| `0x83` | `ID_DATA` |
| `0x84` | `ID_MARKER` |
| `0x85` | `ID_PHYSICS` |
| `0x86` | `ID_TOUCHES` |
| `0x87` | `ID_CHAT_ALL` |
| `0x88` | `ID_CHAT_TEAM` |
| `0x89` | `ID_REPORT_ABUSE` |
| `0x8A` | `ID_SUBMIT_TICKET` |
| `0x8B` | `ID_CHAT_GAME` |
| `0x8C` | `ID_CHAT_PLAYER` |
| `0x8D` | `ID_CLUSTER` |
| `0x8E` | `ID_PROTOCOL_MISMATCH` |
| `0x8F` | `ID_PREFERRED_SPAWN_NAME` |
| `0x90` | `ID_PROTOCOL_SYNC` |
| `0x91` | `ID_SCHEMA_SYNC` |
| `0x92` | `ID_PLACEID_VERIFICATION` |
| `0x93` | `ID_DICTIONARY_FORMAT` |
| `0x94` | `ID_HASH_MISMATCH` |
| `0x95` | `ID_SECURITYKEY_MISMATCH` |
| `0x96` | `ID_REQUEST_STATS` |
| `0x97` | `ID_NEW_SCHEMA` |

>>> Physics
>>> sendphysics
```
function rnet.sendphysics(<CFrame> value): void
```

Tells the server to locate your character at `value`. Only the position component of the CFrame is currently applied — rotation compression is not yet implemented.

> Rotation is not supported. Only the positional component of the CFrame is transmitted.

>>> Capture
>>> startcapture
```
function rnet.startcapture(): void
```

Begins logging all outgoing packets to Celery's debug console. Each packet is printed with its opcode and raw byte sequence.

>>> Capture
>>> stopcapture
```
function rnet.stopcapture(): void
```

Stops the debug console output started by `rnet.startcapture()`. Has no effect if capture was not active.

>>> Capture
>>> Capture (signal)
`rnet.Capture` is a signal that fires for every outgoing packet while capture is active. Connect a handler to process or display packets however you want — the debug console output and this signal are independent.

The callback receives a packet table with two fields:

- `packet.id` — the opcode byte (`number`)
- `packet.data` — array of all bytes in the packet (`table`)

```lua
local conn = rnet.Capture:Connect(function(packet)
    local bytes = ""
    for _, v in pairs(packet.data) do
        bytes = bytes .. string.format("%02X ", v)
    end
    print(string.format("Packet 0x%02X: %s", packet.id, bytes))
end)

wait(30)
conn:disconnect()
```

>>> Filtering
>>> setfilter
```
function rnet.setfilter(<table> t): void
```

Blocks outgoing packets whose leading bytes match the sequence in `t`. The filter compares the first `#t` bytes of each packet against the table values.

Pass an empty table to clear all filters.

```lua
-- block all ID_DISCONNECTION_NOTIFICATION packets
rnet.setfilter({0x15})

-- clear the filter
rnet.setfilter({})
```

>>> Raw Packets
>>> sendraw
```
function rnet.sendraw(<string|table> value): void
```

Injects a packet directly into the Roblox network stack, bypassing normal game logic. Accepts either a hex-formatted string (bytes separated by spaces) or a table of byte values.

This is the lowest-level send primitive — use it to replay captured packets or forge custom ones.

```lua
-- table form
rnet.sendraw({0x83, 0x03, 0x01, 0x00})

-- hex string form (same packet)
rnet.sendraw("83 03 01 00")
```

>>> Raw Packets
>>> Example — Packet Replay
This example captures the equip-tool packet in Fencing, then replays it after unequipping. The pattern works for any game where you need to re-trigger a server action without the client actually performing it.

```lua
local toolname = "Foil"
local tool = game.Players.LocalPlayer.Backpack[toolname]

game.Players.LocalPlayer.Character.Humanoid:UnequipTools()
wait(0.1)
game.Players.LocalPlayer.Character.Humanoid:EquipTool(tool)

local t = {0}
while not (t[1] == 0x83 and t[2] == 3 and t[3] == 1) do
    t = rnet.getpacket()
end

local equip_packet = ""
for _, v in pairs(t) do
    equip_packet = equip_packet .. string.format("%02X ", v)
end

print("Equip packet:", equip_packet)
setclipboard(equip_packet)

game.Players.LocalPlayer.Character.Humanoid:UnequipTools()
wait(1)
rnet.sendraw(equip_packet)
```

> The tool will appear unequipped visually on other clients because a second animation packet is expected by the server. The physics state is still updated.

>>> Raw Packets
>>> Example — Physics Force
Hold **F** and click any unanchored part to pull it toward you. Click a player's part to teleport them to your position. Press **S** to release the held object, **R** to drop all tools.

Only works on unanchored parts — anchored geometry is ignored by the server's physics authority check.

```lua
local user = game.Players.LocalPlayer
local mouse = user:GetMouse()
local pressed = false
local control = nil

mouse.KeyDown:Connect(function(key)
    if key:lower() == "f" then pressed = true end
    if key:lower() == "s" then control = nil end
    if key:lower() == "r" then
        for _, v in pairs(user.Character:GetChildren()) do
            if v:IsA("Tool") then v.Parent = workspace end
        end
    end
end)

mouse.KeyUp:Connect(function(key)
    if key:lower() == "f" then pressed = false end
end)

mouse.Button1Down:Connect(function()
    if not pressed then return end
    local target = mouse.Target
    if not target or target.Anchored then return end
    local pos = mouse.Hit.p
    for i = 1, 5 do
        rnet.sendposition(pos)
        target.CFrame = user.Character.HumanoidRootPart.CFrame
        control = target
        wait(0.01)
        rnet.sendposition(user.Character.Head.Position)
        wait(0.01)
    end
    user.Character:MoveTo(user.Character.Head.Position)
end)

while wait() do
    if control then
        control.Velocity = Vector3.new(0, 40, 0)
    end
end
```