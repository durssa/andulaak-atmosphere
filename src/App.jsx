import { useState, useEffect, useRef, useCallback } from "react";

const SCENES = [
  {
    id: "docks", name: "Likandir Docks", icon: "⚓",
    color: "#060e18", tint: "rgba(8,30,60,0.7)", particle: "rain",
    calm: "Harbour waves, distant gulls", tense: "Storm bells, rushing sailors",
    musicHint: "harbour storm fantasy orchestral", ambientHint: "rain ocean waves harbour",
  },
  {
    id: "village", name: "Farming Village", icon: "🌾",
    color: "#080f04", tint: "rgba(15,38,6,0.65)", particle: "dust",
    calm: "Wind through fields, crickets", tense: "Distant drums, hushed voices",
    musicHint: "peaceful medieval village music", ambientHint: "countryside wind birds crickets",
  },
  {
    id: "court", name: "Heartland Court", icon: "👑",
    color: "#120800", tint: "rgba(50,18,2,0.65)", particle: "ember",
    calm: "Stone halls, muted strings", tense: "Low brass, marching boots",
    musicHint: "royal court medieval orchestral", ambientHint: "stone hall fireplace crackling",
  },
  {
    id: "road", name: "Kingdom Road", icon: "🛤️",
    color: "#0a0a06", tint: "rgba(25,22,8,0.6)", particle: "dust",
    calm: "Forest wind, distant birds", tense: "Snapping branches, tense silence",
    musicHint: "adventure travel fantasy music", ambientHint: "forest wind birds nature ambient",
  },
  {
    id: "tavern", name: "Tavern", icon: "🍺",
    color: "#140c02", tint: "rgba(55,28,2,0.65)", particle: "ember",
    calm: "Lute and laughter, fire crackle", tense: "Hushed argument, scraping chairs",
    musicHint: "medieval tavern lute music", ambientHint: "tavern ambience fireplace crowd",
  },
  {
    id: "meeting", name: "War Council", icon: "⚔️",
    color: "#0e0204", tint: "rgba(45,4,8,0.65)", particle: "ash",
    calm: "Quiet tension, quill on parchment", tense: "Raised voices, fist on table",
    musicHint: "war council dramatic tense orchestral", ambientHint: "dark tension war room ambient",
  },
  {
    id: "orc", name: "Orc Kingdoms", icon: "🏔️",
    color: "#04060e", tint: "rgba(6,12,35,0.65)", particle: "snow",
    calm: "Mountain wind, deep chants", tense: "War drums, rumbling earth",
    musicHint: "orc tribal war drums fantasy", ambientHint: "mountain wind blizzard howling",
  },
  {
    id: "dark", name: "Unknown Dark", icon: "🌑",
    color: "#040404", tint: "rgba(4,4,4,0.82)", particle: "ash",
    calm: "Distant drips, deep silence", tense: "Low drones, heartbeat bass",
    musicHint: "dark dungeon horror ambient music", ambientHint: "cave drips darkness silence ambient",
  },
];

const SCENE_DATA_DEFAULT = Object.fromEntries(
  SCENES.map(s => [s.id, { musicUrl: "", ambientUrl: "", bgImage: null }])
);

function useLocalStorage(key, initial) {
  const [value, setValue] = useState(() => {
    try {
      const item = localStorage.getItem(key);
      return item !== null ? JSON.parse(item) : initial;
    } catch {
      return initial;
    }
  });

  const setAndPersist = useCallback((updater) => {
    setValue(prev => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      try { localStorage.setItem(key, JSON.stringify(next)); } catch {}
      return next;
    });
  }, [key]);

  return [value, setAndPersist];
}

async function compressImage(file) {
  return new Promise(resolve => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const maxW = 1280;
      const scale = Math.min(1, maxW / img.width);
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * scale);
      c.height = Math.round(img.height * scale);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL("image/jpeg", 0.65));
    };
    img.src = url;
  });
}

function getYouTubeId(input) {
  if (!input?.trim()) return null;
  try {
    const url = new URL(input);
    const v = url.searchParams.get("v") || url.pathname.split("/").pop();
    return v && v.length > 3 ? v : null;
  } catch {
    const id = input.trim();
    return id.length > 3 ? id : null;
  }
}

function getMood(scene, tension) {
  if (!scene) return "Choose a scene above to begin";
  if (tension < 35) return scene.calm;
  if (tension < 70) return "Tension building...";
  return scene.tense;
}

function getTensionLabel(t) {
  if (t < 20) return "Peaceful";
  if (t < 40) return "Uneasy";
  if (t < 60) return "Tense";
  if (t < 80) return "Danger";
  return "WAR";
}

function getTensionColor(t) {
  if (t < 40) return "#4a8c6a";
  if (t < 70) return "#c4742a";
  return "#8b2020";
}

function getDayLabel(d) {
  if (d < 20) return "Dead of Night";
  if (d < 40) return "Before Dawn";
  if (d < 60) return "Early Morning";
  if (d < 80) return "Midday";
  return "High Noon";
}

