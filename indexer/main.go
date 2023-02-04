package main

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"strconv"
	"time"

	"github.com/google/uuid"

	"github.com/gorilla/websocket"
	"github.com/labstack/echo/v4"
	"github.com/labstack/echo/v4/middleware"

	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"

	amqp "github.com/rabbitmq/amqp091-go"

	"github.com/algorand/go-algorand-sdk/v2/types"
)

var (	
	ZeroAddress, _ = types.EncodeAddress(make([]byte, 32))
	upgrader = websocket.Upgrader{
		CheckOrigin: func(r *http.Request) bool { return true },
	}
	DB = connectDB("mongodb://localhost:27017")
	MQ = connectMQ("amqp://localhost:5672")
)

func connectDB(url string) *mongo.Client {
	client, err := mongo.NewClient(options.Client().ApplyURI(url))
	if err != nil {
		log.Fatal(err)
		return nil
	}

	ctx, _ := context.WithTimeout(context.Background(), 10*time.Second)
	err = client.Connect(ctx)
	if err != nil {
		log.Fatal(err)
		return nil
	}

	return client
}

func connectMQ(url string) struct {*amqp.Connection; *amqp.Channel} {
	conn, err := amqp.Dial(url)
	if err != nil {
		log.Fatal(err)
		return struct {*amqp.Connection; *amqp.Channel} {}
	}

	ch, err := conn.Channel()
	if err != nil {
		log.Fatal(err)
		return struct {*amqp.Connection; *amqp.Channel} {}
	}

	if err := ch.ExchangeDeclare("updates", "fanout", false, true, false, false, nil); err != nil {
		log.Fatal(err)
		return struct {*amqp.Connection; *amqp.Channel} {}
	}

	return struct {*amqp.Connection; *amqp.Channel} {conn, ch}
}

type UpdateData struct {
	Owner       string  `json:"owner,omitempty"`
	Color       [3]byte `json:"color,omitempty"`
	TermBeginAt uint64  `json:"termBeginAt,omitempty"`
	TermDays    uint32  `json:"termDays,omitempty"`
	Price       uint64  `json:"price,omitempty"`
}

type Update struct {
	X    uint32     `json:"x" validate:"required"`
	Y    uint32     `json:"y" validate:"required"`
	Data UpdateData `json:"data" validate:"required"`
}

func SendUpdate(update Update) error {
	ctx, _ := context.WithTimeout(context.Background(), 10*time.Second)

	body, err := json.Marshal(update)
	if err != nil {
		return err
	}

	msg := amqp.Publishing{
		Body: body,
	}
	return MQ.Channel.PublishWithContext(ctx, "updates", "indexer", false, false, msg)
}

func socket(c echo.Context) error {
	ws, err := upgrader.Upgrade(c.Response(), c.Request(), nil)
	if err != nil {
		return err
	}
	defer ws.Close()

	id := uuid.New().String()

	if _, err := MQ.Channel.QueueDeclare(id, false, true, true, false, nil); err != nil {
		return err
	}

	if err := MQ.Channel.QueueBind(id, "indexer", "updates", false, nil); err != nil {
		return err
	}

	msgs, err := MQ.Channel.Consume(id, "", false, true, false, false, nil)
	if err != nil {
		return err
	}

	for msg := range msgs {
		err := ws.WriteMessage(websocket.BinaryMessage, msg.Body)
		if err != nil {
			return err
		}

		MQ.Channel.Ack(msg.DeliveryTag, false)
	}

	return nil
}

type PixelResponse struct {
	Owner       string  `json:"owner"       validate:"required"`
	Color       [3]byte `json:"color"       validate:"required"`
	TermBeginAt uint64  `json:"termBeginAt" validate:"required"`
	TermDays    uint32  `json:"termDays"    validate:"required"`
	Price       uint64  `json:"price"       validate:"required"`
	Deposit     uint64  `json:"deposit"     validate:"required"`
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

	mintFee, err := FindMintFee()
	if err != nil {
		log.Println(err)
		return err
	}

	for i := 0; i < int(width); i++ {
		pixels[i] = make([]PixelResponse, height)
		for j := 0; j < int(height); j++ {
			pixels[i][j] = PixelResponse{ZeroAddress, [3]byte{255, 255, 255}, 0, 0, mintFee, 0}
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
	defer DB.Disconnect(context.Background())
	defer MQ.Connection.Close()

	go WatchTransactions()

	e := echo.New()
	e.Use(middleware.Logger())
	e.Use(middleware.Recover())

	e.GET("/ws", socket)
	e.GET("/pixel", getPixel)
	e.GET("/pixels", getPixels)

	e.Logger.Fatal(e.Start(":5000"))
}
