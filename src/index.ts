import { Application, Graphics, utils } from "pixi.js"
import {
  account,
  getPixels,
  mintPixel,
  buyPixel,
  updatePixelColor,
  updatePixelTermDays,
  updatePixelPrice,
  burnPixel,
} from "./contract"
import type { Color, Pixel } from "./contract"
import "./index.css"

const $position = document.getElementById(
  "position",
) as unknown as HTMLParagraphElement
const $zoomInButton = document.getElementById(
  "zoomInButton",
) as unknown as HTMLButtonElement
const $zoomOutButton = document.getElementById(
  "zoomOutButton",
) as unknown as HTMLButtonElement
const $selection = document.getElementById(
  "selection",
) as unknown as HTMLDivElement
const $selectionPosition = document.getElementById(
  "selectionPosition",
) as unknown as HTMLSpanElement
const $selectionOwner = document.getElementById(
  "selectionOwner",
) as unknown as HTMLSpanElement
const $selectionColor = document.getElementById(
  "selectionColor",
) as unknown as HTMLSpanElement
const $selectionPrice = document.getElementById(
  "selectionPrice",
) as unknown as HTMLSpanElement
const $selectionTermEnd = document.getElementById(
  "selectionTermEnd",
) as unknown as HTMLSpanElement
const $openBuyButton = document.getElementById(
  "openBuyButton",
) as unknown as HTMLButtonElement
const $burnPixelButton = document.getElementById(
  "burnPixelButton",
) as unknown as HTMLButtonElement
const $buy = document.getElementById("buy") as unknown as HTMLButtonElement
const $buyColorR = document.getElementById(
  "buyColorR",
) as unknown as HTMLInputElement
const $buyColorG = document.getElementById(
  "buyColorG",
) as unknown as HTMLInputElement
const $buyColorB = document.getElementById(
  "buyColorB",
) as unknown as HTMLInputElement
const $buyPrice = document.getElementById(
  "buyPrice",
) as unknown as HTMLInputElement
const $buyTermDays = document.getElementById(
  "buyTermDays",
) as unknown as HTMLInputElement
const $buyDeposit = document.getElementById(
  "buyDeposit",
) as unknown as HTMLSpanElement
const $buyTotalCost = document.getElementById(
  "buyTotalCost",
) as unknown as HTMLSpanElement
const $buyPixelButton = document.getElementById(
  "buyPixelButton",
) as unknown as HTMLButtonElement

const app = new Application({
  width: window.innerWidth,
  height: window.innerHeight,
  antialias: true,
})

document.body.appendChild(app.view as unknown as Node)

interface Selected {
  x: number
  y: number
  color: Color
  termDays: number
  price: number
}

const graphics = new Graphics()

const minCoord = -2147483648
const maxCoord = 2147483647
const minWidth = 8
const maxWidth = 128
const chunkSize = 100
const taxPerDay = 0.00175

const pixels: Pixel[][] = []
const chunkLoaded: boolean[][] = []
const pos = { x: 0, y: 0 }
const dir = { x: 0, y: 0, z: 0 }
let selected: Selected | null = null
let width = 32
let size = window.innerWidth / width
let height = window.innerHeight / size
let speed = width / 4

function pixelAt(x: number, y: number): Pixel | undefined {
  if (!pixels[x - minCoord]) return undefined
  return pixels[x - minCoord][y - minCoord]
}

function drawCanvas() {
  for (let i = 0; i < width + 1; i++) {
    for (let j = 0; j < height + 1; j++) {
      const pixel = pixelAt(Math.floor(pos.x) + i, Math.floor(pos.y) + j)

      if (pixel) {
        if (
          selected &&
          selected.x === Math.floor(pos.x) + i &&
          selected.y === Math.floor(pos.y) + j
        ) {
          const inverse = [
            1.0 - selected.color[0],
            1.0 - selected.color[1],
            1.0 - selected.color[2],
          ]
          graphics.lineStyle(size / 10, utils.rgb2hex(inverse), 1, 0)
          graphics.beginFill(utils.rgb2hex(selected.color))
        } else {
          graphics.lineStyle(0)
          graphics.beginFill(utils.rgb2hex(pixel.color))
        }

        graphics.drawRect(
          (i - (pos.x - Math.floor(pos.x))) * size,
          (j - (pos.y - Math.floor(pos.y))) * size,
          size,
          size,
        )
        graphics.endFill()
      }
    }
  }
}

app.stage.addChild(graphics)

