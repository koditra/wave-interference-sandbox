// SECTION: Simulation parameters
const canvas = document.getElementById("waveCanvas");
const ctx = canvas.getContext("2d", { willReadFrequently: true });

// UI elements
const wavelengthSlider = document.getElementById("wavelength");
const wavelengthValue = document.getElementById("wavelengthValue");
const frequencySlider = document.getElementById("frequency");
const frequencyValue = document.getElementById("frequencyValue");
const pauseBtn = document.getElementById("pauseBtn");
const resetBtn = document.getElementById("resetBtn");
const showGridCheckbox = document.getElementById("showGrid");

// Logical resolution for the field sampling (to keep it fast)
const FIELD_WIDTH = 180;
const FIELD_HEIGHT = 120;

// Derived scaling between field space and canvas pixels
let scaleX = canvas.width / FIELD_WIDTH;
let scaleY = canvas.height / FIELD_HEIGHT;

// Wave parameters (will be updated from sliders)
let wavelength = parseFloat(wavelengthSlider.value); // in canvas pixels
let k = (2 * Math.PI) / wavelength; // wave number
let omega = parseFloat(frequencySlider.value); // angular frequency
const amplitude = 1.0;

// Time
let time = 0;
let lastTimestamp = 0;
let isPaused = false;

// Wave sources in canvas coordinates
const sources = [
  { x: canvas.width * 0.35, y: canvas.height * 0.5 },
  { x: canvas.width * 0.65, y: canvas.height * 0.5 },
];
let selectedSourceIndex = 0;

// Observer (detector) in canvas coordinates
const observer = {
  x: canvas.width * 0.5,
  y: canvas.height * 0.25,
};

// Drag handling
let draggingIndex = null; // 0 or 1 for sources, "observer" for detector
let dragOffsetX = 0;
let dragOffsetY = 0;

// SECTION: Helpers
function updateScale() {
  scaleX = canvas.width / FIELD_WIDTH;
  scaleY = canvas.height / FIELD_HEIGHT;
}

