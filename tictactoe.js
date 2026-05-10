// ─── GATO (TIC-TAC-TOE) AR ───────────────────────────────────────────────────
// Mano abierta  → arrastra tu figura
// Mano cerrada  → coloca la figura en la celda más cercana
// Turno 1: Jugador = O (círculo, cian)
// Turno 2: CPU    = X (rojo) — juega automáticamente
// ─────────────────────────────────────────────────────────────────────────────

let video;
let handpose;
let predictions = [];
let modelReady  = false;

// ── Posición suavizada del dedo (índice tip = landmark 8)
let fingerX = 0, fingerY = 0;
let rawFX   = 0, rawFY   = 0;
const LERP  = 0.3;

// ── Tablero
//   0 = vacío  |  1 = Jugador (O)  |  2 = CPU (X)
let board = [0,0,0, 0,0,0, 0,0,0];

// Geometría del tablero — se calcula en setup()
let BOARD_X, BOARD_Y, CELL;   // origen y tamaño de celda

// ── Estado del juego
let currentTurn  = 1;          // 1=jugador, 2=CPU
let gameOver     = false;
let winner       = 0;          // 0=nadie, 1=jugador, 2=CPU, 3=empate
let winLine      = null;       // [{r,c},{r,c}] para dibujar línea ganadora
let cpuTimer     = 0;          // frames antes de que la CPU mueva
let restartTimer = 0;          // frames antes de reiniciar automáticamente

// ── Detección de gesto
let fistDetected  = false;
let fistFrames    = 0;          // frames consecutivos con puño
const FIST_FRAMES = 6;          // cuántos frames para confirmar cierre

// ── Partículas de celebración
let particles = [];

// ── Preview: celda que el jugador está "apuntando"
let hoveredCell = -1;

// ─── SETUP ───────────────────────────────────────────────────────────────────
function setup() {
  createCanvas(640, 480);
  frameRate(30);

  // Tablero centrado, debajo del HUD
  CELL    = 110;
  BOARD_X = width  / 2 - CELL * 1.5;
  BOARD_Y = height / 2 - CELL * 1.5 + 30;

  // Webcam
  video = createCapture(VIDEO);
  video.size(640, 480);
  video.hide();

  video.elt.onloadeddata = () => {
    handpose = ml5.handpose(video, { flipHorizontal: false }, () => {
      modelReady = true;
    });
    handpose.on("predict", results => { predictions = results; });
  };
}

// ─── DRAW ────────────────────────────────────────────────────────────────────
function draw() {
  background(12, 12, 20);

  // Cámara espejo
  push();
  translate(width, 0);
  scale(-1, 1);
  tint(255, 140);
  image(video, 0, 0, width, height);
  noTint();
  pop();

  // Overlay oscuro
  fill(12, 12, 20, 100);
  noStroke();
  rect(0, 0, width, height);

  // Partículas
  updateParticles();

  // Procesar mano
  if (modelReady && predictions.length > 0) {
    let lm = predictions[0].landmarks;

    // Espejo del eje X (igual que en el juego de colores)
    let tip = lm[8];
    rawFX = width - tip[0];
    rawFY = tip[1];

    detectFist(lm);
    drawHandSkeleton(lm);
  }

  // Lerp suavizado
  fingerX = lerp(fingerX, rawFX, LERP);
  fingerY = lerp(fingerY, rawFY, LERP);

  // Celda que se está apuntando (solo turno jugador)
  hoveredCell = -1;
  if (!gameOver && currentTurn === 1) {
    hoveredCell = getCellAt(fingerX, fingerY);
    if (board[hoveredCell] !== 0) hoveredCell = -1;
  }

  // Dibujar tablero y fichas
  drawBoard();
  drawPieces();

  // Preview de la ficha del jugador
  if (hoveredCell >= 0 && !gameOver) {
    drawPreviewPiece(hoveredCell);
  }

  // Cursor
  drawCursor();

  // HUD
  drawHUD();

  // Turno CPU
  if (!gameOver && currentTurn === 2) {
    cpuTimer++;
    if (cpuTimer >= 30) {          // 1 segundo a 30fps
      cpuMove();
      cpuTimer = 0;
    }
  }

  // Reinicio automático tras game-over
  if (gameOver) {
    restartTimer++;
    if (restartTimer >= 120) resetGame();
  }
}

