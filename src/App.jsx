import { useState, useEffect, useRef, useCallback } from "react";

// ─── Design tokens ─────────────────────────────────────────────────────────
const C = {
  bg:          "#0a0806",
  surface:     "#141210",
  surfaceHigh: "#1e1b16",
  border:      "#2e2820",
  borderFocus: "rgba(232,217,160,0.4)",
  gold:        "#e8d9a0",   // primary text  — ~10:1 on bg
  goldMid:     "#c4b78a",   // secondary text — ~7:1 on bg
  goldDim:     "#9a8a72",   // tertiary text  — ~5:1 on bg
  goldFaint:   "#6a5a48",   // placeholders   — ~3:1 on bg
};

// ─── Constants ─────────────────────────────────────────────────────────────
const PARTICLE_TYPES = ["rain", "ember", "dust", "snow", "ash"];
const DARK_PALETTE   = ["#060e18","#080f04","#120800","#0a0a06","#140c02","#0e0204","#04060e","#040404","#0a060e","#120a04"];
const TABS = [
  { id: "stage",  label: "Stage" },
  { id: "audio",  label: "Audio" },
  { id: "notes",  label: "Notes" },
  { id: "plan",   label: "Plan" },
  { id: "scenes", label: "Scenes" },
  { id: "help",   label: "Guide" },
];

const DEFAULT_PRESETS = [
  { id:"p1", name:"Rest",     icon:"🌙", tension:8,   dayNight:15 },
  { id:"p2", name:"Travel",   icon:"🛤️", tension:22,  dayNight:58 },
  { id:"p3", name:"Uneasy",   icon:"⚠️", tension:48,  dayNight:30 },
  { id:"p4", name:"Combat",   icon:"⚔️", tension:82,  dayNight:18 },
  { id:"p5", name:"Boss",     icon:"💀", tension:100, dayNight:5  },
  { id:"p6", name:"Custom",   icon:"⭐", tension:50,  dayNight:50 },
];

const DEFAULT_SCENES = [
  { id:"docks",   name:"Likandir Docks",   icon:"⚓", color:"#060e18", particle:"rain",  calm:"Harbour waves, distant gulls",     tense:"Storm bells, rushing sailors",     musicHint:"harbour storm fantasy",      ambientHint:"rain ocean waves" },
  { id:"village", name:"Farming Village",  icon:"🌾", color:"#080f04", particle:"dust",  calm:"Wind through fields, crickets",     tense:"Distant drums, hushed voices",    musicHint:"peaceful medieval village",  ambientHint:"countryside wind birds" },
  { id:"court",   name:"Heartland Court",  icon:"👑", color:"#120800", particle:"ember", calm:"Stone halls, muted strings",        tense:"Low brass, marching boots",       musicHint:"royal court orchestral",     ambientHint:"stone hall fireplace" },
  { id:"road",    name:"Kingdom Road",     icon:"🛤️", color:"#0a0a06", particle:"dust",  calm:"Forest wind, distant birds",        tense:"Snapping branches, silence",      musicHint:"adventure travel fantasy",   ambientHint:"forest wind nature" },
  { id:"tavern",  name:"Tavern",           icon:"🍺", color:"#140c02", particle:"ember", calm:"Lute and laughter, fire crackle",   tense:"Hushed argument, scraping chairs",musicHint:"medieval tavern lute",       ambientHint:"tavern fireplace crowd" },
  { id:"meeting", name:"War Council",      icon:"⚔️", color:"#0e0204", particle:"ash",   calm:"Quiet tension, quill on parchment", tense:"Raised voices, fist on table",    musicHint:"war council dramatic tense", ambientHint:"dark tension ambient" },
  { id:"orc",     name:"Orc Kingdoms",     icon:"🏔️", color:"#04060e", particle:"snow",  calm:"Mountain wind, deep chants",        tense:"War drums, rumbling earth",       musicHint:"orc tribal war drums",       ambientHint:"mountain wind blizzard" },
  { id:"dark",    name:"Unknown Dark",     icon:"🌑", color:"#040404", particle:"ash",   calm:"Distant drips, deep silence",       tense:"Low drones, heartbeat bass",      musicHint:"dark dungeon horror",        ambientHint:"cave drips darkness" },
];
const DEFAULT_SOUNDBOARD = Array.from({ length: 8 }, () => ({ name:"", icon:"♦", url:"" }));
const EMPTY_SDATA = { musicUrl:"", ambientUrl:"", bgImage:null, notes:"", spotifyUrl:"" };

// ─── Spotify constants ────────────────────────────────────────────────────
const SPOTIFY_CLIENT_ID  = "96b844a4f9a141929ee518cac9a33137";
const SPOTIFY_REDIRECT   = typeof window !== "undefined" ? window.location.origin : "";
const SPOTIFY_SCOPES     = "streaming user-read-email user-read-private";

// ─── Spotify PKCE helpers ─────────────────────────────────────────────────
async function spVerifier() {
  const arr = new Uint8Array(32);
  crypto.getRandomValues(arr);
  return btoa(String.fromCharCode(...arr)).replace(/\+/g,"-").replace(/\//g,"_").replace(/=/g,"");
}
async function spChallenge(v) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(v));
  return btoa(String.fromCharCode(...new Uint8Array(digest))).replace(/\+/g,"-").replace(/\//g,"_").replace(/=/g,"");
}
async function spFetchToken(params) {
  const r = await fetch("https://accounts.spotify.com/api/token", {
    method:"POST", headers:{"Content-Type":"application/x-www-form-urlencoded"},
    body: new URLSearchParams(params),
  });
  return r.json();
}
function parseSpotifyUrl(input) {
  if (!input?.trim()) return null;
  try {
    if (input.startsWith("spotify:")) {
      const p = input.split(":");
      return { type:p[1], uri:input };
    }
    const url = new URL(input);
    const p = url.pathname.split("/").filter(Boolean);
    if (p.length >= 2) return { type:p[0], uri:`spotify:${p[0]}:${p[1]}` };
  } catch {}
  return null;
}

// ─── Helpers ───────────────────────────────────────────────────────────────
function hexToTint(hex) {
  try {
    const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
    return `rgba(${Math.min(255,r*5)},${Math.min(255,g*5)},${Math.min(255,b*5)},0.70)`;
  } catch { return "rgba(20,20,20,0.68)"; }
}
function getYouTubeId(input) {
  if (!input?.trim()) return null;
  try {
    const url = new URL(input);
    const v = url.searchParams.get("v") || url.pathname.split("/").pop();
    return v && /^[a-zA-Z0-9_-]{6,15}$/.test(v) ? v : null;
  } catch {
    const id = input.trim();
    // Reject search terms (spaces) — only accept real-looking video IDs
    return /^[a-zA-Z0-9_-]{6,15}$/.test(id) ? id : null;
  }
}
function getMood(scene, tension) {
  if (!scene) return "Choose a scene to begin";
  if (tension < 35) return scene.calm;
  if (tension < 70) return "Tension building…";
  return scene.tense;
}
function getTensionLabel(t) { return t<20?"Peaceful":t<40?"Uneasy":t<60?"Tense":t<80?"Danger":"WAR"; }
function getTensionColor(t) { return t<40?"#4a8c6a":t<70?"#c4742a":"#8b2020"; }
function getDayLabel(d) { return d<15?"Dead of Night":d<35?"Before Dawn":d<55?"Early Morning":d<75?"Midday":"High Noon"; }
function getDayIcon(d) { return d<20?"🌑":d<40?"🌒":d<60?"🌤️":d<80?"⛅":"☀️"; }

// ─── Shared YT API ─────────────────────────────────────────────────────────
const _ytCbs = new Set(); let _ytLoaded = false, _ytReady = false;

// ─── Hooks ─────────────────────────────────────────────────────────────────
function useLocalStorage(key, initial) {
  const [value, setValue] = useState(() => {
    try { const v = localStorage.getItem(key); return v !== null ? JSON.parse(v) : initial; }
    catch { return initial; }
  });
  const set = useCallback(updater => {
    setValue(prev => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      try { localStorage.setItem(key, JSON.stringify(next)); } catch {}
      return next;
    });
  }, [key]);
  return [value, set];
}

function useYouTubeAPI() {
  const [ready, setReady] = useState(_ytReady);
  useEffect(() => {
    if (_ytReady) { setReady(true); return; }
    const cb = () => setReady(true);
    _ytCbs.add(cb);
    if (!_ytLoaded) {
      _ytLoaded = true;
      const tag = document.createElement("script");
      tag.src = "https://www.youtube.com/iframe_api";
      document.head.appendChild(tag);
      window.onYouTubeIframeAPIReady = () => { _ytReady = true; _ytCbs.forEach(f => f()); _ytCbs.clear(); };
    }
    return () => _ytCbs.delete(cb);
  }, []);
  return ready;
}

function useYTPlayer(containerId, videoId, volume, isPlaying, reloadKey) {
  const ref = useRef(null);
  const ytReady = useYouTubeAPI();
  const volRef = useRef(volume), playRef = useRef(isPlaying);
  useEffect(() => { volRef.current = volume; }, [volume]);
  useEffect(() => { playRef.current = isPlaying; }, [isPlaying]);

  useEffect(() => {
    if (!ytReady) return;
    ref.current?.destroy(); ref.current = null;
    if (!videoId) return;
    const wrapper = document.getElementById(containerId);
    if (!wrapper) return;
    wrapper.innerHTML = "";
    const target = document.createElement("div");
    wrapper.appendChild(target);
    ref.current = new window.YT.Player(target, {
      videoId, height:"70", width:"100%",
      playerVars: { autoplay:1, loop:1, playlist:videoId, controls:0, modestbranding:1 },
      events: {
        onReady(e) {
          e.target.mute(); e.target.playVideo();
          setTimeout(() => { e.target.unMute(); e.target.setVolume(volRef.current); }, 250);
        },
        onError() {
          // Invalid video ID — destroy cleanly so the wrapper div is reusable
          try { ref.current?.destroy(); ref.current = null; } catch {}
          const wrapper = document.getElementById(containerId);
          if (wrapper) wrapper.innerHTML = "";
        },
      },
    });
    return () => { ref.current?.destroy(); ref.current = null; if (wrapper) wrapper.innerHTML = ""; };
  }, [ytReady, videoId, containerId, reloadKey]); // reloadKey forces restart even if URL unchanged

  useEffect(() => { try { ref.current?.setVolume(volume); } catch {} }, [volume]);
  useEffect(() => { try { if (isPlaying) ref.current?.playVideo(); else ref.current?.pauseVideo(); } catch {} }, [isPlaying]);

  return useCallback(vol => { try { ref.current?.setVolume(Math.max(0,Math.min(100,vol))); } catch {} }, []);
}

function useSfxPlayer(containerId) {
  const ref = useRef(null);
  const ytReady = useYouTubeAPI();
  useEffect(() => {
    if (!ytReady) return;
    const wrapper = document.getElementById(containerId);
    if (!wrapper) return;
    wrapper.innerHTML = "";
    const target = document.createElement("div");
    wrapper.appendChild(target);
    ref.current = new window.YT.Player(target, { height:"60", width:"100%", playerVars: { controls:1, modestbranding:1 } });
    return () => { ref.current?.destroy(); ref.current = null; if (wrapper) wrapper.innerHTML = ""; };
  }, [ytReady, containerId]);
  return useCallback((videoId, volume) => {
    if (!ref.current) return;
    try { ref.current.loadVideoById(videoId); ref.current.setVolume(volume); } catch {}
  }, []);
}

// ─── Spotify auth hook ────────────────────────────────────────────────────
function useSpotifyAuth() {
  const stored = localStorage.getItem("sp_token");
  const exp    = Number(localStorage.getItem("sp_expires") || 0);
  const [token, setToken] = useState(stored && Date.now() < exp ? stored : null);
  const [loading, setLoading] = useState(false);

  // Handle redirect callback (code in URL after Spotify auth)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    if (!code) return;
    window.history.replaceState({}, "", "/");
    const verifier = localStorage.getItem("sp_verifier");
    if (!verifier) return;
    setLoading(true);
    spFetchToken({ client_id:SPOTIFY_CLIENT_ID, grant_type:"authorization_code", code, redirect_uri:SPOTIFY_REDIRECT, code_verifier:verifier })
      .then(d => {
        if (d.access_token) {
          localStorage.setItem("sp_token", d.access_token);
          localStorage.setItem("sp_refresh", d.refresh_token);
          localStorage.setItem("sp_expires", String(Date.now() + (d.expires_in - 60) * 1000));
          localStorage.removeItem("sp_verifier");
          setToken(d.access_token);
        }
        setLoading(false);
      }).catch(() => setLoading(false));
  }, []);

  // Auto-refresh before expiry
  useEffect(() => {
    if (!token) return;
    const delay = Math.max(0, Number(localStorage.getItem("sp_expires")) - Date.now() - 60000);
    const id = setTimeout(async () => {
      const refresh = localStorage.getItem("sp_refresh");
      if (!refresh) return;
      const d = await spFetchToken({ client_id:SPOTIFY_CLIENT_ID, grant_type:"refresh_token", refresh_token:refresh });
      if (d.access_token) {
        localStorage.setItem("sp_token", d.access_token);
        localStorage.setItem("sp_expires", String(Date.now() + (d.expires_in - 60) * 1000));
        if (d.refresh_token) localStorage.setItem("sp_refresh", d.refresh_token);
        setToken(d.access_token);
      }
    }, delay);
    return () => clearTimeout(id);
  }, [token]);

  async function login() {
    const v = await spVerifier();
    const c = await spChallenge(v);
    localStorage.setItem("sp_verifier", v);
    const p = new URLSearchParams({ client_id:SPOTIFY_CLIENT_ID, response_type:"code", redirect_uri:SPOTIFY_REDIRECT, scope:SPOTIFY_SCOPES, code_challenge_method:"S256", code_challenge:c });
    window.location.href = `https://accounts.spotify.com/authorize?${p}`;
  }

  function logout() {
    ["sp_token","sp_refresh","sp_expires","sp_verifier"].forEach(k => localStorage.removeItem(k));
    setToken(null);
  }

  return { token, isConnected:!!token, loading, login, logout };
}