function getDayIcon(d) {
  if (d < 20) return "🌑";
  if (d < 40) return "🌒";
  if (d < 60) return "🌤️";
  if (d < 80) return "⛅";
  return "☀️";
}

// Shared across all useYouTubeAPI callers so both players get notified
const _ytCallbacks = new Set();
let _ytScriptLoaded = false;
let _ytApiReady = false;

function useYouTubeAPI() {
  const [ready, setReady] = useState(_ytApiReady);
  useEffect(() => {
    if (_ytApiReady) { setReady(true); return; }
    const cb = () => setReady(true);
    _ytCallbacks.add(cb);
    if (!_ytScriptLoaded) {
      _ytScriptLoaded = true;
      const tag = document.createElement("script");
      tag.src = "https://www.youtube.com/iframe_api";
      document.head.appendChild(tag);
      window.onYouTubeIframeAPIReady = () => {
        _ytApiReady = true;
        _ytCallbacks.forEach(fn => fn());
        _ytCallbacks.clear();
      };
    }
    return () => _ytCallbacks.delete(cb);
  }, []);
  return ready;
}

function useYTPlayer(containerId, videoId, volume, isPlaying) {
  const playerRef = useRef(null);
  const ytReady = useYouTubeAPI();
  const volRef = useRef(volume);
  const playRef = useRef(isPlaying);
  useEffect(() => { volRef.current = volume; }, [volume]);
  useEffect(() => { playRef.current = isPlaying; }, [isPlaying]);

  useEffect(() => {
    if (!ytReady) return;
    playerRef.current?.destroy();
    playerRef.current = null;
    if (!videoId) return;
    const wrapper = document.getElementById(containerId);
    if (!wrapper) return;
    // Always inject a fresh target div — the YT API replaces whatever element
    // it receives with an iframe, permanently losing the original element's ID.
    wrapper.innerHTML = "";
    const target = document.createElement("div");
    wrapper.appendChild(target);
    playerRef.current = new window.YT.Player(target, {
      videoId,
      height: "70",
      width: "100%",
      playerVars: { autoplay: 1, loop: 1, playlist: videoId, controls: 0, modestbranding: 1 },
      events: {
        onReady(e) {
          if (playRef.current) {
            // Mute first so browser autoplay policy allows the video to start,
            // then immediately unmute at the intended volume.
            e.target.mute();
            e.target.playVideo();
            setTimeout(() => {
              e.target.unMute();
              e.target.setVolume(volRef.current);
            }, 250);
          } else {
            e.target.setVolume(volRef.current);
          }
        },
      },
    });
    return () => {
      playerRef.current?.destroy();
      playerRef.current = null;
      if (wrapper) wrapper.innerHTML = "";
    };
  }, [ytReady, videoId, containerId]);

  useEffect(() => { try { playerRef.current?.setVolume(volume); } catch {} }, [volume]);
  useEffect(() => {
    try {
      if (isPlaying) playerRef.current?.playVideo();
      else playerRef.current?.pauseVideo();
    } catch {}
  }, [isPlaying]);
}

function ParticleLayer({ type, tension }) {
  const canvasRef = useRef(null);
  const animRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const resize = () => { canvas.width = window.innerWidth; canvas.height = window.innerHeight; };
    resize();
    window.addEventListener("resize", resize);

    const baseCount = { rain: 120, ember: 40, snow: 60, dust: 50 }[type] ?? 50;
    const tensionMult = 1 + Math.max(0, (tension - 60) / 40) * 0.7;
    const count = Math.floor(baseCount * tensionMult);
    const speed = 1 + (tension / 100) * 3;

    const particles = Array.from({ length: count }, () => ({
      x: Math.random() * window.innerWidth,
      y: Math.random() * window.innerHeight,
      size: Math.random() * 2.5 + 0.5,
      speedX: type === "rain" ? (Math.random() - 0.3) * 1.5 : (Math.random() - 0.5) * 0.8,
      speedY: type === "rain" ? speed * 6 + Math.random() * 4
        : type === "snow" ? speed * 0.6 + Math.random() * 0.4
        : type === "ember" ? -(speed * 0.8 + Math.random() * 1.2)
        : -(speed * 0.3 + Math.random() * 0.5),
      opacity: Math.random() * 0.5 + 0.1,
      phase: Math.random() * Math.PI * 2,
    }));

    function draw() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const time = Date.now() / 1000;
      const tensionShift = Math.max(0, (tension - 70) / 30);
      particles.forEach(p => {
        const wobble = (type === "ember" || type === "ash") ? Math.sin(time * 2 + p.phase) * 0.4 : 0;
        ctx.beginPath();
        if (type === "rain") {
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(p.x + p.speedX * 3, p.y + 12);
          ctx.strokeStyle = `rgba(160,200,255,${p.opacity * 0.6})`;
          ctx.lineWidth = 0.8;
          ctx.stroke();
        } else {
          ctx.arc(p.x + wobble, p.y, p.size, 0, Math.PI * 2);
          ctx.fillStyle = type === "ember"
            ? `rgba(255,${Math.floor((120 - tensionShift * 70) + p.opacity * 60)},${Math.floor(40 * (1 - tensionShift))},${p.opacity})`
            : type === "snow" ? `rgba(220,235,255,${p.opacity})`
            : `rgba(200,190,170,${p.opacity * 0.6})`;
          ctx.fill();
        }
        p.x += p.speedX + wobble * 0.05;
        p.y += p.speedY;
        if (p.y > canvas.height + 10) p.y = -10;
        if (p.y < -10) p.y = canvas.height + 10;
        if (p.x > canvas.width + 10) p.x = 0;
        if (p.x < -10) p.x = canvas.width;
      });
      animRef.current = requestAnimationFrame(draw);
    }
    draw();
    return () => { cancelAnimationFrame(animRef.current); window.removeEventListener("resize", resize); };
  }, [type, tension]);

  return (
    <canvas ref={canvasRef} style={{ position: "fixed", inset: 0, zIndex: 2, pointerEvents: "none", opacity: 0.75 }} />
  );
}