// ─── TABLERO ─────────────────────────────────────────────────────────────────
function drawBoard() {
  let bx = BOARD_X, by = BOARD_Y, c = CELL;

  // Fondo suave
  fill(255, 255, 255, 6);
  noStroke();
  rect(bx, by, c * 3, c * 3, 12);

  // Líneas
  stroke(255, 255, 255, 45);
  strokeWeight(2);
  // Verticales internas
  line(bx + c,     by,       bx + c,     by + c * 3);
  line(bx + c * 2, by,       bx + c * 2, by + c * 3);
  // Horizontales internas
  line(bx,         by + c,   bx + c * 3, by + c);
  line(bx,         by + c*2, bx + c * 3, by + c*2);
  noStroke();

  // Highlight celda hover
  if (hoveredCell >= 0) {
    let [cr, cc] = [floor(hoveredCell / 3), hoveredCell % 3];
    fill(0, 212, 255, 18);
    noStroke();
    rect(bx + cc * c + 2, by + cr * c + 2, c - 4, c - 4, 8);
  }

  // Línea ganadora
  if (winLine) {
    let [a, b] = winLine;
    let ax = cellCX(a), ay = cellCY(a);
    let bx2 = cellCX(b), by2 = cellCY(b);

    let t = min(1, (frameCount - winLine.startFrame) / 20);
    let ex = lerp(ax, bx2, t);
    let ey = lerp(ay, by2, t);

    stroke(255, 220, 50, 210);
    strokeWeight(5);
    line(ax, ay, ex, ey);
    noStroke();
  }
}

// ─── FICHAS ──────────────────────────────────────────────────────────────────
function drawPieces() {
  for (let i = 0; i < 9; i++) {
    if (board[i] === 0) continue;
    let cx = cellCX(i), cy = cellCY(i);
    let r  = CELL * 0.33;
    if (board[i] === 1) drawO(cx, cy, r, 255);  // jugador
    else                drawX(cx, cy, r, 255);  // CPU
  }
}

function drawPreviewPiece(idx) {
  let cx = cellCX(idx), cy = cellCY(idx);
  let r  = CELL * 0.33;
  let alpha = 110 + sin(frameCount * 0.15) * 50;
  drawO(cx, cy, r, alpha);
}

// O = círculo cian
function drawO(cx, cy, r, alpha) {
  noFill();
  stroke(0, 212, 255, alpha);
  strokeWeight(4);
  circle(cx, cy, r * 2);

  // Brillo interno
  stroke(0, 212, 255, alpha * 0.3);
  strokeWeight(2);
  circle(cx, cy, r * 2 + 10);
  noStroke();
}

// X = rojo coral
function drawX(cx, cy, r, alpha) {
  stroke(255, 80, 80, alpha);
  strokeWeight(4);
  let d = r * 0.7;
  line(cx - d, cy - d, cx + d, cy + d);
  line(cx + d, cy - d, cx - d, cy + d);

  // Brillo
  stroke(255, 80, 80, alpha * 0.25);
  strokeWeight(8);
  line(cx - d, cy - d, cx + d, cy + d);
  line(cx + d, cy - d, cx - d, cy + d);
  noStroke();
}

// ─── CURSOR ──────────────────────────────────────────────────────────────────
function drawCursor() {
  let x = fingerX, y = fingerY;
  noStroke();

  if (fistDetected) {
    // Puño cerrado → amarillo
    fill(255, 220, 0, 220);
    circle(x, y, 18);
    noFill();
    stroke(255, 220, 0, 100);
    strokeWeight(1.5);
    circle(x, y, 30);
  } else {
    // Mano abierta → blanco/cian
    fill(0, 212, 255, 190);
    circle(x, y, 12);
    noFill();
    stroke(0, 212, 255, 70);
    strokeWeight(1.2);
    circle(x, y, 24);
  }
  noStroke();
}

