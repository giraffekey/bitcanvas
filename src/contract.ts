import algosdk from "algosdk"
import type { ABIValue, BoxReference } from "algosdk"
import axios from "axios"
import contractABI from "./contract.json"

export type Color = [number, number, number]

export interface Pixel {
  owner: string
  color: Color
  termBeginAt: number
  termDays: number
  price: number
  deposit: number
}

const ZERO_ADDRESS =
  "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAY5HFKQ"
const PIXEL_MIN_BALANCE = 27700
const INDEXER_API = "http://localhost:5000"

const appID = 156774230
const contract = new algosdk.ABIContract(contractABI)

const algod = new algosdk.Algodv2(
  "",
  "http://node.testnet.algoexplorerapi.io",
  80,
)

const mnemonic =
  "object march dream board model pitch actor plate jungle cream caution smoke electric muscle west melody attend come pencil empty kiwi magnet win abandon black"
export const account = algosdk.mnemonicToSecretKey(mnemonic)

function intToArray(i: number): Uint8Array {
  return Uint8Array.of(
    (i & 0xff000000) >> 24,
    (i & 0x00ff0000) >> 16,
    (i & 0x0000ff00) >> 8,
    (i & 0x000000ff) >> 0,
  )
}

function arrayToInt(bs: Uint8Array): number {
  const bytes = bs.subarray(0, 4)
  let n = 0
  for (let i = 0; i < bytes.length; i++) {
    n = (n << 8) | bytes[i]
  }
  return n
}

function stringToArray(s: string): Uint8Array {
  return new TextEncoder().encode(s)
}

function arrayToString(bs: Uint8Array): string {
  return new TextDecoder().decode(bs)
}

function pixelBoxName(x: number, y: number): Uint8Array {
  const boxName = new Uint8Array(9)
  boxName.set(stringToArray("p"))
  boxName.set(intToArray(x), 1)
  boxName.set(intToArray(y), 5)
  return boxName
}

function calcDeposit(
  termDays: number,
  price: number,
  taxPerDay: number,
): number {
  return (termDays * price * taxPerDay) / 1_000_000
}

async function callApp(
  method: string,
  args: ABIValue[],
  boxes?: BoxReference[],
  payment?: number,
): Promise<ABIValue[]> {
  const atc = new algosdk.AtomicTransactionComposer()
  const signer = algosdk.makeBasicAccountTransactionSigner(account)
  const suggestedParams = await algod.getTransactionParams().do()

  if (payment && payment > 0) {
    const txn = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
      from: account.addr,
      to: algosdk.getApplicationAddress(appID),
      amount: BigInt(Math.floor(payment)),
      suggestedParams,
    })
    args.unshift({ txn, signer } as any)
  }

  atc.addMethodCall({
    sender: account.addr,
    signer,
    appID,
    method: algosdk.getMethodByName(contract.methods, method),
    methodArgs: args,
    boxes: boxes || [],
    suggestedParams,
  })

  const res = await atc.execute(algod, 4)
  return res.methodResults.map((result) => result.returnValue)
}

export async function updateMintFee(mintFee: number) {
  await callApp("update_mint_fee", [mintFee])
}

export async function updateTaxPerDay(taxPerDay: number) {
  await callApp("update_tax_per_day", [taxPerDay])
}

export async function getMintFee(): Promise<number> {
  try {
    const res = await axios.get(`${INDEXER_API}/api/mint-fee`)
    return res.data.value
  } catch (e) {
    const [mintFee] = await callApp("get_mint_fee", [])
    return Number(mintFee as bigint)
  }
}

export async function getTaxPerDay(): Promise<number> {
  try {
    const res = await axios.get(`${INDEXER_API}/api/tax-per-day`)
    return res.data.value
  } catch (e) {
    const [taxPerDay] = await callApp("get_tax_per_day", [])
    return Number(taxPerDay as bigint)
  }
}

export async function getTotalPixels(): Promise<number> {
  try {
    const res = await axios.get(`${INDEXER_API}/api/total-pixels`)
    return res.data.value
  } catch (e) {
    const [totalPixels] = await callApp("get_total_pixels", [])
    return Number(totalPixels as bigint)
  }
}

export async function getMaxPixels(): Promise<number> {
  try {
    const res = await axios.get(`${INDEXER_API}/api/max-pixels`)
    return res.data.value
  } catch (e) {
    const [maxPixels] = await callApp("get_max_pixels", [])
    return Number(maxPixels as bigint)
  }
}

export async function allocatePixels(amount: number) {
  const payment = PIXEL_MIN_BALANCE * amount
  await callApp("allocate_pixels", [amount], [], payment)
}