function move(dx: number, dy: number) {
  if (dx != 0 || dy != 0) {
    pos.x += dx
    if (pos.x < minCoord) pos.x = minCoord
    if (pos.x > maxCoord - width) pos.x = maxCoord - width
    pos.y += dy
    if (pos.y < minCoord) pos.y = minCoord
    if (pos.y > maxCoord - height) pos.y = maxCoord - height
    $position.innerText = `(${Math.floor(pos.x)}, ${Math.floor(pos.y)})`
    graphics.clear()
    drawCanvas()

    const loadX = Math.abs(pos.x) % chunkSize >= chunkSize - size
    const loadY = Math.abs(pos.y) % chunkSize >= chunkSize - size
    if (loadX) {
      loadChunk(
        Math.floor(pos.x / chunkSize) + pos.x >= 0 ? 1 : -1,
        Math.floor(pos.y / chunkSize),
      )
    }
    if (loadY) {
      loadChunk(
        Math.floor(pos.x / chunkSize),
        Math.floor(pos.y / chunkSize) + pos.y >= 0 ? 1 : -1,
      )
    }
    if (loadX && loadY) {
      loadChunk(
        Math.floor(pos.x / chunkSize) + pos.x >= 0 ? 1 : -1,
        Math.floor(pos.y / chunkSize) + pos.y >= 0 ? 1 : -1,
      )
    }
  }
}

function zoom(dz: number) {
  if (dz != 0) {
    const lastWidth = width
    const lastHeight = height
    width += dz
    if (width < minWidth) width = minWidth
    if (width > maxWidth) width = maxWidth
    size = window.innerWidth / width
    height = window.innerHeight / size
    speed = width / 4
    move((lastWidth - width) / 2, (lastHeight - height) / 2)
  }
}

function select(x: number, y: number) {
  $buy.hidden = true
  if (selected && selected.x === x && selected.y === y) {
    selected = null
    $selection.hidden = true
    $selectionPosition.innerText = ""
    $selectionOwner.innerText = ""
    $selectionColor.innerText = ""
    $selectionPrice.innerText = ""
    $selectionTermEnd.innerText = ""
  } else {
    const pixel = pixelAt(x, y)
    if (pixel) {
      selected = {
        x,
        y,
        color: [...pixel.color],
        termDays: pixel.termDays,
        price: pixel.price,
      }
      $selection.hidden = false
      $selectionPosition.innerText = `(${x}, ${y})`
      $selectionOwner.innerText = pixel.owner || "Unowned"
      $selectionColor.innerText = `rgb(${Math.floor(
        pixel.color[0] * 255,
      )}, ${Math.floor(pixel.color[1] * 255)}, ${Math.floor(
        pixel.color[2] * 255,
      )})`
      $selectionPrice.innerText = `${pixel.price / 1_000_000} ALGO`
      $selectionTermEnd.innerText =
        pixel.termBeginAt && pixel.termDays
          ? "" + pixel.termBeginAt + pixel.termDays * 86_400
          : "Never"
      $buyColorR.value = "" + Math.floor(selected.color[0] * 255)
      $buyColorG.value = "" + Math.floor(selected.color[1] * 255)
      $buyColorB.value = "" + Math.floor(selected.color[2] * 255)
      $buyPrice.value = "" + selected.price / 1_000_000
      $buyTermDays.value = "" + selected.termDays
      const deposit = selected.price * taxPerDay * selected.termDays
      $buyDeposit.innerText = `${(deposit / 1_000_000).toFixed(6)} ALGO`
      $buyTotalCost.innerText = `${(
        (pixel.price + deposit) /
        1_000_000
      ).toFixed(6)} ALGO`

      if (pixel.owner === account.addr) {
        $openBuyButton.innerText = "Update"
        $buyPixelButton.innerText = "Update"
        $burnPixelButton.hidden = false
      } else if (pixel.owner) {
        $openBuyButton.innerText = "Buy"
        $buyPixelButton.innerText = "Buy"
        $burnPixelButton.hidden = true
      } else {
        $openBuyButton.innerText = "Mint"
        $buyPixelButton.innerText = "Mint"
        $burnPixelButton.hidden = true
      }
    }
  }
  graphics.clear()
  drawCanvas()
}

