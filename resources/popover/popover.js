const invoke = window.__TAURI__.core.invoke;
const { listen } = window.__TAURI__.event;
const _win = window.__TAURI__.window.getCurrentWindow();

const HOURLY_LIMIT = 3;
const DAILY_LIMIT = 12;

let _validCache = null;
let _tickTimer = null;
let _allScripts = [];
let _pinned = _readStoredList('v_p');
let _isRefreshing = false;

const COMMANDS = [
  {
    id: 'server-hop',
    title: 'Server Hop',
    desc: 'Pulls the live public server list and teleports you into a random non-full server instantly.',
    icon: 'shuffle',
    code: `local Players = game:GetService("Players")
local TeleportService = game:GetService("TeleportService")
local HttpService = game:GetService("HttpService")
local Player = Players.LocalPlayer
local servers = {}
local ok, req = pcall(function()
    return HttpService:JSONDecode(game:HttpGet(
        "https://games.roblox.com/v1/games/" .. game.PlaceId ..
        "/servers/Public?sortOrder=Desc&limit=100&excludeFullGames=true"))
end)
if not ok then
    print("[VelocityUI] Failed to fetch server list")
    return
end
for _, v in pairs(req.data or {}) do
    if v.id ~= game.JobId and v.playing < v.maxPlayers then
        table.insert(servers, v.id)
    end
end
if #servers > 0 then
    TeleportService:TeleportToPlaceInstance(game.PlaceId, servers[math.random(#servers)], Player)
else
    print("[VelocityUI] No available servers found")
end`,
  },
  {
    id: 'anti-afk',
    title: 'Anti AFK',
    desc: 'Blocks the idle disconnect — cuts signal connections if supported, otherwise falls back to VirtualUser input simulation.',
    icon: 'shield-check',
    code: `local Players = game:GetService("Players")
local Player = Players.LocalPlayer
local GC = getconnections or get_signal_cons
if GC then
    for _, c in pairs(GC(Player.Idled)) do
        if c.Disable then c:Disable() end
        if c.Disconnect then c:Disconnect() end
    end
else
    local VirtualUser = cloneref and cloneref(game:GetService("VirtualUser"))
        or game:GetService("VirtualUser")
    getgenv().AntiAFKConnection = Player.Idled:Connect(function()
        VirtualUser:CaptureController()
        VirtualUser:ClickButton2(Vector2.new())
    end)
end
print("[VelocityUI] Anti-AFK active")`,
  },
  {
    id: 'infinite-jump',
    title: 'Infinite Jump',
    desc: 'Lets you jump again mid-air by re-triggering the jump state on every input, no height limit.',
    icon: 'chevrons-up',
    code: `local UIS = game:GetService("UserInputService")
local Players = game:GetService("Players")
local player = Players.LocalPlayer
local humanoid
local jumping = false
local function getHumanoid(char)
    humanoid = char:WaitForChild("Humanoid")
end
if player.Character then getHumanoid(player.Character) end
player.CharacterAdded:Connect(getHumanoid)
UIS.JumpRequest:Connect(function()
    if humanoid and not jumping then
        jumping = true
        humanoid:ChangeState(Enum.HumanoidStateType.Jumping)
        task.wait(0.1)
        jumping = false
    end
end)
print("[VelocityUI] Infinite jump active")`,
  },
  {
    id: 'copy-server',
    title: 'Copy Server Info',
    desc: 'Copies the current PlaceId and JobId to your clipboard — useful for rejoining or reporting a server.',
    icon: 'copy',
    code: `local nl = string.char(10)
local text = "PlaceId: " .. tostring(game.PlaceId) .. nl .. "JobId: " .. tostring(game.JobId)
local clip = setclipboard or toclipboard
if type(clip) == "function" then
    pcall(clip, text)
    print("[VelocityUI] Server info copied")
else
    print("[VelocityUI] Clipboard unavailable" .. nl .. text)
end`,
  },
  {
    id: 'job-join',
    title: 'Job ID Joiner',
    desc: 'Paste a Job ID and teleport directly into that specific server instance.',
    icon: 'log-in',
    needsInput: true,
    inputPlaceholder: 'Paste Job ID…',
    code: `local TeleportService = game:GetService("TeleportService")
local Players = game:GetService("Players")
local jobId = "__INPUT__"
if jobId == "" then
    print("[VelocityUI] No Job ID provided")
    return
end
TeleportService:TeleportToPlaceInstance(game.PlaceId, jobId, Players.LocalPlayer)
print("[VelocityUI] Joining server: " .. jobId)`,
  },
  {
    id: 'rejoin',
    title: 'Rejoin Server',
    desc: "Reconnects you to the same server. If you're alone it force-kicks first to clear the session properly.",
    icon: 'rotate-ccw',
    code: `local Players = game:GetService("Players")
local TeleportService = game:GetService("TeleportService")
local Player = Players.LocalPlayer
if #Players:GetPlayers() <= 1 then
    Player:Kick("Rejoining...")
    task.wait()
    TeleportService:Teleport(game.PlaceId, Player)
else
    TeleportService:TeleportToPlaceInstance(game.PlaceId, game.JobId, Player)
end`,
  },
  {
    id: 'fps-60',
    title: 'Cap FPS 60',
    desc: 'Locks the frame rate to 60 via setfpscap — reduces CPU/GPU load on executors that support it.',
    icon: 'gauge',
    code: `if type(setfpscap) == "function" then
    setfpscap(60)
    print("[VelocityUI] FPS cap set to 60")
else
    print("[VelocityUI] setfpscap is unavailable")
end`,
  },
  {
    id: 'low-graphics',
    title: 'Low Graphics',
    desc: 'Strips reflections, kills particles, trails, beams and post-processing effects across the entire workspace.',
    icon: 'eye-off',
    code: `local Lighting = game:GetService("Lighting")
for _, obj in ipairs(workspace:GetDescendants()) do
    if obj:IsA("BasePart") then
        obj.Material = Enum.Material.SmoothPlastic
        obj.Reflectance = 0
    elseif obj:IsA("ParticleEmitter") or obj:IsA("Trail") or obj:IsA("Beam") then
        obj.Enabled = false
    end
end
for _, obj in ipairs(Lighting:GetChildren()) do
    if obj:IsA("PostEffect") then obj.Enabled = false end
end
print("[VelocityUI] Low graphics applied")`,
  },
];

