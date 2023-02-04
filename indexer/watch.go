package main

import (
	"bytes"
	"context"
	"log"
	"os"
	"time"

	"github.com/algorand/go-algorand-sdk/v2/abi"
	"github.com/algorand/go-algorand-sdk/v2/client/v2/indexer"
	"github.com/algorand/go-algorand-sdk/v2/encoding/json"
)

const (
	indexerAddress string = "https://algoindexer.testnet.algoexplorerapi.io"
	indexerToken   string = ""
	appID          uint64 = 156774230
	appIDRound     uint64 = 27460058
)

func decodePosition(appArg []byte, methodArg abi.Arg) (uint32, uint32) {
	posType, _ := methodArg.GetTypeObject()
	posValue, _ := posType.Decode(appArg)
	pos, _ := posValue.([]interface{})
	x, _ := pos[0].(uint32)
	y, _ := pos[1].(uint32)
	return x, y
}

func decodeColor(appArg []byte, methodArg abi.Arg) [3]byte {
	colorType, _ := methodArg.GetTypeObject()
	colorValue, _ := colorType.Decode(appArg)
	color, _ := colorValue.([]interface{})
	r, _ := color[0].(byte)
	g, _ := color[1].(byte)
	b, _ := color[2].(byte)
	return [3]byte{r, g, b}
}

func decodeUint32(appArg []byte, methodArg abi.Arg) uint32 {
	nType, _ := methodArg.GetTypeObject()
	nValue, _ := nType.Decode(appArg)
	n, _ := nValue.(uint32)
	return n
}

func decodeUint64(appArg []byte, methodArg abi.Arg) uint64 {
	nType, _ := methodArg.GetTypeObject()
	nValue, _ := nType.Decode(appArg)
	n, _ := nValue.(uint64)
	return n
}

func decodePixel(sender string, time uint64, appArgs [][]byte, methodArgs []abi.Arg) Pixel {
	x, y := decodePosition(appArgs[1], methodArgs[1])
	color := decodeColor(appArgs[2], methodArgs[2])
	termDays := decodeUint32(appArgs[3], methodArgs[3])
	price := decodeUint64(appArgs[4], methodArgs[4])
	deposit := CalcDeposit(termDays, price)
	return Pixel{x, y, sender, color, time, termDays, price, deposit}
}

func CalcDeposit(termDays uint32, price uint64) uint64 {
	taxPerDay, _ := FindTaxPerDay()
	return (uint64(termDays) * price * taxPerDay) / 1_000_000
}

func WatchTransactions() {
	round, err := FindRound()
	if err != nil {
		if err.Error() == "mongo: no documents in result" {
			round = appIDRound
			Clear()
			InsertRound(appIDRound)
			InsertMintFee(10_000)
			InsertTaxPerDay(1_750)
			InsertTotalPixels(0)
			InsertMaxPixels(0)
		} else {
			log.Println(err)
			return
		}
	}

	step := uint64(1_000)

	indexerClient, err := indexer.MakeClient(indexerAddress, indexerToken)
	if err != nil {
		log.Println(err)
		return
	}

	buf, err := os.ReadFile("contract.json")
	if err != nil {
		log.Println(err)
		return
	}

	var contract abi.Contract
	err = json.Decode(buf, &contract)
	if err != nil {
		log.Println(err)
		return
	}

	for {
		res, err := indexerClient.SearchForTransactions().ApplicationId(appID).MinRound(round).MaxRound(round + step).Do(context.Background())
		if err != nil {
			log.Println(err)
			return
		}

		for _, tx := range res.Transactions {
			appArgs := tx.ApplicationTransaction.ApplicationArgs
			if len(appArgs) > 0 {
				for _, method := range contract.Methods {
					if bytes.Compare(method.GetSelector(), appArgs[0]) == 0 {
						switch method.Name {
						case "update_mint_fee":
							mintFee := decodeUint64(appArgs[1], method.Args[1])
							err := UpdateMintFee(mintFee)
							if err != nil {
								log.Println(err)
							}
						case "update_tax_per_day":
							taxPerDay := decodeUint64(appArgs[1], method.Args[1])
							err := UpdateTaxPerDay(taxPerDay)
							if err != nil {
								log.Println(err)
							}
						case "allocate_pixels":
							amount := decodeUint64(appArgs[1], method.Args[1])
							maxPixels, _ := FindMaxPixels()
							err := UpdateMaxPixels(maxPixels + amount)
							if err != nil {
								log.Println(err)
							}
						case "mint_pixel":
							pixel := decodePixel(tx.Sender, tx.RoundTime, appArgs, method.Args)
							err := InsertPixel(pixel)
							if err != nil {
								log.Println(err)
							}
							data := UpdateData{
								Owner:       pixel.Owner,
								Color:       pixel.Color,
								TermBeginAt: pixel.TermBeginAt,
								TermDays:    pixel.TermDays,
								Price:       pixel.Price,
							}
							update := Update{pixel.X, pixel.Y, data}
							go SendUpdate(update)
						case "buy_pixel":
							pixel := decodePixel(tx.Sender, tx.RoundTime, appArgs, method.Args)
							err := UpdatePixel(pixel)
							if err != nil {
								log.Println(err)
							}
							data := UpdateData{
								Owner:       pixel.Owner,
								Color:       pixel.Color,
								TermBeginAt: pixel.TermBeginAt,
								TermDays:    pixel.TermDays,
								Price:       pixel.Price,
							}
							update := Update{pixel.X, pixel.Y, data}
							go SendUpdate(update)
						case "update_pixel_color":
							x, y := decodePosition(appArgs[1], method.Args[0])
							color := decodeColor(appArgs[2], method.Args[1])
							err := UpdatePixelColor(x, y, color)
							if err != nil {
								log.Println(err)
							}
							data := UpdateData{Color: color}
							update := Update{x, y, data}
							go SendUpdate(update)
						case "update_pixel_term_days":
							x, y := decodePosition(appArgs[1], method.Args[0])
							termDays := decodeUint32(appArgs[2], method.Args[1])
							err := UpdatePixelTermDays(x, y, termDays)
							if err != nil {
								log.Println(err)
							}
							data := UpdateData{TermDays: termDays}
							update := Update{x, y, data}
							go SendUpdate(update)
						case "update_pixel_price":
							x, y := decodePosition(appArgs[1], method.Args[0])
							price := decodeUint64(appArgs[2], method.Args[1])
							err := UpdatePixelPrice(x, y, price)
							if err != nil {
								log.Println(err)
							}
							data := UpdateData{Price: price}
							update := Update{x, y, data}
							go SendUpdate(update)
						case "burn_pixel":
							x, y := decodePosition(appArgs[1], method.Args[0])
							err := DeletePixel(x, y)
							if err != nil {
								log.Println(err)
							}
							mintFee, _ := FindMintFee()
							data := UpdateData{ZeroAddress, [3]byte{255, 255, 255}, 0, 0, mintFee}
							update := Update{x, y, data}
							go SendUpdate(update)
						}
						break
					}
				}
			}
		}

		if round+step > res.CurrentRound {
			round = res.CurrentRound
			time.Sleep(1 * time.Second)
		} else {
			round += step
		}
		err = UpdateRound(appIDRound)
		if err != nil {
			log.Println(err)
		}
	}
}