// ─── HUD ─────────────────────────────────────────────────────────────────────
function drawHUD() {
  // Barra superior
  fill(12, 12, 20, 210);
  noStroke();
  rect(0, 0, width, 58);

  let lineCol = currentTurn === 1 ? [0, 212, 255] : [255, 80, 80];
  stroke(lineCol[0], lineCol[1], lineCol[2], 150);
  strokeWeight(1.5);
  line(0, 58, width, 58);
  noStroke();

  // Turno / estado
  if (!gameOver) {
    fill(140, 140, 160);
    textSize(10);
    textAlign(LEFT, CENTER);
    text("TURNO", 16, 18);

    if (currentTurn === 1) {
      fill(0, 212, 255);
      textSize(22);
      textAlign(LEFT, CENTER);
      text("TÚ  (O)", 16, 40);
    } else {
      fill(255, 80, 80);
      textSize(22);
      textAlign(LEFT, CENTER);
      text("CPU  (X)", 16, 40);
    }

    // Instrucción
    fill(140, 140, 160);
    textSize(10);
    textAlign(CENTER, CENTER);
    if (currentTurn === 1) {
      text("ABRE la mano para mover · CIÉRRALA para colocar", width / 2, 35);
    } else {
      text("La CPU está pensando…", width / 2, 35);
    }
  } else {
    // Resultado
    let msg, col;
    if (winner === 1)      { msg = "¡GANASTE!";  col = [0, 212, 255]; }
    else if (winner === 2) { msg = "CPU GANA";    col = [255, 80, 80]; }
    else                   { msg = "EMPATE";      col = [255, 200, 0]; }

    fill(col[0], col[1], col[2]);
    textSize(26);
    textAlign(CENTER, CENTER);
    text(msg, width / 2, 30);

    let frames = 120 - restartTimer;
    fill(140, 140, 160);
    textSize(10);
    textAlign(CENTER, CENTER);
    text(`Nueva partida en ${ceil(frames / 30)}s`, width / 2, 50);
  }

  // Estado del modelo
  if (!modelReady) {
    fill(255, 210, 50, 220);
    textSize(11);
    textAlign(RIGHT, CENTER);
    text("Cargando modelo…", width - 16, 35);
  }
}

// ─── DETECCIÓN DE PUÑO ───────────────────────────────────────────────────────
// Compara la distancia entre fingertips (4,8,12,16,20) y la base de la palma (0)
// Si todos los dedos están "doblados" (cerca de la palma) → puño
function detectFist(lm) {
  // Landmarks de punta de cada dedo (pulgar excluido, difícil de detectar bien)
  let tips  = [8, 12, 16, 20];
  // Base de cada dedo
  let bases = [5,  9, 13, 17];

  let closed = 0;
  for (let i = 0; i < tips.length; i++) {
    let tip  = lm[tips[i]];
    let base = lm[bases[i]];
    // Si la punta está POR DEBAJO (mayor Y) de la base → dedo doblado
    if (tip[1] > base[1] - 10) closed++;
  }

  let isFist = closed >= 3;   // al menos 3 de 4 dedos doblados

  if (isFist) {
    fistFrames++;
  } else {
    fistFrames = max(0, fistFrames - 2);
  }

  let wasOpen = !fistDetected;
  fistDetected = fistFrames >= FIST_FRAMES;

  // Flanco: mano se acaba de cerrar → intentar colocar ficha
  if (fistDetected && wasOpen && currentTurn === 1 && !gameOver) {
    tryPlacePiece();
  }
}

// ─── COLOCAR FICHA ───────────────────────────────────────────────────────────
function tryPlacePiece() {
  let idx = getCellAt(fingerX, fingerY);
  if (idx < 0 || board[idx] !== 0) return;

  board[idx] = 1;

  let result = checkWin(board);
  if (result) {
    endGame(result);
    return;
  }
  currentTurn = 2;
  cpuTimer    = 0;
}

// ─── TURNO CPU (Minimax simplificado) ────────────────────────────────────────
function cpuMove() {
  let best = bestMove(board);
  if (best < 0) return;

  board[best] = 2;

  let result = checkWin(board);
  if (result) {
    endGame(result);
    return;
  }
  currentTurn = 1;
}