(function injectStyles() {
  const style = document.createElement('style');
  style.textContent = `
    .cmd-wrap { display: flex; flex-direction: column; margin-bottom: 4px; }
    .cmd-wrap .cmd-row { margin-bottom: 0; }
    .cmd-wrap.open .cmd-row {
      border-bottom-left-radius: 6px;
      border-bottom-right-radius: 6px;
      border-color: var(--line);
      background: rgba(255,255,255,0.045);
      color: var(--text);
    }
    .cmd-input-row {
      display: none;
      align-items: center;
      gap: 6px;
      padding: 7px 8px;
      border: 1px solid var(--line);
      border-top: none;
      border-radius: 0 0 13px 13px;
      background: rgba(255,255,255,0.018);
    }
    .cmd-wrap.open .cmd-input-row { display: flex; }
    .cmd-input {
      flex: 1;
      min-width: 0;
      height: 28px;
      padding: 0 9px;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: var(--panel);
      color: var(--text);
      font: 500 11px var(--mono);
      transition: background 140ms var(--ease), border-color 140ms var(--ease);
    }
    .cmd-input:focus { background: var(--card); border-color: var(--line-hi); outline: none; }
    .cmd-input::placeholder { color: var(--text-4); }
    .cmd-go {
      display: grid;
      place-items: center;
      height: 28px;
      padding: 0 12px;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: var(--card);
      color: var(--text-2);
      font: 700 10px var(--sans);
      letter-spacing: 0.04em;
      cursor: pointer;
      white-space: nowrap;
      transition: color 120ms var(--ease), background 120ms var(--ease), border-color 120ms var(--ease);
      flex-shrink: 0;
    }
    .cmd-go:hover { color: var(--text); background: var(--card-hi); border-color: var(--line-hi); }
    .cmd-go:active { opacity: 0.7; }
  `;
  document.head.appendChild(style);
})();