// ─── Spotify player hook ──────────────────────────────────────────────────
function useSpotifyPlayer(token) {
  const [ready, setReady]               = useState(false);
  const [currentTrack, setCurrentTrack] = useState(null);
  const [nextTracks, setNextTracks]     = useState([]);
  const [isPaused, setIsPaused]         = useState(true);
  const [shuffle, setShuffle]           = useState(false);
  const [repeat, setRepeat]             = useState("off");
  const [position, setPosition]         = useState(0);
  const [duration, setDuration]         = useState(0);
  const [isLiked, setIsLiked]           = useState(false);
  const playerRef   = useRef(null);
  const deviceIdRef = useRef(null);
  const tokenRef    = useRef(token);
  useEffect(() => { tokenRef.current = token; }, [token]);

  useEffect(() => {
    if (!token) return;
    function initPlayer() {
      if (playerRef.current) return;
      const player = new window.Spotify.Player({
        name: "Andulaak Atmosphere Board",
        getOAuthToken: cb => cb(tokenRef.current),
        volume: 0.6,
      });
      player.addListener("ready", ({ device_id }) => { deviceIdRef.current = device_id; setReady(true); });
      player.addListener("not_ready", () => setReady(false));
      player.addListener("player_state_changed", s => {
        if (!s) return;
        setIsPaused(s.paused);
        setShuffle(s.shuffle);
        setRepeat(s.repeat_mode === 0 ? "off" : s.repeat_mode === 1 ? "context" : "track");
        setPosition(s.position);
        setDuration(s.duration);
        if (s.track_window?.current_track) setCurrentTrack(s.track_window.current_track);
        if (s.track_window?.next_tracks) setNextTracks(s.track_window.next_tracks);
      });
      player.connect();
      playerRef.current = player;
    }
    if (window.Spotify?.Player) initPlayer();
    else {
      window.onSpotifyWebPlaybackSDKReady = initPlayer;
      if (!document.querySelector('script[src*="spotify-player"]')) {
        const tag = document.createElement("script");
        tag.src = "https://sdk.scdn.co/spotify-player.js";
        document.head.appendChild(tag);
      }
    }
    return () => { playerRef.current?.disconnect(); playerRef.current = null; setReady(false); };
  }, [token]);

  function spApi(path, method="POST", body) {
    return fetch(`https://api.spotify.com/v1${path}`, {
      method,
      headers: { Authorization:`Bearer ${tokenRef.current}`, "Content-Type":"application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  async function play(uri) {
    if (!deviceIdRef.current) return;
    const parsed = parseSpotifyUrl(uri);
    if (!parsed) return;
    await spApi(`/me/player/play?device_id=${deviceIdRef.current}`, "PUT",
      parsed.type === "track" ? { uris:[parsed.uri] } : { context_uri:parsed.uri });
  }
  async function search(query) {
    if (!query.trim()) return null;
    const r = await fetch(`https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=track,playlist&limit=5`, {
      headers:{ Authorization:`Bearer ${tokenRef.current}` }
    });
    return r.json();
  }
  async function skipNext()  { await spApi("/me/player/next"); }
  async function skipPrev()  { await spApi("/me/player/previous"); }
  // Poll position every second while playing
  useEffect(() => {
    if (isPaused || !playerRef.current) return;
    const id = setInterval(async () => {
      const s = await playerRef.current?.getCurrentState().catch(()=>null);
      if (s) { setPosition(s.position); setDuration(s.duration); }
    }, 1000);
    return () => clearInterval(id);
  }, [isPaused]);

  // Check if current track is liked
  useEffect(() => {
    if (!currentTrack?.id || !tokenRef.current) return;
    fetch(`https://api.spotify.com/v1/me/tracks/contains?ids=${currentTrack.id}`, {
      headers:{ Authorization:`Bearer ${tokenRef.current}` }
    }).then(r=>r.json()).then(d=>setIsLiked(!!d[0])).catch(()=>{});
  }, [currentTrack?.id]);

  async function toggleShuffle() {
    const next = !shuffle; setShuffle(next);
    await spApi(`/me/player/shuffle?state=${next}`, "PUT");
  }
  async function toggleRepeat() {
    const modes = ["off","context","track"];
    const next = modes[(modes.indexOf(repeat)+1)%modes.length];
    setRepeat(next);
    await spApi(`/me/player/repeat?state=${next}`, "PUT");
  }
  async function toggleLike() {
    if (!currentTrack?.id) return;
    const method = isLiked ? "DELETE" : "PUT";
    await fetch(`https://api.spotify.com/v1/me/tracks?ids=${currentTrack.id}`, {
      method, headers:{ Authorization:`Bearer ${tokenRef.current}` }
    });
    setIsLiked(!isLiked);
  }
  async function addToQueue(uri) {
    await spApi(`/me/player/queue?uri=${encodeURIComponent(uri)}`, "POST");
  }
  async function getMyPlaylists() {
    const r = await fetch("https://api.spotify.com/v1/me/playlists?limit=25", {
      headers:{ Authorization:`Bearer ${tokenRef.current}` }
    });
    return r.json();
  }
  async function getRecentlyPlayed() {
    const r = await fetch("https://api.spotify.com/v1/me/player/recently-played?limit=12", {
      headers:{ Authorization:`Bearer ${tokenRef.current}` }
    });
    return r.json();
  }
  function seek(ms) { playerRef.current?.seek(ms).catch(()=>{}); }

  function pause()   { playerRef.current?.pause(); }
  function resume()  { playerRef.current?.resume(); }
  function setVol(v) { playerRef.current?.setVolume(v / 100); }

  const albumArt   = currentTrack?.album?.images?.[0]?.url;
  const artistName = currentTrack?.artists?.[0]?.name;
  const albumName  = currentTrack?.album?.name;

  return { ready, currentTrack, nextTracks, isPaused, shuffle, repeat, isLiked, position, duration, albumArt, artistName, albumName, play, pause, resume, setVol, skipNext, skipPrev, toggleShuffle, toggleRepeat, toggleLike, addToQueue, getMyPlaylists, getRecentlyPlayed, seek, search };
}

async function compressImage(file) {
  return new Promise(resolve => {
    const img = new Image(), url = URL.createObjectURL(file);
    img.onload = () => {
      const scale = Math.min(1, 1280/img.width);
      const c = document.createElement("canvas");
      c.width = Math.round(img.width*scale); c.height = Math.round(img.height*scale);
      c.getContext("2d").drawImage(img,0,0,c.width,c.height);
      URL.revokeObjectURL(url); resolve(c.toDataURL("image/jpeg",0.65));
    };
    img.src = url;
  });
}

// ─── Atmospheric canvas layers ─────────────────────────────────────────────
function ParticleLayer({ type, tension }) {
  const canvasRef = useRef(null), animRef = useRef(null);
  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const resize = () => { canvas.width=window.innerWidth; canvas.height=window.innerHeight; };
    resize(); window.addEventListener("resize",resize);
    const base = {rain:120,ember:40,snow:60,dust:50}[type]??50;
    const count = Math.floor(base*(1+Math.max(0,(tension-60)/40)*0.7));
    const speed = 1+(tension/100)*3;
    const pts = Array.from({length:count},()=>({
      x:Math.random()*window.innerWidth, y:Math.random()*window.innerHeight,
      size:Math.random()*2.5+0.5,
      sx:type==="rain"?(Math.random()-0.3)*1.5:(Math.random()-0.5)*0.8,
      sy:type==="rain"?speed*6+Math.random()*4:type==="snow"?speed*0.6+Math.random()*0.4:type==="ember"?-(speed*0.8+Math.random()*1.2):-(speed*0.3+Math.random()*0.5),
      op:Math.random()*0.5+0.1, ph:Math.random()*Math.PI*2,
    }));
    function draw() {
      ctx.clearRect(0,0,canvas.width,canvas.height);
      const t2=Date.now()/1000, ts=Math.max(0,(tension-70)/30);
      pts.forEach(p=>{
        const wb=(type==="ember"||type==="ash")?Math.sin(t2*2+p.ph)*0.4:0;
        ctx.beginPath();
        if(type==="rain"){ctx.moveTo(p.x,p.y);ctx.lineTo(p.x+p.sx*3,p.y+12);ctx.strokeStyle=`rgba(160,200,255,${p.op*0.6})`;ctx.lineWidth=0.8;ctx.stroke();}
        else{ctx.arc(p.x+wb,p.y,p.size,0,Math.PI*2);ctx.fillStyle=type==="ember"?`rgba(255,${Math.floor((120-ts*70)+p.op*60)},${Math.floor(40*(1-ts))},${p.op})`:type==="snow"?`rgba(220,235,255,${p.op})`:`rgba(200,190,170,${p.op*0.6})`;ctx.fill();}
        p.x+=p.sx+wb*0.05;p.y+=p.sy;
        if(p.y>canvas.height+10)p.y=-10;if(p.y<-10)p.y=canvas.height+10;
        if(p.x>canvas.width+10)p.x=0;if(p.x<-10)p.x=canvas.width;
      });
      animRef.current=requestAnimationFrame(draw);
    }
    draw();
    return ()=>{cancelAnimationFrame(animRef.current);window.removeEventListener("resize",resize);};
  },[type,tension]);
  return <canvas ref={canvasRef} style={{position:"fixed",inset:0,zIndex:2,pointerEvents:"none",opacity:0.75}}/>;
}

function InkBleed({ active, onDone }) {
  const canvasRef = useRef(null), animRef = useRef(null);
  useEffect(()=>{
    if(!active)return;
    const canvas=canvasRef.current;if(!canvas)return;
    const ctx=canvas.getContext("2d");
    canvas.width=window.innerWidth;canvas.height=window.innerHeight;
    let p=0;const cx=canvas.width/2,cy=canvas.height/2,maxR=Math.sqrt(cx*cx+cy*cy)*1.3;
    const blobs=Array.from({length:14},()=>({a:Math.random()*Math.PI*2,s:0.55+Math.random()*0.9,w:Math.random()*0.35}));
    function draw(){
      ctx.clearRect(0,0,canvas.width,canvas.height);p+=0.02;
      if(p<1){ctx.beginPath();blobs.forEach((b,i)=>{const r=maxR*Math.min(p*b.s,1),wr=r*(1+b.w*Math.sin(p*9+i));const x=cx+Math.cos(b.a)*wr,y=cy+Math.sin(b.a)*wr;i===0?ctx.moveTo(x,y):ctx.lineTo(x,y);});ctx.closePath();ctx.fillStyle="#050303";ctx.fill();animRef.current=requestAnimationFrame(draw);}
      else{ctx.fillStyle="#050303";ctx.fillRect(0,0,canvas.width,canvas.height);setTimeout(()=>onDone(),120);}
    }
    draw();return()=>cancelAnimationFrame(animRef.current);
  },[active]);
  if(!active)return null;
  return <canvas ref={canvasRef} style={{position:"fixed",inset:0,zIndex:100,pointerEvents:"none"}}/>;
}

// ─── UI primitives ──────────────────────────────────────────────────────────
function Card({ children, style={} }) {
  return <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:10, padding:"18px 20px", ...style }}>{children}</div>;
}

function Label({ children, htmlFor }) {
  return <label htmlFor={htmlFor} style={{ display:"block", fontFamily:"Cinzel,serif", fontSize:10, letterSpacing:"0.15em", color:C.goldDim, textTransform:"uppercase", marginBottom:7 }}>{children}</label>;
}

function Btn({ children, onClick, variant="default", disabled=false, style={} }) {
  const base = { fontFamily:"Cinzel,serif", fontSize:10, letterSpacing:"0.12em", textTransform:"uppercase", cursor:disabled?"not-allowed":"pointer", padding:"9px 18px", borderRadius:7, transition:"all 0.2s", border:"none", outline:"none", display:"inline-flex", alignItems:"center", gap:6 };
  const variants = {
    default: { background:C.surfaceHigh, color:C.goldMid, border:`1px solid ${C.border}` },
    primary: { background:"rgba(232,217,160,0.12)", color:C.gold, border:`1px solid rgba(232,217,160,0.35)` },
    danger:  { background:"rgba(180,40,40,0.12)", color:"#e87878", border:"1px solid rgba(180,40,40,0.3)" },
    ghost:   { background:"transparent", color:C.goldDim, border:`1px solid transparent` },
  };
  return <button onClick={disabled?undefined:onClick} style={{ ...base, ...variants[variant], opacity:disabled?0.4:1, ...style }}>{children}</button>;
}

function TextInput({ id, value, onChange, placeholder, style={} }) {
  return (
    <input id={id} value={value} onChange={onChange} placeholder={placeholder}
      style={{ width:"100%", background:C.surfaceHigh, border:`1px solid ${C.border}`, borderRadius:7, padding:"9px 13px", color:C.gold, fontSize:13, outline:"none", fontFamily:"Crimson Pro,Georgia,serif", ...style }}
    />
  );
}

function RangeWithTrack({ label, value, onChange, min=0, max=100, leftLabel, rightLabel, trackColor, id }) {
  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:6 }}>
        <Label htmlFor={id}>{label}</Label>
        <span style={{ fontSize:12, color:C.goldMid, fontVariantNumeric:"tabular-nums" }}>{value}%</span>
      </div>
      {trackColor && (
        <div style={{ height:5, background:C.surfaceHigh, borderRadius:3, marginBottom:7, overflow:"hidden" }}>
          <div style={{ height:"100%", borderRadius:3, background:trackColor, width:`${((value-min)/(max-min))*100}%`, transition:"width 0.1s" }} />
        </div>
      )}
      <input id={id} type="range" min={min} max={max} value={value} onChange={e=>onChange(Number(e.target.value))} style={{ width:"100%" }} />
      {(leftLabel||rightLabel) && (
        <div style={{ display:"flex", justifyContent:"space-between", fontSize:10, color:C.goldFaint, marginTop:5 }}>
          <span>{leftLabel}</span><span>{rightLabel}</span>
        </div>
      )}
    </div>
  );
}

function YTContainer({ id }) {
  return (
    <div style={{ marginTop:10, borderRadius:7, overflow:"hidden", height:70 }}>
      <div id={id} style={{ width:"100%", height:"100%" }}/>
    </div>
  );
}

// ─── Modals ────────────────────────────────────────────────────────────────
function Modal({ title, onClose, children, width=480 }) {
  return (
    <div style={{ position:"fixed",inset:0,zIndex:500,background:"rgba(0,0,0,0.8)",display:"flex",alignItems:"center",justifyContent:"center",padding:20 }} onClick={onClose}>
      <div style={{ background:"#0f0d0a",border:`1px solid ${C.border}`,borderRadius:14,padding:"28px 32px",width,maxWidth:"96vw",maxHeight:"90vh",overflowY:"auto" }} onClick={e=>e.stopPropagation()}>
        <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:24 }}>
          <div style={{ fontFamily:"Cinzel,serif",fontSize:13,letterSpacing:"0.2em",color:C.gold,textTransform:"uppercase" }}>{title}</div>
          <Btn variant="ghost" onClick={onClose} style={{ padding:"4px 8px",fontSize:16 }}>✕</Btn>
        </div>
        {children}
      </div>
    </div>
  );
}