function bestMove(b) {
  // Intenta ganar
  for (let i = 0; i < 9; i++) {
    if (b[i] !== 0) continue;
    let t = b.slice(); t[i] = 2;
    if (checkWin(t) === 2) return i;
  }
  // Bloquea al jugador
  for (let i = 0; i < 9; i++) {
    if (b[i] !== 0) continue;
    let t = b.slice(); t[i] = 1;
    if (checkWin(t) === 1) return i;
  }
  // Centro
  if (b[4] === 0) return 4;
  // Esquinas
  for (let c of [0, 2, 6, 8]) { if (b[c] === 0) return c; }
  // Cualquier libre
  for (let i = 0; i < 9; i++) { if (b[i] === 0) return i; }
  return -1;
}

// ─── VERIFICAR GANADOR ───────────────────────────────────────────────────────
const WINS = [
  [0,1,2],[3,4,5],[6,7,8],   // filas
  [0,3,6],[1,4,7],[2,5,8],   // columnas
  [0,4,8],[2,4,6]            // diagonales
];

function checkWin(b) {
  for (let [a,x,c] of WINS) {
    if (b[a] && b[a] === b[x] && b[x] === b[c]) return b[a];
  }
  if (b.every(v => v !== 0)) return 3;  // empate
  return 0;
}

function endGame(result) {
  winner   = result;
  gameOver = true;
  restartTimer = 0;

  // Línea ganadora
  if (result === 1 || result === 2) {
    for (let [a,x,c] of WINS) {
      if (board[a] && board[a] === board[x] && board[x] === board[c]) {
        winLine = [a, c];
        winLine.startFrame = frameCount;
        break;
      }
    }
    // Partículas
    let col = result === 1 ? [0,212,255] : [255,80,80];
    for (let i = 0; i < 40; i++) {
      particles.push({
        x: width / 2, y: height / 2,
        vx: random(-6, 6), vy: random(-7, -0.5),
        life: 280, size: random(4, 9),
        r: col[0], g: col[1], b: col[2]
      });
    }
  }
}

function resetGame() {
  board        = [0,0,0, 0,0,0, 0,0,0];
  currentTurn  = 1;
  gameOver     = false;
  winner       = 0;
  winLine      = null;
  restartTimer = 0;
  cpuTimer     = 0;
  particles    = [];
}

// ─── ESQUELETO DE MANO (debug visual) ────────────────────────────────────────
function drawHandSkeleton(lm) {
  // Conexiones simplificadas
  let chains = [
    [0,1,2,3,4],
    [0,5,6,7,8],
    [0,9,10,11,12],
    [0,13,14,15,16],
    [0,17,18,19,20]
  ];
  stroke(255, 255, 255, 22);
  strokeWeight(1.5);
  for (let chain of chains) {
    for (let j = 0; j < chain.length - 1; j++) {
      let a = lm[chain[j]], b = lm[chain[j+1]];
      line(width - a[0], a[1], width - b[0], b[1]);
    }
  }
  // Puntos articulación
  noStroke();
  fill(255, 255, 255, 35);
  for (let p of lm) {
    circle(width - p[0], p[1], 4);
  }
  noStroke();
}

// ─── PARTÍCULAS ──────────────────────────────────────────────────────────────
function updateParticles() {
  noStroke();
  for (let i = particles.length - 1; i >= 0; i--) {
    let p = particles[i];
    p.x += p.vx; p.y += p.vy;
    p.vy += 0.22;
    p.life -= 6;
    fill(p.r, p.g, p.b, p.life);
    circle(p.x, p.y, p.size);
    if (p.life <= 0) particles.splice(i, 1);
  }
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────
function getCellAt(x, y) {
  let col = floor((x - BOARD_X) / CELL);
  let row = floor((y - BOARD_Y) / CELL);
  if (col < 0 || col > 2 || row < 0 || row > 2) return -1;
  return row * 3 + col;
}

function cellCX(idx) {
  return BOARD_X + (idx % 3) * CELL + CELL / 2;
}
function cellCY(idx) {
  return BOARD_Y + floor(idx / 3) * CELL + CELL / 2;
}
