from pyteal import *
from beaker import *
from beaker.lib.storage import Mapping


Position = abi.Tuple2[abi.Uint32, abi.Uint32]
Color = abi.Tuple3[abi.Uint8, abi.Uint8, abi.Uint8]
PositionTypeSpec = abi.TupleTypeSpec(abi.Uint32TypeSpec(), abi.Uint32TypeSpec())
ColorTypeSpec = abi.TupleTypeSpec(abi.Uint8TypeSpec(), abi.Uint8TypeSpec(), abi.Uint8TypeSpec())


class Pixel(abi.NamedTuple):
	owner: abi.Field[abi.Address]
	color: abi.Field[Color]
	term_begin_at: abi.Field[abi.Uint64]
	term_days: abi.Field[abi.Uint32]
	price: abi.Field[abi.Uint64]
	deposit: abi.Field[abi.Uint64]


BoxFlatMinBalance = 2500
BoxByteMinBalance = 400


class Canvas(Application):
	pixels = Mapping(Position, Pixel, Bytes("p"))

	mint_fee = ApplicationStateValue(
		stack_type=TealType.uint64,
		default=Int(1_000_000),
		descr="Price for an unowned pixel",
	)

	tax_per_day = ApplicationStateValue(
		stack_type=TealType.uint64,
		default=Int(1_750), # 0.175%
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
	def get_mint_fee(self, *, output: abi.Uint64):
		return output.set(self.mint_fee)

	@external
	def get_tax_per_day(self, *, output: abi.Uint64):
		return output.set(self.tax_per_day)

	@external
	def get_total_pixels(self, *, output: abi.Uint64):
		return output.set(self.total_pixels)

	@external
	def get_max_pixels(self, *, output: abi.Uint64):
		return output.set(self.max_pixels)

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
	def get_pixel(
		self,
		pos: Position,
		*,
		output: Pixel,
	):
		return If(self.pixels[pos].exists()).Then(
			self.pixels[pos].store_into(output)
		).Else(
			Seq(
				(owner := abi.Address()).set(Global.zero_address()),
				(c := abi.Uint8()).set(Int(255)),
				(color := Color(ColorTypeSpec)).set(c, c, c),
				(term_begin_at := abi.Uint64()).set(Int(0)),
				(term_days := abi.Uint32()).set(Int(0)),
				(price := abi.Uint64()).set(self.mint_fee.get()),
				(deposit := abi.Uint64()).set(Int(0)),
				output.set(owner, color, term_begin_at, term_days, price, deposit),
			)
		)

	@external
	def get_pixels(
		self,
		pos: Position,
		width: abi.Uint32,
		height: abi.Uint32,
		*,
		output: abi.DynamicArray[Pixel],
	):
		return Seq(
			pos[0].store_into(start_x := abi.Uint32()),
			pos[1].store_into(start_y := abi.Uint32()),
			(pixelBytes := abi.DynamicBytes()).set(Bytes("")),
			For((i := abi.Uint32()).set(Int(0)), i.get() < width.get(), i.set(i.get() + Int(1))).Do(
				Seq(
					(x := abi.Uint32()).set(start_x.get() + i.get()),
					For((j := abi.Uint32()).set(Int(0)), j.get() < height.get(), j.set(j.get() + Int(1))).Do(
						(y := abi.Uint32()).set(start_y.get() + j.get()),
						(pos := Position(PositionTypeSpec)).set(x, y),
						If(self.pixels[pos].exists()).Then(
							self.pixels[pos].store_into(pixel := Pixel()),
							pixelBytes.set(Concat(pixelBytes.get(), pixel.encode())),
						).Else(
							Seq(
								(owner := abi.Address()).set(Global.zero_address()),
								(c := abi.Uint8()).set(Int(255)),
								(color := Color(ColorTypeSpec)).set(c, c, c),
								(term_begin_at := abi.Uint64()).set(Int(0)),
								(term_days := abi.Uint32()).set(Int(0)),
								(price := abi.Uint64()).set(self.mint_fee.get()),
								(deposit := abi.Uint64()).set(Int(0)),
								(pixel := Pixel()).set(owner, color, term_begin_at, term_days, price, deposit),
								pixelBytes.set(Concat(pixelBytes.get(), pixel.encode())),
							),
						),
					),
				),
			),
			output.decode(Concat(Extract(Itob(width.get() * height.get()), Int(6), Int(2)), pixelBytes.get())),
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
			last_pixel.term_begin_at.store_into(last_term_begin_at := abi.Uint64()),
			InnerTxnBuilder.Execute(
				{
					TxnField.type_enum: TxnType.Payment,
					TxnField.amount: last_deposit.get() - self.get_spent_deposit(last_term_begin_at, price),
					TxnField.receiver: last_owner.get(),
				}
			),
			(owner := abi.Address()).set(Txn.sender()),
			(term_begin_at := abi.Uint64()).set(Global.latest_timestamp()),
			(pixel := Pixel()).set(owner, color, term_begin_at, term_days, price, deposit),
			self.pixels[pos].set(pixel),
		)

	# @external
	# def update_pixel_color(self, pos: Position, color: Color):
	# 	return Seq(
	# 		Assert(self.pixels[pos].exists(), comment="pixel must exist"),
	# 		self.pixels[pos].store_into(last_pixel := Pixel()),
	# 		last_pixel.owner.store_into(owner := abi.Address()),
	# 		Assert(Txn.sender() == owner.get(), comment="sender must be owner"),
	# 		last_pixel.term_begin_at.store_into(term_begin_at := abi.Uint64()),
	# 		last_pixel.term_days.store_into(term_days := abi.Uint32()),
	# 		last_pixel.price.store_into(price := abi.Uint64()),
	# 		last_pixel.deposit.store_into(deposit := abi.Uint64()),
	# 		(pixel := Pixel()).set(owner, color, term_begin_at, term_days, price, deposit),
	# 		self.pixels[pos].set(pixel),
	# 	)

	# @external
	# def update_pixel_term_days(self, pay: abi.PaymentTransaction, pos: Position, term_days: abi.Uint32):
	# 	return Seq(
	# 		Assert(self.pixels[pos].exists(), comment="pixel must exist"),
	# 		self.pixels[pos].store_into(last_pixel := Pixel()),
	# 		last_pixel.owner.store_into(owner := abi.Address()),
	# 		Assert(Txn.sender() == owner.get(), comment="sender must be owner"),
	# 		last_pixel.term_begin_at.store_into(term_begin_at := abi.Uint64()),
	# 		last_pixel.price.store_into(price := abi.Uint64()),
	# 		last_pixel.deposit.store_into(last_deposit := abi.Uint64()),
	# 		(deposit := abi.Uint64()).set(self.calc_deposit(term_days, price)),
	# 		(spent_deposit := abi.Uint64()).set(self.get_spent_deposit(term_begin_at, price)),
	# 		self.update_deposit(pay, owner, deposit, last_deposit, spent_deposit),
	# 		last_pixel.color.store_into(color := Color(ColorTypeSpec)),
	# 		(pixel := Pixel()).set(owner, color, term_begin_at, term_days, price, deposit),
	# 		self.pixels[pos].set(pixel),
	# 	)

	# @external
	# def update_pixel_price(self, pay: abi.PaymentTransaction, pos: Position, price: abi.Uint64):
	# 	return Seq(
	# 		Assert(self.pixels[pos].exists(), comment="pixel must exist"),
	# 		self.pixels[pos].store_into(last_pixel := Pixel()),
	# 		last_pixel.owner.store_into(owner := abi.Address()),
	# 		Assert(Txn.sender() == owner.get(), comment="sender must be owner"),
	# 		last_pixel.term_begin_at.store_into(term_begin_at := abi.Uint64()),
	# 		last_pixel.term_days.store_into(term_days := abi.Uint32()),
	# 		last_pixel.deposit.store_into(last_deposit := abi.Uint64()),
	# 		(deposit := abi.Uint64()).set(self.calc_deposit(term_days, price)),
	# 		(spent_deposit := abi.Uint64()).set(self.get_spent_deposit(term_begin_at, price)),
	# 		self.update_deposit(pay, owner, deposit, last_deposit, spent_deposit),
	# 		last_pixel.color.store_into(color := Color(ColorTypeSpec)),
	# 		(pixel := Pixel()).set(owner, color, term_begin_at, term_days, price, deposit),
	# 		self.pixels[pos].set(pixel),
	# 	)

	@external
	def burn_pixel(self, pos: Position):
		return Seq(
			Assert(self.pixels[pos].exists(), comment="pixel must exist"),
			self.pixels[pos].store_into(pixel := Pixel()),
			pixel.owner.store_into(owner := abi.Address()),
			pixel.term_begin_at.store_into(term_begin_at := abi.Uint64()),
			pixel.term_days.store_into(term_days := abi.Uint32()),
			If(Not(self.is_expired(term_begin_at, term_days)))
			.Then(Assert(Txn.sender() == owner.get(), comment="sender must be owner")),
			pixel.price.store_into(price := abi.Uint64()),
			pixel.deposit.store_into(deposit := abi.Uint64()),
			InnerTxnBuilder.Execute(
				{
					TxnField.type_enum: TxnType.Payment,
					TxnField.amount: deposit.get() - self.get_spent_deposit(term_begin_at, price),
					TxnField.receiver: owner.get(),
				}
			),
			Pop(self.pixels[pos].delete()),
			self.total_pixels.set(self.total_pixels.get() - Int(1)),
		)

	@internal(TealType.uint64)
	def is_expired(self, term_begin_at: abi.Uint64, term_days: abi.Uint32):
		days = (Global.latest_timestamp() - term_begin_at.get()) / Int(84_600)
		return days >= term_days.get()

	@internal(TealType.uint64)
	def calc_deposit(self, term_days: abi.Uint32, price: abi.Uint64):
		return term_days.get() * price.get() * self.tax_per_day.get() / Int(1_000_000)

	@internal(TealType.uint64)
	def get_spent_deposit(self, term_begin_at: abi.Uint64, price: abi.Uint64):
		days = (Global.latest_timestamp() - term_begin_at.get()) / Int(84_600)
		return days * price.get() * self.tax_per_day.get() / Int(1_000_000)

	@internal(TealType.none)
	def update_deposit(self,
		pay: abi.PaymentTransaction,
		owner: abi.Address,
		deposit: abi.Uint64,
		last_deposit: abi.Uint64,
		spent_deposit: abi.Uint64,
	):
		return Seq(
			Assert(
				deposit.get() >= spent_deposit.get(),
				comment="total deposit must be >= spent deposit"
			),
			If(deposit.get() > last_deposit.get()).Then(
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
						TxnField.amount: last_deposit.get() - deposit.get() - spent_deposit.get(),
						TxnField.receiver: owner.get(),
					}
				)
			),
		)

if __name__ == "__main__":
	se = Canvas()
	print(se.approval_program)
