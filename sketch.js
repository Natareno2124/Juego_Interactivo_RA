// ─── CONFIG ──────────────────────────────────────────────────────────────────
let video;
let handpose;
let predictions = [];
let modelReady = false;

// Colores del juego
const COLORS = [
  { name: "rojo",     c: [255,  60,  60] },
  { name: "verde",    c: [ 60, 220,  80] },
  { name: "azul",     c: [ 60, 140, 255] },
  { name: "amarillo", c: [255, 220,   0] },
];

const SHAPES = ["star", "heart", "diamond", "moon"];

// Zonas destino
let zones = [];

// Figura arrastrable
let draggable = null;
let grabbed = false;
let grabCooldown = 0;
let pendingNewRound = false;
let pendingTimer = 0;

// Posición suavizada del dedo (lerp para evitar saltos)
let fingerX = 0;
let fingerY = 0;
let rawFingerX = 0;
let rawFingerY = 0;
const LERP_AMT = 0.35;

// Score y mensajes
let score = 0;
let message = "";
let messageTimer = 0;
let msgR = 255, msgG = 255, msgB = 255;

// Partículas
let particles = [];

// Índices de ronda actual
let targetColorIdx = 0;
let targetShapeIdx = 0;

// Buffer offscreen para la figura (se redibuja solo al cambiar de ronda)
let shapeGraphics;

// ─── SETUP ───────────────────────────────────────────────────────────────────
function setup() {
  createCanvas(640, 480);
  frameRate(30); // 30fps reduce carga a la mitad sin afectar la experiencia

  // Zonas destino en la parte inferior
  let spacing = width / (COLORS.length + 1);
  for (let i = 0; i < COLORS.length; i++) {
    zones.push({ x: spacing * (i + 1), y: height - 58, r: 42, colorIdx: i });
  }

  shapeGraphics = createGraphics(90, 90);
  newRound();

  // Webcam
  video = createCapture(VIDEO);
  video.size(640, 480);
  video.hide();

  video.elt.onloadeddata = () => {
    handpose = ml5.handpose(video, { flipHorizontal: false }, () => {
      modelReady = true;
    });
    handpose.on("predict", results => {
      predictions = results;
    });
  };
}

// ─── NUEVA RONDA ─────────────────────────────────────────────────────────────
function newRound() {
  targetColorIdx = floor(random(COLORS.length));
  targetShapeIdx = floor(random(SHAPES.length));

  draggable = {
    x: random(110, width - 110),
    y: random(100, height / 2 - 30),
    size: 60,
    colorIdx: targetColorIdx,
    shape: SHAPES[targetShapeIdx],
    scl: 0,
  };

  grabbed = false;
  pendingNewRound = false;
  redrawShapeBuffer();
}

// Dibuja la figura en buffer offscreen — solo cuando cambia de ronda
function redrawShapeBuffer() {
  let g = shapeGraphics;
  g.clear();
  g.push();
  g.translate(45, 45);
  g.noStroke();

  let col = COLORS[targetColorIdx].c;
  g.fill(col[0], col[1], col[2]);

  let s = 56;
  switch (draggable.shape) {
    case "star":    drawStarOn(g, 0, 0, s * 0.42, s * 0.2, 5); break;
    case "heart":   drawHeartOn(g, 0, 0, s);                     break;
    case "diamond": drawDiamondOn(g, 0, 0, s);                   break;
    case "moon":    drawMoonOn(g, 0, 0, s);                      break;
  }
  g.pop();
}