export async function getPixel(x: number, y: number): Promise<Pixel> {
  try {
    const res = await axios.get(`${INDEXER_API}/api/pixel`, { params: { x, y } })
    const pixel = <Pixel>res.data
    return {
      ...pixel,
      owner: pixel.owner === ZERO_ADDRESS ? null : pixel.owner,
      color: <Color>pixel.color.map((c) => c / 255),
    }
  } catch (e) {
    const boxes = [{ appIndex: appID, name: pixelBoxName(x, y) }]
    const [pixel] = await callApp("get_pixel", [[x, y]], boxes)
    const [owner, color, termBeginAt, termDays, price, deposit] =
      pixel as ABIValue[]
    return <Pixel>{
      owner: owner === ZERO_ADDRESS ? null : owner,
      color: (color as bigint[]).map((c) => Number(c) / 255),
      termBeginAt: Number(termBeginAt as bigint),
      termDays: Number(termDays as bigint),
      price: Number(price as bigint),
      deposit: Number(deposit as bigint),
    }
  }
}

export async function getPixels(
  x: number,
  y: number,
  width: number,
  height: number,
): Promise<Pixel[][]> {
  const res = await axios.get(`${INDEXER_API}/api/pixels`, {
    params: { x, y, width, height },
  })
  const pixels = <Pixel[][]>res.data
  return pixels.map((col) =>
    col.map((pixel) => ({
      ...pixel,
      owner: pixel.owner === ZERO_ADDRESS ? null : pixel.owner,
      color: <Color>pixel.color.map((c) => c / 255),
    })),
  )
}

export async function mintPixel(
  x: number,
  y: number,
  color: Color,
  termDays: number,
  price: number,
) {
  const boxes = [{ appIndex: appID, name: pixelBoxName(x, y) }]
  const [mintFee, taxPerDay, totalPixels, maxPixels] = await Promise.all([
    getMintFee(),
    getTaxPerDay(),
    getTotalPixels(),
    getMaxPixels(),
  ])
  const deposit = calcDeposit(termDays, price, taxPerDay)
  let payment = mintFee + deposit
  if (totalPixels >= maxPixels) {
    payment += PIXEL_MIN_BALANCE
  }
  await callApp(
    "mint_pixel",
    [[x, y], color.map((c) => c * 255), termDays, price],
    boxes,
    payment,
  )
}

export async function buyPixel(
  x: number,
  y: number,
  color: Color,
  termDays: number,
  price: number,
) {
  const boxes = [{ appIndex: appID, name: pixelBoxName(x, y) }]
  const [taxPerDay, { price: lastPrice }] = await Promise.all([
    getTaxPerDay(),
    getPixel(x, y),
  ])
  const deposit = calcDeposit(termDays, price, taxPerDay)
  const payment = lastPrice + deposit
  await callApp(
    "buy_pixel",
    [[x, y], color.map((c) => c * 255), termDays, price],
    boxes,
    payment,
  )
}

export async function updatePixelColor(x: number, y: number, color: Color) {
  const boxes = [{ appIndex: appID, name: pixelBoxName(x, y) }]
  await callApp(
    "update_pixel_color",
    [[x, y], color.map((c) => c * 255)],
    boxes,
  )
}

export async function updatePixelTermDays(
  x: number,
  y: number,
  termDays: number,
) {
  const boxes = [{ appIndex: appID, name: pixelBoxName(x, y) }]
  const [taxPerDay, { price, deposit: lastDeposit }] = await Promise.all([
    getTaxPerDay(),
    getPixel(x, y),
  ])
  const deposit = calcDeposit(termDays, price, taxPerDay)
  let payment
  if (deposit > lastDeposit) {
    payment = deposit - lastDeposit
  }
  await callApp("update_pixel_term_days", [[x, y], termDays], boxes, payment)
}

export async function updatePixelPrice(x: number, y: number, price: number) {
  const boxes = [{ appIndex: appID, name: pixelBoxName(x, y) }]
  const [taxPerDay, { termDays, deposit: lastDeposit }] = await Promise.all([
    getTaxPerDay(),
    getPixel(x, y),
  ])
  const deposit = calcDeposit(termDays, price, taxPerDay)
  let payment
  if (deposit > lastDeposit) {
    payment = deposit - lastDeposit
  }
  await callApp("update_pixel_price", [[x, y], price], boxes, payment)
}

export async function burnPixel(x: number, y: number) {
  const boxes = [{ appIndex: appID, name: pixelBoxName(x, y) }]
  await callApp("burn_pixel", [[x, y]], boxes)
}