function SceneModal({ scene, onSave, onDelete, onClose }) {
  const [f, setF] = useState({...scene});
  const u = (k,v) => setF(p=>({...p,[k]:v}));
  const isNew = !scene.id;

  return (
    <Modal title={isNew?"New Scene":"Edit Scene"} onClose={onClose} width={500}>
      <div style={{ display:"flex", gap:12, marginBottom:20 }}>
        <div>
          <Label htmlFor="icon-input">Icon</Label>
          <TextInput id="icon-input" value={f.icon} onChange={e=>u("icon",e.target.value)} style={{ width:60, textAlign:"center", fontSize:22, padding:"6px" }} />
        </div>
        <div style={{ flex:1 }}>
          <Label htmlFor="name-input">Scene Name</Label>
          <TextInput id="name-input" value={f.name} onChange={e=>u("name",e.target.value)} placeholder="Name this location…" />
        </div>
      </div>

      <div style={{ marginBottom:20 }}>
        <Label>Atmosphere Color</Label>
        <div style={{ display:"flex", gap:8, flexWrap:"wrap", alignItems:"center" }}>
          {DARK_PALETTE.map(c=>(
            <div key={c} onClick={()=>u("color",c)} style={{ width:32,height:32,borderRadius:7,background:c,border:`2px solid ${f.color===c?"rgba(232,217,160,0.8)":C.border}`,cursor:"pointer",transition:"border-color 0.15s",flexShrink:0 }} title={c}/>
          ))}
          <div>
            <input type="color" value={f.color} onChange={e=>u("color",e.target.value)} style={{ width:32,height:32,borderRadius:7,border:`1px solid ${C.border}`,cursor:"pointer",background:"none",padding:0,verticalAlign:"middle" }} />
          </div>
        </div>
      </div>

      <div style={{ marginBottom:20 }}>
        <Label>Particle Effect</Label>
        <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginTop:4 }}>
          {PARTICLE_TYPES.map(p=>(
            <button key={p} onClick={()=>u("particle",p)} style={{ padding:"6px 14px",borderRadius:7,border:`1px solid ${f.particle===p?C.borderFocus:C.border}`,background:f.particle===p?"rgba(232,217,160,0.1)":"transparent",color:f.particle===p?C.gold:C.goldDim,fontSize:11,fontFamily:"Cinzel,serif",letterSpacing:"0.08em",cursor:"pointer",textTransform:"uppercase",transition:"all 0.15s" }}>
              {p}
            </button>
          ))}
        </div>
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14, marginBottom:20 }}>
        {[["calm","Calm Mood","Peaceful description…"],["tense","Tense Mood","Danger description…"]].map(([k,lbl,ph])=>(
          <div key={k}>
            <Label htmlFor={k+"-input"}>{lbl}</Label>
            <textarea id={k+"-input"} value={f[k]} onChange={e=>u(k,e.target.value)} rows={2} placeholder={ph}
              style={{ width:"100%",background:C.surfaceHigh,border:`1px solid ${C.border}`,borderRadius:7,padding:"9px 13px",color:C.gold,fontSize:13,fontFamily:"Crimson Pro,Georgia,serif",resize:"vertical",outline:"none",lineHeight:1.5 }}/>
          </div>
        ))}
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14, marginBottom:24 }}>
        {[["musicHint","Music Hint","e.g. fantasy tavern music"],["ambientHint","Ambient Hint","e.g. fire crackling rain"]].map(([k,lbl,ph])=>(
          <div key={k}>
            <Label htmlFor={k+"-input"}>{lbl}</Label>
            <TextInput id={k+"-input"} value={f[k]||""} onChange={e=>u(k,e.target.value)} placeholder={ph}/>
          </div>
        ))}
      </div>

      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
        {!isNew
          ? <Btn variant="danger" onClick={()=>onDelete(scene.id)}>Delete Scene</Btn>
          : <span/>}
        <div style={{ display:"flex", gap:10 }}>
          <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
          <Btn variant="primary" onClick={()=>{ if(f.name.trim()) onSave(f); }}>
            {isNew?"Create Scene":"Save Changes"}
          </Btn>
        </div>
      </div>
    </Modal>
  );
}

function SfxModal({ slot, index, onSave, onClose }) {
  const [f, setF] = useState({...slot});
  const u = (k,v) => setF(p=>({...p,[k]:v}));
  return (
    <Modal title={`Sound Slot ${index+1}`} onClose={onClose} width={380}>
      <div style={{ display:"flex", gap:12, marginBottom:18 }}>
        <div>
          <Label htmlFor="sfx-icon">Icon</Label>
          <TextInput id="sfx-icon" value={f.icon} onChange={e=>u("icon",e.target.value)} style={{ width:60,textAlign:"center",fontSize:20,padding:"6px" }}/>
        </div>
        <div style={{ flex:1 }}>
          <Label htmlFor="sfx-name">Label</Label>
          <TextInput id="sfx-name" value={f.name} onChange={e=>u("name",e.target.value)} placeholder="Thunder, Combat, Bell…"/>
        </div>
      </div>
      <div style={{ marginBottom:24 }}>
        <Label htmlFor="sfx-url">YouTube URL or Video ID</Label>
        <TextInput id="sfx-url" value={f.url} onChange={e=>u("url",e.target.value)} placeholder="Paste YouTube link…"/>
        <div style={{ fontSize:11,color:C.goldFaint,marginTop:7,fontStyle:"italic" }}>Tip: search "sound effect [name] no music"</div>
      </div>
      <div style={{ display:"flex", justifyContent:"flex-end", gap:10 }}>
        <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
        <Btn variant="primary" onClick={()=>onSave(index,f)}>Save</Btn>
      </div>
    </Modal>
  );
}