// ─── DRAW ────────────────────────────────────────────────────────────────────
function draw() {
  background(12, 12, 20);

  // Cámara espejo
  push();
  translate(width, 0);
  scale(-1, 1);
  tint(255, 170);
  image(video, 0, 0, width, height);
  noTint();
  pop();

  // Overlay oscuro para contraste
  fill(12, 12, 20, 90);
  noStroke();
  rect(0, 0, width, height);

  // Zonas destino
  drawZones();

  // Partículas
  updateParticles();

  // Timer de nueva ronda (reemplaza setTimeout)
  if (pendingNewRound) {
    pendingTimer--;
    if (pendingTimer <= 0) newRound();
  }

  // Figura
  if (draggable) {
    if (draggable.scl < 1) draggable.scl = min(1, draggable.scl + 0.08);
    if (grabbed) {
      draggable.x = fingerX;
      draggable.y = fingerY;
    }
    drawDraggable();
  }

  // Lerp del dedo
  fingerX = lerp(fingerX, rawFingerX, LERP_AMT);
  fingerY = lerp(fingerY, rawFingerY, LERP_AMT);

  // Mano
  if (modelReady && predictions.length > 0) {
    let tip = predictions[0].landmarks[8];
    rawFingerX = width - tip[0];
    rawFingerY = tip[1];

    handleGrab();
    drawFingerCursor();
  }

  // HUD siempre encima
  drawHUD();

  // Mensaje feedback
  if (messageTimer > 0) {
    let alpha = messageTimer > 10 ? 255 : map(messageTimer, 0, 10, 0, 255);
    fill(msgR, msgG, msgB, alpha);
    noStroke();
    textSize(34);
    textAlign(CENTER, CENTER);
    text(message, width / 2, height / 2 - 20);
    messageTimer--;
  }

  if (grabCooldown > 0) grabCooldown--;
}

// ─── AGARRE ──────────────────────────────────────────────────────────────────
function handleGrab() {
  if (!draggable || pendingNewRound) return;

  let d = dist(fingerX, fingerY, draggable.x, draggable.y);

  if (d < draggable.size * 0.65 && !grabbed) {
    grabbed = true;
  }

  if (grabbed && grabCooldown <= 0) {
    for (let z of zones) {
      let dz = dist(draggable.x, draggable.y, z.x, z.y);
      if (dz < z.r + 12) {
        if (z.colorIdx === draggable.colorIdx) {
          score++;
          spawnParticles(z.x, z.y, COLORS[draggable.colorIdx].c);
          message = "¡Perfecto!";
          let col = COLORS[draggable.colorIdx].c;
          msgR = col[0]; msgG = col[1]; msgB = col[2];
          messageTimer = 60;
          draggable = null;
          grabbed = false;
          pendingNewRound = true;
          pendingTimer = 18;
        } else {
          message = "Color incorrecto";
          msgR = 255; msgG = 80; msgB = 80;
          messageTimer = 45;
          grabbed = false;
          draggable.x = random(110, width - 110);
          draggable.y = random(90, 180);
        }
        grabCooldown = 35;
        break;
      }
    }
  }
}

// ─── ZONAS ───────────────────────────────────────────────────────────────────
function drawZones() {
  for (let z of zones) {
    let col = COLORS[z.colorIdx].c;
    let isTarget = (z.colorIdx === targetColorIdx) && !pendingNewRound;
    let pulse = isTarget ? (sin(frameCount * 0.12) * 0.3 + 0.7) : 0.45;
    let alpha = isTarget ? 255 * pulse : 140;

    fill(col[0], col[1], col[2], isTarget ? 55 : 20);
    stroke(col[0], col[1], col[2], alpha);
    strokeWeight(isTarget ? 3 : 1.5);
    circle(z.x, z.y, z.r * 2);

    if (isTarget) {
      noFill();
      stroke(col[0], col[1], col[2], 80 * pulse);
      strokeWeight(1);
      circle(z.x, z.y, z.r * 2 + 16);
    }

    noStroke();
    fill(col[0], col[1], col[2], isTarget ? 220 : 160);
    textSize(10);
    textAlign(CENTER, CENTER);
    text(COLORS[z.colorIdx].name.toUpperCase(), z.x, z.y + z.r + 13);
  }
}

// ─── FIGURA ARRASTRABLE ──────────────────────────────────────────────────────
function drawDraggable() {
  let d = draggable;
  push();
  translate(d.x, d.y);
  scale(d.scl);

  if (grabbed) rotate(sin(frameCount * 0.08) * 0.1);

  imageMode(CENTER);
  image(shapeGraphics, 0, 0, 70, 70);

  // Anillo "agárrame"
  if (!grabbed && d.scl >= 1) {
    noFill();
    stroke(255, 255, 255, 55 + sin(frameCount * 0.12) * 45);
    strokeWeight(1.5);
    circle(0, 0, 80);
    noStroke();
  }
  pop();
}