function InkBleed({ active, onDone }) {
  const canvasRef = useRef(null);
  const animRef = useRef(null);

  useEffect(() => {
    if (!active) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    let progress = 0;
    const cx = window.innerWidth / 2, cy = window.innerHeight / 2;
    const maxR = Math.sqrt(cx * cx + cy * cy) * 1.3;
    const blobs = Array.from({ length: 14 }, () => ({
      angle: Math.random() * Math.PI * 2,
      speed: 0.55 + Math.random() * 0.9,
      wobble: Math.random() * 0.35,
    }));
    function draw() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      progress += 0.02;
      if (progress < 1) {
        ctx.beginPath();
        blobs.forEach((b, i) => {
          const r = maxR * Math.min(progress * b.speed, 1);
          const wobbleR = r * (1 + b.wobble * Math.sin(progress * 9 + i));
          const x = cx + Math.cos(b.angle) * wobbleR;
          const y = cy + Math.sin(b.angle) * wobbleR;
          i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        });
        ctx.closePath();
        ctx.fillStyle = "#050303";
        ctx.fill();
        animRef.current = requestAnimationFrame(draw);
      } else {
        ctx.fillStyle = "#050303";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        setTimeout(() => onDone(), 120);
      }
    }
    draw();
    return () => cancelAnimationFrame(animRef.current);
  }, [active]);

  if (!active) return null;
  return <canvas ref={canvasRef} style={{ position: "fixed", inset: 0, zIndex: 100, pointerEvents: "none" }} />;
}

function YTContainer({ id }) {
  return (
    <div style={{ marginTop: 10, borderRadius: 6, overflow: "hidden", height: 70 }}>
      {/* Stable wrapper div — useYTPlayer injects a fresh inner div for each load */}
      <div id={id} style={{ width: "100%", height: "100%" }} />
    </div>
  );
}

function SectionLabel({ children, sub }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 10, marginBottom: 12,
    }}>
      <div style={{
        fontFamily: "Cinzel, serif", fontSize: 9, letterSpacing: "0.2em",
        color: "rgba(212,201,168,0.65)", textTransform: "uppercase",
      }}>
        {children}
      </div>
      {sub && (
        <div style={{ fontSize: 10, color: "rgba(212,201,168,0.5)", fontStyle: "italic" }}>
          {sub}
        </div>
      )}
      <div style={{ flex: 1, height: 1, background: "rgba(212,201,168,0.05)" }} />
    </div>
  );
}

