// entry point — wires model / scene / ui and runs the frame loop
import { GameModel } from "./model.js";
import { GameScene } from "./scene.js";
import { SoundEngine } from "./sound.js";
import { Haptics } from "./haptics.js";
import { UI } from "./ui.js";

const canvas = document.getElementById("stage");
const ctx = canvas.getContext("2d");
ctx.scale(2, 2); // canvas is 780x1688 = 390x844 at 2x

const snd = new SoundEngine();
const haptics = new Haptics();
const scene = new GameScene(canvas, snd);
const model = new GameModel(scene, snd, haptics);
const ui = new UI(document.getElementById("app"), model, snd, haptics, scene);
window.__model = model; window.__scene = scene; // debug handle

// fit the 390x844 stage into the viewport
function fit() {
  const s = Math.min(innerWidth / 390, innerHeight / 844);
  document.getElementById("app").style.transform = `scale(${s})`;
}
addEventListener("resize", fit);
fit();

// keyboard: hold space to charge, release to cast; other keys tap
addEventListener("keydown", (e) => {
  if (e.repeat) return;
  if (e.code === "Space") { e.preventDefault(); model.pressCast(); }
  else if (e.code === "Enter") model.tapScreen();
  else model.tapScreen();
});
addEventListener("keyup", (e) => { if (e.code === "Space") model.releaseCast(); });
addEventListener("contextmenu", (e) => e.preventDefault());

let last = performance.now();
function frame(now) {
  const dt = Math.min(1 / 20, (now - last) / 1000);
  last = now;
  try {
    model.tick(dt);
    scene.update(dt, model);
    ctx.clearRect(0, 0, 390, 844);
    scene.draw(ctx);
    ui.update();
  } catch (e) { window.__err = (e && e.stack) || String(e); console.error(e); throw e; }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
