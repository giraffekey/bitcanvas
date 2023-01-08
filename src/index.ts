import { Application, Graphics } from "pixi.js"
import "./index.css"

const $position = document.getElementById("position")
const $zoomInButton = document.getElementById("zoomInButton")
const $zoomOutButton = document.getElementById("zoomOutButton")

const app = new Application({
  width: window.innerWidth,
  height: window.innerHeight,
  antialias: true,
})

document.body.appendChild(app.view as unknown as Node)

const graphics = new Graphics()

const colors = [
  0xff0000, 0x00ff00, 0x0000ff, 0xffff00, 0xff00ff, 0x00ffff, 0xffffff,
  0x000000,
]

const pixels: number[][] = []
const pos = { x: 0, y: 0 }
const dir = { x: 0, y: 0, z: 0 }
let width = 32
let size = window.innerWidth / width
let height = window.innerHeight / size
let speed = width / 4

for (let i = 0; i < 1_000; i++) {
  pixels[i] = []
  for (let j = 0; j < 1_000; j++) {
    pixels[i][j] = colors[Math.floor(Math.random() * colors.length)]
  }
}

function drawCanvas() {
  for (let j = 0; j < width + 1; j++) {
    for (let i = 0; i < height + 1; i++) {
      graphics.beginFill(pixels[Math.floor(pos.x) + j][Math.floor(pos.y) + i])
      graphics.drawRect(
        (j - (pos.x % 1.0)) * size,
        (i - (pos.y % 1.0)) * size,
        size,
        size,
      )
      graphics.endFill()
    }
  }
}

drawCanvas()

app.stage.addChild(graphics)

function move(dx: number, dy: number) {
  if (dx != 0 || dy != 0) {
    pos.x += dx
    if (pos.x < 0) pos.x = 0
    if (pos.x > 999 - width) pos.x = 999 - width
    pos.y += dy
    if (pos.y < 0) pos.y = 0
    if (pos.y > 999 - height) pos.y = 999 - height
    $position.innerText = `(${Math.floor(pos.x)}, ${Math.floor(pos.y)})`
    graphics.clear()
    drawCanvas()
  }
}

function zoom(dz: number) {
  if (dz != 0) {
    const lastWidth = width
    const lastHeight = height
    width += dz
    if (width < 8) width = 8
    if (width > 128) width = 128
    size = window.innerWidth / width
    height = window.innerHeight / size
    speed = width / 4
    move((lastWidth - width) / 2, (lastHeight - height) / 2)
  }
}

app.ticker.add((dt) => {
  move((dt / 60) * dir.x * speed, (dt / 60) * dir.y * speed)
  zoom((dt / 60) * dir.z * 10)
})

let zooming = false

window.addEventListener("keydown", (e) => {
  switch (e.key) {
    case "ArrowLeft":
    case "a":
      dir.x = -1
      break
    case "ArrowRight":
    case "d":
      dir.x = 1
      break
    case "ArrowUp":
    case "w":
      dir.y = -1
      break
    case "ArrowDown":
    case "s":
      dir.y = 1
      break
    case "Control":
      zooming = true
      break
    case "-":
    case "_":
      dir.z = 1
      break
    case "=":
    case "+":
      dir.z = -1
      break
  }
})

window.addEventListener("keyup", (e) => {
  switch (e.key) {
    case "ArrowLeft":
    case "a":
    case "ArrowRight":
    case "d":
      dir.x = 0
      break
    case "ArrowUp":
    case "w":
    case "ArrowDown":
    case "s":
      dir.y = 0
      break
    case "Control":
      zooming = false
      break
    case "-":
    case "_":
      dir.z = 0
      break
    case "=":
    case "+":
      dir.z = 0
      break
  }
})

window.addEventListener("wheel", (e) => {
  if (zooming) {
    zoom(e.deltaY / 2)
  } else {
    move((e.deltaX / 2 / size) * speed, (e.deltaY / 2 / size) * speed)
  }
})

let grabbing = false

window.addEventListener("mousedown", (e) => {
  if (e.button === 0 && dir.z === 0) grabbing = true
})

window.addEventListener("mouseup", (e) => {
  if (e.button === 0) {
    grabbing = false
    dir.z = 0
  }
})

window.addEventListener("mousemove", (e) => {
  if (grabbing) move(-e.movementX / size, -e.movementY / size)
})

window.addEventListener("resize", () => {
  app.renderer.resize(window.innerWidth, window.innerHeight)
  size = window.innerWidth / width
  height = window.innerHeight / size
  graphics.clear()
  drawCanvas()
})

$zoomInButton.addEventListener("mousedown", (e) => {
  if (e.button === 0) dir.z = -1
})
$zoomOutButton.addEventListener("mousedown", (e) => {
  if (e.button === 0) dir.z = 1
})
