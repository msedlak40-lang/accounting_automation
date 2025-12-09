"""File loading utilities for EMR and Gravity data."""

import pandas as pd
from pathlib import Path
from typing import Tuple


def load_emr_transactions(file_path: str | Path) -> pd.DataFrame:
    """
    Load EMR transactions from Excel file.

    Expected columns:
    - Date
    - Invoice #
    - CID
    - Name
    - Service/Product
    - Total Due
    - Payment Type
    - Amount
    """
    df = pd.read_excel(file_path)

    # Ensure Date column is datetime
    df['Date'] = pd.to_datetime(df['Date'])

    # Clean up column names
    df.columns = df.columns.str.strip()

    return df


def load_gravity_payments(file_path: str | Path) -> pd.DataFrame:
    """
    Load Gravity payments from CSV file.

    Expected columns:
    - Date/Time
    - Approval (transaction ID)
    - Total (payment amount)
    - Card Type
    """
    df = pd.read_csv(file_path)

    # Parse datetime
    df['Date'] = pd.to_datetime(df['Date/Time'])

    # Rename for clarity
    df = df.rename(columns={
        'Approval': 'TransactionID',
        'Total': 'Amount',
        'Card Type': 'CardType'
    })

    return df[['Date', 'TransactionID', 'Amount', 'CardType']]


def save_receive_payments(matches_df: pd.DataFrame, output_path: str | Path) -> None:
    """
    Save Receive Payments CSV for Transaction Pro import.

    Format:
    - Customer (CID)
    - TxnDate (Gravity payment date)
    - RefNumber (Gravity transaction ID)
    - Amount (payment amount)
    - PaymentMethod (card type)
    - DepositToAccount (always "1030 · Merchant Clearing")
    - ApplyToRefNumber (invoice number)
    """
    output = pd.DataFrame({
        'Customer': matches_df['CID'],
        'TxnDate': matches_df['Gravity_Date'].dt.strftime('%Y-%m-%d'),
        'RefNumber': matches_df['TransactionID'],
        'Amount': matches_df['Amount'],
        'PaymentMethod': matches_df['CardType'],
        'DepositToAccount': '1030 · Merchant Clearing',
        'ApplyToRefNumber': matches_df['Invoice #']
    })

    output.to_csv(output_path, index=False)
    print(f"✓ Saved {len(output)} matched payments to {output_path}")


def save_unmatched_gravity(unmatched_df: pd.DataFrame, output_path: str | Path) -> None:
    """Save unmatched Gravity payments for review."""
    if len(unmatched_df) == 0:
        print("✓ All Gravity payments matched!")
        return

    output = unmatched_df[['Date', 'TransactionID', 'Amount', 'CardType']].copy()
    output['Date'] = output['Date'].dt.strftime('%Y-%m-%d')
    output.to_csv(output_path, index=False)
    print(f"⚠️  {len(output)} unmatched Gravity payments saved to {output_path}")