const el = {
  keySec: document.getElementById('key-section'),
  expVal: document.getElementById('exp-val'),
  expSub: document.getElementById('exp-sub'),
  keyDisp: document.getElementById('key-display'),
  btnCopy: document.getElementById('btn-copy'),
  btnRefresh: document.getElementById('btn-refresh'),
  ringH: document.getElementById('ring-h'),
  ringD: document.getElementById('ring-d'),
  ringHN: document.getElementById('ring-h-n'),
  ringDN: document.getElementById('ring-d-n'),
  list: document.getElementById('list'),
  listLoader: document.getElementById('list-loader'),
  scriptsView: document.getElementById('scripts-view'),
  commandsView: document.getElementById('commands-view'),
  tabScripts: document.getElementById('tab-scripts'),
  tabCommands: document.getElementById('tab-commands'),
  commandList: document.getElementById('command-list'),
  empty: document.getElementById('empty'),
  count: document.getElementById('count'),
  search: document.getElementById('search-input'),
  status: document.getElementById('status'),
  dot: document.getElementById('status-dot'),
};

function hourKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}T${String(d.getHours()).padStart(2, '0')}`;
}

function dayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function _countFrom(map, key) {
  const value = Number(map?.[key] ?? 0);
  return Number.isFinite(value) ? value : 0;
}

function _readStoredList(key) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || '[]');
    return Array.isArray(value) ? value.filter((item) => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

function setRing(ring, numEl, val, max) {
  if (!ring || !numEl) return;
  const value = Math.max(0, Number(val) || 0);
  const cap = Math.max(0, Number(max) || 0);
  const pct = cap > 0 ? Math.min(value / cap, 1) : 0;
  const radius = Number(ring.getAttribute('r')) || 20;
  const circ = 2 * Math.PI * radius;
  const offset = circ * (1 - pct);
  ring.style.setProperty('stroke-dasharray', String(circ));
  ring.style.setProperty('stroke-dashoffset', String(offset));
  ring.setAttribute('stroke-dasharray', String(circ));
  ring.setAttribute('stroke-dashoffset', String(offset));
  ring.classList.toggle('warn', pct >= 0.75);
  numEl.textContent = String(value);
}

function _updateRingsFromCache(cache) {
  setRing(el.ringH, el.ringHN, _countFrom(cache?.hourly_counts, hourKey()), HOURLY_LIMIT);
  setRing(el.ringD, el.ringDN, _countFrom(cache?.daily_counts, dayKey()), DAILY_LIMIT);
}

async function _recordInject() {
  const [h, d] = await invoke('record_inject_cmd', {
    hourKey: hourKey(),
    dayKey: dayKey(),
  });
  setRing(el.ringH, el.ringHN, h, HOURLY_LIMIT);
  setRing(el.ringD, el.ringDN, d, DAILY_LIMIT);
}

async function runScript(s) {
  if (el.dot.classList.contains('busy')) return;
  el.status.textContent = 'Injecting';
  el.dot.classList.add('busy');
  try {
    await invoke('inject_script', { code: s.content });
    await _recordInject();
    el.status.textContent = 'Success';
  } catch (e) {
    console.error('Script injection failed:', e);
    el.status.textContent = 'Failed';
  } finally {
    el.dot.classList.remove('busy');
    setTimeout(() => (el.status.textContent = 'Ready'), 2000);
  }
}

function renderCommands() {
  if (!el.commandList) return;
  el.commandList.innerHTML = '';

  COMMANDS.forEach((cmd) => {
    const wrap = document.createElement('div');
    wrap.className = 'cmd-wrap';

    const row = document.createElement('button');
    row.className = 'cmd-row';
    row.type = 'button';
    row.innerHTML = `
      <span class="cmd-icon"><i data-lucide="${cmd.icon}"></i></span>
      <span class="cmd-copy">
        <span class="cmd-title">${cmd.title}</span>
        <span class="cmd-desc">${cmd.desc}</span>
      </span>`;

    if (cmd.needsInput) {
      const inputRow = document.createElement('div');
      inputRow.className = 'cmd-input-row';

      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'cmd-input';
      input.placeholder = cmd.inputPlaceholder || 'Enter value…';
      input.spellcheck = false;
      input.autocomplete = 'off';

      const goBtn = document.createElement('button');
      goBtn.type = 'button';
      goBtn.className = 'cmd-go';
      goBtn.textContent = 'Join';

      const doJoin = () => {
        const jobId = input.value.trim();
        if (!jobId) {
          input.focus();
          return;
        }
        const resolvedCode = cmd.code.replace('__INPUT__', jobId);
        runCommand({ ...cmd, code: resolvedCode });
        wrap.classList.remove('open');
        input.value = '';
      };

      goBtn.onclick = (e) => {
        e.stopPropagation();
        doJoin();
      };
      input.onkeydown = (e) => {
        if (e.key === 'Enter') doJoin();
        e.stopPropagation();
      };
      inputRow.onclick = (e) => e.stopPropagation();

      inputRow.appendChild(input);
      inputRow.appendChild(goBtn);

      row.onclick = () => {
        const opening = !wrap.classList.contains('open');
        wrap.classList.toggle('open', opening);
        if (opening) setTimeout(() => input.focus(), 20);
      };

      wrap.appendChild(row);
      wrap.appendChild(inputRow);
    } else {
      row.onclick = () => runCommand(cmd);
      wrap.appendChild(row);
    }

    el.commandList.appendChild(wrap);
  });

  if (typeof lucide !== 'undefined') lucide.createIcons();
}

function setView(view) {
  const commands = view === 'commands';
  if (el.scriptsView) el.scriptsView.hidden = commands;
  if (el.commandsView) el.commandsView.hidden = !commands;
  el.tabScripts?.classList.toggle('active', !commands);
  el.tabCommands?.classList.toggle('active', commands);
  el.tabScripts?.setAttribute('aria-selected', String(!commands));
  el.tabCommands?.setAttribute('aria-selected', String(commands));
  el.count.textContent = commands ? `${COMMANDS.length} Commands` : `${_allScripts.length} Scripts`;
}

async function runCommand(cmd) {
  if (el.dot.classList.contains('busy')) return;
  el.status.textContent = cmd.title;
  el.dot.classList.add('busy');
  try {
    await invoke('inject_script', { code: cmd.code });
    await _recordInject();
    el.status.textContent = 'Sent';
  } catch (e) {
    console.error('Command failed:', e);
    el.status.textContent = 'Failed';
  } finally {
    el.dot.classList.remove('busy');
    setTimeout(() => (el.status.textContent = 'Ready'), 1800);
  }
}

function renderScripts(query = '') {
  el.list.querySelectorAll('.srow').forEach((n) => n.remove());
  const filtered = _allScripts
    .filter((s) => s.name.toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) => {
      const aP = _pinned.includes(a.name),
        bP = _pinned.includes(b.name);
      return aP === bP ? a.name.localeCompare(b.name) : aP ? -1 : 1;
    });
  el.empty.style.display = filtered.length ? 'none' : 'block';
  if (!el.commandsView?.hidden) el.count.textContent = `${COMMANDS.length} Commands`;
  else el.count.textContent = `${filtered.length} Scripts`;
  filtered.forEach((s) => {
    const isPinned = _pinned.includes(s.name);
    const row = document.createElement('div');
    row.className = `srow ${isPinned ? 'is-pinned' : ''}`;
    row.innerHTML = `
      <div class="s-name">${s.name}</div>
      <div class="s-pin">
        <svg viewBox="0 0 24 24" fill="${isPinned ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2.5" width="14"><path d="M12 2L15 8.5L22 9.2L17 14L18.5 21L12 17.5L5.5 21L7 14L2 9.2L9 8.5L12 2Z"/></svg>
      </div>`;
    row.querySelector('.s-pin').onclick = (e) => {
      e.stopPropagation();
      _pinned = isPinned ? _pinned.filter((p) => p !== s.name) : [..._pinned, s.name];
      localStorage.setItem('v_p', JSON.stringify(_pinned));
      renderScripts(el.search.value);
    };
    row.onclick = () => runScript(s);
    el.list.appendChild(row);
  });
}

function _startTick() {
  if (_tickTimer) clearInterval(_tickTimer);
  _tickTimer = setInterval(() => {
    if (!_validCache) return;
    const expiresAt = _validCache.expires_at;
    if (expiresAt == null) {
      el.expVal.textContent = 'No Expiry';
      el.expSub.textContent = 'Key loaded';
      return;
    }
    const rem = expiresAt - Date.now() / 1000;
    if (rem <= 0) {
      el.expVal.textContent = 'Expired';
      el.expSub.textContent = 'Revalidate Required';
      return;
    }
    const h = Math.floor(rem / 3600);
    const m = Math.floor((rem % 3600) / 60);
    el.expVal.textContent = h > 0 ? `${h}h ${m}m` : `${m}m ${Math.floor(rem % 60)}s`;
    el.expSub.textContent = `Until ${new Date(expiresAt * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  }, 1000);
}