// ─── Tab screens ───────────────────────────────────────────────────────────
function StageScreen({ scenes, sceneData, activeSceneId, onSceneClick, tension, setTension, dayNight, setDayNight, musicVol, ambientVol, isPlaying, setIsPlaying, tensionColor, presets, onEditPreset, timer }) {
  const activeScene = scenes.find(s=>s.id===activeSceneId)??null;
  const t = tension/100;

  return (
    <div>
      {/* Now Playing */}
      <Card style={{ marginBottom:20, display:"flex", alignItems:"center", gap:16, border:`1px solid ${tension>65?`rgba(160,40,40,${0.3+t*0.35})`:C.border}`, boxShadow:tension>75?`0 0 ${10+t*20}px rgba(140,20,20,${0.1+t*0.2})`:"none", transition:"all 0.5s" }}>
        <div style={{ width:12,height:12,borderRadius:"50%",flexShrink:0,background:isPlaying&&activeScene?tensionColor:"#3a3228",boxShadow:isPlaying&&activeScene?`0 0 12px ${tensionColor}`:"none",animation:isPlaying&&activeScene?"pulse 2s ease-in-out infinite":"none",transition:"all 0.5s" }}/>
        <div style={{ flex:1 }}>
          <div style={{ fontFamily:"Cinzel,serif",fontSize:16,color:C.gold,letterSpacing:"0.06em" }}>{activeScene?activeScene.name:"No Scene Selected"}</div>
          <div style={{ fontSize:14,color:C.goldMid,fontStyle:"italic",marginTop:4 }}>{isPlaying?getMood(activeScene,tension):activeScene?"Paused":"Select a scene below to begin"}</div>
        </div>
        <div style={{ textAlign:"right",flexShrink:0,marginRight:4 }}>
          <div style={{ fontSize:11,color:C.goldDim,marginBottom:2 }}>{getDayLabel(dayNight)}</div>
          <div style={{ fontSize:12,fontFamily:"Cinzel,serif",letterSpacing:"0.1em",color:tensionColor,transition:"color 0.5s" }}>{getTensionLabel(tension)}</div>
        </div>
        <button onClick={()=>activeScene&&setIsPlaying(p=>!p)}
          aria-label={isPlaying?"Pause":"Play"}
          style={{ background:"rgba(232,217,160,0.08)",border:`1px solid rgba(232,217,160,0.2)`,borderRadius:"50%",width:48,height:48,flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center",cursor:activeScene?"pointer":"default",color:activeScene?C.gold:"#3a3228",fontSize:18,outline:"none",transition:"all 0.2s" }}>
          {isPlaying?"⏸":"▶"}
        </button>
      </Card>

      {/* Scene grid */}
      <div style={{ fontFamily:"Cinzel,serif",fontSize:10,letterSpacing:"0.2em",color:C.goldDim,textTransform:"uppercase",marginBottom:12 }}>
        Scenes <span style={{ fontSize:9,color:C.goldFaint,letterSpacing:"0.1em",textTransform:"none",marginLeft:8 }}>Press 1–{scenes.length} to switch</span>
      </div>
      <div style={{ display:"grid",gridTemplateColumns:`repeat(${Math.min(scenes.length,4)},1fr)`,gap:10,marginBottom:24 }}>
        {scenes.map((s,idx)=>{
          const sd = sceneData[s.id]??{};
          const isActive = activeSceneId===s.id;
          return (
            <button key={s.id} onClick={()=>onSceneClick(s)}
              aria-pressed={isActive}
              aria-label={`Switch to ${s.name}`}
              style={{ position:"relative",background:isActive?"rgba(232,217,160,0.08)":C.surface,border:`2px solid ${isActive?`rgba(232,217,160,${0.4+t*0.3})`:C.border}`,borderRadius:10,padding:"20px 10px 32px",cursor:"pointer",textAlign:"center",transition:"all 0.25s",overflow:"hidden",backgroundImage:sd.bgImage?`url(${sd.bgImage})`:"none",backgroundSize:"cover",backgroundPosition:"center",boxShadow:isActive&&tension>70?`0 0 ${14+t*20}px rgba(160,40,40,0.35)`:isActive?"0 0 12px rgba(232,217,160,0.08)":"none",outline:"none" }}>
              {sd.bgImage&&<div style={{ position:"absolute",inset:0,background:isActive?"rgba(0,0,0,0.45)":"rgba(0,0,0,0.62)",borderRadius:8,transition:"background 0.3s" }}/>}
              {/* Keyboard number */}
              <div style={{ position:"absolute",top:5,right:7,fontSize:9,color:"rgba(212,201,168,0.3)",fontFamily:"Cinzel,serif" }}>{idx+1}</div>
              <div style={{ position:"relative",zIndex:1 }}>
                <div style={{ fontSize:28,marginBottom:8 }}>{s.icon}</div>
                <div style={{ fontFamily:"Cinzel,serif",fontSize:9,letterSpacing:"0.08em",color:isActive?C.gold:C.goldMid,textTransform:"uppercase",lineHeight:1.4 }}>{s.name}</div>
                {isActive&&isPlaying&&<div style={{ width:6,height:6,borderRadius:"50%",background:tensionColor,boxShadow:`0 0 8px ${tensionColor}`,margin:"8px auto 0",animation:"pulse 2s ease-in-out infinite" }}/>}
              </div>
            </button>
          );
        })}
      </div>

      {/* Controls */}
      <div style={{ display:"grid",gridTemplateColumns:"1.2fr 1fr",gap:14 }}>
        <Card style={{ border:`1px solid ${tension>65?`rgba(160,40,40,${0.3+t*0.3})`:C.border}`,boxShadow:tension>75?`0 0 ${10+t*20}px rgba(140,20,20,${0.1+t*0.2})`:"none",transition:"all 0.5s" }}>
          <RangeWithTrack
            id="tension-slider" label="Tension"
            value={tension} onChange={setTension}
            leftLabel="Peaceful" rightLabel="War"
            trackColor="linear-gradient(to right,#2d6b50,#4a8c6a,#c4742a,#8b2020,#5c0808)"
          />
          <div style={{ textAlign:"right",marginTop:8,fontSize:13,fontFamily:"Cinzel,serif",letterSpacing:"0.12em",color:tensionColor,transition:"color 0.5s",fontWeight:tension>=80?700:400,animation:tension>=80?"pulse 1s ease-in-out infinite":"none" }}>
            {getTensionLabel(tension)}
          </div>
        </Card>
        <Card>
          <RangeWithTrack
            id="daynight-slider" label={`Time of Day ${getDayIcon(dayNight)}`}
            value={dayNight} onChange={setDayNight}
            leftLabel="Night" rightLabel="Day"
            trackColor="linear-gradient(to right,#0a0a1a,#2a1a4a,#6a3820,#d4843a,#f0c060)"
          />
          <div style={{ textAlign:"center",marginTop:8,fontSize:12,color:C.goldMid,fontStyle:"italic" }}>{getDayLabel(dayNight)}</div>
        </Card>
      </div>

      {/* ── Mood Presets ── */}
      <div style={{ marginTop:20 }}>
        <div style={{ fontFamily:"Cinzel,serif",fontSize:10,letterSpacing:"0.18em",color:C.goldDim,textTransform:"uppercase",marginBottom:12 }}>
          Mood Presets <span style={{ fontSize:9,color:C.goldFaint,letterSpacing:"0.06em",textTransform:"none",marginLeft:8 }}>click to apply · ✎ to customise</span>
        </div>
        <div style={{ display:"grid", gridTemplateColumns:`repeat(${presets.length},1fr)`, gap:8 }}>
          {presets.map(p=>{
            const isActive = tension===p.tension&&dayNight===p.dayNight;
            return (
              <div key={p.id} style={{ position:"relative" }}>
                <button onClick={()=>{ setTension(p.tension); setDayNight(p.dayNight); }} aria-label={`Apply ${p.name} preset`}
                  style={{ width:"100%",background:isActive?"rgba(232,217,160,0.1)":C.surface,border:`1px solid ${isActive?C.borderFocus:C.border}`,borderRadius:9,padding:"12px 8px",cursor:"pointer",textAlign:"center",transition:"all 0.2s",outline:"none" }}>
                  <div style={{ fontSize:20,marginBottom:5 }}>{p.icon}</div>
                  <div style={{ fontFamily:"Cinzel,serif",fontSize:9,letterSpacing:"0.08em",color:isActive?C.gold:C.goldMid,textTransform:"uppercase" }}>{p.name}</div>
                  <div style={{ fontSize:9,color:C.goldFaint,marginTop:3 }}>T:{p.tension} · {getDayIcon(p.dayNight)}</div>
                </button>
                <button onClick={()=>onEditPreset(p)} aria-label={`Edit ${p.name} preset`}
                  style={{ position:"absolute",top:4,right:5,fontSize:9,color:C.goldFaint,background:"transparent",border:"none",cursor:"pointer",padding:"2px 4px",outline:"none" }}>✎</button>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Encounter Timer ── */}
      <div style={{ marginTop:20 }}>
        <div style={{ fontFamily:"Cinzel,serif",fontSize:10,letterSpacing:"0.18em",color:C.goldDim,textTransform:"uppercase",marginBottom:12 }}>
          Encounter Timer
        </div>
        <Card style={{ display:"flex",alignItems:"center",gap:20,flexWrap:"wrap" }}>
          <div style={{ fontFamily:"Cinzel,serif",fontSize:36,letterSpacing:"0.1em",color:timer.running?C.gold:C.goldDim,minWidth:100,fontVariantNumeric:"tabular-nums",transition:"color 0.3s" }}>
            {timer.display}
          </div>
          <div style={{ textAlign:"center" }}>
            <div style={{ fontSize:11,color:C.goldFaint,marginBottom:3 }}>D&amp;D Round</div>
            <div style={{ fontFamily:"Cinzel,serif",fontSize:28,color:getTensionColor(tension),letterSpacing:"0.05em" }}>{timer.round}</div>
          </div>
          <div style={{ flex:1 }}/>
          <div style={{ display:"flex",gap:8,flexWrap:"wrap" }}>
            <Btn variant={timer.running?"default":"primary"} onClick={timer.toggle}>
              {timer.running?"⏸ Pause":"▶ Start"}
            </Btn>
            <Btn variant="default" onClick={timer.nextRound}>+ Round</Btn>
            <Btn variant="ghost" onClick={timer.reset} style={{ color:"rgba(180,80,80,0.7)" }}>Reset</Btn>
          </div>
        </Card>
      </div>
    </div>
  );
}

function YouTubeTrackPanel({ label, input, setInput, onLoad, onClear, hasId, containerId, hint }) {
  function openYTSearch() {
    window.open(`https://www.youtube.com/results?search_query=${encodeURIComponent(hint)}`, "_blank", "noopener");
  }
  return (
    <Card>
      <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14 }}>
        <div style={{ fontFamily:"Cinzel,serif",fontSize:11,letterSpacing:"0.18em",color:C.gold,textTransform:"uppercase" }}>{label}</div>
        {hasId && <Btn variant="ghost" onClick={onClear} style={{ padding:"4px 10px",fontSize:10 }}>✕ Clear</Btn>}
      </div>

      {/* Search shortcut */}
      <div style={{ marginBottom:14 }}>
        <div style={{ fontSize:11,color:C.goldDim,marginBottom:7 }}>Find music for this scene:</div>
        <button onClick={openYTSearch}
          style={{ width:"100%",background:C.surfaceHigh,border:`1px solid ${C.border}`,borderRadius:8,padding:"10px 14px",color:C.goldMid,fontSize:12,cursor:"pointer",textAlign:"left",outline:"none",display:"flex",alignItems:"center",gap:8,transition:"border-color 0.2s" }}
          onMouseEnter={e=>e.currentTarget.style.borderColor="rgba(232,217,160,0.3)"}
          onMouseLeave={e=>e.currentTarget.style.borderColor=C.border}>
          <span style={{ fontSize:14 }}>🔎</span>
          <span style={{ flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" }}>Search: "{hint}"</span>
          <span style={{ fontSize:10,color:C.goldFaint,flexShrink:0 }}>Opens YouTube →</span>
        </button>
      </div>

      {/* URL input */}
      <div style={{ borderTop:`1px solid ${C.border}`,paddingTop:14 }}>
        <div style={{ fontSize:11,color:C.goldDim,marginBottom:7 }}>Paste URL or video ID:</div>
        <div style={{ display:"flex",gap:8 }}>
          <TextInput
            value={input} onChange={e=>setInput(e.target.value)}
            onKeyDown={e=>e.key==="Enter"&&onLoad()}
            placeholder="https://youtube.com/watch?v=…"
          />
          <Btn variant="primary" onClick={onLoad} style={{ whiteSpace:"nowrap",flexShrink:0 }}>Load</Btn>
        </div>
        <div style={{ fontSize:10,color:C.goldFaint,marginTop:6,fontStyle:"italic" }}>
          Tip: find a 1-hour loop on YouTube, copy the URL, paste above
        </div>
      </div>

      {/* Player */}
      {hasId && <div style={{ marginTop:12 }}><YTContainer id={containerId}/></div>}
    </Card>
  );
}

function AudioScreen({ activeScene, sceneData, musicId, ambientId, musicVol, setMusicVol, ambientVol, setAmbientVol, sfxVol, setSfxVol, spotifyVol, setSpotifyVol, isPlaying, soundboard, setSoundboard, onLoadMusic, onLoadAmbient, onClearMusic, onClearAmbient, musicInput, setMusicInput, ambientInput, setAmbientInput, triggerSfx, editingSfxIdx, setEditingSfxIdx, spotifyAuth, spotifyPlayer, spotifyInput, setSpotifyInput, onLoadSpotify }) {
  const [showSfxPlayer, setShowSfxPlayer] = useState(false);

  function playSfx(slot) {
    const id = getYouTubeId(slot.url);
    if (!id) return;
    setShowSfxPlayer(true);
    triggerSfx(id, sfxVol);
  }

  return (
    <div>
      {/* Main tracks */}
      <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:14,marginBottom:20 }}>
        <YouTubeTrackPanel label="Music Track" input={musicInput} setInput={setMusicInput} onLoad={onLoadMusic} onClear={onClearMusic} hasId={!!musicId} containerId="music-player" hint={activeScene?.musicHint??"fantasy epic music 1 hour"}/>
        <YouTubeTrackPanel label="Ambient Sound" input={ambientInput} setInput={setAmbientInput} onLoad={onLoadAmbient} onClear={onClearAmbient} hasId={!!ambientId} containerId="ambient-player" hint={activeScene?.ambientHint??"ambient sound 1 hour"}/>
      </div>

      {/* Volume controls */}
      <Card style={{ marginBottom:20 }}>
        <div style={{ fontFamily:"Cinzel,serif",fontSize:11,letterSpacing:"0.18em",color:C.gold,textTransform:"uppercase",marginBottom:16 }}>Volume Mix</div>
        <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:20 }}>
          <RangeWithTrack id="mv" label="Music"   value={musicVol}   onChange={setMusicVol}   leftLabel="0" rightLabel="100"/>
          <RangeWithTrack id="av" label="Ambient" value={ambientVol} onChange={setAmbientVol} leftLabel="0" rightLabel="100"/>
          <RangeWithTrack id="sv" label="SFX"     value={sfxVol}     onChange={setSfxVol}     leftLabel="0" rightLabel="100"/>
        </div>
      </Card>

      {/* Soundboard */}
      <Card>
        <div style={{ fontFamily:"Cinzel,serif",fontSize:11,letterSpacing:"0.18em",color:C.gold,textTransform:"uppercase",marginBottom:16 }}>
          Soundboard <span style={{ fontSize:10,color:C.goldFaint,letterSpacing:"0.06em",textTransform:"none",marginLeft:8 }}>one-shot sounds · click ✎ to configure</span>
        </div>
        <div style={{ display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10,marginBottom:14 }}>
          {soundboard.map((slot,i)=>{
            const hasUrl = !!getYouTubeId(slot.url);
            return (
              <div key={i} style={{ position:"relative" }}>
                <button onClick={()=>hasUrl?playSfx(slot):setEditingSfxIdx(i)} aria-label={slot.name||`Sound slot ${i+1}`}
                  style={{ width:"100%",background:hasUrl?"rgba(232,217,160,0.06)":C.surfaceHigh,border:`1px solid ${hasUrl?"rgba(232,217,160,0.25)":C.border}`,borderRadius:9,padding:"14px 10px",textAlign:"center",cursor:"pointer",transition:"all 0.2s",minHeight:72,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:5,outline:"none" }}>
                  <div style={{ fontSize:22 }}>{slot.icon||"♦"}</div>
                  <div style={{ fontFamily:"Cinzel,serif",fontSize:9,letterSpacing:"0.06em",color:hasUrl?C.goldMid:C.goldFaint,textTransform:"uppercase",lineHeight:1.3 }}>{slot.name||"Empty"}</div>
                </button>
                <button onClick={()=>setEditingSfxIdx(i)} aria-label={`Edit sound slot ${i+1}`}
                  style={{ position:"absolute",top:4,right:5,fontSize:10,color:C.goldFaint,cursor:"pointer",background:"transparent",border:"none",outline:"none",padding:"2px 4px" }}>✎</button>
              </div>
            );
          })}
        </div>
        {showSfxPlayer&&(
          <div>
            <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6 }}>
              <div style={{ fontFamily:"Cinzel,serif",fontSize:9,letterSpacing:"0.15em",color:C.goldDim,textTransform:"uppercase" }}>SFX Player</div>
              <Btn variant="ghost" onClick={()=>setShowSfxPlayer(false)} style={{ padding:"2px 7px",fontSize:10 }}>hide</Btn>
            </div>
            <div style={{ height:62,borderRadius:7,overflow:"hidden" }}>
              <div id="sfx-player" style={{ width:"100%",height:"100%" }}/>
            </div>
          </div>
        )}
        {!showSfxPlayer&&<div id="sfx-player" style={{ display:"none" }}/>}
      </Card>

      {/* ── Spotify ── */}
      <SpotifyPanel
        auth={spotifyAuth} player={spotifyPlayer}
        spotifyVol={spotifyVol} setSpotifyVol={setSpotifyVol}
        spotifyInput={spotifyInput} setSpotifyInput={setSpotifyInput}
        onLoadSpotify={onLoadSpotify}
      />
    </div>
  );
}

function fmtMs(ms) {
  const s = Math.floor(ms/1000);
  return `${Math.floor(s/60)}:${String(s%60).padStart(2,"0")}`;
}

