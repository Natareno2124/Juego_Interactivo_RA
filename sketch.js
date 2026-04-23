let video;
let handpose;
let predictions = [];
let modelReady = false;

// Colores del juego
let colors = [
  { name: "rojo", x: 150, y: 320, c: [255, 0, 0] },
  { name: "verde", x: 320, y: 320, c: [0, 255, 0] },
  { name: "azul", x: 490, y: 320, c: [0, 0, 255] }
];

let target;
let score = 0;

// Control para evitar múltiples puntos
let cooldown = 0;

// Mensajes en pantalla
let message = "";
let messageTimer = 0;

function setup() {
  createCanvas(640, 480);

  // Elegir color objetivo
  target = random(colors);

  // Webcam
  video = createCapture(VIDEO, () => {
    console.log("Cámara lista");
  });

  video.size(640, 480);
  video.hide();

  // Esperar a que el video esté listo
  video.elt.onloadeddata = () => {
    console.log("Video listo, cargando modelo...");

    handpose = ml5.handpose(video, () => {
      console.log("Modelo listo");
      modelReady = true;
    });

    handpose.on("predict", results => {
      predictions = results;
    });
  };
}

function draw() {
  background(0);

  // 🎥 Cámara en modo espejo
  push();
  translate(width, 0);
  scale(-1, 1);
  image(video, 0, 0);
  pop();

  // 🎨 Dibujar círculos
  for (let col of colors) {
    fill(col.c);
    circle(col.x, col.y, 100);
  }

  // 🧠 UI
  fill(255);
  textSize(28);
  textAlign(LEFT);
  text("Toca el: " + target.name, 20, 40);
  text("Puntos: " + score, 20, 70);

  // ✋ Mano detectada
  if (modelReady && predictions.length > 0) {
    let hand = predictions[0];
    let finger = hand.landmarks[8];

    // Ajuste espejo
    let x = width - finger[0];
    let y = finger[1];

    // Cursor
    fill(255, 255, 0);
    circle(x, y, 20);

    // 🎯 Colisión con cooldown
    if (cooldown <= 0) {
      for (let col of colors) {
        let d = dist(x, y, col.x, col.y);

        if (d < 50) {
          if (col === target) {
            score++;
            target = random(colors);
            cooldown = 30;

            message = "✔️ Correcto!";
            messageTimer = 60;
          } else {
            message = "❌ Intenta otra vez";
            messageTimer = 60;
            cooldown = 30;
          }
        }
      }
    }
  }

  // ⏳ Reducir cooldown
  cooldown--;

  // 💬 Mostrar mensaje
  if (messageTimer > 0) {
    fill(255);
    textSize(32);
    textAlign(CENTER);
    text(message, width / 2, 200);

    messageTimer--;
  }
}