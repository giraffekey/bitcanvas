package main

import (
	"context"
	"time"

	"go.mongodb.org/mongo-driver/bson"

	"github.com/algorand/go-algorand-sdk/v2/types"
)

type Global struct {
	Key   string `json:"key" validate:"required"`
	Value uint64 `json:"value" validate:"required"`
}

type Pixel struct {
	X           uint32  `json:"x" validate:"required"`
	Y           uint32  `json:"y" validate:"required"`
	Owner       string  `json:"owner" validate:"required"`
	Color       [3]byte `json:"color" validate:"required"`
	TermBeginAt uint64  `json:"termBeginAt" validate:"required"`
	TermDays    uint32  `json:"termDays" validate:"required"`
	Price       uint64  `json:"price" validate:"required"`
	Deposit     uint64  `json:"deposit" validate:"required"`
}

func insertGlobal(key string, value uint64) error {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	_, err := DB.Database("indexer").Collection("global").InsertOne(ctx, Global{key, value})
	return err
}

func findGlobal(key string) (uint64, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	var global Global
	err := DB.Database("indexer").Collection("global").FindOne(ctx, bson.M{"key": key}).Decode(&global)
	if err != nil {
		return 0, err
	}

	return global.Value, nil
}

func updateGlobal(key string, value uint64) error {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	_, err := DB.Database("indexer").Collection("global").UpdateOne(ctx, bson.M{"key": key}, bson.M{"$set": bson.M{"value": value}})
	return err
}

func InsertRound(round uint64) error {
	return insertGlobal("round", round)
}

func InsertMintFee(mintFee uint64) error {
	return insertGlobal("mintFee", mintFee)
}

func InsertTaxPerDay(taxPerDay uint64) error {
	return insertGlobal("taxPerDay", taxPerDay)
}

func InsertTotalPixels(totalPixels uint64) error {
	return insertGlobal("totalPixels", totalPixels)
}

func InsertMaxPixels(maxPixels uint64) error {
	return insertGlobal("maxPixels", maxPixels)
}

func FindRound() (uint64, error) {
	return findGlobal("round")
}

func FindMintFee() (uint64, error) {
	return findGlobal("mintFee")
}

func FindTaxPerDay() (uint64, error) {
	return findGlobal("taxPerDay")
}

func FindTotalPixels() (uint64, error) {
	return findGlobal("totalPixels")
}

func FindMaxPixels() (uint64, error) {
	return findGlobal("maxPixels")
}

func UpdateRound(round uint64) error {
	return updateGlobal("round", round)
}

func UpdateMintFee(mintFee uint64) error {
	return updateGlobal("mintFee", mintFee)
}

func UpdateTaxPerDay(taxPerDay uint64) error {
	return updateGlobal("taxPerDay", taxPerDay)
}

func UpdateTotalPixels(totalPixels uint64) error {
	return updateGlobal("totalPixels", totalPixels)
}

func UpdateMaxPixels(maxPixels uint64) error {
	return updateGlobal("maxPixels", maxPixels)
}

func InsertPixel(pixel Pixel) error {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	totalPixels, err := FindTotalPixels()
	if err != nil {
		return err
	}

	maxPixels, err := FindMaxPixels()
	if err != nil {
		return err
	}

	totalPixels += 1

	if err = UpdateTotalPixels(totalPixels); err != nil {
		return err
	}

	if totalPixels > maxPixels {
		if err = UpdateMaxPixels(totalPixels); err != nil {
			return err
		}
	}

	_, err = DB.Database("indexer").Collection("pixels").InsertOne(ctx, pixel)
	return err
}

func FindPixel(x uint32, y uint32) (Pixel, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	var pixel Pixel
	err := DB.Database("indexer").Collection("pixels").FindOne(ctx, bson.M{"x": x, "y": y}).Decode(&pixel)
	if err != nil {
		if err.Error() == "mongo: no documents in result" {
			zeroAddress, _ := types.EncodeAddress(make([]byte, 32))

			mintFee, err := FindMintFee()
			if err != nil {
				return Pixel{}, err
			}

			return Pixel{x, y, zeroAddress, [3]byte{255, 255, 255}, 0, 0, mintFee, 0}, nil
		} else {
			return Pixel{}, err
		}
	}

	return pixel, nil
}

func FindPixels(x uint32, y uint32, width uint32, height uint32) ([]Pixel, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	filter := bson.M{"$and": bson.A{
		bson.M{"x": bson.M{"$gte": x}},
		bson.M{"x": bson.M{"$lt": x + width}},
		bson.M{"y": bson.M{"$gte": y}},
		bson.M{"y": bson.M{"$lt": y + height}},
	}}
	cursor, err := DB.Database("indexer").Collection("pixels").Find(ctx, filter)
	if err != nil {
		return nil, err
	}

	var pixels []Pixel
	if err = cursor.All(ctx, &pixels); err != nil {
		return nil, err
	}

	return pixels, nil
}

func UpdatePixel(pixel Pixel) error {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	filter := bson.M{"x": pixel.X, "y": pixel.Y}
	update := bson.M{"$set": bson.M{
		"owner": pixel.Owner,
		"color": pixel.Color,
		"termBeginAt": pixel.TermBeginAt,
		"termDays": pixel.TermDays,
		"price": pixel.Price,
		"deposit": pixel.Deposit,
	}}
	_, err := DB.Database("indexer").Collection("pixels").UpdateOne(ctx, filter, update)
	return err
}

func UpdatePixelColor(x uint32, y uint32, color [3]byte) error {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	filter := bson.M{"x": x, "y": y}
	update := bson.M{"$set": bson.M{"color": color}}
	_, err := DB.Database("indexer").Collection("pixels").UpdateOne(ctx, filter, update)
	return err
}

func UpdatePixelTermDays(x uint32, y uint32, termDays uint32) error {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	pixel, _ := FindPixel(x, y)
	deposit := CalcDeposit(termDays, pixel.Price)

	filter := bson.M{"x": x, "y": y}
	update := bson.M{"$set": bson.M{"termDays": termDays, "deposit": deposit}}
	_, err := DB.Database("indexer").Collection("pixels").UpdateOne(ctx, filter, update)
	return err
}

func UpdatePixelPrice(x uint32, y uint32, price uint64) error {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	pixel, _ := FindPixel(x, y)
	deposit := CalcDeposit(pixel.TermDays, price)

	filter := bson.M{"x": x, "y": y}
	update := bson.M{"$set": bson.M{"price": price, "deposit": deposit}}
	_, err := DB.Database("indexer").Collection("pixels").UpdateOne(ctx, filter, update)
	return err
}

func DeletePixel(x uint32, y uint32) error {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	totalPixels, _ := FindTotalPixels()
	_ = UpdateTotalPixels(totalPixels - 1)

	_, err := DB.Database("indexer").Collection("pixels").DeleteOne(ctx, bson.M{"x": x, "y": y})
	return err
}

func Clear() error {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	_, err := DB.Database("indexer").Collection("global").DeleteMany(ctx, bson.M{})
	if err != nil {
		return err
	}

	_, err = DB.Database("indexer").Collection("pixels").DeleteMany(ctx, bson.M{})
	return err
}