function SpotifyTrackRow({ track, onPlay, onQueue, showQueue=false }) {
  const art = track?.album?.images?.[2]?.url || track?.album?.images?.[0]?.url;
  return (
    <div style={{ display:"flex",alignItems:"center",gap:12,padding:"9px 14px",borderBottom:`1px solid ${C.border}`,transition:"background 0.15s" }}
      onMouseEnter={e=>e.currentTarget.style.background="rgba(232,217,160,0.04)"}
      onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
      {art&&<img src={art} alt="" style={{ width:36,height:36,borderRadius:4,flexShrink:0 }}/>}
      <div style={{ flex:1,minWidth:0 }}>
        <div style={{ fontSize:13,color:C.gold,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis" }}>{track.name}</div>
        <div style={{ fontSize:11,color:C.goldDim }}>{track.artists?.[0]?.name}</div>
      </div>
      <div style={{ display:"flex",gap:6,flexShrink:0 }}>
        {showQueue&&<button onClick={()=>onQueue(track.uri)} title="Add to queue" style={{ background:"transparent",border:`1px solid ${C.border}`,borderRadius:6,color:C.goldFaint,fontSize:10,cursor:"pointer",padding:"4px 8px",outline:"none" }}>+Q</button>}
        <button onClick={()=>onPlay(track.uri)} style={{ background:"rgba(29,185,84,0.12)",border:"1px solid rgba(29,185,84,0.3)",borderRadius:6,color:"#1db954",fontSize:12,cursor:"pointer",padding:"4px 10px",outline:"none" }}>▶</button>
      </div>
    </div>
  );
}

function SpotifyPlaylistRow({ pl, onPlay }) {
  const art = pl?.images?.[0]?.url;
  return (
    <div style={{ display:"flex",alignItems:"center",gap:12,padding:"9px 14px",borderBottom:`1px solid ${C.border}`,transition:"background 0.15s" }}
      onMouseEnter={e=>e.currentTarget.style.background="rgba(232,217,160,0.04)"}
      onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
      {art?<img src={art} alt="" style={{ width:36,height:36,borderRadius:4,flexShrink:0 }}/>:<div style={{ width:36,height:36,borderRadius:4,background:C.surfaceHigh,flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center",fontSize:16 }}>🎵</div>}
      <div style={{ flex:1,minWidth:0 }}>
        <div style={{ fontSize:13,color:C.gold,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis" }}>{pl.name}</div>
        <div style={{ fontSize:11,color:C.goldDim }}>{pl.tracks?.total??pl.owner?.display_name} {pl.tracks?.total?"tracks":""}</div>
      </div>
      <button onClick={()=>onPlay(pl.uri)} style={{ background:"rgba(29,185,84,0.12)",border:"1px solid rgba(29,185,84,0.3)",borderRadius:6,color:"#1db954",fontSize:12,cursor:"pointer",padding:"4px 10px",outline:"none",flexShrink:0 }}>▶</button>
    </div>
  );
}

function SpotifyPanel({ auth, player, spotifyVol, setSpotifyVol, spotifyInput, setSpotifyInput, onLoadSpotify }) {
  const [searchQuery, setSearchQuery]   = useState("");
  const [searchResults, setSearchResults]=useState(null);
  const [searching, setSearching]       = useState(false);
  const [myPlaylists, setMyPlaylists]   = useState(null);
  const [recentlyPlayed, setRecentlyPlayed]=useState(null);
  const [browseTab, setBrowseTab]       = useState("search"); // search | playlists | recent

  async function doSearch() {
    if (!searchQuery.trim()) return;
    setSearching(true);
    const data = await player.search(searchQuery);
    setSearchResults(data); setSearching(false);
  }

  async function loadPlaylists() {
    if (myPlaylists) return;
    const d = await player.getMyPlaylists();
    setMyPlaylists(d);
  }

  async function loadRecent() {
    if (recentlyPlayed) return;
    const d = await player.getRecentlyPlayed();
    setRecentlyPlayed(d);
  }

  function switchBrowse(tab) {
    setBrowseTab(tab);
    if (tab==="playlists") loadPlaylists();
    if (tab==="recent") loadRecent();
  }

  function playUri(uri) { player.play(uri); setSpotifyInput(uri); setSearchResults(null); setSearchQuery(""); }
  function queueUri(uri) { player.addToQueue(uri); }

  if (!auth.isConnected) return (
    <Card style={{ marginTop:14, textAlign:"center", padding:"32px 24px" }}>
      <div style={{ fontSize:36,marginBottom:14 }}>🎵</div>
      <div style={{ fontFamily:"Cinzel,serif",fontSize:15,color:C.gold,letterSpacing:"0.1em",marginBottom:8 }}>Spotify Premium</div>
      <div style={{ fontSize:13,color:C.goldDim,marginBottom:22,lineHeight:1.7,maxWidth:380,margin:"0 auto 22px" }}>
        Full playback control: search your entire library, browse playlists, skip tracks, like songs, see what's coming up — all from here.
      </div>
      <Btn variant="primary" onClick={auth.login} style={{ fontSize:12,padding:"12px 28px" }}>
        {auth.loading?"Connecting…":"Connect Spotify →"}
      </Btn>
    </Card>
  );

  if (!player.ready) return (
    <Card style={{ marginTop:14, textAlign:"center", padding:"24px" }}>
      <div style={{ fontSize:13,color:C.goldDim,fontStyle:"italic" }}>Initialising Spotify player… <br/><span style={{ fontSize:11,color:C.goldFaint }}>This may take a few seconds.</span></div>
    </Card>
  );

  const pct = player.duration > 0 ? player.position/player.duration : 0;

  return (
    <Card style={{ marginTop:14 }}>
      {/* Header */}
      <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14 }}>
        <div style={{ display:"flex",alignItems:"center",gap:8 }}>
          <div style={{ fontFamily:"Cinzel,serif",fontSize:11,letterSpacing:"0.18em",color:C.gold,textTransform:"uppercase" }}>Spotify</div>
          <div style={{ width:7,height:7,borderRadius:"50%",background:"#1db954",boxShadow:"0 0 5px #1db954" }}/>
        </div>
        <Btn variant="ghost" onClick={auth.logout} style={{ fontSize:9,color:"rgba(180,80,80,0.7)" }}>Disconnect</Btn>
      </div>

      {/* Now playing */}
      {player.currentTrack ? (
        <div style={{ background:C.surfaceHigh,borderRadius:10,padding:"14px 16px",marginBottom:14 }}>
          <div style={{ display:"flex",alignItems:"center",gap:14,marginBottom:12 }}>
            {player.albumArt&&<img src={player.albumArt} alt="Album" style={{ width:64,height:64,borderRadius:7,flexShrink:0,objectFit:"cover" }}/>}
            <div style={{ flex:1,minWidth:0 }}>
              <div style={{ fontSize:15,color:C.gold,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",fontWeight:"normal" }}>
                {player.currentTrack.name}
              </div>
              <div style={{ fontSize:12,color:C.goldDim,marginTop:3 }}>{player.artistName}</div>
              <div style={{ fontSize:11,color:C.goldFaint,marginTop:1 }}>{player.albumName}</div>
            </div>
            {/* Like button */}
            <button onClick={player.toggleLike} aria-label={player.isLiked?"Unlike":"Like"} aria-pressed={player.isLiked}
              style={{ background:"transparent",border:"none",fontSize:22,cursor:"pointer",color:player.isLiked?"#1db954":C.goldFaint,outline:"none",padding:"4px",transition:"color 0.2s,transform 0.1s",flexShrink:0 }}
              onMouseEnter={e=>e.currentTarget.style.transform="scale(1.15)"}
              onMouseLeave={e=>e.currentTarget.style.transform="scale(1)"}>
              {player.isLiked?"♥":"♡"}
            </button>
          </div>

          {/* Progress bar */}
          <div style={{ marginBottom:8 }}>
            <div style={{ display:"flex",justifyContent:"space-between",fontSize:10,color:C.goldFaint,marginBottom:5 }}>
              <span>{fmtMs(player.position)}</span>
              <span>{fmtMs(player.duration)}</span>
            </div>
            <div
              style={{ height:4,background:C.border,borderRadius:2,cursor:"pointer",position:"relative" }}
              onClick={e=>{
                const r=e.currentTarget.getBoundingClientRect();
                player.seek(Math.floor(((e.clientX-r.left)/r.width)*player.duration));
              }}>
              <div style={{ height:"100%",width:`${pct*100}%`,background:"#1db954",borderRadius:2,transition:"width 0.5s linear",position:"relative" }}>
                <div style={{ position:"absolute",right:-5,top:-4,width:12,height:12,borderRadius:"50%",background:"#1db954",boxShadow:"0 0 4px rgba(29,185,84,0.6)" }}/>
              </div>
            </div>
          </div>

          {/* Transport */}
          <div style={{ display:"flex",alignItems:"center",gap:8,flexWrap:"wrap" }}>
            <button onClick={player.skipPrev} aria-label="Previous"
              style={{ background:"transparent",border:`1px solid ${C.border}`,borderRadius:7,color:C.goldMid,fontSize:16,cursor:"pointer",padding:"7px 11px",outline:"none" }}>⏮</button>
            <button onClick={player.isPaused?player.resume:player.pause}
              style={{ background:"rgba(29,185,84,0.2)",border:"2px solid rgba(29,185,84,0.6)",borderRadius:"50%",width:44,height:44,color:"#1db954",fontSize:18,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",outline:"none",flexShrink:0 }}>
              {player.isPaused?"▶":"⏸"}
            </button>
            <button onClick={player.skipNext} aria-label="Next"
              style={{ background:"transparent",border:`1px solid ${C.border}`,borderRadius:7,color:C.goldMid,fontSize:16,cursor:"pointer",padding:"7px 11px",outline:"none" }}>⏭</button>

            <div style={{ flex:1 }}/>

            <button onClick={player.toggleShuffle} aria-pressed={player.shuffle}
              style={{ display:"flex",alignItems:"center",gap:4,background:player.shuffle?"rgba(29,185,84,0.15)":"transparent",border:`1px solid ${player.shuffle?"rgba(29,185,84,0.4)":C.border}`,borderRadius:7,color:player.shuffle?"#1db954":C.goldFaint,fontSize:10,fontFamily:"Cinzel,serif",letterSpacing:"0.06em",cursor:"pointer",padding:"6px 10px",outline:"none",transition:"all 0.2s" }}>
              🔀 {player.shuffle?"On":"Off"}
            </button>
            <button onClick={player.toggleRepeat}
              style={{ display:"flex",alignItems:"center",gap:4,background:player.repeat!=="off"?"rgba(29,185,84,0.15)":"transparent",border:`1px solid ${player.repeat!=="off"?"rgba(29,185,84,0.4)":C.border}`,borderRadius:7,color:player.repeat!=="off"?"#1db954":C.goldFaint,fontSize:10,fontFamily:"Cinzel,serif",letterSpacing:"0.06em",cursor:"pointer",padding:"6px 10px",outline:"none",transition:"all 0.2s" }}>
              {player.repeat==="track"?"🔂":"🔁"} {player.repeat==="off"?"Off":player.repeat==="context"?"All":"One"}
            </button>
          </div>
        </div>
      ) : (
        <div style={{ background:C.surfaceHigh,borderRadius:10,padding:"14px 16px",marginBottom:14,textAlign:"center",color:C.goldDim,fontSize:13,fontStyle:"italic" }}>
          Nothing playing yet — search or paste a URL below
        </div>
      )}

      {/* Volume */}
      <div style={{ marginBottom:16 }}>
        <RangeWithTrack id="spvol" label="Volume" value={spotifyVol} onChange={v=>{ setSpotifyVol(v); player.setVol(v); }} leftLabel="0" rightLabel="100"/>
      </div>

      {/* Up Next queue */}
      {player.nextTracks?.length>0&&(
        <div style={{ marginBottom:16 }}>
          <div style={{ fontSize:10,fontFamily:"Cinzel,serif",letterSpacing:"0.12em",color:C.goldDim,textTransform:"uppercase",marginBottom:8 }}>Up Next — {player.nextTracks.length} tracks</div>
          <div style={{ background:C.surfaceHigh,borderRadius:9,overflow:"hidden" }}>
            {player.nextTracks.map((t,i)=>(
              <SpotifyTrackRow key={i} track={t} onPlay={playUri} onQueue={queueUri} showQueue={true}/>
            ))}
          </div>
        </div>
      )}

      {/* Browse tabs */}
      <div style={{ borderTop:`1px solid ${C.border}`,paddingTop:14,marginTop:4 }}>
        <div style={{ display:"flex",gap:6,marginBottom:12 }}>
          {[["search","🔍 Search"],["playlists","📚 Your Playlists"],["recent","🕐 Recently Played"],["url","🔗 Paste URL"]].map(([id,label])=>(
            <button key={id} onClick={()=>switchBrowse(id)}
              style={{ fontFamily:"Cinzel,serif",fontSize:9,letterSpacing:"0.08em",textTransform:"uppercase",background:browseTab===id?"rgba(232,217,160,0.1)":"transparent",border:`1px solid ${browseTab===id?C.borderFocus:C.border}`,borderRadius:7,color:browseTab===id?C.gold:C.goldDim,cursor:"pointer",padding:"7px 10px",outline:"none",transition:"all 0.2s",flexShrink:0 }}>
              {label}
            </button>
          ))}
        </div>

        {/* Search */}
        {browseTab==="search"&&(
          <>
            <div style={{ display:"flex",gap:8,marginBottom:10 }}>
              <TextInput value={searchQuery} onChange={e=>setSearchQuery(e.target.value)} onKeyDown={e=>e.key==="Enter"&&doSearch()} placeholder="Search tracks, playlists, artists…"/>
              <Btn variant="primary" onClick={doSearch} style={{ whiteSpace:"nowrap",flexShrink:0 }}>{searching?"…":"Search"}</Btn>
            </div>
            {searchResults&&(
              <div style={{ background:C.surfaceHigh,borderRadius:9,overflow:"hidden" }}>
                {searchResults.tracks?.items?.length>0&&(
                  <>
                    <div style={{ padding:"8px 14px",fontSize:9,fontFamily:"Cinzel,serif",letterSpacing:"0.1em",color:C.goldFaint,textTransform:"uppercase",borderBottom:`1px solid ${C.border}` }}>Tracks</div>
                    {searchResults.tracks.items.map(t=><SpotifyTrackRow key={t.id} track={t} onPlay={playUri} onQueue={queueUri} showQueue={true}/>)}
                  </>
                )}
                {searchResults.playlists?.items?.filter(Boolean).length>0&&(
                  <>
                    <div style={{ padding:"8px 14px",fontSize:9,fontFamily:"Cinzel,serif",letterSpacing:"0.1em",color:C.goldFaint,textTransform:"uppercase",borderBottom:`1px solid ${C.border}` }}>Playlists</div>
                    {searchResults.playlists.items.filter(Boolean).map(pl=><SpotifyPlaylistRow key={pl.id} pl={pl} onPlay={playUri}/>)}
                  </>
                )}
                <div style={{ padding:"8px 14px",textAlign:"right" }}>
                  <Btn variant="ghost" onClick={()=>setSearchResults(null)} style={{ fontSize:9 }}>Clear results</Btn>
                </div>
              </div>
            )}
          </>
        )}

        {/* My Playlists */}
        {browseTab==="playlists"&&(
          <div style={{ background:C.surfaceHigh,borderRadius:9,overflow:"hidden" }}>
            {!myPlaylists
              ? <div style={{ padding:"14px",textAlign:"center",color:C.goldDim,fontSize:13,fontStyle:"italic" }}>Loading…</div>
              : myPlaylists.items?.map(pl=><SpotifyPlaylistRow key={pl.id} pl={pl} onPlay={playUri}/>)
            }
          </div>
        )}

        {/* Recently Played */}
        {browseTab==="recent"&&(
          <div style={{ background:C.surfaceHigh,borderRadius:9,overflow:"hidden" }}>
            {!recentlyPlayed
              ? <div style={{ padding:"14px",textAlign:"center",color:C.goldDim,fontSize:13,fontStyle:"italic" }}>Loading…</div>
              : recentlyPlayed.items?.map((item,i)=><SpotifyTrackRow key={i} track={item.track} onPlay={playUri} onQueue={queueUri} showQueue={true}/>)
            }
          </div>
        )}

        {/* Paste URL */}
        {browseTab==="url"&&(
          <div>
            <div style={{ fontSize:12,color:C.goldDim,marginBottom:8 }}>Paste any Spotify URL — track, playlist, album, or artist.</div>
            <div style={{ display:"flex",gap:8 }}>
              <TextInput value={spotifyInput} onChange={e=>setSpotifyInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&onLoadSpotify()} placeholder="open.spotify.com/playlist/…"/>
              <Btn variant="primary" onClick={onLoadSpotify} style={{ whiteSpace:"nowrap",flexShrink:0 }}>Play</Btn>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}

function NotesScreen({ scenes, activeSceneId, setActiveSceneId, sceneData, setSceneData }) {
  const activeScene = scenes.find(s=>s.id===activeSceneId)??null;
  const sdata = sceneData[activeSceneId]??EMPTY_SDATA;

  function setNotes(text) {
    if (!activeSceneId) return;
    setSceneData(prev=>({ ...prev, [activeSceneId]:{ ...(prev[activeSceneId]??EMPTY_SDATA), notes:text } }));
  }

  return (
    <div>
      {/* Scene picker */}
      <Card style={{ marginBottom:20 }}>
        <div style={{ fontFamily:"Cinzel,serif",fontSize:11,letterSpacing:"0.18em",color:C.gold,textTransform:"uppercase",marginBottom:14 }}>Viewing Notes For</div>
        <div style={{ display:"flex",flexWrap:"wrap",gap:8 }}>
          {scenes.map(s=>(
            <button key={s.id} onClick={()=>setActiveSceneId(s.id)}
              aria-pressed={activeSceneId===s.id}
              style={{ background:activeSceneId===s.id?"rgba(232,217,160,0.12)":C.surfaceHigh,border:`1px solid ${activeSceneId===s.id?C.borderFocus:C.border}`,borderRadius:8,padding:"8px 14px",cursor:"pointer",display:"flex",alignItems:"center",gap:7,transition:"all 0.2s",outline:"none" }}>
              <span style={{ fontSize:16 }}>{s.icon}</span>
              <span style={{ fontFamily:"Cinzel,serif",fontSize:10,letterSpacing:"0.08em",color:activeSceneId===s.id?C.gold:C.goldMid,textTransform:"uppercase" }}>{s.name}</span>
            </button>
          ))}
        </div>
      </Card>

      {activeScene?(
        <Card>
          <div style={{ display:"flex",alignItems:"center",gap:10,marginBottom:16 }}>
            <span style={{ fontSize:28 }}>{activeScene.icon}</span>
            <div>
              <div style={{ fontFamily:"Cinzel,serif",fontSize:16,color:C.gold,letterSpacing:"0.1em" }}>{activeScene.name}</div>
              <div style={{ fontSize:12,color:C.goldDim,fontStyle:"italic",marginTop:2 }}>DM Session Notes</div>
            </div>
          </div>
          <textarea
            value={sdata.notes||""}
            onChange={e=>setNotes(e.target.value)}
            placeholder={`Notes for ${activeScene.name} — NPCs, plot hooks, traps, loot, reminders…`}
            aria-label={`Notes for ${activeScene.name}`}
            rows={14}
            style={{ width:"100%",background:C.surfaceHigh,border:`1px solid ${C.border}`,borderRadius:8,padding:"14px 18px",color:C.gold,fontSize:15,fontFamily:"Crimson Pro,Georgia,serif",resize:"vertical",outline:"none",lineHeight:1.75 }}
          />
          <div style={{ display:"flex",justifyContent:"space-between",fontSize:11,color:C.goldFaint,marginTop:8 }}>
            <span>Auto-saved · {(sdata.notes||"").length} characters</span>
            <span>Persists across sessions</span>
          </div>
        </Card>
      ):(
        <Card style={{ textAlign:"center",padding:"40px 20px" }}>
          <div style={{ fontSize:14,color:C.goldDim,fontStyle:"italic" }}>Select a scene above to view and edit its notes.</div>
        </Card>
      )}
    </div>
  );
}

const EXPORT_KEYS = ["andulaak_tension","andulaak_musicVol","andulaak_ambientVol","andulaak_sfxVol","andulaak_dayNight","andulaak_activeSceneId","andulaak_sceneData","andulaak_scenes","andulaak_soundboard","andulaak_presets","andulaak_plan","andulaak_tab"];

function exportSettings() {
  const data = {};
  EXPORT_KEYS.forEach(k=>{ const v=localStorage.getItem(k); if(v) data[k]=JSON.parse(v); });
  const blob = new Blob([JSON.stringify(data,null,2)],{type:"application/json"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href=url; a.download=`andulaak-${new Date().toISOString().slice(0,10)}.json`; a.click();
  URL.revokeObjectURL(url);
}

function ScenesScreen({ scenes, setScenes, sceneData, setSceneData, activeSceneId, setActiveSceneId, onEditScene, editingScene, setEditingScene }) {
  const fileInputRef  = useRef(null);
  const importRef     = useRef(null);
  const uploadRef     = useRef(null);

  function handleImport(e) {
    const file=e.target.files[0]; if(!file) return;
    const reader=new FileReader();
    reader.onload=ev=>{ try { const d=JSON.parse(ev.target.result); Object.entries(d).forEach(([k,v])=>localStorage.setItem(k,JSON.stringify(v))); window.location.reload(); } catch { alert("Invalid file."); } };
    reader.readAsText(file);
    e.target.value="";
  }

  async function handleUpload(e) {
    const file = e.target.files[0];
    if (!file||!uploadRef.current) return;
    const b64 = await compressImage(file);
    const sid = uploadRef.current;
    setSceneData(prev=>({...prev,[sid]:{...(prev[sid]??EMPTY_SDATA),bgImage:b64}}));
    e.target.value="";
  }
  function triggerUpload(sid) { uploadRef.current=sid; fileInputRef.current.click(); }
  function clearImg(sid) { setSceneData(prev=>({...prev,[sid]:{...(prev[sid]??EMPTY_SDATA),bgImage:null}})); }

  return (
    <div>
      <input ref={fileInputRef} type="file" accept="image/*" onChange={handleUpload} style={{ display:"none" }}/>
      <input ref={importRef} type="file" accept=".json" onChange={handleImport} style={{ display:"none" }}/>

      <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16,flexWrap:"wrap",gap:10 }}>
        <div style={{ fontSize:14,color:C.goldMid }}>Manage your campaign's scenes.</div>
        <div style={{ display:"flex",gap:8 }}>
          <Btn variant="ghost" onClick={()=>importRef.current.click()} style={{ fontSize:10 }}>Import ↑</Btn>
          <Btn variant="ghost" onClick={exportSettings} style={{ fontSize:10 }}>Export ↓</Btn>
          <Btn variant="primary" onClick={()=>setEditingScene({id:"",name:"",icon:"🗺️",color:"#0a0a06",particle:"dust",calm:"",tense:"",musicHint:"",ambientHint:""})}>
            + Add Scene
          </Btn>
        </div>
      </div>

      <div style={{ display:"flex",flexDirection:"column",gap:10 }}>
        {scenes.map((s,idx)=>{
          const sd = sceneData[s.id]??{};
          const isActive = activeSceneId===s.id;
          return (
            <Card key={s.id} style={{ display:"flex",alignItems:"center",gap:14,border:`1px solid ${isActive?C.borderFocus:C.border}` }}>
              {/* Thumbnail */}
              <div style={{ width:56,height:56,borderRadius:8,background:s.color,backgroundImage:sd.bgImage?`url(${sd.bgImage})`:"none",backgroundSize:"cover",backgroundPosition:"center",flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,border:`1px solid ${C.border}` }}>
                {!sd.bgImage&&s.icon}
              </div>

              <div style={{ flex:1,minWidth:0 }}>
                <div style={{ display:"flex",alignItems:"center",gap:8 }}>
                  <div style={{ fontFamily:"Cinzel,serif",fontSize:14,color:C.gold,letterSpacing:"0.06em" }}>{s.icon} {s.name}</div>
                  {isActive&&<span style={{ fontSize:9,fontFamily:"Cinzel,serif",letterSpacing:"0.1em",color:C.goldDim,background:"rgba(232,217,160,0.1)",padding:"2px 7px",borderRadius:4,textTransform:"uppercase" }}>Active</span>}
                </div>
                <div style={{ fontSize:12,color:C.goldDim,marginTop:3,fontStyle:"italic" }}>{s.calm}</div>
                <div style={{ display:"flex",alignItems:"center",gap:8,marginTop:6 }}>
                  <span style={{ fontSize:10,color:C.goldFaint,fontFamily:"Cinzel,serif",textTransform:"uppercase",letterSpacing:"0.06em" }}>Particle: {s.particle}</span>
                  <span style={{ width:12,height:12,borderRadius:3,background:s.color,border:`1px solid ${C.border}`,display:"inline-block" }}/>
                  <span style={{ fontSize:10,color:C.goldFaint }}>Key: {idx+1}</span>
                </div>
              </div>

              <div style={{ display:"flex",flexDirection:"column",gap:6,flexShrink:0 }}>
                <Btn variant="default" onClick={()=>triggerUpload(s.id)} style={{ fontSize:9,padding:"6px 12px" }}>
                  {sd.bgImage?"Change Image":"+ Image"}
                </Btn>
                {sd.bgImage&&<Btn variant="ghost" onClick={()=>clearImg(s.id)} style={{ fontSize:9,padding:"4px 12px",color:"rgba(180,80,80,0.8)" }}>Clear Image</Btn>}
              </div>
              <div style={{ display:"flex",gap:8,flexShrink:0 }}>
                <Btn variant="default" onClick={()=>setEditingScene(s)}>Edit</Btn>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

// ─── Preset modal ─────────────────────────────────────────────────────────
function PresetModal({ preset, onSave, onClose }) {
  const [f, setF] = useState({...preset});
  const u = (k,v) => setF(p=>({...p,[k]:v}));
  return (
    <Modal title="Edit Preset" onClose={onClose} width={380}>
      <div style={{ display:"flex", gap:12, marginBottom:18 }}>
        <div>
          <Label htmlFor="pre-icon">Icon</Label>
          <TextInput id="pre-icon" value={f.icon} onChange={e=>u("icon",e.target.value)} style={{ width:60,textAlign:"center",fontSize:20,padding:"6px" }}/>
        </div>
        <div style={{ flex:1 }}>
          <Label htmlFor="pre-name">Name</Label>
          <TextInput id="pre-name" value={f.name} onChange={e=>u("name",e.target.value)} placeholder="Preset name…"/>
        </div>
      </div>
      <div style={{ marginBottom:18 }}>
        <RangeWithTrack id="pre-tension" label="Tension" value={f.tension} onChange={v=>u("tension",v)}
          leftLabel="Peaceful" rightLabel="War"
          trackColor="linear-gradient(to right,#2d6b50,#4a8c6a,#c4742a,#8b2020,#5c0808)"/>
      </div>
      <div style={{ marginBottom:24 }}>
        <RangeWithTrack id="pre-day" label="Time of Day" value={f.dayNight} onChange={v=>u("dayNight",v)}
          leftLabel="Night" rightLabel="Day"
          trackColor="linear-gradient(to right,#0a0a1a,#2a1a4a,#6a3820,#d4843a,#f0c060)"/>
      </div>
      <div style={{ display:"flex", justifyContent:"flex-end", gap:10 }}>
        <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
        <Btn variant="primary" onClick={()=>onSave(f)}>Save</Btn>
      </div>
    </Modal>
  );
}

// ─── Encounter timer hook ──────────────────────────────────────────────────
function useTimer() {
  const [running, setRunning] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [round, setRound]     = useState(1);

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setSeconds(s => s + 1), 1000);
    return () => clearInterval(id);
  }, [running]);

  const mm = String(Math.floor(seconds / 60)).padStart(2,"0");
  const ss = String(seconds % 60).padStart(2,"0");

  return {
    running, seconds, round,
    display: `${mm}:${ss}`,
    dndRound: Math.floor(seconds / 6) + 1,
    toggle: () => setRunning(r=>!r),
    nextRound: () => setRound(r=>r+1),
    reset: () => { setRunning(false); setSeconds(0); setRound(1); },
  };
}

// ─── Session plan screen ───────────────────────────────────────────────────
function PlanScreen({ scenes, sessionPlan, setSessionPlan, activeSceneId, onSceneClick }) {
  const activeScene = scenes.find(s=>s.id===activeSceneId)??null;
  const currentStep = sessionPlan.findIndex(id=>id===activeSceneId);

  function addToplan(sceneId) {
    setSessionPlan(prev=>[...prev,sceneId]);
  }
  function removeStep(idx) {
    setSessionPlan(prev=>prev.filter((_,i)=>i!==idx));
  }
  function moveStep(idx, dir) {
    setSessionPlan(prev=>{
      const next=[...prev];
      const target=idx+dir;
      if(target<0||target>=next.length) return next;
      [next[idx],next[target]]=[next[target],next[idx]];
      return next;
    });
  }
  function goToStep(idx) {
    const scene=scenes.find(s=>s.id===sessionPlan[idx]);
    if(scene) onSceneClick(scene);
  }

  return (
    <div>
      {/* Progress bar */}
      {sessionPlan.length>0&&(
        <Card style={{ marginBottom:20 }}>
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:14 }}>
            <div>
              <div style={{ fontFamily:"Cinzel,serif",fontSize:11,letterSpacing:"0.18em",color:C.gold,textTransform:"uppercase" }}>Session Progress</div>
              <div style={{ fontSize:13,color:C.goldDim,marginTop:3,fontStyle:"italic" }}>
                {currentStep>=0 ? `Scene ${currentStep+1} of ${sessionPlan.length}` : `${sessionPlan.length} scenes planned`}
              </div>
            </div>
            <div style={{ display:"flex", gap:8 }}>
              {currentStep>=0&&currentStep<sessionPlan.length-1&&(
                <Btn variant="primary" onClick={()=>goToStep(currentStep+1)}>Next Scene →</Btn>
              )}
              {currentStep<0&&sessionPlan.length>0&&(
                <Btn variant="primary" onClick={()=>goToStep(0)}>▶ Begin Session</Btn>
              )}
            </div>
          </div>
          {/* Progress dots */}
          <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
            {sessionPlan.map((id,i)=>{
              const sc=scenes.find(s=>s.id===id);
              const isDone=currentStep>i;
              const isCurrent=currentStep===i;
              return (
                <div key={i} onClick={()=>goToStep(i)} style={{ display:"flex",alignItems:"center",gap:5,padding:"5px 10px",borderRadius:7,background:isCurrent?"rgba(232,217,160,0.12)":isDone?"rgba(74,140,106,0.12)":"transparent",border:`1px solid ${isCurrent?C.borderFocus:isDone?"rgba(74,140,106,0.3)":C.border}`,cursor:"pointer",transition:"all 0.2s" }}>
                  <span style={{ fontSize:14 }}>{sc?.icon??"?"}</span>
                  <span style={{ fontFamily:"Cinzel,serif",fontSize:9,letterSpacing:"0.06em",color:isCurrent?C.gold:isDone?"#4a8c6a":C.goldDim,textTransform:"uppercase" }}>{sc?.name??"Unknown"}</span>
                  {isDone&&<span style={{ fontSize:10,color:"#4a8c6a" }}>✓</span>}
                </div>
              );
            })}
          </div>
        </Card>
      )}

      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16 }}>
        {/* Plan queue */}
        <div>
          <div style={{ fontFamily:"Cinzel,serif",fontSize:10,letterSpacing:"0.18em",color:C.goldDim,textTransform:"uppercase",marginBottom:12 }}>
            Tonight's Sequence
          </div>
          {sessionPlan.length===0?(
            <Card style={{ textAlign:"center",padding:"32px 20px",color:C.goldDim,fontStyle:"italic",fontSize:14 }}>
              Add scenes from the list →
            </Card>
          ):(
            <div style={{ display:"flex",flexDirection:"column",gap:8 }}>
              {sessionPlan.map((id,i)=>{
                const sc=scenes.find(s=>s.id===id);
                const isCurrent=currentStep===i;
                return (
                  <div key={i} style={{ display:"flex",alignItems:"center",gap:10,background:isCurrent?"rgba(232,217,160,0.08)":C.surface,border:`1px solid ${isCurrent?C.borderFocus:C.border}`,borderRadius:9,padding:"10px 14px",transition:"all 0.2s" }}>
                    <span style={{ fontSize:11,color:C.goldFaint,fontFamily:"Cinzel,serif",minWidth:18 }}>{i+1}</span>
                    <span style={{ fontSize:20 }}>{sc?.icon??"?"}</span>
                    <span style={{ fontFamily:"Cinzel,serif",fontSize:11,color:isCurrent?C.gold:C.goldMid,flex:1,textTransform:"uppercase",letterSpacing:"0.06em" }}>{sc?.name??id}</span>
                    <div style={{ display:"flex",gap:4 }}>
                      <button onClick={()=>moveStep(i,-1)} disabled={i===0} style={{ background:"transparent",border:`1px solid ${C.border}`,borderRadius:5,padding:"3px 7px",color:C.goldDim,cursor:i===0?"not-allowed":"pointer",fontSize:12,opacity:i===0?0.3:1 }}>↑</button>
                      <button onClick={()=>moveStep(i,1)}  disabled={i===sessionPlan.length-1} style={{ background:"transparent",border:`1px solid ${C.border}`,borderRadius:5,padding:"3px 7px",color:C.goldDim,cursor:i===sessionPlan.length-1?"not-allowed":"pointer",fontSize:12,opacity:i===sessionPlan.length-1?0.3:1 }}>↓</button>
                      <button onClick={()=>removeStep(i)} style={{ background:"transparent",border:`1px solid rgba(180,60,60,0.25)`,borderRadius:5,padding:"3px 7px",color:"rgba(200,80,80,0.8)",cursor:"pointer",fontSize:12 }}>✕</button>
                    </div>
                  </div>
                );
              })}
              <Btn variant="ghost" onClick={()=>setSessionPlan([])} style={{ marginTop:4,fontSize:10,color:"rgba(180,80,80,0.7)" }}>Clear All</Btn>
            </div>
          )}
        </div>

        {/* Scene picker */}
        <div>
          <div style={{ fontFamily:"Cinzel,serif",fontSize:10,letterSpacing:"0.18em",color:C.goldDim,textTransform:"uppercase",marginBottom:12 }}>
            Add Scene
          </div>
          <div style={{ display:"flex",flexDirection:"column",gap:6 }}>
            {scenes.map(s=>(
              <div key={s.id} style={{ display:"flex",alignItems:"center",gap:10,background:C.surface,border:`1px solid ${C.border}`,borderRadius:9,padding:"10px 14px" }}>
                <span style={{ fontSize:20 }}>{s.icon}</span>
                <span style={{ fontFamily:"Cinzel,serif",fontSize:11,color:C.goldMid,flex:1,textTransform:"uppercase",letterSpacing:"0.06em" }}>{s.name}</span>
                <Btn variant="default" onClick={()=>addToplan(s.id)} style={{ fontSize:9,padding:"5px 12px" }}>+ Add</Btn>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Help screen ──────────────────────────────────────────────────────────

const HELP_SECTIONS = [
  {
    title: "Stage",
    icon: "🎭",
    items: [
      { q: "Switching scenes", a: "Click any scene card, or press the number key shown in its corner (1–8). An ink bleed transition plays and audio crossfades automatically." },
      { q: "Now Playing bar", a: "Shows the active scene, current mood, time of day, and tension level at a glance. The dot pulses green (calm) → red (war) as tension rises. Click ▶/⏸ or press Space to play/pause." },
      { q: "Tension slider", a: "Drag from Peaceful to War. This changes particle speed and count, shifts the screen edge to a red glow, makes the title blaze, and triggers a heartbeat pulse at 80+." },
      { q: "Time of Day slider", a: "Shifts the overlay from Dead of Night (dark blue) to High Noon (warm light). Purely visual — the scene particles and vignette stay, only brightness shifts." },
      { q: "Keyboard shortcuts", a: "1–8: switch scenes · Space: play/pause · P: enter presentation mode · Esc: exit presentation." },
    ],
  },
  {
    title: "Audio",
    icon: "🎵",
    items: [
      { q: "Loading a track", a: "Paste any YouTube URL or bare video ID into the Music Track or Ambient Sound field. Press Load or hit Enter. The player initialises and starts automatically. Each track is saved per scene — switching scenes loads that scene's saved URLs." },
      { q: "Two independent layers", a: "Music Track and Ambient Sound run in separate YouTube players. Set their volumes independently in the Volume Mix panel below." },
      { q: "Soundboard", a: "Eight one-shot sound buttons. Click ✎ on any slot to assign a name, icon, and YouTube URL. Clicking a loaded slot triggers it immediately in the SFX Player (no loop). Use it for combat stings, thunder, bells, dragon roars." },
      { q: "SFX Player", a: "Appears below the soundboard when a sound is triggered. It has full YouTube controls so you can pause or replay the clip. Click 'hide' to collapse it." },
      { q: "Volume Mix", a: "Three sliders: Music, Ambient, SFX. Volumes persist across sessions." },
    ],
  },
  {
    title: "Notes",
    icon: "📜",
    items: [
      { q: "DM session notes", a: "Every scene has its own notepad. Write NPCs, plot hooks, traps, loot, reminders — anything the DM needs to remember for that location." },
      { q: "Switching scene notes", a: "Use the scene buttons at the top of the Notes screen to jump between scenes. No need to go back to Stage first." },
      { q: "Auto-saved", a: "Notes save instantly to the browser's local storage as you type. They persist across page refreshes and browser closes indefinitely." },
    ],
  },
  {
    title: "Scenes",
    icon: "🗺️",
    items: [
      { q: "Adding a scene", a: "Click '+ Add Scene' in the top right of the Scenes screen (or the same button in Stage's scene grid). Fill in name, icon, color, particle type, and mood descriptions." },
      { q: "Editing a scene", a: "In the Scenes screen click Edit, or hover a scene card in Stage and click the ✎ pencil. You can change the name, icon, atmosphere color, particle effect, and mood text." },
      { q: "Scene background image", a: "Click '+ Image' on any scene card or in the Scenes screen. The image is compressed and saved to local storage — it persists across sessions. The background shows at 35–38% opacity behind the vignette and particles." },
      { q: "Deleting a scene", a: "Open the scene editor and click 'Delete Scene' at the bottom left. The active scene resets to none if you delete the current one." },
      { q: "Color & particle", a: "Each scene has a body background color and a vignette tint derived from it. Particle types: rain (docks/storms), ember (tavern/court fire), dust (roads/fields), snow (mountain), ash (dark/war)." },
    ],
  },
  {
    title: "Presentation Mode",
    icon: "🖥️",
    items: [
      { q: "Entering", a: "Click 'Present' in the top right header, or press P. All UI fades out, leaving only the background image, vignette, particles, and atmospheric overlays." },
      { q: "Exiting", a: "Press Esc or click the 'Exit Present' button that appears in the bottom right corner." },
      { q: "Best use", a: "Share your screen with players during an online session. They see the pure atmosphere while you control everything from the hidden UI on your own monitor." },
    ],
  },
  {
    title: "Persistence",
    icon: "💾",
    items: [
      { q: "What saves automatically", a: "Everything: active scene, tension, day/night, all volume levels, per-scene audio URLs, per-scene background images, scene notes, soundboard slots, and any custom scenes you created." },
      { q: "How it saves", a: "Browser local storage — no account, no server. Refreshing or closing the tab loses nothing. Everything restores exactly as you left it." },
      { q: "Clearing data", a: "Open your browser's dev tools (F12 → Application → Local Storage) and delete the 'andulaak_' keys to reset to defaults." },
    ],
  },
];

function HelpScreen() {
  const [open, setOpen] = useState(null);

  return (
    <div>
      <Card style={{ marginBottom:20 }}>
        <div style={{ display:"flex",alignItems:"center",gap:14,marginBottom:10 }}>
          <div style={{ fontSize:32 }}>📖</div>
          <div>
            <div style={{ fontFamily:"Cinzel,serif",fontSize:16,color:C.gold,letterSpacing:"0.08em" }}>Andulaak Atmosphere Board</div>
            <div style={{ fontSize:13,color:C.goldDim,fontStyle:"italic",marginTop:3 }}>Complete feature guide for the DM</div>
          </div>
        </div>
        <p style={{ fontSize:14,color:C.goldMid,lineHeight:1.7 }}>
          This board gives you full real-time control over the mood, music, and atmosphere of your sessions.
          Click any section below to expand it. Everything auto-saves — no setup needed between sessions.
        </p>
      </Card>

      <div style={{ display:"flex",flexDirection:"column",gap:8 }}>
        {HELP_SECTIONS.map((section,si)=>{
          const isOpen = open===si;
          return (
            <div key={si} style={{ background:C.surface,border:`1px solid ${isOpen?C.borderFocus:C.border}`,borderRadius:10,overflow:"hidden",transition:"border-color 0.2s" }}>
              <button
                onClick={()=>setOpen(isOpen?null:si)}
                aria-expanded={isOpen}
                style={{ width:"100%",display:"flex",alignItems:"center",gap:12,padding:"16px 20px",background:"transparent",border:"none",cursor:"pointer",outline:"none",textAlign:"left" }}>
                <span style={{ fontSize:22,flexShrink:0 }}>{section.icon}</span>
                <span style={{ fontFamily:"Cinzel,serif",fontSize:13,color:C.gold,letterSpacing:"0.1em",flex:1 }}>{section.title}</span>
                <span style={{ fontSize:18,color:C.goldDim,transition:"transform 0.2s",transform:isOpen?"rotate(180deg)":"none" }}>⌄</span>
              </button>

              {isOpen&&(
                <div style={{ padding:"0 20px 20px" }}>
                  <div style={{ height:1,background:C.border,marginBottom:16 }}/>
                  <div style={{ display:"flex",flexDirection:"column",gap:14 }}>
                    {section.items.map((item,ii)=>(
                      <div key={ii} style={{ display:"grid",gridTemplateColumns:"200px 1fr",gap:16,alignItems:"start" }}>
                        <div style={{ fontFamily:"Cinzel,serif",fontSize:11,color:C.goldMid,letterSpacing:"0.06em",paddingTop:2 }}>{item.q}</div>
                        <div style={{ fontSize:14,color:C.goldMid,lineHeight:1.65 }}>{item.a}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <Card style={{ marginTop:20, textAlign:"center" }}>
        <div style={{ fontSize:14,color:C.goldDim,lineHeight:1.7,fontStyle:"italic" }}>
          "The calm is here. It won't last."
          <br/>
          <span style={{ fontSize:12,color:C.goldFaint }}>Built for the world of Andulaak · All settings persist across sessions</span>
        </div>
      </Card>
    </div>
  );
}

// ─── App root ──────────────────────────────────────────────────────────────
export default function App() {
  const [tension, setTension]             = useLocalStorage("andulaak_tension", 10);
  const [musicVol, setMusicVol]           = useLocalStorage("andulaak_musicVol", 60);
  const [ambientVol, setAmbientVol]       = useLocalStorage("andulaak_ambientVol", 70);
  const [sfxVol, setSfxVol]               = useLocalStorage("andulaak_sfxVol", 85);
  const [dayNight, setDayNight]           = useLocalStorage("andulaak_dayNight", 20);
  const [activeSceneId, setActiveSceneId] = useLocalStorage("andulaak_activeSceneId", null);
  const [sceneData, setSceneData]         = useLocalStorage("andulaak_sceneData", {});
  const [scenes, setScenes]               = useLocalStorage("andulaak_scenes", DEFAULT_SCENES);
  const [soundboard, setSoundboard]       = useLocalStorage("andulaak_soundboard", DEFAULT_SOUNDBOARD);
  const [presets, setPresets]             = useLocalStorage("andulaak_presets", DEFAULT_PRESETS);
  const [sessionPlan, setSessionPlan]     = useLocalStorage("andulaak_plan", []);
  const [spotifyVol, setSpotifyVol]       = useLocalStorage("andulaak_spotifyVol", 70);
  const [activeTab, setActiveTab]         = useLocalStorage("andulaak_tab", "stage");

  const [isPlaying, setIsPlaying]     = useState(false);
  const [inkActive, setInkActive]     = useState(false);
  const [pendingSceneId, setPending]  = useState(null);
  const [presentationMode, setPresent]= useState(false);
  const [editingScene, setEditScene]  = useState(null);
  const [editingSfxIdx, setEditSfx]   = useState(null);
  const [editingPreset, setEditPreset]= useState(null);
  const [musicInput, setMusicInput]   = useState("");
  const [ambientInput, setAmbientInput]=useState("");
  const [spotifyInput, setSpotifyInput]=useState("");
  const [musicReloadKey, setMusicReloadKey]   = useState(0);
  const [ambientReloadKey, setAmbientReloadKey]=useState(0);
  const timer        = useTimer();
  const spotifyAuth  = useSpotifyAuth();
  const spotifyPlayer= useSpotifyPlayer(spotifyAuth.token);

  const musicVolRef   = useRef(musicVol);
  const ambientVolRef = useRef(ambientVol);
  const fadeRef       = useRef(null);
  const sceneDataRef  = useRef(sceneData);
  musicVolRef.current   = musicVol;
  ambientVolRef.current = ambientVol;
  sceneDataRef.current  = sceneData;

  const activeScene  = scenes.find(s=>s.id===activeSceneId)??null;
  const activeSData  = sceneData[activeSceneId]??EMPTY_SDATA;
  const musicId      = getYouTubeId(activeSData.musicUrl);
  const ambientId    = getYouTubeId(activeSData.ambientUrl);
  const t            = tension/100;
  const tensionColor = getTensionColor(tension);

  const setMusicDirect   = useYTPlayer("music-player",   musicId,   musicVol,   isPlaying, musicReloadKey);
  const setAmbientDirect = useYTPlayer("ambient-player", ambientId, ambientVol, isPlaying, ambientReloadKey);
  const triggerSfx       = useSfxPlayer("sfx-player-main");

  useEffect(()=>{ if(activeScene) document.body.style.background=activeScene.color; },[]); // eslint-disable-line

  useEffect(()=>{
    if(!activeSceneId) return;
    const sd = sceneDataRef.current[activeSceneId]??EMPTY_SDATA;
    setMusicInput(sd.musicUrl||""); setAmbientInput(sd.ambientUrl||"");
  },[activeSceneId]);

  // Keyboard shortcuts (only when not focused in a text field)
  useEffect(()=>{
    function onKey(e) {
      if(["INPUT","TEXTAREA","SELECT"].includes(e.target.tagName)) return;
      if(e.key==="Escape") setPresent(false);
      if(e.key==="p"||e.key==="P") setPresent(true);
      if(e.key===" ") { e.preventDefault(); if(activeScene) setIsPlaying(p=>!p); }
      const n=parseInt(e.key);
      if(!isNaN(n)&&n>=1&&n<=scenes.length) handleSceneClick(scenes[n-1]);
    }
    window.addEventListener("keydown",onKey);
    return()=>window.removeEventListener("keydown",onKey);
  },[scenes,activeSceneId,activeScene]);

  function fade(from, to, ms, done) {
    if(fadeRef.current) clearInterval(fadeRef.current);
    const start=Date.now();
    fadeRef.current=setInterval(()=>{
      const p=Math.min(1,(Date.now()-start)/ms);
      const v=from+(to-from)*p;
      setMusicDirect(musicVolRef.current*v);
      setAmbientDirect(ambientVolRef.current*v);
      if(p>=1){ clearInterval(fadeRef.current); done?.(); }
    },16);
  }

  function handleSceneClick(scene) {
    if(scene.id===activeSceneId) return;
    setPending(scene.id); setInkActive(true); fade(1,0,700);
  }

  function handleInkDone() {
    const scene=scenes.find(s=>s.id===pendingSceneId);
    if(!scene) return;
    setActiveSceneId(pendingSceneId); setIsPlaying(true);
    setInkActive(false); setPending(null);
    document.body.style.background=scene.color;
    setTimeout(()=>fade(0,1,1100),400);
  }

  function updateSceneUrl(field, value) {
    if(!activeSceneId) return;
    setSceneData(prev=>({...prev,[activeSceneId]:{...(prev[activeSceneId]??EMPTY_SDATA),[field]:value}}));
  }

  function handleLoadSpotify() {
    if (!spotifyInput.trim()) return;
    updateSceneUrl("spotifyUrl", spotifyInput);
    spotifyPlayer.play(spotifyInput);
  }

  // Restore Spotify URL input when scene changes
  useEffect(() => {
    if (!activeSceneId) return;
    const sd = sceneDataRef.current[activeSceneId] ?? EMPTY_SDATA;
    setSpotifyInput(sd.spotifyUrl || "");
  }, [activeSceneId]);

  function saveScene(form) {
    if(!form.name.trim()) return;
    if(!form.id) {
      const id=`scene_${Date.now()}`;
      setScenes(prev=>[...prev,{...form,id}]);
      setSceneData(prev=>({...prev,[id]:EMPTY_SDATA}));
    } else {
      setScenes(prev=>prev.map(s=>s.id===form.id?{...s,...form}:s));
    }
    setEditScene(null);
  }

  function deleteScene(id) {
    setScenes(prev=>prev.filter(s=>s.id!==id));
    if(activeSceneId===id){ setActiveSceneId(null); setIsPlaying(false); document.body.style.background="#0a0806"; }
    setEditScene(null);
  }

  function saveSfx(index, form) {
    setSoundboard(prev=>prev.map((s,i)=>i===index?form:s));
    setEditSfx(null);
  }

  const nightOpacity = Math.max(0,(50-dayNight)/50)*0.45;
  const dayOpacity   = Math.max(0,(dayNight-50)/50)*0.07;

  return (
    <>
      {/* ─── Atmospheric layers ─────────────────────────────────── */}
      {activeScene&&sceneData[activeScene.id]?.bgImage&&(
        <div style={{ position:"fixed",inset:0,zIndex:0,backgroundImage:`url(${sceneData[activeScene.id].bgImage})`,backgroundSize:"cover",backgroundPosition:"center",opacity:0.35,transition:"opacity 1.5s ease" }}/>
      )}
      <div style={{ position:"fixed",inset:0,pointerEvents:"none",zIndex:1,background:activeScene?`radial-gradient(ellipse at center,transparent 10%,${hexToTint(activeScene.color)} 100%)`:"none",transition:"background 1.8s ease" }}/>
      {nightOpacity>0&&<div style={{ position:"fixed",inset:0,pointerEvents:"none",zIndex:1,background:`rgba(0,4,18,${nightOpacity})`,transition:"background 0.8s" }}/>}
      {dayOpacity>0&&<div style={{ position:"fixed",inset:0,pointerEvents:"none",zIndex:1,background:`rgba(255,235,180,${dayOpacity})`,transition:"background 0.8s" }}/>}
      {tension>65&&<div style={{ position:"fixed",inset:0,pointerEvents:"none",zIndex:1,boxShadow:`inset 0 0 ${60+t*90}px rgba(140,10,10,${0.15+t*0.3})` }}/>}
      {tension>65&&<div style={{ position:"fixed",inset:0,pointerEvents:"none",zIndex:1,background:`rgba(${Math.floor(t*28)},0,0,${t*0.08})`,transition:"background 0.5s" }}/>}
      {tension>=80&&<div style={{ position:"fixed",inset:0,pointerEvents:"none",zIndex:1,background:"rgba(110,0,0,0.12)",animation:`heartbeat ${(2-(tension-80)/20*0.8).toFixed(2)}s ease-in-out infinite` }}/>}
      {activeScene&&<ParticleLayer type={activeScene.particle} tension={tension}/>}
      <InkBleed active={inkActive} onDone={handleInkDone}/>

      {/* Hidden persistent YT containers */}
      <div style={{ display:"none" }}>
        <div id="sfx-player-main"/>
      </div>
      {/* Hidden players for scenes with no active audio panel shown */}
      <div style={{ display:"none" }}>
        <div id="music-player"/>
        <div id="ambient-player"/>
      </div>

      {/* ─── Main UI — fixed height flex column ──────────────────── */}
      <div style={{
        position:"fixed", inset:0, zIndex:3,
        display:"flex", flexDirection:"column",
        maxWidth:940, margin:"0 auto", left:0, right:0,
        opacity:presentationMode?0:1, pointerEvents:presentationMode?"none":"all",
        transition:"opacity 0.8s ease",
      }}>

        {/* Compact header */}
        <div style={{ flexShrink:0, borderBottom:`1px solid ${C.border}`, padding:"14px 24px 12px", display:"flex", alignItems:"center", justifyContent:"space-between", gap:16 }}>
          <div style={{ fontSize:10,color:C.goldFaint,fontStyle:"italic",lineHeight:1.6,minWidth:110 }}>
            Space: play/pause<br/>P: present · 1–{scenes.length}: scenes
          </div>
          <div style={{ textAlign:"center", flex:1 }}>
            <h1 style={{ fontFamily:"Cinzel,serif",fontSize:30,fontWeight:700,letterSpacing:"0.3em",color:C.gold,margin:0,textShadow:tension>60?`0 0 ${16+t*50}px rgba(220,80,40,${0.3+t*0.4})`:"0 0 30px rgba(232,217,160,0.15)",transition:"text-shadow 0.6s" }}>
              ANDULAAK
            </h1>
            <div style={{ fontSize:11,color:C.goldDim,fontStyle:"italic",marginTop:2,letterSpacing:"0.12em" }}>
              Atmosphere Board · DM Console
            </div>
          </div>
          <div style={{ minWidth:110, display:"flex", justifyContent:"flex-end" }}>
            <button onClick={()=>setPresent(true)} aria-label="Enter presentation mode"
              style={{ fontFamily:"Cinzel,serif",fontSize:10,letterSpacing:"0.15em",color:C.goldMid,textTransform:"uppercase",cursor:"pointer",border:`1px solid ${C.border}`,padding:"8px 16px",borderRadius:7,background:C.surface,outline:"none" }}>
              Present
            </button>
          </div>
        </div>

        {/* Tab navigation — always centered */}
        <div role="tablist" style={{ flexShrink:0, display:"flex", justifyContent:"center", gap:2, padding:"10px 24px", borderBottom:`1px solid ${C.border}` }}>
          {TABS.map(tab=>{
            const isActive = activeTab===tab.id;
            return (
              <button key={tab.id} role="tab" aria-selected={isActive} aria-controls={`panel-${tab.id}`}
                onClick={()=>setActiveTab(tab.id)}
                style={{ fontFamily:"Cinzel,serif",fontSize:10,letterSpacing:"0.15em",textTransform:"uppercase",color:isActive?C.gold:C.goldDim,background:isActive?"rgba(232,217,160,0.08)":"transparent",border:`1px solid ${isActive?C.borderFocus:"transparent"}`,borderRadius:7,padding:"9px 20px",cursor:"pointer",transition:"all 0.2s",outline:"none",flexShrink:0 }}>
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Tab panel — scrollable, takes all remaining height */}
        <div role="tabpanel" id={`panel-${activeTab}`} style={{ flex:1, overflowY:"auto", padding:"20px 24px 24px" }}>
          {activeTab==="stage"&&(
            <StageScreen
              scenes={scenes} sceneData={sceneData} activeSceneId={activeSceneId}
              onSceneClick={handleSceneClick} tension={tension} setTension={setTension}
              dayNight={dayNight} setDayNight={setDayNight}
              musicVol={musicVol} ambientVol={ambientVol}
              isPlaying={isPlaying} setIsPlaying={setIsPlaying}
              tensionColor={tensionColor}
              presets={presets} onEditPreset={setEditPreset}
              timer={timer}
            />
          )}
          {activeTab==="audio"&&(
            <AudioScreen
              activeScene={activeScene} sceneData={sceneData}
              musicId={musicId} ambientId={ambientId}
              musicVol={musicVol} setMusicVol={setMusicVol}
              ambientVol={ambientVol} setAmbientVol={setAmbientVol}
              sfxVol={sfxVol} setSfxVol={setSfxVol}
              spotifyVol={spotifyVol} setSpotifyVol={setSpotifyVol}
              isPlaying={isPlaying} soundboard={soundboard} setSoundboard={setSoundboard}
              onLoadMusic={()=>{ updateSceneUrl("musicUrl",musicInput); setIsPlaying(true); setMusicReloadKey(k=>k+1); }}
              onLoadAmbient={()=>{ updateSceneUrl("ambientUrl",ambientInput); setIsPlaying(true); setAmbientReloadKey(k=>k+1); }}
              onClearMusic={()=>{ updateSceneUrl("musicUrl",""); setMusicInput(""); }}
              onClearAmbient={()=>{ updateSceneUrl("ambientUrl",""); setAmbientInput(""); }}
              musicInput={musicInput} setMusicInput={setMusicInput}
              ambientInput={ambientInput} setAmbientInput={setAmbientInput}
              triggerSfx={triggerSfx}
              editingSfxIdx={editingSfxIdx} setEditingSfxIdx={setEditSfx}
              spotifyAuth={spotifyAuth} spotifyPlayer={spotifyPlayer}
              spotifyInput={spotifyInput} setSpotifyInput={setSpotifyInput}
              onLoadSpotify={handleLoadSpotify}
            />
          )}
          {activeTab==="notes"&&(
            <NotesScreen
              scenes={scenes} activeSceneId={activeSceneId} setActiveSceneId={setActiveSceneId}
              sceneData={sceneData} setSceneData={setSceneData}
            />
          )}
          {activeTab==="plan"&&(
            <PlanScreen
              scenes={scenes} sessionPlan={sessionPlan} setSessionPlan={setSessionPlan}
              activeSceneId={activeSceneId} onSceneClick={handleSceneClick}
            />
          )}
          {activeTab==="scenes"&&(
            <ScenesScreen
              scenes={scenes} setScenes={setScenes}
              sceneData={sceneData} setSceneData={setSceneData}
              activeSceneId={activeSceneId} setActiveSceneId={setActiveSceneId}
              editingScene={editingScene} setEditingScene={setEditScene}
            />
          )}
          {activeTab==="help"&&<HelpScreen/>}
        </div>

        {/* Footer */}
        <div style={{ textAlign:"center",fontSize:10,color:C.goldFaint,fontStyle:"italic",paddingTop:"1.5rem",marginTop:"1rem",borderTop:`1px solid ${C.border}` }}>
          Andulaak Atmosphere Board · The calm is here. It won't last.
        </div>
      </div>{/* end main UI flex column */}

      {/* Audio panels — always in DOM so players persist across tab switches */}
      {activeTab!=="audio"&&(
        <div style={{ display:"none" }}>
          <div id="music-player-bg"/>
          <div id="ambient-player-bg"/>
        </div>
      )}

      {/* Exit presentation */}
      {presentationMode&&(
        <button onClick={()=>setPresent(false)} aria-label="Exit presentation mode"
          style={{ position:"fixed",bottom:24,right:24,zIndex:200,fontFamily:"Cinzel,serif",fontSize:10,letterSpacing:"0.15em",color:C.goldMid,textTransform:"uppercase",cursor:"pointer",border:`1px solid ${C.border}`,padding:"9px 18px",borderRadius:7,background:"rgba(10,8,6,0.85)",outline:"none" }}>
          Exit Present
        </button>
      )}

      {/* Modals */}
      {editingScene!==null&&<SceneModal scene={editingScene} onSave={saveScene} onDelete={deleteScene} onClose={()=>setEditScene(null)}/>}
      {editingSfxIdx!==null&&<SfxModal slot={soundboard[editingSfxIdx]} index={editingSfxIdx} onSave={saveSfx} onClose={()=>setEditSfx(null)}/>}
      {editingPreset!==null&&<PresetModal preset={editingPreset} onSave={p=>{ setPresets(prev=>prev.map(x=>x.id===p.id?p:x)); setEditPreset(null); }} onClose={()=>setEditPreset(null)}/>}

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@400;600;700&family=Crimson+Pro:ital,wght@0,300;0,400;1,300&display=swap');
        *{box-sizing:border-box;margin:0;padding:0;}
        body{background:#0a0806;color:${C.goldMid};font-family:'Crimson Pro',Georgia,serif;min-height:100vh;transition:background 1.8s ease;}
        input[type=range]{-webkit-appearance:none;height:4px;background:transparent;cursor:pointer;width:100%;}
        input[type=range]::-webkit-slider-runnable-track{height:4px;background:${C.surfaceHigh};border-radius:3px;}
        input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:17px;height:17px;border-radius:50%;background:${C.gold};border:2px solid #0a0806;box-shadow:0 0 8px rgba(232,217,160,0.4);margin-top:-7px;}
        input::placeholder,textarea::placeholder{color:${C.goldFaint};}
        textarea{font-family:'Crimson Pro',Georgia,serif;}
        button:focus-visible,input:focus-visible,textarea:focus-visible{outline:2px solid rgba(232,217,160,0.5);outline-offset:2px;}
        @keyframes pulse{0%,100%{opacity:1;transform:scale(1);}50%{opacity:0.35;transform:scale(0.75);}}
        @keyframes heartbeat{0%,100%{opacity:0;}10%,30%{opacity:1;}45%,100%{opacity:0;}}
        ::-webkit-scrollbar{width:6px;}
        ::-webkit-scrollbar-track{background:transparent;}
        ::-webkit-scrollbar-thumb{background:${C.border};border-radius:3px;}
      `}</style>
    </>
  );
}
