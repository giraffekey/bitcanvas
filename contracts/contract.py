from pyteal import *
from beaker import *
from beaker.lib.storage import Mapping, List


Position = abi.Tuple2[abi.Uint64, abi.Uint64]
Color = abi.Tuple3[abi.Uint8, abi.Uint8, abi.Uint8]


class Pixel(abi.NamedTuple):
	owner: abi.Field[abi.Address]
	color: abi.Field[Color]
	term_begin_at: abi.Field[abi.Uint64]
	term_days: abi.Field[abi.Uint32]
	price: abi.Field[abi.Uint64]
	deposit: abi.Field[abi.Uint64]


BoxFlatMinBalance = 2500
BoxByteMinBalance = 400
ColorTypeSpec = abi.TupleTypeSpec(abi.Uint8TypeSpec(), abi.Uint8TypeSpec(), abi.Uint8TypeSpec())


class Canvas(Application):
	pixels = Mapping(Position, Pixel, Bytes("p"))

	mint_fee = ApplicationStateValue(
		stack_type=TealType.uint64,
		default=Int(1_000_000),
		descr="Price for an unowned pixel",
	)

	tax_per_day = ApplicationStateValue(
		stack_type=TealType.uint64,
		default=Int(1750), # 0.175%
		descr="Percent daily tax based on self-assessed price",
	)

	total_pixels = ApplicationStateValue(
		stack_type=TealType.uint64,
		default=Int(0),
		descr="Total used pixel boxes",
	)

	max_pixels = ApplicationStateValue(
		stack_type=TealType.uint64,
		default=Int(0),
		descr="Total available pixel boxes",
	)

	PixelMinBalance = Int(BoxFlatMinBalance + abi.size_of(Pixel) * BoxByteMinBalance)

	@create
	def create(self):
		return self.initialize_application_state()

	@external(authorize=Authorize.only(Global.creator_address()))
	def update_mint_fee(self, mint_fee: abi.Uint64):
		return self.mint_fee.set(mint_fee.get())

	@external(authorize=Authorize.only(Global.creator_address()))
	def update_tax_per_day(self, tax_per_day: abi.Uint64):
		return self.mint_fee.set(tax_per_day.get())

	@external
	def allocate_pixels(self, pay: abi.PaymentTransaction, amount: abi.Uint64):
		return Seq(
			Assert(
				pay.get().receiver() == self.address,
				comment="payment must be to app address",
			),
			Assert(
				pay.get().amount() == self.PixelMinBalance * amount.get(),
				comment=f"payment must be {self.PixelMinBalance * amount.get()}",
			),
			self.max_pixels.set(self.max_pixels.get() + amount.get()),
		)

	@external
	def mint_pixel(
		self,
		pay: abi.PaymentTransaction,
		pos: Position,
		color: Color,
		term_days: abi.Uint32,
		price: abi.Uint64,
	):
		return Seq(
			Assert(
				pay.get().receiver() == self.address,
				comment="payment must be to app address",
			),
			Assert(
				Not(self.pixels[pos].exists()),
				comment="pixel must not exist",
			),
			(deposit := abi.Uint64()).set(self.calc_deposit(term_days, price)),
			If(self.total_pixels.get() < self.max_pixels.get())
			.Then(Assert(
				pay.get().amount() == self.mint_fee.get() + deposit.get(),
				comment=f"payment must be {self.mint_fee.get() + deposit.get()}",
			))
			.Else(Assert(
				pay.get().amount() == self.PixelMinBalance + self.mint_fee.get() + deposit.get(),
				comment=f"payment must be {self.PixelMinBalance + self.mint_fee.get() + deposit.get()}",
			)),
			(owner := abi.Address()).set(Txn.sender()),
			(term_begin_at := abi.Uint64()).set(Global.latest_timestamp()),
			(pixel := Pixel()).set(owner, color, term_begin_at, term_days, price, deposit),
			self.pixels[pos].set(pixel),
			self.total_pixels.set(self.total_pixels.get() + Int(1)),
			If(self.total_pixels.get() > self.max_pixels.get())
			.Then(self.max_pixels.set(self.max_pixels.get() + Int(1))),
		)

	@external
	def buy_pixel(
		self,
		pay: abi.PaymentTransaction,
		pos: Position,
		color: Color,
		term_days: abi.Uint32,
		price: abi.Uint64,
	):
		return Seq(
			Assert(
				pay.get().receiver() == self.address,
				comment="payment must be to app address",
			),
			Assert(self.pixels[pos].exists(), comment="pixel must exist"),
			self.pixels[pos].store_into(last_pixel := Pixel()),
			(deposit := abi.Uint64()).set(self.calc_deposit(term_days, price)),
			last_pixel.price.store_into(last_price := abi.Uint64()),
			Assert(
				pay.get().amount() == last_price.get() + deposit.get(),
				comment=f"payment must be {last_price.get() + deposit.get()}",
			),
			last_pixel.owner.store_into(last_owner := abi.Address()),
			last_pixel.deposit.store_into(last_deposit := abi.Uint64()),
			InnerTxnBuilder.Execute(
				{
					TxnField.type_enum: TxnType.Payment,
					TxnField.amount: last_deposit.get(),
					TxnField.receiver: last_owner.get(),
				}
			),
			(owner := abi.Address()).set(Txn.sender()),
			(term_begin_at := abi.Uint64()).set(Global.latest_timestamp()),
			(pixel := Pixel()).set(owner, color, term_begin_at, term_days, price, deposit),
			self.pixels[pos].set(pixel),
		)

	@external
	def update_pixel_color(self, pos: Position, color: Color):
		return Seq(
			Assert(self.pixels[pos].exists(), comment="pixel must exist"),
			self.pixels[pos].store_into(last_pixel := Pixel()),
			last_pixel.owner.store_into(owner := abi.Address()),
			Assert(Txn.sender() == owner.get(), comment="sender must be owner"),
			last_pixel.term_begin_at.store_into(term_begin_at := abi.Uint64()),
			last_pixel.term_days.store_into(term_days := abi.Uint32()),
			last_pixel.price.store_into(price := abi.Uint64()),
			last_pixel.deposit.store_into(deposit := abi.Uint64()),
			(pixel := Pixel()).set(owner, color, term_begin_at, term_days, price, deposit),
			self.pixels[pos].set(pixel),
		)

	@external
	def update_term_days(self, pay: abi.PaymentTransaction, pos: Position, term_days: abi.Uint32):
		return Seq(
			Assert(self.pixels[pos].exists(), comment="pixel must exist"),
			self.pixels[pos].store_into(last_pixel := Pixel()),
			last_pixel.owner.store_into(owner := abi.Address()),
			Assert(Txn.sender() == owner.get(), comment="sender must be owner"),
			last_pixel.price.store_into(price := abi.Uint64()),
			last_pixel.deposit.store_into(last_deposit := abi.Uint64()),
			(deposit := abi.Uint64()).set(self.calc_deposit(term_days, price)),
			self.update_deposit(pay, owner, deposit, last_deposit),
			last_pixel.color.store_into(color := Color(ColorTypeSpec)),
			last_pixel.term_begin_at.store_into(term_begin_at := abi.Uint64()),
			(pixel := Pixel()).set(owner, color, term_begin_at, term_days, price, deposit),
			self.pixels[pos].set(pixel),
		)

	@external
	def update_price(self, pay: abi.PaymentTransaction, pos: Position, price: abi.Uint64):
		return Seq(
			Assert(self.pixels[pos].exists(), comment="pixel must exist"),
			self.pixels[pos].store_into(last_pixel := Pixel()),
			last_pixel.owner.store_into(owner := abi.Address()),
			Assert(Txn.sender() == owner.get(), comment="sender must be owner"),
			last_pixel.term_days.store_into(term_days := abi.Uint32()),
			last_pixel.deposit.store_into(last_deposit := abi.Uint64()),
			(deposit := abi.Uint64()).set(self.calc_deposit(term_days, price)),
			self.update_deposit(pay, owner, deposit, last_deposit),
			last_pixel.color.store_into(color := Color(ColorTypeSpec)),
			last_pixel.term_begin_at.store_into(term_begin_at := abi.Uint64()),
			(pixel := Pixel()).set(owner, color, term_begin_at, term_days, price, deposit),
			self.pixels[pos].set(pixel),
		)

	@external
	def burn_pixel(self, pos: Position):
		return Seq(
			Assert(self.pixels[pos].exists(), comment="pixel must exist"),
			self.pixels[pos].store_into(pixel := Pixel()),
			pixel.owner.store_into(owner := abi.Address()),
			Assert(Txn.sender() == owner.get(), comment="sender must be owner"),
			pixel.deposit.store_into(deposit := abi.Uint64()),
			InnerTxnBuilder.Execute(
				{
					TxnField.type_enum: TxnType.Payment,
					TxnField.amount: deposit.get(),
					TxnField.receiver: owner.get(),
				}
			),
			Pop(self.pixels[pos].delete()),
			self.total_pixels.set(self.total_pixels.get() - Int(1)),
		)

	@internal(TealType.uint64)
	def calc_deposit(self, term_days: abi.Uint32, price: abi.Uint64):
		return term_days.get() * price.get() * self.tax_per_day.get() / Int(1_000_000)

	@internal(TealType.none)
	def update_deposit(self, pay: abi.PaymentTransaction, owner: abi.Address, deposit: abi.Uint64, last_deposit: abi.Uint64):
		return If(deposit.get() > last_deposit.get()).Then(
			Seq(
				Assert(
					pay.get().receiver() == self.address,
					comment="payment must be to app address",
				),
				Assert(
					pay.get().amount() == deposit.get() - last_deposit.get(),
					comment=f"payment must be {deposit.get() - last_deposit.get()}",
				),
			)
		).ElseIf(deposit.get() < last_deposit.get()).Then(
			InnerTxnBuilder.Execute(
				{
					TxnField.type_enum: TxnType.Payment,
					TxnField.amount: last_deposit.get() - deposit.get(),
					TxnField.receiver: owner.get(),
				}
			)
		)


if __name__ == "__main__":
	se = Canvas()
	print(se.approval_program)
