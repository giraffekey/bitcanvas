package main

import (
	"context"
	"log"
	"net/http"
	"strconv"
	"time"

	"github.com/labstack/echo/v4"

	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"

	"github.com/algorand/go-algorand-sdk/v2/types"
)

var DB *mongo.Client = ConnectDB()

func ConnectDB() *mongo.Client {
	client, err := mongo.NewClient(options.Client().ApplyURI("mongodb://localhost:27017"))
	if err != nil {
		log.Println(err)
		return nil
	}

	ctx, _ := context.WithTimeout(context.Background(), 10*time.Second)
	err = client.Connect(ctx)
	if err != nil {
		log.Println(err)
		return nil
	}

	return client
}

type PixelResponse struct {
	Owner       string  `json:"owner" validate:"required"`
	Color       [3]byte `json:"color" validate:"required"`
	TermBeginAt uint64  `json:"termBeginAt" validate:"required"`
	TermDays    uint32  `json:"termDays" validate:"required"`
	Price       uint64  `json:"price" validate:"required"`
	Deposit     uint64  `json:"deposit" validate:"required"`
}

func getPixel(c echo.Context) error {
	xParam, _ := strconv.Atoi(c.QueryParam("x"))
	x := uint32(xParam)
	yParam, _ := strconv.Atoi(c.QueryParam("y"))
	y := uint32(yParam)

	pixel, err := FindPixel(x, y)
	if err != nil {
		log.Println(err)
		return err
	}

	res := PixelResponse{
		Owner:       pixel.Owner,
		Color:       pixel.Color,
		TermBeginAt: pixel.TermBeginAt,
		TermDays:    pixel.TermDays,
		Price:       pixel.Price,
		Deposit:     pixel.Deposit,
	}
	return c.JSON(http.StatusOK, res)
}

func getPixels(c echo.Context) error {
	xParam, _ := strconv.Atoi(c.QueryParam("x"))
	x := uint32(xParam)
	yParam, _ := strconv.Atoi(c.QueryParam("y"))
	y := uint32(yParam)
	widthParam, _ := strconv.Atoi(c.QueryParam("width"))
	width := uint32(widthParam)
	heightParam, _ := strconv.Atoi(c.QueryParam("height"))
	height := uint32(heightParam)

	pixels := make([][]PixelResponse, width)
	zeroAddress, _ := types.EncodeAddress(make([]byte, 32))

	mintFee, err := FindMintFee()
	if err != nil {
		log.Println(err)
		return err
	}

	for i := 0; i < int(width); i++ {
		pixels[i] = make([]PixelResponse, height)
		for j := 0; j < int(height); j++ {
			pixels[i][j] = PixelResponse{zeroAddress, [3]byte{255, 255, 255}, 0, 0, mintFee, 0}
		}
	}

	foundPixels, err := FindPixels(x, y, width, height)
	if err != nil {
		log.Println(err)
		return err
	}

	for _, pixel := range foundPixels {
		i := pixel.X - x
		j := pixel.Y - y
		pixels[i][j] = PixelResponse{
			Owner:       pixel.Owner,
			Color:       pixel.Color,
			TermBeginAt: pixel.TermBeginAt,
			TermDays:    pixel.TermDays,
			Price:       pixel.Price,
			Deposit:     pixel.Deposit,
		}
	}

	return c.JSON(http.StatusOK, pixels)
}

func main() {
	ctx, _ := context.WithTimeout(context.Background(), 10*time.Second)
	defer DB.Disconnect(ctx)

	go WatchTransactions()

	e := echo.New()
	e.GET("/pixel", getPixel)
	e.GET("/pixels", getPixels)

	e.Logger.Fatal(e.Start(":5000"))
}