async function refresh(force = false) {
  if (_isRefreshing && !force) return;
  _isRefreshing = true;
  el.listLoader.classList.add('active');
  try {
    const uiStateData = await invoke('load_ui_state_cmd').catch(() => ({}));
    const executor = uiStateData?.settings?.executor ?? 'opium';
    const isHydro = executor === 'hydrogen';
    el.keySec.classList.toggle('hidden', !isHydro);

    if (isHydro) {
      const c = await invoke('get_key_cache').catch(() => null);
      if (c?.valid) {
        _validCache = c;
        el.keyDisp.textContent = c.key || '—';
        _updateRingsFromCache(c);
        _startTick();
      } else {
        el.expVal.textContent = c?.error ? 'Error' : 'Invalid';
        el.expSub.textContent = c?.error ?? 'Key expired or missing';
        _updateRingsFromCache(c);
      }
    }

    _allScripts = await invoke('get_scripts').catch(() => []);
    renderScripts(el.search.value);
  } finally {
    _isRefreshing = false;
    el.listLoader.classList.remove('active');
  }
}

el.search.oninput = (e) => renderScripts(e.target.value);
el.tabScripts?.addEventListener('click', () => setView('scripts'));
el.tabCommands?.addEventListener('click', () => setView('commands'));

el.btnRefresh.onclick = async () => {
  if (el.btnRefresh.disabled) return;
  el.btnRefresh.disabled = true;
  el.btnRefresh.classList.add('spinning');
  el.status.textContent = 'Validating';
  try {
    const result = await invoke('validate_key');
    _validCache = result;
    if (result?.valid) {
      el.keyDisp.textContent = result.key || '—';
      _updateRingsFromCache(result);
      _startTick();
    }
    await refresh(true);
    el.status.textContent = 'Updated';
  } catch {
    el.status.textContent = 'Error';
  } finally {
    el.btnRefresh.disabled = false;
    el.btnRefresh.classList.remove('spinning');
    setTimeout(() => (el.status.textContent = 'Ready'), 2000);
  }
};

el.btnCopy.onclick = async () => {
  if (!_validCache?.key) return;
  const old = el.status.textContent;
  try {
    await invoke('write_clipboard', { text: _validCache.key });
    el.status.textContent = 'Copied';
  } catch {
    el.status.textContent = 'Copy failed';
  }
  setTimeout(() => (el.status.textContent = old), 1500);
};

_win.listen('tauri://blur', () => _win.hide());
listen('popover:refresh', () => refresh(true));
renderCommands();
setView('scripts');
_updateRingsFromCache(null);
refresh();