export default function App() {
  const [tension, setTension] = useLocalStorage("andulaak_tension", 10);
  const [musicVol, setMusicVol] = useLocalStorage("andulaak_musicVol", 60);
  const [ambientVol, setAmbientVol] = useLocalStorage("andulaak_ambientVol", 70);
  const [dayNight, setDayNight] = useLocalStorage("andulaak_dayNight", 20);
  const [activeSceneId, setActiveSceneId] = useLocalStorage("andulaak_activeSceneId", null);
  const [sceneData, setSceneData] = useLocalStorage("andulaak_sceneData", SCENE_DATA_DEFAULT);

  const [isPlaying, setIsPlaying] = useState(false);
  const [inkActive, setInkActive] = useState(false);
  const [pendingSceneId, setPendingSceneId] = useState(null);
  const [presentationMode, setPresentationMode] = useState(false);
  const [musicInput, setMusicInput] = useState("");
  const [ambientInput, setAmbientInput] = useState("");

  const fileInputRef = useRef(null);
  const uploadSceneRef = useRef(null);
  const sceneDataRef = useRef(sceneData);
  sceneDataRef.current = sceneData;

  const activeScene = SCENES.find(s => s.id === activeSceneId) ?? null;
  const activeSData = activeScene ? (sceneData[activeScene.id] ?? { musicUrl: "", ambientUrl: "", bgImage: null }) : null;
  const musicId = activeSData ? getYouTubeId(activeSData.musicUrl) : null;
  const ambientId = activeSData ? getYouTubeId(activeSData.ambientUrl) : null;

  // Restore body bg on mount from persisted scene
  useEffect(() => {
    if (activeScene) document.body.style.background = activeScene.color;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Sync URL inputs when scene changes
  useEffect(() => {
    if (!activeSceneId) return;
    const sd = sceneDataRef.current[activeSceneId];
    setMusicInput(sd?.musicUrl || "");
    setAmbientInput(sd?.ambientUrl || "");
  }, [activeSceneId]);

  // Escape exits presentation
  useEffect(() => {
    const handler = (e) => { if (e.key === "Escape") setPresentationMode(false); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  useYTPlayer("music-player", musicId, musicVol, isPlaying);
  useYTPlayer("ambient-player", ambientId, ambientVol, isPlaying);

  const t = tension / 100;
  const tensionColor = getTensionColor(tension);

  // Night overlay: strong at 0, zero at 50+
  const nightOpacity = Math.max(0, (50 - dayNight) / 50) * 0.45;
  // Day overlay: zero until 50, warm at 100
  const dayOpacity = Math.max(0, (dayNight - 50) / 50) * 0.07;
  // Tension screen-edge glow
  const edgeGlowOpacity = tension > 65 ? 0.15 + (tension - 65) / 35 * 0.3 : 0;
  const edgeGlowSize = tension > 65 ? 60 + (tension - 65) / 35 * 80 : 0;
  // Heartbeat
  const heartbeatActive = tension >= 80;
  const heartbeatDuration = 2 - (tension - 80) / 20 * 0.8;
  // Vignette (reactive, no direct DOM needed)
  const vignetteStyle = activeScene
    ? `radial-gradient(ellipse at center, transparent 10%, ${activeScene.tint} 100%)`
    : "none";

  function handleSceneClick(scene) {
    if (scene.id === activeSceneId) return;
    setPendingSceneId(scene.id);
    setInkActive(true);
  }

  function handleInkDone() {
    const scene = SCENES.find(s => s.id === pendingSceneId);
    setActiveSceneId(pendingSceneId);
    setIsPlaying(true);
    setInkActive(false);
    setPendingSceneId(null);
    document.body.style.background = scene.color;
  }

  function updateSceneUrl(field, value) {
    if (!activeScene) return;
    setSceneData(prev => ({
      ...prev,
      [activeScene.id]: { ...prev[activeScene.id], [field]: value },
    }));
  }

  async function handleImageUpload(e) {
    const file = e.target.files[0];
    if (!file || !uploadSceneRef.current) return;
    const base64 = await compressImage(file);
    const sid = uploadSceneRef.current;
    setSceneData(prev => ({
      ...prev,
      [sid]: { ...prev[sid], bgImage: base64 },
    }));
    e.target.value = "";
  }

  function triggerUpload(sceneId) {
    uploadSceneRef.current = sceneId;
    fileInputRef.current.click();
  }

  function clearSceneImage(sceneId, ev) {
    ev.stopPropagation();
    setSceneData(prev => ({ ...prev, [sceneId]: { ...prev[sceneId], bgImage: null } }));
  }

  const bgImage = activeScene ? sceneData[activeScene.id]?.bgImage : null;

  return (
    <>
      {bgImage && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 0,
          backgroundImage: `url(${bgImage})`,
          backgroundSize: "cover", backgroundPosition: "center",
          opacity: 0.38, transition: "opacity 1.5s ease",
        }} />
      )}

      {/* Scene vignette */}
      <div style={{
        position: "fixed", inset: 0, pointerEvents: "none", zIndex: 1,
        background: vignetteStyle, transition: "background 1.8s ease",
      }} />

      {/* Night darkness overlay */}
      {nightOpacity > 0 && (
        <div style={{
          position: "fixed", inset: 0, pointerEvents: "none", zIndex: 1,
          background: `rgba(0,4,18,${nightOpacity})`, transition: "background 0.8s ease",
        }} />
      )}

      {/* Daylight warm overlay */}
      {dayOpacity > 0 && (
        <div style={{
          position: "fixed", inset: 0, pointerEvents: "none", zIndex: 1,
          background: `rgba(255,235,180,${dayOpacity})`, transition: "background 0.8s ease",
        }} />
      )}

      {/* Tension screen-edge glow */}
      {edgeGlowOpacity > 0 && (
        <div style={{
          position: "fixed", inset: 0, pointerEvents: "none", zIndex: 1,
          boxShadow: `inset 0 0 ${edgeGlowSize}px rgba(140,10,10,${edgeGlowOpacity})`,
        }} />
      )}

      {/* Tension UI red tint */}
      {tension > 65 && (
        <div style={{
          position: "fixed", inset: 0, pointerEvents: "none", zIndex: 1,
          background: `rgba(${Math.floor(t * 30)},0,0,${t * 0.09})`,
          transition: "background 0.5s ease",
        }} />
      )}

      {/* Heartbeat pulse at 80+ */}
      {heartbeatActive && (
        <div style={{
          position: "fixed", inset: 0, pointerEvents: "none", zIndex: 1,
          background: "rgba(110,0,0,0.13)",
          animation: `heartbeat ${heartbeatDuration.toFixed(2)}s ease-in-out infinite`,
        }} />
      )}

      {activeScene && <ParticleLayer type={activeScene.particle} tension={tension} />}
      <InkBleed active={inkActive} onDone={handleInkDone} />
      <input ref={fileInputRef} type="file" accept="image/*" onChange={handleImageUpload} style={{ display: "none" }} />

      {/* Main UI */}
      <div style={{
        position: "relative", zIndex: 3,
        maxWidth: 860, margin: "0 auto", padding: "2rem 1.5rem",
        opacity: presentationMode ? 0 : 1,
        pointerEvents: presentationMode ? "none" : "all",
        transition: "opacity 0.8s ease",
      }}>

        {/* Header */}
        <div style={{
          textAlign: "center", marginBottom: "2.5rem",
          paddingBottom: "1.5rem",
          borderBottom: "1px solid rgba(212,201,168,0.08)",
          position: "relative",
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 16, marginBottom: 6 }}>
            <div style={{ flex: 1, height: 1, background: "linear-gradient(to right, transparent, rgba(212,201,168,0.15))" }} />
            <div style={{ color: "rgba(212,201,168,0.25)", fontSize: 10 }}>✦</div>
            <div style={{ flex: 1, height: 1, background: "linear-gradient(to left, transparent, rgba(212,201,168,0.15))" }} />
          </div>
          <div style={{
            fontFamily: "Cinzel, serif", fontSize: 44, fontWeight: 700,
            letterSpacing: "0.3em", color: "#e8d9a0",
            textShadow: tension > 60
              ? `0 0 ${20 + t * 60}px rgba(220,80,40,${0.3 + t * 0.45}), 0 0 100px rgba(180,30,10,${t * 0.35})`
              : "0 0 50px rgba(232,217,160,0.2), 0 2px 4px rgba(0,0,0,0.5)",
            transition: "text-shadow 0.6s ease",
          }}>
            ANDULAAK
          </div>
          <div style={{ fontSize: 12, color: "rgba(212,201,168,0.6)", fontStyle: "italic", marginTop: 6, letterSpacing: "0.15em" }}>
            Atmosphere Board · DM Console
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 16, marginTop: 8 }}>
            <div style={{ flex: 1, height: 1, background: "linear-gradient(to right, transparent, rgba(212,201,168,0.08))" }} />
            <div style={{ color: "rgba(212,201,168,0.12)", fontSize: 8 }}>✦</div>
            <div style={{ flex: 1, height: 1, background: "linear-gradient(to left, transparent, rgba(212,201,168,0.08))" }} />
          </div>
          <div
            onClick={() => setPresentationMode(true)}
            style={{
              position: "absolute", right: 0, top: "50%", transform: "translateY(-50%)",
              fontFamily: "Cinzel, serif", fontSize: 9, letterSpacing: "0.15em",
              color: "rgba(212,201,168,0.55)", textTransform: "uppercase", cursor: "pointer",
              border: "1px solid rgba(212,201,168,0.1)", padding: "6px 14px", borderRadius: 6,
              transition: "all 0.2s ease",
            }}
          >
            Present
          </div>
        </div>

        {/* Scenes */}
        <SectionLabel>Scenes</SectionLabel>
        <div style={{
          display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: "2rem",
        }}>
          {SCENES.map(s => {
            const sd = sceneData[s.id] ?? {};
            const isActive = activeSceneId === s.id;
            return (
              <div key={s.id} style={{ position: "relative" }}>
                <div
                  onClick={() => handleSceneClick(s)}
                  style={{
                    background: isActive ? "rgba(232,217,160,0.08)" : "rgba(212,201,168,0.03)",
                    border: isActive
                      ? `1px solid rgba(232,217,160,${0.35 + t * 0.3})`
                      : "1px solid rgba(212,201,168,0.07)",
                    borderRadius: 8,
                    padding: "22px 10px 34px",
                    cursor: "pointer",
                    textAlign: "center",
                    transition: "all 0.3s ease",
                    position: "relative",
                    overflow: "hidden",
                    backgroundImage: sd.bgImage ? `url(${sd.bgImage})` : "none",
                    backgroundSize: "cover", backgroundPosition: "center",
                    boxShadow: isActive && tension > 70
                      ? `0 0 ${12 + t * 18}px rgba(180,40,40,0.35), inset 0 0 20px rgba(0,0,0,0.3)`
                      : isActive
                      ? "0 0 20px rgba(232,217,160,0.08), inset 0 0 20px rgba(0,0,0,0.2)"
                      : "none",
                  }}
                >
                  {sd.bgImage && (
                    <div style={{
                      position: "absolute", inset: 0,
                      background: isActive ? "rgba(0,0,0,0.42)" : "rgba(0,0,0,0.58)",
                      borderRadius: 8, transition: "background 0.3s",
                    }} />
                  )}
                  <div style={{ position: "relative", zIndex: 1 }}>
                    <div style={{ fontSize: 26, marginBottom: 8, filter: isActive ? "none" : "grayscale(0.3)" }}>
                      {s.icon}
                    </div>
                    <div style={{
                      fontFamily: "Cinzel, serif", fontSize: 8, letterSpacing: "0.1em",
                      color: isActive ? "#e8d9a0" : "rgba(212,201,168,0.72)",
                      textTransform: "uppercase", lineHeight: 1.5,
                    }}>
                      {s.name}
                    </div>
                    {isActive && isPlaying && (
                      <div style={{
                        width: 6, height: 6, borderRadius: "50%",
                        background: tensionColor,
                        boxShadow: `0 0 8px ${tensionColor}`,
                        margin: "8px auto 0",
                        animation: "pulse 2s ease-in-out infinite",
                      }} />
                    )}
                  </div>
                </div>
                {/* Image controls */}
                <div style={{
                  position: "absolute", bottom: 7, left: 0, right: 0,
                  display: "flex", justifyContent: "center", alignItems: "center", gap: 6, zIndex: 2,
                }}>
                  <span
                    onClick={() => triggerUpload(s.id)}
                    style={{ fontSize: 8, color: "rgba(212,201,168,0.55)", cursor: "pointer", fontFamily: "Cinzel, serif", letterSpacing: "0.05em" }}
                  >
                    {sd.bgImage ? "change" : "+ img"}
                  </span>
                  {sd.bgImage && <>
                    <span style={{ fontSize: 8, color: "rgba(212,201,168,0.12)" }}>·</span>
                    <span
                      onClick={(ev) => clearSceneImage(s.id, ev)}
                      style={{ fontSize: 8, color: "rgba(212,201,168,0.5)", cursor: "pointer", fontFamily: "Cinzel, serif" }}
                    >
                      clear
                    </span>
                  </>}
                </div>
              </div>
            );
          })}
        </div>

        {/* Controls row: Tension | Day/Night | Audio Mix */}
        <div style={{ display: "grid", gridTemplateColumns: "1.3fr 1fr 1fr", gap: 14, marginBottom: "1.5rem" }}>

          {/* Tension */}
          <div style={{
            background: "rgba(212,201,168,0.03)",
            border: `1px solid ${tension > 65 ? `rgba(180,40,40,${0.3 + t * 0.3})` : "rgba(212,201,168,0.08)"}`,
            borderRadius: 10, padding: "16px 18px",
            transition: "border-color 0.5s ease",
            boxShadow: tension > 75
              ? `0 0 ${10 + t * 22}px rgba(160,20,20,${0.1 + t * 0.25})`
              : "none",
          }}>
            <div style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              fontFamily: "Cinzel, serif", fontSize: 9, letterSpacing: "0.15em",
              color: "rgba(212,201,168,0.62)", textTransform: "uppercase", marginBottom: 14,
            }}>
              Tension
              <span style={{
                fontFamily: "Cinzel, serif", fontSize: 11, letterSpacing: "0.12em",
                color: tensionColor, transition: "color 0.5s ease",
                fontWeight: tension >= 80 ? 700 : 400,
                animation: tension >= 80 ? "pulse 1s ease-in-out infinite" : "none",
              }}>
                {getTensionLabel(tension)}
              </span>
            </div>
            <div style={{ height: 4, background: "rgba(212,201,168,0.06)", borderRadius: 2, marginBottom: 8, overflow: "hidden" }}>
              <div style={{
                height: "100%", borderRadius: 2,
                background: "linear-gradient(to right, #2d6b50, #4a8c6a, #c4742a, #8b2020, #5c0808)",
                width: `${tension}%`, transition: "width 0.1s ease",
              }} />
            </div>
            <input
              type="range" min="0" max="100" value={tension}
              onChange={e => setTension(Number(e.target.value))}
              style={{ width: "100%", marginBottom: 8 }}
            />
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: "rgba(212,201,168,0.5)", fontStyle: "italic" }}>
              <span>Peaceful</span><span>Tense</span><span>War</span>
            </div>
          </div>

          {/* Day / Night */}
          <div style={{
            background: "rgba(212,201,168,0.03)",
            border: "1px solid rgba(212,201,168,0.08)",
            borderRadius: 10, padding: "16px 18px",
          }}>
            <div style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              fontFamily: "Cinzel, serif", fontSize: 9, letterSpacing: "0.15em",
              color: "rgba(212,201,168,0.62)", textTransform: "uppercase", marginBottom: 14,
            }}>
              Time of Day
              <span style={{ fontSize: 16 }}>{getDayIcon(dayNight)}</span>
            </div>
            <div style={{ height: 4, background: "rgba(212,201,168,0.06)", borderRadius: 2, marginBottom: 8, overflow: "hidden" }}>
              <div style={{
                height: "100%", borderRadius: 2,
                background: "linear-gradient(to right, #0a0a1a, #2a1a4a, #6a3820, #d4843a, #f0c060)",
                width: `${dayNight}%`, transition: "width 0.1s ease",
              }} />
            </div>
            <input
              type="range" min="0" max="100" value={dayNight}
              onChange={e => setDayNight(Number(e.target.value))}
              style={{ width: "100%", marginBottom: 8 }}
            />
            <div style={{ fontSize: 10, color: "rgba(212,201,168,0.62)", fontStyle: "italic", textAlign: "center" }}>
              {getDayLabel(dayNight)}
            </div>
          </div>

          {/* Audio Mix */}
          <div style={{
            background: "rgba(212,201,168,0.03)",
            border: "1px solid rgba(212,201,168,0.08)",
            borderRadius: 10, padding: "16px 18px",
          }}>
            <div style={{
              fontFamily: "Cinzel, serif", fontSize: 9, letterSpacing: "0.15em",
              color: "rgba(212,201,168,0.62)", textTransform: "uppercase", marginBottom: 14,
            }}>
              Audio Mix
            </div>
            {[
              { label: "Music", vol: musicVol, set: setMusicVol },
              { label: "Ambient", vol: ambientVol, set: setAmbientVol },
            ].map(({ label, vol, set }) => (
              <div key={label} style={{ marginBottom: label === "Music" ? 14 : 0 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "rgba(212,201,168,0.68)", marginBottom: 5 }}>
                  <span>{label}</span><span style={{ fontSize: 9 }}>{vol}%</span>
                </div>
                <input
                  type="range" min="0" max="100" value={vol}
                  onChange={e => set(Number(e.target.value))}
                  style={{ width: "100%" }}
                />
              </div>
            ))}
          </div>
        </div>

        {/* Now Playing */}
        <div style={{
          background: "rgba(232,217,160,0.025)",
          border: `1px solid ${tension > 65 ? `rgba(180,40,40,${0.25 + t * 0.3})` : "rgba(232,217,160,0.1)"}`,
          borderRadius: 10, padding: "16px 22px",
          display: "flex", alignItems: "center", gap: 18,
          marginBottom: "1.5rem",
          boxShadow: tension > 75 ? `0 0 ${10 + t * 20}px rgba(160,20,20,${0.1 + t * 0.2})` : "none",
          transition: "all 0.5s ease",
        }}>
          <div style={{
            width: 10, height: 10, borderRadius: "50%", flexShrink: 0,
            background: isPlaying && activeScene ? tensionColor : "rgba(212,201,168,0.18)",
            boxShadow: isPlaying && activeScene ? `0 0 14px ${tensionColor}` : "none",
            animation: isPlaying && activeScene ? "pulse 2s ease-in-out infinite" : "none",
            transition: "all 0.5s ease",
          }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: "Cinzel, serif", fontSize: 14, color: "#e8d9a0", letterSpacing: "0.08em" }}>
              {activeScene ? activeScene.name : "No scene selected"}
            </div>
            <div style={{ fontSize: 13, color: "rgba(212,201,168,0.65)", fontStyle: "italic", marginTop: 3 }}>
              {isPlaying ? getMood(activeScene, tension) : activeScene ? "Paused" : "Choose a scene above to begin"}
            </div>
          </div>
          <div style={{ textAlign: "right", flexShrink: 0 }}>
            <div style={{ fontSize: 9, fontFamily: "Cinzel, serif", letterSpacing: "0.08em", color: "rgba(212,201,168,0.55)", marginBottom: 3 }}>
              {getDayLabel(dayNight)}
            </div>
            <div style={{
              fontSize: 10, fontFamily: "Cinzel, serif", letterSpacing: "0.1em",
              color: tensionColor, textTransform: "uppercase",
              transition: "color 0.5s ease",
            }}>
              {getTensionLabel(tension)}
            </div>
          </div>
          <div
            onClick={() => activeScene && setIsPlaying(p => !p)}
            style={{
              background: "rgba(232,217,160,0.06)", border: "1px solid rgba(232,217,160,0.15)",
              borderRadius: "50%", width: 44, height: 44, flexShrink: 0,
              display: "flex", alignItems: "center", justifyContent: "center",
              cursor: activeScene ? "pointer" : "default",
              color: activeScene ? "#e8d9a0" : "rgba(212,201,168,0.18)", fontSize: 16,
              transition: "all 0.2s ease",
            }}
          >
            {isPlaying ? "⏸" : "▶"}
          </div>
        </div>

        {/* YouTube Audio Panels */}
        <SectionLabel sub={activeScene ? `· ${activeScene.name}` : ""}>Audio Tracks</SectionLabel>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: "1.5rem" }}>
          {[
            {
              label: "Music Track",
              input: musicInput, setInput: setMusicInput,
              onLoad: () => { updateSceneUrl("musicUrl", musicInput); setIsPlaying(true); },
              onClear: () => { updateSceneUrl("musicUrl", ""); setMusicInput(""); },
              hasId: !!musicId, containerId: "music-player",
              hint: activeScene?.musicHint ?? "fantasy epic music 1 hour",
            },
            {
              label: "Ambient Sound",
              input: ambientInput, setInput: setAmbientInput,
              onLoad: () => { updateSceneUrl("ambientUrl", ambientInput); setIsPlaying(true); },
              onClear: () => { updateSceneUrl("ambientUrl", ""); setAmbientInput(""); },
              hasId: !!ambientId, containerId: "ambient-player",
              hint: activeScene?.ambientHint ?? "ambient sound 1 hour",
            },
          ].map((panel, i) => (
            <div key={i} style={{
              background: "rgba(212,201,168,0.02)", border: "1px solid rgba(212,201,168,0.07)",
              borderRadius: 10, padding: "14px 16px",
            }}>
              <div style={{
                fontFamily: "Cinzel, serif", fontSize: 9, letterSpacing: "0.2em",
                color: "rgba(212,201,168,0.62)", textTransform: "uppercase", marginBottom: 10,
                display: "flex", justifyContent: "space-between", alignItems: "center",
              }}>
                {panel.label}
                {panel.hasId && (
                  <span
                    onClick={panel.onClear}
                    style={{ fontSize: 8, color: "rgba(212,201,168,0.52)", cursor: "pointer", letterSpacing: 0, textTransform: "none" }}
                  >
                    clear
                  </span>
                )}
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <input
                  value={panel.input}
                  onChange={e => panel.setInput(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && panel.onLoad()}
                  placeholder="YouTube URL or video ID..."
                  style={{
                    flex: 1, background: "rgba(212,201,168,0.05)",
                    border: "1px solid rgba(212,201,168,0.1)", borderRadius: 6,
                    padding: "7px 10px", color: "#d4c9a8", fontSize: 12, outline: "none",
                  }}
                />
                <div
                  onClick={panel.onLoad}
                  style={{
                    background: "rgba(232,217,160,0.07)", border: "1px solid rgba(232,217,160,0.18)",
                    borderRadius: 6, padding: "7px 14px", color: "#e8d9a0",
                    fontFamily: "Cinzel, serif", fontSize: 9, letterSpacing: "0.1em",
                    cursor: "pointer", whiteSpace: "nowrap",
                  }}
                >
                  Load
                </div>
              </div>
              <div style={{ fontSize: 10, color: "rgba(212,201,168,0.45)", fontStyle: "italic", marginTop: 6 }}>
                Search YouTube: {panel.hint}
              </div>
              <div style={{ display: panel.hasId ? "block" : "none" }}>
                <YTContainer id={panel.containerId} />
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div style={{
          textAlign: "center", fontSize: 11, color: "rgba(212,201,168,0.38)",
          fontStyle: "italic", paddingTop: "1rem",
          borderTop: "1px solid rgba(212,201,168,0.05)",
        }}>
          Andulaak Atmosphere Board · The calm is here. It won't last.
        </div>
      </div>

      {/* Exit presentation */}
      {presentationMode && (
        <div
          onClick={() => setPresentationMode(false)}
          style={{
            position: "fixed", bottom: 24, right: 24, zIndex: 200,
            fontFamily: "Cinzel, serif", fontSize: 9, letterSpacing: "0.15em",
            color: "rgba(212,201,168,0.52)", textTransform: "uppercase",
            cursor: "pointer", border: "1px solid rgba(212,201,168,0.08)",
            padding: "8px 16px", borderRadius: 6, background: "rgba(0,0,0,0.5)",
          }}
        >
          Exit Present
        </div>
      )}

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@400;600;700&family=Crimson+Pro:ital,wght@0,300;0,400;1,300&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #0a0806; color: #d4c9a8; font-family: 'Crimson Pro', Georgia, serif; min-height: 100vh; transition: background 1.8s ease; }
        input[type=range] { -webkit-appearance: none; height: 3px; background: transparent; cursor: pointer; width: 100%; }
        input[type=range]::-webkit-slider-runnable-track { height: 3px; background: rgba(212,201,168,0.08); border-radius: 2px; }
        input[type=range]::-webkit-slider-thumb { -webkit-appearance: none; width: 15px; height: 15px; border-radius: 50%; background: #e8d9a0; border: 2px solid #0a0806; box-shadow: 0 0 8px rgba(232,217,160,0.45); margin-top: -6px; }
        input::placeholder { color: rgba(212,201,168,0.35); }
        @keyframes pulse { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.35; transform: scale(0.75); } }
        @keyframes heartbeat { 0%, 100% { opacity: 0; } 10%, 30% { opacity: 1; } 45%, 100% { opacity: 0; } }
      `}</style>
    </>
  );
}