// ─── CURSOR ──────────────────────────────────────────────────────────────────
function drawFingerCursor() {
  let x = fingerX, y = fingerY;
  noStroke();
  if (grabbed) {
    fill(255, 220, 0, 220);
    circle(x, y, 20);
    noFill();
    stroke(255, 220, 0, 110);
    strokeWeight(1.5);
    circle(x, y, 34);
  } else {
    fill(255, 255, 255, 200);
    circle(x, y, 14);
    noFill();
    stroke(255, 255, 255, 85);
    strokeWeight(1.2);
    circle(x, y, 26);
  }
  noStroke();
}

// ─── HUD ─────────────────────────────────────────────────────────────────────
function drawHUD() {
  fill(12, 12, 20, 200);
  noStroke();
  rect(0, 0, width, 58);

  let col = COLORS[targetColorIdx].c;
  stroke(col[0], col[1], col[2], 160);
  strokeWeight(1.5);
  line(0, 58, width, 58);
  noStroke();

  fill(140, 140, 160);
  textSize(10);
  textAlign(LEFT, CENTER);
  text("LLEVA AL CÍRCULO", 16, 18);

  fill(col[0], col[1], col[2]);
  textSize(24);
  textAlign(LEFT, CENTER);
  text(COLORS[targetColorIdx].name.toUpperCase(), 16, 40);

  fill(140, 140, 160);
  textSize(10);
  textAlign(RIGHT, CENTER);
  text("PUNTOS", width - 16, 18);

  fill(255);
  textSize(26);
  textAlign(RIGHT, CENTER);
  text(score, width - 16, 40);

  if (!modelReady) {
    fill(255, 210, 50, 220);
    textSize(12);
    textAlign(CENTER, CENTER);
    text("Cargando modelo...", width / 2, 35);
  }
}

// ─── PARTÍCULAS ──────────────────────────────────────────────────────────────
function spawnParticles(x, y, col) {
  for (let i = 0; i < 16; i++) {
    particles.push({
      x, y,
      vx: random(-4, 4),
      vy: random(-5.5, -0.5),
      life: 240,
      size: random(4, 8),
      r: col[0], g: col[1], b: col[2],
    });
  }
}

function updateParticles() {
  noStroke();
  for (let i = particles.length - 1; i >= 0; i--) {
    let p = particles[i];
    p.x += p.vx;
    p.y += p.vy;
    p.vy += 0.25;
    p.life -= 7;
    fill(p.r, p.g, p.b, p.life);
    circle(p.x, p.y, p.size);
    if (p.life <= 0) particles.splice(i, 1);
  }
}

// ─── FORMAS SOBRE GRAPHICS BUFFER ────────────────────────────────────────────
function drawStarOn(g, x, y, r1, r2, pts) {
  let angle = TWO_PI / pts;
  let half = angle / 2;
  g.beginShape();
  for (let i = 0; i < pts; i++) {
    g.vertex(x + cos(i * angle - HALF_PI) * r1, y + sin(i * angle - HALF_PI) * r1);
    g.vertex(x + cos(i * angle + half - HALF_PI) * r2, y + sin(i * angle + half - HALF_PI) * r2);
  }
  g.endShape(CLOSE);
}

function drawHeartOn(g, x, y, s) {
  let w = s * 0.52;
  g.beginShape();
  for (let a = 0; a < TWO_PI; a += 0.07) {
    let hx = 16 * pow(sin(a), 3);
    let hy = -(13 * cos(a) - 5 * cos(2*a) - 2 * cos(3*a) - cos(4*a));
    g.vertex(x + hx * (w / 16), y + hy * (w / 16));
  }
  g.endShape(CLOSE);
}

function drawDiamondOn(g, x, y, s) {
  let h = s * 0.52, w = h * 0.65;
  g.beginShape();
  g.vertex(x,            y - h * 0.5);
  g.vertex(x + w * 0.5,  y);
  g.vertex(x,            y + h * 0.5);
  g.vertex(x - w * 0.5,  y);
  g.endShape(CLOSE);
}

function drawMoonOn(g, x, y, s) {
  let r = s * 0.27;
  g.circle(x, y, r * 2);
  g.fill(12, 12, 20);
  g.circle(x + r * 0.45, y - r * 0.08, r * 1.55);
}