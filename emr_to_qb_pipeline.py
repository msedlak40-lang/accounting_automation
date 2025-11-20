import pandas as pd
import numpy as np
from datetime import timedelta

# -------------------------------------------------------------
# 1. LOAD INPUT FILES
# -------------------------------------------------------------

def load_inputs(
    emr_file,
    mapping_file,
    gravity_file,
    crosswalk_file=None
):
    emr = pd.read_excel(emr_file)

    # Mapping workbook (service + payment mappings)
    service_map = pd.read_excel(mapping_file, sheet_name="emr_service_items")
    payment_map = pd.read_excel(mapping_file, sheet_name="emr_payment_types")

    # CID crosswalk (optional)
    if crosswalk_file:
        cid = pd.read_excel(crosswalk_file)
    else:
        cid = None

    # Gravity payments
    gravity = pd.read_csv(gravity_file)

    return emr, service_map, payment_map, gravity, cid


# -------------------------------------------------------------
# 2. MERGE EMR SERVICES → QB ITEMS
# -------------------------------------------------------------

def map_services(emr, service_map):
    merged = emr.merge(
        service_map,
        how="left",
        left_on="service_product",
        right_on="emr_service_text"
    )

    # Flag unmapped service items
    unmapped = merged[merged["matched_item"].isna()].copy()

    return merged, unmapped


# -------------------------------------------------------------
# 3. MERGE EMR PAYMENT TYPES → ACCOUNTS
# -------------------------------------------------------------

def map_payments(emr, payment_map):
    pay = emr.merge(
        payment_map,
        how="left",
        left_on="payment_type",
        right_on="emr_payment_type"
    )

    unmapped = pay[pay["target_account"].isna()].copy()
    return pay, unmapped


# -------------------------------------------------------------
# 4. APPLY CUSTOMER ID (CID CROSSWALK)
# -------------------------------------------------------------

def apply_cid(emr, cid):
    if cid is None:
        # If no CID table exists, create simple placeholder
        emr["Customer"] = emr["customer_name"]
        return emr
    
    merged = emr.merge(
        cid,
        how="left",
        left_on="customer_name",
        right_on="CustomerName_EMR"
    )

    # If missing CID, fall back to name (or handle separately)
    merged["Customer"] = merged["CID"].fillna(merged["customer_name"])

    return merged


# -------------------------------------------------------------
# 5. CONSTRUCT INVOICE FILE FOR TRANSACTION PRO
# -------------------------------------------------------------

def build_invoice_import(mapped_services):
    # EXPLODE multiple service lines per invoice
    df = mapped_services.copy()

    invoice = pd.DataFrame({
        "Customer": df["Customer"],
        "TxnDate": df["date"],
        "RefNumber": df["invoice_number"],
        "Item": df["matched_item"],
        "Description": df["service_product"],
        "Quantity": df["qty"],
        "Rate": df["price"],
        "Amount": df["total_amount"],
        "TaxCode": df["TaxCode"],
        "Memo": df["notes"]
    })

    return invoice


# -------------------------------------------------------------
# 6. MATCH GRAVITY PAYMENTS → INVOICES
# -------------------------------------------------------------

def match_gravity(emr, gravity):
    matches = []

    for _, row in emr.iterrows():
        inv_num = row["invoice_number"]
        amt = row["payment_amount"]
        date = row["date"]

        # ±3 day window
        window = gravity[
            (gravity["Amount"] == amt) &
            (gravity["Date"] >= date - timedelta(days=3)) &
            (gravity["Date"] <= date + timedelta(days=3))
        ]

        if len(window) == 1:
            g = window.iloc[0]
            matches.append({
                "invoice_number": inv_num,
                "payment_amount": amt,
                "Customer": row["Customer"],
                "TxnDate": g["Date"],
                "RefNumber": g["TransactionID"],
                "PaymentMethod": g["CardType"],
                "DepositToAccount": "1030 · Merchant Clearing"
            })

    match_df = pd.DataFrame(matches)
    return match_df


# -------------------------------------------------------------
# 7. BUILD RECEIVE PAYMENTS FILE
# -------------------------------------------------------------

def build_receive_payments(match_df):
    receive = pd.DataFrame({
        "Customer": match_df["Customer"],
        "TxnDate": match_df["TxnDate"],
        "RefNumber": match_df["RefNumber"],
        "Amount": match_df["payment_amount"],
        "PaymentMethod": match_df["PaymentMethod"],
        "DepositToAccount": match_df["DepositToAccount"],
        "ApplyToRefNumber": match_df["invoice_number"]
    })

    return receive


# -------------------------------------------------------------
# 8. BUILD VENDOR RECEIVABLE JEs (IF NEEDED)
# -------------------------------------------------------------

def build_vendor_receivable_journal(emr, payment_map):
    vendor_rows = emr[emr["payment_type"].isin(["Alle Rewards", "Aspire Awards", "Cherry"])]

    entries = []

    for _, row in vendor_rows.iterrows():
        pt = row["payment_type"]
        invoice = row["invoice_number"]
        amt = row["payment_amount"]
        cust = row["Customer"]

        # Look up vendor receivable account
        acct = payment_map[payment_map["emr_payment_type"] == pt]["target_account"].iloc[0]

        entries.append({
            "TxnDate": row["date"],
            "RefNumber": f"VR-{invoice}-{pt}",
            "Account": acct,
            "Debit": amt,
            "Credit": "",
            "Name": "",
            "Memo": f"Vendor receivable from {pt} for invoice {invoice}"
        })

        entries.append({
            "TxnDate": row["date"],
            "RefNumber": f"VR-{invoice}-{pt}",
            "Account": "Accounts Receivable",
            "Debit": "",
            "Credit": amt,
            "Name": cust,
            "Memo": f"Vendor receivable from {pt} for invoice {invoice}"
        })

    return pd.DataFrame(entries)
