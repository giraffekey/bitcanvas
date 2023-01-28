import os
import base64
import json
from algosdk import account, mnemonic
from algosdk.future import transaction
from algosdk.v2client import algod

from .contract import Canvas


creator_mnemonic = os.environ["ALGO_CREATOR_MNEMONIC"]
algod_address = "http://node.testnet.algoexplorerapi.io"
algod_token = ""


def compile_program(client, source_code):
    compile_response = client.compile(source_code)
    return base64.b64decode(compile_response["result"])

def format_state(state):
    formatted = {}
    for item in state:
        key = item["key"]
        value = item["value"]
        formatted_key = base64.b64decode(key).decode("utf-8")
        if value["type"] == 1:
            if formatted_key == "voted":
                formatted_value = base64.b64decode(value["bytes"]).decode("utf-8")
            else:
                formatted_value = value["bytes"]
            formatted[formatted_key] = formatted_value
        else:
            formatted[formatted_key] = value["uint"]
    return formatted

def read_global_state(client, app_id):
    app = client.application_info(app_id)
    global_state = app["params"]["global-state"] if "global-state" in app["params"] else []
    return format_state(global_state)

def create_app(client, private_key, approval_program, clear_program, global_schema, local_schema):
    sender = account.address_from_private_key(private_key)
    on_complete = transaction.OnComplete.NoOpOC.real
    params = client.suggested_params()

    txn = transaction.ApplicationCreateTxn(
    	sender,
    	params,
    	on_complete,
    	approval_program,
    	clear_program,
    	global_schema,
    	local_schema,
    )

    signed_txn = txn.sign(private_key)
    tx_id = signed_txn.transaction.get_txid()
    client.send_transactions([signed_txn])

    try:
        transaction_response = transaction.wait_for_confirmation(client, tx_id, 4)
        print("TXID: ", tx_id)
        print("Result confirmed in round: {}".format(transaction_response["confirmed-round"]))
    except Exception as err:
        print(err)
        return

    transaction_response = client.pending_transaction_info(tx_id)
    app_id = transaction_response["application-index"]
    print("Created new app-id:", app_id)

    return app_id

if __name__ == "__main__":
    algod_client = algod.AlgodClient(algod_token, algod_address)

    creator_private_key = mnemonic.to_private_key(creator_mnemonic)

    local_ints = 0
    local_bytes = 0
    global_ints = 4
    global_bytes = 0
    global_schema = transaction.StateSchema(global_ints, global_bytes)
    local_schema = transaction.StateSchema(local_ints, local_bytes)

    se = Canvas()

    with open("./approval.teal", "w") as f:
        f.write(se.approval_program)

    with open("./clear.teal", "w") as f:
        f.write(se.clear_program)

    with open("./src/contract.json", "w") as f:
        f.write(json.dumps(se.contract.dictify()))

    approval_program_compiled = compile_program(algod_client, se.approval_program)
    clear_program_compiled = compile_program(algod_client, se.clear_program)

    app_id = create_app(algod_client, creator_private_key, approval_program_compiled, clear_program_compiled, global_schema, local_schema)
    print("Global state:", read_global_state(algod_client, app_id))
    print("Pixel min balance: ", Canvas.PixelMinBalance)