function canvasToField(x, y) {
  return { fx: x / scaleX, fy: y / scaleY };
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

// SECTION: Wave computation
function computeAmplitudeAt(x, y, t) {
  // x, y are in field coordinates (0..FIELD_WIDTH, 0..FIELD_HEIGHT)
  const cx = x * scaleX;
  const cy = y * scaleY;

  let total = 0;

  for (let i = 0; i < sources.length; i++) {
    const sx = sources[i].x;
    const sy = sources[i].y;
    const dx = cx - sx;
    const dy = cy - sy;
    const r = Math.hypot(dx, dy) + 0.0001; // avoid exact zero

    const phase = k * r - omega * t;
    total += amplitude * Math.sin(phase);
  }

  return total;
}

// Map amplitude to RGB color
function mapAmplitudeToColor(a) {
  // Soft clamp
  const maxAmp = 2; // with two sources, amplitude stays roughly within [-2, 2]
  const n = clamp(a / maxAmp, -1, 1);

  // Symmetric palette: blue for negative, dark for zero, orange for positive
  let r, g, b;

  if (n >= 0) {
    // From dark -> orange/white
    const t = n;
    r = 255 * t + 12 * (1 - t);
    g = 95 * t + 14 * (1 - t);
    b = 108 * t + 30 * (1 - t);
  } else {
    // From dark -> cyan/blue
    const t = -n;
    r = 18 * (1 - t) + 60 * t;
    g = 24 * (1 - t) + 190 * t;
    b = 60 * (1 - t) + 255 * t;
  }

  return { r: Math.round(r), g: Math.round(g), b: Math.round(b) };
}

// SECTION: Rendering
function renderObserver() {
  // Compute instantaneous amplitude at observer position
  const fieldPos = canvasToField(observer.x, observer.y);
  const a = computeAmplitudeAt(fieldPos.fx, fieldPos.fy, time);

  // Map amplitude to color for the ring
  const { r, g, b } = mapAmplitudeToColor(a);
  const color = `rgb(${r}, ${g}, ${b})`;

  ctx.save();

  // Outer halo
  const halo = ctx.createRadialGradient(
    observer.x,
    observer.y,
    0,
    observer.x,
    observer.y,
    22
  );
  halo.addColorStop(0, "rgba(255,255,255,0.4)");
  halo.addColorStop(0.5, color.replace("rgb", "rgba").replace(")", ",0.85)"));
  halo.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(observer.x, observer.y, 22, 0, Math.PI * 2);
  ctx.fill();

  // Core circle
  ctx.beginPath();
  ctx.fillStyle = "#0b1022";
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.arc(observer.x, observer.y, 8, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Label and numeric readout
  ctx.font = "10px 'Space Grotesk', system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillStyle = "rgba(255,255,255,0.9)";
  ctx.fillText("Detector", observer.x, observer.y - 16);

  ctx.font = "9px 'Space Grotesk', system-ui, sans-serif";
  ctx.fillStyle = "rgba(200,210,255,0.9)";
  ctx.fillText(`S ≈ ${a.toFixed(2)}`, observer.x, observer.y + 18);

  ctx.restore();
}

function drawGrid() {
  const step = 40;
  ctx.save();
  ctx.strokeStyle = "rgba(255,255,255,0.04)";
  ctx.lineWidth = 1;
  for (let x = step; x < canvas.width; x += step) {
    ctx.beginPath();
    ctx.moveTo(x + 0.5, 0);
    ctx.lineTo(x + 0.5, canvas.height);
    ctx.stroke();
  }
  for (let y = step; y < canvas.height; y += step) {
    ctx.beginPath();
    ctx.moveTo(0, y + 0.5);
    ctx.lineTo(canvas.width, y + 0.5);
    ctx.stroke();
  }
  ctx.restore();
}

function renderField(t) {
  const imageData = ctx.createImageData(FIELD_WIDTH, FIELD_HEIGHT);
  const data = imageData.data;

  let index = 0;
  for (let fy = 0; fy < FIELD_HEIGHT; fy++) {
    for (let fx = 0; fx < FIELD_WIDTH; fx++) {
      const a = computeAmplitudeAt(fx + 0.5, fy + 0.5, t);
      const { r, g, b } = mapAmplitudeToColor(a);

      data[index] = r; // R
      data[index + 1] = g; // G
      data[index + 2] = b; // B
      data[index + 3] = 255; // A

      index += 4;
    }
  }

  // Draw scaled to canvas
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.putImageData(imageData, 0, 0);
  ctx.scale(scaleX, scaleY);
  ctx.drawImage(canvas, 0, 0, FIELD_WIDTH, FIELD_HEIGHT, 0, 0, FIELD_WIDTH, FIELD_HEIGHT);
  ctx.restore();
}

function renderSources() {
  ctx.save();
  for (let i = 0; i < sources.length; i++) {
    const s = sources[i];
    const isSelected = i === selectedSourceIndex;

    // Outer glow
    const gradient = ctx.createRadialGradient(
      s.x,
      s.y,
      0,
      s.x,
      s.y,
      26
    );
    gradient.addColorStop(0, "rgba(255, 200, 180, 0.8)");
    gradient.addColorStop(0.5, "rgba(255, 95, 108, 0.7)");
    gradient.addColorStop(1, "rgba(255, 95, 108, 0)");
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(s.x, s.y, 26, 0, Math.PI * 2);
    ctx.fill();

    // Core
    ctx.beginPath();
    ctx.fillStyle = isSelected
      ? "#fffdfa"
      : "#ffe1d4";
    ctx.strokeStyle = isSelected ? "#ffb347" : "#ff5f6c";
    ctx.lineWidth = isSelected ? 2.4 : 1.6;
    ctx.arc(s.x, s.y, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Label
    ctx.font = "10px 'Space Grotesk', system-ui, sans-serif";
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.textAlign = "center";
    ctx.fillText(`S${i + 1}`, s.x, s.y - 14);
  }
  ctx.restore();
}

function drawFrame(timestamp) {
  if (!lastTimestamp) lastTimestamp = timestamp;
  const deltaMs = timestamp - lastTimestamp;
  lastTimestamp = timestamp;

  if (!isPaused) {
    time += deltaMs / 1000; // seconds
  }

  // Clear
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Draw field & grid
  renderField(time);
  if (showGridCheckbox.checked) {
    drawGrid();
  }

  // Draw the two sources on top
  renderSources();

  // Draw observer on top of everything
  renderObserver();

  requestAnimationFrame(drawFrame);
}

// SECTION: Interaction
function findSourceAtPoint(x, y) {
  for (let i = sources.length - 1; i >= 0; i--) {
    const s = sources[i];
    const dx = x - s.x;
    const dy = y - s.y;
    if (Math.hypot(dx, dy) <= 16) {
      return i;
    }
  }
  return null;
}

canvas.addEventListener("mousedown", (e) => {
  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;

  // First check if we clicked the observer
  const dxObs = x - observer.x;
  const dyObs = y - observer.y;
  if (Math.hypot(dxObs, dyObs) <= 12) {
    draggingIndex = "observer";
    dragOffsetX = x - observer.x;
    dragOffsetY = y - observer.y;
    return;
  }

  // Otherwise, check sources
  const hit = findSourceAtPoint(x, y);
  if (hit !== null) {
    draggingIndex = hit;
    selectedSourceIndex = hit;
    dragOffsetX = x - sources[hit].x;
    dragOffsetY = y - sources[hit].y;
  }
});

canvas.addEventListener("mousemove", (e) => {
  if (draggingIndex === null) return;
  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;

  if (draggingIndex === "observer") {
    observer.x = clamp(x - dragOffsetX, 10, canvas.width - 10);
    observer.y = clamp(y - dragOffsetY, 10, canvas.height - 10);
  } else {
    const s = sources[draggingIndex];
    s.x = clamp(x - dragOffsetX, 10, canvas.width - 10);
    s.y = clamp(y - dragOffsetY, 10, canvas.height - 10);
  }
});

window.addEventListener("mouseup", () => {
  draggingIndex = null;
});

// Keyboard control: 1/2 to select source, arrows to move
window.addEventListener("keydown", (e) => {
  const key = e.key;
  if (key === "1") {
    selectedSourceIndex = 0;
  } else if (key === "2") {
    selectedSourceIndex = 1;
  }

  const speed = 8;
  const s = sources[selectedSourceIndex];
  if (!s) return;

  let moved = false;
  if (key === "ArrowLeft") {
    s.x = clamp(s.x - speed, 10, canvas.width - 10);
    moved = true;
  } else if (key === "ArrowRight") {
    s.x = clamp(s.x + speed, 10, canvas.width - 10);
    moved = true;
  } else if (key === "ArrowUp") {
    s.y = clamp(s.y - speed, 10, canvas.height - 10);
    moved = true;
  } else if (key === "ArrowDown") {
    s.y = clamp(s.y + speed, 10, canvas.height - 10);
    moved = true;
  }

  if (moved) {
    e.preventDefault();
  }
});

// UI controls
wavelengthSlider.addEventListener("input", () => {
  wavelength = parseFloat(wavelengthSlider.value);
  k = (2 * Math.PI) / wavelength;
  wavelengthValue.textContent = `λ ≈ ${wavelengthSlider.value} px`;
});

frequencySlider.addEventListener("input", () => {
  omega = parseFloat(frequencySlider.value);
  frequencyValue.textContent = `ω ≈ ${omega.toFixed(1)}`;
});

pauseBtn.addEventListener("click", () => {
  isPaused = !isPaused;
  pauseBtn.textContent = isPaused ? "Play" : "Pause";
});

resetBtn.addEventListener("click", () => {
  sources[0].x = canvas.width * 0.35;
  sources[0].y = canvas.height * 0.5;
  sources[1].x = canvas.width * 0.65;
  sources[1].y = canvas.height * 0.5;
});

// Handle resize to keep canvas crisp on devicePixelRatio screens
function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(rect.width * dpr);
  canvas.height = Math.round(rect.height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  updateScale();
}

window.addEventListener("resize", () => {
  resizeCanvas();
});

// Initial setup
resizeCanvas();

// Initialize control texts
wavelengthValue.textContent = `λ ≈ ${wavelengthSlider.value} px`;
frequencyValue.textContent = `ω ≈ ${omega.toFixed(1)}`;

// Start animation
requestAnimationFrame(drawFrame);