async function loadChunk(chunkX: number, chunkY: number) {
  const startX = chunkX * chunkSize - minCoord
  const startY = chunkY * chunkSize - minCoord
  const nextPixels = await getPixels(startX, startY, chunkSize, chunkSize)
  for (let i = 0; i < chunkSize; i++) {
    if (!pixels[startX + i]) pixels[startX + i] = []
    for (let j = 0; j < chunkSize; j++) {
      pixels[startX + i][startY + j] = nextPixels[i][j]
    }
  }
  drawCanvas()
}

drawCanvas()
loadChunk(0, 0)
loadChunk(-1, 0)
loadChunk(0, -1)
loadChunk(-1, -1)

let elapsed = 0
app.ticker.add((dt) => {
  elapsed += dt
  const threshold = Math.ceil((width / maxWidth) * 4)
  if (elapsed >= threshold) {
    elapsed = elapsed % threshold
    move((dt / 60) * dir.x * speed, (dt / 60) * dir.y * speed)
    zoom((dt / 60) * dir.z * 10)
  }
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

window.addEventListener("mouseup", (e) => {
  if (e.button === 0) dir.z = 0
})

window.addEventListener("resize", () => {
  app.renderer.resize(window.innerWidth, window.innerHeight)
  size = window.innerWidth / width
  height = window.innerHeight / size
  graphics.clear()
  drawCanvas()
})

let grabbing = false

app.view.addEventListener("mousedown", (e: MouseEvent) => {
  if (e.button === 0) grabbing = true
})

app.view.addEventListener("mouseup", (e: MouseEvent) => {
  if (e.button === 0) grabbing = false
})

app.view.addEventListener("mousemove", (e: MouseEvent) => {
  if (grabbing) move(-e.movementX / size, -e.movementY / size)
})

app.view.addEventListener("click", (e: MouseEvent) => {
  select(
    Math.floor(e.clientX / size + pos.x),
    Math.floor(e.clientY / size + pos.y),
  )
})

$zoomInButton.addEventListener("mousedown", (e) => {
  if (e.button === 0) dir.z = -1
})

$zoomOutButton.addEventListener("mousedown", (e) => {
  if (e.button === 0) dir.z = 1
})

$openBuyButton.addEventListener("click", () => ($buy.hidden = false))

$burnPixelButton.addEventListener("click", () => {
  burnPixel(selected.x - minCoord, selected.y - minCoord)
})

$buyColorR.addEventListener("input", () => {
  selected.color[0] = parseInt($buyColorR.value) / 255
  graphics.clear()
  drawCanvas()
})

$buyColorG.addEventListener("input", () => {
  selected.color[1] = parseInt($buyColorG.value) / 255
  graphics.clear()
  drawCanvas()
})

$buyColorB.addEventListener("input", () => {
  selected.color[2] = parseInt($buyColorB.value) / 255
  graphics.clear()
  drawCanvas()
})

$buyPrice.addEventListener("input", () => {
  selected.price = parseFloat($buyPrice.value) * 1_000_000
  const deposit = selected.price * taxPerDay * selected.termDays
  $buyDeposit.innerText = `${(deposit / 1_000_000).toFixed(6)} ALGO`
  const price = pixelAt(selected.x, selected.y).price
  $buyTotalCost.innerText = `${((price + deposit) / 1_000_000).toFixed(6)} ALGO`
})

$buyTermDays.addEventListener("input", () => {
  selected.termDays = parseInt($buyTermDays.value)
  const deposit = selected.price * taxPerDay * selected.termDays
  $buyDeposit.innerText = `${(deposit / 1_000_000).toFixed(6)} ALGO`
  const price = pixelAt(selected.x, selected.y).price
  $buyTotalCost.innerText = `${((price + deposit) / 1_000_000).toFixed(6)} ALGO`
})

$buyPixelButton.addEventListener("click", () => {
  const { x, y } = selected
  const owner = pixelAt(x, y).owner
  if (owner === account.addr) {
    const color = pixelAt(x, y).color
    const termDays = pixelAt(x, y).termDays
    const price = pixelAt(x, y).price
    if (!selected.color.every((c, i) => (c === color[i]))) {
      updatePixelColor(x - minCoord, y - minCoord, selected.color)
    } else if (selected.termDays !== termDays) {
      updatePixelTermDays(x - minCoord, y - minCoord, selected.termDays)
    } else if (selected.price !== price) {
      updatePixelPrice(x - minCoord, y - minCoord, selected.price)
    }
  } else if (owner !== null) {
    buyPixel(x - minCoord, y - minCoord, selected.color, selected.termDays, selected.price)
  } else {
    mintPixel(x - minCoord, y - minCoord, selected.color, selected.termDays, selected.price)
  }
})
