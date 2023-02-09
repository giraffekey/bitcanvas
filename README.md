# bitcanvas

A decentralized collaborative pixel canvas with Harberger taxation.

Built for the [Algorand Greenhouse Hack 3](https://gitcoin.co/hackathon/greenhouse3).

## Setup

`cd indexer && go run *.go`

`yarn && yarn dev`

## How does Bitcanvas work?

Bitcanvas stores all pixel data in a smart contract deployed on the Algorand blockchain. Box storage makes it possible to store the entire pixel canvas in a 4,294,967,296 by 4,294,967,296 grid.

Pixel data consists of the owner, color, term, price and deposit. When purchasing a pixel, the owner can set its color, term days and price. Term days determine when the ownership will expire and price determines what someone else must pay to obtain ownership themselves. The deposit is equal to 0.175% of the price per term day (this is Harberger taxation). A 0.01 ALGO fee is required to mint a pixel.

When a pixel is bought or burned, the current owner's unpaid deposit will be returned to them. For example, if someone mints a pixel with a term of 14 days and price of 10 ALGO, and someone else buys it 4 days later, 0.175 ALGO (10 days worth of deposit) will be returned to the minter and 0.07 ALGO will be kept by the contract.

When a pixel's deposit runs out it may be burned by anyone.

Fees and deposits are paid in shares to other pixel owners according to how many pixels they own. This functions as a sort of community commonwealth and allows pixel owners to get paid for the art they create.

Users can use the front-end (built with PixiJS and the Algorand SDK) to browse the canvas, connect their wallet and interact with the contract.

The project also includes an indexer which allows for transactionless reading of the box storage data and updates the pixel map in real time through a Websockets connection.

## What is Harberger taxation?

Based on the ideas of economists [Henry George](https://en.wikipedia.org/wiki/Henry_George), [Arnold Harberger](https://en.wikipedia.org/wiki/Arnold_Harberger) and [Glen Weyl](https://glenweyl.com/), Harberger taxation is designed to reduce monopoly rents and inefficient speculative behavior. Although originally devised for more equitable and efficient real-world economies, the concept also has utility within the blockchain space and is perhaps better suited for it.

Harberger assets always have an open sell order at a self-assessed price. The asset is in constant auction and a sale can be forced at any moment. Owners set the price of their asset and pay a daily, weekly or monthly tax based on it. High self-assessed values have a low likelihood of a forced sale, but a high periodic tax. Low self-assessed values have a low periodic tax, but a high likelihood of a forced sale. This encourages owners to price their assets accurately as they want them to be low enough for the tax to be affordable, but high enough to be profitable or maintain ownership and avoid a forced sale.

Bitcanvas uses a 0.175% daily Harberger tax to efficiently distribute pixel ownership. Since pixel owners must continually renew their terms in order to maintain ownership, and will lose their pixels in a forced sale if they set the price too low, ownership will gravitate to those who make the most use of their pixels. This also prevents monopolization as ownership is not permanent.

### Further readings

[What is Harberger Tax & Where Does The Blockchain Fit In? - Simon de la Rouviere](https://medium.com/@simondlr/what-is-harberger-tax-where-does-the-blockchain-fit-in-1329046922c6)

[On Radical Markets - Vitalik Buterin](https://vitalik.ca/general/2018/04/20/radical_markets.html)

[Partial Common Ownership - RadicalxChange](https://www.radicalxchange.org/concepts/partial-common-ownership/)

## TODO

- Improve the general looks of the application
- Distribute fees and taxes as shares according to pixel ownership in the contract
- UI/UX for claiming shares in the front-end
- Paint tools in the front-end
- Batch mint/buy/update transactions in the front-end
- Implement moderation via quadratic voting based on pixel ownership
- Mobile support
